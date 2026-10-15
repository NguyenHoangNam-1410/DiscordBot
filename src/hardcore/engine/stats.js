"use strict";
const { RELEASE } = require("../shared/version");
const equipmentRules = require("../equipment/rules");
const balance = require("../shared/balance");
const statsV3 = require("../shared/statsV3");
const emoji = require("../../discordEmojiMap");
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const ATTRIBUTES = ["str", "dex", "vit", "ene"];
const CLASSES = Object.freeze({
  amazon: {
    name: "Amazon",
    emoji: emoji[":class_amazon:"],
    str: 18,
    dex: 28,
    vit: 20,
    ene: 14,
    baseHp: 40,
    baseMana: 2,
    baseRes: 3,
    baseCrit: 0.06,
    strWeight: 0.25,
    skill: "Barrage",
  },
  barbarian: {
    name: "Barbarian",
    emoji: emoji[":class_barbarian:"],
    str: 30,
    dex: 14,
    vit: 28,
    ene: 8,
    baseHp: 46,
    baseMana: 2,
    baseRes: 2,
    baseCrit: 0.05,
    strWeight: 1,
    skill: "Iron Will",
  },
  assassin: {
    name: "Assassin",
    emoji: emoji[":class_assassin:"],
    str: 18,
    dex: 30,
    vit: 18,
    ene: 14,
    baseHp: 38,
    baseMana: 2,
    baseRes: 3,
    baseCrit: 0.08,
    strWeight: 0.3,
    skill: "Shadow Step",
  },
  sorceress: {
    name: "Sorceress",
    emoji: emoji[":class_sorceress:"],
    str: 10,
    dex: 16,
    vit: 20,
    ene: 34,
    baseHp: 34,
    baseMana: 2,
    baseRes: 8,
    baseCrit: 0.04,
    strWeight: 0.7,
    skill: "Arcane Burst",
  },
  druid: {
    name: "Druid",
    emoji: emoji[":class_druid:"],
    str: 20,
    dex: 16,
    vit: 20,
    ene: 24,
    baseHp: 42,
    baseMana: 2,
    baseRes: 6,
    baseCrit: 0.05,
    strWeight: 0.8,
    skill: "Wild Regeneration",
  },
  necromancer: {
    name: "Necromancer",
    emoji: emoji[":class_necromancer:"],
    str: 12,
    dex: 16,
    vit: 22,
    ene: 30,
    baseHp: 36,
    baseMana: 2,
    baseRes: 7,
    baseCrit: 0.04,
    strWeight: 0.7,
    skill: "Totem Ward",
  },
  paladin: {
    name: "Paladin",
    emoji: emoji[":class_paladin:"],
    str: 26,
    dex: 14,
    vit: 24,
    ene: 16,
    baseHp: 43,
    baseMana: 2,
    baseRes: 10,
    baseCrit: 0.05,
    strWeight: 0.9,
    skill: "Divine Shield",
  },
});
function sumEffects(state) {
  const totals = {};
  const add = (effects, level = 1) => {
    for (const [key, value] of Object.entries(effects || {})) {
      if (key === "defenseSet") totals.defenseSet = value;
      else totals[key] = (totals[key] || 0) + value * level;
    }
  };
  for (const [key, source] of Object.entries(state.sources || {}))
    if (key !== "absorbed" || !equipmentRules.enabled(state)) add(source);
  let curseFactor = 1;
  for (const item of state.items || []) {
    add(item.definition.effects, equipmentRules.itemScale(state, item));
    const curses = Math.max(0, item.level - (item.cleansedLevels || 0));
    if (curses) {
      const effects = { ...item.definition.curse?.effects };
      if (itemCurses.defenseReduction(item)) {
        delete effects.defenseReduction;
        delete effects.defenseSet;
        // This is a saved flat loss for the item, never multiplied by levels.
        totals.defense =
          (totals.defense || 0) - (itemCurses.defenseLoss(item) || 0);
      }
      add(effects, equipmentRules.curseScale(state, item));
      curseFactor *=
        (1 - (item.definition.curse?.effects.bonusPenalty || 0)) **
        equipmentRules.curseScale(state, item);
    }
  }
  return { totals, curseFactor };
}
const itemPassives = require("../itemPassives");
const itemCurses = require("../itemCurses");
function deriveV2(state) {
  const c = CLASSES[state.classKey];
  if (!c) throw new Error("INVALID_CLASS");
  const { totals: t, curseFactor } = sumEffects(state);
  const p = itemPassives.aggregate(state);
  const d = {
    maxPotions: Math.max(
      1,
      5 + p.potionCapacity - Math.max(0, t.potionCapacityLoss || 0),
    ),
    ...itemCurses.derive(t),
    critCap: 0.6 + p.critCap,
    evasionCap: 0.45 + p.evasionCap,
  };
  for (const key of ATTRIBUTES) d[key] = Math.max(1, c[key] + (t[key] || 0));
  d.maxHp = Math.max(1, c.baseHp + d.vit * 3 + (t.maxHp || 0));
  const power = balance.power(state);
  // Preserve the original formula exactly for saved 2.0.0 runs and Assassin.
  const scale = (value) =>
    Math.max(0, power === 1 ? value : Math.floor(value * power));
  const physical = scale(
    Math.floor((d.str * c.strWeight + d.dex * (1 - c.strWeight)) * 0.6) +
      (t.physical || 0),
  );
  const spell = scale(Math.floor(d.ene * 0.75) + (t.spell || 0));
  d.damageMin = Math.max(1, physical - 2);
  d.damageMax = physical + 3;
  d.spellMin = Math.max(1, spell - 2);
  d.spellMax = spell + 3;
  d.defense =
    t.defenseSet === 0
      ? 0
      : Math.max(0, Math.floor(d.str * 0.3 + d.vit * 0.15) + (t.defense || 0));
  d.accuracy = Math.max(1, Math.floor(60 + d.dex * 1.2) + (t.accuracy || 0));
  d.evasion = Math.max(0, Math.floor(d.dex * 0.55) + (t.evasion || 0));
  d.critChance = clamp(
    c.baseCrit + d.dex * 0.001 + (t.critChance || 0),
    0,
    d.critCap,
  );
  d.critDamage = 1.75;
  d.resistance = clamp(
    c.baseRes + Math.floor(d.ene * 0.2) + (t.resistance || 0),
    -30,
    70,
  );
  d.maxMana = clamp(
    Math.floor(c.baseMana + d.ene / 25 + (t.maxMana || 0)),
    1,
    10,
  );
  d.potionPower = t.potionPower || 0;
  d.potionRate = clamp(
    0.35 + Math.min(0.15, d.vit * 0.0005) + d.potionPower,
    0.1,
    0.75,
  );
  d.luck = Math.max(0, t.luck || 0);
  for (const key of [
    "bossDamage",
    "eliteDamage",
    "mimicDetection",
    "goblinChance",
    "legendaryFind",
    "floorHpLoss",
    "mimicChance",
    "damageTaken",
  ])
    d[key] = Math.max(0, t[key] || 0);
  d.payoutFactor = (state.eventPayoutFactor ?? 1) * curseFactor;
  return d;
}
function derive(state) {
  if (state.gameplayVersion !== 3) return deriveV2(state);
  const p = statsV3.profile(state);
  // Reuse unchanged supply/curse/payout rules, then replace only character stats.
  const legacy = {
    ...state,
    balanceVersion: balance.VERSION,
    balanceProfile: { power: p.powers.basePower },
  };
  const d = deriveV2(legacy);
  const { totals } = sumEffects(state);
  statsV3.apply(state, d, totals, itemPassives.aggregate(state), clamp);
  d.potionRate = clamp(
    0.35 + Math.min(0.15, d.vit * 0.0005) + d.potionPower,
    0.1,
    0.75,
  );
  return d;
}
function recompute(state) {
  const pending = [];
  for (const item of state.items || []) {
    itemCurses.migrateDefenseCurse(item);
    if (!itemCurses.defenseReduction(item)) continue;
    if (item.level <= (item.cleansedLevels || 0)) {
      delete item.curseEffects;
    } else if (itemCurses.defenseLoss(item) === null) pending.push(item);
  }
  if (pending.length) {
    // Capture after the item's buffs have been added, but before its own curse.
    let defense = derive(state).defense;
    for (const item of pending) {
      const lost = Math.floor(defense * itemCurses.defenseReduction(item));
      item.curseEffects = { ...item.curseEffects, defense: -lost };
      defense -= lost;
    }
  }
  Object.assign(state, derive(state));
  if (require("../awakening").active(state))
    state.classAwakening.bark = Math.min(
      state.classAwakening.bark || 0,
      Math.floor(state.maxHp * require("../awakening").tuning(state).barkCap),
    );
  if (typeof state.hp === "number") state.hp = clamp(state.hp, 0, state.maxHp);
  if (typeof state.mana === "number")
    state.mana = clamp(state.mana, 0, state.maxMana);
  if (typeof state.potions === "number")
    state.potions = clamp(state.potions, 0, state.maxPotions);
  return state;
}
function addSource(state, effects, source = "event") {
  state.sources ||= { checkpoint: {}, event: {}, absorbed: {} };
  state.sources[source] ||= {};
  for (const [key, value] of Object.entries(effects))
    state.sources[source][key] = (state.sources[source][key] || 0) + value;
  return recompute(state);
}
function luckyBreakChance(state) {
  const luck = Math.max(0, Number(state.luck) || 0);
  const modern =
    state.gameplayVersion === 3 && !state.mode?.startsWith("tower");
  return modern ? Math.min(0.5, luck * 0.0025) : Math.min(0.3, luck * 0.015);
}
function mainStat(state) {
  return ["sorceress", "necromancer"].includes(state.classKey)
    ? "ene"
    : ["amazon", "assassin"].includes(state.classKey)
      ? "dex"
      : "str";
}
function createState(
  classKey,
  stake,
  { gameplayVersion = RELEASE.gameplay } = {},
) {
  if (![2, 3].includes(gameplayVersion))
    throw new Error("UNSUPPORTED_HARDCORE_VERSION");
  const state = {
    gameplayVersion,
    releaseVersion: gameplayVersion === 3 ? RELEASE.version : "2.0.1",
    balanceVersion: balance.VERSION,
    balanceProfile: balance.forClass(classKey),
    catalogVersion: 2,
    classKey,
    className: CLASSES[classKey]?.name,
    stake,
    floor: 1,
    cleared: 0,
    sources: { checkpoint: {}, event: {}, absorbed: {} },
    items: [],
    potions: 3,
    escapeTokens: 0,
    pityRare: 0,
    pityLegendary: 0,
    bosses: 0,
    bonus: 0,
    eventPayoutFactor: 1,
    payoutSpent: 0,
    payoutEventSpent: 0,
    modifiers: {},
    rngesusDry: 0,
    rngesusResetFloor: 0,
    rngesusFleeCount: 0,
    lastChaosChance: 0,
    lastChaosSpike: false,
    turn: 0,
    phase: "encounter",
    completed: false,
    finalBossDefeated: false,
    pendingMilestones: [],
    debts: [],
    shopCounts: {},
    shopLast: {},
    echoBands: [],
    runDiamonds: 0,
    lastLog: `Run Sinh tồn ${RELEASE.version} bắt đầu.`,
  };
  if (gameplayVersion === 3) {
    require("../rift").activate(state);
    state.classAwakeningVersion = 1;
    state.classInnateVersion = 1;
    state.classInnateRevision = 2;
    state.statSystemVersion = statsV3.VERSION;
    state.classMasteryVersion = statsV3.MASTERY_VERSION;
    state.statProfile = statsV3.snapshot(
      classKey,
      CLASSES[classKey],
      state.balanceProfile.power,
    );
    state.balanceVersion = statsV3.BALANCE_VERSION;
    state.balanceProfile = { ...state.statProfile.powers };
  }
  state.lastLog = "Run Sinh tồn " + state.releaseVersion + " bắt đầu.";
  if (gameplayVersion === 3) equipmentRules.activate(state);
  recompute(state);
  state.hp = state.maxHp;
  state.mana = state.maxMana;
  if (gameplayVersion === 3)
    state.characterSoul = require("../characters/souls").snapshot(classKey, 0);
  return state;
}
function preview(state, key) {
  const copy = structuredClone(state);
  addSource(copy, { [key]: 5 }, "checkpoint");
  return copy;
}
module.exports = {
  CLASSES,
  ATTRIBUTES,
  clamp,
  derive,
  deriveV2,
  recompute,
  addSource,
  mainStat,
  luckyBreakChance,
  createState,
  preview,
  sumEffects,
};
