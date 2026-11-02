"use strict";
const $ = (id) => document.getElementById(id);
const API = "/api/games/battleship";
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
let selectedShip = 0,
  orientation = "h",
  view = "X",
  drag = null,
  suppressClickUntil = 0,
  dragScrollFrame = null;
const other = (mark) => (mark === "X" ? "O" : "X");
// h/v preserve saved rooms: the anchor is always the bow, cells extend away from it.
const DIRECTIONS = ["h", "v", "right", "down"];
const DIRECTION_LABELS = {
  h: "← Trái",
  v: "↑ Trên",
  right: "→ Phải",
  down: "↓ Dưới",
};
const horizontal = (direction) => ["h", "right"].includes(direction);
const reverse = (direction) => ["right", "down"].includes(direction);
const open = () =>
  state && ["waiting", "setup", "playing"].includes(state.status);
const canSetup = () =>
  state?.status === "setup" &&
  state.me &&
  !state.ready[state.me] &&
  connected &&
  !pending;
function closeFleetTooltips() {
  for (const mark of ["X", "O"]) {
    $("fleet-menu-" + mark).classList.toggle("open", false);
    $("fleet-info-" + mark).setAttribute("aria-expanded", "false");
  }
}
for (const mark of ["X", "O"])
  $("fleet-info-" + mark).addEventListener("click", () => {
    const opened = !$("fleet-menu-" + mark).classList.contains("open");
    closeFleetTooltips();
    $("fleet-menu-" + mark).classList.toggle("open", opened);
    $("fleet-info-" + mark).setAttribute("aria-expanded", String(opened));
  });
