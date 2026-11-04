"use strict";
const $ = (id) => document.getElementById(id);
const API = "/api/games/coquay";
let state = null,
  roomId = null,
  connected = false,
  pending = false,
  source = null,
  offset = 0;
let pairTimer = null,
  pairing = false,
  pairingToken = null,
  pairExpiresAt = 0,
  pairAttempt = 0,
  pairVisible = false;
let selectedItem = null,
  rotated = false;
const canAct = () =>
  !!(
    state?.me &&
    state.status === "playing" &&
    state.turn === state.me &&
    connected &&
    !pending
  );
const item = (id) => state.items.find((i) => i.id === id);
const label = (side) => state.players[side] || "Đang chờ đối thủ";
function art(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", "#art-" + id);
  svg.append(use);
  return svg;
}
// Visual effects follow accepted public snapshots; they never predict the chamber.
const tableMotion = (() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const origins = new WeakMap();
  const timers = new Set(),
    animations = new Set(),
    sprites = new Set(),
    receiving = new Set();
  let generation = 0,
    holder = null;
  const point = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  function slotPoint(side, index) {
    const tray = $("tray-" + side),
      slot = tray.children[index];
    if (!slot) return point(tray);
    const r = slot.getBoundingClientRect(),
      clip = tray.getBoundingClientRect();
    return r.left >= clip.left && r.right <= clip.right
      ? point(slot)
      : point(tray);
  }
  function position(side, snap = false) {
    if (!state) return;
    const gun = $("weapon"),
      lane = $("weapon-lane-" + side);
    const height = Math.max(22, Math.min(82, lane.offsetHeight - 4));
    if (snap || !gun.dataset.holder) gun.classList.add("positioning");
    gun.style.top = lane.offsetTop + lane.offsetHeight / 2 + "px";
    gun.style.height = height + "px";
    gun.style.width =
      Math.min(340, height * 3.2, lane.offsetWidth * 0.8) + "px";
    gun.dataset.holder = side;
    gun.setAttribute("aria-label", "Súng · " + label(side) + " đang giữ lượt");
    gun.hidden = state.status === "waiting";
    if (gun.classList.contains("positioning")) {
      void gun.offsetWidth;
      gun.classList.remove("positioning");
    }
  }
  function later(fn, ms) {
    const token = generation;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (token === generation) fn();
    }, ms);
    timers.add(timer);
  }
  function sprite(key, kind, center, size = 38) {
    const el = document.createElement("div");
    el.className = "table-flight";
    el.dataset.fx = kind;
    el.style.width = el.style.height = size + "px";
    el.style.left = center.x - size / 2 + "px";
    el.style.top = center.y - size / 2 + "px";
    el.append(art(key));
    $("table-fx").append(el);
    sprites.add(el);
    origins.set(el, { x: scrollX, y: scrollY });
    return el;
  }
  function animate(el, frames, options, finish = () => {}) {
    const token = generation;
    const animation = el.animate(frames, options);
    animations.add(animation);
    animation.finished
      .then(() => {
        animations.delete(animation);
        sprites.delete(el);
        el.remove();
        if (token === generation) finish();
      })
      .catch(() => {});
  }
  function fly(key, kind, from, to, delay = 0, finish = () => {}) {
    const el = sprite(key, kind, from, kind === "shell" ? 28 : 38);
    const dx = to.x - from.x,
      dy = to.y - from.y;
    animate(
      el,
      [
        { transform: "translate(0,0) scale(.7)", opacity: 0 },
        {
          transform: `translate(${dx * 0.45}px,${dy * 0.45 - 22}px) scale(1.13)`,
          opacity: 1,
          offset: 0.5,
        },
        { transform: `translate(${dx}px,${dy}px) scale(.55)`, opacity: 0 },
      ],
      {
        duration: kind === "shell" ? 270 : 420,
        delay,
        easing: "cubic-bezier(.2,.65,.3,1)",
        fill: "both",
      },
      finish,
    );
  }
  function reveal(side, index) {
    receiving.delete(side + ":" + index);
    $("tray-" + side).children[index]?.classList.remove("receiving");
  }
  function reset() {
    generation++;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const a of animations) a.cancel();
    animations.clear();
    for (const el of sprites) el.remove();
    sprites.clear();
    receiving.clear();
    holder = null;
    document
      .querySelectorAll(".slot.receiving,.seat.hit,.player-avatar.heal")
      .forEach((el) => el.classList.remove("receiving", "hit", "heal"));
    $("weapon").classList.remove("fire", "reloading");
    document.querySelector(".arena").classList.remove("impact");
    delete document.querySelector(".arena").dataset.phase;
    $("round-status").textContent = "";
    if (state) position(state.turn, true);
  }
  function prepare(before, next) {
    if (!before || before.id !== next.id || before.me !== next.me) {
      reset();
      return null;
    }
    if (next.version <= before.version) return null;
    const moved = next.moves > before.moves,
      reload = next.round > before.round && next.status === "playing";
    if (!moved && !reload) {
      if (next.status !== before.status) reset();
      return null;
    }
    // Capture the consumed slot before render compacts the inventory.
    const action = moved ? next.lastAction : null;
    let from = null;
    if (action?.type === "item") {
      const index = before.inventories[action.mark].indexOf(action.itemId);
      from = slotPoint(action.mark, Math.max(0, index));
    }
    reset();
    if (
      reduced.matches ||
      document.hidden ||
      typeof Element.prototype.animate !== "function"
    )
      return null;
    const grants = [];
    if (reload)
      for (const side of ["X", "O"]) {
        const items = next.boxes[side].received,
          start = next.inventories[side].length - items.length;
        // A reconnect may jump over uses after a reload. Only animate items still at their known slots.
        if (
          start >= 0 &&
          items.every((key, i) => next.inventories[side][start + i] === key)
        )
          items.forEach((key, i) => {
            grants.push({ side, key, index: start + i });
            receiving.add(side + ":" + (start + i));
          });
      }
    holder = action?.type === "shoot" ? action.mark : next.turn;
    return {
      action,
      from,
      reload,
      grants,
      healed:
        action?.itemId === "medicine"
          ? next.hp[action.mark] - before.hp[action.mark]
          : 0,
    };
  }
  function heal(side, amount) {
    const avatar = $("avatar-" + side).parentElement;
    avatar.classList.add("heal");
    const p = point(avatar),
      el = document.createElement("span");
    el.className = "hp-gain";
    el.dataset.fx = "heal";
    el.textContent = "+" + amount + " HP";
    el.style.left = p.x + "px";
    el.style.top = p.y - 18 + "px";
    $("table-fx").append(el);
    sprites.add(el);
    origins.set(el, { x: scrollX, y: scrollY });
    animate(
      el,
      [
        { opacity: 0, transform: "translate(-50%,0)" },
        { opacity: 1, offset: 0.25 },
        { opacity: 0, transform: "translate(-50%,-30px)" },
      ],
      { duration: 700, fill: "both" },
      () => avatar.classList.remove("heal"),
    );
  }
  function run(plan) {
    if (!plan) return;
    const { action, from, reload, grants, healed } = plan;
    if (action?.type === "item") {
      document.querySelector(".arena").dataset.phase = "use";
      fly(
        action.itemId,
        "use",
        from,
        point($("avatar-" + action.mark).parentElement),
        0,
        () => {
          if (healed > 0) heal(action.mark, healed);
          if (!reload) delete document.querySelector(".arena").dataset.phase;
        },
      );
    }
    if (action?.type === "shoot") {
      void $("weapon").offsetWidth;
      if (action.live) $("weapon").classList.add("fire");
      if (action.damage) {
        $("seat-" + action.target).classList.add("hit");
        document.querySelector(".arena").classList.add("impact");
      }
      later(() => {
        holder = null;
        position(state.turn);
      }, 180);
      later(() => {
        $("weapon").classList.remove("fire");
        $("seat-" + action.target).classList.remove("hit");
        document.querySelector(".arena").classList.remove("impact");
      }, 650);
    }
    if (!reload) return;
    const start = action ? 650 : 0;
    later(() => {
      document.querySelector(".arena").dataset.phase = "reload";
      $("round-status").textContent = "Đang nạp đạn…";
      $("weapon").classList.add("reloading");
      const center = point($("table-center")),
        gun = point($("weapon"));
      // Neutral casings show only a public count, never the secret live/blank sequence.
      const count = state.lastLoad.live + state.lastLoad.blank;
      for (let i = 0; i < count; i++)
        fly(
          "shell",
          "shell",
          { x: center.x + (i - count / 2) * 8, y: center.y },
          gun,
          i * 75,
        );
      later(
        () => {
          $("weapon").classList.remove("reloading");
          deal(grants);
        },
        count * 75 + 310,
      );
    }, start);
  }
  function deal(grants) {
    if (!grants.length) {
      $("round-status").textContent = "Túi đầy · Không nhận thêm đạo cụ";
      later(() => {
        $("round-status").textContent = "";
        delete document.querySelector(".arena").dataset.phase;
      }, 800);
      return;
    }
    document.querySelector(".arena").dataset.phase = "deal";
    $("round-status").textContent = "Mở hộp đạo cụ…";
    const rect = $("table-center").getBoundingClientRect();
    for (const side of ["X", "O"]) {
      const items = grants.filter((g) => g.side === side);
      if (!items.length) continue;
      const from = {
        x: side === "X" ? rect.left - 12 : rect.right + 12,
        y: rect.top + rect.height / 2,
      };
      const box = sprite("box", "box", from, 34);
      animate(
        box,
        [
          { transform: "scale(.6)", opacity: 0 },
          { transform: "scale(1)", opacity: 1, offset: 0.2 },
          { transform: "scale(1)", opacity: 1, offset: 0.8 },
          { transform: "scale(.8)", opacity: 0 },
        ],
        { duration: items.length * 110 + 520, fill: "both" },
      );
      items.forEach((grant, i) =>
        fly(
          grant.key,
          "deal",
          from,
          slotPoint(side, grant.index),
          160 + i * 110,
          () => reveal(side, grant.index),
        ),
      );
    }
    later(() => {
      for (const g of grants) reveal(g.side, g.index);
      $("round-status").textContent = "";
      delete document.querySelector(".arena").dataset.phase;
    }, 1000);
  }
  reduced.addEventListener("change", reset);
  window.addEventListener("resize", reset);
  window.addEventListener(
    "scroll",
    () => {
      // Page anchoring can scroll when a private hint disappears. Keep the sequence
      // running, and align viewport sprites with their document positions.
      for (const el of sprites) {
        const origin = origins.get(el);
        if (origin)
          el.style.translate = `${origin.x - scrollX}px ${origin.y - scrollY}px`;
      }
    },
    { capture: true, passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
  return {
    prepare,
    run,
    reset,
    position: () => {
      if (state) position(holder || state.turn);
    },
    isReceiving: (side, index) => receiving.has(side + ":" + index),
  };
})();
function render() {
  if (!state) return;
  WebGamePlayers.render(state);
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("round").textContent = state.round || "—";
  $("ammo-live").textContent = state.round ? state.ammunition.live : "—";
  $("ammo-blank").textContent = state.round ? state.ammunition.blank : "—";
  $("ammo-note").textContent = state.round ? "Thứ tự kín" : "Đang chờ nạp đạn";
  $("move-count").textContent = state.moves + " thao tác";
  $("rules-detail").textContent = state.rulesLabel;
  const badges = [
    `${state.rules.maxHp} HP`,
    `${state.rules.itemLimit} đạo cụ/người`,
    `${state.rules.timeMinutes} phút/người`,
    "Không cược xu",
  ];
  $("rule-badges").replaceChildren(
    ...badges.map((text) => {
      const el = document.createElement("span");
      el.className = "badge";
      el.textContent = text;
      return el;
    }),
  );
  for (const side of ["X", "O"]) {
    $("name-" + side).textContent =
      label(side) + (state.me === side ? " · Bạn" : "");
    $("seat-" + side).classList.toggle(
      "active",
      state.status === "playing" && state.turn === side,
    );
    $("hp-" + side).textContent = `${state.hp[side]} / ${state.rules.maxHp} HP`;
    const bar = $("bar-" + side),
      fill = bar.firstElementChild || document.createElement("span");
    fill.style.width = (state.hp[side] / state.rules.maxHp) * 100 + "%";
    if (!bar.firstElementChild) bar.append(fill);
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(state.rules.maxHp));
    bar.setAttribute("aria-valuenow", String(state.hp[side]));
    const inv = state.inventories[side];
    $("tray-" + side).replaceChildren(
      ...Array.from({ length: state.rules.itemLimit }, (_, i) => {
        const key = inv[i],
          b = document.createElement("button");
        b.className = "slot" + (key ? "" : " empty");
        b.dataset.slot = String(i);
        b.classList.toggle("receiving", tableMotion.isReceiving(side, i));
        b.type = "button";
        if (!key) {
          b.disabled = true;
          b.setAttribute("aria-label", "Ô đạo cụ trống");
          return b;
        }
        b.append(art(key));
        if (key === "medicine") {
          const badge = document.createElement("span");
          badge.className = "heal-badge";
          badge.textContent = "+1";
          b.append(badge);
        }
        b.title = item(key).name;
        b.setAttribute("aria-label", item(key).name);
        b.dataset.item = key;
        b.dataset.side = side;
        b.classList.toggle(
          "available",
          side === state.me && canAct() && state.usableItems.includes(key),
        );
        b.addEventListener("click", () => openItem(key, side));
        return b;
      }),
    );
    const effects = [];
    if (state.effects.shield[side]) effects.push("Chắn 1 DMG");
    if (state.effects.cuffed === side) effects.push("Bị còng · mất 1 lượt");
    $("effects-" + side).textContent = effects.join(" · ");
  }
  $("status-title").textContent =
    state.status === "waiting"
      ? "Chờ đối thủ tham gia trong Discord"
      : state.status === "playing"
        ? state.me === state.turn
          ? "Lượt của bạn · Chọn đạo cụ hoặc bắn"
          : `Lượt của ${label(state.turn)}`
        : state.winner
          ? `${label(state.winner)} thắng${state.reason === "timeout" ? " · Đối thủ hết giờ" : state.reason === "resign" ? " · Đối thủ đầu hàng" : ""}`
          : state.reason === "expired"
            ? "Phòng hết hạn chờ đối thủ"
            : "Phòng đã đóng";
  $("shoot-opponent").disabled = $("shoot-self").disabled = !canAct();
  $("shoot-opponent").textContent = state.effects.saw
    ? "Bắn đối thủ · Cưa ×2"
    : "Bắn đối thủ";
  $("controls").hidden = !state.me || state.status !== "playing";
  $("private-intel").hidden =
    state.knownShell === null || state.status !== "playing";
  $("private-intel").textContent =
    "Chỉ bạn biết: viên tiếp theo là " +
    (state.knownShell ? "ĐẠN THẬT" : "ĐẠN LÉP");
  $("connect-player").hidden =
    !!state.me || !["waiting", "playing"].includes(state.status);
  $("leave").hidden =
    !state.me || !["waiting", "playing"].includes(state.status);
  $("leave").textContent =
    state.status === "waiting" ? "Hủy phòng" : "Đầu hàng";
  $("pair-panel").hidden = !pairVisible || !!state.me;
  $("last-action").textContent = actionText(state.lastAction);
  if ($("item-dialog").open && selectedItem) updateItemButton();
  if ($("inventory-dialog").open) renderInventory();
  updateClock();
  tableMotion.position();
}
function actionText(a) {
  if (!a) return "Đạn thật. Đạn lép. Bạn sẽ chọn ai?";
  const who = label(a.mark);
  if (a.type === "item")
    return `${who} dùng ${item(a.itemId).name}${a.itemId === "beer" ? `: loại đạn ${a.live ? "thật" : "lép"}` : ""}${a.reloaded ? " · Mở hộp hiệp mới" : ""}`;
  return `${who} ${a.target === a.mark ? "tự bắn" : "bắn " + label(a.target)} · ${a.live ? "Đạn thật" : "Đạn lép"}${a.damage ? ` · −${a.damage} HP` : ""}${a.blocked ? " · Bia đỡ 1 DMG" : ""}${a.cuffSkip ? " · Bỏ lượt bị còng" : ""}${a.reloaded ? " · Sang hiệp mới, mở hộp đạo cụ" : ""}`;
}
function updateItemButton() {
  const { key, side } = selectedItem;
  $("use-item").hidden = side !== state.me;
  $("use-item").disabled = !canAct() || !state.usableItems.includes(key);
  $("item-note").textContent =
    side !== state.me
      ? "Đạo cụ của " + label(side)
      : !canAct()
        ? "Chỉ dùng được khi đến lượt bạn."
        : !state.usableItems.includes(key)
          ? "Không thể dùng lúc này: kiểm tra HP, hiệu ứng đang có hoặc thông tin đã soi."
          : "Dùng một đạo cụ. Bạn tiếp tục giữ lượt.";
}
function openItem(key, side) {
  selectedItem = { key, side };
  $("item-title").textContent = item(key).name;
  $("item-description").textContent = item(key).description;
  $("item-art").setAttribute("href", "#art-" + key);
  updateItemButton();
  $("item-dialog").showModal();
}
function renderInventory() {
  const root = $("inventory-detail");
  const catalogOpen = root.querySelector(".item-catalog")?.open || false;
  root.replaceChildren();
  for (const side of ["X", "O"]) {
    const h = document.createElement("h3");
    h.textContent =
      label(side) +
      ` · ${state.inventories[side].length}/${state.rules.itemLimit}`;
    root.append(h);
    const box = document.createElement("div");
    box.className = "box-summary";
    const b = state.boxes[side];
    box.textContent =
      `Hộp hiệp ${state.round}: ` +
      (b.received.length
        ? b.received.map((id) => item(id).name).join(", ")
        : "Không nhận thêm") +
      (b.discarded ? ` · Bỏ ${b.discarded} món vì đầy túi` : "");
    root.append(box);
    const counts = new Map();
    for (const id of state.inventories[side])
      counts.set(id, (counts.get(id) || 0) + 1);
    for (const [id, n] of counts) {
      const row = document.createElement("div");
      row.className = "catalog-row";
      const body = document.createElement("div"),
        strong = document.createElement("strong"),
        desc = document.createElement("p");
      strong.textContent = item(id).name + " ×" + n;
      desc.textContent = item(id).description;
      body.append(strong, desc);
      row.append(art(id), body);
      root.append(row);
    }
  }
  const catalog = document.createElement("details"),
    summary = document.createElement("summary");
  catalog.className = "item-catalog";
  catalog.open = catalogOpen;
  summary.textContent = state.items.length + " loại đạo cụ có thể nhận";
  catalog.append(summary);
  for (const entry of state.items) {
    const row = document.createElement("div"),
      body = document.createElement("div"),
      name = document.createElement("strong"),
      description = document.createElement("p");
    row.className = "catalog-row";
    name.textContent = entry.name;
    description.textContent = entry.description;
    body.append(name, description);
    row.append(art(entry.id), body);
    catalog.append(row);
  }
  root.append(catalog);
}
async function commit(data) {
  if (!canAct()) return;
  pending = true;
  render();
  try {
    accept(await api("/api/move", { roomId, version: state.version, ...data }));
    notice("");
  } catch (e) {
    notice(e.message);
    await refresh().catch(() => connection(false));
  } finally {
    pending = false;
    render();
  }
}
function accept(next) {
  if (state && next.version < state.version) return;
  WebGameFeedback.update("coquay", next);
  const motion = tableMotion.prepare(state, next);
  if (state && state.status !== next.status) $("leave-dialog").close();
  state = next;
  offset = next.serverNow - Date.now();
  if (!["waiting", "playing"].includes(state.status)) {
    $("leave-dialog").close();
    $("item-dialog").close();
    clearTimeout(pairTimer);
    pairing = false;
    pairVisible = false;
    pairingToken = null;
    pairAttempt++;
    clearStoredPairing();
  }
  render();
  tableMotion.run(motion);
}
$("shoot-opponent").addEventListener("click", () =>
  commit({ type: "shoot", target: "opponent" }),
);
$("shoot-self").addEventListener("click", () =>
  commit({ type: "shoot", target: "self" }),
);
$("use-item").addEventListener("click", () => {
  if (
    !selectedItem ||
    !canAct() ||
    !state.usableItems.includes(selectedItem.key)
  )
    return;
  const key = selectedItem.key;
  $("item-dialog").close();
  commit({ type: "item", itemId: key });
});
$("rotate-table").addEventListener("click", () => {
  tableMotion.reset();
  rotated = !rotated;
  $("felt").classList.toggle("rotated", rotated);
  $("rotate-table").setAttribute("aria-pressed", String(rotated));
});
$("inventory-open").addEventListener("click", () => {
  if (!state) return;
  renderInventory();
  $("inventory-dialog").showModal();
});
$("rules-open").addEventListener("click", () => $("rules-dialog").showModal());
for (const b of document.querySelectorAll("[data-close]"))
  b.addEventListener("click", () => $(b.dataset.close).close());
