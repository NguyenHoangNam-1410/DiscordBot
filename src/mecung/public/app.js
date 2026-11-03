"use strict";
const $ = (id) => document.getElementById(id),
  API = "/api/games/mecung";
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
let view = "X",
  editMode = "start";
const other = (mark) => (mark === "X" ? "O" : "X");
const labelFor = (mark) =>
  state.playerLabels?.[mark] ||
  (mark === "X" ? "Người dò xanh" : "Người dò cam");
const open = () =>
  state && ["waiting", "setup", "playing"].includes(state.status);
const canSetup = () =>
  state?.me &&
  state.status === "setup" &&
  !state.ready[state.me] &&
  connected &&
  !pending;
const canMove = () =>
  state?.me &&
  state.status === "playing" &&
  state.turn === state.me &&
  view === state.me &&
  connected &&
  !pending;
const coord = (cell) =>
  String.fromCharCode(65 + (cell % state.size)) +
  (Math.floor(cell / state.size) + 1);
const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
function nextCell(from, direction) {
  const [dr, dc] = DIRS[direction],
    r = Math.floor(from / state.size) + dr,
    c = (from % state.size) + dc;
  return r < 0 || c < 0 || r >= state.size || c >= state.size
    ? null
    : r * state.size + c;
}
function edgeBetween(a, b) {
  const n = state.size,
    r = Math.floor(a / n),
    rr = Math.floor(b / n),
    c = a % n,
    cc = b % n;
  return r === rr
    ? n * (n - 1) + r * (n - 1) + Math.min(c, cc)
    : Math.min(r, rr) * n + c;
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
  const response = await fetch(url.replace(/^\/api(?=\/)/, API), {
    method: data ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(12000),
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
  const phaseChanged = state?.status !== next.status,
    identityChanged = state?.me !== next.me;
  state = next;
  if (phaseChanged || identityChanged) {
    view = state.status === "setup" && state.me ? "design" : state.me || "X";
    $("leave-dialog").close();
    $("ready-dialog").close();
  }
  if (!open()) {
    clearTimeout(pairTimer);
    pairing = false;
    pairVisible = false;
    pairingToken = null;
    pairAttempt++;
    clearStoredPairing();
  }
  offset = state.serverNow - Date.now();
  render();
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
async function saveDesign(design) {
  if (canSetup())
    await action("design", { design, revision: state.setupRevision });
}
function viewOptions() {
  const entries = [
    ["X", "Đường đi · " + labelFor("X")],
    ["O", "Đường đi · " + labelFor("O")],
  ];
  if (state.me) entries.unshift(["design", "Mê cung bạn dựng (kín)"]);
  const key = JSON.stringify(entries);
  if ($("view-select").dataset.key !== key) {
    $("view-select").dataset.key = key;
    $("view-select").replaceChildren(
      ...entries.map(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        return option;
      }),
    );
  }
  if (!entries.some((e) => e[0] === view)) view = state.me || "X";
  $("view-select").value = view;
}
function renderBoard() {
  const n = state.size,
    privateView = view === "design" && state.design,
    journey = privateView ? null : state.boards[view];
  const layout = privateView ? state.design : journey;
  const walls = new Set(privateView ? layout.walls : journey.revealedWalls),
    visited = new Set(journey?.visited || []),
    known = new Set(journey?.knownOpen || []);
  $("view-label").textContent = privateView
    ? "BẢN DỰNG CHỈ BẠN THẤY"
    : "ĐƯỜNG ĐÃ KHÁM PHÁ";
  $("view-title").textContent = privateView
    ? "Mê cung cho đối thủ"
    : labelFor(view) + (view === state.me ? " · Bạn" : "");
  $("board-help").textContent = privateView
    ? state.status === "setup"
      ? state.ready[state.me]
        ? "Đã khóa. Đang chờ đối thủ xác nhận."
        : editMode === "walls"
          ? "Chạm khe giữa hai ô để thêm/xóa tường. Luôn phải còn đường nối S với G."
          : "Chạm một ô để chọn " +
            (editMode === "start" ? "điểm đầu S." : "đích G.")
      : "Bạn đang xem bản dựng của mình. Chuyển sang đường đi của bạn để di chuyển."
    : state.status === "setup"
      ? "Đường đi sẽ xuất hiện khi cả hai đã khóa mê cung."
      : "Tường chưa chạm vẫn được giấu. Ô tô xanh là nơi đã khám phá.";
  $("board-summary").textContent = privateView
    ? "S " +
      coord(layout.start) +
      " → G " +
      coord(layout.goal) +
      " · " +
      walls.size +
      "/" +
      state.rules.wallLimit +
      " đoạn tường"
    : journey.start === null
      ? "Chưa bắt đầu dò đường."
      : "Lượt " +
        journey.turns +
        " · " +
        visited.size +
        " ô khám phá · " +
        journey.steps +
        " bước · " +
        walls.size +
        " tường đã chạm" +
        (journey.finishedTurn !== null ? " · Đã tới đích" : "");
  const tracks = Array.from({ length: n }, (_, i) =>
    i === n - 1 ? "minmax(0,1fr)" : "minmax(0,1fr) 7px",
  ).join(" ");
  $("board").style.gridTemplateColumns = tracks;
  $("board").style.gridTemplateRows = tracks;
  const labels = Array.from({ length: n }, (_, i) => {
    const el = document.createElement("span");
    el.textContent = String.fromCharCode(65 + i);
    return el;
  });
  $("columns").style.gridTemplateColumns = "repeat(" + n + ",1fr)";
  $("columns").replaceChildren(...labels);
  $("rows").style.gridTemplateRows = "repeat(" + n + ",1fr)";
  $("rows").replaceChildren(
    ...Array.from({ length: n }, (_, i) => {
      const el = document.createElement("span");
      el.textContent = String(i + 1);
      return el;
    }),
  );
  const nodes = [];
  for (let cell = 0; cell < n * n; cell++) {
    const r = Math.floor(cell / n),
      c = cell % n,
      button = document.createElement("button"),
      pawn = journey?.position === cell;
    const dir = canMove()
      ? Object.keys(DIRS).find(
          (d) => nextCell(state.boards[state.me].position, d) === cell,
        )
      : null;
    const recent =
      !privateView &&
      state.lastAction?.mark === view &&
      !state.lastAction.hit &&
      state.lastAction.to === cell;
    button.type = "button";
    button.dataset.cell = String(cell);
    button.className =
      "cell" +
      (visited.has(cell) ? " visited" : "") +
      (layout.start === cell ? " start" : "") +
      (layout.goal === cell ? " goal" : "") +
      (pawn ? " pawn " + view.toLowerCase() : "") +
      (recent ? " recent" : "") +
      (dir ? " selectable" : "");
    button.style.gridRow = String(2 * r + 1);
    button.style.gridColumn = String(2 * c + 1);
    button.textContent =
      layout.start === cell ? "S" : layout.goal === cell ? "G" : "";
    if (pawn) {
      button.textContent = "●";
      const url = globalThis.WebGamePlayers?.avatarURL(state.avatars?.[view]);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.draggable = false;
        img.referrerPolicy = "no-referrer";
        img.onerror = () => {
          button.textContent = "●";
        };
        button.replaceChildren(img);
      }
    }
    button.disabled = privateView ? !canSetup() || editMode === "walls" : !dir;
    button.setAttribute(
      "aria-label",
      coord(cell) +
        (layout.start === cell ? ", điểm đầu" : "") +
        (layout.goal === cell ? ", đích" : "") +
        (pawn ? ", vị trí hiện tại" : "") +
        (visited.has(cell) ? ", đã khám phá" : ""),
    );
    button.addEventListener("click", () => {
      if (privateView && canSetup() && editMode !== "walls")
        void saveDesign({ ...state.design, [editMode]: cell });
      else if (dir && canMove())
        void action("move", { direction: dir, version: state.version });
    });
    nodes.push(button);
  }
  const split = n * (n - 1);
  for (let id = 0; id < 2 * split; id++) {
    const horizontal = id < split,
      offset = horizontal ? id : id - split,
      r = Math.floor(offset / (horizontal ? n : n - 1)),
      c = offset % (horizontal ? n : n - 1);
    const edge = document.createElement("button"),
      isWall = walls.has(id),
      recent =
        !privateView &&
        state.lastAction?.mark === view &&
        state.lastAction.hit &&
        state.lastAction.wall === id;
    edge.type = "button";
    edge.dataset.wall = String(id);
    edge.className =
      "edge " +
      (horizontal ? "h" : "v") +
      (isWall
        ? " wall" + (privateView ? " private-wall" : "")
        : known.has(id)
          ? " known-open"
          : "") +
      (recent ? " recent" : "") +
      (privateView && canSetup() && editMode === "walls" ? " editable" : "");
    edge.style.gridRow = String(2 * r + (horizontal ? 2 : 1));
    edge.style.gridColumn = String(2 * c + (horizontal ? 1 : 2));
    edge.disabled = !(privateView && canSetup() && editMode === "walls");
    const a = r * n + c,
      b = horizontal ? a + n : a + 1;
    edge.setAttribute(
      "aria-label",
      (privateView
        ? isWall
          ? "Xóa tường"
          : "Thêm tường"
        : isWall
          ? "Tường đã chạm"
          : known.has(id)
            ? "Lối đã đi qua"
            : "Khe chưa biết") +
        " giữa " +
        coord(a) +
        " và " +
        coord(b),
    );
    edge.addEventListener("click", () => {
      if (!canSetup() || view !== "design" || editMode !== "walls") return;
      const next = state.design.walls.includes(id)
        ? state.design.walls.filter((w) => w !== id)
        : [...state.design.walls, id];
      void saveDesign({ ...state.design, walls: next });
    });
    nodes.push(edge);
  }
  $("board").replaceChildren(...nodes);
}
const REASONS = {
  win: "Đã tới đích theo luật của ván.",
  draw: "Cả hai tới đích trong cùng số lượt. Ván hòa.",
  setup_timeout: "Một người chưa khóa mê cung khi hết 5 phút chuẩn bị.",
  setup_expired: "Cả hai chưa khóa mê cung khi hết giờ chuẩn bị.",
  timeout: "Một người chơi đã hết thời gian trên đồng hồ riêng.",
  resign: "Một người chơi đã đầu hàng.",
  expired: "Không có đối thủ sau 10 phút.",
  cancelled: "Chủ phòng đã hủy.",
};
function render() {
  if (state) globalThis.WebGameMobile?.update("mecung", state);
  if (!state) return;
  globalThis.WebGamePlayers?.render(state);
  globalThis.WebGameBoardUI?.renderRules("mecung", state);
  const setup = state.status === "setup",
    playing = state.status === "playing",
    waiting = state.status === "waiting";
  viewOptions();
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("status-label").textContent = waiting
    ? "CHỜ ĐỐI THỦ"
    : setup
      ? "DỰNG MÊ CUNG"
      : playing
        ? !state.me
          ? "ĐANG XEM TRỰC TIẾP"
          : "ĐANG DÒ ĐƯỜNG"
        : "KẾT QUẢ";
  $("status-title").textContent = waiting
    ? "Mời một người cùng chơi."
    : setup
      ? state.me && state.ready[state.me]
        ? "Mê cung đã khóa."
        : "Dựng lối cho đối thủ."
      : playing
        ? state.turn === state.me
          ? "Đến lượt bạn."
          : "Lượt của " + state.players[state.turn] + "."
        : state.winner
          ? state.winner === state.me
            ? "Bạn đã thắng!"
            : state.players[state.winner] + " thắng!"
          : state.reason === "draw"
            ? "Một ván hòa."
            : "Phòng đã đóng.";
  const completed = ["X", "O"].find(
    (mark) => state.boards[mark].finishedTurn !== null,
  );
  $("status-detail").textContent = waiting
    ? "Mời đối thủ bấm Tham gia trong tin phòng Discord."
    : setup
      ? "Chọn đầu S, đích G và tường. Giữ đường nối hai điểm; chỉ bạn thấy bản dựng của mình."
      : playing
        ? completed
          ? labelFor(completed) +
            " đã tới đích trong " +
            state.boards[completed].finishedTurn +
            " lượt. Đối thủ còn lượt gỡ hòa."
          : "Đi được thì đi tiếp. Chạm tường: đứng nguyên, lộ tường và đổi lượt."
        : REASONS[state.reason] || "Ván đấu đã kết thúc.";
  for (const mark of ["X", "O"]) {
    const board = state.boards[mark];
    $("name-" + mark).textContent = state.players[mark] || "Đang chờ đối thủ";
    $("role-" + mark).textContent = labelFor(mark);
    $("you-" + mark).hidden = state.me !== mark;
    $("player-" + mark).classList.toggle(
      "active",
      playing && state.turn === mark,
    );
    $("info-" + mark).textContent = setup
      ? state.ready[mark]
        ? "Đã khóa mê cung"
        : "Đang dựng mê cung"
      : board.position === null
        ? "Chưa bắt đầu"
        : board.turns +
          " lượt · " +
          board.visited.length +
          " ô" +
          (board.finishedTurn !== null ? " · Tới đích" : "");
  }
  $("setup-controls").hidden = !(setup && state.me && view === "design");
  for (const mode of ["start", "goal", "walls"]) {
    $("edit-" + mode).setAttribute("aria-pressed", String(editMode === mode));
    $("edit-" + mode).disabled = !canSetup();
  }
  $("edit-help").textContent =
    editMode === "walls"
      ? "Chạm khe ngang/dọc giữa hai ô để thêm hoặc xóa tường."
      : "Chạm một ô để chọn " +
        (editMode === "start" ? "điểm đầu S." : "đích G.");
  $("wall-count").textContent = state.design
    ? state.design.walls.length + " / " + state.rules.wallLimit + " đoạn tường"
    : "";
  for (const id of ["randomize", "clear-walls", "ready"])
    $(id).disabled = !canSetup();
  $("move-controls").hidden = !(playing && state.me && view === state.me);
  $("move-title").textContent =
    state.turn === state.me
      ? "Đi tiếp cho tới khi chạm tường."
      : "Đang chờ đối thủ.";
  for (const dir of Object.keys(DIRS))
    $("move-" + dir).disabled =
      !canMove() || nextCell(state.boards[state.me]?.position, dir) === null;
  $("catchup").hidden = !completed || !playing;
  $("catchup").textContent = completed
    ? "Lượt gỡ hòa: tới đích trong lượt này để hòa; đụng tường hoặc hết giờ thì thua."
    : "";
  const last = state.lastAction;
  $("last-action").textContent = !last
    ? "Chưa có nước đi."
    : (last.mark === state.me
        ? "Bạn"
        : state.me
          ? "Đối phương"
          : state.players[last.mark]) +
      (last.hit
        ? " chạm tường tại " + coord(last.from) + "; đổi lượt."
        : " đi " +
          coord(last.from) +
          " → " +
          coord(last.to) +
          (last.goal ? " và đã tới đích." : "; được đi tiếp."));
  $("connect-player").hidden = Boolean(state.me) || !open();
  $("pair-panel").hidden = Boolean(state.me) || !pairVisible || !open();
  $("leave").hidden = !state.me || !open();
  $("leave").textContent = waiting ? "Hủy phòng chờ" : "Đầu hàng";
  $("leave").disabled = pending || !connected;
  $("rules-detail").textContent = state.rulesLabel;
  if (!open()) {
    $("ready-dialog").close();
    $("leave-dialog").close();
  }
  renderBoard();
  updateClock();
}
for (const mode of ["start", "goal", "walls"])
  $("edit-" + mode).addEventListener("click", () => {
    editMode = mode;
    render();
  });
$("view-select").addEventListener("change", () => {
  view = $("view-select").value;
  render();
});
$("zoom-board").addEventListener("click", () => {
  const enlarged = $("board-frame").classList.toggle("enlarged");
  $("zoom-board").setAttribute("aria-pressed", String(enlarged));
  $("zoom-board").textContent = enlarged ? "Thu nhỏ" : "Phóng to";
});
$("randomize").addEventListener("click", () => {
  if (canSetup()) void action("randomize", { revision: state.setupRevision });
});
$("clear-walls").addEventListener("click", () => {
  if (canSetup()) void saveDesign({ ...state.design, walls: [] });
});
$("ready").addEventListener("click", () => {
  if (canSetup()) $("ready-dialog").showModal();
});
$("keep-editing").addEventListener("click", () => $("ready-dialog").close());
$("confirm-ready").addEventListener("click", () => {
  $("ready-dialog").close();
  if (canSetup()) void action("ready", { revision: state.setupRevision });
});
for (const direction of Object.keys(DIRS))
  $("move-" + direction).addEventListener("click", () => {
    if (canMove()) void action("move", { direction, version: state.version });
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
    $("ready-dialog").open ||
    $("leave-dialog").open ||
    !canMove()
  )
    return;
  const direction = {
    w: "up",
    arrowup: "up",
    s: "down",
    arrowdown: "down",
    a: "left",
    arrowleft: "left",
    d: "right",
    arrowright: "right",
  }[event.key.toLowerCase()];
  if (direction) {
    event.preventDefault();
    if (nextCell(state.boards[state.me].position, direction) !== null)
      void action("move", { direction, version: state.version });
  }
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
      : "Đồng hồ " + labelFor(state.turn).toLocaleLowerCase("vi");
  const ms = waiting
    ? state.waitingDeadline - at
    : setup
      ? state.setupDeadline - at
      : remaining[state.turn];
  $("timer").textContent = formatClock(ms);
  $("timer-progress").max = waiting
    ? 600
    : setup
      ? 300
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
  const pathId = /^\/(?:mecung\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/mecung/room/${roomId}`);
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
