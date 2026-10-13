"use strict";
const innate = require("./innate");
const OLD_TUNING = Object.freeze({ furyBarrier: 0.05, barkBase: 0.04, barkCap: 0.2, echo: 0.5, echoShield: 0, totems: 3, nova: 0.6 });
const NEW_TUNING = Object.freeze({ furyBarrier: 0.06, barkBase: 0.05, barkCap: 0.25, echo: 0.65, echoShield: 0.1, totems: 2, nova: 0.65 });
const tuning = (s) => innate.enabled(s) ? NEW_TUNING : OLD_TUNING;
const LEGACY_TEXT = {"barbarian":"Mỗi combat: lần đầu vượt xuống 75/50/25% HP tạo Fury. Bắt đầu ở ≤50% HP nhận 1 Fury. Iron Will tiêu Fury: mỗi điểm +15% DMG Skill và lá chắn 5% Max HP.","sorceress":"Trả đủ 3 MP cho Skill tạo 1 Echo. Arcane Burst kế tiếp dùng Echo: thêm hit phép 50% DMG sau giảm trừ. Không tích khi giữ Echo; Skill miễn phí không tích.","druid":"Wild Regeneration tạo lá chắn: 4% Max HP sau giảm hồi +50% HP hồi dư. Tối đa 20% Max HP, giữ qua tầng. Bình/event không tạo lá chắn.","necromancer":"Mỗi Totem Ward: +1 Bone Totem. Đủ 3: tiêu cả ba, thêm hit phép 60% DMG sau giảm trừ và hồi 1 MP. Hit phụ luôn trúng, không CRIT/hút MP."};
const ARTIFACTS = {
  amazon: [
    "Askari War Quiver",
    "Hunter's Rhythm",
    "Tấn công thường trúng: +1 Focus (tối đa 2). Barrage dùng 2 Focus để thêm một phát vật lý 70%, roll trúng/CRIT riêng.",
  ],
  barbarian: [
    "Bul-Kathos' Bloodstone",
    "Unbroken Fury",
    "Mỗi combat: lần đầu vượt xuống 75/50/25% HP tạo Fury, tối đa 1 Fury mỗi lần HP thay đổi; không farm lại bằng hồi máu. Bắt đầu ở ≤50% HP nhận 1 Fury. Iron Will tiêu toàn bộ Fury: mỗi điểm +15% DMG Skill và Barrier 6% Max HP.",
  ],
  assassin: [
    "Viz-Jaq'taar Shadow Seal",
    "Shadow Momentum",
    "Mỗi action có CRIT hoặc né tự nhiên: +1 Shadow (tối đa 2). Shadow Step dùng 2 Shadow: tốn 1 MP, +20 điểm % CRIT và +0,25 hệ số CRIT.",
  ],
  sorceress: [
    "Vizjerei Arcane Prism",
    "Arcane Echo",
    "Trả đủ 3 MP cho Skill tạo 1 Echo. Arcane Burst kế tiếp dùng Echo: thêm hit phép 65% DMG hit chính và Echo Shield 10% Max HP. Không tích khi giữ Echo; Skill miễn phí không tích.",
  ],
  druid: [
    "Fiacla-Géar Heartwood",
    "Ancient Bark",
    "Wild Regeneration tạo Bark: 5% Max HP sau giảm hồi +50% lượng HP hồi dư thực tế. Trần 25% Max HP; giữ qua phase, hết khi combat kết thúc. Bình/event không tạo Bark.",
  ],
  necromancer: [
    "Rathma's Bone Effigy",
    "Totemic Covenant",
    "Mỗi Totem Ward: +1 Bone Totem. Đủ 2: tiêu cả hai, thêm Grave Nova bằng 65% DMG Skill và hồi 1 MP. Hit phụ luôn trúng, không CRIT/hút MP/tạo Totem.",
  ],
  paladin: [
    "Zakarum Oathshield",
    "Consecration",
    "Divine Shield tạo vùng thánh cho 2 action gây DMG kế tiếp: +10 điểm % RES, +20% DEF khi phản công. Mỗi hit vật lý thêm Holy DMG: max(25% DEF, 15% DMG trước CRIT), qua giảm trừ vật lý.",
  ],
};
function enabled(s) {
  return (
    s.gameplayVersion === 3 &&
    s.classAwakeningVersion === 1 &&
    !s.mode?.startsWith("tower") &&
    !s.towerChallengeId
  );
}
function active(s) {
  return (
    enabled(s) &&
    s.classAwakening?.version === 1 &&
    s.classAwakening.classKey === s.classKey
  );
}
function grant(s, e) {
  if (
    !enabled(s) ||
    s.classAwakening ||
    s.floor !== 100 ||
    !["boss", "final_boss"].includes(e.rank) ||
    e.hp > 0 ||
    s.hp <= 0
  )
    return false;
  s.classAwakening = {
    version: 1,
    classKey: s.classKey,
    artifact: ARTIFACTS[s.classKey][0],
    awakenedFloor: 100,
    focus: 0,
    shadow: 0,
    echo: 0,
    echoProgress: 0,
    totems: 0,
    bark: 0,
  };
  s.lastLog +=
    "\n✨ Class Awakening: **" +
    ARTIFACTS[s.classKey][0] +
    "** · **" +
    ARTIFACTS[s.classKey][1] +
    "**.";
  return true;
}
function prepare(s) {
  if (!active(s) || s.encounter?.type !== "combat") return;
  const e = s.encounter,
    a = s.classAwakening;
  a.bark = Math.min(a.bark || 0, Math.floor(s.maxHp * tuning(s).barkCap));
  if (e.awakeningCombat) return;
  if (innate.enabled(s)) a.bark = 0;
  const low = s.hp <= s.maxHp * 0.5;
  e.awakeningCombat = {
    version: 1,
    fury: s.classKey === "barbarian" && low ? 1 : 0,
    crossed: (low || innate.enabled(s)) ? [0.75, 0.5, 0.25].filter((v) => s.hp <= s.maxHp * v) : [],
    barrier: 0,
    ground: 0,
  };
}
function combat(s) {
  return active(s) ? s.encounter?.awakeningCombat : null;
}
function empowered(s) {
  return (
    active(s) && s.classKey === "assassin" && s.classAwakening.shadow === 2
  );
}
function fury(s) {
  return s.classKey === "barbarian" ? combat(s)?.fury || 0 : 0;
}
function ground(s) {
  return (
    s.classKey === "paladin" &&
    ((combat(s)?.ground || 0) > 0 ||
      s.encounter?.awakeningGroundThisAction === true)
  );
}
function incomingDefense(s) {
  return ground(s) ? 1.2 : 1;
}
function incomingRes(s) {
  return ground(s) ? 10 : 0;
}
function absorb(s, amount) {
  const c = combat(s);
  if (!c) return amount;
  const a = s.classAwakening,
    key = s.classKey === "druid" ? "bark" : "barrier",
    target = s.classKey === "druid" ? a : c;
  if (s.classKey === "druid")
    a.bark = Math.min(a.bark || 0, Math.floor(s.maxHp * tuning(s).barkCap));
  const used = Math.min(target[key] || 0, amount);
  target[key] = (target[key] || 0) - used;
  return amount - used;
}
function hpChanged(s, before) {
  const c = combat(s);
  if (!c || s.classKey !== "barbarian") return;
  let crossed = false;
  for (const v of [0.75, 0.5, 0.25])
    if (before > s.maxHp * v && s.hp <= s.maxHp * v && !c.crossed.includes(v)) {
      c.crossed.push(v);
      crossed = true;
      if (!innate.enabled(s)) c.fury = Math.min(3, c.fury + 1);
    }
  if (crossed && innate.enabled(s)) c.fury = Math.min(3, c.fury + 1);
}
function shadow(s) {
  if (
    active(s) &&
    s.classKey === "assassin" &&
    !s.encounter.awakeningShadowGranted
  ) {
    s.encounter.awakeningShadowGranted = true;
    s.classAwakening.shadow = Math.min(2, s.classAwakening.shadow + 1);
  }
}
function description(s) {
  if (!active(s))
    return enabled(s)
      ? "Hạ boss tầng 100 và sống sót để thức tỉnh nội tại class."
      : "";
  const a = s.classAwakening,
    c = combat(s),
    d = ARTIFACTS[s.classKey];
  const resource = {
    amazon: "Focus " + a.focus + "/2",
    assassin: "Shadow " + a.shadow + "/2",
    sorceress: "Echo " + a.echo + "/1 · Tiến trình " + a.echoProgress + "/3",
    druid:
      "Bark Barrier " +
      Math.min(a.bark, Math.floor(s.maxHp * tuning(s).barkCap)) +
      "/" +
      Math.floor(s.maxHp * tuning(s).barkCap),
    necromancer: "Bone Totem " + a.totems + "/" + tuning(s).totems,
    barbarian:
      "Fury " + (c?.fury || 0) + "/3 · Fury Barrier " + (c?.barrier || 0),
    paladin: "Vùng thánh: " + (c?.ground || 0) + " action còn lại",
  }[s.classKey];
  return (
    "**" +
    d[0] +
    "** · **" +
    d[1] +
    "**\n" +
    (innate.enabled(s) ? d[2] : LEGACY_TEXT[s.classKey] || d[2]) +
    "\n**" +
    resource +
    "**\nClass Artifact riêng của run; không có level, không rèn/nghiền/giải nguyền và không mất bởi event."
  );
}
module.exports = {
  ARTIFACTS,
  tuning,
  enabled,
  active,
  grant,
  prepare,
  combat,
  empowered,
  fury,
  ground,
  incomingDefense,
  incomingRes,
  absorb,
  hpChanged,
  shadow,
  description,
};
