"use strict";
// Stat-only V3 rules. Skills, items, drops, Forge and checkpoints keep their existing mechanics.
const VERSION = 3;
const MASTERY_VERSION = 1;
const BALANCE_VERSION = "3.0.0";
const PROFILES = Object.freeze({
  amazon: {
    name: "Marksmanship",
    accuracy: 1.35,
    evasion: 0.3,
    crit: 0.0006,
    critCap: 0.5,
    evasionCap: 0.4,
    hp: 3,
    strDefense: 0.2,
    vitDefense: 0.15,
    res: 0.1,
    mana: 0.04,
    physicalPower: 1,
    spellPower: 1,
    vitPhysical: 0,
    enePhysical: 0,
    vitSpell: 0,
  },
  barbarian: {
    name: "Might",
    accuracy: 1.2,
    evasion: 0.15,
    crit: 0.0003,
    critCap: 0.4,
    evasionCap: 0.3,
    hp: 4,
    strDefense: 0.4,
    vitDefense: 0.2,
    res: 0.1,
    mana: 0.04,
    physicalPower: 1.2,
    spellPower: 1,
    vitPhysical: 0,
    enePhysical: 0,
    vitSpell: 0,
  },
  assassin: {
    name: "Shadow Mastery",
    accuracy: 1.2,
    evasion: 0.9,
    crit: 0.0018,
    critCap: 0.65,
    evasionCap: 0.55,
    hp: 3,
    strDefense: 0.15,
    vitDefense: 0.1,
    res: 0.1,
    mana: 0.04,
    physicalPower: 1.1,
    spellPower: 1,
    vitPhysical: 0,
    enePhysical: 0,
    vitSpell: 0,
  },
  sorceress: {
    name: "Arcane Mastery",
    accuracy: 1.2,
    evasion: 0.15,
    crit: 0.0003,
    critCap: 0.35,
    evasionCap: 0.3,
    hp: 3,
    strDefense: 0.15,
    vitDefense: 0.1,
    res: 0.22,
    mana: 0.05,
    physicalPower: 1,
    spellPower: 1.2,
    vitPhysical: 0,
    enePhysical: 0,
    vitSpell: 0,
  },
  druid: {
    name: "Wild Growth",
    accuracy: 1.2,
    evasion: 0.25,
    crit: 0.0004,
    critCap: 0.4,
    evasionCap: 0.35,
    hp: 4,
    strDefense: 0.2,
    vitDefense: 0.2,
    res: 0.16,
    mana: 0.045454545454545456,
    physicalPower: 1,
    spellPower: 1,
    vitPhysical: 0.12,
    enePhysical: 0.1,
    vitSpell: 0,
  },
  necromancer: {
    name: "Soul Mastery",
    accuracy: 1.2,
    evasion: 0.15,
    crit: 0.0003,
    critCap: 0.35,
    evasionCap: 0.3,
    hp: 3,
    strDefense: 0.15,
    vitDefense: 0.2,
    res: 0.2,
    mana: 0.05,
    physicalPower: 1,
    spellPower: 1.1,
    vitPhysical: 0,
    enePhysical: 0,
    vitSpell: 0.1,
  },
  paladin: {
    name: "Divine Guard",
    accuracy: 1.2,
    evasion: 0.15,
    crit: 0.0004,
    critCap: 0.4,
    evasionCap: 0.3,
    hp: 3.5,
    strDefense: 0.35,
    vitDefense: 0.25,
    res: 0.18,
    mana: 0.04,
    physicalPower: 1,
    spellPower: 1,
    vitPhysical: 0.08,
    enePhysical: 0.05,
    vitSpell: 0,
  },
});

for (const mastery of Object.values(PROFILES)) Object.freeze(mastery);

