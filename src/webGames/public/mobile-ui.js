"use strict";

// Move the real controls, preserving IDs, listeners and per-game hidden states.
globalThis.WebGameMobile = (() => {
  const media = matchMedia(
    "(max-width: 760px), (max-height: 520px) and (pointer: coarse)",
  );
  const configurations = {
    oanquan: [["history", "Lịch sử", ["#history-panel"]]],
    cotuong: [["history", "Lịch sử", ["#history-panel"]]],
    cothu: [["history", "Lịch sử", ["#history-panel"]]],
    caro: [],
    dots: [],
    santorini: [],
    walls: [["actions", "Thao tác", ["#controls"]]],
    blokus: [
      ["pieces", "Bộ quân", [".inventory"]],
      ["actions", "Đã chọn", ["#controls"]],
    ],
    battleship: [
      ["actions", "Hạm đội", ["#setup-tools"]],
      ["view", "Bản đồ", [".view-tabs"]],
    ],
    mecung: [
      ["actions", "Thao tác", ["#setup-controls", "#move-controls"]],
      ["view", "Bản đồ", ["#view-select", "#zoom-board"]],
    ],
  };
  let game,
    state,
    root,
    hud,
    bar,
    sheet,
    content,
    title,
    active = null,
    enabled = false,
    frame,
    pairWasVisible = false;
  const panels = new Map(),
    homes = new Map(),
    buttons = new Map(),
    clocks = {};
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function remember(node) {
    if (homes.has(node)) return;
    const marker = document.createComment("mobile panel home");
    node.before(marker);
    homes.set(node, marker);
  }
  function build() {
    root = element("div", "wg-mobile-ui");
    root.id = "wg-mobile-ui";
    hud = element("div", "wg-hud");
    hud.setAttribute("aria-label", "Người chơi và đồng hồ");
    for (const mark of ["X", "O"]) {
      const button = element("button", "wg-player");
      button.type = "button";
      const avatar = element("span", "player-avatar " + mark.toLowerCase());
      const img = element("img"),
        fallback = element("span");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.draggable = false;
      const clock = element("time", "wg-clock", "—");
      avatar.append(img, fallback);
      button.append(avatar, clock);
      button.addEventListener("click", () => toggle("info"));
      hud.append(button);
      clocks[mark] = { button, img, fallback, clock };
    }
    const status = element("div", "wg-match-status");
    status.id = "wg-match-status";
    status.setAttribute("role", "status");
    hud.append(status);
    bar = element("nav", "wg-nav");
    bar.setAttribute("aria-label", "Menu bàn chơi");
    sheet = element("section", "wg-sheet");
    sheet.id = "wg-sheet";
    sheet.hidden = true;
    sheet.setAttribute("aria-label", "Menu trò chơi");
    const heading = element("div", "wg-sheet-heading");
    title = element("strong");
    const close = element("button", "wg-sheet-close", "Đóng ✕");
    close.type = "button";
    close.addEventListener("click", () => hide());
    heading.append(title, close);
    content = element("div", "wg-sheet-content");
    sheet.append(heading, content);
    const sections = [
      ...(configurations[game] || []),
      [
        "info",
        "Thông tin",
        [
          ".heading",
          ".status-card:not(#pair-panel)",
          ".players-card",
          ".match-bar",
          ".players",
          "#rule-badges",
          ".rules",
          ".legend",
          ".board-footer",
          "#board-help",
          "#board-summary",
          "#timer-panel",
        ],
      ],
      ["account", "Tài khoản", ["#connect-player", "#pair-panel", "#leave"]],
    ];
    for (const [id, label, selectors] of sections) {
      const panel = element("div", "wg-panel");
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", label);
      panel.id = "wg-panel-" + id;
      panel.hidden = true;
      for (const selector of selectors)
        for (const node of document.querySelectorAll(selector)) {
          // Skip descendants of a section already moved into this panel.
          if (panel.contains(node)) continue;
          remember(node);
          panel.append(node);
        }
      panels.set(id, panel);
      content.append(panel);
      const button = element("button", "wg-nav-button", label);
      button.type = "button";
      button.dataset.panel = id;
      button.setAttribute("aria-controls", "wg-panel-" + id);
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => toggle(id));
      buttons.set(id, button);
      bar.append(button);
    }
    root.append(hud, sheet, bar);
    document.body.append(root);
    const notice = document.getElementById("notice");
    if (notice) {
      remember(notice);
      root.append(notice);
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && active) {
        hide();
        event.preventDefault();
      }
    });
  }
  function restore() {
    for (const [node, marker] of homes) marker.after(node);
  }
  function mount() {
    if (!root) build();
    // Re-entering mobile after a desktop resize must use the same live nodes.
    for (const panel of panels.values()) {
      const ids = panel._nodes;
      if (ids) for (const node of ids) panel.append(node);
      else panel._nodes = [...panel.children];
    }
    const notice = document.getElementById("notice");
    if (notice) root.append(notice);
  }
  function resize() {
    if (media.matches && !enabled) {
      enabled = true;
      mount();
      document.body.classList.add("wg-mobile");
      root.hidden = false;
    } else if (!media.matches && enabled) {
      hide(false);
      enabled = false;
      restore();
      document.body.classList.remove("wg-mobile");
      root.hidden = true;
    }
    if (game === "battleship" && buttons.has("view")) {
      const setup = state?.status === "setup";
      buttons.get("view").hidden = setup;
      if (setup && active === "view") hide(false);
    }
    schedule();
  }
  function hide(focus = true) {
    if (!root) return;
    const previous = active;
    active = null;
    sheet.hidden = true;
    for (const [id, panel] of panels) {
      panel.hidden = true;
      buttons.get(id).setAttribute("aria-expanded", "false");
    }
    document.body.style.setProperty("--wg-sheet-height", "0px");
    document.body.style.setProperty("--wg-side-width", "0px");
    if (focus && previous)
      buttons.get(previous)?.focus({ preventScroll: true });
    schedule();
  }
  function toggle(id) {
    if (!enabled || !panels.has(id)) return;
    if (active === id) return hide();
    active = id;
    title.textContent = buttons.get(id).textContent;
    sheet.hidden = false;
    for (const [key, panel] of panels) {
      panel.hidden = key !== id;
      buttons.get(key).setAttribute("aria-expanded", String(key === id));
    }
    document.body.dataset.wgPanel = id;
    sheet.querySelector(".wg-sheet-close").focus({ preventScroll: true });
    schedule();
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  }
  function fit() {
    if (!enabled) return;
    const height = sheet.hidden ? 0 : sheet.getBoundingClientRect().height;
    const side = innerWidth > innerHeight && innerHeight <= 520;
    document.body.style.setProperty(
      "--wg-sheet-height",
      side ? "0px" : height + "px",
    );
    document.body.style.setProperty(
      "--wg-side-width",
      side && !sheet.hidden
        ? sheet.getBoundingClientRect().width + 8 + "px"
        : "0px",
    );
    for (const scroll of document.querySelectorAll(".board-scroll")) {
      const rect = scroll.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const pad = game === "walls" ? 50 : 18;
      const ratio =
        game === "oanquan"
          ? innerWidth > innerHeight
            ? 3.1
            : 2 / 3.5
          : game === "cotuong"
            ? 9 / 10
            : game === "cothu"
              ? 7 / 9
              : 1;
      scroll.style.setProperty(
        "--wg-board-size",
        Math.max(
          game === "cothu" ? 70 : 100,
          Math.floor(Math.min(rect.width - 6, (rect.height - pad) * ratio)),
        ) + "px",
      );
    }
    document.dispatchEvent(new Event("webgame:layout"));
  }
  function tick() {
    if (!root || !state) return;
    const at = Date.now() + (state.serverNow - receivedAt),
      remaining = { ...state.clocks };
    if (state.status === "playing" && Number.isFinite(state.clockStartedAt))
      remaining[state.turn] = Math.max(
        0,
        remaining[state.turn] - Math.max(0, at - state.clockStartedAt),
      );
    for (const mark of ["X", "O"]) {
      const ms = remaining[mark],
        seconds = Math.max(0, Math.ceil(ms / 1000));
      clocks[mark].clock.textContent =
        state.players[mark] && Number.isFinite(ms)
          ? String(Math.floor(seconds / 60)).padStart(2, "0") +
            ":" +
            String(seconds % 60).padStart(2, "0")
          : "—";
      clocks[mark].button.classList.toggle(
        "active",
        state.status === "playing" && state.turn === mark,
      );
      clocks[mark].button.classList.toggle(
        "low",
        state.status === "playing" && state.turn === mark && ms <= 60000,
      );
    }
    const status = document.getElementById("wg-match-status");
    status.textContent =
      state.status === "waiting"
        ? "Chờ đối thủ"
        : state.status === "setup"
          ? "Đang chuẩn bị"
          : state.status === "playing"
            ? state.turn === state.me
              ? "Lượt bạn"
              : "Lượt đối thủ"
            : state.winner
              ? state.winner === state.me
                ? "Bạn thắng"
                : "Đã có kết quả"
              : "Đã kết thúc";
    if (!state.me && state.status === "playing")
      status.textContent = "Đang xem";
    const deadline =
      state.status === "setup"
        ? state.setupDeadline
        : state.status === "waiting"
          ? state.waitingDeadline
          : null;
    if (Number.isFinite(deadline))
      status.textContent +=
        " · " + Math.max(0, Math.ceil((deadline - at) / 1000)) + "s";
  }
  let receivedAt = Date.now();
  function update(id, next) {
    game = id;
    document.body.dataset.webGame = id;
    document.body.style.setProperty("--wg-grid-count", next.size);
    if (next !== state) receivedAt = Date.now();
    state = next;
    resize();
    if (!root) return;
    for (const mark of ["X", "O"]) {
      const item = clocks[mark],
        name = state.players[mark] || "Đang chờ đối thủ";
      item.button.dataset.side = state.sideBySeat?.[mark] || "";
      item.button.title =
        name +
        (state.playerLabels?.[mark] ? " · " + state.playerLabels[mark] : "");
      item.button.setAttribute(
        "aria-label",
        name +
          (state.me === mark ? ", bạn" : "") +
          ". Xem thông tin người chơi",
      );
      item.fallback.textContent = [...name][0] || "?";
      const url = globalThis.WebGamePlayers?.avatarURL(state.avatars?.[mark]);
      if (item.img.dataset.url !== (url || "")) {
        item.img.dataset.url = url || "";
        item.img.hidden = true;
        item.fallback.hidden = false;
        item.img.onload = () => {
          if (item.img.dataset.url === url) {
            item.img.hidden = false;
            item.fallback.hidden = true;
          }
        };
        item.img.onerror = () => {
          item.img.hidden = true;
          item.fallback.hidden = false;
        };
        if (url) item.img.src = url;
        else item.img.removeAttribute("src");
      }
    }
    // Pairing and final results must remain reachable when the game changes phase.
    const pairVisible = document.getElementById("pair-panel")?.hidden === false;
    if (enabled && pairVisible && !pairWasVisible && active !== "account")
      toggle("account");
    pairWasVisible = pairVisible;
    tick();
    schedule();
  }
  media.addEventListener("change", resize);
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  new ResizeObserver(schedule).observe(document.documentElement);
  setInterval(tick, 1000);
  return {
    update,
    open: toggle,
    close: hide,
    active: () => active,
    isMobile: () => enabled,
  };
})();
