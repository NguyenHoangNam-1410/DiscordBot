"use strict";
const VERSION = 1;
function enabled(s) {
  return (
    s?.gameplayVersion === 3 &&
    s.equipmentRulesVersion === 1 &&
    [1, 2].includes(s.itemLevelCurveVersion) &&
    s.affinityVersion === 1
  );
}
function activate(s) {
  if (s.gameplayVersion !== 3) return s;
  Object.assign(s, {
    catalogVersion: 3,
    equipmentRulesVersion: 1,
    itemLevelCurveVersion: 2,
    lootRulesVersion: 2,
    affinityVersion: 1,
    affinityPity: { version: 1, missStreak: 0, lastSource: null },
  });
  return s;
}
function scale(l, s = null) {
  if (!Number.isSafeInteger(l) || l < 0) throw Error("INVALID_ITEM_LEVEL");
  if (s?.itemLevelCurveVersion === 2)
    return l <= 3 ? l : l === 4 ? 3.7 : l === 5 ? 4.2 : 4.5 + 0.1 * (l - 6);
  return l === 0
    ? 0
    : l === 1
      ? 1
      : l === 2
        ? 1.6
        : l === 3
          ? 2
          : l === 4
            ? 2.3
            : 2.7 - 0.2 * 2 ** -(l - 5);
}
function itemScale(s, i) {
  return enabled(s) ? scale(i.level, s) : i.level;
}
function curseScale(s, i) {
  return enabled(s)
    ? scale(i.level) - scale(i.cleansedLevels || 0, s)
    : Math.max(0, i.level - (i.cleansedLevels || 0));
}
module.exports = { VERSION, enabled, activate, scale, itemScale, curseScale };
