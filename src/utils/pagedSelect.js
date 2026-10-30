const PAGE_SIZE = 23; // Two slots remain for navigation in Discord's 25-option menu.
function pagedOptions(choices, selected, requestedPage = null) {
  const pages = Math.max(1, Math.ceil(choices.length / PAGE_SIZE));
  const selectedIndex = choices.findIndex(
    (choice) => choice.value === selected,
  );
  const raw =
    requestedPage === null
      ? Math.floor(Math.max(0, selectedIndex) / PAGE_SIZE)
      : Number(requestedPage);
  const page = Math.max(
    0,
    Math.min(pages - 1, Number.isSafeInteger(raw) ? raw : 0),
  );
  const options = choices
    .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    .map((choice) => ({ ...choice, default: choice.value === selected }));
  if (page > 0)
    options.push({
      label: "Trang trước",
      value: `__page:${page - 1}`,
      emoji: "⬅️",
      default: false,
    });
  if (page < pages - 1)
    options.push({
      label: "Trang sau",
      value: `__page:${page + 1}`,
      emoji: "➡️",
      default: false,
    });
  return { options, page, pages };
}
function navigationPage(value) {
  const match = /^__page:(\d{1,5})$/.exec(String(value));
  return match ? Number(match[1]) : null;
}
module.exports = { PAGE_SIZE, pagedOptions, navigationPage };
