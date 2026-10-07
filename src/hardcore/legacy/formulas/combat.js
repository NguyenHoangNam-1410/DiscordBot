// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { BOSS_DAMAGE_TYPES, BOSS_MECHANICS } = dependencies;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hitChance(accuracy, evasion) {
    return clamp(0.75 + (accuracy - evasion) * 0.005, 0.2, 0.95);
  }

  function defenseReduction(defense, level) {
    return clamp(defense / (defense + 50 + level * 8), 0, 0.75);
  }

  function physicalAfterDefense(rawDamage, defense, level) {
    return Math.max(
      1,
      Math.floor(rawDamage * (1 - defenseReduction(defense, level))),
    );
  }

  function magicAfterResistance(rawDamage, resistance) {
    return Math.max(
      1,
      Math.floor(rawDamage * (1 - clamp(resistance, -50, 75) / 100)),
    );
  }

  function enemyScale(floor) {
    const target = clamp(Math.trunc(floor), 1, 999);
    const early = Math.min(target, 100);
    const overrun = Math.max(0, target - 100);
    return {
      hp: 1 + early * 0.065 + overrun * 0.08,
      damage: 1 + early * 0.04 + overrun * 0.038,
    };
  }

  function checkpointGrowth(floor) {
    return floor < 100
      ? { hp: 6, attack: 1 }
      : floor < 400
        ? { hp: 10, attack: 2 }
        : floor < 700
          ? { hp: 14, attack: 3 }
          : { hp: 30, attack: 6 };
  }

  function enemyDamageType(enemy) {
    return (
      BOSS_DAMAGE_TYPES[
        enemy.mechanic ||
          (["boss", "final_boss"].includes(enemy.rank)
            ? BOSS_MECHANICS[enemy.name]
            : null)
      ] ||
      enemy.damageType ||
      "mixed"
    );
  }
  return {
    clamp,
    hitChance,
    defenseReduction,
    physicalAfterDefense,
    magicAfterResistance,
    enemyScale,
    checkpointGrowth,
    enemyDamageType,
  };
};
