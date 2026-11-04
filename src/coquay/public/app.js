"use strict";
const $ = (id) => document.getElementById(id);
const API = "/api/games/coquay";
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
let selectedItem = null,
  rotated = false,
  fxTimers = [];
const canAct = () =>
  !!(
    state?.me &&
    state.status === "playing" &&
    state.turn === state.me &&
    connected &&
    !pending
  );
const item = (id) => state.items.find((i) => i.id === id);
const label = (side) => state.players[side] || "Đang chờ đối thủ";
function art(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", "#art-" + id);
  svg.append(use);
  return svg;
}
function render() {
  if (!state) return;
  WebGamePlayers.render(state);
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("round").textContent = state.round || "—";
  $("ammo").textContent = state.round
    ? `${state.ammunition.live} thật · ${state.ammunition.blank} lép · Thứ tự kín`
    : "Đang chờ nạp đạn";
  $("move-count").textContent = state.moves + " thao tác";
  $("rules-detail").textContent = state.rulesLabel;
  const badges = [
    `${state.rules.maxHp} HP`,
    `${state.rules.itemLimit} đạo cụ/người`,
    `${state.rules.timeMinutes} phút/người`,
    "Không cược xu",
  ];
  $("rule-badges").replaceChildren(
    ...badges.map((text) => {
      const el = document.createElement("span");
      el.className = "badge";
      el.textContent = text;
      return el;
    }),
  );
  for (const side of ["X", "O"]) {
    $("name-" + side).textContent =
      label(side) + (state.me === side ? " · Bạn" : "");
    $("seat-" + side).classList.toggle(
      "active",
      state.status === "playing" && state.turn === side,
    );
    $("hp-" + side).textContent = `${state.hp[side]} / ${state.rules.maxHp} HP`;
    const bar = $("bar-" + side),
      fill = document.createElement("span");
    fill.style.width = (state.hp[side] / state.rules.maxHp) * 100 + "%";
    bar.replaceChildren(fill);
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(state.rules.maxHp));
    bar.setAttribute("aria-valuenow", String(state.hp[side]));
    const inv = state.inventories[side];
    $("tray-" + side).replaceChildren(
      ...Array.from({ length: state.rules.itemLimit }, (_, i) => {
        const key = inv[i],
          b = document.createElement("button");
        b.className = "slot" + (key ? "" : " empty");
        b.type = "button";
        if (!key) {
          b.disabled = true;
          b.setAttribute("aria-label", "Ô đạo cụ trống");
          return b;
        }
        b.append(art(key));
        b.title = item(key).name;
        b.setAttribute("aria-label", item(key).name);
        b.dataset.item = key;
        b.dataset.side = side;
        b.classList.toggle(
          "available",
          side === state.me && canAct() && state.usableItems.includes(key),
        );
        b.addEventListener("click", () => openItem(key, side));
        return b;
      }),
    );
    const effects = [];
    if (state.effects.shield[side]) effects.push("Chắn 1 DMG");
    if (state.effects.cuffed === side) effects.push("Bị còng · mất 1 lượt");
    $("effects-" + side).textContent = effects.join(" · ");
  }
  $("status-title").textContent =
    state.status === "waiting"
      ? "Chờ đối thủ tham gia trong Discord"
      : state.status === "playing"
        ? state.me === state.turn
          ? "Lượt của bạn · Chọn đạo cụ hoặc bắn"
          : `Lượt của ${label(state.turn)}`
        : state.winner
          ? `${label(state.winner)} thắng${state.reason === "timeout" ? " · Đối thủ hết giờ" : state.reason === "resign" ? " · Đối thủ đầu hàng" : ""}`
          : state.reason === "expired"
            ? "Phòng hết hạn chờ đối thủ"
            : "Phòng đã đóng";
  $("shoot-opponent").disabled = $("shoot-self").disabled = !canAct();
  $("shoot-opponent").textContent = state.effects.saw
    ? "Bắn đối thủ · Cưa ×2"
    : "Bắn đối thủ";
  $("controls").hidden = !state.me || state.status !== "playing";
  $("private-intel").hidden =
    state.knownShell === null || state.status !== "playing";
  $("private-intel").textContent =
    "Chỉ bạn biết: viên tiếp theo là " +
    (state.knownShell ? "ĐẠN THẬT" : "ĐẠN LÉP");
  $("connect-player").hidden =
    !!state.me || !["waiting", "playing"].includes(state.status);
  $("leave").hidden =
    !state.me || !["waiting", "playing"].includes(state.status);
  $("leave").textContent =
    state.status === "waiting" ? "Hủy phòng" : "Đầu hàng";
  $("pair-panel").hidden = !pairVisible || !!state.me;
  $("last-action").textContent = actionText(state.lastAction);
  $("landscape-log").textContent = actionText(state.lastAction);
  if ($("item-dialog").open && selectedItem) updateItemButton();
  if ($("inventory-dialog").open) renderInventory();
  updateClock();
}
function actionText(a) {
  if (!a) return "Đạn thật. Đạn lép. Bạn sẽ chọn ai?";
  const who = label(a.mark);
  if (a.type === "item")
    return `${who} dùng ${item(a.itemId).name}${a.itemId === "beer" ? `: loại đạn ${a.live ? "thật" : "lép"}` : ""}${a.reloaded ? " · Mở hộp hiệp mới" : ""}`;
  return `${who} ${a.target === a.mark ? "tự bắn" : "bắn " + label(a.target)} · ${a.live ? "Đạn thật" : "Đạn lép"}${a.damage ? ` · −${a.damage} HP` : ""}${a.blocked ? " · Bia đỡ 1 DMG" : ""}${a.cuffSkip ? " · Bỏ lượt bị còng" : ""}${a.reloaded ? " · Sang hiệp mới, mở hộp đạo cụ" : ""}`;
}
function updateItemButton() {
  const { key, side } = selectedItem;
  $("use-item").hidden = side !== state.me;
  $("use-item").disabled = !canAct() || !state.usableItems.includes(key);
  $("item-note").textContent =
    side !== state.me
      ? "Đạo cụ của " + label(side)
      : !canAct()
        ? "Chỉ dùng được khi đến lượt bạn."
        : !state.usableItems.includes(key)
          ? "Không thể dùng lúc này: kiểm tra HP, hiệu ứng đang có hoặc thông tin đã soi."
          : "Dùng một đạo cụ. Bạn tiếp tục giữ lượt.";
}
function openItem(key, side) {
  selectedItem = { key, side };
  $("item-title").textContent = item(key).name;
  $("item-description").textContent = item(key).description;
  $("item-art").setAttribute("href", "#art-" + key);
  updateItemButton();
  $("item-dialog").showModal();
}
function renderInventory() {
  const root = $("inventory-detail");
  root.replaceChildren();
  for (const side of ["X", "O"]) {
    const h = document.createElement("h3");
    h.textContent =
      label(side) +
      ` · ${state.inventories[side].length}/${state.rules.itemLimit}`;
    root.append(h);
    const box = document.createElement("div");
    box.className = "box-summary";
    const b = state.boxes[side];
    box.textContent =
      `Hộp hiệp ${state.round}: ` +
      (b.received.length
        ? b.received.map((id) => item(id).name).join(", ")
        : "Không nhận thêm") +
      (b.discarded ? ` · Bỏ ${b.discarded} món vì đầy túi` : "");
    root.append(box);
    const counts = new Map();
    for (const id of state.inventories[side])
      counts.set(id, (counts.get(id) || 0) + 1);
    for (const [id, n] of counts) {
      const row = document.createElement("div");
      row.className = "catalog-row";
      const body = document.createElement("div"),
        strong = document.createElement("strong"),
        desc = document.createElement("p");
      strong.textContent = item(id).name + " ×" + n;
      desc.textContent = item(id).description;
      body.append(strong, desc);
      row.append(art(id), body);
      root.append(row);
    }
  }
}
async function commit(data) {
  if (!canAct()) return;
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
}
function animateAction(before, next) {
  const a = next.lastAction;
  if (
    !before ||
    before.me !== next.me ||
    before.id !== next.id ||
    next.moves <= before.moves ||
    !a
  )
    return;
  for (const t of fxTimers) clearTimeout(t);
  fxTimers = [];
  for (const side of ["X", "O"]) $("seat-" + side).classList.remove("hit");
  $("weapon").classList.remove("fire");
  document.querySelector(".arena").classList.remove("impact");
  if (a.type !== "shoot") return;
  $("weapon").classList.toggle("aim-self", a.target === a.mark);
  void $("weapon").offsetWidth;
  if (a.live) $("weapon").classList.add("fire");
  if (a.damage) {
    $("seat-" + a.target).classList.add("hit");
    document.querySelector(".arena").classList.add("impact");
  }
  fxTimers.push(
    setTimeout(() => {
      $("weapon").classList.remove("fire");
      $("seat-" + a.target).classList.remove("hit");
      document.querySelector(".arena").classList.remove("impact");
    }, 650),
  );
}
function accept(next) {
  if (state && next.version < state.version) return;
  WebGameFeedback.update("coquay", next);
  animateAction(state, next);
  if (state && state.status !== next.status) $("leave-dialog").close();
  state = next;
  offset = next.serverNow - Date.now();
  if (!["waiting", "playing"].includes(state.status)) {
    $("leave-dialog").close();
    $("item-dialog").close();
    clearTimeout(pairTimer);
    pairing = false;
    pairVisible = false;
    pairingToken = null;
    pairAttempt++;
    clearStoredPairing();
  }
  render();
}
$("shoot-opponent").addEventListener("click", () =>
  commit({ type: "shoot", target: "opponent" }),
);
$("shoot-self").addEventListener("click", () =>
  commit({ type: "shoot", target: "self" }),
);
$("use-item").addEventListener("click", () => {
  if (
    !selectedItem ||
    !canAct() ||
    !state.usableItems.includes(selectedItem.key)
  )
    return;
  const key = selectedItem.key;
  $("item-dialog").close();
  commit({ type: "item", itemId: key });
});
$("rotate-table").addEventListener("click", () => {
  rotated = !rotated;
  $("felt").classList.toggle("rotated", rotated);
  $("rotate-table").setAttribute("aria-pressed", String(rotated));
});
$("inventory-open").addEventListener("click", () => {
  if (!state) return;
  renderInventory();
  $("inventory-dialog").showModal();
});
$("rules-open").addEventListener("click", () => $("rules-dialog").showModal());
for (const b of document.querySelectorAll("[data-close]"))
  b.addEventListener("click", () => $(b.dataset.close).close());
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
  const pathId = /^\/(?:coquay\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/coquay/room/${roomId}`);
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
