"use strict";
const stats = require("../src/services/hardcoreStats");
const world = require("../src/services/hardcoreWorld");
const v2 = require("../src/services/hardcoreV2");

// Survival objective. No fairness seed, pre-rolled loot or hidden event outcome
// participates in a decision. Parameters are selected on a separate pilot seed.
function utility(s, build) {
  const caster = ["sorceress", "necromancer"].includes(s.classKey);
  const power = caster
    ? (s.spellMin + s.spellMax) / 2
    : (s.damageMin + s.damageMax) / 2;
  const regen = Math.max(1, Math.floor(s.maxMana * (caster ? 0.7 : 0.4)));
  const protectedClass = ["assassin", "necromancer"].includes(s.classKey);
  return (
    Math.log(Math.max(1, power)) * (build === "power" ? 1.6 : 1) +
    Math.log(s.maxHp) * (build === "guard" ? 1.5 : 1) -
    Math.log(Math.max(0.3, 1 - s.resistance / 100)) -
    Math.log(1 - world.defenseReduction(s.defense, s.floor)) * 0.5 +
    Math.log(1 + regen / 2) * (protectedClass ? 1.4 : 0.5) +
    (s.bossDamage || 0) * 0.8 +
    (s.eliteDamage || 0) * 0.4
  );
}
function choose(s, build = "balanced") {
  const options = v2.actions(s).filter((a) => !a.disabled);
  const has = (a) => options.some((o) => o.action === a);
  const bestStat = (keys, amount) =>
    keys
      .map((key) => {
        const copy = structuredClone(s);
        stats.addSource(copy, { [key]: amount });
        return { key, score: utility(copy, build) };
      })
      .sort((a, b) => b.score - a.score)[0].key;
  if (s.phase === "summit") return "retreat";
  if (s.phase === "upgrade") {
    // Cross mana regeneration breakpoints deliberately; greedy +5 valuation
    // otherwise cannot see the several upgrades needed to reach the next tier.
    const target = build === "mana" ? 5 : 3;
    if (s.maxMana < target && s.cleared % 10 !== 0) return "upgrade_ene";
    return `upgrade_${bestStat([stats.mainStat(s), "vit", "ene"], 5)}`;
  }
  if (s.phase === "paradox") return "paradox_blood";
  if (s.phase === "severance")
    return (
      [
        "soul_drain",
        "cursed_ground",
        "fortified",
        "elemental_dominion",
        "bloodlust",
        "stone_skin",
        "swift_horror",
      ]
        .map((k) => `sever_${k}`)
        .find(has) || options[0].action
    );
  const e = s.encounter;
  if (e.type === "combat") {
    const p = v2.incomingPreview(s);
    const worst =
      p.high * (e.nextDamageType === "magic" ? 1 : e.critDamage || 1.5);
    const immune = e.mechanic === "riftwalker" && e.combatTurn % 3 === 0;
    const protectedSkill =
      has("skill") && ["assassin", "necromancer"].includes(s.classKey);
    const damage =
      ((s.damageMin + s.damageMax) / 2) *
      world.hitChance(s.accuracy, e.evasion) *
      (1 - world.defenseReduction(e.defense, s.floor));
    if (protectedSkill && (!immune || s.hp <= worst)) return "skill";
    if (
      has("potion") &&
      s.hp < Math.max(worst * 2, s.maxHp * (s.potions >= 4 ? 0.65 : 0.4)) &&
      s.maxHp - s.hp >= Math.max(20, s.maxHp * s.potionRate) * 0.65 &&
      !(s.classKey === "druid" && has("skill") && s.hp > worst)
    )
      return "potion";
    if (immune) return "attack";
    if (has("skill") && (e.hp > damage * 0.7 || s.classKey === "druid"))
      return "skill";
    if (
      s.mana === 1 &&
      !e.drainCharges &&
      ["necromancer", "assassin", "paladin"].includes(s.classKey) &&
      e.hp > damage * 2 &&
      s.hp > worst
    )
      return "defend";
    return "attack";
  }
  if (e.type === "chest")
    return e.revealed ? "leave" : e.inspected ? "open" : "inspect";
  if (e.type === "shrine") return "skip";
  if (e.type === "rngesus") return s.escapeTokens ? "flee" : "bribe";
  if (e.type === "echo") return "echo_pray";
  if (e.type !== "surprise") return options[0].action;
  if (e.kind === "treasure_room") {
    const preferred = s.resistance < 50 && s.floor > 40 ? "blue" : "red";
    if (!e.inspected) return `inspect_${preferred}`;
    // Only the inspected chest's result is public (lastLog).
    const revealedMimic = s.lastLog.includes("Mimic!");
    return `chest_${revealedMimic ? (e.inspected === "red" ? "blue" : "red") : e.inspected}`;
  }
  if (e.kind === "diamond_shop") return "event_skip";
  if (e.kind === "duelist") return e.mode ? "hand_0" : "event_skip";
  if (e.kind === "horadric") {
    const choices = [
      { action: "forge_main", key: stats.mainStat(s), n: 6 },
      { action: "forge_guard", key: e.forgeStat, n: 7 },
      { action: "forge_vit", key: "vit", n: 4 },
    ];
    return choices
      .map((o) => {
        const c = structuredClone(s);
        stats.addSource(c, { [o.key]: o.n });
        return { ...o, score: utility(c, build) };
      })
      .sort((a, b) => b.score - a.score)[0].action;
  }
  if (e.kind === "mirror")
    return bestStat([stats.mainStat(s), "vit"], 8) === "vit"
      ? "event_mirror_guard"
      : "event_mirror_power";
  if (["payout_shop", "blood_shop", "merchant"].includes(e.kind)) {
    const base = utility(s, build);
    const offers = options
      .filter((a) => a.action.startsWith("buy_"))
      .map((a) => {
        const offer = e.offers[Number(a.action.slice(4))];
        let score = -Infinity;
        if (e.kind === "merchant") {
          // Merchant SR identity is hidden until bought.
          score =
            offer.key === "heal"
              ? (s.maxHp - s.hp) / s.maxHp
              : offer.key === "potion"
                ? (5 - s.potions) * 0.08
                : offer.key === "item"
                  ? 0.14
                  : offer.key === "luck"
                    ? 0.04
                    : 0.01;
        } else if (
          e.kind !== "blood_shop" ||
          Math.min(s.hp, s.maxHp - offer.price) > s.maxHp * 0.5
        ) {
          const c = structuredClone(s);
          if (e.kind === "blood_shop")
            stats.addSource(c, { maxHp: -offer.price });
          v2.receiveItem(c, offer.item);
          score = utility(c, build) - base;
        }
        return { action: a.action, score };
      })
      .sort((a, b) => b.score - a.score);
    return offers[0]?.score > 0 ? offers[0].action : "event_skip";
  }
  if (e.kind === "purifier" && v2.payout(s) < v2.purifierCost(s))
    return "event_skip";
  if (e.kind === "purifier")
    return has("event_cleanse")
      ? "event_cleanse"
      : options.find((a) => a.action.startsWith("purifier_select_"))?.action ||
          "event_skip";
  const decisions = {
    healer: "event_heal",
    goblin: "event_catch",
    blacksmith: "event_smith",
    purifier: "event_cleanse",
    sacrifice: "event_sacrifice_payout",
    adventurer: "event_rob",
    contract: "contract_defend",
    class_shrine: "event_class",
    doors: s.hp < s.maxHp * 0.8 ? "door_light" : "event_skip",
  };
  return has(decisions[e.kind]) ? decisions[e.kind] : "event_skip";
}
module.exports = { choose, utility };
