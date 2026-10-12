"use strict";
// Rules version 2 is snapshotted only for new Survival V3 runs.
const KEYS = [
  "stone_skin",
  "elemental_dominion",
  "bloodlust",
  "unstable_rift",
  "fortified",
  "swift_horror",
  "soul_drain",
  "cursed_ground",
];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function enabled(s) {
  return (
    s.gameplayVersion === 3 &&
    s.rift?.version === 2 &&
    !s.mode?.startsWith("tower") &&
    !s.towerChallengeId
  );
}
function activate(s) {
  s.rift = {
    version: 2,
    stacks: Object.fromEntries(KEYS.map((k) => [k, 0])),
    bag: [],
    bagIndex: 0,
    cycle: 1,
    lastAwardFloor: 0,
  };
  s.modifiers = s.rift.stacks;
}
function count(s, k) {
  return enabled(s) ? s.rift.stacks[k] || 0 : 0;
}
function tier(n) {
  return n <= 0 ? 0 : n <= 4 ? 1 : n <= 8 ? 2 : 3;
}
function normalize(s) {
  if (s.rift == null) return;
  if (s.rift.version !== 2 || s.gameplayVersion !== 3)
    throw Error("UNSUPPORTED_RIFT_VERSION");
  const r = s.rift;
  if (
    !r.stacks ||
    !Array.isArray(r.bag) ||
    ![0, 8].includes(r.bag.length) ||
    new Set(r.bag).size !== r.bag.length ||
    r.bag.some((k) => !KEYS.includes(k)) ||
    !Number.isInteger(r.bagIndex) ||
    r.bagIndex < 0 ||
    r.bagIndex > r.bag.length ||
    !Number.isInteger(r.cycle) ||
    r.cycle < 1
  )
    throw Error("INVALID_RIFT_BAG");
  for (const k of KEYS) {
    if (!Number.isFinite(r.stacks[k])) throw Error("INVALID_RIFT_STACK");
    r.stacks[k] = clamp(Math.floor(r.stacks[k]), 0, 12);
  }
  r.lastAwardFloor ??= 0;
  if (
    !Number.isInteger(r.lastAwardFloor) ||
    r.lastAwardFloor < 0 ||
    r.lastAwardFloor > 960
  )
    throw Error("INVALID_RIFT_AWARD");
  if (
    r.pendingAward &&
    (!KEYS.includes(r.pendingAward.key) ||
      r.pendingAward.floor !== r.lastAwardFloor ||
      r.pendingAward.floor % 10 !== 0 ||
      r.pendingAward.floor < 10)
  )
    throw Error("INVALID_RIFT_PENDING_AWARD");
  s.modifiers = r.stacks;
  const e = s.encounter?.rift;
  if (e) {
    if (
      KEYS.some(
        (k) =>
          !Number.isInteger(e.stacks?.[k]) ||
          e.stacks[k] < 0 ||
          e.stacks[k] > 12,
      ) ||
      [
        "brokenArmor",
        "bloodlustReady",
        "fortifiedExposed",
        "swiftExposed",
        "manaFracture",
        "counterLocked",
      ].some((k) => typeof e[k] !== "boolean") ||
      ["bloodlustUsedByPhase", "fortifiedUsedByPhase"].some(
        (k) =>
          !e[k] ||
          Array.isArray(e[k]) ||
          typeof e[k] !== "object" ||
          Object.entries(e[k]).some(
            ([phase, used]) => !/^\d+$/.test(phase) || used !== true,
          ),
      )
    )
      throw Error("INVALID_RIFT_ENCOUNTER");
    if (
      e.version !== 2 ||
      !e.stacks ||
      !["physical", "magic", "true"].includes(e.lockedCounterType) ||
      !Number.isSafeInteger(e.stoneArmor) ||
      !Number.isSafeInteger(e.stoneArmorMax) ||
      e.stoneArmor < 0 ||
      e.stoneArmor > e.stoneArmorMax ||
      !Number.isInteger(e.soulDrainCharges) ||
      e.soulDrainCharges < 0 ||
      e.soulDrainCharges > 3
    )
      throw Error("INVALID_RIFT_ENCOUNTER");
  }
}
function award(s, floor, rng) {
  if (
    !enabled(s) ||
    floor % 10 !== 0 ||
    floor > 960 ||
    floor < 10 ||
    floor <= s.rift.lastAwardFloor
  )
    return null;
  const r = s.rift;
  let bag = r.bag.slice(),
    index = r.bagIndex,
    cycle = r.cycle;
  if (index === bag.length) {
    if (bag.length) cycle++;
    bag = KEYS.slice();
    for (let i = 7; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    index = 0;
  }
  const key = bag[index],
    before = count(s, key);
  if (before >= 12) throw Error("RIFT_STACK_CAP");
  r.bag = bag;
  r.bagIndex = index + 1;
  r.cycle = cycle;
  r.lastAwardFloor = floor;
  r.stacks[key] = before + 1;
  return {
    key,
    before,
    after: before + 1,
    tierChanged: tier(before) > 0 && tier(before) !== tier(before + 1),
  };
}
function reserve(s, floor, rng) {
  if (s.rift.pendingAward) throw Error("RIFT_PENDING_AWARD");
  const result = award(s, floor, rng);
  if (!result) return null;
  s.rift.stacks[result.key] = result.before;
  s.rift.pendingAward = { key: result.key, floor };
  return result;
}
function claimPending(s) {
  if (!enabled(s) || !s.rift.pendingAward) return null;
  const key = s.rift.pendingAward.key,
    before = count(s, key);
  if (before >= 12) throw Error("RIFT_STACK_CAP");
  s.rift.stacks[key] = before + 1;
  delete s.rift.pendingAward;
  return {
    key,
    before,
    after: before + 1,
    tierChanged: tier(before) > 0 && tier(before) !== tier(before + 1),
  };
}
function sever(s, k) {
  if (!enabled(s) || k === "unstable_rift" || !KEYS.includes(k))
    throw Error("INVALID_RIFT_SEVERANCE");
  const old = count(s, k);
  s.rift.stacks[k] = 0;
  s.modifiers = s.rift.stacks;
  return old;
}
function clear(s) {
  if (!enabled(s)) return;
  for (const k of KEYS) s.rift.stacks[k] = 0;
  s.modifiers = s.rift.stacks;
}
function encounter(s) {
  return enabled(s) && s.encounter?.type === "combat" ? s.encounter.rift : null;
}
function snapshot(s, e) {
  if (!enabled(s) || e.type !== "combat" || e.rift) return e;
  const stacks = { ...s.rift.stacks },
    stoneArmor = Math.floor(e.maxHp * 0.015 * stacks.stone_skin);
  e.rift = {
    version: 2,
    stacks,
    stoneArmor,
    stoneArmorMax: stoneArmor,
    brokenArmor: false,
    bloodlustReady: false,
    bloodlustUsedByPhase: {},
    fortifiedExposed: false,
    fortifiedUsedByPhase: {},
    swiftExposed: false,
    soulDrainCharges: Math.ceil(stacks.soul_drain / 4),
    manaFracture: false,
    lockedCounterType: e.nextDamageType || "physical",
    counterLocked: false,
  };
  return e;
}
function prepare(s, plan) {
  const r = encounter(s);
  if (!r) return;
  if (!r.counterLocked) {
    r.lockedCounterType = plan?.trueDamage
      ? "true"
      : plan
        ? plan.magic
          ? "magic"
          : "physical"
        : s.encounter.nextDamageType;
    r.counterFixed = !!plan && (plan.trueDamage || plan.raw != null);
    r.counterLocked = true;
    s.encounter.nextDamageType =
      r.lockedCounterType === "true" ? "magic" : r.lockedCounterType;
  }
}
function bossOwnDrain(s) {
  const e = s.encounter,
    b = e?.boss,
    m = b?.mechanicState;
  if (!b) return false;
  return b.version === 1
    ? ["lazarus", "phoboss", "giyua"].includes(b.id) ||
        (b.id === "kabraxis" && b.seal === "arcane")
    : ["lazarus", "baal", "atanna", "deimoss"].includes(b.id) ||
        (b.id === "uldyssian" && m.clone === "skill");
}
function counter(s, plan) {
  const r = encounter(s);
  return r ? { ...plan, magic: r.lockedCounterType === "magic" } : plan;
}
function counterFactor(s, plan, defend) {
  const r = encounter(s);
  if (!r || plan.trueDamage || plan.raw != null) return 1;
  return (
    (plan.magic ? 1 + 0.0125 * r.stacks.elemental_dominion : 1) *
    (r.bloodlustReady
      ? 1 + (0.12 + 0.02 * r.stacks.bloodlust) * (defend ? 0.5 : 1)
      : 1)
  );
}
function finishCounter(s, { hit, physical, defend, blocked = false }) {
  const r = encounter(s);
  if (!r) return "";
  r.bloodlustReady = false;
  if (blocked) return "";
  if (!hit && physical && r.stacks.swift_horror > 0) r.swiftExposed = true;
  if (!hit || r.soulDrainCharges <= 0 || bossOwnDrain(s)) return "";
  if (defend) {
    r.soulDrainCharges--;
    return "\n👻 Soul Drain: Phòng thủ tiêu 1 lần hút, giữ MP.";
  }
  if (s.mana <= 0) return "";
  s.mana--;
  r.soulDrainCharges--;
  r.manaFracture = true;
  return "\n👻 Soul Drain: −1 MP; đánh thường kế tiếp hồi thêm 1 MP.";
}
function nextCounter(s, rng, plan) {
  const r = encounter(s);
  if (!r) return;
  if (s.encounter.boss) {
    r.counterLocked = false;
    prepare(s, plan);
    return;
  }
  const e = s.encounter;
  r.lockedCounterType =
    e.damageType === "mixed"
      ? rng() < e.magicChance
        ? "magic"
        : "physical"
      : e.damageType;
  r.counterLocked = true;
  e.nextDamageType = r.lockedCounterType;
}
function defense(s, base) {
  const r = encounter(s);
  return r ? Math.floor(base * (1 - 0.02 * r.stacks.cursed_ground)) : base;
}
function resistancePenalty(s) {
  return (encounter(s)?.stacks.cursed_ground || 0) * 1.5;
}
function hitChance(s, base) {
  return clamp(base + (encounter(s)?.stacks.swift_horror || 0) * 0.01, 0, 1);
}
function enemyDefense(s, base) {
  const r = encounter(s);
  return r?.brokenArmor
    ? Math.floor(
        base * (1 - ([0, 0.08, 0.12, 0.16][tier(r.stacks.stone_skin)] || 0)),
      )
    : base;
}
function beginAction(s, action) {
  const r = encounter(s);
  if (!r) return;
  const damaging =
    ["attack", "skill"].includes(action) || action.startsWith("boss_");
  r.action = {
    damaging,
    swift: damaging && r.swiftExposed,
    fortified: damaging && r.fortifiedExposed,
  };
}
function outgoing(s) {
  const r = encounter(s),
    a = r?.action;
  if (!a) return 1;
  return (
    1 +
    (a.swift ? [0, 0.08, 0.12, 0.16][tier(r.stacks.swift_horror)] : 0) +
    (a.fortified ? [0, 0.1, 0.15, 0.2][tier(r.stacks.fortified)] : 0)
  );
}
function guaranteedHit(s) {
  return encounter(s)?.action?.swift === true;
}
function endAction(s, dealt) {
  const r = encounter(s);
  if (!r?.action) return;
  if (dealt > 0) {
    if (r.action.swift) r.swiftExposed = false;
    if (r.action.fortified) r.fortifiedExposed = false;
  }
  delete r.action;
}
function thresholds(s, before, after) {
  const e = s.encounter,
    r = encounter(s);
  if (!r || before < e.maxHp * 0.5 || after >= e.maxHp * 0.5) return;
  const phase = e.boss?.id === "deimoss" ? e.boss.phase || 1 : 1;
  if (r.stacks.bloodlust > 0 && !r.bloodlustUsedByPhase[phase]) {
    r.bloodlustUsedByPhase[phase] = true;
    r.bloodlustReady = after > 0;
  }
  if (r.stacks.fortified > 0 && !r.fortifiedUsedByPhase[phase]) {
    r.fortifiedUsedByPhase[phase] = true;
    r.fortifiedExposed = after > 0;
  }
}
function damage(s, amount, apply) {
  const r = encounter(s);
  if (!r) return apply(amount);
  amount = Math.max(0, Math.floor(amount));
  const absorbed = Math.min(r.stoneArmor, amount),
    before = s.encounter.hp;
  r.stoneArmor -= absorbed;
  if (absorbed > 0 && r.stoneArmor === 0) {
    r.brokenArmor = true;
    s.lastLog =
      (s.lastLog || "") +
      "\n🛡️ Stone Armor đã vỡ: DEF quái giảm " +
      [0, 8, 12, 16][tier(r.stacks.stone_skin)] +
      "%.";
  }
  const hpDamage = amount > absorbed ? apply(amount - absorbed) : 0;
  thresholds(s, before, s.encounter.hp);
  return absorbed + hpDamage;
}
function consumeFracture(s) {
  const r = encounter(s);
  if (!r?.manaFracture) return 0;
  r.manaFracture = false;
  return 1;
}
function unstable(s) {
  const n = count(s, "unstable_rift");
  return {
    encounter: 0.0075 * n,
    ssr: 0.02 * n,
    mimic: 0.015 * n,
    ancient: 0.005 * n,
  };
}
function description(k, n, s) {
  const r = encounter(s),
    t = tier(n),
    fmt = (x) => Number(x.toFixed(2)).toLocaleString("vi-VN");
  const lines = {
    stone_skin:
      "Quái nhận Stone Armor " +
      fmt(n * 1.5) +
      "% Max HP khi xuất hiện. Vật lý/phép phá giáp; sát thương dư trừ HP. Giáp vỡ: DEF quái −" +
      [0, 8, 12, 16][t] +
      "% đến hết combat. Không hồi giáp khi boss hồi HP/chuyển phase.",
    elemental_dominion:
      "Quái hỗn hợp: +" +
      fmt(n * 2) +
      " điểm % tỷ lệ phép. Phản công phép: +" +
      fmt(n * 1.25) +
      "% DMG. Không tăng vật lý, true damage hoặc damage cố định.",
    bloodlust:
      "Lần đầu quái xuống dưới 50% HP: phản công kế +" +
      fmt(12 + 2 * n) +
      "% DMG; Phòng thủ chỉ nhận +" +
      fmt((12 + 2 * n) / 2) +
      "%. Một lần/thanh HP boss 999; né/chặn vẫn kết thúc lượt cuồng nộ.",
    unstable_rift:
      "Hòm/kho báu +" +
      fmt(n * 0.75) +
      " điểm % (lấy từ quái thường); SSR kho báu an toàn +" +
      fmt(n * 2) +
      " điểm %; Mimic +" +
      fmt(n * 1.5) +
      " điểm %, Ancient Mimic +" +
      fmt(n * 0.5) +
      " điểm %. Giữ pity và kết quả khóa; không xóa bằng Severance.",
    fortified:
      "Quái +" +
      fmt(n * 3) +
      "% Max HP khi xuất hiện. Lần đầu xuống dưới 50%: action gây DMG kế của bạn +" +
      [0, 10, 15, 20][t] +
      "% DMG, toàn bộ hit. Một lần/thanh HP.",
    swift_horror:
      "Phản công vật lý quái +" +
      n +
      " điểm % trúng. Né tự nhiên: action gây DMG kế của bạn +" +
      [0, 8, 12, 16][t] +
      "% DMG và vật lý chắc chắn trúng. Né bảo đảm không kích hoạt; không tăng EVA quái.",
    soul_drain:
      "Tối đa " +
      Math.ceil(n / 4) +
      " lần/combat. Phản công trúng hút 1 MP; 0 MP giữ charge, Phòng thủ tiêu charge không mất MP, chặn/né giữ charge. Sau khi bị hút: đánh thường kế hồi thêm 1 MP.",
    cursed_ground:
      "Khi nhận vật lý: DEF gốc −" +
      fmt(n * 2) +
      "%. Khi nhận phép: RES gốc −" +
      fmt(n * 1.5) +
      " điểm %. Áp dụng trước Consecration/Class Shrine/Phòng thủ; không đổi chỉ số gốc hoặc lá chắn.",
  };
  let text =
    "**Rift " + ["", "I", "II", "III"][t] + " · ×" + n + "**\n" + lines[k];
  if (k === "stone_skin" && r)
    text +=
      "\nTrận này: Armor " +
      r.stoneArmor +
      "/" +
      r.stoneArmorMax +
      (r.brokenArmor ? " · Broken Armor" : "");
  if (k === "soul_drain" && r)
    text +=
      "\nTrận này: " +
      (bossOwnDrain(s)
        ? "cơ chế hút MP boss thay thế Soul Drain; giữ charge"
        : r.soulDrainCharges + " lần hút còn lại") +
      (r.manaFracture ? " · Mana Fracture sẵn sàng" : "");
  if (s.encounter?.boss && k === "stone_skin")
    text +=
      "\nDMG chuẩn riêng từ Brain Control, Malic, Control, portal Xazax, golem Bartuc hoặc sát thương boss tự gây giữ luật boss: bỏ qua Stone Armor/Exposed. Đòn Tấn công/Skill thông thường vẫn chịu giáp.";
  if (r?.counterFixed && ["bloodlust", "elemental_dominion"].includes(k))
    text +=
      "\nPhản công cố định/DMG chuẩn đang được ưu tiên: không nhân bonus Rift này.";
  return text;
}
function battle(s) {
  const r = encounter(s);
  if (!r) return "";
  const lines = [];
  if (bossOwnDrain(s) && r.stacks.soul_drain > 0)
    lines.push("👻 Hút MP riêng của boss thay thế Soul Drain.");
  if (r.stoneArmorMax > 0)
    lines.push(
      "🛡️ Stone Armor " +
        r.stoneArmor +
        "/" +
        r.stoneArmorMax +
        (r.brokenArmor
          ? " · DEF −" + [0, 8, 12, 16][tier(r.stacks.stone_skin)] + "%"
          : ""),
    );
  if (r.bloodlustReady)
    lines.push(
      "🩸 Bloodlust +" +
        (12 + 2 * r.stacks.bloodlust) +
        "% DMG · Phòng thủ: +" +
        (6 + r.stacks.bloodlust) +
        "%",
    );
  if (r.fortifiedExposed || r.swiftExposed)
    lines.push(
      "🎯 Exposed: action gây DMG kế +" +
        ((r.fortifiedExposed ? [0, 10, 15, 20][tier(r.stacks.fortified)] : 0) +
          (r.swiftExposed ? [0, 8, 12, 16][tier(r.stacks.swift_horror)] : 0)) +
        "%" +
        (r.swiftExposed ? " · vật lý chắc chắn trúng" : ""),
    );
  return lines.length ? "\n" + lines.join("\n") : "";
}
module.exports = {
  KEYS,
  enabled,
  activate,
  count,
  tier,
  normalize,
  award,
  reserve,
  claimPending,
  sever,
  clear,
  encounter,
  snapshot,
  prepare,
  bossOwnDrain,
  counter,
  counterFactor,
  finishCounter,
  nextCounter,
  defense,
  resistancePenalty,
  hitChance,
  enemyDefense,
  beginAction,
  outgoing,
  guaranteedHit,
  endAction,
  thresholds,
  damage,
  consumeFracture,
  unstable,
  description,
  battle,
};