function notice(message) {
  $("notice").textContent = message || "";
  $("notice").hidden = !message;
}
function connection(ok) {
  connected = ok;
  if (globalThis.WebGameFeedback) WebGameFeedback.connection(ok);
  else
    $("connection").textContent = ok
      ? "Đã kết nối trực tiếp"
      : "Đang kết nối lại…";
  $("connection").classList.toggle("connected", ok);
  if (state) render();
}
async function api(url, data) {
  url = url.replace(/^\/api(?=\/)/, API);
  const response = await fetch(url, {
    method: data ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || "Không kết nối được máy chủ."),
      { status: response.status },
    );
  return result;
}
function formatClock(ms) {
  if (!Number.isFinite(ms)) return "—";
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return (
    String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0")
  );
}
function updateClock() {
  if (!state) return;
  const at = Date.now() + offset;
  const remaining = state.clocks ? { ...state.clocks } : null;
  if (
    remaining &&
    state.status === "playing" &&
    Number.isFinite(state.clockStartedAt)
  )
    remaining[state.turn] = Math.max(
      0,
      remaining[state.turn] - Math.max(0, at - state.clockStartedAt),
    );
  for (const mark of ["X", "O"]) {
    const ms = remaining && state.players[mark] ? remaining[mark] : null;
    const running = state.status === "playing" && state.turn === mark;
    $("clock-" + mark).textContent = formatClock(ms);
    $("clock-" + mark).classList.toggle("running", running);
    $("clock-" + mark).classList.toggle("low", running && ms <= 60000);
  }
}
async function refresh() {
  accept(await api(`/api/state?room=${encodeURIComponent(roomId)}`));
}

