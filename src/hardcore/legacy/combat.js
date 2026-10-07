// Composed once by ../runtime/index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    clamp,
    hitChance,
    magicAfterResistance,
    enemyDamageType,
    classShrineActive,
    CLASSES,
  } = dependencies;
  const randomFloat = (...args) => dependencies.randomFloat(...args);
  const randomInt = (...args) => dependencies.randomInt(...args);
  const resolvePhysicalAttack = (...args) =>
    dependencies.resolvePhysicalAttack(...args);
  const rollEnemyIntent = (...args) => dependencies.rollEnemyIntent(...args);

  function enemyTurn(state, defend = false, dodge = false) {
    const enemy = state.encounter;
    const previousEnergy = state.energy;
    enemy.attacks = (enemy.attacks || 0) + 1;
    const shrine = classShrineActive(state);
    const shrineDodge =
      shrine && ["assassin", "necromancer"].includes(state.classKey);
    const damageType = enemy.nextDamageType || enemyDamageType(enemy);
    rollEnemyIntent(enemy);
    if (shrineDodge) state.classShrine.consumed = true;
    if (dodge || shrineDodge)
      return "💨 Bạn chặn hoặc né hoàn toàn đòn phản công.";
    const shrineDefense =
      shrine && state.classKey === "barbarian" && state.hp <= state.maxHp * 0.3
        ? 8
        : 0;
    const defender = {
      defense: (state.defense + shrineDefense) * (defend ? 2 : 1),
      evasion: state.evasion,
      critResistance: defend ? 1 : 0,
    };
    const multiplier =
      (enemy.mechanic === "butcher"
        ? 1 + Math.min(5, enemy.attacks) * 0.08
        : 1) *
      (enemy.hp <= enemy.maxHp * 0.5
        ? 1 + (state.modifiers?.bloodlust || 0) * 0.08
        : 1);
    let damage;
    let label;
    if (
      damageType === "magic" ||
      (damageType === "mixed" && randomFloat() < enemy.magicChance)
    ) {
      if (randomFloat() >= hitChance(enemy.accuracy, state.evasion))
        return "💨 Phép của quái đánh trượt.";
      const raw = Math.floor(
        randomInt(enemy.damageMin, enemy.damageMax) * multiplier,
      );
      const effectiveResistance =
        state.resistance -
        (state.modifiers?.cursed_ground || 0) * 4 +
        (shrine && state.classKey === "paladin" ? 10 : 0);
      damage = magicAfterResistance(raw, effectiveResistance);
      label = "🔮";
    } else {
      const hit = resolvePhysicalAttack(enemy, defender, state.floor, {
        multiplier,
      });
      if (!hit.hit) return "💨 Quái đánh trượt.";
      damage = hit.damage;
      label = hit.crit ? "💢 Critical!" : "⚔️";
    }
    const blocked = defend ? damage - Math.max(1, Math.floor(damage * 0.6)) : 0;
    if (defend) damage -= blocked;
    damage = Math.max(1, Math.floor(damage * (1 + (state.damageTaken || 0))));
    const dealt = Math.min(state.hp, damage);
    state.hp = Math.max(0, state.hp - damage);
    state.energy = Math.max(
      0,
      state.energy -
        ((state.modifiers?.soul_drain || 0) >= 5
          ? 2
          : state.modifiers?.soul_drain
            ? 1
            : 0),
    );
    let recovery = "";
    if (enemy.mechanic === "lucion") {
      const healed = Math.min(enemy.maxHp - enemy.hp, Math.floor(dealt * 0.35));
      enemy.hp += healed;
      recovery = ` Lucion hồi **${healed} HP**.`;
    }
    const riftEffects = [];
    if (previousEnergy > state.energy)
      riftEffects.push(`−${previousEnergy - state.energy} ENE`);
    return `${label} Bạn nhận **${damage} DMG**.${defend ? ` 🛡️ Thủ thế chặn thêm **${blocked} DMG** (giảm 40%, miễn chí mạng).` : ""}${recovery}${riftEffects.length ? ` 🌀 Rift: ${riftEffects.join(", ")}.` : ""}`;
  }

  function playerAttack(state, action) {
    const enemy = state.encounter;
    if (action === "defend") {
      state.energy = Math.min(state.maxEnergy, state.energy + 1);
      return { log: "🛡️ Bạn thủ thế và hồi 1 năng lượng.", defend: true };
    }
    if (action === "potion") {
      if (state.potions <= 0) throw new Error("NO_POTION");
      if (state.hp >= state.maxHp) throw new Error("FULL_HP");
      const healed = Math.min(
        state.maxHp - state.hp,
        Math.max(
          20,
          Math.floor(
            state.maxHp * clamp(0.35 + (state.potionPower || 0), 0.1, 0.75),
          ),
        ),
      );
      state.potions -= 1;
      state.hp += healed;
      return { log: `🧪 Hồi **${healed} HP**.`, defend: false };
    }
    let attacks;
    let dodge = false;
    let defend = false;
    let healing = 0;
    if (action === "skill") {
      const free = state.classKey === "sorceress" && classShrineActive(state);
      if (!free && state.energy < 2) throw new Error("NO_ENERGY");
      if (free) state.classShrine.consumed = true;
      else state.energy -= 2;
      if (["sorceress", "necromancer"].includes(state.classKey)) {
        const raw = Math.floor(
          randomInt(state.damageMin, state.damageMax) *
            (state.classKey === "sorceress" ? 2.1 : 1.55),
        );
        attacks = [
          {
            hit: true,
            crit: false,
            damage: magicAfterResistance(raw, enemy.resistance),
          },
        ];
        dodge = state.classKey === "necromancer";
      } else if (state.classKey === "amazon") {
        attacks = [
          resolvePhysicalAttack(state, enemy, state.floor, {
            multiplier: 0.85,
          }),
          resolvePhysicalAttack(state, enemy, state.floor, {
            multiplier: 0.85,
          }),
        ];
        if (classShrineActive(state) && randomFloat() < 0.2)
          attacks.push(
            resolvePhysicalAttack(state, enemy, state.floor, {
              multiplier: 0.85,
            }),
          );
      } else {
        const multiplier = {
          assassin: 1.3,
          barbarian: 1.65,
          druid: 1.35,
          paladin: 1.4,
        }[state.classKey];
        attacks = [
          resolvePhysicalAttack(state, enemy, state.floor, { multiplier }),
        ];
        dodge = state.classKey === "assassin";
        defend = state.classKey === "paladin";
        if (state.classKey === "druid") {
          healing = Math.min(
            state.maxHp - state.hp,
            Math.floor(state.maxHp * 0.12),
          );
          state.hp += healing;
        }
      }
    } else {
      attacks = [resolvePhysicalAttack(state, enemy, state.floor)];
      state.energy = Math.min(state.maxEnergy, state.energy + 1);
    }
    const hit = attacks.some((attack) => attack.hit);
    enemy.incomingAttacks = (enemy.incomingAttacks || 0) + 1;
    const immune =
      enemy.mechanic === "riftwalker" && enemy.incomingAttacks % 3 === 1;
    const calculatedDamage = immune
      ? 0
      : attacks.reduce(
          (total, attack) =>
            total +
            (attack.hit
              ? enemy.mechanic === "deimoss"
                ? Math.max(1, Math.floor(attack.damage * 0.75))
                : attack.damage
              : 0),
          0,
        );
    const bonus = ["boss", "final_boss"].includes(enemy.rank)
      ? state.bossDamage || 0
      : ["elite", "ancient_mimic"].includes(enemy.rank)
        ? state.eliteDamage || 0
        : 0;
    const damage = Math.floor(calculatedDamage * (1 + bonus));
    enemy.hp = Math.max(0, enemy.hp - damage);
    const skill =
      action === "skill" ? `✨ ${CLASSES[state.classKey].skill}: ` : "⚔️ ";
    const log = immune
      ? `${skill}Ascendant Riftwalker miễn nhiễm đòn này.`
      : !hit
        ? `${skill}Đòn đánh trượt.`
        : `${skill}${attacks.some((attack) => attack.crit) ? "CRIT! " : ""}Gây **${damage} DMG**${attacks.length > 1 ? ` qua ${attacks.length} phát` : ""}.`;
    return {
      log: `${log}${healing ? ` Hồi **${healing} HP**.` : ""}`,
      dodge,
      defend,
    };
  }
  return { enemyTurn, playerAttack };
};
