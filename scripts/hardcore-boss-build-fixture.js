"use strict";
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats");
const session = {
  id: "matrix",
  guild_id: "matrix",
  user_id: "u",
  channel_id: "c",
};
function buildState(floor, key, build, rng, def = null, version = 2) {
  const s = stats.createState(key, 10000);
  s.bossRosterVersion = version;
  if (version === 2)
    s.bossDamageProfile = require("../src/hardcore/bosses/balanceV2").snapshot(
      key,
    );
  s.floor = floor;
  s.cleared = floor - 1;
  const main = stats.mainStat(s),
    points = Math.floor((floor - 1) / 5) * 5;
  const weights =
    build === "power"
      ? [
          [main, 0.7],
          ["vit", 0.3],
        ]
      : build === "energy"
        ? [
            ["ene", 0.7],
            ["vit", 0.3],
          ]
        : build === "guard"
          ? [
              ["vit", 0.5],
              [main, 0.25],
              ["ene", 0.25],
            ]
          : [
              ["dex", 0.5],
              ["vit", 0.25],
              [main, 0.25],
            ];
  const bonus = {};
  for (const [attr, weight] of weights)
    bonus[attr] = (bonus[attr] || 0) + Math.floor(points * weight);
  stats.addSource(s, bonus, "checkpoint");
  const priority =
    build === "power"
      ? { [main]: 1, bossDamage: 100, physical: 1 }
      : build === "energy"
        ? { ene: 1, spell: 1, maxMana: 10 }
        : build === "guard"
          ? { vit: 1, maxHp: 0.3, defense: 1, resistance: 3 }
          : { dex: 1, evasion: 2, accuracy: 0.2 };
  const score = (d) =>
    Object.entries(d.effects).reduce(
      (sum, [attr, value]) => sum + (priority[attr] || 0) * value,
      0,
    );
  const gearProfile = process.env.HARDCORE_SIM_BOSS_GEAR || "progression";
  if (!["thin", "progression"].includes(gearProfile))
    throw Error("INVALID_BOSS_GEAR_PROFILE");
  const equip = (rarity, count, level) => {
    const gear = [...core.ITEMS[rarity]]
      .sort((a, b) => score(b) - score(a))
      .slice(0, count);
    for (const item of gear)
      core.receiveItem(s, item, level, rarity === "cursed" ? level : 0);
  };
  if (gearProfile === "thin")
    equip("legendary", 5, 1 + Math.floor(floor / 200));
  else {
    equip(
      "common",
      Math.min(10, 2 + Math.floor(floor / 40)),
      1 + Math.floor(floor / 50),
    );
    equip(
      "rare",
      Math.min(13, 2 + Math.floor(floor / 70)),
      1 + Math.floor(floor / 50),
    );
    equip(
      "legendary",
      Math.min(12, 3 + Math.floor(floor / 120)),
      1 + Math.floor(floor / 100),
    );
    if (floor >= 350)
      equip(
        "cursed",
        Math.min(4, Math.floor(floor / 200)),
        1 + Math.floor(floor / 200),
      );
  }
  const mods = Object.keys(
    require("../src/hardcore/engine/world").RIFT_MODIFIERS,
  );
  for (let i = 1; i < floor / 10; i++) {
    const id = mods[(i - 1) % mods.length];
    s.modifiers[id] = (s.modifiers[id] || 0) + 1;
  }
  stats.recompute(s);
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  s.potions = s.maxPotions;
  s.prophecy = {
    kind:
      build === "energy" ? "arcane" : build === "guard" ? "protection" : "war",
    floor: 333,
    awakened: false,
  };
  if (floor > 333)
    stats.addSource(
      s,
      s.prophecy.kind === "war"
        ? { [main]: 12, bossDamage: 0.08 }
        : s.prophecy.kind === "protection"
          ? { vit: 12, resistance: 5 }
          : { ene: 10, maxMana: 1 },
      "prophecy",
    );
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  s.encounter = core.generateEncounter(s, session, rng);
  if (def && version === 2) {
    const locked = (s.encounter.enemy || s.encounter).boss;
    s.encounter = require("../src/hardcore/engine/world").makeEnemy(
      s,
      floor === 999 ? "final_boss" : "boss",
      null,
      rng,
      def,
    );
    for (const k of ["chestItem", "rewardItem"])
      if (locked?.[k]) s.encounter.boss[k] = locked[k];
    require("../src/hardcore/engine").prepareItemCombat(s, rng);
  }
  if (s.encounter.type === "boss_gate")
    core.act(s, session, "enter_kabraxis", rng);
  return s;
}
module.exports = { buildState, session };
