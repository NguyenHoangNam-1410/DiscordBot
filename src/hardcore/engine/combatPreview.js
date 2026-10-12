"use strict";
const awakening = require("../awakening");
const rift = require("../rift");
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
      (!rift.enabled(state) && e.hp < e.maxHp * 0.5
        ? 1 + world.effectiveStacks(state.modifiers.bloodlust || 0) * 0.06
        : 1) *
      (!bosses.on(e) && e.mechanic === "butcher"
        ? 1 + Math.min(5, e.frenzy + 1) * 0.08
        : 1);
    const plan = rift.counter(state, bosses.counter(state));
    if (plan.skip) return { low: 0, high: 0, chance: 0 };
    const shield = awakening.active(state)
      ? Math.min(
          state.classAwakening.bark || 0,
          Math.floor(state.maxHp * 0.2),
        ) + (awakening.combat(state)?.barrier || 0)
      : 0;
    const afterShield = (n) => Math.max(0, n - shield);
    if (plan.trueDamage)
      return {
        low: afterShield(plan.raw),
        high: afterShield(plan.raw),
        chance: 1,
        trueDamage: true,
      };
    const low = attackDamage(e, state, state, () => 0, {
      magic: plan.magic,
      multiplier:
        (plan.raw != null ? 1 : factor) *
        plan.multiplier *
        rift.counterFactor(state, plan, false),
      critical: false,
      raw: plan.raw ?? e.damageMin,
    }).damage;
    const high = attackDamage(e, state, state, () => 0, {
      magic: plan.magic,
      multiplier:
        (plan.raw != null ? 1 : factor) *
        plan.multiplier *
        rift.counterFactor(state, plan, false),
      critical: false,
      raw: plan.raw ?? e.damageMax,
    }).damage;
    return {
      low: afterShield(low),
      high: afterShield(high),
      chance: plan.magic
        ? 1
        : rift.hitChance(
            state,
            world.hitChance(
              e.accuracy,
              state.evasion,
              state.evasionCap ?? 0.45,
            ),
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
    if (bosses.brainControl(state) || royal.freeMagic(state)) return 0;
    if (awakening.empowered(state)) return 1;
    const free = state.classKey === "sorceress" && shrineActive(state);
    return bosses.skillCost(
      state,
      paradox.manaCost(state, free) + (free ? 0 : state.skillManaExtra || 0),
    );
  }

  function skillHpCost(state) {
    const curse = state.skillHpCost
      ? Math.max(1, Math.floor(state.maxHp * state.skillHpCost))
      : 0;
    return paradox.hpCost(state) + curse + bosses.skillHpCost(state);
  }

  function outgoingDamagePreview(state, action) {
    const e = state.encounter;
    const skill = action === "skill";
    const magic =
      skill && ["sorceress", "necromancer"].includes(state.classKey);
    const multiplier =
      (skill
        ? {
            amazon: 0.85,
            barbarian: 1.65,
            assassin: 1.3,
            sorceress: 2.1,
            druid: 1.35,
            necromancer: 1.55,
            paladin: 1.4,
          }[state.classKey]
        : 1) *
      (skill && state.classKey === "barbarian"
        ? 1 + 0.15 * awakening.fury(state)
        : 1);
    const shots = skill && state.classKey === "amazon" ? 2 : 1;
    const range = magic
      ? [state.spellMin, state.spellMax]
      : physicalRange(state);
    const bonus = ["boss", "final_boss"].includes(e.rank)
      ? state.bossDamage
      : e.rank === "elite"
        ? state.eliteDamage
        : 0;

    if (rift.enabled(state)) {
      const forecast = (raw) => {
        const copy = structuredClone(state),
          target = copy.encounter;
        bosses.beginAction(copy, action);
        rift.beginAction(copy, action);
        if (skill && bosses.brainControl(copy))
          return Math.floor(target.maxHp * 0.2);
        if (
          bosses.on(target)
            ? bosses.vanished(copy)
            : target.mechanic === "riftwalker" && target.combatTurn % 3 === 0
        )
          return 0;
        if (skill && skillHpCost(copy))
          copy.hp = Math.max(1, copy.hp - skillHpCost(copy));
        const factor = paradox.active(copy) ? 1 : 1 + bonus;
        const rolls = Array.from({ length: shots }, () => multiplier);
        if (
          skill &&
          copy.classKey === "amazon" &&
          copy.classAwakening?.focus === 2
        )
          rolls.push(0.7);
        let dealt = 0,
          strength = 0;
        const hits = [];
        for (const m of rolls) {
          const h = attackDamage(copy, target, copy, () => 0, {
            player: true,
            magic,
            raw,
            multiplier: m,
            critical: false,
          });
          let n = Math.floor(h.damage * factor);
          if (
            !bosses.on(target) &&
            !paradox.active(copy) &&
            target.mechanic === "deimoss" &&
            n > 0
          )
            n = Math.max(1, Math.floor(n * 0.75));
          strength += bosses.damageStrength(copy, n);
          const actual = bosses.applyDamage(copy, n);
          dealt += actual;
          hits.push(h);
        }
        const main = dealt,
          a = copy.classAwakening;
        if (awakening.active(copy)) {
          const extra = (amount) => {
            if (target.hp > 0) {
              strength += bosses.damageStrength(copy, Math.floor(amount));
              dealt += bosses.applyDamage(copy, Math.floor(amount));
            }
          };
          if (skill && copy.classKey === "sorceress" && a.echo)
            extra(main * 0.5);
          if (skill && copy.classKey === "necromancer" && a.totems === 2)
            extra(main * 0.6);
          if (
            copy.classKey === "paladin" &&
            awakening.ground(copy) &&
            main > 0
          ) {
            for (const h of hits.filter((h) => h.hit && h.damage > 0)) {
              const holy =
                Math.max(
                  copy.defense * 0.25 * rift.outgoing(copy),
                  h.preCritDamage * factor * 0.15,
                ) *
                (1 -
                  world.defenseReduction(
                    rift.enemyDefense(copy, target.defense),
                    copy.floor,
                  ));
              extra(holy);
            }
          }
        }
        return strength;
      };
      return {
        low: forecast(range[0]),
        high: forecast(range[1]),
        magic,
        shots,
        extraShot:
          skill && state.classKey === "amazon" && Boolean(shrineActive(state)),
      };
    }
    const extraDamage = (copy, hit, total, raw) => {
      if (!awakening.active(copy) || !hit.hit || total <= 0) return total;
      const a = copy.classAwakening;
      if (skill && copy.classKey === "amazon" && a.focus === 2) {
        const focus = attackDamage(copy, copy.encounter, copy, () => 0, {
          player: true,
          raw,
          multiplier: 0.7,
          critical: false,
        });
        total = Math.floor(
          (hit.damage * 2 + focus.damage) *
            (paradox.active(copy) ? 1 : 1 + bonus),
        );
        if (
          !bosses.on(copy.encounter) &&
          !paradox.active(copy) &&
          copy.encounter.mechanic === "deimoss"
        )
          total = Math.max(1, Math.floor(total * 0.75));
      }
      if (skill && copy.classKey === "sorceress" && a.echo)
        total += Math.floor(total * 0.5);
      if (skill && copy.classKey === "necromancer" && a.totems === 2)
        total += Math.floor(total * 0.6);
      if (copy.classKey === "paladin" && awakening.ground(copy))
        total += Math.floor(
          Math.max(
            copy.defense * 0.25,
            hit.preCritDamage * (paradox.active(copy) ? 1 : 1 + bonus) * 0.15,
          ) *
            (1 - world.defenseReduction(e.defense, copy.floor)),
        );
      return total;
    };
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
        let total = 0,
          lastHit;
        for (let shot = 0; shot < shots; shot++) {
          const h = attackDamage(copy, copy.encounter, copy, () => 0, {
            player: true,
            magic,
            raw,
            multiplier,
            critical: false,
          });
          total += h.damage;
          lastHit = h;
        }
        return bosses.damageStrength(
          copy,
          extraDamage(
            copy,
            lastHit,
            Math.floor(total * (paradox.active(copy) ? 1 : 1 + bonus)),
            raw,
          ),
        );
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
      return n > 0 ? extraDamage(previewState, hit, n, raw) : n;
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
