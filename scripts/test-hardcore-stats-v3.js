"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
delete process.env.HARDCORE_GAMEPLAY_VERSION;
const stats = require("../src/hardcore/engine/stats");
const rules = require("../src/hardcore/shared/statsV3");
const { RELEASE, isV2 } = require("../src/hardcore/shared/version");
const core = require("../src/services/hardcoreV2");
const world = require("../src/services/hardcoreWorld");
const view = require("../src/services/hardcoreV2View");
const service = require("../src/services/hardcoreService");
const repo = require("../src/services/hardcoreRepository");
const passives = require("../src/hardcore/itemPassives");
const baseline = require("./fixtures/hardcore-v2-stats-baseline.json");
const keys = Object.keys(stats.CLASSES),
  groups = [];
const flatItem = (id, effects, level = 1) => ({
  name: id,
  rarity: "common",
  level,
  cleansedLevels: 0,
  definition: { id, name: id, rarity: "common", effects, passive: null },
});
const clone = (x) => JSON.parse(JSON.stringify(x));
function bounds(payload) {
  let total = 0;
  for (const embed of payload.embeds || []) {
    const e = embed.toJSON();
    assert((e.fields || []).length <= 25);
    assert((e.description || "").length <= 4096);
    total +=
      (e.title || "").length +
      (e.description || "").length +
      (e.footer?.text || "").length;
    for (const f of e.fields || []) {
      assert(f.name.length <= 256);
      assert(f.value.length <= 1024);
      total += f.name.length + f.value.length;
    }
  }
  assert(total <= 6000, "Discord embed length: " + total);
}
try {
  assert.equal(RELEASE.version, "3.1.0");
  assert.equal(RELEASE.catalog, 2);
  for (const key of keys) {
    const s = stats.createState(key, 10000),
      old = stats.createState(key, 10000, { gameplayVersion: 2 });
    assert.equal(s.gameplayVersion, 3);
    assert(isV2(s));
    assert(isV2(old));
    assert.equal(s.statSystemVersion, 3);
    assert.equal(s.classMasteryVersion, 1);
    assert.equal(s.balanceVersion, "3.1.0");
    assert.equal(s.statProfile.powers.equipmentPower, 1);
    for (const field of [
      "str",
      "dex",
      "vit",
      "ene",
      "maxHp",
      "maxMana",
      "damageMin",
      "damageMax",
      "spellMin",
      "spellMax",
      "defense",
      "accuracy",
      "evasion",
      "critChance",
      "resistance",
    ])
      if (field === "maxHp" && ["amazon", "assassin"].includes(key))
        assert.equal(s.maxHp, key === "amazon" ? 110 : 118);
      else assert.equal(s[field], old[field], key + " initial " + field);
    const resumed = clone(s);
    resumed.encounter = { type: "empty", name: "Test" };
    core.normalize(resumed);
    assert.deepEqual(resumed.statProfile, s.statProfile);
    assert.deepEqual(stats.derive(resumed), stats.derive(s));
    const alternate = clone(s);
    alternate.statProfile.mastery.evasion *= 0.8;
    stats.addSource(alternate, { dex: 100 });
    const again = clone(alternate);
    core.normalize(again);
    assert.deepEqual(again.statProfile, alternate.statProfile);
    assert.equal(again.evasion, alternate.evasion);
  }
  for (const { input, expected } of baseline.cases) {
    assert.deepEqual(
      stats.derive(clone(input)),
      expected,
      input.classKey + " legacy " + input.releaseVersion,
    );
    const saved = {
      ...clone(input),
      ...expected,
      hp: 7,
      mana: 1,
      potions: 2,
      floor: 11,
      encounter: {
        type: "combat",
        name: "Saved",
        hp: 17,
        maxHp: 99,
        rank: "normal",
      },
    };
    const encounter = clone(saved.encounter);
    core.normalize(saved);
    assert.deepEqual(stats.derive(saved), expected);
    assert.deepEqual(saved.encounter, encounter);
    assert.equal(saved.hp, 7);
    assert.equal(saved.mana, 1);
    assert(!saved.statProfile);
  }
  groups.push(
    "28 golden V2 formulas, V3.1 Amazon/Assassin starting HP and snapshotted V3 resume",
  );
  for (const mutation of [
    (s) => delete s.statProfile,
    (s) => (s.statSystemVersion = 4),
    (s) => (s.classMasteryVersion = 2),
    (s) => (s.statProfile.classKey = "amazon"),
    (s) => (s.statProfile.powers.equipmentPower = 2),
    (s) => (s.statProfile.mastery.critCap = 2),
    (s) => (s.statProfile.core.strWeight = -1),
  ]) {
    const s = stats.createState("assassin", 10);
    mutation(s);
    assert.throws(() => stats.derive(s), /HARDCORE_STATS/);
  }
  const incoherent = stats.createState("assassin", 10);
  incoherent.gameplayVersion = 2;
  assert.throws(
    () => core.normalize(incoherent),
    /UNSUPPORTED_EQUIPMENT_RULES/,
  );
  groups.push(
    "missing, mismatched or corrupt stat snapshots fail without silently migrating",
  );
  const paired = keys.map((key) => {
    const s = stats.createState(key, 10),
      c = stats.CLASSES[key];
    stats.addSource(
      s,
      Object.fromEntries(
        ["str", "dex", "vit", "ene"].map((k) => [k, 130 - c[k]]),
      ),
      "checkpoint",
    );
    s.items = [flatItem("same-gear", { dex: 40, str: 10, vit: 10, ene: 10 })];
    stats.recompute(s);
    return s;
  });
  const assassin = paired.find((s) => s.classKey === "assassin");
  const median = (a) => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
  const dodge = (s) => 1 - world.hitChance(100, s.evasion, s.evasionCap);
  assert(
    assassin.critChance -
      median(paired.filter((s) => s !== assassin).map((s) => s.critChance)) >=
      0.12,
  );
  assert(
    dodge(assassin) - median(paired.filter((s) => s !== assassin).map(dodge)) >=
      0.1,
  );
  const amazon = paired.find((s) => s.classKey === "amazon");
  assert(amazon.accuracy > assassin.accuracy);
  for (const key of keys) {
    const s = stats.createState(key, 10),
      p = s.statProfile.mastery;
    stats.addSource(s, { dex: 10000, critChance: 1, evasion: 10000 });
    assert.equal(s.critChance, p.critCap);
    assert.equal(s.evasionCap, p.evasionCap);
    s.items = Object.values(core.ITEMS)
      .flat()
      .map((i) => ({
        ...flatItem(i.id, {}),
        definition: i,
        name: i.name,
        rarity: i.rarity,
        cleansedLevels: 1,
      }));
    stats.recompute(s);
    assert.equal(s.critCap, Math.min(0.75, p.critCap + 0.15));
    assert.equal(s.evasionCap, Math.min(0.6, p.evasionCap + 0.15));
    s.encounter = { type: "empty", name: "Test" };
    for (const tab of ["stats", "effects", "items"])
      bounds(view.privatePayload(s, "test", "source", tab, 0));
    const preview = view.setupPreview(key);
    assert(preview.mastery.includes(p.name));
    assert(preview.passive.length < 1024);
  }
  groups.push(
    "equal-stat/equal-gear Assassin Crit and dodge separation, Amazon accuracy, class caps and UI limits",
  );
  for (const key of keys) {
    const s = stats.createState(key, 10);
    // Saved V3 runs retain the original linear equipment formula.
    for (const key of [
      "equipmentRulesVersion",
      "itemLevelCurveVersion",
      "affinityVersion",
    ])
      delete s[key];
    const before = stats.derive(s);
    s.items = [flatItem("flat", { physical: 10, spell: 10 })];
    stats.recompute(s);
    assert.equal(
      s.damageMax - before.damageMax,
      10,
      key + " unscaled flat physical",
    );
    assert.equal(
      s.spellMax - before.spellMax,
      10,
      key + " unscaled flat magic",
    );
    s.items = [
      flatItem("stack", { physical: 10, spell: 10 }, 20),
      ...Array.from({ length: 6 }, (_, i) =>
        flatItem("extra" + i, { physical: 1, spell: 1 }),
      ),
    ];
    stats.addSource(s, { physical: 5, spell: 5 }, "absorbed");
    assert.equal(s.damageMax - before.damageMax, 211);
    assert.equal(s.spellMax - before.spellMax, 211);
    for (const part of Object.values(s.damageBreakdown))
      assert.equal(
        part.total,
        Math.max(0, Math.floor(part.base + part.attributes + part.equipment)),
      );
    assert.deepEqual(
      passives.aggregate(s),
      passives.aggregate({ ...s, items: [] }),
    );
    s.hp = 7;
    s.mana = 0;
    stats.addSource(s, { vit: 20, ene: 20 });
    assert.equal(s.hp, 7);
    assert.equal(s.mana, 0);
  }
  const druid = stats.createState("druid", 10),
    paladin = stats.createState("paladin", 10),
    necro = stats.createState("necromancer", 10);
  const before = [druid.damageMax, paladin.damageMax, necro.spellMax];
  for (const s of [druid, paladin, necro]) stats.addSource(s, { vit: 100 });
  assert.equal(druid.damageMax - before[0], 12);
  assert.equal(paladin.damageMax - before[1], 8);
  assert.equal(necro.spellMax - before[2], 10);
  const cursed = stats.createState("druid", 10),
    definition = Object.values(core.ITEMS)
      .flat()
      .find((i) => i.id === "glass_cannon");
  core.receiveItem(cursed, definition, 2, 0);
  assert.equal(cursed.defense, 0);
  core.cleanse(cursed, cursed.items[0]);
  assert(cursed.defense > 0);
  assert.equal(cursed.items[0].level, 2);
  assert.equal(cursed.items[0].rarity, "cursed");
  const negative = stats.createState("barbarian", 10);
  stats.addSource(negative, { str: -999, dex: -999, vit: -999, ene: -999 });
  assert.equal(negative.str, 1);
  assert(negative.maxHp >= 1);
  assert(negative.damageMin >= 1);
  assert(Number.isFinite(negative.spellMax));
  groups.push(
    "equipment/absorbed damage unscaled, all items/levels retained, hybrid VIT synergies, no free heal and UR cleanse",
  );
  const run = service.startHardcore({
    guildId: "stats-v3",
    userId: "player",
    channelId: "test",
    stake: 10,
    classKey: "assassin",
    forcedEncounter: { type: "empty", name: "Test" },
  });
  assert.equal(run.state.gameplayVersion, 3);
  assert.equal(run.state.godRngesusEnabled, true);
  const originalProfile = clone(run.state.statProfile);
  const action = core
    .actions(run.state)
    .find((o) => o.action !== "retreat" && !o.disabled).action;
  const result = service.playHardcore({
    sessionId: run.session.id,
    userId: "player",
    expectedTurn: run.state.turn,
    action,
  });
  assert.deepEqual(result.state.statProfile, originalProfile);
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "player",
        expectedTurn: run.state.turn,
        action,
      }),
    /STALE/,
  );
  assert.deepEqual(
    repo.parseState(repo.getSession(run.session.id)).statProfile,
    originalProfile,
  );
  groups.push(
    "real service starts V3, persists exact coefficients and rejects duplicate actions",
  );
  console.log(JSON.stringify({ ok: true, release: RELEASE.version, groups }));
} finally {
  db.close();
}
