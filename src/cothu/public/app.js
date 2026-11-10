"use strict";
const $ = (id) => document.getElementById(id),
  API = "/api/games/cothu";
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
let from = null,
  rotated = false,
  orientationOwner = null,
  drag = null,
  ghost = null,
  hover = null,
  moveIntent = null,
  slide = null,
  suppressContextUntil = 0;
const cells = [];
const coord = (cell) =>
  String.fromCharCode(97 + (cell % 7)) + (9 - Math.floor(cell / 7));
const canAct = () =>
  !!(
    state?.me &&
    state.status === "playing" &&
    state.turn === state.me &&
    connected &&
    !pending
  );
const ownSide = () => state?.sideBySeat[state.me];
const sideLabel = (side) => (side === "red" ? "Đỏ ●" : "Xanh ◆");
const legal = (a, b) =>
  state?.legalMoves.some((m) => m.from === a && m.to === b);
const pieceAt = (cell) => state.pieces.find((p) => p.cell === cell);
function resetPreview() {
  from = null;
  cancelDrag();
}
function select(cell) {
  if (!canAct()) return;
  const piece = pieceAt(cell);
  if (piece?.side === ownSide()) {
    from = from === cell ? null : cell;
    notice("");
    render();
    return;
  }
  if (from !== null && legal(from, cell)) void commit(from, cell);
  else if (from !== null) notice("Ô đích không hợp lệ. Chọn ô được tô sáng.");
}
function cellAtPoint(x, y) {
  const target = document.elementFromPoint(x, y)?.closest(".cell");
  return target && $("board").contains(target)
    ? Number(target.dataset.cell)
    : null;
}
function cancelDrag() {
  const old = drag;
  drag = null;
  hover = null;
  ghost?.remove();
  ghost = null;
  if (old && cells[old.cell]?.hasPointerCapture(old.id))
    cells[old.cell].releasePointerCapture(old.id);
}
function cancelHeldPiece() {
  suppressContextUntil = Date.now() + 800;
  resetPreview();
  notice("");
  render();
}
function cancelSlide() {
  const old = slide;
  slide = null;
  old?.animation.cancel();
  old?.cell.classList.remove("move-sliding");
}
function startSlide(intent) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cell = cells[intent.to],
    piece = cell?.querySelector(".animal");
  if (!piece?.animate) return;
  cancelSlide();
  const a = cells[intent.from].getBoundingClientRect(),
    b = cell.getBoundingClientRect();
  const dx = a.x + a.width / 2 - b.x - b.width / 2;
  const dy = a.y + a.height / 2 - b.y - b.height / 2;
  cell.classList.add("move-sliding");
  const animation = piece.animate(
    [
      { transform: `translate(${dx}px,${dy}px)` },
      { transform: "translate(0,0)" },
    ],
    { duration: 210, easing: "cubic-bezier(.2,.7,.25,1)" },
  );
  const current = (slide = { animation, cell });
  const finish = () => {
    if (slide === current) {
      cell.classList.remove("move-sliding");
      slide = null;
    }
  };
  animation.onfinish = finish;
  animation.oncancel = finish;
}
$("board").addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (drag?.own || from !== null) cancelHeldPiece();
});
window.addEventListener(
  "mousedown",
  (event) => {
    if (event.button === 2 && drag?.own) {
      event.preventDefault();
      cancelHeldPiece();
    }
  },
  true,
);
window.addEventListener(
  "contextmenu",
  (event) => {
    if (drag?.own) cancelHeldPiece();
    if (Date.now() < suppressContextUntil) event.preventDefault();
  },
  true,
);
function buildBoard() {
  if (cells.length) return;
  for (let i = 0; i < 63; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.cell = String(i);
    button.addEventListener("click", (event) => {
      if (event.detail === 0) select(i);
    });
    button.addEventListener("pointerdown", (event) => {
      if (
        !canAct() ||
        event.button !== 0 ||
        drag ||
        document.querySelector("dialog[open]") ||
        WebGameMobile.active()
      )
        return;
      event.preventDefault();
      drag = {
        id: event.pointerId,
        cell: i,
        own: pieceAt(i)?.side === ownSide(),
        x: event.clientX,
        y: event.clientY,
        moved: false,
        version: state.version,
        me: state.me,
      };
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener("pointermove", (event) => {
      if (drag?.id !== event.pointerId) return;
      const d = drag;
      if (Math.hypot(event.clientX - d.x, event.clientY - d.y) > 6)
        d.moved = true;
      if (!d.moved || !d.own) return;
      event.preventDefault();
      if (!ghost) {
        from = d.cell;
        ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.setAttribute("aria-hidden", "true");
        const rect = button.getBoundingClientRect();
        ghost.style.width = rect.width * 0.82 + "px";
        ghost.style.height = rect.height * 0.83 + "px";
        ghost.append(pieceNode(pieceAt(d.cell)));
        document.body.append(ghost);
      }
      ghost.style.left = event.clientX + "px";
      ghost.style.top = event.clientY + "px";
      hover = cellAtPoint(event.clientX, event.clientY);
      renderBoard();
    });
    button.addEventListener("pointerup", (event) => {
      if (drag?.id !== event.pointerId) return;
      event.preventDefault();
      const d = drag,
        target = cellAtPoint(event.clientX, event.clientY);
      const valid =
        canAct() &&
        d.version === state.version &&
        d.me === state.me &&
        !document.querySelector("dialog[open]") &&
        !WebGameMobile.active();
      cancelDrag();
      if (!valid) {
        from = null;
        render();
        return;
      }
      if (!d.moved) return select(d.cell);
      if (d.own && target === d.cell) {
        from = d.cell;
        notice("");
        render();
      } else if (d.own && target !== null && legal(d.cell, target))
        void commit(d.cell, target, d.version, false);
      else {
        from = d.own ? d.cell : null;
        notice("Đã hủy: thả quân vào ô hợp lệ.");
        render();
      }
    });
    const cancelled = (event) => {
      if (drag?.id === event.pointerId) {
        cancelDrag();
        from = null;
        render();
      }
    };
    button.addEventListener("pointercancel", cancelled);
    button.addEventListener("lostpointercapture", cancelled);
    button.addEventListener("keydown", (e) => {
      if (
        document.querySelector("dialog[open]") ||
        WebGameMobile.active() ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(i);
        return;
      }
      const d = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }[e.key];
      if (!d) return;
      e.preventDefault();
      const sign = rotated ? -1 : 1,
        r = Math.floor(i / 7) + d[0] * sign,
        c = (i % 7) + d[1] * sign;
      if (r >= 0 && r < 9 && c >= 0 && c < 7) cells[r * 7 + c].focus();
    });
    cells.push(button);
  }
}
function art(id, className) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    use = document.createElementNS(svg.namespaceURI, "use");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);
  use.setAttribute("href", "#" + id);
  svg.append(use);
  return svg;
}
function pieceNode(p) {
  const el = document.createElement("span");
  el.className = `animal ${p.side}${p.effectiveRank === 0 ? " trapped" : ""}`;
  el.append(art("art-" + p.type, "animal-art"));
  const name = document.createElement("span"),
    rank = document.createElement("b"),
    side = document.createElement("span");
  name.className = "animal-name";
  name.textContent = state.animals[p.type].name;
  rank.className = "animal-rank";
  rank.textContent = p.effectiveRank;
  side.className = "animal-side";
  side.textContent = p.side === "red" ? "●" : "◆";
  el.append(name, rank, side);
  el.title = `${state.animals[p.type].name} ${sideLabel(p.side)}, bậc gốc ${p.rank}${p.effectiveRank === 0 ? ", mắc bẫy: sức mạnh 0" : ""}`;
  return el;
}
function renderCoordinates() {
  const target = $("coordinate-axes");
  if (target.dataset.rotated === String(rotated)) return;
  target.dataset.rotated = String(rotated);
  target.replaceChildren();
  for (const edge of ["top", "bottom", "left", "right"]) {
    const axis = document.createElement("div");
    axis.className = "axis axis-" + edge;
    const files = edge === "top" || edge === "bottom";
    const labels = files
      ? [...(rotated ? "gfedcba" : "abcdefg")]
      : Array.from({ length: 9 }, (_, row) =>
          String(rotated ? row + 1 : 9 - row),
        );
    for (const text of labels) {
      const label = document.createElement("span");
      label.textContent = text;
      axis.append(label);
    }
    target.append(axis);
  }
}
function renderBoard() {
  buildBoard();
  renderCoordinates();
  const m =
      (canAct() &&
        from !== null &&
        hover !== null &&
        state.legalMoves.find(
          (move) => move.from === from && move.to === hover,
        )) ||
      null,
    order = rotated ? [...cells].reverse() : cells;
  const board = $("board");
  $("rotate-board").setAttribute("aria-pressed", String(rotated));
  if (board.dataset.rotated !== String(rotated)) {
    const focus = document.activeElement?.dataset.cell;
    board.append(...order);
    board.dataset.rotated = String(rotated);
    if (focus != null) cells[Number(focus)]?.focus({ preventScroll: true });
  }
  cells.forEach((el, cell) => {
    const t = state.terrain[cell],
      p = pieceAt(cell),
      target =
        canAct() &&
        state.legalMoves.find((m) => m.from === from && m.to === cell);
    el.className = `cell ${t.kind}${t.owner ? " terrain-" + t.owner : ""}`;
    if (slide?.cell === el) el.classList.add("move-sliding");
    if (p && canAct() && p.side === ownSide()) el.classList.add("own-piece");
    if (cell === from) el.classList.add("selected");
    if (target)
      el.classList.add(
        target.capturedPieceId
          ? "legal-capture"
          : target.jumped
            ? "legal-jump"
            : "legal",
      );
    if (target && cell === hover) el.classList.add("hover-target");
    if (drag?.moved && drag.own && cell === drag.cell)
      el.classList.add("drag-source");
    if (m?.path.includes(cell)) el.classList.add("jump-path");
    if (
      state.lastMove &&
      (cell === state.lastMove.from || cell === state.lastMove.to)
    )
      el.classList.add("recent");
    const terrainKey = `${t.kind}:${t.owner || ""}`;
    if (el.dataset.terrain !== terrainKey) {
      el.dataset.terrain = terrainKey;
      el.dataset.piece = "";
      el.replaceChildren();
      if (t.kind === "den" || t.kind === "trap")
        el.append(art("art-" + t.kind, "terrain-art"));
    }
    const pieceKey = p ? `${p.id}:${p.effectiveRank}` : "";
    if (el.dataset.piece !== pieceKey) {
      el.dataset.piece = pieceKey;
      el.querySelector(".animal")?.remove();
      if (p) el.append(pieceNode(p));
    }
    const terrain =
      t.kind === "water"
        ? "nước"
        : t.kind === "trap"
          ? "bẫy " + sideLabel(t.owner)
          : t.kind === "den"
            ? "hang " + sideLabel(t.owner)
            : "đất";
    el.setAttribute(
      "aria-label",
      `${coord(cell)}, ${terrain}${p ? ", " + state.animals[p.type].name + " " + sideLabel(p.side) + " bậc " + p.effectiveRank : ""}${target ? ", đích hợp lệ" : ""}`,
    );
    el.setAttribute("aria-pressed", String(cell === from));
    el.title =
      el.getAttribute("aria-label") + (p ? ` (bậc gốc ${p.rank})` : "");
    el.tabIndex = cell === (from ?? (rotated ? 62 : 0)) ? 0 : -1;
  });
  $("board").setAttribute(
    "aria-label",
    "Cờ thú 7 cột 9 hàng, " + (rotated ? "Xanh" : "Đỏ") + " ở dưới",
  );
}
function moveText(m) {
  if (!m) return "Đỏ đi trước. Kéo thả hoặc chạm quân rồi chạm ô đích.";
  const p = state.pieces.find((p) => p.id === m.pieceId),
    captured = state.pieces.find((p) => p.id === m.capturedPieceId);
  return `${m.ply}. ${sideLabel(m.side)} · ${state.animals[p.type].name} ${coord(m.from)} → ${coord(m.to)}${m.jumped ? " · Nhảy sông" : ""}${captured ? " · Ăn " + state.animals[captured.type].name : ""}`;
}
function render() {
  if (!state) return;
  if (drag && !canAct()) cancelDrag();
  WebGamePlayers.render(state);
  WebGameBoardUI.renderRules("cothu", state);
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("move-count").textContent = state.ply + " lượt";
  $("rules-detail").textContent = state.rulesLabel;
  const playing = state.status === "playing",
    waiting = state.status === "waiting",
    reason =
      {
        den: "Chiếm hang địch.",
        elimination: "Đối thủ không còn quân.",
        no_legal_moves: "Đối thủ không còn nước hợp lệ.",
        threefold: "Hòa do lặp thế ba lần.",
        no_capture_limit: "Hòa sau 100 lượt không ăn quân.",
        timeout: "Hết thời gian trên đồng hồ.",
        resign: "Một người chơi đầu hàng.",
        expired: "Phòng chờ hết hạn sau 10 phút.",
        cancelled: "Chủ phòng hủy lời mời.",
      }[state.endReason] || "";
  $("status-title").textContent = waiting
    ? "Đang chờ đối thủ"
    : playing
      ? "Lượt " + state.playerLabels[state.turn]
      : state.winner
        ? state.players[state.winner] + " chiến thắng!"
        : state.reason === "draw"
          ? "Hai bên hòa nhau"
          : "Phòng đã đóng";
  $("status-detail").textContent = waiting
    ? "Đồng hồ Đỏ bắt đầu ngay khi người thứ hai tham gia."
    : playing
      ? (state.me
          ? "Bạn cầm " + state.playerLabels[state.me]
          : "Khán giả · Chỉ xem") + ". Bẫy địch làm sức mạnh về 0."
      : reason;
  $("board-state").textContent = $("status-title").textContent;
  for (const seat of ["X", "O"]) {
    $("name-" + seat).textContent = state.players[seat] || "Đang chờ đối thủ";
    $("you-" + seat).hidden = seat !== state.me;
    $("role-" + seat).textContent = state.playerLabels[seat];
    $("player-" + seat).dataset.side = state.sideBySeat[seat];
    $("player-" + seat).classList.toggle(
      "active",
      playing && seat === state.turn,
    );
    $("score-" + seat).textContent =
      state.pieces.filter(
        (p) => p.side === state.sideBySeat[seat] && p.cell !== null,
      ).length + "/8 quân";
  }
  $("instruction").textContent = !playing
    ? reason || "Chờ người thứ hai tham gia."
    : !state.me
      ? "Kết nối tài khoản nếu bạn là người chơi; khán giả chỉ xem."
      : !canAct()
        ? pending
          ? "Đang thực hiện nước đi…"
          : "Đang chờ lượt của bạn."
        : from === null
          ? "Chọn một quân của bạn."
          : "Chọn ô đi, ăn hoặc nhảy được tô sáng để đi ngay.";
  $("last-action").textContent = moveText(state.lastMove);
  const history = $("move-history");
  if (history.dataset.version !== String(state.version)) {
    history.dataset.version = String(state.version);
    history.replaceChildren();
    for (const move of [...state.history].reverse()) {
      const li = document.createElement("li");
      li.textContent = moveText(move);
      history.append(li);
    }
    $("history-count").textContent =
      state.history.length +
      " nước · " +
      state.noCapturePly +
      "/100 lượt không bắt";
  }
  const captured = $("captured");
  captured.replaceChildren();
  for (const side of ["red", "blue"]) {
    const line = document.createElement("p"),
      lost = state.pieces.filter((p) => p.side === side && p.cell === null);
    line.textContent =
      sideLabel(side) +
      " đã mất: " +
      (lost.map((p) => state.animals[p.type].name + " " + p.rank).join(", ") ||
        "chưa có");
    captured.append(line);
  }
  $("connect-player").hidden = !!state.me || !(playing || waiting);
  $("pair-panel").hidden = !!state.me || !pairVisible;
  $("leave").hidden = !state.me || !(playing || waiting);
  $("leave").textContent = waiting ? "Hủy phòng" : "Đầu hàng";
  renderBoard();
  updateClock();
  WebGameMobile.update("cothu", state);
}
$("rotate-board").addEventListener("click", () => {
  resetPreview();
  cancelSlide();
  rotated = !rotated;
  $("rotate-board").setAttribute("aria-pressed", String(rotated));
  renderBoard();
});
async function commit(a, b, version = state?.version, animate = true) {
  if (!canAct() || version !== state.version || !legal(a, b)) return;
  const data = { roomId, version, from: a, to: b };
  const intent = (moveIntent = {
    roomId: state.id,
    ply: state.ply + 1,
    from: a,
    to: b,
    pieceId: pieceAt(a).id,
    animate,
    confirmed: false,
  });
  resetPreview();
  pending = true;
  render();
  try {
    accept(await api("/api/move", data));
    notice("");
  } catch (e) {
    if (!intent.confirmed) notice(e.message);
    await refresh().catch(() => connection(false));
  } finally {
    if (moveIntent === intent) moveIntent = null;
    pending = false;
    render();
  }
}
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    !document.querySelector("dialog[open]") &&
    !WebGameMobile.active()
  ) {
    resetPreview();
    render();
  }
});
for (const event of ["blur", "resize"])
  window.addEventListener(event, () => {
    cancelDrag();
    cancelSlide();
    if (state) requestAnimationFrame(renderBoard);
  });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelDrag();
    cancelSlide();
  }
});
function accept(next) {
  if (
    state &&
    next.id === state.id &&
    (next.version < state.version ||
      (next.version === state.version &&
        next.me === state.me &&
        next.serverNow <= state.serverNow))
  )
    return;
  let transition = null;
  if (!state || state.id !== next.id || next.ply > state.ply) cancelSlide();
  if (
    moveIntent &&
    next.id === moveIntent.roomId &&
    next.ply >= moveIntent.ply
  ) {
    const intent = moveIntent,
      last = next.lastMove;
    moveIntent = null;
    if (
      last?.ply === intent.ply &&
      last.pieceId === intent.pieceId &&
      last.from === intent.from &&
      last.to === intent.to
    ) {
      intent.confirmed = true;
      if (intent.animate) transition = intent;
    }
  }
  WebGameFeedback.update("cothu", next);
  if (
    !state ||
    state.version !== next.version ||
    state.me !== next.me ||
    state.id !== next.id
  )
    resetPreview();
  if (orientationOwner !== next.me) {
    orientationOwner = next.me;
    rotated = next.me ? next.sideBySeat[next.me] === "blue" : false;
  }
  if (state && state.status !== next.status) $("leave-dialog").close();
  state = next;
  offset = next.serverNow - Date.now();
  if (!["waiting", "playing"].includes(state.status)) {
    clearTimeout(pairTimer);
    pairing = false;
    pairVisible = false;
    pairingToken = null;
    pairAttempt++;
    clearStoredPairing();
  }
  render();
  if (transition) startSlide(transition);
}

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
  const pathId = /^\/(?:cothu\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/cothu/room/${roomId}`);
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
  cancelDrag();
  cancelSlide();
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
