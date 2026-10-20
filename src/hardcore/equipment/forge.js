"use strict";
// Horadric Forge v2: mượn trang bị, nâng +2 level rồi trả lại sau một số tầng.
const LEVELS = 2;
const LAST_EVENT_FLOOR = 950;
const RETURN_AFTER = Object.freeze({
  common: 0,
  rare: 10,
  legendary: 25,
  cursed: 50,
  limited: 50,
});
const RARITY_LABEL = Object.freeze({
  common: "R",
  rare: "SR",
  legendary: "SSR",
  cursed: "UR",
  limited: "LR",
});
const delay = (item) => RETURN_AFTER[item.definition.rarity] ?? 50;
const instant = (item) => delay(item) === 0;
const eligible = (state) =>
  state.floor <= LAST_EVENT_FLOOR && state.items.length > 0;
const loans = (state) => state.forgeLoans || [];
// Tầng đến hạn là tầng kế tiếp sau N tầng; không quá 998 để món luôn về trước boss cuối.
const dueFloor = (state, item) =>
  Math.min(998, state.floor + delay(item) + 1);
// Tầng hợp lệ để nhận lại: không phải tầng boss/cổng cố định.
const validFloor = (floor) =>
  floor % 50 !== 0 && ![333, 666, 999].includes(floor);
// UR/nguyền: cấp nguyền giữ nguyên vì 2 level thêm được ghi là đã giải.
const cursedBonus = (definition) => (definition.curse ? LEVELS : 0);
function prepareV2(targetId = null) {
  return { version: 2, targetId };
}
const PAGE_SIZE = 25;
const pages = (state) => Math.max(1, Math.ceil(state.items.length / PAGE_SIZE));
const page = (state) =>
  Math.max(
    0,
    Math.min(pages(state) - 1, Math.floor(Number(state.encounter.forgePage) || 0)),
  );
const pageItems = (state) =>
  state.items.slice(page(state) * PAGE_SIZE, (page(state) + 1) * PAGE_SIZE);
const selected = (state) =>
  state.items.find((x) => x.definition.id === state.encounter.forge?.targetId) ||
  null;
function lend(state, item, receive, recompute) {
  const label = RARITY_LABEL[item.definition.rarity] || item.rarity;
  if (instant(item)) {
    receive(
      state,
      item.definition,
      LEVELS,
      cursedBonus(item.definition),
      { receipt: false },
    );
    return { instant: true, label, from: item.level, to: item.level + LEVELS };
  }
  state.items = state.items.filter((x) => x !== item);
  const loan = {
    version: 1,
    definition: structuredClone(item.definition),
    name: item.name,
    level: item.level,
    cleansedLevels: item.cleansedLevels || 0,
    from: state.floor,
    due: dueFloor(state, item),
  };
  state.forgeLoans = [...loans(state), loan];
  recompute(state);
  return { instant: false, label, loan };
}
// Trả mọi món đến hạn; gộp level với món cùng ID nếu người chơi đã nhặt được.
function returnDue(state, receive) {
  const due = loans(state).filter(
    (l) => state.floor >= l.due && validFloor(state.floor),
  );
  if (!due.length) return "";
  state.forgeLoans = loans(state).filter((l) => !due.includes(l));
  if (!state.forgeLoans.length) delete state.forgeLoans;
  return due
    .map((l) => {
      const merged = state.items.some((x) => x.definition.id === l.definition.id);
      const item = receive(
        state,
        l.definition,
        l.level + LEVELS,
        l.cleansedLevels + cursedBonus(l.definition),
        { receipt: false },
      );
      return (
        "\n🔨 Horadric Forge trả lại **" +
        l.name +
        "** · Lv." +
        l.level +
        " → **" +
        item.level +
        "**" +
        (merged ? " (đã gộp với món cùng loại đang có)" : "") +
        "."
      );
    })
    .join("");
}
function validateLoans(state) {
  const list = state.forgeLoans;
  if (list == null) return;
  if (
    !Array.isArray(list) ||
    !list.length ||
    list.length > 50 ||
    list.some(
      (l) =>
        l?.version !== 1 ||
        !l.definition?.id ||
        typeof l.name !== "string" ||
        !Number.isSafeInteger(l.level) ||
        l.level < 1 ||
        !Number.isSafeInteger(l.cleansedLevels) ||
        l.cleansedLevels < 0 ||
        l.cleansedLevels > l.level ||
        !Number.isSafeInteger(l.from) ||
        !Number.isSafeInteger(l.due) ||
        l.due <= l.from ||
        l.due > 998,
    )
  )
    throw Error("INVALID_FORGE_LOANS");
}
function prepare(state, targetId) {
  const main = ["sorceress", "necromancer", "druid", "venance"].includes(
    state.classKey,
  )
    ? "ene"
    : ["amazon", "assassin"].includes(state.classKey)
      ? "dex"
      : "str";
  return {
    version: 1,
    targetId,
    stage: "grind",
    boons: [
      { key: main, amount: 1 },
      { key: "vit", amount: 1 },
      {
        key: ["amazon", "assassin"].includes(state.classKey)
          ? "accuracy"
          : ["sorceress", "necromancer", "venance"].includes(state.classKey)
            ? "resistance"
            : "defense",
        amount: 1,
      },
    ],
  };
}
function rewardLabel(b) {
  const label =
    { accuracy: "ACC", defense: "DEF", resistance: "RES" }[b.key] ||
    b.key.toUpperCase();
  return (
    "+" + b.amount + " " + label + (b.key === "resistance" ? " (điểm %)" : "")
  );
}
function rewardIcon(b) {
  const { E } = require("../shared/icons");
  return E[{ resistance: "res" }[b.key] || b.key] || E.shrine;
}
function choices(f, state = null) {
  if (f.version === 2) {
    const item = state?.items.find((x) => x.definition.id === f.targetId);
    const current = state ? page(state) : 0;
    return [
      {
        action: "forge_lend",
        label: !item
          ? "Chọn món ở menu"
          : instant(item)
            ? "Nâng cấp ngay +2 Lv"
            : "Mượn để nâng +2 Lv",
        disabled: !item,
      },
      ...(state?.items || []).map((x) => ({
        action: "forge_select_" + x.definition.id,
        label: x.name,
      })),
      ...(current > 0
        ? [{ action: "forge_page_" + (current - 1), label: "Món trước" }]
        : []),
      ...(state && current + 1 < pages(state)
        ? [{ action: "forge_page_" + (current + 1), label: "Món tiếp" }]
        : []),
    ];
  }
  return f.stage === "grind"
    ? [
        {
          action: "forge_grind",
          label: "Xác nhận nghiền 1 cấp",
          description: "Mất buff của cấp này, rồi chọn một phần thưởng chỉ số.",
        },
      ]
    : f.boons.map((b, i) => ({
        action: "forge_boon_" + i,
        label: "Nhận " + rewardLabel(b),
        description: "Cộng chỉ số trong run; không dùng hoặc nhận vé.",
      }));
}
module.exports = {
  LEVELS,
  LAST_EVENT_FLOOR,
  RETURN_AFTER,
  RARITY_LABEL,
  delay,
  instant,
  eligible,
  loans,
  dueFloor,
  validFloor,
  prepareV2,
  PAGE_SIZE,
  pages,
  page,
  pageItems,
  selected,
  lend,
  returnDue,
  validateLoans,
  prepare,
  choices,
  rewardLabel,
  rewardIcon,
};
