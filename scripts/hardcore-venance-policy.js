"use strict";
// Offline policy. Only public previews, visible kit resources and announced mechanics.
const core = require("../src/hardcore/engine");
const kit = require("../src/hardcore/characters/venance");
const bosses = require("../src/hardcore/bosses/mechanicsV2");
function context(s) {
  const options = core.actions(s).filter((a) => !a.disabled),
    has = (a) => options.some((o) => o.action === a);
  // A safe boss action's skip flag expires at beginAction; do not assume it protects the next turn.
  let forecast = s;
  if (bosses.on(s.encounter) && s.encounter.boss.mechanicState.skipCounter) {
    forecast = structuredClone(s);
    forecast.encounter.boss.mechanicState.skipCounter = false;
  }
  const incoming = core.incomingPreview(forecast);
  const worst =
    incoming.high *
    (incoming.critChance > 0 ? s.encounter.critDamage || 1.75 : 1);
  const attack = core.attackDamagePreview(s),
    frame = kit.frame(s);
  const canKill =
    has("attack") &&
    attack.low > 0 &&
    attack.low >= s.encounter.hp &&
    (!bosses.on(s.encounter) ||
      (bosses.floorHp(s) === 0 &&
        bosses.previewDamage(s, attack.low) >= s.encounter.hp));
  return {
    options,
    has,
    incoming,
    worst,
    attack,
    frame,
    canKill,
    deficit: s.maxHp - s.hp,
  };
}
function healing(s, c) {
  const { has, worst, frame, deficit } = c;
  // A guaranteed magic finisher avoids the counter; never rely on physical accuracy at lethal HP.
  if (c.canKill && (c.attack.magic || s.hp > worst)) return "attack";
  const barrier = kit.third(s)
    ? Math.floor(s.maxHp * kit.config(s).thirdBarrier)
    : 0;
  if (
    barrier > 0 &&
    has("attack") &&
    s.hp > Math.max(1, worst - barrier) &&
    s.hp + barrier > worst * 1.6 &&
    s.hp > s.maxHp * 0.2
  )
    return "attack";
  const heal = Math.min(
    deficit,
    Math.max(
      0,
      (bosses.on(s.encounter) ? bosses.healingLimit(s) : s.maxHp) - s.hp,
    ),
  );
  const sigil = frame?.ready && heal >= s.maxHp * kit.config(s).sigilHeal;
  if (
    has("defend") &&
    sigil &&
    s.hp + Math.min(heal, s.maxHp * kit.config(s).sigilHeal) > worst &&
    (s.hp <= worst * 1.5 ||
      (!kit.empowered(s) &&
        (s.mana < core.skillManaCost(s) ||
          (s.hp < s.maxHp * 0.75 &&
            s.maxHp * kit.config(s).sigilHeal > worst * 0.7))))
  )
    return "defend";
  if (
    has("potion") &&
    heal > 0 &&
    s.hp < Math.max(worst * 2.2, s.maxHp * 0.35) &&
    deficit >= s.maxHp * s.potionRate * 0.65
  )
    return "potion";
  return null;
}
function choose(s, c = context(s)) {
  const { has, frame, worst } = c;
  const emergency = healing(s, c);
  if (emergency) return emergency;
  if (c.canKill) return "attack";
  if (kit.empowered(s) && has("attack")) return "attack";
  // Spend a useful ready sigil before re-casting deletes it; also replenish MP.
  if (
    has("defend") &&
    frame?.ready &&
    c.deficit >= s.maxHp * kit.config(s).sigilHeal &&
    s.mana < Math.min(s.maxMana, core.skillManaCost(s) + 2) &&
    s.hp > worst
  )
    return "defend";
  if (has("skill")) return "skill";
  if (
    has("defend") &&
    s.mana < core.skillManaCost(s) &&
    s.mana <
      Math.min(
        s.maxMana,
        bosses.on(s.encounter) ? bosses.effectiveMaxMana(s) : s.maxMana,
      ) &&
    !s.encounter.drainCharges
  )
    return "defend";
  return has("attack")
    ? "attack"
    : c.options.find((a) => a.action !== "retreat")?.action;
}
function chooseBoss(s, action) {
  const c = context(s),
    { b, m } = bosses.current(s),
    go = (cmd) => {
      const a = "boss_" + b.id + "__" + cmd;
      return c.has(a) ? a : null;
    };
  const emergency = healing(s, c);
  if (emergency === "attack") return emergency;
  // Correct puzzle inputs skip their counter. Keep them available when a potion cannot save a turn.
  const safe =
    action &&
    /__(sigil[0-2]|purify|command[0-2]|clash[0-2]|frequency[0-2]|lie[0-2]|gate[0-2]|stabilize[0-2]|overload|rune[0-2]|strike|search)$/.test(
      action,
    );
  if (emergency && !(safe && s.hp <= c.worst)) return emergency;
  if (
    b.id === "xazax" &&
    m.portals > 0 &&
    s.hp < c.worst * 2 &&
    go("portal_enter")
  )
    return go("portal_enter");
  // Refresh before the final paid opening action; it consumes one of three buff actions.
  const opens =
    (action &&
      /__(purify|frequency[0-2]|lie[0-2]|gate[0-2]|clash[0-2]|overload|pull)$/.test(
        action,
      )) ||
    (action && b.id === "lucion" && m.will === 2) ||
    (action && b.id === "sescheron" && m.input.length === 2);
  if (
    opens &&
    (!kit.empowered(s) || c.frame.remaining <= 1) &&
    s.hp > c.worst * 2.5 &&
    !(b.id === "inarius" && m.lilithHp <= 20)
  ) {
    if (c.has("skill")) return "skill";
    if (
      c.has("defend") &&
      s.mana < core.skillManaCost(s) &&
      s.mana < bosses.effectiveMaxMana(s)
    )
      return "defend";
  }
  // Back does not lower Bloodlust and the boss advances after every paid action.
  // Do not loop on Back/Cut when the distance is already zero; use burst and sustain.
  if (action) return action;
  return choose(s, c);
}
module.exports = { VERSION: 2, choose, chooseBoss, context };
