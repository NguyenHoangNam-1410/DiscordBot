"use strict";
// One shared HP-loss budget for the player action and all following counters/procs.
const active = (s) => ["boss", "final_boss"].includes(s.encounter?.rank);
const auxiliary = (s) => {
  const m = s.encounter?.boss?.mechanicState;
  return Boolean(m?.targets && m.target !== "boss");
};
const maxHp = (s) =>
  s.encounter.boss?.mechanicState?.coreMaxHp ?? s.encounter.maxHp;
const limit = (s) => Math.max(0, Math.floor(maxHp(s) / 5));
function begin(s) {
  if (active(s))
    s.encounter.towerGuardian = { version: 1, limit: limit(s), spent: 0 };
}
function cap(s, damage, body = false) {
  damage = Math.max(0, Math.floor(damage));
  if (!active(s) || (!body && auxiliary(s))) return damage;
  const budget = s.encounter.towerGuardian;
  return Math.min(
    damage,
    Math.max(
      0,
      Math.min(limit(s), budget?.limit ?? limit(s)) - (budget?.spent || 0),
    ),
  );
}
function apply(s, damage, settle, body = false) {
  if (!active(s) || (!body && auxiliary(s)))
    return settle(Math.max(0, Math.floor(damage)));
  if (!s.encounter.towerGuardian) begin(s); // Existing saved boss encounters upgrade lazily.
  const e = s.encounter,
    m = e.boss?.mechanicState;
  const before = m?.coreHp ?? e.hp;
  const result = settle(cap(s, damage, body));
  // Stone Armor does not consume the HP-loss budget; healing never refunds it.
  e.towerGuardian.spent += Math.max(0, before - (m?.coreHp ?? e.hp));
  return result;
}
function direct(s, damage) {
  return apply(
    s,
    damage,
    (n) => {
      const e = s.encounter,
        m = e.boss?.mechanicState;
      const dealt = Math.min(m?.coreHp ?? e.hp, n);
      if (m?.coreHp != null) m.coreHp -= dealt;
      e.hp = Math.max(0, e.hp - dealt);
      return dealt;
    },
    true,
  );
}
function validate(s, e = s.encounter) {
  const b = e?.towerGuardian;
  if (
    b &&
    (b.version !== 1 ||
      !Number.isSafeInteger(b.limit) ||
      b.limit < 0 ||
      !Number.isSafeInteger(b.spent) ||
      b.spent < 0 ||
      b.spent > b.limit)
  )
    throw Error("INVALID_TOWER_GUARDIAN");
}
const description =
  "🛡️ **Tower's Guardian:** Mỗi đòn và tổng HP boss mất trong một lượt không vượt quá **20% Max HP** (gồm phép, vật lý, gai, phản đòn và hit phụ). Không áp dụng cho vật triệu hồi/mục tiêu phụ.";
module.exports = {
  active,
  auxiliary,
  begin,
  cap,
  apply,
  direct,
  validate,
  description,
};
