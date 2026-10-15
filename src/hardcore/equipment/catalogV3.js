"use strict";
const MATRIX = {
  rusted_edge: ["barbarian"],
  iron_dagger: ["assassin"],
  cracked_wand: ["sorceress", "necromancer"],
  hunter_bow: ["amazon", "assassin"],
  militia_spear: ["amazon", "paladin"],
  bone_club: ["barbarian"],
  dented_plate: ["barbarian", "paladin"],
  wooden_buckler: ["paladin", "necromancer"],
  worn_boots: ["assassin"],
  copper_ring: ["sorceress", "necromancer"],
  minor_life_charm: ["druid", "paladin", "necromancer"],
  rabbit_foot: [],
  red_potion_belt: [],
  scout_lens: ["amazon"],
  mana_fragment: ["sorceress", "necromancer"],
  battle_token: ["barbarian", "paladin"],
  silver_thread: ["assassin", "necromancer"],
  traveler_map: [],
  small_ward: ["druid", "paladin"],
  sharpening_stone: ["barbarian", "amazon"],
  ember_bead: ["sorceress", "necromancer"],
  fox_mask: ["assassin", "amazon"],
  oak_talisman: ["barbarian", "druid"],
  glass_bead: ["assassin"],
  field_bandage: ["druid"],
  iron_nail: ["paladin"],
  hawk_feather: ["amazon"],
  smoke_vial: ["assassin"],
  cold_ash: ["sorceress", "necromancer"],
  goblin_hook: [],
  chest_chalk: [],
  faded_clover: [],
  hunters_fang: ["assassin", "amazon"],
  runed_carapace: ["paladin", "necromancer"],
  heart_of_the_wild: ["druid", "paladin"],
  lucky_coin: [],
  vanguard_spear: ["barbarian", "paladin"],
  shadowstep_boots: ["assassin", "amazon"],
  bone_talisman: ["druid", "necromancer"],
  bloodstone: ["barbarian"],
  rift_compass: [],
  alchemist_belt: ["druid"],
  guardian_seal: ["druid", "paladin"],
  mana_prism: ["sorceress", "necromancer"],
  goblin_snare: [],
  wardens_chain: ["paladin"],
  moonlit_blade: ["sorceress", "necromancer"],
  assassins_ribbon: ["assassin"],
  lionheart_emblem: ["barbarian", "druid"],
  stormglass: ["amazon"],
  saints_ward: ["paladin", "necromancer"],
  riftwalkers_boots: ["assassin"],
  executioners_mark: ["assassin", "amazon", "barbarian"],
  boss_hunters_badge: ["amazon", "barbarian"],
  golden_monocle: ["assassin", "amazon"],
  deep_flask: ["druid"],
  war_drums: ["barbarian", "amazon"],
  spirit_lantern: ["sorceress", "necromancer"],
  steel_lotus: ["assassin", "paladin"],
  fortune_dice: [],
  one_more_hit: [],
  last_bad_decision: ["barbarian", "assassin", "amazon"],
  wardens_bulwark: ["paladin", "barbarian"],
  eye_of_rngesus: [],
  phoenix_blood: ["druid", "necromancer", "sorceress"],
  riftbreaker: ["barbarian", "amazon"],
  living_armor: ["druid", "paladin", "necromancer"],
  mimic_crown: [],
  endless_flask: ["druid"],
  chrono_shard: ["assassin", "amazon"],
  seraphic_aegis: ["paladin", "necromancer"],
  doomwhisper: ["assassin", "amazon", "barbarian"],
  worldroot_seed: ["druid"],
  void_lens: [],
  angelic_engine: ["sorceress", "necromancer"],
  predators_instinct: ["assassin", "amazon"],
  deimoss_scar: ["barbarian"],
  golden_goblet: [],
  astral_mail: [],
  blood_moon_edge: ["sorceress", "barbarian"],
  oracle_mask: [],
  eternal_clover: [],
  titan_heart: ["barbarian", "druid", "paladin"],
  sevenfold_sigil: [],
  glass_cannon: ["barbarian", "amazon", "assassin"],
  schrodingers_armor: ["paladin", "barbarian"],
  goblins_debt: [],
  crown_of_ruin: ["barbarian", "paladin"],
  blood_pact: ["sorceress", "necromancer"],
  void_heart: ["druid", "necromancer"],
  broken_hourglass: ["assassin"],
  mimics_promise: [],
  berserker_chains: ["barbarian"],
  hollow_crown: ["sorceress", "necromancer", "druid"],
  ashen_wings: ["assassin", "amazon"],
  soul_leash: ["necromancer", "sorceress"],
  bleeding_star: ["assassin", "amazon"],
  null_idol: ["paladin", "druid", "necromancer"],
  black_sun: [],
  oathbreaker: ["barbarian", "paladin", "amazon"],
};
// Future mage Venance shares spell-oriented affinity pools, with her own on-hit effect.
for (const classes of Object.values(MATRIX))
  if (classes.includes("sorceress") || classes.includes("necromancer"))
    classes.push("venance");
