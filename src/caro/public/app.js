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
  pairing = false;
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
  }
  offset = next.serverNow - Date.now();
  render();
}
const REASONS = {
  win: "Đã nối đủ quân theo luật phòng. Ván đấu đã được lưu.",
  timeout: "Một người chơi đã hết 90 giây cho lượt đi.",
  resign: "Một người chơi đã đầu hàng.",
  duration: "Hết thời gian tối đa 30 phút. Ván đấu hòa.",
  draw: "Bàn cờ đã kín. Hai người hòa nhau.",
  expired: "Phòng chờ hết hạn sau 10 phút. Tạo phòng mới trong Discord.",
  cancelled: "Chủ phòng đã hủy lời mời. Tạo phòng mới trong Discord.",
};
function render() {
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
    : "Thời gian lượt này";
  $("leave").hidden = spectator || !(playing || waiting);
  $("connect-player").hidden = !spectator || !(playing || waiting);
  $("pair-panel").hidden = !spectator || !pairing || !(playing || waiting);
  $("leave").textContent = waiting ? "Hủy phòng chờ" : "Đầu hàng";
  $("leave").disabled = pending || !connected;
  if ((!playing && !waiting) || spectator) $("leave-dialog").close();
  cells.forEach((button, index) => {
    const mark = state.board[index];
    button.textContent = mark === "X" ? "✕" : mark === "O" ? "○" : "";
    button.className = `cell${mark ? " " + mark.toLowerCase() : ""}${index === state.lastCell ? " last" : ""}${state.winningCells.includes(index) ? " winning" : ""}`;
    button.disabled = !connected || pending || !myTurn || Boolean(mark);
    button.setAttribute(
      "aria-label",
      `Hàng ${Math.floor(index / state.size) + 1}, cột ${(index % state.size) + 1}: ${mark || "trống"}`,
    );
  });
  updateClock();
}
function updateClock() {
  if (!state || !["waiting", "playing"].includes(state.status)) return;
  const deadline =
    state.status === "waiting"
      ? state.waitingDeadline
      : Math.min(state.turnDeadline, state.matchDeadline);
  const seconds = Math.max(
    0,
    Math.ceil((deadline - Date.now() - offset) / 1000),
  );
  $("timer").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  $("timer-progress").max = state.status === "waiting" ? 600 : 90;
  $("timer-progress").value = seconds;
  $("timer-panel").classList.toggle("urgent", seconds <= 15);
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
  } catch (error) {
    $("connection").textContent = "Chưa vào bàn";
    notice(error.message);
  }
}
function subscribe() {
  source?.close();
  source = new EventSource(`${API}/events?room=${encodeURIComponent(roomId)}`);
  source.onopen = () => {
    connection(true);
    notice("");
  };
  source.onmessage = (event) => {
    accept(JSON.parse(event.data));
    connection(true);
  };
  source.onerror = () => {
    connection(false);
    notice(
      "Mất kết nối. Đang tự kết nối lại; đồng hồ vẫn chạy. Nếu phiên hết hạn, hãy mở lại từ Discord.",
    );
  };
}
$("connect-player").addEventListener("click", async () => {
  $("connect-player").disabled = true;
  clearTimeout(pairTimer);
  try {
    const result = await api("/api/pair", { roomId });
    $("pair-code").textContent = result.code;
    $("pair-status").textContent = "Đang chờ bạn xác nhận trong Discord…";
    pairing = true;
    notice("");
    render();
    pairTimer = setTimeout(pollPairing, 2000);
  } catch (error) {
    notice(error.message);
  } finally {
    $("connect-player").disabled = false;
  }
});
async function pollPairing() {
  if (!pairing) return;
  try {
    const result = await api("/api/pair/status", {});
    if (result.connected) {
      pairing = false;
      await refresh();
      subscribe();
      notice("Đã kết nối tài khoản Discord.");
      return;
    }
  } catch (error) {
    $("pair-status").textContent = error.message;
    if ([410, 403].includes(error.status)) {
      pairing = false;
      return;
    }
  }
  pairTimer = setTimeout(pollPairing, 2000);
}
window.addEventListener("pagehide", () => {
  source?.close();
  clearTimeout(pairTimer);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
setInterval(updateClock, 1000);
init();
