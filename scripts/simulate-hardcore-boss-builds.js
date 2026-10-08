"use strict";
const fs = require("node:fs"),
  crypto = require("node:crypto");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats");
const boss = require("../src/hardcore/bosses/mechanics"),
  policy = require("./hardcore-boss-policy");
const trials = Math.max(10, Math.min(1000, Number(process.argv[2]) || 50));
const seed = process.env.HARDCORE_SIM_SEED || "boss-builds-2026-10-08";
const session = {
  id: "matrix",
  guild_id: "matrix",
  user_id: "u",
  channel_id: "c",
};
const builds = ["power", "energy", "guard", "evasion"];
const result = {
  seed,
  trials,
  maxTurns: 300,
  assumptions:
    "Synthetic boss-only encounters, full HP/MP, 5 potions, checkpoint points by floor; five clean SSR items at level 1 + floor/200, no LR/loadout diamonds; uniform accumulated Rift stacks. These are not full-run completion rates.",
  cells: [],
};
function random(key) {
  let n = 0;
  return () =>
    crypto
      .createHash("sha256")
      .update(seed + ":" + key + ":" + n++)
      .digest()
      .readUInt32BE() /
    2 ** 32;
}
function buildState(floor, key, build, rng) {
  const s = stats.createState(key, 10000);
  s.bossRosterVersion = 1;
  s.floor = floor;
  s.cleared = floor - 1;
  const main = stats.mainStat(s),
    points = Math.floor((floor - 1) / 5) * 5;
  const weights =
    build === "power"
      ? [
          [main, 0.7],
          ["vit", 0.3],
        ]
      : build === "energy"
        ? [
            ["ene", 0.7],
            ["vit", 0.3],
          ]
        : build === "guard"
          ? [
              ["vit", 0.5],
              [main, 0.25],
              ["ene", 0.25],
            ]
          : [
              ["dex", 0.5],
              ["vit", 0.25],
              [main, 0.25],
            ];
  const bonus = {};
  for (const [attr, weight] of weights)
    bonus[attr] = (bonus[attr] || 0) + Math.floor(points * weight);
  stats.addSource(s, bonus, "checkpoint");
  const priority =
    build === "power"
      ? { [main]: 1, bossDamage: 100, physical: 1 }
      : build === "energy"
        ? { ene: 1, spell: 1, maxMana: 10 }
        : build === "guard"
          ? { vit: 1, maxHp: 0.3, defense: 1, resistance: 3 }
          : { dex: 1, evasion: 2, accuracy: 0.2 };
  const score = (d) =>
    Object.entries(d.effects).reduce(
      (sum, [attr, value]) => sum + (priority[attr] || 0) * value,
      0,
    );
  const gear = [...core.ITEMS.legendary]
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5);
  for (const item of gear)
    core.receiveItem(s, item, 1 + Math.floor(floor / 200), 0);
  const mods = Object.keys(
    require("../src/hardcore/engine/world").RIFT_MODIFIERS,
  );
  for (let i = 1; i < floor / 10; i++) {
    const id = mods[(i - 1) % mods.length];
    s.modifiers[id] = (s.modifiers[id] || 0) + 1;
  }
  stats.recompute(s);
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  s.potions = s.maxPotions;
  s.prophecy = {
    kind:
      build === "energy" ? "arcane" : build === "guard" ? "protection" : "war",
    floor: 333,
    awakened: false,
  };
  s.encounter = core.generateEncounter(s, session, rng);
  if (s.encounter.type === "boss_gate")
    core.act(s, session, "enter_kabraxis", rng);
  return s;
}
for (const key of Object.keys(stats.CLASSES)) {
  for (const build of builds)
    for (const def of boss.ROSTER) {
      let wins = 0,
        deaths = 0,
        timeouts = 0,
        totalTurns = 0;
      for (let n = 0; n < trials; n++) {
        const rng = random(key + ":" + build + ":" + def.id + ":" + n),
          s = buildState(def.floor, key, build, rng);
        const enemy = s.encounter;
        let turn = 0;
        while (s.encounter === enemy && s.hp > 0 && turn < result.maxTurns) {
          const action = policy.choose(s);
          core.act(s, session, action, rng);
          turn++;
        }
        if (s.hp <= 0) deaths++;
        else if (s.encounter !== enemy) wins++;
        else timeouts++;
        totalTurns += turn;
      }
      result.cells.push({
        class: key,
        build,
        floor: def.floor,
        boss: def.id,
        trials,
        wins,
        deaths,
        timeouts,
        winPercent: +((wins / trials) * 100).toFixed(2),
        meanTurns: +(totalTurns / trials).toFixed(2),
      });
    }
  console.error("Boss matrix: " + key + " complete");
}
if (process.env.HARDCORE_SIM_OUTPUT)
  fs.writeFileSync(
    process.env.HARDCORE_SIM_OUTPUT,
    JSON.stringify(result, null, 2) + "\n",
  );
else console.log(JSON.stringify(result, null, 2));
db.close();