const NUMERIC_CORE = [
  "str",
  "dex",
  "vit",
  "ene",
  "baseHp",
  "baseMana",
  "baseRes",
  "baseCrit",
  "strWeight",
];
function snapshot(classKey, core, basePower) {
  const mastery = PROFILES[classKey];
  if (!mastery) throw new Error("INVALID_CLASS");
  return {
    version: VERSION,
    masteryVersion: MASTERY_VERSION,
    classKey,
    core: Object.fromEntries(NUMERIC_CORE.map((key) => [key, core[key]])),
    mastery: { ...mastery },
    powers: { basePower, attributePower: 1, equipmentPower: 1, skillPower: 1 },
  };
}
function profile(state) {
  const p = state.statProfile;
  if (
    state.statSystemVersion !== VERSION ||
    state.classMasteryVersion !== MASTERY_VERSION ||
    state.balanceVersion !== BALANCE_VERSION ||
    p?.version !== VERSION ||
    p.masteryVersion !== MASTERY_VERSION ||
    p.classKey !== state.classKey
  )
    throw new Error("UNSUPPORTED_HARDCORE_STATS");
  const valid = (value) => Number.isFinite(value) && Math.abs(value) <= 100;
  if (
    !NUMERIC_CORE.every((key) => valid(p.core?.[key])) ||
    !p.mastery?.name ||
    !Object.keys(PROFILES[state.classKey])
      .filter((key) => key !== "name")
      .every((key) => valid(p.mastery[key])) ||
    !Object.values(p.powers || {}).every(valid) ||
    !["basePower", "attributePower", "equipmentPower", "skillPower"].every(
      (key) => Number.isFinite(p.powers?.[key]) && p.powers[key] > 0,
    ) ||
    p.powers.equipmentPower !== 1 ||
    p.powers.skillPower !== 1
  )
    throw new Error("INVALID_HARDCORE_STATS");
  if (
    p.powers.basePower < 0.1 ||
    p.powers.basePower > 5 ||
    p.core.strWeight < 0 ||
    p.core.strWeight > 1 ||
    p.mastery.critCap < 0 ||
    p.mastery.critCap > 0.75 ||
    p.mastery.evasionCap < 0 ||
    p.mastery.evasionCap > 0.6
  )
    throw new Error("INVALID_HARDCORE_STATS");
  return p;
}
function layers(state) {
  const allocated = {},
    equipment = {};
  const add = (target, values, level = 1) => {
    for (const [key, value] of Object.entries(values || {})) {
      if (key === "defenseSet") target[key] = value;
      else target[key] = (target[key] || 0) + value * level;
    }
  };
  for (const [key, values] of Object.entries(state.sources || {}))
    add(key === "absorbed" ? equipment : allocated, values);
  for (const item of state.items || []) {
    add(equipment, item.definition.effects, item.level);
    add(
      equipment,
      item.definition.curse?.effects,
      Math.max(0, item.level - (item.cleansedLevels || 0)),
    );
  }
  return { allocated, equipment };
}
function apply(state, d, totals, passives, clamp) {
  const { core: c, mastery: m, powers } = profile(state);
  const { allocated, equipment } = layers(state);
  const a = {},
    g = {};
  for (const key of ["str", "dex", "vit", "ene"]) {
    d[key] = Math.max(1, c[key] + (totals[key] || 0));
    a[key] = Math.max(1, c[key] + (allocated[key] || 0)) - c[key];
    g[key] = d[key] - c[key] - a[key];
  }
  const extra = (key) => d[key] - c[key];
  d.maxHp = Math.max(
    1,
    Math.floor(
      c.baseHp + c.vit * 3 + extra("vit") * m.hp + (totals.maxHp || 0),
    ),
  );
  const physical = (value) =>
    (value.str * c.strWeight + value.dex * (1 - c.strWeight)) * 0.6;
  const spell = (value) => value.ene * 0.75;
  const contribution = (base, attrs, gear) => ({
    base,
    attributes: attrs,
    equipment: gear,
    total: Math.max(0, Math.floor(base + attrs + gear)),
  });
  const physicalParts = contribution(
    Math.floor(Math.floor(physical(c)) * powers.basePower),
    (physical(a) * m.physicalPower +
      a.vit * m.vitPhysical +
      a.ene * m.enePhysical +
      (allocated.physical || 0)) *
      powers.attributePower,
    (physical(g) +
      g.vit * m.vitPhysical +
      g.ene * m.enePhysical +
      (equipment.physical || 0)) *
      powers.equipmentPower,
  );
  const spellParts = contribution(
    Math.floor(Math.floor(spell(c)) * powers.basePower),
    (spell(a) * m.spellPower + a.vit * m.vitSpell + (allocated.spell || 0)) *
      powers.attributePower,
    (spell(g) + g.vit * m.vitSpell + (equipment.spell || 0)) *
      powers.equipmentPower,
  );
  d.damageMin = Math.max(1, physicalParts.total - 2);
  d.damageMax = physicalParts.total + 3;
  d.spellMin = Math.max(1, spellParts.total - 2);
  d.spellMax = spellParts.total + 3;
  d.damageBreakdown = { physical: physicalParts, spell: spellParts };
  d.defense =
    totals.defenseSet === 0
      ? 0
      : Math.max(
          0,
          Math.floor(
            c.str * 0.3 +
              c.vit * 0.15 +
              extra("str") * m.strDefense +
              extra("vit") * m.vitDefense,
          ) + (totals.defense || 0),
        );
  d.accuracy = Math.max(
    1,
    Math.floor(60 + c.dex * 1.2 + extra("dex") * m.accuracy) +
      (totals.accuracy || 0),
  );
  d.evasion = Math.max(
    0,
    Math.floor(c.dex * 0.55 + extra("dex") * m.evasion) + (totals.evasion || 0),
  );
  d.critCap = Math.min(0.75, m.critCap + passives.critCap);
  d.evasionCap = Math.min(0.6, m.evasionCap + passives.evasionCap);
  d.critChance = clamp(
    c.baseCrit +
      c.dex * 0.001 +
      extra("dex") * m.crit +
      (totals.critChance || 0),
    0,
    d.critCap,
  );
  d.resistance = clamp(
    c.baseRes +
      Math.floor(c.ene * 0.2 + extra("ene") * m.res) +
      (totals.resistance || 0),
    -30,
    70,
  );
  d.maxMana = clamp(
    Math.floor(
      c.baseMana + c.ene / 25 + extra("ene") * m.mana + (totals.maxMana || 0),
    ),
    1,
    10,
  );
  return d;
}
function description(state, icons = {}) {
  const { core: c, mastery: m } = profile(state),
    f = (n) => Number(n.toFixed(3)).toLocaleString("vi-VN");
  return (
    "**" +
    m.name +
    "** · mỗi điểm tăng thêm:\n" +
    (icons.dex || "DEX") +
    " DEX → ACC +" +
    f(m.accuracy) +
    ", EVA +" +
    f(m.evasion) +
    ", CRIT +" +
    f(m.crit * 100) +
    " điểm %.\n" +
    (icons.vit || "VIT") +
    " VIT → Max HP +" +
    f(m.hp) +
    ", DEF +" +
    f(m.vitDefense) +
    ".\n" +
    (icons.str || "STR") +
    " STR → DEF +" +
    f(m.strDefense) +
    ". " +
    (icons.ene || "ENE") +
    " ENE → RES +" +
    f(m.res) +
    " điểm %, Max MP +" +
    f(m.mana) +
    ".\n" +
    "DMG từ điểm phân bổ: vật lý (STR ×" +
    f(c.strWeight) +
    " + DEX ×" +
    f(1 - c.strWeight) +
    ") ×0,6 ×" +
    f(m.physicalPower) +
    "; phép ENE ×0,75 ×" +
    f(m.spellPower) +
    "." +
    (m.vitPhysical || m.enePhysical
      ? " Vật lý thêm VIT ×" +
        f(m.vitPhysical) +
        " + ENE ×" +
        f(m.enePhysical) +
        "."
      : "") +
    (m.vitSpell ? " Phép thêm VIT ×" + f(m.vitSpell) + "." : "") +
    "\n" +
    "Trần cơ bản: CRIT " +
    f(m.critCap * 100) +
    "% · né vật lý " +
    f(m.evasionCap * 100) +
    "%; nội tại trang bị có thể nâng trần (tối đa 75%/60%). Các chỉ số nguyên được làm tròn xuống sau khi cộng."
  );
}
module.exports = {
  VERSION,
  MASTERY_VERSION,
  BALANCE_VERSION,
  PROFILES,
  snapshot,
  profile,
  layers,
  apply,
  description,
};
