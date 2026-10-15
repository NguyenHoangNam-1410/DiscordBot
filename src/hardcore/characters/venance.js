"use strict";
// Venance's kit is independent of the seven starter profiles. Values are saved per run.
const { E, SKILL_ICONS, soulIcon } = require("../shared/icons");
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
    coefficient: n >= 5 ? 2.8 : n >= 1 ? 2.5 : 2.2,
    sigilHits: n >= 4 ? 1 : 2,
    sigilHeal: n >= 5 ? 0.07 : 0.05,
    firstBarrier: n >= 2 ? 0.06 : 0,
    thirdMultiplier: n >= 3 ? 1.6 : 1.35,
    thirdBarrier: rarity === "LR" ? 0.15 : n >= 3 ? 0.12 : 0.1,
    pulse: n >= 6 ? 0.4 : 0,
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
function end(s, action, e = s.encounter) {
  const f = e?.venanceCombat ? frame(s) : null;
  if (!enabled(s) || !f) return;
  if (action !== "skill" && f.remaining > 0) f.remaining--;
  delete f.empoweredAction;
}
function cast(s) {
  const f = prepare(s),
    c = config(s);
  Object.assign(f, {
    remaining: c.duration,
    hits: 0,
    ready: false,
    sigilUsed: false,
  });
  let log =
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
    "\n✨ Hồi lưu: " +
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
      "\n✨ Ấn Hồi lưu sẵn sàng: Phòng thủ để hồi " +
      Math.round(c.sigilHeal * 100) +
      "% " +
      E.hp +
      ".";
  }
  let extra = 0,
    extraStrength = 0;
  if (f.hits === 3 && require("../awakening").active(s) && s.encounter.hp > 0) {
    f.barrier = Math.max(f.barrier, Math.floor(s.maxHp * c.thirdBarrier));
    log += "\n" + E.defense + " Tam trọng: Barrier " + f.barrier + ".";
    if (c.pulse > 0 && sameTarget(s, before)) {
      extraStrength = Math.floor(strength * c.pulse);
      extra = applyDamage(extraStrength);
      log +=
        "\n" +
        soulIcon("venance", 6) +
        " Xung tinh giới: +" +
        extraStrength +
        " DMG.";
    }
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
    ? "Cường hóa: **" +
        f.remaining +
        "/3 hành động** · Giữ qua phòng · Đòn hợp lệ: **" +
        f.hits +
        "/3**" +
        (f.ready ? " · ✨ Hồi lưu sẵn sàng" : "")
    : "";
}
function innateText(s) {
  const c = config(s);
  return (
    "**Runic Reflux · Hồi Lưu Cổ Ngữ**\nPhòng thủ hồi tổng **2 " +
    E.mana +
    "**. Trong cùng một lần cường hóa, **" +
    c.sigilHits +
    " đòn đánh gây sát thương** tạo một Ấn Hồi lưu. Phòng thủ tiêu ấn để hồi **" +
    Math.round(c.sigilHeal * 100) +
    "% Max " +
    E.hp +
    "** trước phản công. Một ấn mỗi lần dùng Skill; dùng lại Skill xóa ấn cũ.\n" +
    status(s)
  );
}
function awakeningText(s) {
  const c = config(s);
  return (
    "**Trinity Mandate · Mệnh Lệnh Tam Trọng**\nĐòn cường hóa hợp lệ thứ ba trong cùng chuỗi tăng **" +
    Math.round((c.thirdMultiplier - 1) * 100) +
    "% DMG** và tạo **Barrier " +
    Math.round(c.thirdBarrier * 100) +
    "% Max " +
    E.hp +
    "** trước phản công nếu trận đấu còn tiếp tục. Barrier làm mới, không cộng dồn." +
    (c.pulse
      ? " S6 thêm một xung **40% DMG đòn chính sau kháng**, không chuyển mục tiêu hay hồi MP."
      : "") +
    "\n" +
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
