"use strict";
// Rha-Kor — Kẻ Khắc Chiến Luật. Skill mở Cổ Luật; action kế tiếp (Attack/Defense/Potion/Skill) quyết định luật.
// Mọi trạng thái nằm trong combat hiện tại (encounter.rhaKor), không mang sang phòng sau.
const { E, SKILL_ICONS, soulIcon } = require("../shared/icons");
const enabled = (s) => s.classKey === "rha_kor";
const level = (s) => (enabled(s) ? require("./souls").level(s) : 0);
const awakened = (s) => require("../awakening").active(s);
const NAMES = Object.freeze({
  open: "Khai Bia Cổ Luật",
  doan: "Luật Đoạn",
  ho: "Luật Hộ",
  dan: "Luật Dẫn",
  phan: "Luật Phán",
});
const DEF_IGNORE = 0.15;
function config(s) {
  const n = level(s),
    awake = awakened(s);
  return {
    open: 1.5,
    phan: n >= 3 ? 2.8 : 2.5,
    s2: n >= 2,
    s2Bonus: 1.15,
    doan: n >= 3 ? 0.8 : 0.4,
    doanShred: n >= 3 ? 0.25 : 0.2,
    doanShredActions: 2,
    phanShred: 0.25,
    phanShredActions: 1,
    barrier: n >= 4 ? 0.24 : 0.12,
    hoMana: 1, // Phòng thủ thường hồi 1 MP; Luật Hộ hồi 2 MP
    hoReduce: 0.25,
    hoPenalty: 0.12,
    s4Bonus: n >= 4 ? 0.1 : 0,
    danHeal: 1.15,
    leech: 0.12,
    s1: n >= 1,
    carry: n >= 1,
    lawWindow: n >= 6 ? 3 : 1,
    boon: awake,
    boonBonus: n >= 5 ? 0.35 : 0.25,
    boonIgnore: 0.2,
    boonWindow: n >= 5 ? 3 : 2,
    discountWindow: 2,
  };
}
function frame(s) {
  const e = s.encounter;
  if (!enabled(s) || e?.type !== "combat") return null;
  // S1: Cổ Luật mở bởi Skill được giữ sang phòng kế tiếp (cửa sổ chỉ trừ khi Rha-Kor hành động).
  const carried = level(s) >= 1 ? s.rhaCarry?.law : null;
  const carriedDiscount = carried && level(s) >= 2 ? s.rhaCarry.discount : null;
  if (!e.rhaKor) delete s.rhaCarry;
  e.rhaKor ||= {
    version: 2,
    law: carried ? { window: carried.window } : null,
    // S2: giảm 1 MP của Luật Phán đi cùng Cổ Luật được mang sang phòng sau.
    discount: carriedDiscount ? { window: carriedDiscount.window } : null,
    boon: null,
    shred: null,
    barrier: 0,
    hoRounds: 0,
    penalty: false,
    leech: false,
    s4: false,
    skillsCast: 0,
    turn: null,
  };
  return e.rhaKor;
}
const peek = (s) => (enabled(s) ? s.encounter?.rhaKor || null : null);
function validate(s) {
  if (s.rhaGuard !== undefined) throw Error("INVALID_RHA_KOR_STATE");
  const carry = s.rhaCarry;
  if (
    carry != null &&
    (!enabled(s) ||
      !Number.isSafeInteger(carry.law?.window) ||
      carry.law.window < 1 ||
      carry.law.window > 4 ||
      (carry.discount != null &&
        (!Number.isSafeInteger(carry.discount.window) ||
          carry.discount.window < 1 ||
          carry.discount.window > 3)))
  )
    throw Error("INVALID_RHA_KOR_STATE");
  const f = enabled(s) ? s.encounter?.rhaKor : null;
  if (!f) return;
  const windowOk = (w, max) =>
    w == null ||
    (Number.isSafeInteger(w.window) && w.window >= 1 && w.window <= max);
  if (
    f.version !== 2 ||
    !windowOk(f.law, 4) ||
    !windowOk(f.discount, 3) ||
    !windowOk(f.boon, 3) ||
    (f.shred != null &&
      (!Number.isFinite(f.shred.rate) ||
        f.shred.rate < 0 ||
        f.shred.rate > 0.5 ||
        !Number.isSafeInteger(f.shred.turns) ||
        f.shred.turns < 1 ||
        f.shred.turns > 4)) ||
    !Number.isFinite(f.barrier) ||
    f.barrier < 0 ||
    ![0, 1, 2].includes(f.hoRounds) ||
    ["penalty", "leech", "s4"].some((k) => typeof f[k] !== "boolean") ||
    !Number.isSafeInteger(f.skillsCast) ||
    f.skillsCast < 0
  )
    throw Error("INVALID_RHA_KOR_STATE");
}
// Ghi nhận action của Rha-Kor trước khi tính sát thương: xác định chế độ luật và tiêu thụ Quyền Khắc.
function begin(s, action) {
  const f = frame(s);
  if (!f) return null;
  const open = Boolean(f.law);
  const mode =
    action === "skill"
      ? open
        ? "phan"
        : "open"
      : open && ["attack", "defend", "potion"].includes(action)
        ? { attack: "doan", defend: "ho", potion: "dan" }[action]
        : "basic";
  const strikes = ["attack", "skill"].includes(action);
  f.turn = {
    action,
    mode,
    boon: strikes && Boolean(f.boon),
    discount: action === "skill" && Boolean(f.discount),
    penalty: action === "attack" && f.penalty,
    s4: action === "attack" && f.s4,
    leech: action === "attack" && f.leech,
  };
  if (f.turn.boon) f.boon = null;
  return f.turn;
}
const turnOf = (s) => peek(s)?.turn || null;
function turnMultiplier(s) {
  const t = turnOf(s),
    c = config(s);
  if (!t) return 1;
  let m = 1;
  if (t.action === "skill")
    m =
      t.mode === "phan"
        ? c.phan * (t.discount && c.s2 ? c.s2Bonus : 1)
        : c.open;
  else if (t.action === "attack")
    m =
      (t.mode === "doan" ? 1 + c.doan : 1) *
      (t.penalty ? 1 - c.hoPenalty : 1) *
      (t.s4 ? 1 + c.s4Bonus : 1);
  return m * (t.boon ? 1 + c.boonBonus : 1);
}
// Nội tại Nét Khắc Không Thể Né + Quyền Khắc + DEF bị giảm bởi Luật Đoạn/Phán.
function defenseFactor(s) {
  const f = peek(s);
  if (!f) return 1;
  const c = config(s);
  const ignore = Math.min(0.8, DEF_IGNORE + (f.turn?.boon ? c.boonIgnore : 0));
  return (1 - ignore) * (f.shred ? 1 - f.shred.rate : 1);
}
// S2: Skill kế tiếp trong cửa sổ giảm 1 MP, tối thiểu 1.
function adjustCost(s, cost) {
  const f = peek(s);
  return f?.discount && cost > 1 ? Math.max(1, cost - 1) : cost;
}
const defendExtraMana = (s) =>
  turnOf(s)?.mode === "ho" ? config(s).hoMana : 0;
