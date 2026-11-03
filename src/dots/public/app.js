"use strict";

const $ = (id) => document.getElementById(id);
const API = "/api/games/dots";
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

$("zoom-board").addEventListener("click", () => {
  const enlarged = $("board").classList.toggle("enlarged");
  $("zoom-board").setAttribute("aria-pressed", String(enlarged));
  $("zoom-board").textContent = enlarged ? "Thu nhỏ" : "Phóng to";
});
function canAct() {
  return Boolean(
    state?.me &&
    state.status === "playing" &&
    state.me === state.turn &&
    connected &&
    !pending,
  );
}
function buildBoard() {
  const board = $("board"),
    size = state.size;
  board.textContent = "";
  board.style.gridTemplateColumns =
    "repeat(" + size + ", 24px minmax(12px,1fr)) 24px";
  board.style.gridTemplateRows =
    "repeat(" + size + ", 24px minmax(12px,1fr)) 24px";
  board.dataset.turn = state.turn;
  function place(element, row, col) {
    element.style.gridRow = String(row);
    element.style.gridColumn = String(col);
    board.append(element);
  }
  for (let row = 0; row <= size; row++)
    for (let col = 0; col <= size; col++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("aria-hidden", "true");
      place(dot, row * 2 + 1, col * 2 + 1);
    }
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      const owner = state.boxes[row * size + col],
        box = document.createElement("div");
      box.className = "box" + (owner ? " " + owner.toLowerCase() : "");
      box.textContent = owner || "";
      box.setAttribute(
        "aria-label",
        "Ô hàng " +
          (row + 1) +
          ", cột " +
          (col + 1) +
          ": " +
          (owner || "chưa có chủ"),
      );
      place(box, row * 2 + 2, col * 2 + 2);
    }
  const count = size * (size + 1);
  for (let edge = 0; edge < state.edges.length; edge++) {
    const horizontal = edge < count,
      index = horizontal ? edge : edge - count;
    const row = Math.floor(index / (horizontal ? size : size + 1)),
      col = index % (horizontal ? size : size + 1);
    const owner = state.edges[edge],
      button = document.createElement("button");
    button.type = "button";
    button.className =
      "edge " +
      (horizontal ? "horizontal" : "vertical") +
      (owner ? " " + owner.toLowerCase() : "") +
      (state.lastAction?.edge === edge ? " last" : "");
    button.disabled = !canAct() || Boolean(owner);
    button.setAttribute(
      "aria-label",
      "Cạnh " +
        (horizontal ? "ngang" : "dọc") +
        " hàng " +
        (row + 1) +
        ", cột " +
        (col + 1) +
        ": " +
        (owner || "trống"),
    );
    button.addEventListener("click", () => play(edge));
    place(
      button,
      row * 2 + (horizontal ? 1 : 2),
      col * 2 + (horizontal ? 2 : 1),
    );
  }
}
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
function accept(next) {
  if (state && next.version < state.version) return;
  if (state && state.status !== next.status) $("leave-dialog").close();
  state = next;
  if (state.status !== "playing" && state.status !== "waiting") {
    $("leave-dialog").close();
    clearTimeout(pairTimer);
    pairing = false;
    pairVisible = false;
    pairingToken = null;
    pairAttempt++;
    clearStoredPairing();
  }
  offset = next.serverNow - Date.now();
  render();
}

