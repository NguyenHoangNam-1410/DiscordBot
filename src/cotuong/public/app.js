"use strict";
const $ = (id) => document.getElementById(id),
  API = "/api/games/cotuong";
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
  hover = null;
const cells = [],
  coord = (n) => String.fromCharCode(97 + (n % 9)) + (9 - Math.floor(n / 9));
const canAct = () =>
  !!(
    state?.me &&
    state.status === "playing" &&
    state.turn === state.me &&
    connected &&
    !pending
  );
const ownSide = () => state?.sideBySeat[state.me],
  sideLabel = (s) => (s === "red" ? "Đỏ ●" : "Đen ◆");
const pieceAt = (cell) => state.pieces.find((p) => p.cell === cell);
const legal = (a, b) =>
  state?.legalMoves.some((m) => m.from === a && m.to === b);
function resetPreview() {
  from = null;
  cancelDrag();
}
function select(cell) {
  if (!canAct()) return;
  const p = pieceAt(cell);
  if (p?.side === ownSide()) {
    from = from === cell ? null : cell;
    notice("");
    render();
    return;
  }
  if (from !== null && legal(from, cell)) void commit(from, cell);
  else if (from !== null)
    notice("Nước đi không hợp lệ. Chọn giao điểm được tô sáng.");
}
function pieceNode(p) {
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.classList.add("piece", p.side);
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("aria-hidden", "true");
  for (const [r, cls] of [
    [29, "outer-ring"],
    [25, "inner-ring"],
  ]) {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", "32");
    circle.setAttribute("cy", "32");
    circle.setAttribute("r", r);
    circle.setAttribute("class", cls);
    svg.append(circle);
  }
  const use = document.createElementNS(ns, "use"),
    key = p.side === "red" ? p.type : p.type.toLowerCase(),
    ch = state.pieceCharacters[key];
  use.setAttribute("href", "#glyph-" + ch.codePointAt(0).toString(16));
  svg.append(use);
  return svg;
}
function cellAtPoint(x, y) {
  const b = $("board"),
    r = b.getBoundingClientRect(),
    left = r.left + b.clientLeft,
    top = r.top + b.clientTop,
    dx = x - left,
    dy = y - top;
  if (dx < 0 || dy < 0 || dx >= b.clientWidth || dy >= b.clientHeight)
    return null;
  const n =
    Math.floor((dy / b.clientHeight) * 10) * 9 +
    Math.floor((dx / b.clientWidth) * 9);
  return rotated ? 89 - n : n;
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
function buildBoard() {
  if (cells.length) return;
  for (let i = 0; i < 90; i++) {
    const el = document.createElement("button");
    el.type = "button";
    el.dataset.cell = i;
    el.addEventListener("click", (e) => {
      if (e.detail === 0) select(i);
    });
    el.addEventListener("pointerdown", (e) => {
      if (
        !canAct() ||
        e.button !== 0 ||
        drag ||
        document.querySelector("dialog[open]") ||
        WebGameMobile.active()
      )
        return;
      e.preventDefault();
      const own = pieceAt(i)?.side === ownSide();
      drag = {
        id: e.pointerId,
        cell: i,
        own,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        version: state.version,
        me: state.me,
      };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
      if (!d.moved || !d.own) return;
      e.preventDefault();
      if (!ghost) {
        from = d.cell;
        ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.setAttribute("aria-hidden", "true");
        const r = el.getBoundingClientRect();
        ghost.style.width = r.width * 0.9 + "px";
        ghost.style.height = r.height * 0.9 + "px";
        ghost.append(pieceNode(pieceAt(d.cell)));
        document.body.append(ghost);
      }
      ghost.style.left = e.clientX + "px";
      ghost.style.top = e.clientY + "px";
      hover = cellAtPoint(e.clientX, e.clientY);
      renderBoard();
    });
    el.addEventListener("pointerup", (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      e.preventDefault();
      const d = drag,
        target = cellAtPoint(e.clientX, e.clientY),
        valid = canAct() && d.version === state.version && d.me === state.me;
      cancelDrag();
      if (!valid) {
        from = null;
        render();
        return;
      }
      if (d.moved) {
        if (d.own && target !== null && legal(d.cell, target))
          void commit(d.cell, target, d.version);
        else {
          from = d.own ? d.cell : null;
          notice("Đã hủy: thả quân vào giao điểm hợp lệ.");
          render();
        }
      } else select(d.cell);
    });
    const cancelled = (e) => {
      if (drag?.id === e.pointerId) {
        cancelDrag();
        from = null;
        render();
      }
    };
    el.addEventListener("pointercancel", cancelled);
    el.addEventListener("lostpointercapture", cancelled);
    el.addEventListener("keydown", (e) => {
      if (
        document.querySelector("dialog[open]") ||
        WebGameMobile.active() ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[
        e.key
      ];
      if (!d) return;
      e.preventDefault();
      const view = rotated ? 89 - i : i,
        v = view + d;
      if (
        v < 0 ||
        v >= 90 ||
        (Math.abs(d) === 1 && Math.floor(view / 9) !== Math.floor(v / 9))
      )
        return;
      cells[rotated ? 89 - v : v].focus();
    });
    cells.push(el);
    $("board").append(el);
  }
}
function renderBoard() {
  if (!state) return;
  buildBoard();
  for (let i = 0; i < 90; i++) {
    const el = cells[i],
      v = rotated ? 89 - i : i,
      p = pieceAt(i),
      target = canAct() && from !== null && legal(from, i);
    el.style.gridRow = 1 + Math.floor(v / 9);
    el.style.gridColumn = 1 + (v % 9);
    el.className = "cell";
    if (p && canAct() && p.side === ownSide()) el.classList.add("own-piece");
    if (i === from) el.classList.add("selected");
    if (target) el.classList.add(p ? "legal-capture" : "legal");
    if (target && i === hover) el.classList.add("hover-target");
    if (drag?.moved && drag.own && i === drag.cell)
      el.classList.add("drag-source");
    if (state.lastMove?.from === i) el.classList.add("recent-from");
    if (state.lastMove?.to === i) el.classList.add("recent-to");
    if (
      state.check &&
      p?.type === "K" &&
      p.side === state.sideBySeat[state.turn]
    )
      el.classList.add("checked");
    const key = p?.id || "";
    if (el.dataset.piece !== key) {
      el.dataset.piece = key;
      el.replaceChildren();
      const address = document.createElement("span");
      address.className = "coordinate";
      address.textContent = coord(i);
      address.setAttribute("aria-hidden", "true");
      el.append(address);
      if (p) el.append(pieceNode(p));
    }
    el.setAttribute(
      "aria-label",
      coord(i) +
        (p
          ? ", " + state.pieceNames[p.type] + " " + sideLabel(p.side)
          : ", trống") +
        (target ? ", nước đi hợp lệ" : ""),
    );
    el.setAttribute("aria-pressed", String(i === from));
    el.title = el.getAttribute("aria-label");
    el.tabIndex = i === (from ?? (rotated ? 89 : 0)) ? 0 : -1;
  }
  $("board").setAttribute(
    "aria-label",
    "Cờ tướng 9 cột 10 hàng, " + (rotated ? "Đen" : "Đỏ") + " ở dưới",
  );
}
function moveText(m) {
  if (!m) return "Đỏ đi trước. Thả quân vào giao điểm hợp lệ để đi ngay.";
  const captured = state.pieces.find((p) => p.id === m.capturedPieceId);
  return (
    m.ply +
    ". " +
    sideLabel(m.side) +
    " · " +
    state.pieceNames[m.type] +
    " " +
    coord(m.from) +
    " → " +
    coord(m.to) +
    (captured ? " · Ăn " + state.pieceNames[captured.type] : "") +
    (m.check ? " · Chiếu tướng" : "")
  );
}
const reasons = {
  checkmate: "Chiếu bí.",
  stalemate: "Đối thủ hết nước đi hợp lệ.",
  repetition: "Lặp thế theo bộ luật máy chủ.",
  no_capture_limit: "Đạt giới hạn không ăn quân.",
  insufficient_material: "Không đủ lực chiếu hết.",
  perpetual: "Kết quả lặp chiếu / đuổi theo bộ luật máy chủ.",
  timeout: "Hết thời gian trên đồng hồ.",
  resign: "Một người chơi đầu hàng.",
  expired: "Phòng chờ hết hạn sau 10 phút.",
  cancelled: "Chủ phòng hủy lời mời.",
};
function render() {
  if (!state) return;
  if (drag && !canAct()) cancelDrag();
  const playing = state.status === "playing",
    waiting = state.status === "waiting";
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("move-count").textContent = state.ply + " lượt";
  $("rules-detail").textContent = state.rulesLabel;
  $("status-title").textContent = waiting
    ? "Đang chờ đối thủ"
    : playing
      ? (state.check ? "Chiếu tướng · " : "Lượt ") +
        state.playerLabels[state.turn]
      : state.winner
        ? state.players[state.winner] + " chiến thắng!"
        : state.reason === "draw"
          ? "Hai bên hòa nhau"
          : "Phòng đã đóng";
  $("status-detail").textContent = waiting
    ? "Đỏ đi trước. Đồng hồ bắt đầu khi đối thủ tham gia."
    : playing
      ? (state.me
          ? "Bạn cầm " + state.playerLabels[state.me]
          : "Khán giả · Chỉ xem") +
        (state.check
          ? ". Phải hóa giải chiếu."
          : ". Kéo thả hoặc chạm quân rồi chạm ô đích.")
      : reasons[state.endReason] || "";
  $("board-state").textContent = $("status-title").textContent;
  for (const mark of ["X", "O"]) {
    $("name-" + mark).textContent = state.players[mark] || "Đang chờ đối thủ";
    $("you-" + mark).hidden = mark !== state.me;
    $("role-" + mark).textContent = state.playerLabels[mark];
    $("player-" + mark).dataset.side = state.sideBySeat[mark];
    $("player-" + mark).classList.toggle(
      "active",
      playing && mark === state.turn,
    );
    $("score-" + mark).textContent =
      state.pieces.filter(
        (p) => p.side === state.sideBySeat[mark] && p.cell !== null,
      ).length + "/16 quân";
  }
  $("instruction").textContent = !playing
    ? reasons[state.endReason] || "Chờ đối thủ tham gia."
    : !state.me
      ? "Khán giả · Chỉ xem. Kết nối tài khoản nếu bạn là người chơi."
      : pending
        ? "Đang ghi nhận nước đi…"
        : !canAct()
          ? "Chờ lượt đối thủ."
          : from === null
            ? "Kéo thả quân, hoặc chạm quân rồi chạm ô đích. Đi ngay, không cần xác nhận."
            : "Thả vào giao điểm được tô sáng để đi ngay. Thả ra ngoài để hủy.";
  $("last-action").textContent = moveText(state.lastMove);
  const history = $("move-history");
  if (history.dataset.version !== String(state.version)) {
    history.dataset.version = state.version;
    history.replaceChildren();
    for (const m of [...state.history].reverse()) {
      const li = document.createElement("li");
      li.textContent = moveText(m);
      history.append(li);
    }
    $("history-count").textContent = state.ply + " nước đi";
  }
  const captured = $("captured");
  captured.replaceChildren();
  for (const side of ["red", "black"]) {
    const row = document.createElement("div");
    row.className = "captured-row";
    const label = document.createElement("span");
    label.textContent = sideLabel(side) + " đã mất: ";
    row.append(label);
    for (const p of state.pieces.filter(
      (p) => p.side === side && p.cell === null,
    )) {
      const wrapper = document.createElement("span");
      wrapper.title = state.pieceNames[p.type];
      wrapper.append(pieceNode(p));
      row.append(wrapper);
    }
    if (row.children.length === 1)
      row.append(document.createTextNode("Chưa có"));
    captured.append(row);
  }
  $("connect-player").hidden = !!state.me || !(playing || waiting);
  $("pair-panel").hidden = !!state.me || !pairVisible;
  $("leave").hidden = !state.me || !(playing || waiting);
  $("leave").textContent = waiting ? "Hủy phòng" : "Đầu hàng";
  WebGamePlayers.render(state);
  WebGameBoardUI.renderRules("cotuong", state);
  WebGameMobile.update("cotuong", state);
  renderBoard();
  updateClock();
}
async function commit(a, b, version = state?.version) {
  if (!canAct() || version !== state.version || !legal(a, b)) return;
  const data = { roomId, version, from: a, to: b };
  cancelDrag();
  from = null;
  pending = true;
  render();
  try {
    accept(await api("/api/move", data));
    notice("");
  } catch (e) {
    notice(e.message);
    await refresh().catch(() => connection(false));
  } finally {
    pending = false;
    render();
  }
}
$("rotate-board").addEventListener("click", () => {
  resetPreview();
  rotated = !rotated;
  $("rotate-board").setAttribute("aria-pressed", String(rotated));
  render();
});
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
    if (state) requestAnimationFrame(renderBoard);
  });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelDrag();
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
  WebGameFeedback.update("cotuong", next);
  if (
    !state ||
    state.version !== next.version ||
    state.me !== next.me ||
    state.id !== next.id
  )
    resetPreview();
  if (orientationOwner !== next.me) {
    orientationOwner = next.me;
    rotated = !!next.me && next.sideBySeat[next.me] === "black";
    $("rotate-board").setAttribute("aria-pressed", String(rotated));
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
  const pathId = /^\/(?:cotuong\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/cotuong/room/${roomId}`);
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
