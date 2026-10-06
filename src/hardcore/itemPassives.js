"use strict";
// One passive per distinct equipped item. Levels and absorbed stats never multiply it.
const CAPS = Object.freeze({
  berserk: 0.4,
  mpLeech: 0.35,
  guardReflect: 0.4,
  thorns: 0.2,
  shopDiscount: 0.2,
  eventLuck: 0.1,
  potionCapacity: 5,
  critCap: 0.15,
  evasionCap: 0.15,
  dodgeCounter: 0.5,
  startMana: 0.75,
  campHeal: 0.05,
  potionSave: 0.25,
  trapResistance: 0.25,
});
const groups = {
  berserk: [
    [0.1, "rusted_edge"],
    [0.15, "boss_hunters_badge"],
    [0.22, "the_last_bad_decision deimoss_scar blood_moon_edge"],
    [0.3, "glass_cannon blood_pact"],
  ],
  mpLeech: [
    [0.08, "cracked_wand"],
    [0.12, "mana_prism"],
    [0.18, "angelic_engine"],
    [0.25, "hollow_crown"],
  ],
  guardReflect: [
    [0.15, "vanguard_spear"],
    [0.25, "wardens_bulwark seraphic_aegis"],
    [0.35, "schrodingers_armor"],
  ],
  thorns: [
    [0.05, "minor_life_charm"],
    [0.12, "riftbreaker living_armor"],
    [0.18, "berserker_chains"],
  ],
  shopDiscount: [
    [0.03, "goblin_hook"],
    [0.05, "goblin_snare"],
    [0.08, "golden_goblet"],
    [0.12, "goblins_debt"],
  ],
  eventLuck: [
    [0.02, "rabbit_foot"],
    [0.03, "lucky_coin"],
    [0.04, "eternal_clover"],
    [0.06, "crown_of_ruin"],
  ],
  potionCapacity: [
    [1, "red_potion_belt alchemist_belt"],
    [2, "endless_flask titan_heart"],
  ],
  critCap: [
    [0.03, "executioners_mark"],
    [0.05, "doomwhisper"],
    [0.08, "bleeding_star"],
    [0.1, "oathbreaker"],
  ],
  evasionCap: [
    [0.03, "golden_monocle"],
    [0.05, "chrono_shard"],
    [0.08, "ashen_wings"],
  ],
  dodgeCounter: [
    [0.1, "hunter_bow"],
    [0.15, "shadowstep_boots"],
    [0.25, "predators_instinct"],
    [0.35, "broken_hourglass"],
  ],
  startMana: [
    [0.2, "mana_fragment"],
    [0.3, "spirit_lantern"],
    [0.4, "sevenfold_sigil"],
    [0.5, "soul_leash"],
  ],
  campHeal: [
    [0.01, "field_bandage"],
    [0.02, "heart_of_the_wild"],
    [0.03, "phoenix_blood worldroot_seed"],
    [0.04, "void_heart"],
  ],
  potionSave: [
    [0.08, "deep_flask"],
    [0.12, "one_more_hit"],
  ],
  trapResistance: [
    [0.05, "chest_chalk"],
    [0.1, "rift_compass"],
    [0.15, "astral_mail"],
    [0.2, "null_idol"],
  ],
};
const SCOPES = Object.freeze([
  "doors",
  "portal",
  "treasure_room",
  "fountain",
  "mirror",
]);
const PASSIVES = {};
for (const [kind, entries] of Object.entries(groups))
  for (const [amount, ids] of entries)
    for (const id of ids.split(" "))
      PASSIVES[id] = Object.freeze({ kind, amount });
for (const [id, scopes] of Object.entries({
  eye_of_rngesus: ["doors", "portal"],
  mimic_crown: ["treasure_room", "fountain"],
  void_lens: ["mirror", "portal"],
  oracle_mask: ["doors", "mirror"],
  mimics_promise: ["treasure_room", "fountain", "doors"],
  black_sun: SCOPES,
}))
  PASSIVES[id] = Object.freeze({
    kind: "foresight",
    scopes: Object.freeze([...scopes]),
  });