const REASONS = {
  win: "Tất cả ô đã có chủ. Người nhiều ô hơn thắng.",
  draw: "Hai người có cùng số ô. Ván đấu hòa.",
  timeout: "Một người chơi đã hết thời gian trên đồng hồ riêng.",
  resign: "Một người chơi đã đầu hàng.",
  expired: "Phòng chờ hết hạn sau 10 phút. Tạo phòng mới trong Discord.",
  cancelled: "Chủ phòng đã hủy lời mời.",
};
function render() {
  if (state) globalThis.WebGamePlayers?.render(state);
  if (state) globalThis.WebGameMobile?.update("dots", state);
  const playing = state.status === "playing",
    waiting = state.status === "waiting",
    spectator = !state.me,
    myTurn = playing && state.me === state.turn;
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("move-count").textContent =
    state.moves + " / " + state.edges.length + " cạnh";
  $("rules-detail").textContent = state.rulesLabel;
  $("board-caption").textContent =
    state.size +
    "×" +
    state.size +
    " ô · " +
    (state.size + 1) +
    "×" +
    (state.size + 1) +
    " chấm";
  for (const mark of ["X", "O"]) {
    $("name-" + mark).textContent = state.players[mark] || "Đang chờ đối thủ";
    $("you-" + mark).hidden = state.me !== mark;
    $("score-" + mark).textContent = state.scores[mark] + " ô";
    $("player-" + mark).classList.toggle(
      "active",
      playing && state.turn === mark,
    );
  }
  const bonus = playing && state.lastAction?.captured.length > 0;
  $("status-label").textContent = waiting
    ? "CHỜ ĐỐI THỦ"
    : !playing
      ? "KẾT QUẢ"
      : spectator
        ? "ĐANG XEM TRỰC TIẾP"
        : "BẠN LÀ " + state.me;
  $("status-title").textContent = waiting
    ? "Cùng nối một ván."
    : playing
      ? myTurn
        ? bonus
          ? "Ghi điểm. Đi tiếp!"
          : "Đến lượt bạn."
        : "Lượt của " + state.turn + "."
      : state.winner
        ? state.winner === state.me
          ? "Bạn đã thắng!"
          : state.players[state.winner] + " thắng!"
        : state.reason === "draw"
          ? "Một ván hòa."
          : "Phòng đã đóng.";
  $("status-detail").textContent = waiting
    ? "Mời đối thủ bấm Tham gia trong tin phòng Discord. X nối cạnh đầu tiên."
    : !playing
      ? REASONS[state.reason] || "Ván đấu đã kết thúc."
      : spectator
        ? "Bạn đang xem trực tiếp. Nếu là người chơi, xác nhận tài khoản bên dưới."
        : myTurn
          ? bonus
            ? "Bạn vừa chiếm " +
              state.lastAction.captured.length +
              " ô. Tiếp tục nối một cạnh trống; đồng hồ của bạn vẫn chạy."
            : "Chọn một cạnh giữa hai chấm. Khép kín ô để ghi điểm và được đi tiếp."
          : state.players[state.turn] + " đang chọn cạnh tiếp theo.";
  $("board-state").textContent = waiting
    ? "Chờ đủ hai người"
    : playing
      ? "Lượt " + state.turn + " · " + state.players[state.turn]
      : "Đã kết thúc · " + state.scores.X + " – " + state.scores.O;
  $("timer-panel").hidden = !(playing || waiting);
  $("timer-label").textContent = waiting
    ? "Thời gian chờ còn lại"
    : "Đồng hồ " + state.turn;
  $("leave").hidden = spectator || !(playing || waiting);
  $("leave").textContent = waiting ? "Hủy phòng chờ" : "Đầu hàng";
  $("leave").disabled = pending || !connected;
  $("connect-player").hidden = !spectator || !(playing || waiting);
  $("pair-panel").hidden = !spectator || !pairVisible || !(playing || waiting);
  if (!playing || spectator) $("leave-dialog").close();
  buildBoard();
  updateClock();
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
  if (!["waiting", "playing"].includes(state.status)) return;
  const ms =
    state.status === "waiting"
      ? Math.max(0, state.waitingDeadline - at)
      : remaining?.[state.turn];
  $("timer").textContent = formatClock(ms);
  $("timer-progress").max =
    state.status === "waiting" ? 600 : state.clockInitialMs / 1000;
  $("timer-progress").value = Number.isFinite(ms) ? Math.ceil(ms / 1000) : 0;
  $("timer-panel").classList.toggle("urgent", ms <= 60000);
}
async function refresh() {
  accept(await api(`/api/state?room=${encodeURIComponent(roomId)}`));
}

async function play(edge) {
  if (!canAct() || state.edges[edge]) return;
  pending = true;
  notice("");
  const version = state.version;
  render();
  try {
    accept(await api("/api/move", { roomId, edge, version }));
  } catch (error) {
    notice(error.message);
    await refresh().catch(() => connection(false));
  } finally {
    pending = false;
    render();
  }
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
  const pathId = /^\/(?:dots\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/dots/room/${roomId}`);
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