const CLASSES = [
  "venance",
  "assassin",
  "amazon",
  "barbarian",
  "sorceress",
  "necromancer",
  "druid",
  "paladin",
];
const STRENGTH = { common: 0.01, rare: 0.015, legendary: 0.02, cursed: 0.025 };
function build(current, legacy) {
  const existing = new Map(
      Object.values(current)
        .flat()
        .map((x) => [x.id, x]),
    ),
    byName = new Map(
      Object.values(current)
        .flat()
        .map((x) => [x.name, x]),
    ),
    result = {};
  for (const [rarity, pool] of Object.entries(legacy))
    result[rarity] = pool.map((old) => {
      // A legacy name changed ID; preserve the current ID and all current effects.
      const saved = existing.get(old.id) || byName.get(old.name),
        item = structuredClone(saved || old);
      item.catalogVersion = 3;
      if (!saved) item.passive = null;
      if (!saved && item.effects.attack != null) {
        item.effects.physical = item.effects.attack;
        item.effects.spell = item.effects.attack;
        delete item.effects.attack;
      }
      if (!saved && item.effects.maxEnergy != null) {
        item.effects.maxMana = item.effects.maxEnergy;
        delete item.effects.maxEnergy;
      }
      const classes = MATRIX[old.id];
      item.affinity = {
        type: classes.length ? "class" : "universal",
        classes: [...classes],
      };
      item.affinityEffect = {
        version: 1,
        effects: Object.fromEntries(
          classes.map((k) => [k, { kind: k, amount: STRENGTH[rarity] }]),
        ),
      };
      item.receipt = {
        version: 1,
        onDuplicate: Boolean(
          item.effects.heal ||
          item.effects.potions ||
          item.effects.escapeTokens,
        ),
      };
      return item;
    });
  validate(result);
  return result;
}
function validate(items) {
  const counts = { common: 32, rare: 28, legendary: 24, cursed: 16 },
    ids = new Set();
  for (const [rarity, count] of Object.entries(counts)) {
    if (items[rarity]?.length !== count)
      throw Error("INVALID_V3_CATALOG_COUNT");
    for (const item of items[rarity]) {
      if (ids.has(item.id)) throw Error("DUPLICATE_V3_ITEM");
      if (
        item.rarity !== rarity ||
        item.catalogVersion !== 3 ||
        !Object.keys(item.effects || {}).length ||
        (rarity === "cursed" && !Object.keys(item.curse?.effects || {}).length)
      )
        throw Error("INVALID_V3_ITEM");
      for (const value of Object.values({
        ...item.effects,
        ...item.curse?.effects,
      }))
        if (!Number.isFinite(value)) throw Error("INVALID_V3_ITEM_EFFECT");
      if (item.passive) require("../itemPassives").validate(item.passive);
      ids.add(item.id);
      if (
        item.affinity.type !== "universal" &&
        (!item.affinity.classes.length ||
          item.affinity.classes.filter((k) => k !== "venance").length > 3 ||
          new Set(item.affinity.classes).size !==
            item.affinity.classes.length ||
          item.affinity.classes.some((k) => !CLASSES.includes(k)))
      )
        throw Error("INVALID_ITEM_AFFINITY");
      if (
        item.affinityEffect.version !== 1 ||
        item.affinity.classes.some(
          (k) => item.affinityEffect.effects[k]?.kind !== k,
        )
      )
        throw Error("INVALID_AFFINITY_EFFECT");
    }
    if (items[rarity].filter((x) => x.affinity.type === "universal").length < 3)
      throw Error("MISSING_UNIVERSAL_POOL");
    for (const k of CLASSES)
      if (
        items[rarity].filter((x) => x.affinity.classes.includes(k)).length < 3
      )
        throw Error("MISSING_CLASS_POOL");
    for (const k of CLASSES)
      if (
        items[rarity].filter(
          (x) => x.affinity.type === "class" && !x.affinity.classes.includes(k),
        ).length < 3
      )
        throw Error("MISSING_OFF_CLASS_POOL");
  }
  return true;
}
module.exports = { build, validate, MATRIX, CLASSES };