const potionFactor = (s) => (turnOf(s)?.mode === "dan" ? config(s).danHeal : 1);
// Luật Hộ: giảm sát thương phản công hiện tại và kế tiếp; phản công kế tiếp còn được hưởng hiệu quả Defense.
const guardRate = (s) => (peek(s)?.hoRounds > 0 ? config(s).hoReduce : 0);
const carryDefend = (s) => peek(s)?.hoRounds === 1;
function counterDone(s) {
  const f = peek(s);
  if (f?.hoRounds > 0) f.hoRounds--;
}
function barrierAmount(s) {
  return peek(s)?.barrier || 0;
}
function absorb(s, damage) {
  const f = peek(s);
  if (!f || !(f.barrier > 0)) return damage;
  const used = Math.min(f.barrier, damage);
  f.barrier -= used;
  if (used > 0 && config(s).s4Bonus > 0) f.s4 = true;
  return damage - used;
}
function gainMana(s, amount) {
  const before = s.mana;
  s.mana = Math.min(
    require("../bosses/mechanics").effectiveMaxMana(s),
    s.mana + amount,
  );
  return s.mana - before;
}
const icon = () => SKILL_ICONS.rha_kor;
// Cổ Luật đang mở: đã mở trong phòng này, hoặc S1 mang từ phòng trước sang (chưa có khung combat mới).
function lawOpen(s) {
  if (!enabled(s) || s.encounter?.type !== "combat") return false;
  const f = peek(s);
  return Boolean(f ? f.law : level(s) >= 1 && s.rhaCarry?.law);
}
// Action kế tiếp có hiệu ứng riêng của Rha-Kor không (dùng chọn icon nút: có hiệu ứng → icon đặc biệt, không → icon chung).
function actionBoosted(s, action) {
  if (!enabled(s) || s.encounter?.type !== "combat") return false;
  const law = lawOpen(s);
  if (action === "defend" || action === "potion") return law;
  if (action === "attack") {
    const f = peek(s);
    return law || Boolean(f && (f.boon || f.penalty || f.s4 || f.leech));
  }
  return false;
}
function setShred(f, rate, actions) {
  if (f.shred && f.shred.rate > rate) {
    f.shred.turns = Math.max(f.shred.turns, actions + 1);
    return;
  }
  f.shred = { rate, turns: actions + 1 };
}
// Xử lý sau action: hoàn thành luật, hiệu ứng theo luật, Quyền Khắc, S1/S2 và hết hạn các cửa sổ.
// api: { landed: hit chính gây sát thương, dealt, heal(amount), shrine }
function after(s, api = {}) {
  const f = frame(s),
    out = { log: "" };
  const t = f?.turn;
  if (!t) return out;
  f.turn = null;
  const c = config(s);
  let completed = false,
    opened = false;
  if (t.mode === "open") {
    opened = true;
    f.law = { window: c.lawWindow + (api.shrine ? 1 : 0) };
    out.log +=
      "\n" +
      icon() +
      " " +
      NAMES.open +
      ": mở Cổ Luật (" +
      f.law.window +
      " action); chọn Attack, Defense, Potion hoặc Skill để thi triển.";
  } else if (t.mode === "doan" && api.landed) {
    completed = true;
    setShred(f, c.doanShred, c.doanShredActions);
    out.log +=
      "\n" +
      icon() +
      " " +
      NAMES.doan +
      ": +" +
      Math.round(c.doan * 100) +
      "% DMG, giảm " +
      Math.round(c.doanShred * 100) +
      "% DEF mục tiêu trong " +
      c.doanShredActions +
      " action.";
  } else if (t.mode === "phan" && api.landed) {
    completed = true;
    setShred(f, c.phanShred, c.phanShredActions);
    out.log +=
      "\n" +
      icon() +
      " " +
      NAMES.phan +
      ": " +
      Math.round(c.phan * (t.discount && c.s2 ? c.s2Bonus : 1) * 100) +
      "% ST vật lý, giảm " +
      Math.round(c.phanShred * 100) +
      "% DEF mục tiêu.";
  } else if (t.mode === "ho") {
    completed = true;
    const barrier = Math.floor(s.maxHp * c.barrier);
    f.barrier += barrier;
    f.hoRounds = 2;
    f.penalty = true;
    out.log +=
      "\n" +
      icon() +
      " " +
      NAMES.ho +
      ": Barrier " +
      barrier +
      ", hồi 2 MP, giảm " +
      Math.round(c.hoReduce * 100) +
      "% sát thương nhận (phản công này và kế tiếp); Attack kế tiếp −" +
      Math.round(c.hoPenalty * 100) +
      "% DMG.";
  } else if (t.mode === "dan") {
    completed = true;
    f.leech = true;
    out.log +=
      "\n" +
      icon() +
      " " +
      NAMES.dan +
      ": hồi thêm " +
      Math.round((c.danHeal - 1) * 100) +
      "% HP; Attack kế tiếp hồi " +
      Math.round(c.leech * 100) +
      "% sát thương gây ra.";
  }
  // Mỗi action sau khi mở luật làm cửa sổ giảm 1 (hết hạn khi về 0).
  if (!opened && f.law && --f.law.window <= 0) f.law = null;
  if (t.boon)
    out.log +=
      "\n" +
      icon() +
      " Quyền Khắc: +" +
      Math.round(c.boonBonus * 100) +
      "% DMG, bỏ qua thêm " +
      Math.round(c.boonIgnore * 100) +
      "% DEF.";
  if (t.action === "attack") {
    if (t.penalty) f.penalty = false;
    if (t.s4) {
      f.s4 = false;
      out.log +=
        "\n" +
        icon() +
        " Luật Hộ Phản Chấn: Attack +" +
        Math.round(c.s4Bonus * 100) +
        "% DMG.";
    }
    if (t.leech) {
      f.leech = false;
      const gained =
        api.heal && api.dealt > 0
          ? api.heal(Math.floor(api.dealt * c.leech))
          : 0;
      if (api.dealt > 0)
        out.log +=
          "\n" + E.hp + " Luật Dẫn: hồi " + gained + " HP từ sát thương.";
    }
  }
  if (t.action === "skill") {
    if (c.s1 && f.skillsCast === 0 && api.landed) {
      const got = gainMana(s, 1);
      if (got)
        out.log +=
          "\n" +
          soulIcon("rha_kor", 1) +
          " " +
          E.mana +
          " Bia Khai Mệnh: hoàn " +
          got +
          " MP.";
    }
    f.skillsCast++;
  }
  // S2: Skill dùng giảm MP; trượt thì giữ lại cho lần Skill kế tiếp.
  if (t.discount) {
    f.discount = api.landed ? null : { window: c.discountWindow, fresh: true };
    if (t.mode === "phan" && c.s2)
      out.log +=
        "\n" +
        soulIcon("rha_kor", 2) +
        " Nét Khắc Bền Vững: giảm 1 MP, Luật Phán +" +
        Math.round((c.s2Bonus - 1) * 100) +
        "% DMG.";
  }
  // Mỗi Cổ Luật mới chỉ mở một lần giảm MP (S2).
  if (opened && c.s2) f.discount = { window: c.discountWindow, fresh: true };
  if (f.discount) {
    if (f.discount.fresh) delete f.discount.fresh;
    else if (--f.discount.window <= 0) f.discount = null;
  }
  // Quyền Khắc còn từ trước hết hạn dần; Quyền Khắc vừa tạo bắt đầu tính từ action kế tiếp.
  if (f.boon && --f.boon.window <= 0) f.boon = null;
  if (completed && c.boon) {
    f.boon = { window: c.boonWindow };
    out.log +=
      "\n" +
      icon() +
      " Hoàn thành " +
      NAMES[t.mode] +
      ": nhận Quyền Khắc (" +
      c.boonWindow +
      " action).";
  }
  if (f.shred && --f.shred.turns <= 0) f.shred = null;
  if (c.carry) {
    if (f.law)
      s.rhaCarry = {
        law: { window: f.law.window },
        ...(f.discount && c.s2
          ? { discount: { window: f.discount.window } }
          : {}),
      };
    else delete s.rhaCarry;
  }
  return out;
}
// Hành động của boss (không thuộc Attack/Defense/Potion/Skill) làm Cổ Luật đang mở kết thúc.
function offAction(s) {
  const f = peek(s);
  if (f?.law) f.law = null;
  delete s.rhaCarry;
}
function lawText(f) {
  return f?.law
    ? "Cổ Luật mở (" + f.law.window + " action)"
    : "Chưa mở Cổ Luật";
}
function innateText(s) {
  const c = config(s),
    f = peek(s);
  return (
    "**Nét Khắc Không Thể Né** · có từ tầng 1\n" +
    "Attack và Skill bỏ qua 15% DEF hiệu lực của mục tiêu.\n" +
    "**Khai Bia Cổ Luật** (Skill · 2 MP · " +
    Math.round(c.open * 100) +
    "% ST vật lý) mở Cổ Luật cho " +
    c.lawWindow +
    " action kế tiếp:\n" +
    "• **Luật Đoạn** (Attack): +" +
    Math.round(c.doan * 100) +
    "% DMG, giảm " +
    Math.round(c.doanShred * 100) +
    "% DEF mục tiêu trong 2 action.\n" +
    "• **Luật Hộ** (Defense): Barrier " +
    Math.round(c.barrier * 100) +
    "% Max HP, hồi 2 MP, giảm 25% sát thương nhận và hiệu quả Defense cho action kế tiếp; Attack kế tiếp −12% DMG.\n" +
    "• **Luật Dẫn** (Potion): hồi thêm 15% HP; Attack kế tiếp hồi 12% sát thương gây ra.\n" +
    "• **Luật Phán** (Skill lần hai): " +
    Math.round(c.phan * 100) +
    "% ST vật lý, giảm 25% DEF mục tiêu trong 1 action, kết thúc luật.\n" +
    "**Hiện tại:** " +
    lawText(f) +
    ".\n"
  );
}
function awakeningText(s) {
  const c = config(s),
    f = peek(s);
  return (
    "**Quyền Khắc Cổ Luật** · Uru Stone Tablet\nHoàn thành một Luật tạo 1 Quyền Khắc (" +
    c.boonWindow +
    " action). Attack/Skill kế tiếp tự tiêu thụ: +" +
    Math.round(c.boonBonus * 100) +
    "% sát thương sau kháng và bỏ qua thêm 20% DEF. " +
    (f?.boon
      ? "Hiện tại: đang có Quyền Khắc (" + f.boon.window + " action)."
      : "Hiện tại: chưa có Quyền Khắc.")
  );
}
function status(s) {
  const f = peek(s);
  if (!f) return "Chưa vào trận";
  const parts = [lawText(f)];
  if (f.boon) parts.push("Quyền Khắc (" + f.boon.window + ")");
  if (f.shred)
    parts.push(
      "DEF mục tiêu −" +
        Math.round(f.shred.rate * 100) +
        "% (" +
        Math.max(0, f.shred.turns - 1) +
        " action)",
    );
  if (f.barrier > 0) parts.push("Barrier " + Math.floor(f.barrier));
  if (f.hoRounds > 0) parts.push("Giảm sát thương nhận 25%");
  if (f.penalty) parts.push("Attack kế tiếp −12%");
  if (f.leech) parts.push("Attack kế tiếp hồi máu");
  if (f.discount) parts.push("Skill kế tiếp −1 MP");
  return parts.join(" · ");
}
module.exports = {
  NAMES,
  enabled,
  config,
  frame,
  peek,
  validate,
  begin,
  turnMultiplier,
  defenseFactor,
  adjustCost,
  defendExtraMana,
  potionFactor,
  lawOpen,
  actionBoosted,
  guardRate,
  carryDefend,
  counterDone,
  barrierAmount,
  absorb,
  after,
  offAction,
  innateText,
  awakeningText,
  status,
};
