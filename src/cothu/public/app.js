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
  to = null,
  rotated = false,
  orientationOwner = null;
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
const choice = () =>
  state?.legalMoves.find((m) => m.from === from && m.to === to);
const pieceAt = (cell) => state.pieces.find((p) => p.cell === cell);
function resetPreview() {
  from = null;
  to = null;
}
function select(cell) {
  if (!canAct()) return;
  const piece = pieceAt(cell);
  if (piece?.side === ownSide()) {
    from = cell;
    to = null;
  } else if (
    from !== null &&
    state.legalMoves.some((m) => m.from === from && m.to === cell)
  )
    to = to === cell ? null : cell;
  else
    return notice(
      from === null
        ? "Chọn một quân của bạn."
        : "Ô đích không hợp lệ. Xem các ô được tô sáng.",
    );
  notice("");
  render();
}
function buildBoard() {
  if (cells.length) return;
  for (let i = 0; i < 63; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.cell = String(i);
    button.addEventListener("click", () => select(i));
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
function pieceNode(p, preview = false) {
  const el = document.createElement("span");
  el.className = `animal ${p.side}${preview ? " animal-preview" : ""}${p.effectiveRank === 0 ? " trapped" : ""}`;
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
function renderBoard() {
  buildBoard();
  const m = choice(),
    order = rotated ? [...cells].reverse() : cells;
  const board = $("board");
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
    if (cell === from) el.classList.add("selected");
    if (target)
      el.classList.add(
        target.capturedPieceId
          ? "legal-capture"
          : target.jumped
            ? "legal-jump"
            : "legal",
      );
    if (cell === to) el.classList.add("preview-target");
    if (m?.path.includes(cell)) el.classList.add("jump-path");
    if (
      state.lastMove &&
      (cell === state.lastMove.from || cell === state.lastMove.to)
    )
      el.classList.add("recent");
    if (p && m?.capturedPieceId === p.id) el.classList.add("capture-preview");
    el.replaceChildren();
    const address = document.createElement("span");
    address.className = "coordinate";
    address.textContent = coord(cell);
    el.append(address);
    if (t.kind === "den" || t.kind === "trap")
      el.append(art("art-" + t.kind, "terrain-art"));
    if (p) el.append(pieceNode(p));
    if (m && cell === m.to) {
      const moving = state.pieces.find((p) => p.id === m.pieceId);
      el.append(
        pieceNode(
          {
            ...moving,
            effectiveRank:
              t.kind === "trap" && t.owner !== moving.side ? 0 : moving.rank,
          },
          true,
        ),
      );
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
    el.setAttribute("aria-pressed", String(cell === from || cell === to));
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
  if (!m) return "Đỏ đi trước. Chọn quân → Ô đích → Xác nhận.";
  const p = state.pieces.find((p) => p.id === m.pieceId),
    captured = state.pieces.find((p) => p.id === m.capturedPieceId);
  return `${m.ply}. ${sideLabel(m.side)} · ${state.animals[p.type].name} ${coord(m.from)} → ${coord(m.to)}${m.jumped ? " · Nhảy sông" : ""}${captured ? " · Ăn " + state.animals[captured.type].name : ""}`;
}
function render() {
  if (!state) return;
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
  const m = choice(),
    t = m ? state.terrain[m.to] : null;
  $("instruction").textContent = !playing
    ? reason || "Chờ người thứ hai tham gia."
    : !state.me
      ? "Kết nối tài khoản nếu bạn là người chơi; khán giả chỉ xem."
      : !canAct()
        ? pending
          ? "Đang xác nhận…"
          : "Đang chờ lượt của bạn."
        : from === null
          ? "Chọn một quân của bạn."
          : to === null
            ? "Chọn ô đi, ăn hoặc nhảy được tô sáng."
            : `${coord(from)} → ${coord(to)}${m.jumped ? " · Nhảy sông" : ""}${m.capturedPieceId ? " · Ăn quân" : ""}${t.kind === "trap" && t.owner !== ownSide() ? " · Vào bẫy địch: sức mạnh 0" : ""}${t.kind === "den" ? " · Chiếm hang để thắng" : ""}. Bấm Xác nhận.`;
  $("confirm").disabled = !canAct() || !m;
  $("clear").disabled = pending || from === null;
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
  rotated = !rotated;
  $("rotate-board").setAttribute("aria-pressed", String(rotated));
  renderBoard();
});
$("clear").addEventListener("click", () => {
  resetPreview();
  notice("");
  render();
});
$("confirm").addEventListener("click", async () => {
  if (!canAct() || !choice()) return;
  const data = { roomId, version: state.version, from, to };
  pending = true;
  render();
  try {
    accept(await api("/api/move", data));
    notice("");
  } catch (e) {
    resetPreview();
    notice(e.message);
    await refresh().catch(() => connection(false));
  } finally {
    pending = false;
    render();
  }
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
function accept(next) {
  if (state && next.id === state.id && next.version < state.version) return;
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
