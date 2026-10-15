"use strict";
// Offline policy: read only current public combat stats and the visible cast state.
const core = require("../src/hardcore/engine");
const kit = require("../src/hardcore/characters/venance");
function choose(s) {
  const options = core.actions(s).filter((a) => !a.disabled);
  const has = (action) => options.some((a) => a.action === action);
  const incoming = core.incomingPreview(s);
  const worst =
    incoming.high *
    (incoming.critChance > 0 ? s.encounter.critDamage || 1.75 : 1);
  const attack = core.attackDamagePreview(s);
  const f = kit.frame(s);
  const deficit = s.maxHp - s.hp;
  if (
    has("potion") &&
    s.hp < Math.max(worst * 2, s.maxHp * 0.35) &&
    deficit >= s.maxHp * s.potionRate * 0.7
  )
    return "potion";
  if (has("attack") && attack.low >= s.encounter.hp && attack.low > 0)
    return "attack";
  // Defend spends one buff action. Consume the heal only when survival needs it.
  if (
    has("defend") &&
    f?.ready &&
    deficit >= s.maxHp * kit.config(s).sigilHeal &&
    s.hp <= worst * 2
  )
    return "defend";
  // Never re-cast while empowered: Skill prepares attacks and deals no damage.
  if (kit.empowered(s) && has("attack")) return "attack";
  if (has("skill")) return "skill";
  // Recover MP with Venance's +2 Defend before preparing the next three hits.
  if (
    has("defend") &&
    s.mana < core.skillManaCost(s) &&
    s.mana < s.maxMana &&
    !s.encounter.drainCharges
  )
    return "defend";
  return has("attack")
    ? "attack"
    : options.find((a) => a.action !== "retreat")?.action;
}
module.exports = { VERSION: 1, choose };
