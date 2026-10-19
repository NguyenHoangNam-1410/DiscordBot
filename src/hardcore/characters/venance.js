"use strict";
// Venance's kit is independent of the seven starter profiles. Values are saved per run.
const { E, SKILL_ICONS, soulIcon, VENANCE_ICONS } = require("../shared/icons");
const enabled = (s) =>
  s.classKey === "venance" && require("./souls").enabled(s);
const level = (s) => require("./souls").level(s);
function snapshot(n = 0, rarity = "SSR") {
  if (
    !Number.isInteger(n) ||
    n < 0 ||
    n > 6 ||
    !["SSR", "UR", "LR"].includes(rarity) ||
    (rarity !== "SSR" && n !== 6)
  )
    throw Error("INVALID_VENANCE_PROFILE");
  return {
    version: 1,
    rarity,
    duration: 3,
    coefficient: n >= 5 ? 2.6 : n >= 1 ? 2.3 : 2,
    sigilHits: n >= 4 ? 1 : 2,
    sigilHeal: n >= 5 ? 0.07 : 0.05,
    firstBarrier: n >= 2 ? 0.06 : 0,
    thirdMultiplier: n >= 3 ? 1.6 : 1.35,
    thirdBarrier: rarity === "LR" ? 0.15 : n >= 3 ? 0.12 : 0.1,
    // S5: mỗi quái hạ bằng đòn cường hóa tạo 1 stack, hoàn 1 MP/stack khi chuỗi kết thúc. S6: hoàn thêm 2 MP khi chuỗi kết thúc.
    killMana: n >= 5 ? 1 : 0,
    endMana: n >= 6 ? 2 : 0,
    hpMultiplier: rarity === "LR" ? 1.2 : rarity === "UR" ? 1.1 : 1,
    damageMultiplier: rarity === "LR" ? 1.15 : rarity === "UR" ? 1.08 : 1,
  };
}
const config = (s) => s.venanceProfile || snapshot(level(s));
function attach(s, rarity = "SSR") {
  if (!enabled(s) || s.turn > 0 || s.cleared > 0)
    throw Error("INVALID_VENANCE_PROFILE");
  s.venanceProfile = snapshot(level(s), rarity);
  require("../engine/stats").recompute(s);
  s.hp = s.maxHp;
}
// Run state owns the cast; encounter markers reset only combat-scoped resources.
const frame = (s) =>
  enabled(s)
    ? s.venanceState ||
      (s.encounter?.venanceCombat?.version === 1
        ? s.encounter.venanceCombat
        : null)
    : null;
function prepare(s) {
  if (!enabled(s) || s.encounter?.type !== "combat") return null;
  const e = s.encounter,
    legacy = e.venanceCombat?.version === 1;
  s.venanceState ||= legacy
    ? { ...e.venanceCombat }
    : {
        version: 1,
        remaining: 0,
        hits: 0,
        ready: false,
        sigilUsed: false,
        firstBarrierUsed: false,
        barrier: 0,
      };
  if (e.venanceCombat?.version !== 2) {
    if (!legacy) {
      s.venanceState.firstBarrierUsed = false;
      s.venanceState.barrier = 0;
    }
    e.venanceCombat = { version: 2 };
  }
  return s.venanceState;
}
function finish(s) {
  const f = frame(s);
  if (f) {
    f.barrier = 0;
    f.firstBarrierUsed = false;
  }
}
const empowered = (s) => Boolean(frame(s)?.remaining > 0);
const blockedMana = (s) => Boolean(frame(s)?.empoweredAction);
const third = (s) =>
  empowered(s) && frame(s).hits === 2 && require("../awakening").active(s);
const multiplier = (s) =>
  config(s).coefficient *
  config(s).damageMultiplier *
  (third(s) ? config(s).thirdMultiplier : 1);
