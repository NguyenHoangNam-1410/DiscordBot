"use strict";
const $ = (id) => document.getElementById(id);
const API = "/api/games/blokus";
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
let selected = null,
  rotation = 0,
  flipped = false,
  anchor = null;
const cells = [];
const labelFor = (mark) =>
  state.playerLabels?.[mark] || (mark === "X" ? "Quân xanh" : "Quân cam");
const coord = (r, c) => String.fromCharCode(65 + c) + (r + 1);
const canAct = () =>
  Boolean(
    state?.me &&
    state.status === "playing" &&
    state.turn === state.me &&
    connected &&
    !pending,
  );
function shape(piece, rot = rotation, flip = flipped) {
  const values = piece.cells.map(([r, c]) => {
    if (flip) c = -c;
    for (let n = 0; n < rot; n++) [r, c] = [c, -r];
    return [r, c];
  });
  const minR = Math.min(...values.map((c) => c[0])),
    minC = Math.min(...values.map((c) => c[1]));
  return values.map(([r, c]) => [r - minR, c - minC]);
}
function miniature(target, form) {
  target.replaceChildren(
    ...form.map(([r, c]) => {
      const cell = document.createElement("span");
      cell.className = "mini-cell";
      cell.style.gridRow = String(r + 1);
      cell.style.gridColumn = String(c + 1);
      return cell;
    }),
  );
}
function preview() {
  const piece = state.pieces.find((p) => p.id === selected);
  if (!piece || !anchor || !state.me) return { cells: [], error: null };
  const positions = shape(piece).map(([r, c]) => [
    r + anchor.row,
    c + anchor.col,
  ]);
  const inside = (r, c) => r >= 0 && c >= 0 && r < 14 && c < 14;
  const neighbor = (r, c, offsets) =>
    offsets.some(
      ([dr, dc]) =>
        inside(r + dr, c + dc) &&
        state.board[(r + dr) * 14 + c + dc] === state.me,
    );
  let error = null;
  if (positions.some(([r, c]) => !inside(r, c)))
    error = "Quân phải nằm gọn trong bàn.";
  else if (positions.some(([r, c]) => state.board[r * 14 + c]))
    error = "Vị trí bị chồng lên quân đã đặt.";
  else if (
    positions.some(([r, c]) =>
      neighbor(r, c, [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]),
    )
  )
    error = "Quân cùng màu không được chạm cạnh.";
  else if (!state.used[state.me].length) {
    const starts =
      state.starts[state.me] == null
        ? state.startingPoints
        : [state.starts[state.me]];
    if (!positions.some(([r, c]) => starts.includes(r * 14 + c)))
      error = "Quân đầu phải phủ dấu ★ xuất phát của bạn.";
  } else if (
    !positions.some(([r, c]) =>
      neighbor(r, c, [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]),
    )
  )
    error = "Quân mới phải chạm góc quân cùng màu.";
  return { cells: positions, error };
}
function buildBoard() {
  if (cells.length) return;
  for (let i = 0; i < 14; i++) {
    const col = document.createElement("span"),
      row = document.createElement("span");
    col.textContent = String.fromCharCode(65 + i);
    row.textContent = String(i + 1);
    $("columns").append(col);
    $("rows").append(row);
  }
  for (let i = 0; i < 196; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.addEventListener("click", () => {
      if (!canAct()) return;
      if (!selected) {
        notice("Chọn một quân trong bộ quân trước.");
        return;
      }
      anchor = { row: Math.floor(i / 14), col: i % 14 };
      notice("");
      renderBoard();
      renderSelection();
    });
    $("board").append(cell);
    cells.push(cell);
  }
}
function renderBoard() {
  buildBoard();
  const ghost = canAct() ? preview() : { cells: [], error: null };
  const ghostIds = new Set(
    ghost.cells
      .filter(([r, c]) => r >= 0 && c >= 0 && r < 14 && c < 14)
      .map(([r, c]) => r * 14 + c),
  );
  const recent = new Set(state.lastAction?.cells || []);
  for (let i = 0; i < 196; i++) {
    const owner = state.board[i],
      start = state.startingPoints.includes(i) && !owner;
    const cell = cells[i];
    cell.className =
      "cell" +
      (owner ? " " + owner.toLowerCase() : "") +
      (start ? " start" : "") +
      (recent.has(i) ? " recent" : "") +
      (ghostIds.has(i) ? " preview" + (ghost.error ? " invalid" : "") : "");
    if (canAct() && anchor && anchor.row * 14 + anchor.col === i)
      cell.className += " anchor";
    cell.textContent = start ? "★" : "";
    cell.disabled = !canAct();
    const startOwner =
      state.starts.X === i ? "X" : state.starts.O === i ? "O" : null;
    cell.setAttribute(
      "aria-label",
      coord(Math.floor(i / 14), i % 14) +
        (owner
          ? ": " + labelFor(owner)
          : start
            ? ": xuất phát " + (startOwner ? labelFor(startOwner) : "chưa chọn")
            : ": ô trống") +
        (recent.has(i) ? ", quân vừa đặt" : ""),
    );
  }
}
function renderSelection() {
  const piece = state.pieces.find((p) => p.id === selected);
  miniature($("selected-shape"), piece ? shape(piece) : []);
  $("selected-shape").className =
    "selected-shape " + (state.me || "X").toLowerCase();
  $("selected-name").textContent = piece
    ? piece.id + " · " + piece.cells.length + " ô"
    : "Chọn một quân bên dưới";
  const check = preview();
  $("placement-help").textContent =
    anchor && piece
      ? check.error ||
        "Hợp lệ tại " +
          coord(anchor.row, anchor.col) +
          " · Nhấn Xác nhận để đặt."
      : "Chạm bàn để xem trước, rồi xác nhận.";
  for (const id of ["rotate", "flip", "clear"])
    $(id).disabled = !canAct() || !piece;
  $("confirm").disabled =
    !canAct() || !piece || !anchor || Boolean(check.error);
}
function renderTray() {
  const side = $("inventory-side").value,
    used = state.used[side];
  const key = JSON.stringify([side, used, selected, canAct(), state.me]);
  if ($("tray").dataset.key === key) return;
  $("tray").dataset.key = key;
  $("inventory-title").textContent =
    "Bộ quân · Còn " + (21 - used.length) + "/21";
  $("tray").replaceChildren(
    ...state.pieces.map((p) => {
      const tile = document.createElement("button"),
        visual = document.createElement("span"),
        label = document.createElement("span");
      const taken = used.includes(p.id);
      tile.type = "button";
      tile.dataset.piece = p.id;
      tile.className =
        "tile " +
        side.toLowerCase() +
        (taken ? " used" : "") +
        (p.id === selected && side === state.me ? " selected" : "");
      tile.disabled = taken || !canAct() || side !== state.me;
      tile.setAttribute(
        "aria-pressed",
        String(p.id === selected && side === state.me),
      );
      tile.setAttribute(
        "aria-label",
        p.id + ", " + p.cells.length + " ô" + (taken ? ", đã đặt" : ""),
      );
      visual.className = "shape";
      miniature(visual, shape(p, 0, false));
      label.className = "tile-label";
      label.textContent = p.id + " · " + p.cells.length;
      tile.append(visual, label);
      tile.addEventListener("click", () => {
        if (!canAct() || side !== state.me) return;
        selected = p.id;
        rotation = 0;
        flipped = false;
        notice("");
        render();
      });
      return tile;
    }),
  );
}
const REASONS = {
  win: "Cả hai hết nước hợp lệ. Bên có điểm cao hơn thắng.",
  draw: "Cả hai hết nước hợp lệ và bằng điểm.",
  timeout: "Một người chơi đã hết thời gian trên đồng hồ riêng.",
  resign: "Một người chơi đã đầu hàng.",
  expired: "Phòng chờ hết hạn sau 10 phút.",
  cancelled: "Chủ phòng đã hủy.",
};
function render() {
  if (!state) return;
  globalThis.WebGamePlayers?.render(state);
  globalThis.WebGameBoardUI?.renderRules("blokus", state);
  const playing = state.status === "playing",
    waiting = state.status === "waiting",
    spectator = !state.me;
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("move-count").textContent = state.moves + " lượt";
  $("rules-detail").textContent = state.rulesLabel;
  for (const side of ["X", "O"]) {
    $("name-" + side).textContent = state.players[side] || "Đang chờ đối thủ";
    $("role-" + side).textContent = labelFor(side).toLocaleUpperCase("vi");
    $("you-" + side).hidden = state.me !== side;
    $("player-" + side).classList.toggle(
      "active",
      playing && state.turn === side,
    );
    const count = 21 - state.used[side].length;
    $("score-" + side).textContent =
      count +
      " quân · " +
      (count ? Math.abs(state.scores[side]) + " ô còn lại" : "Đã đặt hết") +
      " · " +
      state.scores[side] +
      " điểm" +
      (state.blocked[side] ? " · Hết nước" : "");
    $("clock-" + side).setAttribute(
      "aria-label",
      "Thời gian của " + labelFor(side),
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
    ? "Mời một người cùng chơi."
    : playing
      ? state.me === state.turn
        ? "Đến lượt bạn."
        : "Lượt của " + state.players[state.turn] + "."
      : state.winner
        ? state.winner === state.me
          ? "Bạn đã thắng!"
          : state.players[state.winner] + " thắng!"
        : state.reason === "draw"
          ? "Một ván hòa."
          : "Phòng đã đóng.";
  const blocked = ["X", "O"].filter((s) => state.blocked[s]);
  $("status-detail").textContent = waiting
    ? "Bấm Tham gia trong tin phòng Discord. Quân xanh đi trước, chọn dấu ★ E5 hoặc J10."
    : !playing
      ? REASONS[state.reason] || "Ván đấu đã kết thúc."
      : blocked.length
        ? blocked.map((s) => labelFor(s)).join(" và ") +
          " đã hết nước, tự bỏ lượt."
        : spectator
          ? "Bạn đang xem trực tiếp. Nếu là người chơi, xác nhận tài khoản bên dưới."
          : state.me === state.turn
            ? "Chọn quân, xoay/lật, chạm bàn để xem trước rồi xác nhận."
            : "Bạn có thể xem bộ quân còn lại của cả hai người.";
  $("board-state").textContent = waiting
    ? "Chờ đủ hai người"
    : playing
      ? "Lượt " + state.players[state.turn] + " · " + labelFor(state.turn)
      : "Đã kết thúc · Xanh " +
        state.scores.X +
        " : " +
        state.scores.O +
        " Cam";
  const last = state.lastAction;
  $("recent-action-label").textContent = last
    ? (last.mark === state.me
        ? "Bạn"
        : state.me
          ? "Đối phương"
          : state.players[last.mark]) +
      " vừa đặt " +
      last.pieceId
    : "Viền vàng: quân vừa đặt";
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
  if (!playing || spectator) $("leave-dialog").close();
  renderBoard();
  renderSelection();
  renderTray();
  updateClock();
}
function rotatePiece() {
  if (canAct() && selected) {
    rotation = (rotation + 1) % 4;
    renderBoard();
    renderSelection();
  }
}
function flipPiece() {
  if (canAct() && selected) {
    flipped = !flipped;
    renderBoard();
    renderSelection();
  }
}
$("rotate").addEventListener("click", rotatePiece);
$("flip").addEventListener("click", flipPiece);
$("clear").addEventListener("click", () => {
  anchor = null;
  selected = null;
  render();
});
$("inventory-side").addEventListener("change", renderTray);
$("zoom-board").addEventListener("click", () => {
  const enlarged = $("board").parentElement.classList.toggle("enlarged");
  $("zoom-board").setAttribute("aria-pressed", String(enlarged));
  $("zoom-board").textContent = enlarged ? "Thu nhỏ" : "Phóng to";
});
$("confirm").addEventListener("click", async () => {
  if (!canAct() || !selected || !anchor || preview().error) return;
  const data = {
    roomId,
    pieceId: selected,
    ...anchor,
    rotation,
    flipped,
    version: state.version,
  };
  pending = true;
  notice("");
  render();
  try {
    accept(await api("/api/move", data));
  } catch (error) {
    notice(error.message);
    await refresh().catch(() => connection(false));
  } finally {
    pending = false;
    render();
  }
});
document.addEventListener("keydown", (event) => {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target?.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName) ||
    $("leave-dialog").open ||
    !canAct() ||
    !selected
  )
    return;
  const key = event.key.toLowerCase(),
    directions = {
      w: [-1, 0],
      arrowup: [-1, 0],
      s: [1, 0],
      arrowdown: [1, 0],
      a: [0, -1],
      arrowleft: [0, -1],
      d: [0, 1],
      arrowright: [0, 1],
    };
  if (directions[key]) {
    event.preventDefault();
    if (!anchor) {
      const at = state.starts[state.me] ?? state.startingPoints[0];
      anchor = { row: Math.floor(at / 14), col: at % 14 };
    } else {
      anchor.row = Math.max(0, Math.min(13, anchor.row + directions[key][0]));
      anchor.col = Math.max(0, Math.min(13, anchor.col + directions[key][1]));
    }
    renderBoard();
    renderSelection();
  } else if (key === "r" && !event.repeat) {
    event.preventDefault();
    rotatePiece();
  } else if (key === "f" && !event.repeat) {
    event.preventDefault();
    flipPiece();
  } else if (key === "escape") {
    event.preventDefault();
    anchor = null;
    renderBoard();
    renderSelection();
  } else if (
    key === "enter" &&
    (!event.target?.closest?.("button,a") ||
      event.target.closest(".cell,.tile")) &&
    !$("confirm").disabled
  ) {
    event.preventDefault();
    $("confirm").click();
  }
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
    anchor = null;
  }
  if (next.me && next.me !== state?.me) $("inventory-side").value = next.me;
  if (selected && next.me && next.used[next.me].includes(selected))
    selected = null;
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
  const pathId = /^\/(?:blokus\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/blokus/room/${roomId}`);
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
