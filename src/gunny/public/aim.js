"use strict";
// Shared geometry for the server, the character pose and the browser angle dial.
((root, factory) => {
  const api =
    typeof module === "object" && module.exports
      ? factory(require("./terrain"))
      : factory(root.GunnyTerrain);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GunnyAim = api;
})(globalThis, (Terrain) => {
  const RAD = Math.PI / 180,
    FOOTPRINT = 16;
  // Slope under the feet: surfaces near the fighter's own ledge, so a cave
  // roof or a floating island above never tilts the body.
  function terrainTilt(terrain, f) {
    const sample = (center) => {
      let sum = 0;
      for (let i = -2; i <= 2; i++) {
        const column = Math.max(
          0,
          Math.min(terrain.length - 1, Math.round(center + i)),
        );
        sum += Terrain.surfaceNear(terrain, column, f.y, 24);
      }
      return sum / 5;
    };
    return (
      Math.atan2(
        sample(f.x - FOOTPRINT) - sample(f.x + FOOTPRINT),
        FOOTPRINT * 2,
      ) / RAD
    );
  }
  function bodyCenter(terrain, f) {
    const tilt = terrainTilt(terrain, f) * RAD;
    return { x: f.x - 20 * Math.sin(tilt), y: f.y - 20 * Math.cos(tilt) };
  }
  function limits(weapon) {
    return { min: weapon.minAngle ?? 0, max: weapon.maxAngle ?? 90 };
  }
  function solution(terrain, f, weapon, direction, localAngle) {
    const tilt = terrainTilt(terrain, f),
      range = limits(weapon),
      horizontal = localAngle + direction * tilt,
      world = direction === 1 ? horizontal : 180 - horizontal,
      center = bodyCenter(terrain, f);
    return {
      tilt,
      localAngle,
      horizontal,
      world,
      min: range.min + direction * tilt,
      max: range.max + direction * tilt,
      base: (direction === 1 ? 0 : 180) + tilt,
      center,
      muzzle: {
        x: center.x + 22 * Math.cos(world * RAD),
        y: center.y - 22 * Math.sin(world * RAD),
      },
    };
  }
  function allowed(terrain, f, weapon, direction, horizontal) {
    if (!Number.isFinite(horizontal) || ![1, -1].includes(direction))
      return false;
    const local = horizontal - direction * terrainTilt(terrain, f),
      r = limits(weapon);
    return local >= r.min - 1e-7 && local <= r.max + 1e-7;
  }
  // One 2.5-second climb and one 2.5-second descent; elapsed time prevents frame-rate drift.
  function chargePercent(elapsedMs) {
    const phase = (Math.max(0, elapsedMs) % 5000) / 2500;
    return (phase <= 1 ? phase : 2 - phase) * 100;
  }
  return Object.freeze({
    terrainTilt,
    bodyCenter,
    limits,
    solution,
    allowed,
    chargePercent,
  });
});