function begin(s, action) {
  const f = prepare(s);
  if (f) f.empoweredAction = action === "attack" && f.remaining > 0;
}
const MAX_STACKS = 3;
const gainMana = (s, amount) => {
  const before = s.mana;
  s.mana = Math.min(
    require("../bosses/mechanics").effectiveMaxMana(s),
    s.mana + amount,
  );
  return s.mana - before;
};
// Trả MP của chuỗi cường hóa: mỗi stack Dư Âm Cổ Ngữ (S5) hoàn killMana MP, kết thúc tự nhiên hoàn thêm endMana (S6).
function settle(s, f, natural) {
  const c = config(s),
    stacks = f.stacks || 0,
    gained = gainMana(s, stacks * c.killMana + (natural ? c.endMana : 0));
  f.stacks = 0;
  if (!stacks && !(natural && c.endMana > 0)) return "";
  return (
    "\n" +
    soulIcon("venance", natural && c.endMana > 0 ? 6 : 5) +
    " " +
    E.mana +
    " Cổ ngữ hoàn nguyên: hồi " +
    gained +
    " MP" +
    (stacks ? " (" + stacks + " stack Dư Âm" + (natural && c.endMana ? " + " + c.endMana + " kết thúc chuỗi" : "") + ")" : natural && c.endMana ? " (kết thúc chuỗi)" : "") +
    "."
  );
}
function end(s, action, e = s.encounter) {
  const f = e?.venanceCombat ? frame(s) : null;
  if (!enabled(s) || !f) return "";
  const c = config(s);
  let log = "";
  // S5: quái hạ bằng chính đòn cường hóa này tạo 1 stack Dư Âm Cổ Ngữ (tối đa 3).
  if (c.killMana > 0 && f.empoweredAction && f.remaining > 0 && e.hp <= 0) {
    f.stacks = Math.min(MAX_STACKS, (f.stacks || 0) + 1);
    log +=
      "\n" +
      soulIcon("venance", 5) +
      " Dư Âm Cổ Ngữ: " +
      f.stacks +
      " stack (hoàn " +
      f.stacks * c.killMana +
      " MP khi chuỗi cường hóa kết thúc).";
  }
  const active = f.remaining > 0;
  if (action !== "skill" && f.remaining > 0) f.remaining--;
  delete f.empoweredAction;
  if (active && action !== "skill" && f.remaining === 0)
    log += settle(s, f, true);
  return log;
}
function cast(s) {
  const f = prepare(s),
    c = config(s);
  // Dùng lại Skill khi chuỗi cũ còn dang dở: trả stack đã kiếm, nhưng không có hoàn MP kết thúc chuỗi (S6).
  const carry = f.remaining > 0 && (f.stacks || 0) > 0 ? settle(s, f, false) : "";
  Object.assign(f, {
    remaining: c.duration,
    hits: 0,
    ready: false,
    sigilUsed: false,
    stacks: 0,
  });
  let log = carry;
  log +=
    SKILL_ICONS.venance +
    " Astral Armament: cường hóa 3 hành động chiến đấu tiếp theo, giữ qua phòng; đánh thường thành phép ×" +
    c.coefficient +
    ", không hồi " +
    E.mana +
    ".";
  if (c.firstBarrier > 0 && !f.firstBarrierUsed) {
    f.firstBarrierUsed = true;
    f.barrier = Math.max(f.barrier, Math.floor(s.maxHp * c.firstBarrier));
    log +=
      "\n" +
      soulIcon("venance", 2) +
      " " +
      E.defense +
      " Barrier: " +
      f.barrier +
      ".";
  }
  return log;
}
function defend(s, heal) {
  const f = prepare(s);
  if (!f?.ready) return "";
  f.ready = false;
  f.sigilUsed = true;
  return (
    "\n" +
    VENANCE_ICONS.innate +
    " Hồi lưu: " +
    E.hp +
    " hồi " +
    heal(s, s.maxHp * config(s).sigilHeal) +
    " HP."
  );
}
function target(s) {
  const b = s.encounter?.boss,
    m = b?.mechanicState;
  return {
    hp: s.encounter.hp,
    name: m?.target,
    unit: m?.targets?.[m?.target],
    unitHp: m?.targets?.[m?.target]?.hp,
    wave: m?.wave,
    phase: b?.phase,
  };
}
function sameTarget(s, before) {
  const after = target(s);
  return (
    after.hp > 0 &&
    before.name === after.name &&
    before.wave === after.wave &&
    before.phase === after.phase &&
    (!before.unit || before.unit.hp > 0)
  );
}
function afterHit(s, dealt, strength, before, applyDamage) {
  const f = frame(s),
    c = config(s);
  if (!f?.empoweredAction || dealt <= 0)
    return { log: "", dealt: 0, strength: 0 };
  f.hits++;
  let log = "";
  if (!f.sigilUsed && !f.ready && f.hits >= c.sigilHits) {
    f.ready = true;
    log +=
      "\n" +
      VENANCE_ICONS.innate +
      " Ấn Hồi lưu sẵn sàng: Phòng thủ để hồi " +
      Math.round(c.sigilHeal * 100) +
      "% " +
      E.hp +
      ".";
  }
  let extra = 0,
    extraStrength = 0;
  if (f.hits === 3 && require("../awakening").active(s) && s.encounter.hp > 0) {
    f.barrier = Math.max(f.barrier, Math.floor(s.maxHp * c.thirdBarrier));
    log +=
      "\n" + VENANCE_ICONS.awakening + " Tam trọng: Barrier " + f.barrier + ".";
  }
  return { log, dealt: extra, strength: extraStrength };
}
function absorb(s, amount) {
  const f = frame(s);
  if (!f) return amount;
  const used = Math.min(f.barrier, Math.max(0, amount));
  f.barrier -= used;
  return amount - used;
}
function status(s) {
  const f = frame(s);
  return f
    ? VENANCE_ICONS.effect +
        " Cường hóa: **" +
        f.remaining +
        "/3 hành động** · Đòn hợp lệ: **" +
        f.hits +
        "/3**" +
        (f.stacks ? " · " + E.mana + " Dư Âm: **" + f.stacks + "**" : "") +
        (f.ready ? " · " + VENANCE_ICONS.innate + " Hồi lưu sẵn sàng" : "")
    : "";
}
function innateText(s) {
  const c = config(s);
  return (
    VENANCE_ICONS.innate +
    " **Runic Reflux · Hồi Lưu Cổ Ngữ**\nPhòng thủ hồi tổng **2 " +
    E.mana +
    "**. Trong cùng một lần cường hóa, **" +
    c.sigilHits +
    " đòn đánh gây sát thương** tạo một Ấn Hồi lưu. Phòng thủ tiêu ấn để hồi **" +
    Math.round(c.sigilHeal * 100) +
    "% Max " +
    E.hp +
    "** trước phản công. Một ấn mỗi lần dùng Skill; dùng lại Skill xóa ấn cũ." +
    (c.killMana
      ? "\n" +
        soulIcon("venance", 5) +
        " **Dư Âm Cổ Ngữ (S5):** mỗi quái hạ bằng đòn cường hóa tạo **1 stack** (tối đa " +
        MAX_STACKS +
        "); khi chuỗi cường hóa kết thúc, mỗi stack hoàn **" +
        c.killMana +
        " " +
        E.mana +
        " MP**. Dùng lại Skill giữa chừng cũng trả stack đã có."
      : "") +
    (c.endMana
      ? "\n" +
        soulIcon("venance", 6) +
        " **Hoàn nguyên (S6):** khi chuỗi cường hóa hết 3 hành động, hoàn thêm **" +
        c.endMana +
        " " +
        E.mana +
        " MP** (bằng chi phí Skill). Dùng lại Skill giữa chừng không nhận khoản này. MP không vượt Max MP."
      : "") +
    "\n" +
    status(s)
  );
}
function awakeningText(s) {
  const c = config(s);
  return (
    VENANCE_ICONS.awakening +
    " **Trinity Mandate · Mệnh Lệnh Tam Trọng**\nĐòn cường hóa hợp lệ thứ ba trong cùng chuỗi tăng **" +
    Math.round((c.thirdMultiplier - 1) * 100) +
    "% DMG** và tạo **Barrier " +
    Math.round(c.thirdBarrier * 100) +
    "% Max " +
    E.hp +
    "** trước phản công nếu trận đấu còn tiếp tục. Barrier làm mới, không cộng dồn.\n" +
    status(s)
  );
}
function validate(s) {
  if (!enabled(s)) {
    if (s.venanceProfile || s.venanceState || s.encounter?.venanceCombat)
      throw Error("INVALID_VENANCE_PROFILE");
    return;
  }
  const p = s.venanceProfile,
    expected = snapshot(level(s), p?.rarity);
  // Hồ sơ cũ có "pulse" (xung S6) và chưa có killMana/endMana: nâng lên hồ sơ mới khi mọi trường còn lại khớp.
  if (
    p &&
    "pulse" in p &&
    !("killMana" in p) &&
    Object.keys(expected).every(
      (k) => ["killMana", "endMana", "coefficient"].includes(k) || p[k] === expected[k],
    )
  ) {
    delete p.pulse;
    p.killMana = expected.killMana;
    p.endMana = expected.endMana;
    p.coefficient = expected.coefficient;
  }
  // Upgrade only known previous coefficients with otherwise exact snapshots; preserve the cast.
  const previousCoefficient = level(s) >= 5 ? 2.8 : level(s) >= 1 ? 2.5 : 2.2;
  if (
    p &&
    p.coefficient === previousCoefficient &&
    Object.keys(p).sort().join() === Object.keys(expected).sort().join() &&
    Object.keys(expected).every(
      (k) => k === "coefficient" || p[k] === expected[k],
    )
  )
    p.coefficient = expected.coefficient;
  if (
    !p ||
    Object.keys(p).sort().join() !== Object.keys(expected).sort().join() ||
    Object.keys(expected).some((k) => p[k] !== expected[k])
  )
    throw Error("INVALID_VENANCE_PROFILE");
  const marker = s.encounter?.venanceCombat;
  if (
    marker &&
    (![1, 2].includes(marker.version) ||
      (marker.version === 2 &&
        (!s.venanceState || Object.keys(marker).join() !== "version")))
  )
    throw Error("INVALID_VENANCE_COMBAT");
  const f = frame(s);
  if (!f) return;
  if (
    f.version !== 1 ||
    !Number.isInteger(f.remaining) ||
    f.remaining < 0 ||
    f.remaining > 3 ||
    !Number.isInteger(f.hits) ||
    f.hits < 0 ||
    f.hits > 3 ||
    !Number.isSafeInteger(f.barrier) ||
    f.barrier < 0 ||
    (f.stacks != null &&
      (!Number.isInteger(f.stacks) || f.stacks < 0 || f.stacks > MAX_STACKS)) ||
    ["ready", "sigilUsed", "firstBarrierUsed"].some(
      (k) => typeof f[k] !== "boolean",
    ) ||
    f.empoweredAction != null
  )
    throw Error("INVALID_VENANCE_COMBAT");
  // Preserve the active cast from saves made before cross-room empowerment.
  if (marker?.version === 1) {
    s.venanceState = { ...f };
    s.encounter.venanceCombat = { version: 2 };
  }
}
module.exports = {
  enabled,
  snapshot,
  config,
  attach,
  frame,
  prepare,
  finish,
  empowered,
  blockedMana,
  third,
  multiplier,
  begin,
  end,
  cast,
  defend,
  target,
  sameTarget,
  afterHit,
  absorb,
  status,
  innateText,
  awakeningText,
  validate,
};
