"use strict";
// Rha-Kor — Kẻ Khắc Chiến Luật. Vết Khắc là trạng thái tạm thời của một combat, không mang sang phòng sau.
const { E, soulIcon } = require("../shared/icons");
const enabled = (s) => s.classKey === "rha_kor";
const level = (s) => (enabled(s) ? require("./souls").level(s) : 0);
const awakened = (s) => require("../awakening").active(s);
const MARK_TURNS = 3;
const BREAK_TURNS = 2;
const NAME = "Vết Khắc Cổ Luật";
function config(s) {
  const n = level(s),
    awake = awakened(s);
  return {
    skill: n >= 5 ? 2.8 : n >= 1 ? 2.5 : 2.2,
    explodeAt: n >= 2 ? 2 : 3,
    explosion: awake ? 3.6 : n >= 3 ? 3.4 : 2.8,
    deepBonus: n >= 2 ? 1.15 : 1,
    paradoxBonus: 1.2,
    shred: awake || n >= 3 ? 0.25 : 0.2,
    guard: 0.12 + (n >= 4 ? 0.1 : 0),
    barrier: awake ? 0.12 : 0,
    extraMana: n >= 5 ? 1 : 0,
    aftershock: n >= 6 ? 0.65 : 0,
  };
}
const skillMultiplier = (s) => config(s).skill;
function frame(s) {
  const e = s.encounter;
  if (!enabled(s) || e?.type !== "combat") return null;
  e.rhaKor ||= { version: 1, mark: null, shred: null, manaUsed: false };
  return e.rhaKor;
}
const mark = (s) => (enabled(s) ? s.encounter?.rhaKor?.mark || null : null);
function validate(s) {
  if (!enabled(s)) return;
  const g = s.rhaGuard;
  if (g != null && (!Number.isFinite(g) || g < 0 || g > 0.5))
    throw Error("INVALID_RHA_KOR_STATE");
  const f = s.encounter?.rhaKor;
  if (!f) return;
  const m = f.mark;
  if (
    f.version !== 1 ||
    (m &&
      (![1, 2, 3].includes(m.level) ||
        !Number.isSafeInteger(m.turns) ||
        m.turns < 1 ||
        m.turns > MARK_TURNS ||
        typeof m.bonus !== "boolean")) ||
    (f.shred &&
      (!Number.isFinite(f.shred.rate) ||
        f.shred.rate < 0 ||
        f.shred.rate > 0.5 ||
        !Number.isSafeInteger(f.shred.turns) ||
        f.shred.turns < 1 ||
        f.shred.turns > BREAK_TURNS + 1))
  )
    throw Error("INVALID_RHA_KOR_STATE");
}
// Giảm DEF hiệu lực của mục tiêu khi Rha-Kor gây sát thương vật lý.
function defenseFactor(s) {
  const b = enabled(s) ? s.encounter?.rhaKor?.shred : null;
  return b ? 1 - b.rate : 1;
}
// Giảm sát thương cho phản công kế tiếp sau vụ nổ.
const guardRate = (s) => (enabled(s) ? s.rhaGuard || 0 : 0);
function consumeGuard(s) {
  if (s.rhaGuard) delete s.rhaGuard;
}
// Mệnh Đề Phản Nghịch: boss gây sát thương trực tiếp khi Vết Khắc còn tồn tại.
function onEnemyDamage(s, damage) {
  const m = mark(s);
  if (
    !m ||
    m.bonus ||
    !(damage > 0) ||
    !["boss", "final_boss"].includes(s.encounter.rank)
  )
    return "";
  m.bonus = true;
  return (
    "\n" +
    soulIcon("rha_kor", 0) +
    " Mệnh Đề Phản Nghịch: vụ nổ Vết Khắc +" +
    Math.round((config(s).paradoxBonus - 1) * 100) +
    "% sát thương."
  );
}
// Mỗi hành động của Rha-Kor (kể cả Phòng thủ/Bình) trừ thời lượng Vết Khắc và hiệu ứng phá giáp.
function tick(s, { keepMark = false } = {}) {
  const f = s.encounter?.rhaKor;
  if (!f || !enabled(s)) return "";
  let log = "";
  if (f.shred && --f.shred.turns <= 0) f.shred = null;
  if (f.mark && !keepMark && --f.mark.turns <= 0) {
    f.mark = null;
    log = "\n" + E.attack + " " + NAME + " tan biến vì hết 3 lượt.";
  }
  return log;
}
function gainMana(s, amount) {
  const before = s.mana;
  s.mana = Math.min(
    require("../bosses/mechanics").effectiveMaxMana(s),
    s.mana + amount,
  );
  return s.mana - before;
}
const label = (m) => NAME + " LV" + m.level + "/" + "3";
// Gọi sau khi hit chính của Attack/Skill đã được tính.
// api: { explode(multiplier) -> {damage,dealt,strength}, aftershock(amount) -> {dealt,strength}, alive() }
function afterHit(s, action, mainDealt, api) {
  const out = { dealt: 0, strength: 0, log: "" };
  const f = frame(s);
  if (!f) return out;
  const c = config(s);
  const landed = mainDealt > 0;
  if (action === "skill") {
    if (!landed) {
      out.log += tick(s);
      return out;
    }
    out.log += f.mark ? "\n" + E.attack + " Vết Khắc cũ bị ghi đè." : "";
    f.mark = {
      level: api.shrine ? 2 : 1,
      turns: MARK_TURNS,
      bonus: false,
    };
    out.log +=
      "\n" +
      soulIcon("rha_kor", 0) +
      " Khắc " +
      NAME +
      " LV" +
      f.mark.level +
      " lên mục tiêu (" +
      MARK_TURNS +
      " lượt).";
    out.log += tick(s, { keepMark: true });
    return out;
  }
  if (f.mark && landed) {
    f.mark.level = Math.min(3, f.mark.level + 1);
    if (f.mark.level >= c.explodeAt && api.alive()) {
      explode(s, f, c, api, out);
      return out;
    }
    out.log += "\n" + soulIcon("rha_kor", 0) + " " + label(f.mark) + ".";
  }
  out.log += tick(s);
  return out;
}
function explode(s, f, c, api, out) {
  const m = f.mark;
  f.mark = null;
  const multiplier = c.explosion * c.deepBonus * (m.bonus ? c.paradoxBonus : 1);
  const hit = api.explode(multiplier);
  out.dealt += hit.dealt;
  out.strength += hit.strength;
  out.log +=
    "\n💥 " +
    NAME +
    " phát nổ: +" +
    hit.strength +
    " DMG vật lý" +
    (m.bonus ? " (Mệnh Đề Phản Nghịch)" : "") +
    ".";
  f.shred = { rate: c.shred, turns: BREAK_TURNS + 1 };
  out.log +=
    "\n" +
    E.defense +
    " Giáp mục tiêu −" +
    Math.round(c.shred * 100) +
    "% trong " +
    BREAK_TURNS +
    " lượt.";
  s.rhaGuard = c.guard;
  out.log +=
    "\n" +
    soulIcon("rha_kor", 0) +
    " Thân Bia Bất Khuất: giảm " +
    Math.round(c.guard * 100) +
    "% sát thương nhận ở phản công kế tiếp.";
  const killed = !api.alive();
  let mana = 0;
  if (killed) mana += 1;
  if (c.extraMana && !f.manaUsed) {
    f.manaUsed = true;
    mana += c.extraMana;
  }
  if (mana) {
    const got = gainMana(s, mana);
    out.log += "\n" + E.mana + " Hồi " + got + " MP từ vụ nổ.";
  }
  if (c.barrier) {
    const cb = require("../awakening").combat(s);
    if (cb) {
      const amount = Math.floor(s.maxHp * c.barrier);
      cb.barrier = (cb.barrier || 0) + amount;
      out.log += "\n🛡️ Cổ Luật Đoạn Tuyệt: Barrier " + amount + ".";
    }
  }
  if (c.aftershock && !killed) {
    const after = api.aftershock(Math.floor(hit.damage * c.aftershock));
    out.dealt += after.dealt;
    out.strength += after.strength;
    out.log +=
      "\n" +
      soulIcon("rha_kor", 6) +
      " Dư Chấn: +" +
      after.strength +
      " DMG" +
      (after.crit ? " " + E.crit : "") +
      ".";
  }
  out.log += tick(s, { keepMark: true });
  return out;
}
function innateText(s) {
  const c = config(s),
    m = mark(s);
  return (
    "**Thân Bia Bất Khuất** · có từ tầng 1\n" +
    "Skill đặt " +
    NAME +
    " LV1 lên mục tiêu (" +
    MARK_TURNS +
    " lượt của Rha-Kor, không mang sang phòng sau). Mỗi hit chính của Attack/Skill trúng thêm +1 cấp; đạt LV" +
    c.explodeAt +
    " thì phát nổ " +
    Math.round(c.explosion * c.deepBonus * 100) +
    "% ST vật lý (luôn trúng, không Crit) và giảm " +
    Math.round(c.shred * 100) +
    "% DEF mục tiêu trong " +
    BREAK_TURNS +
    " lượt. Sau nổ: giảm " +
    Math.round(c.guard * 100) +
    "% sát thương phản công kế tiếp; hạ mục tiêu bằng vụ nổ hồi 1 MP.\n" +
    "Mệnh Đề Phản Nghịch: boss gây sát thương trực tiếp khi Vết Khắc còn tồn tại → vụ nổ +20%.\n" +
    (m
      ? "**Hiện tại:** " + label(m) + " · còn " + m.turns + " lượt.\n"
      : "**Hiện tại:** chưa có Vết Khắc.\n")
  );
}
function awakeningText(s) {
  return (
    "**Cổ Luật Đoạn Tuyệt** · Uru Stone Tablet\nVụ nổ tăng lên 360% ST vật lý, giảm 25% DEF mục tiêu và tạo Barrier 12% Max HP. " +
    (mark(s)
      ? "Hiện tại: " + label(mark(s)) + " · còn " + mark(s).turns + " lượt."
      : "Hiện tại: chưa có Vết Khắc.")
  );
}
function status(s) {
  const m = mark(s),
    b = s.encounter?.rhaKor?.shred;
  return (
    (m ? label(m) + " · " + m.turns + " lượt" : "Chưa có Vết Khắc") +
    (b
      ? " · Giáp −" + Math.round(b.rate * 100) + "% (" + b.turns + " lượt)"
      : "") +
    (s.rhaGuard
      ? " · Giảm ST " + Math.round(s.rhaGuard * 100) + "%"
      : "")
  );
}
module.exports = {
  enabled,
  config,
  skillMultiplier,
  frame,
  mark,
  validate,
  defenseFactor,
  guardRate,
  consumeGuard,
  onEnemyDamage,
  tick,
  afterHit,
  innateText,
  awakeningText,
  status,
  NAME,
};
