"use strict";
const fs = require("node:fs"),
  crypto = require("node:crypto"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  cat = require("../src/hardcore/bosses/catalogV2"),
  policy = require("./hardcore-boss-policy-v2");
const { buildState, session } = require("./hardcore-boss-build-fixture");
const sourceFiles = [
  "src/hardcore/bosses/balanceV2.js",
  "src/hardcore/bosses/catalogV2.js",
  "src/hardcore/bosses/runtimeV2.js",
  "src/hardcore/bosses/mechanicsV2.js",
  "src/hardcore/bosses/decisionsV2.js",
  "src/hardcore/engine/world.js",
  "src/hardcore/engine/combat.js",
  "src/hardcore/engine/actions.js",
  "src/hardcore/shared/statsV3.js",
];
const sourceFingerprint = require("node:crypto").createHash("sha256");
for (const source of sourceFiles)
  sourceFingerprint.update(
    source + fs.readFileSync(source, "utf8").replace(/\r\n/g, "\n"),
  );
const codeFingerprint = sourceFingerprint.digest("hex");
const trials = Math.max(1, Math.min(1000, Number(process.argv[2]) || 10)),
  seed = process.env.HARDCORE_SIM_SEED || "boss-roster-v2-v3-2026-10-12";
const result = {
  seed,
  codeFingerprint,
  bossDamageFactors: require("../src/hardcore/bosses/balanceV2").FACTORS,
  trials,
  maxTurns: 300,
  gearProfile: process.env.HARDCORE_SIM_BOSS_GEAR || "progression",
  assumptions:
    "Boss-only synthetic V3 states; full HP/MP/potions, four checkpoint builds, uniformly accumulated Rifts, no LR. Progression gear: 2+floor/40 R (cap10), 2+floor/70 SR (cap13), 3+floor/120 SSR (cap12), from350 floor/200 clean UR (cap4). Levels R/SR 1+floor/50, SSR 1+floor/100, UR 1+floor/200, rounded down. Thin gear instead uses five SSR at 1+floor/200. Equipped builds test viability, not typical loot or 999-floor completion. Policy reads public clues.",
  cells: [],
  fixed: [],
};
function random(key) {
  let n =
    crypto
      .createHash("sha256")
      .update(seed + key)
      .digest()
      .readUInt32BE() || 1;
  return () => {
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    return (n >>> 0) / 2 ** 32;
  };
}
function cell(key, build, def, floor) {
  let wins = 0,
    deaths = 0,
    timeouts = 0,
    totalTurns = 0;
  for (let n = 0; n < trials; n++) {
    const rng = random([key, build, def.id, floor, n].join(":")),
      s = buildState(floor, key, build, rng, def),
      enemy = s.encounter;
    let turn = 0;
    try {
      while (s.encounter === enemy && s.hp > 0 && turn < 300) {
        const action = policy.choose(s);
        if (!action) throw Error("NO_POLICY");
        core.act(s, session, action, rng);
        turn++;
      }
    } catch (err) {
      throw Error([key, build, def.id, floor, n, turn, err.stack].join(" "));
    }
    if (s.hp <= 0) deaths++;
    else if (s.encounter !== enemy || s.finalBossDefeated) wins++;
    else timeouts++;
    totalTurns += turn;
  }
  return {
    class: key,
    build,
    boss: def.id,
    floor,
    wins,
    deaths,
    timeouts,
    winPercent: (100 * wins) / trials,
    meanTurns: +(totalTurns / trials).toFixed(2),
  };
}
for (const key of Object.keys(stats.CLASSES)) {
  for (const build of ["power", "energy", "guard", "evasion"]) {
    for (const floor of [50, 300, 350, 650, 700, 950])
      for (const def of cat.POOL)
        result.cells.push(cell(key, build, def, floor));
    for (const def of cat.FIXED)
      result.fixed.push(cell(key, build, def, def.floor));
  }
  console.error("Roster 2 matrix: " + key + " complete");
}
result.noWinningBuild = [];
for (const key of Object.keys(stats.CLASSES))
  for (const floor of [50, 300, 350, 650, 700, 950])
    for (const def of cat.POOL) {
      const cells = result.cells.filter(
        (c) => c.class === key && c.floor === floor && c.boss === def.id,
      );
      if (!cells.some((c) => c.wins > 0))
        result.noWinningBuild.push({ class: key, boss: def.id, floor });
    }
result.summary = Object.fromEntries(
  Object.keys(stats.CLASSES).map((key) => {
    const cells = result.cells.filter((c) => c.class === key),
      n = cells.length * trials;
    return [
      key,
      {
        fights: n,
        wins: cells.reduce((t, c) => t + c.wins, 0),
        timeouts: cells.reduce((t, c) => t + c.timeouts, 0),
      },
    ];
  }),
);
if (process.env.HARDCORE_SIM_OUTPUT)
  fs.writeFileSync(
    process.env.HARDCORE_SIM_OUTPUT,
    JSON.stringify(result, null, 2) + "\n",
  );
console.log(
  JSON.stringify(
    {
      summary: result.summary,
      noWinningBuildCount: result.noWinningBuild.length,
    },
    null,
    2,
  ),
);
db.close();
