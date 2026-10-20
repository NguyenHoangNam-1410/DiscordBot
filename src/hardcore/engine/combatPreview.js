"use strict";
const awakening = require("../awakening");
const rift = require("../rift");
const souls = require("../characters/souls");
const venance = require("../characters/venance");
const innate = require("../innate");
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
    if (plan.skip)
      return { low: 0, high: 0, chance: 0, critChance: 0, skip: true };
    const shield = awakening.active(state)
      ? Math.min(
          state.classAwakening.bark || 0,
          Math.floor(state.maxHp * awakening.tuning(state).barkCap),
        ) + (awakening.combat(state)?.barrier || 0)
      : 0;
    const afterShield = (n) => {
      const remaining = Math.max(
        0,
        n -
          shield -
          (souls.frame(state)?.guardBarrier || 0) -
          (venance.frame(state)?.barrier || 0),
      );
      return (
        remaining -
        innate.manaShieldAmount(
          state,
          remaining,
          innate.rebalanced(state) ? 0 : skillManaCost(state),
          innate.rebalanced(state) && plan.raw != null,
        )
      );
    };
    const trueAmount = (n) => (innate.enabled(state) ? n : afterShield(n));
    if (plan.trueDamage)
      return {
        low: trueAmount(
          Math.floor(
            plan.raw * require("../events/explorationMarks").incoming(state, e),
          ),
        ),
        high: trueAmount(
          Math.floor(
            plan.raw * require("../events/explorationMarks").incoming(state, e),
          ),
        ),
        chance: 1,
        trueDamage: true,
        critChance: 0,
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
      magic: Boolean(plan.magic),
      critChance:
        plan.magic || innate.combat(state)?.titan
          ? 0
          : plan.critical == null
            ? e.critChance || 0
            : plan.critical
              ? 1
              : 0,
      chance:
        (plan.magic
          ? 1
          : rift.hitChance(
              state,
              world.hitChance(
                e.accuracy,
                state.evasion,
                state.evasionCap ?? 0.45,
              ),
            )) *
        (1 - innate.avoidChance(state)),
    };
  }

  function attackManaGain(state) {
    if (venance.empowered(state) || venance.blockedMana(state)) return 0;
    if (paradox.is(state, "mana_fracture")) return 0;
    if (venance.enabled(state))
      return Math.max(0, 1 - (state.attackManaLoss || 0));
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
    if (
      (!venance.enabled(state) && bosses.brainControl(state)) ||
      royal.freeMagic(state)
    )
      return 0;
    if (awakening.empowered(state)) return 1;
    const free =
      ["sorceress", "venance"].includes(state.classKey) && shrineActive(state);
    return require("../characters/rhakor").adjustCost(
      state,
      bosses.skillCost(
        state,
        paradox.manaCost(state, free) + (free ? 0 : state.skillManaExtra || 0),
      ),
    );
  }

  function skillHpCost(state) {
    const curse = state.skillHpCost
      ? Math.max(1, Math.floor(state.maxHp * state.skillHpCost))
      : 0;
    return paradox.hpCost(state) + curse + bosses.skillHpCost(state);
  }

  function outgoingDamagePreview(state, action) {
    if (venance.enabled(state)) {
      if (action === "skill")
        return { low: 0, high: 0, magic: false, preparation: true };
      const forecast = (raw) => {
        const copy = structuredClone(state);
        dependencies.prepareItemCombat(copy, () => 1);
        innate.begin(copy, action);
        venance.begin(copy, action);
        bosses.beginAction(copy, action);
        rift.beginAction(copy, action);
        const target = copy.encounter;
        if (
          bosses.on(target)
            ? bosses.vanished(copy)
            : target.mechanic === "riftwalker" && target.combatTurn % 3 === 0
        )
          return 0;
        const before = venance.target(copy);
        const magic = venance.empowered(copy);
        const h = attackDamage(copy, target, copy, () => 0, {
          player: true,
          raw,
          magic,
          critical: false,
          multiplier: magic ? venance.multiplier(copy) : 1,
        });
        const rankBonus = ["boss", "final_boss"].includes(target.rank)
          ? copy.bossDamage
          : target.rank === "elite"
            ? copy.eliteDamage
            : 0;
        let amount = Math.floor(
          h.damage * (paradox.active(copy) ? 1 : 1 + rankBonus),
        );
        if (
          !bosses.on(target) &&
          !paradox.active(copy) &&
          target.mechanic === "deimoss" &&
          amount > 0
        )
          amount = Math.max(1, Math.floor(amount * 0.75));
        const strength = bosses.damageStrength(copy, amount);
        const dealt = bosses.applyDamage(copy, amount);
        const proc = venance.afterHit(copy, dealt, strength, before, (n) =>
          bosses.applyDamage(copy, n),
        );
        return strength + proc.strength;
      };
      const range = venance.empowered(state)
        ? [state.spellMin, state.spellMax]
        : physicalRange(state);
      return {
        low: forecast(range[0]),
        high: forecast(range[1]),
        magic: venance.empowered(state),
        shots: 1,
      };
    }
    const originalInnate = innate.multiplier(state, action);
    if (souls.has(state, 1)) {
      state = structuredClone(state);
      awakening.prepare(state);
      innate.prepare(state);
      souls.prepare(state);
      innate.begin(state, action);
      souls.begin(state, action);
      souls.frame(state).previewAction = true;
    }
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
            rha_kor: 1,
          }[state.classKey]
        : 1) *
      (skill && state.classKey === "barbarian"
        ? (1 + souls.furyRate(state) * awakening.fury(state)) *
          souls.furyFinisher(state, awakening.fury(state))
        : 1) *
      (skill && state.classKey === "amazon"
        ? souls.focusMain(state, state.classAwakening?.focus === 2)
        : 1) *
      (skill && state.classKey === "sorceress" ? souls.echoMain(state) : 1);
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
      const forecast = (raw, echoExtra = false) => {
        const copy = structuredClone(state),
          target = copy.encounter;
        bosses.beginAction(copy, action);
        rift.beginAction(copy, action);
        const rha = require("../characters/rhakor");
        if (rha.enabled(copy)) rha.begin(copy, action);
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
        const rolls = Array.from({ length: shots }, () =>
          rha.enabled(copy) ? multiplier * rha.turnMultiplier(copy) : multiplier,
        );
        if (
          skill &&
          copy.classKey === "amazon" &&
          copy.classAwakening?.focus === 2
        )
          rolls.push(souls.focusRate(state));
        let dealt = 0,
          strength = 0;
        const hits = [];
        for (const m of rolls) {
          const h = attackDamage(copy, target, copy, () => 0, {
            player: true,
            magic,
            raw,
            multiplier: m,
            innateMultiplier: originalInnate,
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
        const main = innate.enabled(copy) ? strength : dealt,
          a = copy.classAwakening;
        if (awakening.active(copy)) {
          const extra = (amount) => {
            if (target.hp > 0) {
              strength += bosses.damageStrength(copy, Math.floor(amount));
              dealt += bosses.applyDamage(copy, Math.floor(amount));
            }
          };
          if (skill && copy.classKey === "sorceress" && a.echo) {
            const echo = Math.floor(main * awakening.tuning(copy).echo);
            extra(echo);
            if (echoExtra && innate.rebalanced(copy)) extra(echo);
          }
          if (
            skill &&
            copy.classKey === "necromancer" &&
            a.totems === awakening.tuning(copy).totems - 1
          )
            extra(main * awakening.tuning(copy).nova * souls.novaFactor(copy));
          if (
            copy.classKey === "paladin" &&
            awakening.ground(copy) &&
            main > 0
          ) {
            for (const h of hits.filter((h) => h.hit && h.damage > 0)) {
              const holy = dependencies.holyDamage(
                copy,
                target,
                h.preCritDamage * factor,
                action,
              );
              extra(holy);
            }
          }
        }
        return strength;
      };
      return {
        low: forecast(range[0]),
        high: forecast(range[1], true),
        magic,
        shots,
        extraShot:
          skill && state.classKey === "amazon" && Boolean(shrineActive(state)),
      };
    }
    const extraDamage = (copy, hit, total, raw, echoExtra = false) => {
      if (!awakening.active(copy) || !hit.hit || total <= 0) return total;
      const a = copy.classAwakening;
      if (skill && copy.classKey === "amazon" && a.focus === 2) {
        const focus = attackDamage(copy, copy.encounter, copy, () => 0, {
          player: true,
          raw,
          multiplier: souls.focusRate(state),
          innateMultiplier: originalInnate,
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
        total +=
          Math.floor(total * awakening.tuning(copy).echo) *
          (echoExtra && innate.rebalanced(copy) ? 2 : 1);
      if (
        skill &&
        copy.classKey === "necromancer" &&
        a.totems === awakening.tuning(copy).totems - 1
      )
        total += Math.floor(
          total * awakening.tuning(copy).nova * souls.novaFactor(copy),
        );
      if (copy.classKey === "paladin" && awakening.ground(copy))
        total += Math.floor(
          dependencies.holyDamage(
            copy,
            e,
            hit.preCritDamage * (paradox.active(copy) ? 1 : 1 + bonus),
            action,
          ),
        );
      return total;
    };
    const damage = (raw, echoExtra = false) => {
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
            innateMultiplier: originalInnate,
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
            echoExtra,
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
        innateMultiplier: originalInnate,
        critical: false,
      });
      let n = Math.floor(
        hit.damage * shots * (paradox.active(state) ? 1 : 1 + bonus),
      );
      if (e.mechanic === "riftwalker" && e.combatTurn % 3 === 0) n = 0;
      if (!paradox.active(state) && e.mechanic === "deimoss" && n > 0)
        n = Math.max(1, Math.floor(n * 0.75));
      return n > 0 ? extraDamage(previewState, hit, n, raw, echoExtra) : n;
    };
    return {
      low: damage(range[0]),
      high: damage(range[1], true),
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
