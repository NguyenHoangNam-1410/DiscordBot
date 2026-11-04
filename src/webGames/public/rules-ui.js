"use strict";

(() => {
  const catalog = globalThis.WebGameCatalog;
  const game = catalog?.games.find(
    (item) => item.id === location.pathname.split("/")[1],
  );
  if (!game) return;
  const oldRules = document.querySelector(".rules");
  const current = document.getElementById("rules-detail");
  const label = document.getElementById("rules-label");
  const dialog =
    document.getElementById("rules-dialog") || document.createElement("dialog");
  dialog.id = "rules-dialog";
  dialog.classList.add("wg-rules-dialog");
  dialog.setAttribute("aria-labelledby", "wg-rules-title");
  const header = document.createElement("div");
  header.className = "wg-rules-heading";
  const title = document.createElement("h2");
  title.id = "wg-rules-title";
  title.textContent = `Luật chơi · ${game.name}`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "wg-rules-close";
  close.textContent = "Đóng ×";
  close.setAttribute("aria-label", "Đóng luật chơi");
  close.addEventListener("click", () => dialog.close());
  header.append(title, close);
  const body = document.createElement("div");
  body.className = "wg-rules-body";
  function section(title, lines, ordered = false) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = title;
    const list = document.createElement(ordered ? "ol" : "ul");
    for (const line of lines) {
      const item = document.createElement("li");
      item.textContent = line;
      list.append(item);
    }
    section.append(heading, list);
    body.append(section);
    return section;
  }
  const configuration = document.createElement("section");
  const configurationTitle = document.createElement("h3");
  configurationTitle.textContent = "Cấu hình bàn hiện tại";
  const configurationText = current || document.createElement("p");
  if (!current && label) {
    const sync = () => {
      configurationText.textContent = label.textContent;
    };
    sync();
    new MutationObserver(sync).observe(label, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  configuration.append(configurationTitle, configurationText);
  body.append(configuration);
  section("1. Chuẩn bị", game.setup, true);
  section("2. Mỗi lượt", game.play, true);
  section("Thắng nếu", [...game.win, catalog.commonWin]);
  section("Thua nếu", [...game.lose, catalog.commonLoss]);
  if (game.draw.length) section("Hòa / đóng phòng", game.draw);
  section("Đồng hồ", [
    catalog.clock,
    "Mở luật chơi không tạm dừng đồng hồ. Đọc badge cấu hình trên bàn để biết luật đang áp dụng.",
  ]);
  const access = section(
    "Vào bàn",
    catalog.access.map((line) => line.replace("/<game>", `/${game.id}`)),
    true,
  );
  const accessDetails = document.createElement("details");
  const accessSummary = document.createElement("summary");
  accessSummary.textContent = "Cách mở phòng và kết nối tài khoản";
  accessDetails.append(accessSummary, access.querySelector("ol"));
  access.replaceChildren(accessDetails);
  dialog.replaceChildren(header, body);
  document.body.append(dialog);

  let open = document.getElementById("rules-open");
  if (!open) {
    open = document.createElement("button");
    open.id = "rules-open";
    open.type = "button";
    open.textContent = "Luật chơi";
    const entry = document.createElement("div");
    entry.className = "rules wg-rules-entry";
    entry.append(open);
    if (oldRules) oldRules.replaceWith(entry);
    else document.querySelector(".account, .heading, main")?.append(entry);
  }
  open.setAttribute("aria-haspopup", "dialog");
  open.setAttribute("aria-controls", dialog.id);
  open.addEventListener("click", () => dialog.showModal());
  const tools = document.querySelector(".wg-header-tools");
  if (tools) {
    const help = document.createElement("button");
    help.id = "rules-help";
    help.type = "button";
    help.textContent = "?";
    help.title = "Luật chơi";
    help.setAttribute("aria-label", "Luật chơi");
    help.setAttribute("aria-haspopup", "dialog");
    help.setAttribute("aria-controls", dialog.id);
    help.addEventListener("click", () => dialog.showModal());
    tools.append(help);
  }
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      dialog.close();
  });
  // Keep game shortcuts and mobile menu Escape handlers out of the open modal.
  document.addEventListener(
    "keydown",
    (event) => {
      if (dialog.open) event.stopImmediatePropagation();
    },
    true,
  );
})();
