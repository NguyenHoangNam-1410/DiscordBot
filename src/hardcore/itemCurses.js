"use strict";
// Only these new curse effects have caps. Saved legacy effects retain their rules.
const CAPS = Object.freeze({
  physicalDamageTaken: 1,
  magicDamageTaken: 1,
  skillHpCost: 0.15,
  attackManaLoss: 3,
  skillManaExtra: 3,
  combatManaLoss: 3,
  healingReduction: 0.6,
  normalDamagePenalty: 0.6,
});
function derive(totals) {
  return Object.fromEntries(
    Object.entries(CAPS).map(([key, cap]) => [
      key,
      Math.min(cap, Math.max(0, totals[key] || 0)),
    ]),
  );
}
function describeEffect(key, value, level = 1, compact = false) {
  const n = Math.min(CAPS[key] ?? Infinity, value * level);
  const pct = (x) => Math.round(x * 100) + "%";
  const max = CAPS[key];
  if (compact) {
    const text = {
      physicalDamageTaken: `Bạn nhận DMG vật lý +${pct(n)}`,
      magicDamageTaken: `Bạn nhận DMG phép +${pct(n)}`,
      potionCapacityLoss: `Sức chứa bình −${n} (≥1)`,
      skillHpCost: `Skill tốn ${pct(n)} Max HP; chừa ≥1`,
      attackManaLoss: `Tấn công hồi MP −${n} (≥0)`,
      skillManaExtra: `Skill tốn MP +${n}; Shrine miễn phí: 0`,
      combatManaLoss: `Đầu combat: MP −${n} (một lần)`,
      healingReduction: `HP hồi −${pct(n)}; trừ Checkpoint/hồi sinh`,
      normalDamagePenalty: `Tấn công/Skill: DMG quái thường −${pct(n)}`,
    };
    return text[key] || null;
  }
  switch (key) {
    case "physicalDamageTaken":
      return "Bạn nhận DMG vật lý +" + pct(n) + " (trần +" + pct(max) + ")";
    case "magicDamageTaken":
      return "Bạn nhận DMG phép +" + pct(n) + " (trần +" + pct(max) + ")";
    case "potionCapacityLoss":
      return (
        "Sức chứa bình của bạn −" +
        n +
        " (còn tối thiểu 1; bỏ bình vượt giới hạn)"
      );
    case "skillHpCost":
      return (
        "Skill của bạn tốn " +
        pct(n) +
        " Max HP (trần " +
        pct(max) +
        "; làm tròn xuống, tối thiểu 1 HP; phải còn 1 HP; cộng với Paradox)"
      );
    case "attackManaLoss":
      return (
        "Tấn công hồi ít hơn " +
        n +
        " MP cho bạn (trần −3 MP; tối thiểu hồi 0; Phòng thủ không đổi)"
      );
    case "skillManaExtra":
      return (
        "Skill của bạn tốn thêm " +
        n +
        " MP (trần +3; cộng sau Paradox; Class Shrine miễn phí vẫn 0 MP)"
      );
    case "combatManaLoss":
      return (
        "Vào combat: bạn mất " +
        n +
        " MP (trần 3; tối thiểu còn 0; một lần/combat, trước nội tại hồi MP)"
      );
    case "healingReduction":
      return (
        "HP hồi cho bạn −" +
        pct(n) +
        " (trần −" +
        pct(max) +
        "; trừ Checkpoint và hồi sinh)"
      );
    case "normalDamagePenalty":
      return (
        "DMG Tấn công/Skill của bạn lên quái thường −" +
        pct(n) +
        " (trần −" +
        pct(max) +
        "; không giảm phản sát thương hay DMG lên Tinh anh/Boss)"
      );
    default:
      return null;
  }
}
module.exports = { CAPS, derive, describeEffect };
