"use strict";

const $ = (id) => document.getElementById(id);
const API = "/api/games/walls";
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
const labelFor = (mark) =>
  state.playerLabels?.[mark] || (mark === "X" ? "Quân xanh" : "Quân cam");
let mode = "move",
  selectedWall = null;
$("zoom-board").addEventListener("click", () => {
  const enlarged = $("board").classList.toggle("enlarged");
  $("zoom-board").setAttribute("aria-pressed", String(enlarged));
  $("zoom-board").textContent = enlarged ? "Thu nhỏ" : "Phóng to";
});
function canAct() {
  return Boolean(
    state?.me &&
    state.status === "playing" &&
    state.turn === state.me &&
    connected &&
    !pending,
  );
}
function placeOnGrid(element, row, col, rowSpan = 1, colSpan = 1) {
  element.style.gridRow = String(row) + " / span " + rowSpan;
  element.style.gridColumn = String(col) + " / span " + colSpan;
  $("board").append(element);
}
function buildBoard() {
  const board = $("board");
  board.textContent = "";
  cells.length = 0;
  for (let cell = 0; cell < 81; cell++) {
    const row = Math.floor(cell / 9),
      col = cell % 9;
    const pawn =
      state.positions.X === cell
        ? "X"
        : state.positions.O === cell
          ? "O"
          : null;
    const legal = state.legalMoves.includes(cell);
    const recent =
      state.lastAction?.type === "move" &&
      state.lastAction.cell === cell &&
      state.lastAction.mark === pawn;
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "cell" +
      (pawn ? " pawn " + pawn.toLowerCase() : "") +
      (legal && mode === "move" ? " legal" : "") +
      (row === 0 ? " goal-x" : row === 8 ? " goal-o" : "") +
      (recent ? " recent-action" : "");
    button.textContent = pawn ? "●" : "";
    const avatar =
      pawn && globalThis.WebGamePlayers?.avatarURL(state.avatars?.[pawn]);
    if (avatar) {
      const img = document.createElement("img");
      img.className = "pawn-avatar";
      img.alt = "";
      img.draggable = false;
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        button.textContent = "●";
      };
      img.src = avatar;
      button.textContent = "";
      button.append(img);
    }
    button.disabled = !canAct() || mode !== "move" || !legal;
    button.setAttribute(
      "aria-label",
      "Hàng " +
        (row + 1) +
        ", cột " +
        (col + 1) +
        (pawn ? ": " + labelFor(pawn) : legal ? ": có thể di chuyển" : "") +
        (recent ? ", nước đi gần nhất" : ""),
    );
    button.addEventListener("click", () => play(cell));
    placeOnGrid(button, row * 2 + 1, col * 2 + 1);
    cells.push(button);
  }
  const length = state.rules.wallLength;
  for (const wall of state.walls) {
    const fence = document.createElement("div");
    fence.className = "fence " + wall.owner.toLowerCase();
    const recent =
      state.lastAction?.type === "wall" &&
      state.lastAction.row === wall.row &&
      state.lastAction.col === wall.col &&
      state.lastAction.orientation === wall.orientation &&
      state.lastAction.mark === wall.owner;
    if (recent) {
      fence.className += " recent-action";
      fence.setAttribute("role", "img");
      fence.setAttribute(
        "aria-label",
        "Tường vừa đặt của " + state.players[wall.owner],
      );
    }
    const horizontal = wall.orientation === "h";
    placeOnGrid(
      fence,
      wall.row * 2 + (horizontal ? 2 : 1),
      wall.col * 2 + (horizontal ? 1 : 2),
      horizontal ? 1 : length * 2 - 1,
      horizontal ? length * 2 - 1 : 1,
    );
  }
  if (mode === "wall" && canAct() && state.wallsLeft[state.me] > 0) {
    const horizontal = $("orientation").value === "h";
    for (let row = 0; row < (horizontal ? 8 : 10 - length); row++)
      for (let col = 0; col < (horizontal ? 10 - length : 8); col++) {
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "wall-slot";
        slot.setAttribute(
          "aria-label",
          "Chọn tường " +
            (horizontal ? "ngang" : "dọc") +
            " tại hàng " +
            (row + 1) +
            ", cột " +
            (col + 1),
        );
        slot.addEventListener("click", () => {
          selectedWall = { row, col, orientation: horizontal ? "h" : "v" };
          render();
        });
        placeOnGrid(
          slot,
          row * 2 + (horizontal ? 2 : 1),
          col * 2 + (horizontal ? 1 : 2),
        );
      }
    if (selectedWall) {
      const preview = document.createElement("div");
      preview.className = "fence preview";
      const h = selectedWall.orientation === "h";
      placeOnGrid(
        preview,
        selectedWall.row * 2 + (h ? 2 : 1),
        selectedWall.col * 2 + (h ? 1 : 2),
        h ? 1 : length * 2 - 1,
        h ? length * 2 - 1 : 1,
      );
    }
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
  if (state && state.version !== next.version) {
    selectedWall = null;
    mode = "move";
  }
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
  win: "Đã chạm hàng đích đối diện. Ván đấu đã được lưu.",
  timeout: "Một người chơi đã hết thời gian trên đồng hồ riêng.",
  resign: "Một người chơi đã đầu hàng.",
  duration: "Hết thời gian tối đa 30 phút. Ván đấu hòa.",
  draw: "Bàn cờ đã kín. Hai người hòa nhau.",
  expired: "Phòng chờ hết hạn sau 10 phút. Tạo phòng mới trong Discord.",
  cancelled: "Chủ phòng đã hủy lời mời. Tạo phòng mới trong Discord.",
};
function render() {
  if (state) globalThis.WebGamePlayers?.render(state);
  globalThis.WebGameBoardUI?.renderRules("walls", state);
  const playing = state.status === "playing",
    waiting = state.status === "waiting",
    spectator = !state.me;
  const myTurn = playing && state.turn === state.me;
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("move-count").textContent = state.moves + " lượt";
  $("rules-detail").textContent = state.rulesLabel;
  $("board-caption").textContent =
    "Tường dài " +
    state.rules.wallLength +
    " ô · " +
    state.rules.wallLimit +
    " tường/người";
  const last = state.lastAction;
  const recentActor =
    last?.mark === state.me
      ? "Bạn"
      : state.me
        ? "Đối phương"
        : state.players[last?.mark];
  $("recent-action-label").textContent = last
    ? `${recentActor} vừa ${last.type === "wall" ? "đặt tường" : "di chuyển"}`
    : "Viền vàng: lượt gần nhất";
  for (const mark of ["X", "O"]) {
    $("name-" + mark).textContent = state.players[mark] || "Đang chờ đối thủ";
    $("role-" + mark).textContent = labelFor(mark).toLocaleUpperCase("vi");
    $("goal-" + mark).textContent =
      `ĐÍCH ${labelFor(mark).toLocaleUpperCase("vi")} · HÀNG ${mark === "X" ? 1 : 9}`;
    $("clock-" + mark).setAttribute(
      "aria-label",
      "Thời gian còn lại của " + labelFor(mark).toLocaleLowerCase("vi"),
    );
    $("you-" + mark).hidden = state.me !== mark;
    $("walls-" + mark).textContent = "Còn " + state.wallsLeft[mark] + " tường";
    $("player-" + mark).classList.toggle(
      "active",
      playing && state.turn === mark,
    );
  }
  $("status-label").textContent = waiting
    ? "CHỜ ĐỐI THỦ"
    : !playing
      ? "KẾT QUẢ"
      : spectator
        ? "ĐANG XEM TRỰC TIẾP"
        : "BẠN CẦM " + labelFor(state.me).toLocaleUpperCase("vi");
  $("status-title").textContent = waiting
    ? "Đang chờ người tham gia."
    : playing
      ? myTurn
        ? "Đến lượt bạn."
        : "Lượt của " + state.players[state.turn] + "."
      : state.winner
        ? state.winner === state.me
          ? "Bạn đã thắng!"
          : state.players[state.winner] + " thắng!"
        : state.reason === "duration"
          ? "Một ván hòa."
          : "Phòng đã đóng.";
  $("status-detail").textContent = waiting
    ? "Mời đối thủ bấm Tham gia trong tin phòng Discord. Quân xanh đi trước, xuất phát ở hàng 9 và đi tới hàng 1; quân cam đi chiều ngược lại."
    : !playing
      ? REASONS[state.reason] || "Ván đấu đã kết thúc."
      : spectator
        ? "Bạn đang xem trực tiếp. Nếu là người chơi, xác nhận tài khoản bên dưới."
        : !myTurn
          ? state.players[state.turn] + " đang chọn nước đi."
          : mode === "wall"
            ? "Chọn hướng, bấm khe tường trên bàn rồi xác nhận đặt tường."
            : "Chọn ô được đánh dấu để di chuyển hoặc chuyển sang Đặt tường.";
  $("board-state").textContent = waiting
    ? "Chờ đủ hai người"
    : playing
      ? "Lượt " + state.players[state.turn] + " · " + labelFor(state.turn)
      : "Đã kết thúc";
  $("timer-panel").hidden = !(playing || waiting);
  $("timer-label").textContent = waiting
    ? "Thời gian chờ còn lại"
    : "Đồng hồ " + labelFor(state.turn).toLocaleLowerCase("vi");
  $("leave").hidden = spectator || !(playing || waiting);
  $("leave").textContent = waiting ? "Hủy phòng chờ" : "Đầu hàng";
  $("leave").disabled = pending || !connected;
  $("connect-player").hidden = !spectator || !(playing || waiting);
  $("pair-panel").hidden = !spectator || !pairVisible || !(playing || waiting);
  $("controls").hidden = spectator || !playing;
  $("mode-move").disabled = !canAct();
  $("mode-wall").disabled = !canAct() || state.wallsLeft[state.me] <= 0;
  $("mode-move").setAttribute("aria-pressed", String(mode === "move"));
  $("mode-wall").setAttribute("aria-pressed", String(mode === "wall"));
  $("orientation").disabled = !canAct() || mode !== "wall";
  $("confirm-wall").disabled = !canAct() || mode !== "wall" || !selectedWall;
  $("selected-wall").textContent = selectedWall
    ? "Tường " +
      (selectedWall.orientation === "h" ? "ngang" : "dọc") +
      " · Hàng " +
      (selectedWall.row + 1) +
      ", cột " +
      (selectedWall.col + 1)
    : "Chọn một khe trên bàn để xem trước tường.";
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
async function play(cell) {
  if (
    !state ||
    pending ||
    !connected ||
    state.status !== "playing" ||
    state.me !== state.turn ||
    mode !== "move" ||
    !state.legalMoves.includes(cell)
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
$("mode-move").addEventListener("click", () => {
  if (canAct()) {
    mode = "move";
    selectedWall = null;
    render();
  }
});
$("mode-wall").addEventListener("click", () => {
  if (canAct() && state.wallsLeft[state.me] > 0) {
    mode = "wall";
    selectedWall = null;
    render();
  }
});
$("orientation").addEventListener("change", () => {
  selectedWall = null;
  if (state) render();
});
function rotateWall() {
  if (!canAct() || state.wallsLeft[state.me] <= 0) return;
  mode = "wall";
  const orientation = $("orientation").value === "h" ? "v" : "h";
  $("orientation").value = orientation;
  if (selectedWall) {
    selectedWall = {
      orientation,
      row: Math.min(
        selectedWall.row,
        orientation === "h" ? 7 : 9 - state.rules.wallLength,
      ),
      col: Math.min(
        selectedWall.col,
        orientation === "v" ? 7 : 9 - state.rules.wallLength,
      ),
    };
  }
  render();
}
function keyboardDestination(dr, dc) {
  const from = state.positions[state.me],
    row = Math.floor(from / 9),
    col = from % 9;
  return state.legalMoves.find((cell) => {
    const r = Math.floor(cell / 9) - row,
      c = (cell % 9) - col;
    if (dr && dc) return r === dr && c === dc;
    return dr
      ? c === 0 && (r === dr || r === dr * 2)
      : r === 0 && (c === dc || c === dc * 2);
  });
}
document.addEventListener("keydown", async (event) => {
  const target = event.target;
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    target?.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) ||
    $("leave-dialog").open ||
    !canAct()
  )
    return;
  const key = event.key.toLowerCase();
  const directions = {
    w: [-1, 0],
    arrowup: [-1, 0],
    s: [1, 0],
    arrowdown: [1, 0],
    a: [0, -1],
    arrowleft: [0, -1],
    d: [0, 1],
    arrowright: [0, 1],
    q: [-1, -1],
    e: [-1, 1],
    z: [1, -1],
    c: [1, 1],
  };
  if (Object.hasOwn(directions, key)) {
    event.preventDefault();
    const cell = keyboardDestination(...directions[key]);
    if (cell === undefined) {
      notice("Không thể đi theo hướng này. Chọn một ô sáng trên bàn.");
      return;
    }
    mode = "move";
    selectedWall = null;
    await play(cell);
  } else if (key === "r") {
    event.preventDefault();
    rotateWall();
  } else if (key === "f") {
    event.preventDefault();
    mode = mode === "wall" || state.wallsLeft[state.me] <= 0 ? "move" : "wall";
    selectedWall = null;
    render();
  } else if (key === "escape") {
    event.preventDefault();
    selectedWall = null;
    mode = "move";
    render();
  } else if (key === "enter" && !target?.closest?.("button, a")) {
    if (!$("confirm-wall").disabled) {
      event.preventDefault();
      $("confirm-wall").click();
    }
  }
});
$("confirm-wall").addEventListener("click", async () => {
  if (!canAct() || mode !== "wall" || !selectedWall) return;
  const data = { ...selectedWall, roomId, version: state.version };
  pending = true;
  notice("");
  render();
  try {
    accept(await api("/api/wall", data));
  } catch (error) {
    notice(error.message);
    await refresh().catch(() => connection(false));
  } finally {
    pending = false;
    render();
  }
});
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
  const pathId = /^\/(?:walls\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/walls/room/${roomId}`);
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
