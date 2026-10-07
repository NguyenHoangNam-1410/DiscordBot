"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { paradox, world } = dependencies;
  const shrineActive = (...args) => dependencies.shrineActive(...args);
  const physicalRange = (...args) => dependencies.physicalRange(...args);
  const attackDamage = (...args) => dependencies.attackDamage(...args);

  function incomingPreview(state) {
    const e = state.encounter;
    if (e.type !== "combat") return null;
    const factor =
      (e.hp < e.maxHp * 0.5
        ? 1 + world.effectiveStacks(state.modifiers.bloodlust || 0) * 0.06
        : 1) *
      (e.mechanic === "butcher" ? 1 + Math.min(5, e.frenzy + 1) * 0.08 : 1);
    const low = attackDamage(e, state, state, () => 0, {
      magic: e.nextDamageType === "magic",
      multiplier: factor,
      critical: false,
      raw: e.damageMin,
    }).damage;
    const high = attackDamage(e, state, state, () => 0, {
      magic: e.nextDamageType === "magic",
      multiplier: factor,
      critical: false,
      raw: e.damageMax,
    }).damage;
    return {
      low,
      high,
      chance:
        e.nextDamageType === "magic"
          ? 1
          : world.hitChance(
              e.accuracy,
              state.evasion,
              state.evasionCap ?? 0.45,
            ),
    };
  }

  function attackManaGain(state) {
    if (paradox.is(state, "mana_fracture")) return 0;
    return Math.max(
      0,
      Math.max(
        1,
        Math.floor(
          state.maxMana *
            (["sorceress", "necromancer"].includes(state.classKey) ? 0.7 : 0.4),
        ),
      ) - (state.attackManaLoss || 0),
    );
  }

  function skillManaCost(state) {
    const free = state.classKey === "sorceress" && shrineActive(state);
    return (
      paradox.manaCost(state, free) + (free ? 0 : state.skillManaExtra || 0)
    );
  }

  function skillHpCost(state) {
    const curse = state.skillHpCost
      ? Math.max(1, Math.floor(state.maxHp * state.skillHpCost))
      : 0;
    return paradox.hpCost(state) + curse;
  }

  function outgoingDamagePreview(state, action) {
    const e = state.encounter;
    const skill = action === "skill";
    const magic =
      skill && ["sorceress", "necromancer"].includes(state.classKey);
    const multiplier = skill
      ? {
          amazon: 0.85,
          barbarian: 1.65,
          assassin: 1.3,
          sorceress: 2.1,
          druid: 1.35,
          necromancer: 1.55,
          paladin: 1.4,
        }[state.classKey]
      : 1;
    const shots = skill && state.classKey === "amazon" ? 2 : 1;
    const range = magic
      ? [state.spellMin, state.spellMax]
      : physicalRange(state);
    const bonus = ["boss", "final_boss"].includes(e.rank)
      ? state.bossDamage
      : e.rank === "elite"
        ? state.eliteDamage
        : 0;
    const damage = (raw) => {
      const previewState =
        skill && skillHpCost(state)
          ? { ...state, hp: Math.max(1, state.hp - skillHpCost(state)) }
          : state;
      const hit = attackDamage(previewState, e, previewState, () => 0, {
        player: true,
        magic,
        raw,
        multiplier,
        critical: false,
      });
      let n = Math.floor(
        hit.damage * shots * (paradox.active(state) ? 1 : 1 + bonus),
      );
      if (e.mechanic === "riftwalker" && e.combatTurn % 3 === 0) n = 0;
      if (!paradox.active(state) && e.mechanic === "deimoss" && n > 0)
        n = Math.max(1, Math.floor(n * 0.75));
      return n;
    };
    return {
      low: damage(range[0]),
      high: damage(range[1]),
      magic,
      shots,
      extraShot:
        skill && state.classKey === "amazon" && Boolean(shrineActive(state)),
    };
  }

  function skillDamagePreview(state) {
    return outgoingDamagePreview(state, "skill");
  }

  function attackDamagePreview(state) {
    return outgoingDamagePreview(state, "attack");
  }
  return {
    incomingPreview,
    attackManaGain,
    skillManaCost,
    skillHpCost,
    outgoingDamagePreview,
    skillDamagePreview,
    attackDamagePreview,
  };
};
