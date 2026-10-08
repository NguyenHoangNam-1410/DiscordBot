"use strict";
const PAGE_SIZE = 25;
function items(state) {
  return state.items.filter(
    (item) => item.definition.curse && item.level > (item.cleansedLevels || 0),
  );
}
function selected(state) {
  return items(state).find(
    (item) => item.definition.id === state.encounter.targetId,
  );
}
function pages(state) {
  return Math.max(1, Math.ceil(items(state).length / PAGE_SIZE));
}
function page(state) {
  return Math.max(
    0,
    Math.min(
      pages(state) - 1,
      Math.floor(Number(state.encounter.purifierPage) || 0),
    ),
  );
}
function pageItems(state) {
  return items(state).slice(
    page(state) * PAGE_SIZE,
    (page(state) + 1) * PAGE_SIZE,
  );
}
function choices(state, cost, payout) {
  const current = page(state);
  return [
    {
      action: "event_cleanse",
      label: "Giải nguyền món này",
      disabled: !selected(state) || payout < cost,
    },
    ...items(state).map((item) => ({
      action: "purifier_select_" + item.definition.id,
      label: item.name,
    })),
    ...(current > 0
      ? [{ action: "purifier_page_" + (current - 1), label: "Món trước" }]
      : []),
    ...(current + 1 < pages(state)
      ? [{ action: "purifier_page_" + (current + 1), label: "Món tiếp" }]
      : []),
  ];
}
module.exports = {
  PAGE_SIZE,
  items,
  selected,
  page,
  pages,
  pageItems,
  choices,
};