document.addEventListener("click", (event) => {
  if (!event.target?.closest?.(".fleet-tooltip")) closeFleetTooltips();
});
function notice(message) {
  $("notice").textContent = message || "";
  $("notice").hidden = !message;
}
function connection(ok) {
  connected = ok;
  $("connection").textContent = ok
    ? "Đã kết nối trực tiếp"
    : "Đang kết nối lại…";
  $("connection").classList.toggle("connected", ok);
  if (state) render();
}
async function api(url, data) {
  const response = await fetch(url.replace(/^\/api(?=\/)/, API), {
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
function accept(next) {
  if (state && next.version < state.version) return;
  const phaseChanged = state?.status !== next.status;
  const turnChanged =
    phaseChanged || state?.turn !== next.turn || state?.me !== next.me;
  if (
    !drag &&
    (state?.me !== next.me || state?.setupRevision !== next.setupRevision)
  ) {
    const selected = next.placements.find((ship) => ship.id === selectedShip);
    if (selected) orientation = selected.orientation;
  }
  state = next;
  if (phaseChanged) {
    drag = null;
    $("drag-ghost").hidden = true;
    $("leave-dialog").close();
  }
  if (!open()) {
    clearTimeout(pairTimer);
    pairing = false;
    pairVisible = false;
    pairingToken = null;
    pairAttempt++;
    clearStoredPairing();
  }
  if (turnChanged && $("auto-view").checked)
    view =
      state.status === "setup"
        ? state.me || "X"
        : state.me
          ? state.turn === state.me
            ? other(state.me)
            : state.me
          : other(state.turn);
  offset = state.serverNow - Date.now();
  render();
}
function shipCells(ship, length) {
  if (
    !ship ||
    !Number.isInteger(ship.cell) ||
    ship.cell < 0 ||
    ship.cell >= state.size ** 2 ||
    !DIRECTIONS.includes(ship.orientation)
  )
    return null;
  const start = horizontal(ship.orientation)
    ? ship.cell % state.size
    : Math.floor(ship.cell / state.size);
  if (
    reverse(ship.orientation)
      ? start - length + 1 < 0
      : start + length > state.size
  )
    return null;
  const step =
    (horizontal(ship.orientation) ? 1 : state.size) *
    (reverse(ship.orientation) ? -1 : 1);
  return Array.from({ length }, (_, i) => ship.cell + i * step);
}
function validPlacement(placements) {
  const occupied = new Map();
  for (const ship of placements) {
    const cells = shipCells(ship, state.fleet[ship.id]);
    if (!cells) return false;
    for (const cell of cells) {
      if (occupied.has(cell)) return false;
      occupied.set(cell, ship.id);
    }
  }
  for (const [cell, id] of occupied) {
    const size = state.size,
      row = Math.floor(cell / size),
      col = cell % size;
    const neighbors = [
      row > 0 ? cell - size : -1,
      row + 1 < size ? cell + size : -1,
      col > 0 ? cell - 1 : -1,
      col + 1 < size ? cell + 1 : -1,
    ];
    if (
      neighbors.some((next) => occupied.has(next) && occupied.get(next) !== id)
    )
      return false;
  }
  return true;
}
function candidate(cell, id = selectedShip, direction = orientation) {
  return { id, cell, orientation: direction };
}
function withShip(ship) {
  return [...state.placements.filter((old) => old.id !== ship.id), ship];
}
function choose(id) {
  selectedShip = id;
  const placed = state.placements.find((ship) => ship.id === id);
  if (placed) orientation = placed.orientation;
  render();
}
function render() {
  if (!state) return;
  const setup = state.status === "setup",
    playing = state.status === "playing",
    waiting = state.status === "waiting";
  $("room-label").textContent = "Phòng " + state.id.slice(0, 8);
  $("rules-label").textContent = state.rulesLabel;
  $("role-label").textContent = state.me
    ? `Bạn là ${state.me} · Chỉ bạn thấy hạm đội của mình`
    : "Khán giả · Chỉ thấy các ô đã bắn";
  $("status-title").textContent = waiting
    ? "Đang chờ đối thủ"
    : setup
      ? state.me && state.ready[state.me]
        ? "Đã sẵn sàng ra khơi"
        : "Bố trí hạm đội"
      : playing
        ? state.me
          ? state.turn === state.me
            ? "Tới lượt bạn bắn"
            : "Đối phương đang ngắm bắn"
          : `Lượt bắn của ${state.players[state.turn]}`
        : state.winner
          ? `${state.players[state.winner]} chiến thắng!`
          : "Phòng đã đóng";
  const reasons = {
    win: "Toàn bộ hạm đội đối thủ đã chìm.",
    timeout: "Một người chơi đã hết giờ trên đồng hồ riêng.",
    resign: "Một người chơi đã đầu hàng.",
    setup_timeout: "Đối thủ chưa xác nhận khi hết thời gian chuẩn bị.",
    setup_expired: "Cả hai chưa xác nhận hạm đội khi hết giờ chuẩn bị.",
    expired: "Không có người tham gia sau 10 phút.",
    cancelled: "Chủ phòng đã hủy lời mời.",
  };
  $("status-detail").textContent = waiting
    ? "Mời một người bấm Tham gia trong tin phòng Discord."
    : setup
      ? "Hai bên phải Xác nhận hạm đội trước khi hết giờ. Vị trí được giữ kín."
      : playing
        ? "Chọn một ô trên biển đối phương. Bắn trúng vẫn đổi lượt."
        : reasons[state.reason] || "Ván đấu đã kết thúc.";
  $("connect-player").hidden = !!state.me || !open();
  $("pair-panel").hidden = !!state.me || !pairVisible || !open();
  $("leave").hidden = !state.me || !open();
  $("leave").textContent = waiting ? "Hủy phòng" : "Đầu hàng";
  $("leave").disabled = pending || !connected;
  $("setup-tools").hidden = !setup || !state.me;
  $("placement-count").textContent =
    `${state.placements.length}/${state.fleet.length} thuyền`;
  $("setup-hint").textContent =
    state.me && state.ready[state.me]
      ? "Đã khóa hạm đội. Đang chờ đối thủ xác nhận."
      : "Kéo thuyền xuống biển hoặc chọn thuyền rồi chạm ô đặt.";
  for (const id of ["rotate", "remove-ship", "randomize", "ready"])
    $(id).disabled = !canSetup();
  $("remove-ship").disabled ||= !state.placements.some(
    (ship) => ship.id === selectedShip,
  );
  $("ready").disabled ||= state.placements.length !== state.fleet.length;
  $("rotate").textContent = `Mũi ${DIRECTION_LABELS[orientation]} · R`;
  renderFleet();
  for (const mark of ["X", "O"]) {
    $("name-" + mark).textContent = state.players[mark] || "Chờ đối thủ";
    $("info-" + mark).textContent = setup
      ? state.ready[mark]
        ? "Đã xác nhận"
        : "Đang bố trí"
      : `${state.sunk[mark]}/${state.fleet.length} thuyền đã chìm`;
    $("player-" + mark).classList.toggle(
      "active",
      playing && state.turn === mark,
    );
    $("panel-" + mark).classList.toggle("selected", view === mark);
    $("view-" + mark).setAttribute("aria-pressed", String(view === mark));
    const label = state.me
      ? state.me === mark
        ? "Biển của bạn"
        : "Biển đối phương"
      : `Biển ${mark}`;
    $("view-" + mark).textContent = label;
    $("title-" + mark).textContent = label;
    $("fleet-info-" + mark).textContent =
      `${state.fleet.length - state.sunk[mark]} thuyền còn lại ⓘ`;
    const types = $("fleet-types-" + mark);
    types.replaceChildren();
    for (const [length, count] of Object.entries(state.remainingFleet[mark])) {
      if (!count) continue;
      const item = document.createElement("li");
      item.textContent = `Thuyền ${length} ô × ${count}`;
      types.append(item);
    }
    if (!types.children.length) {
      const item = document.createElement("li");
      item.textContent = "Toàn bộ thuyền đã chìm.";
      types.append(item);
    }
  }
  $("last-action").hidden = !state.lastAction;
  if (state.lastAction) {
    const a = state.lastAction;
    $("last-action").textContent =
      `${state.players[a.mark]} bắn ${String.fromCharCode(65 + (a.cell % state.size))}${Math.floor(a.cell / state.size) + 1}: ${a.hit ? (a.sunk ? "trúng và đánh chìm một thuyền!" : "trúng thuyền!") : "trượt."}`;
  }
  renderBoards();
  updateClock();
}
function renderFleet() {
  const tray = $("fleet");
  tray.replaceChildren();
  if (!state.me || state.status !== "setup") return;
  state.fleet.forEach((length, id) => {
    const placed = state.placements.some((ship) => ship.id === id);
    const button = document.createElement("button");
    button.className = `${placed ? "placed" : ""} ${id === selectedShip ? "selected" : ""}`;
    button.disabled = !canSetup();
    button.setAttribute("aria-pressed", String(id === selectedShip));
    button.setAttribute(
      "aria-label",
      `Thuyền ${id + 1}, dài ${length} ô${placed ? ", đã đặt" : ", chưa đặt"}`,
    );
    const mini = document.createElement("span");
    mini.className = "mini-ship";
    for (let i = 0; i < length; i++) mini.append(document.createElement("i"));
    const label = document.createElement("span");
    label.textContent = `${id + 1} · ${length} ô${placed ? " ✓" : ""}`;
    button.append(mini, label);
    button.addEventListener("click", () => {
      if (Date.now() >= suppressClickUntil) choose(id);
    });
    button.addEventListener("pointerdown", (event) => beginDrag(event, id, 0));
    tray.append(button);
  });
}
function renderBoards() {
  if (!state) return;
  for (const target of ["X", "O"]) {
    const board = $("board-" + target);
    board.replaceChildren();
    board.style.setProperty("--size", state.size);
    const own = target === state.me,
      shotMap = new Map(state.boards[target].map((shot) => [shot.cell, shot])),
      shipMap = new Map();
    if (own)
      for (const ship of state.placements)
        shipCells(ship, state.fleet[ship.id]).forEach((cell, index) =>
          shipMap.set(cell, { ...ship, index }),
        );
    const preview =
      drag?.active && own && drag.cell != null
        ? candidate(drag.cell, drag.id, drag.orientation)
        : null;
    const previewCells = preview
      ? shipCells(preview, state.fleet[preview.id]) || []
      : [];
    const valid = preview && validPlacement(withShip(preview));
    for (let row = -1; row < state.size; row++)
      for (let col = -1; col < state.size; col++) {
        const el = document.createElement(
          row < 0 || col < 0 ? "span" : "button",
        );
        if (row < 0 || col < 0) {
          el.className = "coordinate";
          el.textContent =
            row < 0
              ? col < 0
                ? ""
                : String.fromCharCode(65 + col)
              : String(row + 1);
          board.append(el);
          continue;
        }
        const cell = row * state.size + col,
          shot = shotMap.get(cell),
          ship = shipMap.get(cell);
        el.className = "cell";
        el.dataset.cell = String(cell);
        el.dataset.target = target;
        const shootable =
          !own &&
          state.me &&
          state.status === "playing" &&
          state.turn === state.me &&
          connected &&
          !pending &&
          !shot;
        el.disabled = !(shootable || (own && canSetup()));
        if (shootable) el.classList.add("target");
        if (ship) {
          el.classList.add("ship");
          if (ship.index === 0) el.classList.add("bow-" + ship.orientation);
          if (canSetup()) {
            el.dataset.shipId = String(ship.id);
            if (ship.id === selectedShip) el.classList.add("selected-ship");
            el.addEventListener("pointerdown", (event) =>
              beginDrag(event, ship.id, ship.index),
            );
          }
        }
        if (shot?.hit) {
          el.classList.add("ship", "hit");
          if (shot.bow) el.classList.add("bow-" + shot.bow);
        }
        if (shot && !shot.hit) el.classList.add("miss");
        if (previewCells.includes(cell))
          el.classList.add("preview", ...(valid ? [] : ["preview-invalid"]));
        el.setAttribute(
          "aria-label",
          `${String.fromCharCode(65 + col)}${row + 1}: ${shot ? (shot.hit ? "trúng thuyền" : "đã bắn trượt") : ship ? "thuyền của bạn" : "chưa bị bắn"}`,
        );
        el.addEventListener("click", () => {
          if (Date.now() < suppressClickUntil) return;
          if (own && canSetup()) {
            if (ship) choose(ship.id);
            else if (selectedShip != null) void placeShip(candidate(cell));
          } else if (shootable)
            void action("shoot", { cell, version: state.version });
        });
        board.append(el);
      }
  }
}
async function action(name, data = {}) {
  if (pending || !connected) return;
  pending = true;
  notice("");
  render();
  try {
    accept(await api("/api/" + name, { roomId, ...data }));
  } catch (error) {
    notice(error.message);
    await refresh().catch(() => connection(false));
  } finally {
    pending = false;
    render();
  }
}
async function placeShip(ship) {
  if (!canSetup()) return;
  const placements = withShip(ship);
  if (!validPlacement(placements)) {
    notice(
      "Vị trí không hợp lệ: thuyền phải ở trong bàn, không chồng hoặc sát cạnh thuyền khác.",
    );
    renderBoards();
    return;
  }
  await action("place", { placements, revision: state.setupRevision });
}
function beginDrag(event, id, index) {
  if (!canSetup() || event.button !== 0 || drag) return;
  const ship = state.placements.find((ship) => ship.id === id);
  selectedShip = id;
  if (ship) orientation = ship.orientation;
  drag = {
    id,
    index,
    pointerId: event.pointerId,
    orientation,
    active: false,
    x: event.clientX,
    y: event.clientY,
    startX: event.clientX,
    startY: event.clientY,
    cell: null,
  };
  $("battle-app").setPointerCapture(event.pointerId);
}
function moveDrag(x, y) {
  if (!drag) return;
  drag.x = x;
  drag.y = y;
  const under = document.elementFromPoint(x, y)?.closest("[data-cell]");
  drag.cell = null;
  const isHorizontal = horizontal(drag.orientation),
    isReverse = reverse(drag.orientation);
  if (under?.dataset.target === state.me) {
    const cell = Number(under.dataset.cell),
      delta = drag.index * (isReverse ? -1 : 1);
    const row = Math.floor(cell / state.size) - (isHorizontal ? 0 : delta);
    const col = (cell % state.size) - (isHorizontal ? delta : 0);
    if (row >= 0 && row < state.size && col >= 0 && col < state.size)
      drag.cell = row * state.size + col;
  }
  const ghost = $("drag-ghost");
  ghost.hidden = !drag.active;
  ghost.className = drag.orientation;
  ghost.style.gridTemplateColumns = isHorizontal
    ? `repeat(${state.fleet[drag.id]},28px)`
    : "28px";
  const grabbed = isReverse
    ? state.fleet[drag.id] - 1 - drag.index
    : drag.index;
  ghost.style.left = `${x - (isHorizontal ? grabbed * 30 : 0) - 14}px`;
  ghost.style.top = `${y - (isHorizontal ? 0 : grabbed * 30) - 14}px`;
  ghost.replaceChildren(
    ...Array.from({ length: state.fleet[drag.id] }, (_, index) => {
      const segment = document.createElement("i");
      segment.style.order = isReverse ? state.fleet[drag.id] - index : index;
      return segment;
    }),
  );
  renderBoards();
  if (drag.active && dragScrollFrame === null)
    dragScrollFrame = requestAnimationFrame(scrollWhileDragging);
}
function scrollWhileDragging() {
  dragScrollFrame = null;
  if (!drag?.active) return;
  const edge = 64,
    speed = drag.y < edge ? -14 : drag.y > window.innerHeight - edge ? 14 : 0;
  const before = window.scrollY;
  if (speed) window.scrollBy(0, speed);
  if (window.scrollY !== before) moveDrag(drag.x, drag.y);
  if (drag?.active && dragScrollFrame === null)
    dragScrollFrame = requestAnimationFrame(scrollWhileDragging);
}
document.addEventListener(
  "pointermove",
  (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5
    )
      drag.active = true;
    if (drag.active) {
      event.preventDefault();
      moveDrag(event.clientX, event.clientY);
    }
  },
  { passive: false },
);
document.addEventListener("pointerup", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const current = drag;
  if (current.active) moveDrag(event.clientX, event.clientY);
  drag = null;
  $("drag-ghost").hidden = true;
  if (current.active) {
    suppressClickUntil = Date.now() + 350;
    if (current.cell != null)
      void placeShip(candidate(current.cell, current.id, current.orientation));
    else renderBoards();
  } else choose(current.id);
});
document.addEventListener("pointercancel", () => {
  drag = null;
  $("drag-ghost").hidden = true;
  renderBoards();
});
function rotateShip() {
  if (!canSetup()) return;
  orientation =
    DIRECTIONS[(DIRECTIONS.indexOf(orientation) + 1) % DIRECTIONS.length];
  $("rotate").textContent = `Mũi ${DIRECTION_LABELS[orientation]} · R`;
  if (drag) {
    drag.orientation = orientation;
    drag.active = true;
    moveDrag(drag.x, drag.y);
  } else render();
}
document.addEventListener("keydown", (event) => {
  if (
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target?.closest?.("input,textarea,select,[contenteditable=true]") ||
    $("leave-dialog").open
  )
    return;
  if (event.key.toLowerCase() === "r" && canSetup()) {
    event.preventDefault();
    rotateShip();
  }
  if (event.key === "Escape" && drag) {
    drag = null;
    $("drag-ghost").hidden = true;
    renderBoards();
  }
  if (event.key === "Escape") {
    closeFleetTooltips();
    for (const mark of ["X", "O"]) $("fleet-info-" + mark).blur?.();
  }
});
document.addEventListener("contextmenu", (event) => {
  if (drag && canSetup()) {
    event.preventDefault();
    rotateShip();
  }
});
$("rotate").addEventListener("click", rotateShip);
$("remove-ship").addEventListener("click", () => {
  if (canSetup())
    void action("place", {
      placements: state.placements.filter((ship) => ship.id !== selectedShip),
      revision: state.setupRevision,
    });
});
$("randomize").addEventListener("click", () => {
  if (canSetup()) void action("randomize", { revision: state.setupRevision });
});
$("ready").addEventListener("click", () => {
  if (canSetup() && state.placements.length === state.fleet.length)
    void action("ready", { revision: state.setupRevision });
});
for (const mark of ["X", "O"])
  $("view-" + mark).addEventListener("click", () => {
    view = mark;
    render();
  });
function formatClock(ms) {
  if (!Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function updateClock() {
  if (!state) return;
  const at = Date.now() + offset,
    remaining = { ...state.clocks };
  if (state.status === "playing")
    remaining[state.turn] = Math.max(
      0,
      remaining[state.turn] - Math.max(0, at - state.clockStartedAt),
    );
  for (const mark of ["X", "O"]) {
    const el = $("clock-" + mark);
    el.textContent = state.players[mark] ? formatClock(remaining[mark]) : "—";
    const running = state.status === "playing" && state.turn === mark;
    el.classList.toggle("running", running);
    el.classList.toggle("low", running && remaining[mark] <= 60000);
  }
  $("timer-panel").hidden = !open();
  const setup = state.status === "setup",
    waiting = state.status === "waiting";
  $("timer-label").textContent = waiting
    ? "Chờ đối thủ"
    : setup
      ? "Chuẩn bị còn lại"
      : "Đồng hồ " + state.turn;
  const ms = waiting
    ? state.waitingDeadline - at
    : setup
      ? state.setupDeadline - at
      : remaining[state.turn];
  $("timer").textContent = formatClock(ms);
  $("timer-progress").max = waiting
    ? 600
    : setup
      ? state.fleet.length * 20
      : state.clockInitialMs / 1000;
  $("timer-progress").value = Math.max(0, Math.ceil(ms / 1000));
  $("timer-panel").classList.toggle("urgent", ms <= 15000);
}
async function refresh() {
  accept(await api(`/api/state?room=${encodeURIComponent(roomId)}`));
}

$("leave").addEventListener("click", () => {
  if (!state?.me || !["waiting", "setup", "playing"].includes(state.status))
    return;
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
    !["waiting", "setup", "playing"].includes(state.status)
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
  const pathId = /^\/(?:battleship\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/battleship/room/${roomId}`);
    await refresh();
    subscribe();
    if (state.me) clearStoredPairing();
    else restorePairing();
  } catch (error) {
    $("connection").textContent = "Chưa vào bàn";
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
