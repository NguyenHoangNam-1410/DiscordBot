// Composed once by ../runtime/index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    clamp,
    hitChance,
    physicalAfterDefense,
    enemyScale,
    BOSS_MECHANICS,
    enemyDamageType,
    ENEMY_NAMES,
    BOSS_NAMES,
  } = dependencies;
  const randomFloat = (...args) => dependencies.randomFloat(...args);
  const randomInt = (...args) => dependencies.randomInt(...args);
  const pick = (...args) => dependencies.pick(...args);

  function resolvePhysicalAttack(attacker, defender, level, options = {}) {
    const hitRoll = options.hitRoll ?? randomFloat();
    if (hitRoll >= hitChance(attacker.accuracy, defender.evasion))
      return { hit: false, crit: false, raw: 0, damage: 0 };
    const base =
      options.baseDamage ?? randomInt(attacker.damageMin, attacker.damageMax);
    const multiplier = options.multiplier ?? 1;
    const critRoll = options.critRoll ?? randomFloat();
    const crit =
      critRoll <
      clamp(
        (attacker.critChance || 0) - (defender.critResistance || 0),
        0,
        0.75,
      );
    const raw = Math.floor(
      base * multiplier * (crit ? attacker.critDamage || 1.75 : 1),
    );
    return {
      hit: true,
      crit,
      raw,
      damage: physicalAfterDefense(raw, defender.defense, level),
    };
  }

  function makeEnemy(
    floor,
    rank = "normal",
    forcedName = null,
    modifiers = {},
  ) {
    const rankStats = {
      normal: [1, 1, 1],
      champion: [1.4, 1.15, 1.4],
      elite: [2, 1.35, 2],
      boss: [
        2.6 + (Math.max(0, Math.floor(floor / 50) - 1) % 5) * 0.075,
        1.1 + (Math.max(0, Math.floor(floor / 50) - 1) % 5) * 0.0375,
        4,
      ],
      final_boss: [7.2, 1.05, 10],
      mimic: [1.7, 1.25, 1.8],
      ancient_mimic: [2.8, 1.5, 3],
    }[rank];
    const scale = enemyScale(floor);
    const boss = ["boss", "final_boss"].includes(rank);
    const name =
      forcedName ||
      (rank === "final_boss"
        ? BOSS_NAMES[4]
        : boss
          ? BOSS_NAMES[(Math.floor(floor / 50) - 1) % BOSS_NAMES.length]
          : rank.includes("mimic")
            ? rank === "ancient_mimic"
              ? "Ancient Mimic"
              : "Mimic"
            : pick(ENEMY_NAMES));
    const maxHp = Math.min(
      1_000_000_000_000,
      Math.max(
        10,
        Math.floor(
          28 * scale.hp * rankStats[0] * (1 + (modifiers.fortified || 0) * 0.1),
        ),
      ),
    );
    const damageFactor = 1 + (modifiers.elemental_dominion || 0) * 0.04;
    const damageMin = Math.min(
      1_000_000_000_000,
      Math.max(2, Math.floor(5 * scale.damage * rankStats[1] * damageFactor)),
    );
    const damageMax = Math.min(
      1_000_000_000_000,
      Math.max(
        damageMin + 1,
        Math.floor(9 * scale.damage * rankStats[1] * damageFactor),
      ),
    );
    const mechanic = boss ? BOSS_MECHANICS[name] : null;
    const damageType = enemyDamageType({ name, rank, mechanic });
    const enemy = {
      type: "combat",
      rank,
      name,
      hp: maxHp,
      maxHp,
      damageMin,
      damageMax,
      defense: Math.floor(
        Math.floor(4 + floor * 1.8 * (boss ? 1.25 : 1)) *
          1.1 ** (modifiers.stone_skin || 0),
      ),
      accuracy: 70 + floor * 3 + (modifiers.swift_horror || 0) * 3,
      evasion:
        4 +
        Math.floor(floor / 12) +
        (modifiers.swift_horror || 0) +
        (name === "Assur" ? 18 : 0),
      critChance: (boss ? 0.1 : 0.05) + (name === "Assur" ? 0.12 : 0),
      critDamage: 1.5,
      critResistance: boss ? 0.08 : 0,
      resistance: Math.min(60, Math.floor(floor * 0.8)),
      damageType,
      magicChance:
        damageType === "magic"
          ? 1
          : damageType === "physical"
            ? 0
            : Math.min(
                0.75,
                (rank === "elite" || rank === "ancient_mimic" ? 0.2 : 0.05) +
                  (modifiers.elemental_dominion || 0) * 0.04,
              ),
      rewardMultiplier: rankStats[2],
      attacks: 0,
      incomingAttacks: 0,
      mechanic,
    };
    rollEnemyIntent(enemy);
    return enemy;
  }

  function rollEnemyIntent(enemy) {
    const type = enemyDamageType(enemy);
    enemy.nextDamageType =
      type === "mixed"
        ? randomFloat() < enemy.magicChance
          ? "magic"
          : "physical"
        : type;
  }
  return { resolvePhysicalAttack, makeEnemy, rollEnemyIntent };
};
