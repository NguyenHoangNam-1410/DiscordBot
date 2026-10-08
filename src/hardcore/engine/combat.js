"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    gilded,
    bosses,
    royal,
    stats,
    itemPassives,
    paradox,
    E,
    SKILL_ICONS,
    passiveIcon,
    world,
    clamp,
    int,
  } = dependencies;
  const heal = (...args) => dependencies.heal(...args);
  const hurt = (...args) => dependencies.hurt(...args);
  const alive = (...args) => dependencies.alive(...args);
  const shrineActive = (...args) => dependencies.shrineActive(...args);
  const prepareItemCombat = (...args) =>
    dependencies.prepareItemCombat(...args);
  const passiveCounter = (...args) => dependencies.passiveCounter(...args);
  const attackManaGain = (...args) => dependencies.attackManaGain(...args);
  const skillManaCost = (...args) => dependencies.skillManaCost(...args);
  const skillHpCost = (...args) => dependencies.skillHpCost(...args);

  function prepareParadoxCombat(state, rng) {
    prepareItemCombat(state, rng);
    paradox.prepareCombat(
      state,
      rng,
      royal.freeMagic(state) ||
        (state.classKey === "sorceress" && shrineActive(state)),
    );
  }

  function physicalRange(state) {
    if (state.paradox?.kind !== "inverse")
      return [state.damageMin, state.damageMax];
    return [Math.max(1, state.defense - 2), Math.max(1, state.defense + 3)];
  }

  function effectiveResistance(
    state,
    resistance = state.resistance,
    defend = false,
  ) {
    let res =
      resistance -
      world.effectiveStacks(state.modifiers.cursed_ground || 0) * 3;
    if (shrineActive(state) && state.classKey === "paladin") res += 10;
    if (defend) res += 15;
    return paradox.effectiveRes(state, res - bosses.resPenalty(state));
  }

  function attackDamage(
    attacker,
    defender,
    state,
    rng,
    {
      magic = false,
      multiplier = 1,
      defend = false,
      player = false,
      critical = null,
      raw = null,
    } = {},
  ) {
    const hit =
      magic ||
      rng() <
        world.hitChance(
          attacker.accuracy,
          defender.evasion,
          player ? 0.45 : (state.evasionCap ?? 0.45),
        );
    if (!hit) return { damage: 0, hit: false, crit: false };
    if (
      player &&
      bosses.on(defender) &&
      (bosses.vanished(state) ||
        (defender.boss.id === "giyua" &&
          defender.boss.action === "attack" &&
          defender.boss.nests > 0))
    )
      return { damage: 0, hit: false, crit: false };
    const crit =
      !magic && !defend && (critical ?? rng() < (attacker.critChance || 0));
    const range = player
      ? physicalRange(state)
      : [attacker.damageMin, attacker.damageMax];
    let damage = raw ?? int(...range, rng);
    damage *=
      multiplier * (crit ? (player ? royal.critMultiplier(state) : 1.75) : 1);
    if (player && defender.rank === "normal")
      damage *= 1 - (state.normalDamagePenalty || 0);
    if (player)
      damage *=
        1 +
        itemPassives.aggregate(state).berserk * (1 - state.hp / state.maxHp);
    if (player)
      damage *=
        (1 + gilded.damageBonus(state)) * bosses.playerFactor(state, magic);
    if (player && paradox.active(state)) {
      const bonus = ["boss", "final_boss"].includes(defender.rank)
        ? state.bossDamage
        : defender.rank === "elite"
          ? state.eliteDamage
          : 0;
      damage *= (1 + bonus) * paradox.outgoing(state);
    }
    if (magic) {
      const res = player
        ? clamp(defender.resistance, -50, 75)
        : effectiveResistance(state, defender.resistance, defend);
      damage *= 1 - res / 100;
    } else {
      let defense = defender.defense;
      if (!player) {
        if (state.paradox?.kind === "inverse")
          defense = (state.damageMin + state.damageMax) / 2;
        if (
          shrineActive(state) &&
          state.classKey === "barbarian" &&
          state.hp <= state.maxHp * 0.3
        )
          defense += 8;
      }
      damage *=
        1 - world.defenseReduction(defense * (defend ? 2 : 1), state.floor);
    }
    if (!player)
      damage *=
        paradox.incoming(state, magic) *
        (1 + state.damageTaken) *
        (1 +
          (magic
            ? state.magicDamageTaken || 0
            : state.physicalDamageTaken || 0)) *
        (defend ? 0.85 : 1);
    if (player && paradox.active(state)) {
      if (!bosses.on(defender) && defender.mechanic === "deimoss")
        damage *= 0.75;
      if (player) bosses.hit(state, damage);
      return { damage: Math.max(1, damage), hit: true, crit };
    }
    if (player) bosses.hit(state, damage);
    return { damage: Math.max(1, Math.floor(damage)), hit: true, crit };
  }

  function enemyTurn(
    state,
    rng,
    defend = false,
    dodge = false,
    reflectGuard = defend,
    extra = false,
  ) {
    prepareItemCombat(state, rng);
    const enemy = state.encounter;
    const plan = bosses.counter(state, defend, extra);
    const physical = !plan.magic;
    enemy.nextDamageType = plan.magic ? "magic" : "physical";
    if (plan.skip) {
      const log = bosses.afterCounter(state, 0, false, defend);
      return (
        "✨ Cơ chế đã được xử lý: boss không phản công." +
        (log ? "\n" + log : "")
      );
    }
    if (dodge) {
      const log = bosses.afterCounter(state, 0, false, defend);
      return (
        `${E.evasion} Bạn chặn/né hoàn toàn phản công.` +
        (log ? "\n" + log : "")
      );
    }
    if (
      shrineActive(state) &&
      ["assassin", "necromancer"].includes(state.classKey)
    ) {
      state.classShrine.consumed = true;
      const log = bosses.afterCounter(state, 0, false, defend);
      return "✨ Class Shrine chặn phản công." + (log ? "\n" + log : "");
    }
    const blood =
      enemy.hp < enemy.maxHp * 0.5
        ? 1 + world.effectiveStacks(state.modifiers.bloodlust || 0) * 0.06
        : 1;
    const frenzy =
      !bosses.on(enemy) && enemy.mechanic === "butcher"
        ? 1 + Math.min(5, enemy.frenzy + 1) * 0.08
        : 1;
    const hit = plan.trueDamage
      ? { damage: plan.raw, hit: true, crit: false }
      : attackDamage(enemy, state, state, rng, {
          magic: plan.magic,
          multiplier: (plan.raw != null ? 1 : blood * frenzy) * plan.multiplier,
          raw: plan.raw,
          critical: plan.critical,
          defend,
        });
    const actual = hurt(state, hit.damage);
    if (!alive(state))
      state.lastDeathCause = `${enemy.name} gây ${actual} DMG ${enemy.nextDamageType === "magic" ? "phép" : "vật lý"}, khiến HP về 0.`;
    if (hit.hit && enemy.drainCharges > 0) {
      state.mana = Math.max(0, state.mana - 1);
      enemy.drainCharges--;
    }
    const bossLog = bosses.afterCounter(
      state,
      actual,
      hit.hit && actual > 0,
      defend,
    );
    if (!bosses.on(enemy) && enemy.mechanic === "butcher")
      enemy.frenzy = Math.min(5, enemy.frenzy + 1);
    if (!bosses.on(enemy) && enemy.mechanic === "lucion" && actual)
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.floor(actual * 0.35));
    enemy.nextDamageType =
      enemy.damageType === "mixed"
        ? rng() < enemy.magicChance
          ? "magic"
          : "physical"
        : enemy.damageType;
    const reflected = passiveCounter(
      state,
      rng,
      actual,
      reflectGuard,
      !hit.hit && physical,
    );
    return (
      (hit.hit
        ? `${hit.crit ? `${E.crit} Critical! ` : ""}Bạn nhận ${actual} DMG${defend ? " (đã phòng thủ)" : ""}.`
        : `${E.evasion} Quái đánh trượt.`) +
      reflected +
      (bossLog ? "\n" + bossLog : "")
    );
  }

  function playerManaLeech(state, dealt, rng) {
    const leech = itemPassives.aggregate(state).mpLeech;
    if (
      dealt <= 0 ||
      state.mana >= bosses.effectiveMaxMana(state) ||
      leech <= 0 ||
      rng() >= leech
    )
      return "";
    const before = state.mana;
    state.mana = Math.min(bosses.effectiveMaxMana(state), state.mana + 1);
    return (
      "\n" +
      passiveIcon("mpLeech") +
      " Hút MP: " +
      before +
      " → " +
      state.mana +
      " MP cho bạn."
    );
  }

  function playerAttack(state, action, rng) {
    prepareItemCombat(state, rng);
    const e = state.encounter;
    bosses.beginAction(state, action);
    state.passiveImmunityThisTurn = bosses.on(e)
      ? bosses.vanished(state)
      : e.mechanic === "riftwalker" && e.combatTurn % 3 === 0;
    let dodge = false,
      defend = false,
      healingLog = "",
      hits = [];
    if (action === "defend") {
      royal.limitGuard(state, action, false);
      state.mana = Math.min(bosses.effectiveMaxMana(state), state.mana + 1);
      const acted = {
        defend: true,
        dodge: false,
        log: `${E.defense} Phòng thủ và hồi 1 ${E.mana} MP.`,
      };
      bosses.afterPlayer(state, action, acted);
      return acted;
    }
    if (action === "potion") {
      if (!state.potions) throw new Error("NO_POTION");
      if (state.hp >= state.maxHp) throw new Error("FULL_HP");
      if (paradox.potionLocked(state) || gilded.potionLocked(state))
        throw new Error("POTION_LOCKED");
      royal.limitGuard(state, action, false);
      const saveChance = itemPassives.aggregate(state).potionSave;
      const saved = saveChance > 0 && rng() < saveChance;
      if (!saved) state.potions--;
      const gained = heal(
        state,
        Math.max(20, state.maxHp * paradox.potionRate(state)),
      );
      const acted = {
        defend: false,
        dodge: false,
        log: `${E.potion} Hồi ${gained} ${E.hp} HP${saved ? ` · ${passiveIcon("potionSave")} **Tiết kiệm bình:** giữ lại bình` : ""}; quái còn sống phản công.`,
      };
      bosses.afterPlayer(state, action, acted);
      return acted;
    }
    if (action === "skill") {
      const cost = skillManaCost(state);
      if (state.mana < cost) throw new Error("NO_ENERGY");
      const hpCost = skillHpCost(state);
      if (state.hp - hpCost < 1) throw new Error("INSUFFICIENT_SKILL_HP");
      if (hpCost) {
        const before = state.hp;
        hurt(state, hpCost, false);
        healingLog += `\n${E.hp} Chi phí Skill: ${before} → ${state.hp} HP cho bạn (−${hpCost}).`;
      }
      if (
        cost === 0 &&
        !bosses.brainControl(state) &&
        !royal.freeMagic(state) &&
        state.classKey === "sorceress" &&
        shrineActive(state)
      )
        state.classShrine.consumed = true;
      state.mana -= cost;
      if (bosses.brainControl(state)) {
        royal.limitGuard(state, action, false);
        const dealt = Math.min(e.hp, Math.floor(e.maxHp * 0.2));
        e.hp -= dealt;
        healingLog += playerManaLeech(state, dealt, rng);
        const acted = {
          defend: false,
          dodge: false,
          dealt,
          critical: false,
          log:
            "🧠 Brain Control: " +
            dealt +
            " DMG chuẩn; Scales mất hiệu lực trong 2 đòn gây sát thương tiếp theo." +
            healingLog,
        };
        e.combatTurn++;
        bosses.afterPlayer(state, action, acted);
        return acted;
      }
      if (["sorceress", "necromancer"].includes(state.classKey)) {
        hits = [
          attackDamage(state, e, state, rng, {
            player: true,
            magic: true,
            raw: int(state.spellMin, state.spellMax, rng),
            multiplier: state.classKey === "sorceress" ? 2.1 : 1.55,
          }),
        ];
        dodge = state.classKey === "necromancer";
      } else if (state.classKey === "amazon") {
        const shots = shrineActive(state) && rng() < 0.2 ? 3 : 2;
        hits = Array.from({ length: shots }, () =>
          attackDamage(state, e, state, rng, {
            player: true,
            multiplier: 0.85,
          }),
        );
      } else {
        hits = [
          attackDamage(state, e, state, rng, {
            player: true,
            multiplier: {
              barbarian: 1.65,
              assassin: 1.3,
              druid: 1.35,
              paladin: 1.4,
            }[state.classKey],
          }),
        ];
        dodge = state.classKey === "assassin";
        defend = state.classKey === "paladin";
        if (state.classKey === "druid") {
          const hpBefore = state.hp;
          const gained = heal(state, state.maxHp * 0.12);
          healingLog += `\n${SKILL_ICONS.druid} Hồi ${E.hp} **${gained} HP** cho bạn: ${hpBefore} → **${state.hp}**.`;
        }
      }
    } else if (action === "attack") {
      hits = [attackDamage(state, e, state, rng, { player: true })];
      state.mana = Math.min(
        bosses.effectiveMaxMana(state),
        state.mana + attackManaGain(state),
      );
    } else throw new Error("INVALID_ACTION");
    dodge = royal.limitGuard(state, action, dodge);
    const bonus = ["boss", "final_boss"].includes(e.rank)
      ? state.bossDamage
      : e.rank === "elite"
        ? state.eliteDamage
        : 0;
    let damage = Math.floor(
      hits.reduce((sum, hit) => sum + hit.damage, 0) *
        (paradox.active(state) ? 1 : 1 + bonus),
    );
    const immune = bosses.on(e)
      ? bosses.vanished(state)
      : e.mechanic === "riftwalker" && e.combatTurn % 3 === 0;
    if (immune) damage = 0;
    if (
      !bosses.on(e) &&
      !paradox.active(state) &&
      e.mechanic === "deimoss" &&
      damage > 0
    )
      damage = Math.max(1, Math.floor(damage * 0.75));
    e.combatTurn++;
    const dealt = Math.min(Math.max(0, e.hp - bosses.floorHp(state)), damage);
    e.hp = Math.max(bosses.floorHp(state), e.hp - damage);
    healingLog += playerManaLeech(state, dealt, rng);
    const landed = hits.filter((hit) => hit.hit).length;
    const actionName =
      action === "skill"
        ? `${SKILL_ICONS[state.classKey]} ${stats.CLASSES[state.classKey].skill}`
        : `${E.attack} Tấn công`;
    const outcome = !landed
      ? "Đánh trượt — 0 DMG."
      : immune
        ? "Riftwalker miễn sát thương lượt này — 0 DMG."
        : `${damage} DMG${hits.some((h) => h.crit) ? ` · ${E.crit} Critical` : ""}.`;
    const shots =
      hits.length > 1 ? ` Trúng ${landed}/${hits.length} phát.` : "";
    const acted = {
      defend,
      dodge,
      dealt,
      damage,
      critical: dealt > 0 && hits.some((hit) => hit.crit),
      log: `${actionName}: ${outcome}${shots}${healingLog}`,
    };
    bosses.afterPlayer(state, action, acted);
    return acted;
  }
  return {
    prepareParadoxCombat,
    physicalRange,
    effectiveResistance,
    attackDamage,
    enemyTurn,
    playerAttack,
  };
};
