"use strict";
const stats = require("../engine/stats");
// Restoration only: acquisition, God history and reveal claims belong to each event.
function restore(state) {
  const hpBefore = state.hp,
    manaBefore = state.mana;
  let cleansedLevels = 0;
  for (const item of state.items || []) {
    if (!item.definition?.curse) continue;
    cleansedLevels += Math.max(0, item.level - (item.cleansedLevels || 0));
    item.cleansedLevels = item.level;
    item.rarity = item.definition.rarity;
  }
  const removedRiftStacks = Object.values(state.modifiers || {}).reduce(
    (sum, n) => sum + Math.max(0, n),
    0,
  );
  state.modifiers = {};
  stats.recompute(state);
  state.hp = state.maxHp;
  state.mana = state.maxMana;
  return {
    hpBefore,
    manaBefore,
    hpAfter: state.hp,
    manaAfter: state.mana,
    cleansedLevels,
    removedRiftStacks,
  };
}
module.exports = { restore };
