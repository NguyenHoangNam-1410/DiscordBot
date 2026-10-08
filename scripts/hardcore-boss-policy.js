"use strict";
// Simulation policy uses only mechanics/telegraphs that the player can see.
const boss = require("../src/hardcore/bosses/mechanics");
const core = require("../src/hardcore/engine");
function choose(s) {
  if (s.gameplayVersion !== 2) return null;
  const e = s.encounter,
    options = core.actions(s).filter((a) => !a.disabled),
    has = (a) => options.some((o) => o.action === a);
  if (e.type === "prophecy")
    return (
      "prophecy_" +
      (["sorceress", "necromancer"].includes(s.classKey) ? "arcane" : "war")
    );
  if (e.type === "boss_gate") return "enter_kabraxis";
  if (!boss.on(e)) return null;
  const b = e.boss,
    p = core.incomingPreview(s),
    needPotion =
      has("potion") &&
      s.maxHp - s.hp >= s.maxHp * 0.25 &&
      s.hp < Math.max(p.high * 2, s.maxHp * 0.4);
  const brain = boss.brainControl(s);
  if (brain && has("skill")) return "skill";
  if (boss.vanished(s)) return needPotion ? "potion" : "defend";
  if (b.id === "gharbad" && b.surrender)
    return needPotion ? "potion" : "defend";
  if (b.id === "assur" && b.normals >= 2) return "defend";
  if (b.id === "control" && b.feedback) return "defend";
  if (b.id === "samael" && b.round % 4 === 3) return "defend";
  if (b.id === "xazax" && b.portals >= 4 && has("skill")) return "skill";
  if (
    needPotion &&
    !(has("skill") && ["assassin", "necromancer"].includes(s.classKey))
  )
    return "potion";
  if (
    b.id === "butcher" &&
    b.frenzy >= 3 &&
    !(has("skill") && ["assassin", "necromancer"].includes(s.classKey))
  )
    return "defend";
  if (
    b.id === "machine" &&
    b.round % 3 === 2 &&
    b.overheat < 2 &&
    s.classKey !== "amazon"
  )
    return "defend";
  if (b.id === "giyua" && b.nests >= 2) return "attack";
  if (b.id === "zakarum" && b.grace && s.classKey !== "amazon") return "attack";
  if (b.id === "justicar" && Math.floor(b.round / 2) % 2 === 1) return "attack";
  if (["bul_kathos", "uldyssian"].includes(b.id))
    return b.lastAction === "skill"
      ? "attack"
      : has("skill")
        ? "skill"
        : b.lastAction === "attack"
          ? "defend"
          : "attack";
  if (b.id === "kabraxis" && b.seal === "protection" && b.round % 3 === 2)
    return "defend";
  if (
    b.id === "kabraxis" &&
    b.seal === "war" &&
    b.phase === 2 &&
    b.lastAction === "skill"
  )
    return "attack";
  if (has("skill")) return "skill";
  return "attack";
}
module.exports = { VERSION: 2, choose };
