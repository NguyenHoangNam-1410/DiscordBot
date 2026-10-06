"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/services/hardcoreV2");
const stats = require("../src/services/hardcoreStats");
const view = require("../src/services/hardcoreV2View");
const passives = require("../src/hardcore/itemPassives");
const items = Object.values(core.ITEMS).flat();
const get = (id) => items.find((i) => i.id === id);
function state(id, classKey = "sorceress", levels = 1, clean = 0) {
  const s = stats.createState(classKey, 10000);
  s.floor = 11;
  s.cleared = 10;
  if (id) core.receiveItem(s, get(id), levels, clean);
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  s.encounter = {
    type: "combat",
    name: "Test",
    rank: "normal",
    hp: 100000,
    maxHp: 100000,
    defense: 0,
    resistance: 0,
    evasion: 0,
    accuracy: 1000,
    critChance: 0,
    damageMin: 50,
    damageMax: 50,
    nextDamageType: "physical",
    damageType: "physical",
    combatTurn: 1,
    passiveCombatStarted: true,
  };
  return s;
}
function hit(s, magic = false, player = false, rank = "normal") {
  const e = { ...s.encounter, rank };
  return core.attackDamage(player ? s : e, player ? e : s, s, () => 0.5, {
    magic,
    player,
    critical: false,
    raw: 100,
  }).damage;
}
const groups = [];
try {
  assert.deepEqual(
    core.ITEMS.cursed.map((i) => Object.keys(i.curse.effects)),
    [
      ["defenseSet"],
      ["physicalDamageTaken"],
      ["bonusPenalty"],
      ["potionCapacityLoss"],
      ["skillHpCost"],
      ["potionPower"],
      ["attackManaLoss"],
      ["mimicChance"],
      ["damageTaken"],
      ["skillManaExtra"],
      ["resistance"],
      ["combatManaLoss"],
      ["floorHpLoss"],
      ["healingReduction"],
      ["magicDamageTaken"],
      ["normalDamagePenalty"],
    ],
  );
  for (const rarity of ["legendary", "cursed"]) {
    assert(
      core.ITEMS[rarity].some(
        (i) => i.category === "weapon" && i.effects.ene >= 24,
      ),
    );
  }
  assert.equal(get("eternal_clover").effects.luck, 10);
  assert.equal(get("wardens_bulwark").effects.defense, 2);
  assert.equal(get("living_armor").effects.defense, 6);
  assert.equal(get("seraphic_aegis").effects.resistance, 5);
  assert.equal(get("blood_moon_edge").passive.kind, "berserk");
  assert(!get("seraphic_aegis").effects.str);
  assert(!get("wardens_bulwark").effects.ene);
  groups.push(
    "16 distinct UR drawbacks, SSR/UR magic weapons and separate item roles",
  );

  const physical = state("schrodingers_armor");
  physical.defense = 0;
  const neutralPhysical = structuredClone(physical);
  neutralPhysical.physicalDamageTaken = 0;
  assert.equal(hit(physical), Math.floor(hit(neutralPhysical) * 1.2));
  assert.equal(hit(physical, true), hit(neutralPhysical, true));
  const magic = state("black_sun");
  magic.resistance = 0;
  const neutralMagic = structuredClone(magic);
  neutralMagic.magicDamageTaken = 0;
  assert.equal(hit(magic, true), Math.floor(hit(neutralMagic, true) * 1.2));
  assert.equal(hit(magic), hit(neutralMagic));
  const both = state("schrodingers_armor");
  core.receiveItem(both, get("berserker_chains"));
  both.defense = 0;
  assert.equal(hit(both), Math.floor(100 * 1.18 * 1.2));
  groups.push(
    "typed incoming damage, all-damage stacking and no wrong-type penalty",
  );

  const hp = state("blood_pact");
  const paid = Math.max(1, Math.floor(hp.maxHp * 0.03));
  assert.equal(core.skillHpCost(hp), paid);
  const expectedDamage = core.skillDamagePreview(hp);
  const oldHP = hp.hp;
  const result = core.playerAttack(hp, "skill", () => 0.5);
  assert.equal(hp.hp, oldHP - paid);
  assert.match(result.log, /Chi phí Skill/);
  const damage = 100000 - hp.encounter.hp;
  assert(damage >= expectedDamage.low && damage <= expectedDamage.high);
  hp.hp = paid;
  hp.mana = hp.maxMana;
  assert(core.actions(hp).find((a) => a.action === "skill").disabled);
  const manaBefore = hp.mana;
  assert.throws(
    () => core.playerAttack(hp, "skill", () => 0.5),
    /INSUFFICIENT_SKILL_HP/,
  );
  assert.equal(hp.mana, manaBefore);
  assert.equal(hp.hp, paid);
  hp.activeParadox = {
    version: 2,
    id: "blood_pact",
    startFloor: 11,
    endFloor: 15,
    milestone: 10,
  };
  assert.equal(
    core.skillHpCost(hp),
    paid + Math.max(1, Math.floor(hp.maxHp * 0.05)),
  );
  groups.push(
    "HP cost, low-HP lock, preview parity, log and additive Paradox cost",
  );

  const mana = state("hollow_crown");
  assert.equal(core.skillManaCost(mana), 3);
  mana.mana = 2;
  assert(core.actions(mana).find((a) => a.action === "skill").disabled);
  assert.throws(() => core.playerAttack(mana, "skill", () => 0.5), /NO_ENERGY/);
  mana.activeParadox = {
    version: 2,
    id: "mana_fracture",
    startFloor: 11,
    endFloor: 15,
    milestone: 10,
  };
  assert.equal(core.skillManaCost(mana), 2);
  mana.activeParadox = {
    version: 2,
    id: "unstable_soul",
    startFloor: 11,
    endFloor: 15,
    milestone: 10,
    lockedSkillCost: 3,
  };
  assert.equal(core.skillManaCost(mana), 4);
  mana.classShrine = { from: 11, until: 15, consumed: false };
  assert.equal(core.skillManaCost(mana), 0);
  const hour = state("broken_hourglass", "assassin");
  assert.equal(core.attackManaGain(hour), 0);
  hour.mana = 0;
  core.playerAttack(hour, "defend", () => 0.5);
  assert.equal(hour.mana, 1);
  groups.push(
    "MP cost after Paradox, free Shrine and attack-only MP suppression",
  );

  const entry = state("soul_leash");
  entry.encounter.passiveCombatStarted = false;
  const entryMana = entry.mana;
  core.prepareItemCombat(entry, () => 0); // startMana passive triggers after the curse.
  assert.equal(entry.mana, entryMana);
  const log = entry.lastLog;
  assert(log.indexOf("Soul Leash") < log.indexOf("Khởi động MP"));
  const saved = core.normalize(JSON.parse(JSON.stringify(entry)));
  core.prepareItemCombat(saved, () => 0);
  assert.equal(saved.mana, entryMana);
  assert.equal(saved.lastLog, log);
  saved.hp = 1;
  core.prepareItemCombat(saved, () => 0);
  assert.equal(saved.mana, entryMana);
  entry.encounter = { ...entry.encounter, passiveCombatStarted: false };
  entry.mana = 0;
  core.prepareItemCombat(entry, () => 0.99);
  assert.equal(entry.mana, 0);
  groups.push(
    "entry MP drain order, zero floor and persisted once-per-combat trigger",
  );

  const healing = state("null_idol", "druid");
  healing.hp = 1;
  assert.equal(core.heal(healing, 100), 80);
  healing.hp = 1;
  const potionExpected = Math.floor(
    Math.max(20, healing.maxHp * healing.potionRate) * 0.8,
  );
  core.playerAttack(healing, "potion", () => 0.5);
  assert.equal(healing.hp, 1 + potionExpected);
  healing.hp = 1;
  core.playerAttack(healing, "skill", () => 0.5);
  assert.equal(healing.hp, 1 + Math.floor(healing.maxHp * 0.12 * 0.8));
  core.heal(healing, healing.maxHp, { checkpoint: true });
  assert.equal(healing.hp, healing.maxHp);
  healing.hp = 0;
  healing.reviveTickets = 1;
  assert(core.reviveAfterDeath(healing, {}, () => 0.5, "death"));
  assert.equal(healing.hp, Math.ceil(healing.maxHp * 0.5));
  groups.push(
    "healing reduction on events, potions and Druid; checkpoint/revival exemptions",
  );

  const oath = state("oathbreaker");
  assert.equal(hit(oath, true, true), 80);
  assert.equal(hit(oath, true, true, "elite"), 100);
  assert.equal(hit(oath, true, true, "boss"), 100);
  assert.equal(hit(oath, true, true, "final_boss"), 100);
  const crown = state("crown_of_ruin", "barbarian", 20);
  assert.equal(crown.maxPotions, 1);
  assert.equal(crown.potions, 1);
  core.cleanse(crown, crown.items[0]);
  assert.equal(crown.maxPotions, 5);
  assert.equal(crown.potions, 1);
  groups.push(
    "normal-monster drawback scope, potion capacity floor and no discarded supplies refund",
  );

  const capped = {
    physicalDamageTaken: 1,
    magicDamageTaken: 1,
    skillHpCost: 0.15,
    attackManaLoss: 3,
    skillManaExtra: 3,
    combatManaLoss: 3,
    healingReduction: 0.6,
    normalDamagePenalty: 0.6,
  };
  for (const item of core.ITEMS.cursed) {
    const s = state(item.id, "sorceress", 100);
    const curseKey = Object.keys(item.curse.effects)[0];
    if (Object.hasOwn(capped, curseKey))
      assert.equal(s[curseKey], capped[curseKey]);
    s.items[0].cleansedLevels = 99;
    stats.recompute(s);
    if (Object.hasOwn(capped, curseKey))
      assert.equal(s[curseKey], item.curse.effects[curseKey]);
    const buffs = {
      str: s.str,
      dex: s.dex,
      vit: s.vit,
      ene: s.ene,
      luck: s.luck,
    };
    const passive = passives.aggregate(s);
    core.cleanse(s, s.items[0]);
    assert.deepEqual(
      { str: s.str, dex: s.dex, vit: s.vit, ene: s.ene, luck: s.luck },
      buffs,
    );
    assert.deepEqual(passives.aggregate(s), passive);
    if (Object.hasOwn(capped, curseKey)) assert.equal(s[curseKey], 0);
    const forge = state(item.id);
    const before = {
      str: forge.str,
      dex: forge.dex,
      vit: forge.vit,
      ene: forge.ene,
      luck: forge.luck,
    };
    core.grind(forge, forge.items[0]);
    assert.deepEqual(
      {
        str: forge.str,
        dex: forge.dex,
        vit: forge.vit,
        ene: forge.ene,
        luck: forge.luck,
      },
      before,
    );
    if (Object.hasOwn(capped, curseKey)) assert.equal(forge[curseKey], 0);
    const text = view.effectText(item.curse.effects, 100);
    assert(!/undefined|NaN/.test(text));
    assert(!text.includes(curseKey));
  }
  groups.push(
    "caps at high level, partial cleanse, full cleanse, forge and readable descriptions",
  );

  const old = state(null);
  const oldDefinition = {
    ...structuredClone(get("blood_pact")),
    effects: { str: 40, dex: 10 },
    curse: { effects: { vit: -15 }, text: "-15 VIT" },
  };
  core.receiveItem(old, oldDefinition);
  const oldSnapshot = structuredClone(old.items[0].definition);
  const resumed = core.normalize(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(resumed.items[0].definition, oldSnapshot);
  resumed.lastReceivedItems = [];
  core.receiveItem(resumed, get("blood_pact"));
  assert.deepEqual(resumed.items[0].definition, oldSnapshot);
  assert.deepEqual(resumed.lastReceivedItems[0].definition, oldSnapshot);
  assert.equal(resumed.skillHpCost, 0);
  assert.equal(resumed.str, stats.CLASSES.sorceress.str + 80);
  assert.equal(resumed.vit, Math.max(1, stats.CLASSES.sorceress.vit - 30));
  groups.push(
    "saved pre-rework definitions and matching receipt log when adding another level",
  );

  const ui = state(null);
  for (const item of items) core.receiveItem(ui, item, 10);
  ui.modifiers = Object.fromEntries(
    Object.keys(require("../src/services/hardcoreWorld").RIFT_MODIFIERS).map(
      (k) => [k, 100],
    ),
  );
  ui.classShrine = { from: 11, until: 13 };
  ui.activeParadox = {
    version: 2,
    id: "blood_mirror",
    startFloor: 11,
    endFloor: 15,
    milestone: 10,
  };
  const frozen = JSON.stringify(ui);
  const first = view.privatePayload(ui, "p", "m", "stats");
  const pages = Number(first.embeds[0].data.footer.text.split("/").at(-1));
  assert(pages > 1);
  const names = [];
  for (let page = 0; page < pages; page++) {
    const p = view.privatePayload(ui, "p", "m", "stats", page);
    const e = p.embeds[0].toJSON();
    const size =
      e.title.length +
      e.description.length +
      e.footer.text.length +
      e.fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0);
    assert(size <= 6000);
    assert(e.fields.length <= 25);
    assert(e.fields.every((f) => f.value.length <= 1024));
    assert(e.footer.text.endsWith(page + 1 + "/" + pages));
    const controls = JSON.stringify(p.components.map((c) => c.toJSON()));
    assert(controls.includes("page_stats_"));
    names.push(...e.fields.map((f) => f.name));
  }
  assert(names.some((n) => n.includes("Tổng hợp trang bị")));
  assert(names.some((n) => n.includes("Nội tại")));
  assert(names.some((n) => n.includes("Phòng thủ")));
  assert.equal(JSON.stringify(ui), frozen);
  groups.push(
    "all stat fields preserved across read-only pages within Discord limits",
  );

  console.log(JSON.stringify({ ok: true, groups }));
} finally {
  db.close();
}
