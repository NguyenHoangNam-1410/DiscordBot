"use strict";

const $ = (id) => document.getElementById(id);
const API = "/api/games/caro";
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
const cells = [];
$("zoom-board").addEventListener("click", () => {
  const enlarged = $("board").classList.toggle("enlarged");
  $("zoom-board").setAttribute("aria-pressed", String(enlarged));
  $("zoom-board").textContent = enlarged ? "Thu nhỏ" : "Phóng to";
});
function buildBoard(size) {
  if (cells.length === size * size) return;
  cells.length = 0;
  $("board").textContent = "";
  $("board").style.setProperty("--board-size", size);
  $("board").setAttribute("aria-label", `Bàn caro ${size} hàng ${size} cột`);
  for (let cell = 0; cell < size * size; cell++) {
    const button = document.createElement("button");
    button.className = "cell";
    button.type = "button";
    button.disabled = true;
    button.addEventListener("click", () => play(cell));
    $("board").append(button);
    cells.push(button);
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
  win: "Đã nối đủ quân theo luật phòng. Ván đấu đã được lưu.",
  timeout: "Một người chơi đã hết thời gian trên đồng hồ riêng.",
  resign: "Một người chơi đã đầu hàng.",
  duration: "Hết thời gian tối đa 30 phút. Ván đấu hòa.",
  draw: "Bàn cờ đã kín. Hai người hòa nhau.",
  expired: "Phòng chờ hết hạn sau 10 phút. Tạo phòng mới trong Discord.",
  cancelled: "Chủ phòng đã hủy lời mời. Tạo phòng mới trong Discord.",
};
function render() {
  if (state) globalThis.WebGamePlayers?.render(state);
  globalThis.WebGameBoardUI?.renderRules("caro", state);
  buildBoard(state.size);
  $("rules-detail").textContent = state.rulesLabel;
  $("board-caption").textContent =
    `${state.size} × ${state.size} · ${state.rules.exactLength ? "Đúng" : "Từ"} ${state.rules.winLength} quân liên tiếp`;
  $("subtitle").textContent =
    `Một đường thẳng, ${state.rules.winLength} quân cờ. Cùng đối thủ tạo nên ván đấu.`;
  const playing = state.status === "playing",
    waiting = state.status === "waiting";
  const spectator = !state.me;
  const myTurn = playing && state.turn === state.me;
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("move-count").textContent = `${state.moves} nước đi`;
  for (const mark of ["X", "O"]) {
    $("name-" + mark).textContent = state.players[mark] || "Đang chờ đối thủ";
    $("you-" + mark).hidden = state.me !== mark;
    $("player-" + mark).classList.toggle(
      "active",
      playing && state.turn === mark,
    );
  }
  $("status-label").textContent = waiting
    ? "CHỜ ĐỐI THỦ"
    : spectator && playing
      ? "ĐANG XEM TRỰC TIẾP"
      : playing
        ? `BẠN CẦM QUÂN ${state.me}`
        : "KẾT QUẢ VÁN ĐẤU";
  $("status-title").textContent = waiting
    ? spectator
      ? "Đang chờ người tham gia."
      : "Đối thủ sắp đến."
    : playing
      ? spectator
        ? `Đến lượt ${state.turn}.`
        : myTurn
          ? "Đến lượt bạn."
          : "Chờ đối thủ ra quân."
      : state.winner && spectator
        ? `${state.players[state.winner]} thắng!`
        : state.winner
          ? state.winner === state.me
            ? "Bạn đã thắng!"
            : "Hẹn ván sau nhé."
          : ["draw", "duration"].includes(state.reason)
            ? "Một ván hòa."
            : "Phòng đã đóng.";
  $("status-detail").textContent = waiting
    ? spectator
      ? "Bạn đang xem bàn cờ. Tham gia bằng nút trong tin phòng Discord; nếu đã là người chơi, bấm Xác nhận người chơi bên dưới."
      : "Chia sẻ tin nhắn phòng trong Discord để mời người khác bấm Tham gia. Bạn cầm X và đi trước."
    : playing
      ? spectator
        ? `${state.players[state.turn]} đang suy nghĩ. Bạn đang xem trực tiếp; nếu là người chơi, bấm Xác nhận người chơi.`
        : myTurn
          ? "Chọn một ô trống để đặt quân cờ của bạn."
          : `${state.players[state.turn]} đang suy nghĩ. Bạn cầm ${state.me}.`
      : REASONS[state.reason] || "Ván đấu đã kết thúc.";
  $("board-state").textContent = waiting
    ? "Đang chờ đủ hai người"
    : playing
      ? `Lượt của ${state.turn} · ${state.players[state.turn]}`
      : "Đã kết thúc";
  $("timer-panel").hidden = !(playing || waiting);
  $("timer-label").textContent = waiting
    ? "Thời gian chờ còn lại"
    : "Đồng hồ " + state.turn;
  $("leave").hidden = spectator || !(playing || waiting);
  $("connect-player").hidden = !spectator || !(playing || waiting);
  $("pair-panel").hidden = !spectator || !pairVisible || !(playing || waiting);
  $("leave").textContent = waiting ? "Hủy phòng chờ" : "Đầu hàng";
  $("leave").disabled = pending || !connected;
  if ((!playing && !waiting) || spectator) $("leave-dialog").close();
  const recentMark =
    state.lastCell == null ? null : state.board[state.lastCell];
  const recentActor =
    recentMark === state.me
      ? "Bạn"
      : state.me
        ? "Đối phương"
        : state.players[recentMark];
  $("recent-action-label").textContent = recentMark
    ? `${recentActor} vừa đặt quân`
    : "Viền vàng: nước đi gần nhất";
  cells.forEach((button, index) => {
    const mark = state.board[index];
    button.textContent = mark === "X" ? "✕" : mark === "O" ? "○" : "";
    button.className = `cell${mark ? " " + mark.toLowerCase() : ""}${index === state.lastCell && mark ? " recent-action" : ""}${state.winningCells.includes(index) ? " winning" : ""}`;
    button.disabled = !connected || pending || !myTurn || Boolean(mark);
    button.setAttribute(
      "aria-label",
      `Hàng ${Math.floor(index / state.size) + 1}, cột ${(index % state.size) + 1}: ${mark || "trống"}${index === state.lastCell && mark ? ", nước đi gần nhất" : ""}`,
    );
  });
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
async function play(cell) {
  if (
    !state ||
    pending ||
    !connected ||
    state.status !== "playing" ||
    state.me !== state.turn
  )
    return;
  pending = true;
  notice("");
  const version = state.version;
  render();
  try {
    accept(await api("/api/move", { roomId, cell, version }));
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
  const pathId = /^\/(?:caro\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/caro/room/${roomId}`);
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
