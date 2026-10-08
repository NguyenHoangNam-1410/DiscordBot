"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { bosses, gilded, itemPassives, monsterLoot, E, passiveIcon, world } =
    dependencies;
  const payout = (...args) => dependencies.payout(...args);
  const alive = (...args) => dependencies.alive(...args);

  function prepareItemCombat(state, rng) {
    const e = state.encounter;
    if (e?.type !== "combat") return;
    gilded.prepareCombat(state, payout(state));
    monsterLoot.prepare(state, e);
    state.passiveCombatFloor = state.floor;
    if (e.passiveCombatStarted) return;
    e.passiveCombatStarted = true;
    if (alive(state) && state.combatManaLoss > 0) {
      const before = state.mana;
      state.mana = Math.max(0, state.mana - state.combatManaLoss);
      state.lastLog =
        (state.lastLog || "") +
        `\n${E.mana} Soul Leash: ${before} → ${state.mana} MP cho bạn.`;
    }
    const p = itemPassives.aggregate(state);
    if (
      alive(state) &&
      state.mana < state.maxMana &&
      p.startMana > 0 &&
      rng() < p.startMana
    ) {
      const before = state.mana;
      state.mana = Math.min(state.maxMana, state.mana + 1);
      state.lastLog =
        (state.lastLog || "") +
        "\n" +
        passiveIcon("startMana") +
        " Khởi động MP: " +
        before +
        " → " +
        state.mana +
        " MP cho bạn.";
    }
  }

  function passiveTrapDamage(state, amount) {
    return Math.max(
      1,
      Math.floor(amount * (1 - itemPassives.aggregate(state).trapResistance)),
    );
  }

  function passiveCounter(state, rng, actual, defend, naturalMiss) {
    if (!alive(state) || state.encounter.hp <= 0) return "";
    const p = itemPassives.aggregate(state),
      e = state.encounter;
    const basic = ["sorceress", "necromancer"].includes(state.classKey)
      ? (state.spellMin + state.spellMax) / 2
      : (state.damageMin + state.damageMax) / 2;
    const budget = Math.floor(basic * 0.5);
    let raw = actual * (p.thorns + (defend ? p.guardReflect : 0));
    const triggered = [];
    if (actual > 0 && p.thorns > 0)
      triggered.push(`${passiveIcon("thorns")} **Gai**`);
    if (actual > 0 && defend && p.guardReflect > 0)
      triggered.push(`${passiveIcon("guardReflect")} **Phản đòn**`);
    if (naturalMiss && p.dodgeCounter > 0 && rng() < p.dodgeCounter) {
      raw += basic * 0.5;
      triggered.push(`${passiveIcon("dodgeCounter")} **Né phản kích**`);
    }
    if (raw <= 0) return "";
    let damage = Math.floor(
      raw * (1 - world.defenseReduction(e.defense, state.floor)),
    );
    if (
      e.mechanic === "riftwalker" &&
      (state.passiveImmunityThisTurn ?? e.combatTurn % 3 === 0)
    )
      damage = 0;
    if (!bosses.on(e) && e.mechanic === "deimoss")
      damage = Math.floor(damage * 0.75);
    damage = Math.floor(damage * bosses.playerFactor(state, false, true));
    damage = Math.min(
      Math.max(0, budget - (state.passiveCounterUsed || 0)),
      damage,
      Math.max(0, e.hp - bosses.floorHp(state)),
    );
    if (damage <= 0) return "";
    state.passiveCounterUsed = (state.passiveCounterUsed || 0) + damage;
    e.hp -= damage;
    bosses.hit(state, damage, true);
    return (
      "\n" +
      triggered.join(" + ") +
      ": phản " +
      E.attack +
      " **DMG vật lý** " +
      damage +
      " lên " +
      e.name +
      "."
    );
  }
  return { prepareItemCombat, passiveTrapDamage, passiveCounter };
};
