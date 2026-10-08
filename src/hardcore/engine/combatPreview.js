"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { bosses, royal, paradox, world } = dependencies;
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
      (!bosses.on(e) && e.mechanic === "butcher"
        ? 1 + Math.min(5, e.frenzy + 1) * 0.08
        : 1);
    const plan = bosses.counter(state);
    if (plan.skip) return { low: 0, high: 0, chance: 0 };
    if (plan.trueDamage)
      return { low: plan.raw, high: plan.raw, chance: 1, trueDamage: true };
    const low = attackDamage(e, state, state, () => 0, {
      magic: plan.magic,
      multiplier: (plan.raw != null ? 1 : factor) * plan.multiplier,
      critical: false,
      raw: plan.raw ?? e.damageMin,
    }).damage;
    const high = attackDamage(e, state, state, () => 0, {
      magic: plan.magic,
      multiplier: (plan.raw != null ? 1 : factor) * plan.multiplier,
      critical: false,
      raw: plan.raw ?? e.damageMax,
    }).damage;
    return {
      low,
      high,
      chance: plan.magic
        ? 1
        : world.hitChance(e.accuracy, state.evasion, state.evasionCap ?? 0.45),
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
    if (bosses.brainControl(state) || royal.freeMagic(state)) return 0;
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
      if (bosses.on(e)) {
        const copy = {
          ...state,
          encounter: { ...e, boss: structuredClone(e.boss) },
        };
        bosses.beginAction(copy, action);
        if (skill && skillHpCost(copy))
          copy.hp = Math.max(1, copy.hp - skillHpCost(copy));
        if (skill && bosses.brainControl(copy))
          return Math.floor(e.maxHp * 0.2);
        let total = 0;
        for (let shot = 0; shot < shots; shot++) {
          const h = attackDamage(copy, copy.encounter, copy, () => 0, {
            player: true,
            magic,
            raw,
            multiplier,
            critical: false,
          });
          total += h.damage;
        }
        return Math.floor(total * (paradox.active(copy) ? 1 : 1 + bonus));
      }
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
