"use strict";
const equipmentRules = require("../equipment/rules");
const itemCurses = require("../itemCurses");
// Stat-only V3 rules. Skills, items, drops, Forge and checkpoints keep their existing mechanics.
const VERSION = 3;
const MASTERY_VERSION = 1;
const BALANCE_VERSION = "3.1.0";
const PROFILES = Object.freeze({
  venance: {
    name: "Astral Conduction",
    accuracy: 1.2,
    evasion: 0.2,
    crit: 0.0003,
    critCap: 0.35,
    evasionCap: 0.3,
    hp: 3.3,
    strDefense: 0.15,
    vitDefense: 0.18,
    res: 0.25,
    mana: 0.05,
    physicalPower: 1,
    spellPower: 1.4,
    vitPhysical: 0,
    enePhysical: 0,
    vitSpell: 0,
  },
  amazon: {
    name: "Marksmanship",
    accuracy: 1.35,
    evasion: 0.45,
    crit: 0.0006,
    critCap: 0.5,
    evasionCap: 0.4,
    hp: 3.5,
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
    hp: 4,
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
    core: {
      ...Object.fromEntries(NUMERIC_CORE.map((key) => [key, core[key]])),
      ...(classKey === "assassin" ? { baseHp: 46 } : {}),
    },
    initialVitHp: classKey === "amazon" ? 3.5 : classKey === "assassin" ? 4 : 3,
    mastery: { ...mastery },
    powers: { basePower, attributePower: 1, equipmentPower: 1, skillPower: 1 },
  };
}
function profile(state) {
  const p = state.statProfile;
  if (
    state.statSystemVersion !== VERSION ||
    state.classMasteryVersion !== MASTERY_VERSION ||
    !["3.0.0", BALANCE_VERSION].includes(state.balanceVersion) ||
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
  if (
    state.balanceVersion === BALANCE_VERSION &&
    (!Number.isFinite(p.initialVitHp) ||
      p.initialVitHp < 1 ||
      p.initialVitHp > 5)
  )
    throw Error("INVALID_HARDCORE_STATS");
  return p;
}
function layers(state) {
  const allocated = {},
    equipment = {};
  const add = (target, values, level = 1) => {
    for (const [key, value] of Object.entries(values || {})) {
      if (key === "defenseSet") {
        if (level > 0 || !equipmentRules.enabled(state)) target[key] = value;
      } else target[key] = (target[key] || 0) + value * level;
    }
  };
  for (const [key, values] of Object.entries(state.sources || {}))
    if (key !== "absorbed" || !equipmentRules.enabled(state))
      add(key === "absorbed" ? equipment : allocated, values);
  for (const item of state.items || []) {
    add(
      equipment,
      item.definition.effects,
      equipmentRules.itemScale(state, item),
    );
    const effects = { ...item.definition.curse?.effects };
    if (
      item.level > (item.cleansedLevels || 0) &&
      itemCurses.defenseReduction(item)
    ) {
      delete effects.defenseReduction;
      delete effects.defenseSet;
      equipment.defense =
        (equipment.defense || 0) - (itemCurses.defenseLoss(item) || 0);
    }
    add(equipment, effects, equipmentRules.curseScale(state, item));
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
      c.baseHp +
        c.vit * (state.statProfile.initialVitHp || 3) +
        extra("vit") * m.hp +
        (totals.maxHp || 0),
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
    f = (n) => Number(n.toFixed(1)).toLocaleString("vi-VN"),
    icon = (key, fallback) => icons[key] || fallback,
    gain = (key, label, amount, suffix = "") =>
      `${icon(key, label)} ${label} +${f(amount)}${suffix}`;
  const physical = [
    ...(c.strWeight ? [`STR +${f(c.strWeight * 60 * m.physicalPower)}`] : []),
    ...(c.strWeight < 1
      ? [`DEX +${f((1 - c.strWeight) * 60 * m.physicalPower)}`]
      : []),
    ...(m.vitPhysical ? [`VIT +${f(m.vitPhysical * 100)}`] : []),
    ...(m.enePhysical ? [`ENE +${f(m.enePhysical * 100)}`] : []),
  ];
  const magic = [
    `ENE +${f(75 * m.spellPower)}`,
    ...(m.vitSpell ? [`VIT +${f(m.vitSpell * 100)}`] : []),
  ];
  return [
    `**${m.name}** · Quy đổi mỗi **+100 điểm** thuộc tính:`,
    `${icon("dex", "DEX")} **DEX** → ${gain("accuracy", "ACC", m.accuracy * 100)} · ${gain("evasion", "EVA", m.evasion * 100)} · ${gain("crit", "CRIT", m.crit * 10000, " điểm %")}`,
    `${icon("vit", "VIT")} **VIT** → ${gain("hp", "Max HP", m.hp * 100)} · ${gain("defense", "DEF", m.vitDefense * 100)}`,
    `${icon("str", "STR")} **STR** → ${gain("defense", "DEF", m.strDefense * 100)}`,
    `${icon("ene", "ENE")} **ENE** → ${gain("res", "RES", m.res * 100, " điểm %")} · ${gain("mana", "Max MP", m.mana * 100)}`,
    "**DMG từ +100 điểm phân bổ** (trước hệ số cân bằng):",
    `${icon("attack", "⚔️")} Vật lý: ${physical.join(" · ")}`,
    `${icon("magic", "🔮")} Phép: ${magic.join(" · ")}`,
    `${icon("crit", "CRIT")} Trần CRIT **${f(m.critCap * 100)}%** · ${icon("evasion", "EVA")} Trần né vật lý **${f(m.evasionCap * 100)}%**; trang bị có thể nâng tới 75%/60%. Max MP tối đa 10.`,
    "Cộng từng điểm theo tỷ lệ trên; số hiển thị làm tròn 1 chữ số thập phân, chỉ số nguyên làm tròn xuống sau khi cộng. DMG trang bị tính riêng.",
  ].join("\n");
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
