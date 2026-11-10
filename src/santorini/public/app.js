"use strict";
const $ = (id) => document.getElementById(id),
  API = "/api/games/santorini";
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
let placement = [],
  worker = null,
  to = null,
  build = null,
  animationMove = null,
  animationTimer = null;
const cells = [];
const coord = (c) =>
  String.fromCharCode(65 + (c % 5)) + (Math.floor(c / 5) + 1);
const canAct = () =>
  !!(
    state?.me &&
    state.status === "playing" &&
    state.me === state.turn &&
    connected &&
    !pending
  );
const label = (side) => state.players[side] || "Đang chờ đối thủ";
const choice = () =>
  state?.legalTurns.find((m) => m.worker === worker && m.to === to);
function resetPreview() {
  placement = [];
  worker = null;
  to = null;
  build = null;
}
function ownerAt(index) {
  return ["X", "O"].find((side) => state.workers[side].includes(index)) || null;
}
function select(index) {
  if (!canAct()) return;
  notice("");
  if (state.phase === "placement") {
    if (ownerAt(index)) return notice("Ô này đã có thợ.");
    if (placement.includes(index))
      placement = placement.filter((c) => c !== index);
    else if (placement.length < 2) placement.push(index);
    else placement[1] = index;
  } else {
    const own = state.workers[state.me].indexOf(index),
      from = worker === null ? null : state.workers[state.me][worker];
    // The moved worker's original square becomes a legal build target in the preview.
    if (to !== null && index === from && choice()?.builds.includes(index))
      build = build === index ? null : index;
    else if (own >= 0) {
      worker = own;
      to = null;
      build = null;
    } else if (worker === null)
      return notice("Chọn một trong hai thợ của bạn trước.");
    else if (index === to) {
      to = null;
      build = null;
    } else if (to === null || choice()?.win) {
      if (!state.legalTurns.some((m) => m.worker === worker && m.to === index))
        return notice(
          "Ô đi phải trống, ở cạnh thợ và chỉ được lên tối đa một tầng.",
        );
      to = index;
      build = null;
    } else if (choice()?.builds.includes(index))
      build = build === index ? null : index;
    else
      return notice("Chọn ô xây trống cạnh thợ vừa đi. Có thể xây ô vừa rời.");
  }
  render();
}
function buildBoard() {
  if (cells.length) return;
  for (let i = 0; i < 25; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.cell = String(i);
    button.addEventListener("click", () => select(i));
    button.addEventListener("keydown", (e) => {
      const delta = { ArrowUp: -5, ArrowDown: 5, ArrowLeft: -1, ArrowRight: 1 }[
        e.key
      ];
      if (delta) {
        e.preventDefault();
        const next = i + delta;
        if (
          next >= 0 &&
          next < 25 &&
          (Math.abs(delta) === 5 || Math.floor(next / 5) === Math.floor(i / 5))
        )
          cells[next].focus();
      }
    });
    $("board").append(button);
    cells.push(button);
  }
}
function pawn(side, n, preview = false, ghost = false, floor = 0) {
  const span = document.createElement("span"),
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    use = document.createElementNS(svg.namespaceURI, "use"),
    number = document.createElement("span");
  span.className =
    "worker " +
    side.toLowerCase() +
    (preview ? " preview-worker" : "") +
    (ghost ? " ghost" : "");
  span.style.setProperty("--floor", floor);
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#worker-art");
  svg.append(use);
  number.className = "worker-number";
  number.textContent = String(n + 1);
  span.append(svg, number);
  return span;
}
function renderBoard() {
  buildBoard();
  const active = canAct(),
    possible = new Set();
  if (active) {
    if (state.phase === "placement")
      for (let i = 0; i < 25; i++) {
        if (!ownerAt(i)) possible.add(i);
      }
    else if (worker === null)
      for (const m of state.legalTurns)
        possible.add(state.workers[state.me][m.worker]);
    else if (to === null)
      for (const m of state.legalTurns) {
        if (m.worker === worker) possible.add(m.to);
      }
    else for (const i of choice()?.builds || []) possible.add(i);
  }
  const from =
    worker === null || !state.me ? null : state.workers[state.me][worker];
  for (let i = 0; i < 25; i++) {
    const cell = cells[i],
      owner = ownerAt(i),
      previewFloor = i === build ? state.board[i] + 1 : state.board[i];
    cell.className =
      "cell" +
      (possible.has(i) ? " legal" : "") +
      (i === from || placement.includes(i) ? " selected" : "") +
      (i === to ? " destination" : "") +
      (i === build ? " preview-build" : "") +
      ([state.lastAction?.to, state.lastAction?.build].includes(i)
        ? " recent"
        : "") +
      (state.lastAction?.from === i ? " origin" : "") +
      (state.lastAction?.build === i && animationMove === state.moves
        ? " new-build"
        : "");
    const text = document.createElement("span"),
      height = document.createElement("span"),
      tower = document.createElement("span");
    text.className = "coord";
    text.textContent = coord(i);
    height.className = "height-label";
    height.textContent = previewFloor === 4 ? "VÒM" : "T" + previewFloor;
    tower.className = "building";
    for (let level = 1; level <= Math.min(previewFloor, 3); level++) {
      const block = document.createElement("span");
      block.className = "block level-" + level;
      tower.append(block);
    }
    if (previewFloor === 4) {
      const dome = document.createElement("span");
      dome.className = "dome";
      tower.append(dome);
    }
    cell.replaceChildren(text, tower, height);
    if (owner)
      cell.append(
        pawn(
          owner,
          state.workers[owner].indexOf(i),
          false,
          active && i === from && to !== null,
          state.board[i],
        ),
      );
    if (active && state.phase === "placement" && placement.includes(i))
      cell.append(pawn(state.me, placement.indexOf(i), true));
    if (active && state.phase === "turn" && to === i)
      cell.append(pawn(state.me, worker, true, false, state.board[i]));
    cell.disabled = !active;
    cell.setAttribute(
      "aria-label",
      `${coord(i)}, ${previewFloor === 4 ? "mái vòm" : "tầng " + previewFloor}${owner ? ", " + label(owner) + ", thợ " + (state.workers[owner].indexOf(i) + 1) : ", trống"}${possible.has(i) ? ", có thể chọn" : ""}${build === i ? ", xem trước xây" : ""}`,
    );
  }
}
function render() {
  if (!state) return;
  WebGamePlayers.render(state);
  WebGameBoardUI.renderRules("santorini", state);
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("move-count").textContent = state.moves + " lượt";
  $("rules-detail").textContent =
    state.rulesLabel + " · " + label(state.first) + " đặt thợ và đi trước.";
  const playing = state.status === "playing",
    waiting = state.status === "waiting",
    active = canAct(),
    win = choice()?.win;
  for (const side of ["X", "O"]) {
    $("name-" + side).textContent = label(side);
    $("role-" + side).textContent = state.playerLabels[side];
    $("you-" + side).hidden = state.me !== side;
    $("player-" + side).classList.toggle(
      "active",
      playing && state.turn === side,
    );
    $("score-" + side).textContent = state.workers[side].some(Number.isInteger)
      ? state.workers[side]
          .map((c, n) =>
            Number.isInteger(c)
              ? `${n + 1}: ${coord(c)} · T${state.board[c]}`
              : "Chưa đặt",
          )
          .join(" / ")
      : "Chưa đặt thợ";
  }
  const message = waiting
    ? "Chờ đối thủ tham gia"
    : !playing
      ? state.winner
        ? label(state.winner) + " thắng!"
        : "Phòng đã đóng"
      : state.phase === "placement"
        ? state.me === state.turn
          ? "Lượt bạn · Đặt hai thợ"
          : "Chờ " + label(state.turn) + " đặt thợ"
        : state.me === state.turn
          ? "Lượt bạn · Đi và xây"
          : "Lượt " + label(state.turn);
  $("board-state").textContent = message;
  $("status-title").textContent = message;
  $("status-detail").textContent = waiting
    ? "Mời một người tham gia từ tin phòng Discord."
    : !playing
      ? {
          level3: "Một thợ đã đi từ tầng 2 lên tầng 3.",
          blocked: "Đối thủ không thể đi và xây hợp lệ.",
          resign: "Đối thủ đầu hàng.",
          timeout: "Hết thời gian trên đồng hồ riêng.",
          expired: "Không có đối thủ sau 10 phút.",
          cancelled: "Chủ phòng đã hủy.",
        }[state.reason] || ""
      : state.phase === "placement"
        ? "Chọn hai ô khác nhau rồi xác nhận. Đồng hồ riêng đang chạy."
        : "Cùng một thợ phải đi rồi xây. Đích lên tầng 3 kết thúc ngay.";
  $("controls").hidden = !state.me || !playing;
  const step =
    state.phase === "placement"
      ? 0
      : worker === null
        ? 0
        : to === null
          ? 1
          : build === null && !win
            ? 2
            : 3;
  const names =
    state.phase === "placement"
      ? ["Đặt 2 thợ", "Xác nhận"]
      : ["Chọn thợ", "Đi", "Xây", "Xác nhận"];
  $("steps").replaceChildren(
    ...names.map((n, i) => {
      const el = document.createElement("span");
      el.textContent = i + 1 + ". " + n;
      el.className = i === step ? "current" : i < step ? "done" : "";
      return el;
    }),
  );
  $("instruction").textContent = !active
    ? pending
      ? "Đang gửi thao tác…"
      : !connected
        ? "Đang kết nối lại…"
        : "Chờ đến lượt bạn."
    : state.phase === "placement"
      ? `Đã chọn ${placement.length}/2 ô. Chạm ô đã chọn để bỏ.`
      : worker === null
        ? "Chọn một thợ có viền sáng."
        : to === null
          ? `Thợ ${worker + 1}: chọn ô đi có viền sáng.`
          : win
            ? "Đi từ tầng 2 lên tầng 3 · Xác nhận để thắng."
            : build === null
              ? "Chọn ô xây cạnh " + coord(to) + "."
              : `Đi ${coord(fromCell())} → ${coord(to)} · Xây ${coord(build)} ${state.board[build] === 3 ? "mái vòm" : "lên tầng " + (state.board[build] + 1)}.`;
  $("confirm").disabled =
    !active ||
    (state.phase === "placement"
      ? placement.length !== 2
      : worker === null || to === null || (!win && build === null));
  $("confirm").textContent =
    state.phase === "placement"
      ? "Đặt 2 thợ"
      : win
        ? "Lên tầng 3 · Thắng"
        : "Xác nhận lượt";
  $("clear").disabled = pending || (!placement.length && worker === null);
  $("last-action").textContent = actionText(state.lastAction);
  $("connect-player").hidden =
    !!state.me || !["waiting", "playing"].includes(state.status);
  $("pair-panel").hidden = !pairVisible || !!state.me;
  $("leave").hidden =
    !state.me || !["waiting", "playing"].includes(state.status);
  $("leave").textContent = waiting ? "Hủy phòng" : "Đầu hàng";
  renderBoard();
  updateClock();
  WebGameMobile.update("santorini", state);
}
function fromCell() {
  return worker === null ? null : state.workers[state.me][worker];
}
function actionText(a) {
  if (!a) return "Thợ và công trình đều được xem công khai.";
  if (a.type === "place")
    return label(a.mark) + " đặt thợ ở " + a.cells.map(coord).join(", ") + ".";
  return `${label(a.mark)}: ${coord(a.from)} → ${coord(a.to)}${a.build === null ? " · Lên tầng 3!" : ` · Xây ${coord(a.build)} ${a.level === 4 ? "mái vòm" : "tầng " + a.level}`}`;
}
$("clear").addEventListener("click", () => {
  resetPreview();
  notice("");
  render();
});
$("confirm").addEventListener("click", async () => {
  if ($("confirm").disabled || !canAct()) return;
  const data =
    state.phase === "placement"
      ? { type: "place", cells: [...placement] }
      : { type: "turn", worker, to, build };
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
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
    resetPreview();
    render();
  }
});
function accept(next) {
  if (state && next.version < state.version) return;
  WebGameFeedback.update("santorini", next);
  if (state && state.status !== next.status) $("leave-dialog").close();
  if (!state || state.version !== next.version) {
    resetPreview();
    if (state && next.moves > state.moves) {
      animationMove = next.moves;
      clearTimeout(animationTimer);
      animationTimer = setTimeout(() => {
        animationMove = null;
        if (state) renderBoard();
      }, 400);
    }
  }
  state = next;
  offset = next.serverNow - Date.now();
  if (!["waiting", "playing"].includes(state.status)) {
    $("leave-dialog").close();
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
  const pathId =
    /^\/(?:santorini\/)?room\/([a-f0-9-]{36}|[a-fA-F0-9]{8})$/.exec(
      location.pathname,
    )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    await refresh();
    roomId = state.id;
    history.replaceState(
      null,
      "",
      `/santorini/room/${state.roomCode || roomId}`,
    );
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
