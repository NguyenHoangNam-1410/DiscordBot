"use strict";
const rules = require("./rules");
const { E } = require("../shared/icons");
const DESCRIPTIONS = {
  assassin:
    "Né vật lý tự nhiên tạo Shadow Mark; Crit kế tiêu thụ dấu tăng DMG (trần 20%). Shadow Step không tạo dấu.",
  amazon:
    "Hành động vật lý đầu tăng ACC (trần +15); hit đã trúng tăng DMG đòn kế (trần 15%).",
  barbarian: "HP càng thấp tăng DMG (trần 20%) và giảm DMG nhận (trần 10%).",
  sorceress:
    "Skill phép tăng DMG theo ENE (trần 15%); mỗi 3 Skill tốn MP hoàn 1 MP còn thiếu.",
  necromancer:
    "Ward/chặn tạo charge phản kích; dùng chung trần phản đòn, không Crit hoặc tạo proc mới.",
  druid:
    "Tăng hồi HP bình/Skill (trần 20%); Phòng thủ hồi HP còn thiếu (trần 2% Max HP).",
  paladin:
    "Phòng thủ tạo Guard: tăng đòn kế (trần 15%) và phản đòn (trần 15% HP thực mất); Divine Shield không tạo Guard.",
};
function strength(s) {
  if (!rules.enabled(s)) return 0;
  const seen = new Set();
  let n = 0;
  for (const i of s.items || []) {
    if (i.level <= 0 || seen.has(i.definition.id)) continue;
    seen.add(i.definition.id);
    if (
      i.definition.affinity?.classes.includes(s.classKey) &&
      i.definition.affinityEffect?.version === 1
    )
      n += i.definition.affinityEffect.effects[s.classKey]?.amount || 0;
  }
  return Math.min(0.2, n);
}
function counters(s) {
  return s.encounter?.affinityCombat || {};
}
function prepare(s) {
  if (rules.enabled(s) && s.encounter?.type === "combat")
    s.encounter.affinityCombat ||= {
      version: 1,
      marks: 0,
      hits: 0,
      actions: 0,
      spells: 0,
      ward: 0,
      guard: 0,
    };
}
function accuracy(s) {
  return s.classKey === "amazon" && counters(s).actions === 0
    ? Math.min(15, strength(s) * 100)
    : 0;
}
function outgoing(s, magic, crit) {
  const n = strength(s),
    c = counters(s);
  if (!n) return 1;
  switch (s.classKey) {
    case "assassin":
      return 1 + (!magic && crit && c.marks ? Math.min(0.2, n) : 0);
    case "amazon":
      return 1 + (!magic ? Math.min(0.15, n * (c.hits || 0)) : 0);
    case "barbarian":
      return 1 + Math.min(0.2, n * 2 * (1 - s.hp / s.maxHp));
    case "sorceress":
      return 1 + (magic ? Math.min(0.15, n * Math.min(2, s.ene / 100)) : 0);
    case "paladin":
      return 1 + (c.guard ? Math.min(0.15, n) : 0);
    default:
      return 1;
  }
}
function incoming(s) {
  return s.classKey === "barbarian"
    ? 1 - Math.min(0.1, strength(s) * (1 - s.hp / s.maxHp))
    : 1;
}
function healing(s) {
  return s.classKey === "druid" ? 1 + Math.min(0.2, strength(s)) : 1;
}
function defend(s) {
  prepare(s);
  if (strength(s) && s.classKey === "paladin") counters(s).guard = 1;
}
function dodge(s) {
  prepare(s);
  if (strength(s) && s.classKey === "assassin") counters(s).marks = 1;
}
function block(s) {
  prepare(s);
  if (strength(s) && s.classKey === "necromancer") counters(s).ward = 1;
}
function reflection(s, actual, defend, basic) {
  const n = strength(s),
    c = counters(s);
  let raw = 0;
  if (s.classKey === "paladin" && defend) raw = actual * Math.min(0.15, n);
  if (s.classKey === "necromancer" && c.ward) {
    raw += basic * Math.min(0.15, n);
    c.ward = 0;
  }
  return raw;
}
function afterAttack(
  s,
  { landed, critical, magic, paidMana, maxMana = s.maxMana },
) {
  const n = strength(s);
  if (!n) return "";
  prepare(s);
  const c = counters(s);
  c.actions++;
  c.hits = landed ? Math.min(15, (c.hits || 0) + landed) : 0;
  if (critical && s.classKey === "assassin") c.marks = 0;
  if (s.classKey === "paladin") c.guard = 0;
  if (s.classKey === "sorceress" && magic && paidMana > 0) {
    c.spells++;
    if (c.spells % 3 === 0 && s.mana < maxMana) {
      s.mana++;
      return "\n" + E.mana + " Affinity: hồi 1 MP cho bạn.";
    }
  }
  return "";
}
function text(d, k) {
  const a = d.affinity;
  if (!a) return "";
  if (a.type === "universal") return "\nAffinity: Universal";
  const labels = a.classes
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join(" / ");
  return (
    "\nAffinity: " +
    labels +
    (k
      ? "\n" +
        (a.classes.includes(k)
          ? "✓ Hợp class · " + DESCRIPTIONS[k]
          : "Lệch build · vẫn nhận chỉ số và nội tại chung.")
      : "")
  );
}

function summary(s) {
  const n = strength(s);
  if (!n) return "Chưa có trang bị hợp class.";
  const pct = (x) => (x * 100).toFixed(1) + "%";
  switch (s.classKey) {
    case "assassin":
      return (
        "Shadow Mark: Crit +" +
        pct(Math.min(0.2, n)) +
        " DMG; dấu chỉ tạo từ né vật lý tự nhiên."
      );
    case "amazon":
      return (
        "Hành động đầu: ACC +" +
        Math.min(15, n * 100) +
        ". Mỗi hit đã trúng: +" +
        pct(n) +
        " DMG các đòn sau, trần 15%; đánh trượt cả lượt reset chuỗi."
      );
    case "barbarian":
      return (
        "Theo HP đã mất: DMG +" +
        pct(affinityOutgoing(s) - 1) +
        "; sát thương nhận −" +
        pct(1 - incoming(s)) +
        " hiện tại."
      );
    case "sorceress":
      return (
        "Skill phép: DMG +" +
        pct(outgoing(s, true, false) - 1) +
        " theo ENE. Mỗi 3 Skill có trả MP hoàn 1 MP còn thiếu."
      );
    case "necromancer":
      return (
        "Ward/chặn: charge phản vật lý bằng " +
        pct(Math.min(0.15, n)) +
        " DMG Tấn công cơ bản, dùng chung trần phản nội tại."
      );
    case "druid":
      return (
        "Bình/Skill: hồi HP +" +
        pct(n) +
        ". Phòng thủ: hồi tối đa " +
        pct(Math.min(0.02, n * 0.1)) +
        " Max HP còn thiếu."
      );
    case "paladin":
      return (
        "Phòng thủ: Guard +" +
        pct(Math.min(0.15, n)) +
        " DMG đòn sau; phản " +
        pct(Math.min(0.15, n)) +
        " HP thực mất. Divine Shield không tạo Guard."
      );
    default:
      return "";
  }
}
function affinityOutgoing(s) {
  return outgoing(s, false, false);
}

module.exports = {
  summary,
  DESCRIPTIONS,
  strength,
  prepare,
  accuracy,
  outgoing,
  incoming,
  healing,
  defend,
  dodge,
  block,
  reflection,
  afterAttack,
  text,
};
