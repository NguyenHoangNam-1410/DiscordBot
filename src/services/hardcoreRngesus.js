"use strict";

// Each survived encounter starts the same low-risk progression again.
function rngesusChance(floor) {
  if (floor < 5) return 0;
  if (floor < 10) return 0.003;
  if (floor < 20) return 0.006;
  return 0.01;
}
function rngesusEncounterChance(state) {
  if (state.floor < 5) return 0;
  const resetFloor = state.rngesusResetFloor;
  if (!Number.isSafeInteger(resetFloor) || resetFloor <= 0)
    return rngesusChance(state.floor);
  const distance = state.floor - resetFloor;
  // The next floor is always safe, including volatility/spike rolls.
  if (distance <= 1) return 0;
  // Restart at the first eligible band: 5 floors at 0.3%, then 10 at 0.6%.
  return rngesusChance(distance + 3);
}
function resetRngesusEncounter(state) {
  state.rngesusResetFloor = state.floor;
  state.rngesusDry = 0;
  state.lastChaosChance = 0;
  state.lastChaosSpike = false;
}
module.exports = {
  rngesusChance,
  rngesusEncounterChance,
  resetRngesusEncounter,
};
