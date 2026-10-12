"use strict";
const HISTORICAL = {
  sorceress: { mechanic: "reflection", heal: 0 },
  druid: { mechanic: "regeneration", heal: 6 },
  necromancer: { mechanic: "ward", heal: 0 },
  paladin: { mechanic: "shield", heal: 0 },
  amazon: { mechanic: "barrage", heal: 0 },
  barbarian: { mechanic: "rage", heal: 0 },
  assassin: { mechanic: "dodge", heal: 0 },
};
function read(payload) {
  if (payload.towerClassProfileSnapshot)
    return payload.towerClassProfileSnapshot;
  if (payload.equipmentSnapshotVersion)
    throw Error("MISSING_TOWER_PROFILE_SNAPSHOT");
  const old = HISTORICAL[payload.classKey];
  if (!old) throw Error("UNKNOWN_TOWER_CLASS");
  return {
    ...old,
    name: payload.character.name,
    maxHp: payload.character.maxHp,
    maxMana: payload.character.maxMana,
    ...payload.combat,
    description: payload.classDescription,
  };
}
function capture(classKey, puzzleProfile) {
  const stats = require("../engine/stats"),
    state = stats.createState(classKey, 1),
    item = require("../item");
  return {
    equipmentSnapshotVersion: 1,
    survivalReleaseVersion: state.releaseVersion,
    statSystemVersion: state.statSystemVersion,
    catalogVersion: state.catalogVersion,
    equipmentRulesVersion: state.equipmentRulesVersion || 0,
    affinityVersion: state.affinityVersion || 0,
    classProfileSnapshot: structuredClone(state.statProfile),
    towerClassProfileSnapshot: structuredClone(puzzleProfile),
    itemDefinitionSnapshots: structuredClone(
      Object.values(
        state.catalogVersion === 3 ? item.ITEMS_V3 : item.LEGACY_ITEMS,
      ).flat(),
    ),
  };
}
module.exports = { read, capture };