Object.freeze(PASSIVES);
function validate(passive) {
  if (
    !passive ||
    (!Object.hasOwn(CAPS, passive.kind) && passive.kind !== "foresight")
  )
    throw new Error("INVALID_ITEM_PASSIVE");
  if (passive.kind === "foresight") {
    if (
      !Array.isArray(passive.scopes) ||
      !passive.scopes.length ||
      new Set(passive.scopes).size !== passive.scopes.length ||
      passive.scopes.some((x) => !SCOPES.includes(x))
    )
      throw new Error("INVALID_FORESIGHT_SCOPE");
  } else if (
    !Number.isFinite(passive.amount) ||
    passive.amount <= 0 ||
    passive.amount > CAPS[passive.kind] ||
    (passive.kind === "potionCapacity" && !Number.isInteger(passive.amount))
  )
    throw new Error("INVALID_PASSIVE_AMOUNT");
  return true;
}
for (const p of Object.values(PASSIVES)) validate(p);
function forItem(definition) {
  // Explicit null disables a passive; old snapshots without this field gain the new passive for retained IDs.
  return Object.hasOwn(definition || {}, "passive")
    ? definition.passive
    : PASSIVES[definition?.id] || null;
}
function aggregate(state) {
  const totals = Object.fromEntries(Object.keys(CAPS).map((k) => [k, 0])),
    foresight = Object.fromEntries(SCOPES.map((k) => [k, 0])),
    seen = new Set();
  for (const item of state.items || []) {
    const id = item.definition?.id;
    if (!id || !(item.level > 0) || seen.has(id)) continue;
    seen.add(id);
    const p = forItem(item.definition);
    if (!p) continue;
    validate(p);
    if (p.kind === "foresight")
      for (const scope of p.scopes)
        foresight[scope] = Math.min(2, foresight[scope] + 1);
    else
      totals[p.kind] = Math.min(
        CAPS[p.kind],
        +(totals[p.kind] + p.amount).toFixed(8),
      );
  }
  return { ...totals, foresight };
}
const names = {
  doors: "Three Doors",
  portal: "Wrong Portal",
  treasure_room: "Treasure Room",
  fountain: "Blood Fountain",
  mirror: "Mirror of Fate (đập gương)",
};
const pct = (n) => +(n * 100).toFixed(3) + "%";
function describe(p) {
  if (!p) return "";
  const n = pct(p.amount);
  return (
    {
      berserk: () =>
        "Cuồng chiến: sát thương Tấn công/Skill của bạn tăng theo HP đã mất, tối đa " +
        n +
        " khi gần cạn HP.",
      mpLeech: () =>
        "Hút MP: " +
        n +
        " cơ hội hồi 1 MP cho bạn khi Tấn công/Skill gây sát thương, tối đa 1 lần/lượt.",
      guardReflect: () =>
        "Phản đòn: khi bấm Phòng thủ và sống sót, phản " +
        n +
        " HP thực mất thành sát thương vật lý lên quái.",
      thorns: () =>
        "Gai: khi sống sót sau đòn quái, phản " +
        n +
        " HP thực mất thành sát thương vật lý lên quái.",
      shopDiscount: () =>
        "Thương lượng: giảm " +
        n +
        " giá xu tại Rift Merchant/Payout Item Shop; không giảm HP, kim cương hay cửa hàng ngoài run.",
      eventLuck: () =>
        "May mắn sự kiện: tăng " +
        +(p.amount * 100).toFixed(3) +
        " điểm % tỷ lệ nhánh tốt ở Blood Fountain, Three Doors và Wrong Portal.",
      potionCapacity: () =>
        "Túi bình: tăng giới hạn của bạn thêm " +
        p.amount +
        " bình máu; không tặng bình.",
      critCap: () =>
        "Trần chí mạng: tăng " +
        +(p.amount * 100).toFixed(3) +
        " điểm % giới hạn CRIT của bạn; không cộng tỷ lệ CRIT hiện tại.",
      evasionCap: () =>
        "Trần né: tăng " +
        +(p.amount * 100).toFixed(3) +
        " điểm % giới hạn né đòn vật lý của bạn; không cộng EVA, không né phép.",
      dodgeCounter: () =>
        "Né phản kích: né tự nhiên đòn vật lý có " +
        n +
        " cơ hội phản sát thương vật lý lên quái; không tính né/chặn từ Skill.",
      startMana: () =>
        "Khởi động MP: " +
        n +
        " cơ hội hồi 1 MP cho bạn một lần khi vào mỗi combat.",
      campHeal: () =>
        "Nghỉ chân: hồi " +
        n +
        " Max HP cho bạn khi qua tầng không có combat, tối đa một lần/tầng.",
      potionSave: () =>
        "Tiết kiệm bình: " +
        n +
        " cơ hội dùng bình mà không tiêu hao; cần có bình, quái vẫn phản công.",
      trapResistance: () =>
        "Chống bẫy: giảm " +
        n +
        " HP mất do Fake Shrine/bẫy máu Wrong Portal; không giảm chi phí HP hay nguyền.",
      foresight: () =>
        "Tiên tri: biết trước an toàn/nguy hiểm của 1 lựa chọn mỗi event thuộc " +
        p.scopes.map((s) => names[s]).join(", ") +
        "; không biết trước RNGesus.",
    }[p.kind]?.() || ""
  );
}
function summary(state) {
  const a = aggregate(state),
    texts = {
      berserk: () =>
        "Cuồng chiến · DMG Tấn công/Skill của bạn tăng 0–" +
        pct(a.berserk) +
        " theo tỷ lệ HP đã mất.",
      mpLeech: () =>
        "Hút MP · Tấn công/Skill gây DMG: " +
        pct(a.mpLeech) +
        " hồi 1 MP cho bạn, một lần/hành động.",
      guardReflect: () =>
        "Phản thủ · bấm Phòng thủ và sống sót: phản " +
        pct(a.guardReflect) +
        " HP thực mất lên quái.",
      thorns: () =>
        "Gai · sống sót sau đòn quái: phản " +
        pct(a.thorns) +
        " HP thực mất lên quái.",
      shopDiscount: () =>
        "Thương lượng · giá xu trong Rift Merchant/Payout Item Shop −" +
        pct(a.shopDiscount) +
        ".",
      eventLuck: () =>
        "May mắn event · nhánh tốt Fountain/Doors/Wrong Portal +" +
        +(a.eventLuck * 100).toFixed(3) +
        " điểm % (≤95%).",
      potionCapacity: () =>
        "Túi bình · bạn giữ thêm " +
        a.potionCapacity +
        " bình (tổng " +
        (5 + a.potionCapacity) +
        "); không tặng bình.",
      critCap: () =>
        "Trần CRIT của bạn: " +
        pct(0.6 + a.critCap) +
        "; không cộng tỷ lệ CRIT hiện tại.",
      evasionCap: () =>
        "Trần né vật lý của bạn: " +
        pct(0.45 + a.evasionCap) +
        "; không cộng EVA, không né phép.",
      dodgeCounter: () =>
        "Né phản kích · né tự nhiên đòn vật lý: " +
        pct(a.dodgeCounter) +
        " phản DMG lên quái.",
      startMana: () =>
        "Khởi động MP · " +
        pct(a.startMana) +
        " hồi 1 MP cho bạn một lần/combat.",
      campHeal: () =>
        "Nghỉ chân · qua tầng không có combat: hồi " +
        pct(a.campHeal) +
        " Max HP cho bạn.",
      potionSave: () =>
        "Tiết kiệm bình · " +
        pct(a.potionSave) +
        " giữ lại bình khi dùng hợp lệ; quái vẫn phản công.",
      trapResistance: () =>
        "Chống bẫy · HP mất vì Fake Shrine/bẫy máu Wrong Portal −" +
        pct(a.trapResistance) +
        ".",
    };
  const lines = Object.keys(CAPS)
    .filter((k) => a[k] > 0)
    .map((k) => texts[k]());
  const scopes = SCOPES.filter((s) => a.foresight[s] > 0);
  if (scopes.length)
    lines.push(
      "Tiên tri · " +
        scopes
          .map((s) => names[s] + " (" + a.foresight[s] + " lựa chọn)")
          .join(", ") +
        ". Chỉ kết quả tức thời, không áp dụng RNGesus.",
    );
  if (a.thorns || a.guardReflect || a.dodgeCounter)
    lines.push(
      "Phản DMG chung/lượt ≤50% sát thương cơ bản trung bình class; chịu DEF/miễn giảm quái, không crit/kích hoạt nội tại khác.",
    );
  return lines.join("\n");
}
function goodChance(state, base) {
  return Math.min(0.95, base + aggregate(state).eventLuck);
}
function discountOffers(state, e) {
  if (!["merchant", "payout_shop"].includes(e.kind) || e.passivePriceVersion)
    return;
  const discount = aggregate(state).shopDiscount;
  for (const offer of e.offers || []) {
    offer.basePrice = offer.price;
    offer.discount = discount;
    offer.price = Math.max(1, Math.ceil(offer.basePrice * (1 - discount)));
  }
  e.passivePriceVersion = 1;
}
function prepareForecast(state, e, rng) {
  if (e.passiveForecastVersion) return e;
  e.passiveForecastVersion = 1;
  const scope =
    e.type === "trap" && e.kind === "portal"
      ? "portal"
      : e.type === "surprise"
        ? e.kind
        : null;
  const count = aggregate(state).foresight[scope] || 0;
  if (!count) return e;
  let choices = [];
  if (scope === "doors")
    choices = Object.entries(e.doors).map(([c, safe]) => ({
      action: "door_" + c,
      safe,
    }));
  if (scope === "treasure_room")
    choices = ["red", "blue", "gold"].map((c) => ({
      action: "chest_" + c,
      safe: c !== e.mimicColor,
    }));
  if (scope === "fountain")
    choices = [
      { action: "event_drink", safe: e.roll < (e.goodThreshold ?? 0.85) },
    ];
  if (scope === "mirror")
    choices = [{ action: "event_mirror_break", safe: e.roll < 0.2 }];
  if (scope === "portal") choices = [{ action: "next", safe: e.good }];
  e.passiveForecast = [];
  while (choices.length && e.passiveForecast.length < count) {
    const i =
      choices.length === 1
        ? 0
        : Math.min(choices.length - 1, Math.floor(rng() * choices.length));
    e.passiveForecast.push(choices.splice(i, 1)[0]);
  }
  return e;
}
function forecastLabel(e, action) {
  const f = e.passiveForecast?.find((x) => x.action === action);
  return f ? (f.safe ? "✓ An toàn" : "⚠ Nguy hiểm") : "";
}
module.exports = {
  PASSIVES,
  CAPS,
  SCOPES,
  validate,
  forItem,
  aggregate,
  describe,
  summary,
  goodChance,
  discountOffers,
  prepareForecast,
  forecastLabel,
};
