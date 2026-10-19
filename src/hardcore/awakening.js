"use strict";
const souls = require("./characters/souls");
const { statNumber } = require("./shared/ui");
const innate = require("./innate");
const OLD_TUNING = Object.freeze({
  furyBarrier: 0.05,
  barkBase: 0.04,
  barkCap: 0.2,
  echo: 0.5,
  echoShield: 0,
  totems: 3,
  nova: 0.6,
});
const NEW_TUNING = Object.freeze({
  furyBarrier: 0.06,
  barkBase: 0.05,
  barkCap: 0.25,
  echo: 0.65,
  echoShield: 0.1,
  totems: 2,
  nova: 0.65,
});
const REWORK_TUNING = Object.freeze({
  furyBarrier: 0.05,
  barkBase: 0.04,
  barkCap: 0.18,
  healRate: 0.1,
  echo: 0.8,
  echoShield: 0.15,
  echoExtra: 0.2,
  totems: 2,
  nova: 0.65,
});
const tuning = (s) =>
  souls.awakeningTuning(
    s,
    innate.rebalanced(s)
      ? REWORK_TUNING
      : innate.enabled(s)
        ? NEW_TUNING
        : OLD_TUNING,
  );
const LEGACY_TEXT = {
  barbarian:
    "Mỗi combat: lần đầu vượt xuống 75/50/25% HP tạo Fury. Bắt đầu ở ≤50% HP nhận 1 Fury. Iron Will tiêu Fury: mỗi điểm +15% DMG Skill và lá chắn 5% Max HP.",
  sorceress:
    "Trả đủ 3 MP cho Skill tạo 1 Echo. Arcane Burst kế tiếp dùng Echo: thêm hit phép 50% DMG sau giảm trừ. Không tích khi giữ Echo; Skill miễn phí không tích.",
  druid:
    "Wild Regeneration tạo lá chắn: 4% Max HP sau giảm hồi +50% HP hồi dư. Tối đa 20% Max HP, giữ qua tầng. Bình/event không tạo lá chắn.",
  necromancer:
    "Mỗi Totem Ward: +1 Bone Totem. Đủ 3: tiêu cả ba, thêm hit phép 60% DMG sau giảm trừ và hồi 1 MP. Hit phụ luôn trúng, không CRIT/hút MP.",
};
const REWORK_TEXT = {
  barbarian:
    "Mỗi Fury tăng 15% DMG Iron Will và Barrier 5% Max HP; tối đa một Fury mỗi lần HP vượt ngưỡng mới, không farm bằng hồi máu.",
  druid:
    "Wild Regeneration hồi 10% Max HP; tạo Bark bằng 4% Max HP sau giảm hồi +50% HP hồi dư thực tế. Trần 18% Max HP, hết khi combat kết thúc.",
  sorceress:
    "Trả đủ 3 MP chủ động cho Skill tạo Echo. Arcane Burst kế tiêu Echo: hit phép 80% DMG hit chính, 20% thêm một Echo 80%, không Crit; tạo Barrier 15% Max HP. Không tích Echo khi đang giữ Echo.",
  paladin:
    "Divine Shield tạo vùng thánh cho 2 action gây DMG kế; phản công nhận +20% DEF/+10% RES. Mỗi hit vật lý trúng thêm Holy DMG = 20% DEF + giá trị RES (10% RES tương ứng 10). Bỏ qua DEF quái thường/tinh anh; boss vẫn giảm bằng DEF.",
};
const ARTIFACTS = {
  rha_kor: [
    "Uru Stone Tablet",
    "Cổ Luật Đoạn Tuyệt",
    "Vụ nổ Vết Khắc tăng lên 360% ST vật lý, giảm 25% DEF mục tiêu và tạo Barrier 12% Max HP.",
  ],
  venance: [
    "Astral Codex",
    "Trinity Mandate",
    "Đòn cường hóa hợp lệ thứ ba tăng sát thương và tạo Barrier.",
  ],
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
    crossed:
      low || innate.enabled(s)
        ? [0.75, 0.5, 0.25].filter((v) => s.hp <= s.maxHp * v)
        : [],
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
  return ground(s) ? (souls.has(s, 4) ? 1.25 : 1.2) : 1;
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
  if (require("./characters/venance").enabled(s))
    return require("./characters/venance").awakeningText(s);
  if (require("./characters/rhakor").enabled(s))
    return require("./characters/rhakor").awakeningText(s);
  const a = s.classAwakening,
    c = combat(s),
    d = ARTIFACTS[s.classKey];
  const cfg = tuning(s);
  const soulRules = souls.has(s, 1)
    ? {
        amazon:
          "Đánh thường trúng +1 Focus (trần 2); Barrage tiêu 2 để thêm phát vật lý " +
          souls.focusRate(s) * 100 +
          "%.",
        barbarian:
          "Vượt ngưỡng HP mới tạo Fury; mỗi Fury tăng " +
          souls.furyRate(s) * 100 +
          "% DMG Iron Will và Barrier " +
          cfg.furyBarrier * 100 +
          "% Max HP.",
        assassin:
          "Crit/né tự nhiên: tối đa 1 Shadow/action (trần 2). Shadow Step tiêu 2: giá 1 MP, +" +
          (souls.has(s, 3) ? 25 : 20) +
          " điểm % CRIT, +" +
          (souls.has(s, 6) ? 0.35 : 0.25) +
          " hệ số CRIT.",
        sorceress:
          "Đủ 3 MP chủ động cho Skill tạo Echo. Burst kế tiêu Echo: hit " +
          cfg.echo * 100 +
          "%, " +
          cfg.echoExtra * 100 +
          "% thêm hit Echo; Barrier " +
          cfg.echoShield * 100 +
          "% Max HP. Không tích khi đang giữ Echo hoặc Skill miễn phí.",
        druid:
          "Skill hồi " +
          cfg.healRate * 100 +
          "% Max HP; Bark = " +
          cfg.barkBase * 100 +
          "% Max HP sau giảm hồi +50% hồi dư, trần " +
          cfg.barkCap * 100 +
          "% Max HP; hết khi combat kết thúc.",
        necromancer:
          "Đủ 2 Bone Totem tạo Nova " +
          cfg.nova * 100 +
          "% DMG Skill sau giảm trừ và hồi 1 MP; không Crit/hút MP/tạo Totem.",
        paladin:
          "Divine Shield tạo vùng thánh 2 action gây DMG: +" +
          (souls.has(s, 4) ? 25 : 20) +
          "% DEF/+10 điểm % RES. Holy mỗi hit vật lý trúng = " +
          (souls.has(s, 3) ? 23 : 20) +
          "% DEF + giá trị RES; boss vẫn giảm qua DEF.",
      }
    : null;
  const resource = {
    amazon: "Focus " + a.focus + "/2",
    assassin: "Shadow " + a.shadow + "/2",
    sorceress:
      "Echo " + a.echo + "/1 · Tiến trình " + statNumber(a.echoProgress) + "/3",
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
    (soulRules
      ? soulRules[s.classKey]
      : innate.rebalanced(s)
        ? REWORK_TEXT[s.classKey] || d[2]
        : innate.enabled(s)
          ? d[2]
          : LEGACY_TEXT[s.classKey] || d[2]) +
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