$("leave").addEventListener("click", () => {
  if (!state?.me || !["waiting", "playing"].includes(state.status)) return;
  const waiting = state.status === "waiting";
  $("leave-dialog-title").textContent = waiting
    ? "Hủy phòng chờ?"
    : "Đầu hàng ván đấu?";
  $("leave-dialog-detail").textContent = waiting
    ? "Phòng sẽ đóng. Bạn có thể tạo phòng mới trong Discord."
    : "Đối thủ sẽ được tính thắng ván này.";
  $("confirm-leave").textContent = waiting ? "Hủy phòng" : "Đầu hàng";
  $("leave-dialog").showModal();
});
$("keep-playing").addEventListener("click", () => $("leave-dialog").close());
$("confirm-leave").addEventListener("click", async () => {
  $("leave-dialog").close();
  if (
    pending ||
    !connected ||
    !state?.me ||
    !["waiting", "playing"].includes(state.status)
  )
    return;
  pending = true;
  render();
  try {
    accept(await api("/api/leave", { roomId }));
    notice("");
  } catch (error) {
    notice(error.message);
    await refresh().catch(() => connection(false));
  } finally {
    pending = false;
    render();
  }
});
async function init() {
  const ticket = new URLSearchParams(location.hash.slice(1)).get("ticket");
  history.replaceState(null, "", location.pathname);
  const pathId = /^\/(?:coquay\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/coquay/room/${roomId}`);
    await refresh();
    subscribe();
    if (state.me) clearStoredPairing();
    else restorePairing();
  } catch (error) {
    if (globalThis.WebGameFeedback)
      WebGameFeedback.connection(false, "Không thể vào bàn");
    else $("connection").textContent = "Chưa vào bàn";
    notice(error.message);
  }
}
function subscribe() {
  source?.close();
  const stream = new EventSource(
    API + "/events?room=" + encodeURIComponent(roomId),
  );
  source = stream;
  stream.onopen = () => {
    if (source !== stream) return;
    connection(true);
    notice("");
  };
  stream.onmessage = (event) => {
    if (source !== stream) return;
    accept(JSON.parse(event.data));
    connection(true);
  };
  stream.onerror = () => {
    if (source !== stream) return;
    connection(false);
    notice("Mất kết nối. Đang tự kết nối lại; đồng hồ vẫn chạy.");
  };
}
function clearStoredPairing() {
  try {
    sessionStorage.removeItem(API + ":pair:" + roomId);
  } catch {}
}
function savePairing() {
  if (!pairingToken) return;
  try {
    sessionStorage.setItem(
      API + ":pair:" + roomId,
      JSON.stringify({
        pairingToken,
        expiresAt: pairExpiresAt,
        code: $("pair-code").textContent,
      }),
    );
  } catch {}
}
function restorePairing() {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(API + ":pair:" + roomId) || "null",
    );
    if (
      !saved ||
      !/^[A-Za-z0-9_-]{43}$/.test(saved.pairingToken) ||
      !/^[A-F0-9]{8}$/.test(saved.code) ||
      !Number.isFinite(saved.expiresAt) ||
      saved.expiresAt <= Date.now() ||
      saved.expiresAt > Date.now() + 300000
    ) {
      clearStoredPairing();
      return;
    }
    pairingToken = saved.pairingToken;
    pairExpiresAt = saved.expiresAt;
    pairing = true;
    pairVisible = true;
    $("pair-code").textContent = saved.code;
    $("pair-status").textContent = "Đang khôi phục xác nhận tài khoản…";
    render();
    const attempt = ++pairAttempt;
    pairTimer = setTimeout(() => pollPairing(attempt), 0);
  } catch {
    clearStoredPairing();
  }
}
$("connect-player").addEventListener("click", async () => {
  if (!roomId || !state || state.me) return;
  const attempt = ++pairAttempt;
  clearStoredPairing();
  pairing = false;
  pairingToken = null;
  clearTimeout(pairTimer);
  $("connect-player").disabled = true;
  pairVisible = true;
  $("pair-code").textContent = "…";
  $("pair-status").textContent = "Đang tạo mã kết nối…";
  render();
  try {
    const result = await api("/api/pair", { roomId });
    if (attempt !== pairAttempt) return;
    pairingToken = result.pairingToken || null;
    pairExpiresAt =
      Date.now() +
      (result.expiresInMs ?? Math.max(0, result.expires - Date.now() - offset));
    $("pair-code").textContent = result.code;
    savePairing();
    $("pair-status").textContent = "Đang chờ bạn xác nhận trong Discord…";
    pairing = true;
    pairVisible = true;
    notice("");
    render();
    pairTimer = setTimeout(() => pollPairing(attempt), 1000);
  } catch (error) {
    if (attempt !== pairAttempt) return;
    $("pair-status").textContent =
      error.message + " Bấm Xác nhận người chơi để lấy mã mới.";
    notice(error.message);
  } finally {
    if (attempt === pairAttempt) $("connect-player").disabled = false;
  }
});
async function pollPairing(attempt = pairAttempt) {
  if (!pairing || attempt !== pairAttempt) return;
  if (Date.now() >= pairExpiresAt) {
    pairing = false;
    pairingToken = null;
    clearStoredPairing();
    $("pair-status").textContent =
      "Mã đã hết hạn. Bấm Xác nhận người chơi để lấy mã mới.";
    return;
  }
  try {
    const data = { roomId };
    if (pairingToken) data.pairingToken = pairingToken;
    const result = await api("/api/pair/status", data);
    if (!pairing || attempt !== pairAttempt) return;
    if (result.connected) {
      if (result.roomId !== roomId)
        throw Object.assign(
          new Error("Mã không thuộc phòng này. Hãy lấy mã mới."),
          { status: 410 },
        );
      $("pair-status").textContent = "Mã đã xác nhận. Đang nhận quyền chơi…";
      // Discard the anonymous stream before accepting the authenticated state.
      source?.close();
      source = null;
      connection(false);
      const next = await api("/api/state?room=" + encodeURIComponent(roomId));
      if (!pairing || attempt !== pairAttempt) return;
      if (!next.me)
        throw Object.assign(
          new Error(
            "Trình duyệt chưa nhận được phiên đăng nhập. Hãy cho phép cookie của trang rồi lấy mã mới.",
          ),
          { status: 401 },
        );
      accept(next);
      pairing = false;
      pairVisible = false;
      pairingToken = null;
      clearStoredPairing();
      subscribe();
      notice("Đã kết nối tài khoản Discord.");
      return;
    }
  } catch (error) {
    if (!pairing || attempt !== pairAttempt) return;
    const terminal = [400, 401, 403, 404, 409, 410].includes(error.status);
    $("pair-status").textContent =
      error.message +
      (terminal
        ? " Bấm Xác nhận người chơi để lấy mã mới."
        : " Đang tự thử lại…");
    if (!source) subscribe();
    if (terminal) {
      pairing = false;
      pairingToken = null;
      clearStoredPairing();
      return;
    }
  }
  pairTimer = setTimeout(() => pollPairing(attempt), 2000);
}
window.addEventListener("pagehide", () => {
  tableMotion.reset();
  source?.close();
  source = null;
  pairing = false;
  pairingToken = null;
  pairAttempt++;
  clearTimeout(pairTimer);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
setInterval(updateClock, 1000);
init();
