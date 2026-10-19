"use strict";
const { E, RIFT_ICONS } = require("./shared/icons");
// Rules version 2 is snapshotted for Survival V3 runs started before 3.2.0; version 3 (3.2.0+) adds the four elite effects.
const KEYS_V2 = [
  "stone_skin",
  "elemental_dominion",
  "bloodlust",
  "unstable_rift",
  "fortified",
  "swift_horror",
  "soul_drain",
  "cursed_ground",
];
// Hiệu ứng elite (chỉ elite sinh từ roll encounter thường nhận 1 trong 4):
// arcane_ward = RES, deathburst = Cảm tử, iron_hide = DEF, predator = tỷ lệ Crit. Mỗi stack tiến dần tới mức tối đa ở stack 12.
const ELITE_KEYS = ["arcane_ward", "deathburst", "iron_hide", "predator"];
const KEYS_V3 = [...KEYS_V2, ...ELITE_KEYS];
const KEYS = KEYS_V3;
const RULES_VERSIONS = [2, 3];
const ELITE_MAX = Object.freeze({
  def: 0.7, // giảm sát thương vật lý tối đa = trần hiện có của defenseReduction
  res: 70, // RES tối đa (%)
  crit: 0.18, // Crit gấp 3 lần mức gốc 6%
  blast: 0.5, // vụ nổ Cảm tử = 50% sát thương phép của quái
});
const ELITE_FULL = 12;
const keysOf = (s) => (s?.rift?.version === 3 ? KEYS_V3 : KEYS_V2);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function enabled(s) {
  return (
    s.gameplayVersion === 3 &&
    RULES_VERSIONS.includes(s.rift?.version) &&
    !s.mode?.startsWith("tower") &&
    !s.towerChallengeId
  );
}
function activate(s, version = 3) {
  const keys = version === 3 ? KEYS_V3 : KEYS_V2;
  s.rift = {
    version,
    stacks: Object.fromEntries(keys.map((k) => [k, 0])),
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
  if (!RULES_VERSIONS.includes(s.rift.version) || s.gameplayVersion !== 3)
    throw Error("UNSUPPORTED_RIFT_VERSION");
  const r = s.rift,
    KEYS = keysOf(s);
  if (
    !r.stacks ||
    !Array.isArray(r.bag) ||
    ![0, KEYS.length].includes(r.bag.length) ||
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
      e.version !== r.version ||
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
  const fx = s.encounter?.eliteEffect;
  if (
    fx &&
    (r.version !== 3 ||
      s.encounter.rank !== "elite" ||
      !ELITE_KEYS.includes(fx.key) ||
      !Number.isInteger(fx.stacks) ||
      fx.stacks < 1 ||
      fx.stacks > 12)
  )
    throw Error("INVALID_ELITE_EFFECT");
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
    bag = keysOf(s).slice();
    for (let i = bag.length - 1; i > 0; i--) {
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
  if (!enabled(s) || k === "unstable_rift" || !keysOf(s).includes(k))
    throw Error("INVALID_RIFT_SEVERANCE");
  const old = count(s, k);
  s.rift.stacks[k] = 0;
  s.modifiers = s.rift.stacks;
  return old;
}
function clear(s) {
  if (!enabled(s)) return;
  for (const k of keysOf(s)) s.rift.stacks[k] = 0;
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
    version: s.rift.version,
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
    return `\n${RIFT_ICONS.soul_drain} Soul Drain: Phòng thủ tiêu 1 lần hút, giữ MP.`;
  }
  if (s.mana <= 0) return "";
  s.mana--;
  r.soulDrainCharges--;
  r.manaFracture = true;
  return `\n${RIFT_ICONS.soul_drain} Soul Drain: −1 ${E.mana}, đánh thường kế tiếp hồi thêm 1 ${E.mana}.`;
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
function enemyResistance(s, base) {
  const r = encounter(s);
  return r?.brokenArmor
    ? Math.round(
        base * (1 - [0, 0.08, 0.12, 0.16][tier(r.stacks.stone_skin)]) * 100,
      ) / 100
    : base;
}
function stoneStatus(s) {
  const r = encounter(s);
  if (!r) return "";
  return (
    E.defense +
    ` Lá chắn đá **${r.stoneArmor} / ${r.stoneArmorMax} HP**` +
    (r.brokenArmor
      ? ` · đã vỡ: ${E.defres} **DEF/RES giảm ${[0, 8, 12, 16][tier(r.stacks.stone_skin)]}%**`
      : "")
  );
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
// ---- Hiệu ứng elite (Rift v3) ----
const eliteFraction = (stacks) => clamp(stacks, 0, ELITE_FULL) / ELITE_FULL;
const ELITE_NAMES = Object.freeze({
  arcane_ward: "Arcane Ward",
  deathburst: "Deathburst",
  iron_hide: "Iron Hide",
  predator: "Predator",
});
// Chỉ gọi cho elite sinh từ roll encounter thường (không phải elite của event). Chọn ngẫu nhiên 1 trong các loại đã có stack.
function assignEliteEffect(s, e, rng) {
  if (
    !enabled(s) ||
    s.rift.version !== 3 ||
    e.rank !== "elite" ||
    e.eliteEffect
  )
    return e;
  const candidates = ELITE_KEYS.filter((k) => count(s, k) > 0);
  if (!candidates.length) return e;
  const key = candidates[Math.floor(rng() * candidates.length)],
    stacks = count(s, key),
    t = eliteFraction(stacks);
  e.eliteEffect = { key, stacks, floor: s.floor };
  if (key === "iron_hide") {
    const base = e.defense / (e.defense + 100 + s.floor / 2),
      target = Math.min(ELITE_MAX.def, base + (ELITE_MAX.def - base) * t);
    if (target > base)
      e.defense = Math.ceil((target / (1 - target)) * (100 + s.floor / 2));
  } else if (key === "arcane_ward") {
    e.resistance = Math.round(
      e.resistance + (ELITE_MAX.res - e.resistance) * t,
    );
  } else if (key === "predator") {
    e.critChance = Number(
      (e.critChance + (ELITE_MAX.crit - e.critChance) * t).toFixed(4),
    );
  } else {
    e.blast = Number((ELITE_MAX.blast * t).toFixed(4));
  }
  return e;
}
// Cảm tử: lúc quái bị hạ gây blast × sát thương phép của nó lên người chơi, giảm bởi RES, không bao giờ hạ dưới 1 HP.
function blastDamage(e, rng, resistance) {
  if (!(e?.blast > 0)) return 0;
  const roll =
    e.damageMin + Math.floor(rng() * (e.damageMax - e.damageMin + 1));
  return Math.max(
    0,
    Math.floor(roll * e.blast * (1 - clamp(resistance, -50, 75) / 100)),
  );
}
function eliteLine(e) {
  const fx = e?.eliteEffect;
  if (!fx) return "";
  const pct = (x) => Number(x.toFixed(1)).toLocaleString("vi-VN");
  const detail = {
    arcane_ward: `RES ${e.resistance}%`,
    iron_hide: `giảm ${pct((e.defense / (e.defense + 100 + fx.floor / 2)) * 100)}% DMG vật lý`,
    predator: `Crit ${pct(e.critChance * 100)}%`,
    deathburst: `nổ ${pct(e.blast * 100)}% DMG phép khi chết`,
  }[fx.key];
  return `${RIFT_ICONS[fx.key] || E.rift} **${ELITE_NAMES[fx.key]} ×${fx.stacks}** · ${detail}`;
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
      `\n${E.defense} Lá chắn đá đã vỡ: ${E.defres} **DEF/RES quái giảm ${[0, 8, 12, 16][tier(r.stacks.stone_skin)]}%.**\n`;
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
    fmt = (x) => Number(x.toFixed(1)).toLocaleString("vi-VN");
  const lines = {
    stone_skin: `Quái nhận lá chắn đá bằng ${fmt(n * 1.5)}% Max ${E.hp} khi xuất hiện. Lá chắn hấp thụ DMG vật lý/phép; sát thương dư trừ HP quái. Vỡ lá chắn: ${E.defres} DEF/RES quái giảm ${[0, 8, 12, 16][t]}% đến hết combat. Không hồi giáp khi boss hồi HP/chuyển phase.`,
    elemental_dominion: `Quái hỗn hợp: +${fmt(n * 2)} điểm % tỷ lệ phép. Phản công phép: +${fmt(n * 1.25)}% DMG. Không tăng vật lý, true damage hoặc damage cố định.`,
    bloodlust: `Lần đầu quái xuống dưới 50% Max ${E.hp}: phản công kế +${fmt(12 + 2 * n)}% DMG; Phòng thủ chỉ nhận +${fmt((12 + 2 * n) / 2)}%. Né/chặn vẫn kết thúc lượt cuồng nộ.`,
    unstable_rift: `Hòm/kho báu +${fmt(n * 0.75)} điểm % (lấy từ quái thường); SSR kho báu an toàn +${fmt(n * 2)} điểm %; Mimic +${fmt(n * 1.5)} điểm %, Ancient Mimic +${fmt(n * 0.5)} điểm %. Giữ pity và kết quả khóa; không xóa bằng Severance.`,
    fortified: `Quái +${fmt(n * 3)}% Max ${E.hp} khi xuất hiện. Lần đầu xuống dưới 50%: action gây DMG kế của bạn +${[0, 10, 15, 20][t]}% DMG, toàn bộ hit.`,
    swift_horror: `Phản công vật lý quái +${n} điểm % trúng. Né tự nhiên: action gây DMG kế của bạn +${[0, 8, 12, 16][t]}% DMG và vật lý chắc chắn trúng. Né bảo đảm không kích hoạt; không tăng ${E.evasion} quái.`,
    soul_drain: `Tối đa ${Math.ceil(n / 4)} lần/combat. Phản công trúng hút 1 ${E.mana}; 0 ${E.mana} giữ charge, Phòng thủ tiêu charge không mất ${E.mana}, chặn/né giữ charge. Sau khi bị hút: đánh thường kế hồi thêm 1 ${E.mana}.`,
    cursed_ground: `Khi nhận vật lý: DEF gốc −${fmt(n * 2)}%. Khi nhận phép: RES gốc −${fmt(n * 1.5)} điểm %. Áp dụng trước Consecration/Class Shrine/Phòng thủ; không đổi chỉ số gốc hoặc lá chắn.`,
    arcane_ward: `Elite thường mang **Arcane Ward**: RES tiến dần tới 70% ở ×12 (hiện ×${n}: ${fmt(eliteFraction(n) * 100)}% quãng đường).`,
    deathburst: `Elite thường mang **Deathburst**: khi bị hạ nổ gây ${fmt(ELITE_MAX.blast * eliteFraction(n) * 100)}% DMG phép của nó (tối đa 50% ở ×12), giảm bởi RES của bạn, để lại ít nhất 1 ${E.hp}.`,
    iron_hide: `Elite thường mang **Iron Hide**: giảm DMG vật lý nhận vào tiến dần tới 70% ở ×12 (hiện ×${n}: ${fmt(eliteFraction(n) * 100)}% quãng đường).`,
    predator: `Elite thường mang **Predator**: tỷ lệ Crit của elite tăng dần từ 6% tới 18% ở ×12 (hiện ${fmt((0.06 + 0.12 * eliteFraction(n)) * 100)}%). Chỉ đòn vật lý Crit; Phòng thủ miễn Crit.`,
  };
  let text =
    "**Rift " + ["", "I", "II", "III"][t] + " · ×" + n + "**\n" + lines[k];
  if (k === "stone_skin" && r) text += "\nTrận này: " + stoneStatus(s);
  if (k === "soul_drain" && r)
    text +=
      "\nTrận này: " +
      (bossOwnDrain(s)
        ? "cơ chế hút ${E.mana} boss thay thế Soul Drain, giữ charge"
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
  if (s.encounter?.eliteEffect) lines.push(eliteLine(s.encounter));
  if (bossOwnDrain(s) && r.stacks.soul_drain > 0)
    lines.push(
      `${RIFT_ICONS.soul_drain} Hút ${E.mana} riêng của boss thay thế Soul Drain.`,
    );
  if (r.stoneArmorMax > 0) lines.push(stoneStatus(s));
  if (r.bloodlustReady)
    lines.push(
      "🩸 Bloodlust +" +
        (12 + 2 * r.stacks.bloodlust) +
        "% DMG · ${E.defense}: +" +
        (6 + r.stacks.bloodlust) +
        "%",
    );
  if (r.fortifiedExposed || r.swiftExposed)
    lines.push(
      `🎯 Exposed: action gây DMG kế ${
        (r.fortifiedExposed ? [0, 10, 15, 20][tier(r.stacks.fortified)] : 0) +
        (r.swiftExposed ? [0, 8, 12, 16][tier(r.stacks.swift_horror)] : 0)
      }%` + (r.swiftExposed ? " · vật lý chắc chắn trúng" : ""),
    );
  return lines.length ? "\n" + lines.join("\n") : "";
}
module.exports = {
  KEYS,
  KEYS_V2,
  KEYS_V3,
  ELITE_KEYS,
  ELITE_NAMES,
  ELITE_MAX,
  keysOf,
  assignEliteEffect,
  blastDamage,
  eliteLine,
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
  enemyResistance,
  stoneStatus,
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
