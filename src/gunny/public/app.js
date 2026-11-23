"use strict";
const $ = (id) => document.getElementById(id),
  API = "/api/games/gunny";
const Aim = globalThis.GunnyAim;
let state = null,
  roomId = null,
  connected = false,
  pending = false,
  source = null,
  offset = 0;
let pairTimer,
  pairing = false,
  pairingToken = null,
  pairExpiresAt = 0,
  pairAttempt = 0,
  pairVisible = false;
let character = "bear",
  weapon = "basic",
  direction = 1,
  overview = innerWidth >= 700,
  camera = 800,
  zoom = 1,
  charge = null,
  drag = null,
  lastShot = 0,
  impactSound = 0,
  refreshing = false,
  lastTurn = 0,
  manualCamera = false,
  cameraY = 330;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const ART = {
  bear: [
    "..11..1..1..11..",
    "..123333333321..",
    ".12333333333321.",
    ".12335533553321.",
    ".12334413441321.",
    ".12333333333321.",
    "..12333553321...",
    "..11233332211...",
    "...112333211....",
    "..1122332211....",
    ".1223333333221..",
    "12233355333322l1",
    "12233333333322l1",
    ".122332..233l1..",
    "..1221....1l1...",
    "..1551....155...",
  ],
  cat: [
    ".11..........11.",
    "1321........1321",
    "13321111111.3321",
    ".13333333333321.",
    ".13333333333321.",
    ".13354224542321.",
    ".13351441541321.",
    ".1233333333l321.",
    "..1233555332l1..",
    "..112333333l1...",
    "...11233332l....",
    "..112333333l1...",
    ".1233333333l321.",
    ".12233322333l21.",
    "..1221...1l21...",
    "..1551...155l...",
  ],
  robot: [
    ".....5..5.......",
    "....555555......",
    "..111111111l....",
    "..155555555l1...",
    "..154415441l1...",
    "..152215221l1...",
    "..155555555l1...",
    "..155544555l1...",
    "..1111111111l...",
    "...155555551l...",
    ".1115555555111..",
    "155555555555551l",
    "155555555555551l",
    ".11555555555l1..",
    "..1551..1551l...",
    "..1111..1111l...",
  ],
  palettes: {
    bear: {
      1: [50, 25, 10],
      2: [150, 90, 45],
      3: [195, 135, 75],
      4: [20, 20, 25],
      5: [225, 175, 120],
      l: [110, 65, 30],
    },
    cat: {
      1: [35, 35, 40],
      2: [210, 170, 110],
      3: [240, 215, 175],
      4: [25, 140, 60],
      5: [255, 235, 200],
      l: [165, 125, 75],
    },
    robot: {
      1: [25, 25, 45],
      2: [130, 140, 160],
      3: [180, 190, 205],
      4: [0, 180, 240],
      5: [200, 210, 225],
      l: [85, 95, 115],
    },
  },
};
const canvas = $("battlefield"),
  ctx = canvas.getContext("2d"),
  names = { bear: "Gấu", cat: "Mèo", robot: "Robot" };
function canAim() {
  return !!(
    state?.me &&
    state.status === "playing" &&
    state.phase === "aim" &&
    state.turn === state.me &&
    connected &&
    !pending
  );
}
function accept(next) {
  if (
    state &&
    next.id === state.id &&
    next.me === state.me &&
    next.version < state.version
  )
    return;
  const previous = state;
  state = next;
  offset = state.serverNow - Date.now();
  if (
    previous &&
    (previous.turnNo !== next.turnNo ||
      previous.phase !== next.phase ||
      previous.me !== next.me)
  )
    cancelCharge();
  if (next.me && next.turnNo !== lastTurn) {
    lastTurn = next.turnNo;
    manualCamera = false;
    direction = next.fighters[next.me].direction;
  }
  if (
    next.me &&
    previous &&
    previous.fighters[next.me].x !== next.fighters[next.me].x
  )
    direction = next.fighters[next.me].direction;
  if (next.me && next.fighters[next.me].ammo[weapon] === 0) weapon = "basic";
  globalThis.WebGameFeedback?.update("gunny", next);
  render();
}
function render() {
  if (!state) return;
  const open = ["waiting", "setup", "playing"].includes(state.status),
    me = state.me;
  globalThis.WebGamePlayers?.render(state);
  $("room-code").textContent =
    "PHÒNG " + (state.roomCode || state.id.slice(0, 8));
  const displayFighters =
    state.phase === "firing" &&
    Date.now() + offset < state.shot.startedAt + state.shot.flightMs
      ? state.shot.before.fighters
      : state.fighters;
  for (const m of ["X", "O"]) {
    $("name-" + m).textContent = state.players[m] || "Đang chờ";
    $("role-" + m).textContent =
      state.playerLabels[m] + (me === m ? " · Bạn" : "");
    $("player-" + m).classList.toggle(
      "active",
      state.status === "playing" && state.turn === m,
    );
    $("hp-" + m).style.width = displayFighters[m].hp + "%";
    $("score-" + m).textContent = displayFighters[m].hp + " HP";
  }
  $("board-state").textContent =
    state.status === "waiting"
      ? "Chờ đối thủ tham gia"
      : state.status === "setup"
        ? "Chọn nhân vật · Sẵn sàng"
        : state.status === "playing"
          ? `Lượt ${state.turnNo} · ${state.phase === "firing" ? "Đạn đang bay" : state.players[state.turn] + " ngắm bắn"}`
          : "Trận đấu kết thúc";
  $("wind").textContent =
    `Gió ${state.wind < 0 ? "←" : "→"} ${Math.abs(state.wind).toFixed(2)}`;
  $("setup").hidden = !(me && state.status === "setup");
  $("aim").hidden = !(me && state.status === "playing");
  $("waiting").hidden =
    !open || !!(me && ["setup", "playing"].includes(state.status));
  document.querySelector(".battle-controls").hidden = !open;
  document.querySelector(".arena").dataset.phase = state.phase;
  $("waiting-title").textContent =
    state.status === "waiting"
      ? "Chờ đối thủ"
      : state.status === "setup"
        ? "Hai pháo thủ đang chuẩn bị"
        : state.status === "playing"
          ? "Đang xem trực tiếp"
          : "Hẹn trận đấu tiếp theo";
  $("waiting-detail").textContent =
    state.status === "waiting"
      ? "Tham gia trong tin phòng Discord. Bấm biểu tượng tài khoản để xác nhận người chơi."
      : state.status === "playing"
        ? "Theo dõi các phát bắn và địa hình của cả hai người chơi."
        : state.status === "setup"
          ? "Trận đấu bắt đầu khi cả hai sẵn sàng."
          : "Mở /gunny choi trong Discord để tạo phòng mới.";
  for (const b of document.querySelectorAll("[data-character]")) {
    b.classList.toggle("selected", b.dataset.character === character);
    b.disabled = pending || !connected || !!state.ready[me];
  }
  $("ready").disabled = pending || !connected || !!state.ready[me];
  $("ready").textContent = state.ready[me] ? "Đã sẵn sàng" : "Sẵn sàng";
  $("setup-status").textContent = state.ready[me]
    ? "Đang chờ đối thủ sẵn sàng…"
    : "";
  $("weapons").replaceChildren();
  for (const [id, w] of Object.entries(state.weapons)) {
    const b = document.createElement("button"),
      small = document.createElement("small"),
      label = document.createElement("span");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    icon.setAttribute("viewBox", "0 0 48 48");
    icon.setAttribute("aria-hidden", "true");
    use.setAttribute("href", "#weapon-" + id);
    icon.append(use);
    label.className = "weapon-name";
    label.textContent = w.name;
    small.textContent = `${w.damage} DMG · ${me ? (state.fighters[me].ammo[id] < 0 ? "∞" : state.fighters[me].ammo[id]) : "—"}`;
    b.title =
      w.name +
      " · " +
      small.textContent +
      ` · Góc nâng ${w.minAngle}–${w.maxAngle}°`;
    b.setAttribute("aria-label", b.title);
    b.dataset.weapon = id;
    b.append(icon, label, small);
    b.classList.toggle("selected", id === weapon);
    b.disabled = !canAim() || (me && state.fighters[me].ammo[id] === 0);
    b.onclick = () => {
      weapon = id;
      render();
    };
    $("weapons").append(b);
  }
  for (const id of ["angle", "direction", "move-left", "move-right", "fire"])
    $(id).disabled = !canAim();
  if (me) {
    for (const id of ["move-left", "move-right"])
      $(id).disabled = !canAim() || state.fighters[me].moveRemaining <= 0;
  }
  $("direction").textContent = "Hướng " + (direction === 1 ? "→" : "←");
  syncAim();
  $("connect-player").hidden = !!me || !open;
  $("pair-panel").hidden = !!me || !open || !pairVisible;
  $("leave").hidden = !me || !open;
  $("leave").textContent =
    state.status === "waiting" ? "Hủy phòng" : "Đầu hàng";
  $("account-status").textContent = me
    ? `Đã xác nhận: ${state.players[me]}`
    : "Bạn đang xem với tư cách khán giả.";
  $("rule-badges").replaceChildren(
    ...[
      "100 HP",
      `60 bước/lượt`,
      `${state.rules.turnSeconds} giây/lượt`,
      `${state.rules.timeMinutes} phút/người`,
    ].map((t) => {
      const x = document.createElement("span");
      x.textContent = t;
      return x;
    }),
  );
  $("rules-detail").textContent = state.rulesLabel;
  $("history").replaceChildren(
    ...state.history
      .slice()
      .reverse()
      .map((h) => {
        const x = document.createElement("li");
        x.textContent = `Lượt ${h.turn} · ${state.players[h.mark]} · ${state.weapons[h.weapon].name} · Gây ${h.damage.X + h.damage.O} DMG`;
        return x;
      }),
  );
  $("result").hidden = open;
  if (!open) {
    $("result-title").textContent = state.winner
      ? state.players[state.winner] + " chiến thắng!"
      : state.reason === "draw"
        ? "Hòa nhau"
        : "Phòng đã đóng";
    $("result-detail").textContent =
      {
        hp: "Hạ gục đối thủ",
        fall: "Rơi khỏi địa hình",
        timeout: "Hết thời gian",
        idle: "Không thao tác trong 5 phút",
        resign: "Đầu hàng",
        setup_timeout: "Hết giờ chọn nhân vật",
        expired: "Không có đối thủ",
        cancelled: "Phòng chờ đã hủy",
        draw: "Cả hai cùng bị hạ",
      }[state.reason] || "";
  }
  updateClock();
}
async function action(data) {
  if (pending || !connected || !state?.me) return;
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
$("ready").onclick = () => action({ type: "ready", character });
for (const b of document.querySelectorAll("[data-character]"))
  b.onclick = () => {
    character = b.dataset.character;
    render();
  };
function currentAim() {
  if (!state) return null;
  const inFlight =
    state.phase === "firing" &&
    Date.now() + offset < state.shot.startedAt + state.shot.flightMs;
  const heights = inFlight ? state.shot.before.heights : state.heights,
    fighters = inFlight ? state.shot.before.fighters : state.fighters;
  return Aim.solution(
    heights,
    fighters[state.me || state.turn],
    state.weapons[weapon],
    direction,
    Number($("angle").value),
  );
}
function dialSector(start, end) {
  const point = (a, r) => [
    50 + r * Math.cos((a * Math.PI) / 180),
    50 - r * Math.sin((a * Math.PI) / 180),
  ];
  const a = point(start, 37),
    b = point(end, 37),
    c = point(end, 26),
    d = point(start, 26),
    sweep = end > start ? 0 : 1;
  return `M${a}A37 37 0 0 ${sweep} ${b}L${c}A26 26 0 0 ${1 - sweep} ${d}Z`;
}
for (let degrees = 0; degrees < 360; degrees += 10) {
  const a = (degrees * Math.PI) / 180,
    r = degrees % 30 ? 38 : 34,
    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    `M${50 + r * Math.cos(a)} ${50 - r * Math.sin(a)}L${50 + 42 * Math.cos(a)} ${50 - 42 * Math.sin(a)}`,
  );
  $("dial-ticks").append(path);
}
function syncAim() {
  if (state) {
    const r = Aim.limits(state.weapons[weapon]);
    $("angle").min = r.min;
    $("angle").max = r.max;
    $("angle").value = Math.max(
      r.min,
      Math.min(r.max, Number($("angle").value)),
    );
    const g = currentAim(),
      display = Math.round(g.horizontal);
    $("angle-value").textContent = display + "°";
    $("angle-needle").setAttribute("transform", `rotate(${-g.world} 50 50)`);
    $("terrain-plane").setAttribute("transform", `rotate(${-g.tilt} 50 50)`);
    $("terrain-line").setAttribute("transform", `rotate(${-g.tilt} 50 50)`);
    $("angle-zone").setAttribute(
      "d",
      dialSector(g.base + direction * r.min, g.base + direction * r.max),
    );
    const dial = document.querySelector(".angle-dial");
    dial.dataset.tilt = g.tilt;
    dial.dataset.bearing = g.world;
    dial.dataset.horizontal = g.horizontal;
    dial.dataset.direction = direction;
    dial.dataset.weapon = weapon;
    dial.setAttribute(
      "aria-label",
      `Góc bắn ${display} độ so với phương ngang, nhìn ${direction === 1 ? "phải" : "trái"}; vùng cho phép ${Math.round(g.min)} đến ${Math.round(g.max)} độ`,
    );
    $("angle").setAttribute(
      "aria-valuetext",
      `${display} độ so với phương ngang`,
    );
  }
  $("power-value").textContent = Math.round(Number($("power").value)) + "%";
  $("power").style.setProperty("--power-fill", `${Number($("power").value)}%`);
}
$("angle").oninput = syncAim;
$("power").oninput = syncAim;
$("direction").onclick = () => {
  direction *= -1;
  render();
};
$("move-left").onclick = () => action({ type: "walk", dx: -5 });
$("move-right").onclick = () => action({ type: "walk", dx: 5 });
function cancelCharge() {
  charge = null;
  $("fire").classList.remove("charging");
  $("fire").textContent = "BẮN";
  $("fire").dataset.hint = "GIỮ / THẢ";
}
function beginCharge() {
  if (!canAim() || charge) return;
  charge = { at: performance.now() };
  $("power").value = 0;
  syncAim();
  $("fire").classList.add("charging");
  $("fire").textContent = "THẢ";
  $("fire").dataset.hint = "0% LỰC";
}
function releaseCharge() {
  if (!charge) return;
  const percent = Aim.chargePercent(performance.now() - charge.at);
  $("power").value = percent;
  syncAim();
  const power = percent / 5;
  cancelCharge();
  if (canAim())
    action({
      type: "fire",
      angle: currentAim().horizontal,
      power,
      weapon,
      direction,
    });
}
$("fire").addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  beginCharge();
  if (charge) $("fire").setPointerCapture(e.pointerId);
});
$("fire").addEventListener("pointerup", (e) => {
  e.preventDefault();
  releaseCharge();
});
$("fire").addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) beginCharge();
  }
});
$("fire").addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    releaseCharge();
  }
});
$("fire").addEventListener("click", (e) => {
  if (e.detail === 0 && canAim()) {
    beginCharge();
    releaseCharge();
  }
});
$("fire").addEventListener("pointercancel", cancelCharge);
$("fire").addEventListener("lostpointercapture", cancelCharge);
window.addEventListener("blur", cancelCharge);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelCharge();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    cancelCharge();
    return;
  }
  if (
    document.querySelector("dialog[open]") ||
    /INPUT|BUTTON|SELECT|TEXTAREA/.test(e.target.tagName) ||
    !canAim()
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) beginCharge();
  } else if (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "d") {
    e.preventDefault();
    if (!e.repeat)
      action({ type: "walk", dx: e.key.toLowerCase() === "a" ? -5 : 5 });
  } else if (["ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    $("angle").value = Math.max(
      Number($("angle").min),
      Math.min(
        Number($("angle").max),
        Number($("angle").value) + (e.key === "ArrowUp" ? 1 : -1),
      ),
    );
    $("angle").oninput();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    releaseCharge();
  }
});
$("overview").onclick = () => {
  manualCamera = false;
  overview = !overview;
  $("overview").textContent = overview ? "Cận cảnh" : "Toàn cảnh";
};
for (const type of ["info", "account"])
  $(type).onclick = () => $(type + "-dialog").showModal();
for (const b of document.querySelectorAll("[data-close]"))
  b.onclick = () => $(b.dataset.close).close();
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  manualCamera = true;
  drag = { x: e.clientX, camera };
  overview = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  camera = Math.max(
    0,
    Math.min(1600, drag.camera - (e.clientX - drag.x) / zoom),
  );
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(name, () => {
    drag = null;
  });
// Decorative scene geometry never participates in collision or changes gameplay state.
const sceneNoise = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function polygon(c, points, fill, stroke, line = 1) {
  c.beginPath();
  for (let i = 0; i < points.length; i++)
    i ? c.lineTo(...points[i]) : c.moveTo(...points[i]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = line;
    c.stroke();
  }
}
function cloud(c, x, y, size, alpha) {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  c.globalAlpha = alpha;
  c.fillStyle = "#fff9da";
  c.beginPath();
  c.moveTo(-60, 8);
  c.bezierCurveTo(-82, -8, -58, -24, -33, -18);
  c.bezierCurveTo(-40, -55, 10, -62, 26, -32);
  c.bezierCurveTo(50, -47, 82, -26, 71, -6);
  c.bezierCurveTo(101, -3, 88, 18, 52, 17);
  c.lineTo(-43, 17);
  c.closePath();
  c.fill();
  c.restore();
}
function drawSky(c, w, h, at) {
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#62bbcc");
  sky.addColorStop(0.43, "#a3dbcc");
  sky.addColorStop(1, "#e5e6ad");
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const sun = c.createRadialGradient(
    w * 0.2,
    h * 0.18,
    0,
    w * 0.2,
    h * 0.18,
    w * 0.65,
  );
  sun.addColorStop(0, "#fff8ccba");
  sun.addColorStop(0.28, "#fff6c23b");
  sun.addColorStop(1, "#fff6c200");
  c.fillStyle = sun;
  c.fillRect(0, 0, w, h);
  c.save();
  c.globalAlpha = 0.12;
  c.fillStyle = "#fffadd";
  for (let i = 0; i < 5; i++)
    polygon(
      c,
      [
        [w * 0.19, h * 0.1],
        [w * (0.1 + i * 0.26), h],
        [w * (0.22 + i * 0.26), h],
      ],
      "#fffadd",
    );
  c.restore();
  const drift = reducedMotion.matches ? 0 : at * 0.002;
  for (let i = 0; i < 7; i++) {
    const x =
      ((i * w * 0.25 + drift * (0.3 + (i % 3) * 0.15)) % (w + 200)) - 100;
    cloud(
      c,
      x,
      h * (0.13 + (i % 3) * 0.1),
      0.5 + sceneNoise(i + 2) * 0.8,
      0.38 + (i % 2) * 0.17,
    );
  }
  for (let layer = 0; layer < 3; layer++) {
    const base = h * (0.57 + layer * 0.1);
    c.beginPath();
    c.moveTo(-20, h);
    for (let x = -20; x <= w + 20; x += 20)
      c.lineTo(
        x,
        base +
          Math.sin(x / (w * 0.22) + layer * 2) * h * 0.065 +
          Math.cos(x / (w * 0.09) + layer) * h * 0.028,
      );
    c.lineTo(w + 20, h);
    c.closePath();
    c.fillStyle = ["#79b7a6", "#589c91", "#488e7c"][layer];
    c.globalAlpha = 0.45 + layer * 0.12;
    c.fill();
  }
  c.globalAlpha = 1;
  // A distant waterfall, mist and swaying jungle silhouettes add depth behind the playable island.
  c.save();
  c.globalAlpha = 0.3;
  c.fillStyle = "#d2f5df";
  c.beginPath();
  c.moveTo(w * 0.83, h * 0.6);
  c.bezierCurveTo(w * 0.82, h * 0.72, w * 0.85, h * 0.86, w * 0.81, h);
  c.lineTo(w * 0.85, h);
  c.bezierCurveTo(w * 0.88, h * 0.8, w * 0.84, h * 0.66, w * 0.85, h * 0.6);
  c.fill();
  c.restore();
}
function palm(c, x, y, scale, at) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  const sway = reducedMotion.matches ? 0 : Math.sin(at * 0.0012 + x) * 3;
  c.beginPath();
  c.moveTo(-12, 7);
  c.bezierCurveTo(0, -65, 30, -120, 24 + sway, -178);
  c.lineTo(37 + sway, -178);
  c.bezierCurveTo(48, -112, 22, -41, 20, 7);
  c.closePath();
  c.fillStyle = "#8c8a43";
  c.fill();
  c.strokeStyle = "#425d39";
  c.lineWidth = 3;
  c.stroke();
  c.strokeStyle = "#c9b45a";
  c.lineWidth = 3;
  for (let j = 0; j < 6; j++) {
    const yy = -25 - j * 24;
    c.beginPath();
    c.moveTo(5 + j * 3, yy);
    c.lineTo(23 + j * 2, yy + 5);
    c.stroke();
  }
  c.translate(29 + sway, -177);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    c.save();
    c.rotate(a);
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(20, -45, 73, -38, 112, 4);
    c.bezierCurveTo(66, -7, 41, 10, 0, 0);
    c.fillStyle = i % 2 ? "#739c33" : "#a4bc3d";
    c.fill();
    c.strokeStyle = "#365f38";
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(55, -25, 110, 3);
    c.strokeStyle = "#d5db67";
    c.stroke();
    c.restore();
  }
  c.fillStyle = "#8c7334";
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.ellipse(i * 8 - 6, 4 + (i % 2) * 5, 7, 9, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}
function ruins(c, at, heights) {
  c.save();
  c.globalAlpha = 0.92;
  // Stone foundations continue behind the island; decorations never float above a valley.
  polygon(
    c,
    [
      [704, 350],
      [1066, 350],
      [1090, 650],
      [680, 650],
    ],
    "#929465",
    "#68795a",
    3,
  );
  // Stepped sandstone sanctuary with a carved sun gate, inspired by tropical adventure arenas.
  for (let step = 0; step < 5; step++) {
    const x = 720 + step * 24,
      y = 365 - step * 43,
      width = 330 - step * 48;
    polygon(
      c,
      [
        [x, y],
        [x + width, y],
        [x + width - 4, y - 43],
        [x + 6, y - 43],
      ],
      step % 2 ? "#aaa976" : "#c6bc83",
      "#68795a",
      2,
    );
    c.strokeStyle = "#ede0a0";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x + 4, y - 40);
    c.lineTo(x + width - 5, y - 40);
    c.stroke();
    c.strokeStyle = "#8a9166";
    c.lineWidth = 1;
    for (let brick = x + (step % 2) * 26; brick < x + width; brick += 51) {
      c.beginPath();
      c.moveTo(brick, y - 38);
      c.lineTo(brick - 2, y - 3);
      c.stroke();
    }
  }
  polygon(
    c,
    [
      [830, 365],
      [830, 282],
      [850, 262],
      [900, 262],
      [920, 282],
      [920, 365],
    ],
    "#586f56",
    "#717f57",
    5,
  );
  polygon(
    c,
    [
      [846, 365],
      [846, 286],
      [859, 278],
      [893, 278],
      [904, 286],
      [904, 365],
    ],
    "#284e49",
    "#e0c97d",
    3,
  );
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    polygon(
      c,
      [
        [875 + Math.cos(a) * 34, 227 + Math.sin(a) * 34],
        [875 + Math.cos(a + 0.2) * 24, 227 + Math.sin(a + 0.2) * 24],
        [875 + Math.cos(a + 0.13) * 45, 227 + Math.sin(a + 0.13) * 45],
      ],
      "#ccb86f",
      "#777c51",
      1,
    );
  }
  c.fillStyle = "#ddca83";
  c.strokeStyle = "#7b8156";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(875, 227, 25, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = "#566e52";
  c.fillRect(863, 221, 8, 5);
  c.fillRect(880, 221, 8, 5);
  c.fillRect(868, 236, 15, 4);
  // Weathered guardian statues frame the sanctuary without hiding the fighters.
  for (const [x, flip] of [
    [657, 1],
    [1095, -1],
  ]) {
    c.save();
    c.translate(x, 352);
    c.scale(flip, 1);
    polygon(
      c,
      [
        [-45, 10],
        [15, 10],
        [20, 300],
        [-48, 300],
      ],
      "#969365",
      "#68795a",
      3,
    );
    polygon(
      c,
      [
        [-45, 25],
        [-43, -49],
        [-65, -70],
        [-57, -121],
        [-34, -142],
        [-6, -116],
        [24, -110],
        [30, -64],
        [5, -32],
        [12, 25],
      ],
      "#a49e65",
      "#516c4e",
      4,
    );
    polygon(
      c,
      [
        [-49, -105],
        [-30, -124],
        [-15, -103],
        [-25, -75],
      ],
      "#dbca86",
      "#647251",
      3,
    );
    c.fillStyle = "#354f40";
    c.fillRect(-37, -102, 16, 6);
    c.beginPath();
    c.arc(-15, -62, 20, 0, Math.PI * 2);
    c.fillStyle = "#c0b477";
    c.fill();
    c.strokeStyle = "#7c8556";
    c.stroke();
    c.beginPath();
    c.arc(-15, -62, 9, 0, Math.PI * 1.6);
    c.stroke();
    c.restore();
  }
  for (const [x, size] of [
    [275, 0.9],
    [1275, 0.77],
    [1470, 1.15],
  ])
    if (heights[x] > 10) palm(c, x, 600 - heights[x] + 7, size, at);
  c.restore();
}
function drawTerrain(c, heights) {
  c.beginPath();
  c.moveTo(0, 650);
  for (let x = 0; x < 1600; x++) c.lineTo(x, 600 - heights[x]);
  c.lineTo(1600, 650);
  c.closePath();
  const earth = c.createLinearGradient(0, 150, 0, 650);
  earth.addColorStop(0, "#a19a50");
  earth.addColorStop(0.35, "#777a42");
  earth.addColorStop(0.7, "#414f35");
  earth.addColorStop(1, "#193536");
  c.fillStyle = earth;
  c.fill();
  c.save();
  c.clip();
  for (let i = 0; i < 105; i++) {
    const x = sceneNoise(i + 10) * 1600,
      y = 240 + sceneNoise(i + 610) * 450,
      r = 12 + sceneNoise(i + 99) * 35;
    polygon(
      c,
      [
        [x - r, y],
        [x - r * 0.6, y - r * 0.6],
        [x + r * 0.5, y - r * 0.7],
        [x + r, y + r * 0.1],
        [x + r * 0.3, y + r * 0.7],
        [x - r * 0.6, y + r * 0.6],
      ],
      i % 3 ? "#68704448" : "#c2ad5a45",
      "#263f3045",
      1.5,
    );
  }
  c.strokeStyle = "#c0ad5633";
  c.lineWidth = 3;
  for (let k = 0; k < 5; k++) {
    c.beginPath();
    for (let x = 0; x <= 1600; x += 20) {
      const y = 310 + k * 73 + Math.sin(x * 0.012 + k) * 19;
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }
  c.restore();
  for (const [width, color] of [
    [13, "#304c30"],
    [8, "#829c35"],
    [2, "#d4d879"],
  ]) {
    c.beginPath();
    for (let x = 0; x < 1600; x++)
      x ? c.lineTo(x, 600 - heights[x]) : c.moveTo(x, 600 - heights[x]);
    c.lineWidth = width;
    c.strokeStyle = color;
    c.stroke();
  }
  for (let x = 3; x < 1600; x += 9) {
    if (heights[x] < 5) continue;
    const y = 600 - heights[x];
    c.beginPath();
    c.moveTo(x - 4, y + 2);
    c.quadraticCurveTo(
      x - 4,
      y - 7,
      x - 6 + sceneNoise(x) * 12,
      y - 6 - sceneNoise(x + 1) * 6,
    );
    c.lineTo(x + 4, y + 2);
    c.fillStyle = x % 3 ? "#acbf46" : "#bfd362";
    c.fill();
  }
}
function fighterArt(c, f, mark, at, heights) {
  const t = ART[f.character] || ART.bear,
    p = ART.palettes[f.character],
    active = state.status === "playing" && state.turn === mark,
    shot = state.shot,
    firing = shot && shot.mark === mark && state.phase === "firing";
  const facing = firing
      ? shot.direction
      : active && state.me === mark
        ? direction
        : f.direction,
    tilt = Aim.terrainTilt(heights, f.x),
    recoil = firing ? Math.max(0, 1 - (at - shot.startedAt) / 170) * 5 : 0;
  c.save();
  c.translate(f.x, f.y);
  c.rotate((-tilt * Math.PI) / 180);
  c.fillStyle = "#16393066";
  c.beginPath();
  c.ellipse(0, 3, 24, 5, 0, 0, Math.PI * 2);
  c.fill();
  if (active) {
    c.save();
    c.globalAlpha = 0.65;
    c.strokeStyle = mark === "X" ? "#ffe88d" : "#a1f4f3";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(0, 2, 25, 6, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  c.translate(-facing * recoil, 0);
  const scale = 3;
  c.scale(facing, 1);
  for (let y = 0; y < t.length; y++)
    for (let x = 0; x < t[y].length; x++) {
      const v = t[y][x];
      if (v !== "." && p[v]) {
        c.fillStyle = "rgb(" + p[v].join(",") + ")";
        c.fillRect(
          (x - t[y].length / 2) * scale,
          -t.length * scale + y * scale,
          scale + 0.1,
          scale + 0.1,
        );
      }
    }
  c.restore();
  const g = Aim.solution(
      heights,
      f,
      state.weapons.basic,
      facing,
      active && state.me === mark ? Number($("angle").value) : 45,
    ),
    world = firing
      ? (shot.worldAngle ??
        (shot.direction === 1 ? shot.angle : 180 - shot.angle))
      : g.world;
  c.save();
  c.translate(g.center.x, g.center.y);
  c.rotate((-world * Math.PI) / 180);
  c.fillStyle = "#314940";
  c.strokeStyle = "#182e29";
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(6, -5, 22, 9, 3);
  c.fill();
  c.stroke();
  c.fillStyle = "#c1bb87";
  c.fillRect(20, -5, 5, 9);
  c.restore();
  if (charge && state.me === mark && !reducedMotion.matches) {
    const power = Number($("power").value) / 100,
      glow = c.createRadialGradient(
        f.x,
        f.y - 23,
        5,
        f.x,
        f.y - 23,
        36 + power * 12,
      );
    glow.addColorStop(0, "#fff4a000");
    glow.addColorStop(0.7, "#ffdd7d22");
    glow.addColorStop(1, "#ffe58400");
    c.fillStyle = glow;
    c.fillRect(f.x - 50, f.y - 70, 100, 100);
    for (let i = 0; i < 7; i++) {
      const a = at * 0.004 + (i * Math.PI * 2) / 7;
      c.fillStyle = "#fff3a8";
      c.beginPath();
      c.arc(
        f.x + Math.cos(a) * 29,
        f.y - 24 + Math.sin(a) * 29,
        1.5 + power,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }
}
function unitOverlay(mark, f, left, top, w, h, shakeX, shakeY, bottom) {
  const el = $("unit-" + mark),
    x = (f.x - left) * zoom + shakeX,
    y = f.y * zoom + top + 8 + shakeY;
  el.hidden =
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !state.players[mark] ||
    f.hp <= 0 ||
    x < 15 ||
    x > w - 15 ||
    y < 48 ||
    y + 51 > h - bottom;
  if (el.hidden) return;
  el.style.left = Math.round(x * 10) / 10 + "px";
  el.style.top = Math.round(y * 10) / 10 + "px";
  el.classList.toggle(
    "active",
    state.status === "playing" && state.turn === mark,
  );
  const fuel = f.moveRemaining,
    name = state.players[mark],
    hp = String(f.hp);
  if (
    el.dataset.name !== name ||
    el.dataset.hp !== hp ||
    el.dataset.stamina !== String(fuel)
  ) {
    $("unit-name-" + mark).textContent = name;
    $("unit-hp-" + mark).style.width = f.hp + "%";
    $("unit-hp-text-" + mark).textContent = f.hp + " HP";
    $("unit-energy-" + mark).style.width = (fuel / 60) * 100 + "%";
    $("unit-energy-text-" + mark).textContent = fuel + "/60";
    el.dataset.name = name;
    el.dataset.hp = hp;
    el.dataset.stamina = String(fuel);
    el.setAttribute("aria-label", `${name}: ${f.hp} HP, thể lực ${fuel}/60`);
  }
}
function explosion(c, shot, progress, fighters) {
  const r = state.weapons[shot.weapon].radius,
    x = shot.impact.x,
    y = shot.impact.y;
  c.save();
  const size = r * (0.6 + progress * 1.7);
  c.globalAlpha = Math.max(0, 1 - progress);
  c.strokeStyle = "#fff4a1";
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(x, y, size * 1.6, size * 0.45, 0, 0, Math.PI * 2);
  c.stroke();
  const burst = [];
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12,
      rr = size * (i % 2 ? 0.48 : 1.1);
    burst.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  polygon(c, burst, "#f09636cc", "#8c4c24", 3);
  const glow = c.createRadialGradient(x, y, 0, x, y, size);
  glow.addColorStop(0, "#fffbe4");
  glow.addColorStop(0.2, "#fff6a1");
  glow.addColorStop(0.55, "#ffc742c9");
  glow.addColorStop(1, "#ff6f2600");
  c.fillStyle = glow;
  c.fillRect(x - size, y - size, size * 2, size * 2);
  if (!reducedMotion.matches)
    for (let i = 0; i < 20; i++) {
      const a = sceneNoise(i + shot.id * 23) * Math.PI * 2,
        speed = 35 + sceneNoise(i + 90) * 100,
        px = x + Math.cos(a) * progress * speed,
        py = y + Math.sin(a) * progress * speed + progress * progress * 35;
      c.save();
      c.translate(px, py);
      c.rotate(a + progress * 4);
      c.fillStyle = i % 3 ? "#ffd16b" : "#525936";
      c.fillRect(-2, -2, 4 + sceneNoise(i) * 4, 4);
      c.restore();
    }
  c.restore();
  for (const m of ["X", "O"])
    if (shot.damage[m]) {
      const f = fighters[m],
        rise = reducedMotion.matches ? 0 : progress * 38,
        px = f.x,
        py = f.y - 65 - rise;
      c.save();
      c.translate(px, py);
      c.rotate(-0.09);
      c.globalAlpha = Math.min(1, (1 - progress) * 2);
      c.font = "italic 950 38px system-ui";
      c.textAlign = "center";
      c.lineJoin = "round";
      c.strokeStyle = "#493c23";
      c.lineWidth = 9;
      c.strokeText("−" + shot.damage[m], 0, 0);
      c.strokeStyle = "#fff2a7";
      c.lineWidth = 4;
      c.strokeText("−" + shot.damage[m], 0, 0);
      c.fillStyle = "#ed5d2c";
      c.fillText("−" + shot.damage[m], 0, 0);
      c.restore();
    }
}
function drawFrame() {
  const rect = canvas.getBoundingClientRect(),
    dpr = Math.min(2, devicePixelRatio || 1);
  if (
    canvas.width !== Math.round(rect.width * dpr) ||
    canvas.height !== Math.round(rect.height * dpr)
  ) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width,
    h = rect.height,
    at = Date.now() + offset;
  drawSky(ctx, w, h, at);
  if (state && w && h) {
    const shot = state.shot,
      elapsed = shot ? at - shot.startedAt : Infinity,
      inFlight = state.phase === "firing" && elapsed < shot.flightMs;
    const heights = inFlight ? shot.before.heights : state.heights,
      fighters = inFlight ? shot.before.fighters : state.fighters;
    const portrait = w < 700 && h > w,
      short = h < 430,
      topHud = portrait ? 142 : short ? 82 : 115;
    const controls = document.querySelector(".battle-controls"),
      reserved = controls.hidden
        ? 25
        : controls.getBoundingClientRect().height + 25;
    const playHeight = Math.max(90, h - topHud - reserved - 54),
      bottom = reserved;
    zoom = overview
      ? Math.min(w / 1600, playHeight / 350)
      : Math.max(w / 1600, Math.min(1.5, playHeight / 280), 0.75);
    const visible = w / zoom,
      point = inFlight
        ? shot.path[
            Math.min(
              shot.path.length - 1,
              Math.max(
                0,
                Math.floor((elapsed / shot.flightMs) * (shot.path.length - 1)),
              ),
            )
          ]
        : null;
    if (!drag && (!manualCamera || inFlight)) {
      const focus = point ? point[0] : fighters[state.turn].x;
      camera += (focus - camera) * (reducedMotion.matches ? 1 : 0.085);
    }
    const targetY = overview
      ? 330
      : point
        ? point[1] + 20
        : fighters[state.turn].y -
          Math.min(50, Math.max(0, (playHeight - 160) / 4));
    cameraY += (targetY - cameraY) * (reducedMotion.matches ? 1 : 0.07);
    const left = overview
        ? (1600 - visible) / 2
        : Math.max(Math.min(camera - visible / 2, 1600 - visible), 0),
      top = topHud + playHeight * 0.5 - cameraY * zoom;
    const blastProgress = shot ? (elapsed - shot.flightMs) / 900 : -1,
      impact =
        shot &&
        shot.impact.type !== "miss" &&
        blastProgress >= 0 &&
        blastProgress < 1;
    const quake =
        impact && !reducedMotion.matches
          ? Math.max(0, 1 - blastProgress * 2)
          : 0,
      shakeX = quake ? Math.sin(elapsed * 0.06) * 4 * quake : 0,
      shakeY = quake ? Math.cos(elapsed * 0.08) * 3 * quake : 0;
    ctx.save();
    ctx.translate(-left * zoom + shakeX, top + shakeY);
    ctx.scale(zoom, zoom);
    ruins(ctx, at, heights);
    drawTerrain(ctx, heights);
    for (const m of ["X", "O"]) {
      if (state.players[m] && fighters[m].hp > 0)
        fighterArt(ctx, fighters[m], m, at, heights);
      unitOverlay(m, fighters[m], left, top, w, h, shakeX, shakeY, bottom);
    }
    if (canAim() && !inFlight) {
      const g = currentAim(),
        a = (g.world * Math.PI) / 180;
      ctx.save();
      ctx.setLineDash([3, 7]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff7bedd";
      ctx.beginPath();
      ctx.moveTo(g.muzzle.x, g.muzzle.y);
      ctx.lineTo(
        g.center.x + Math.cos(a) * 110,
        g.center.y - Math.sin(a) * 110,
      );
      ctx.stroke();
      ctx.restore();
    }
    if (inFlight) {
      const index = Math.max(
          0,
          (elapsed / shot.flightMs) * (shot.path.length - 1),
        ),
        i = Math.min(shot.path.length - 2, Math.floor(index)),
        t = Math.min(1, index - i),
        a = shot.path[i],
        b = shot.path[i + 1] || a,
        px = a[0] + (b[0] - a[0]) * t,
        py = a[1] + (b[1] - a[1]) * t;
      for (const [line, color] of [
        [9, "#eab84b25"],
        [4, "#fff0a799"],
      ]) {
        ctx.beginPath();
        for (let n = Math.max(0, i - 13); n <= i; n++)
          n === Math.max(0, i - 13)
            ? ctx.moveTo(...shot.path[n])
            : ctx.lineTo(...shot.path[n]);
        ctx.strokeStyle = color;
        ctx.lineWidth = line;
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#ffe07f";
      ctx.fillStyle = "#fff7be";
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (elapsed < 180 && !reducedMotion.matches) {
        const p = 1 - elapsed / 180;
        ctx.save();
        ctx.globalAlpha = p;
        const a = shot.path[0];
        polygon(
          ctx,
          [
            [a[0] - 10, a[1]],
            [a[0], a[1] - 15],
            [a[0] + 14, a[1]],
            [a[0], a[1] + 14],
          ],
          "#fff0a0",
        );
        ctx.restore();
      }
    }
    if (impact) explosion(ctx, shot, blastProgress, fighters);
    ctx.restore();
    if (impact && blastProgress < 0.2 && !reducedMotion.matches) {
      ctx.fillStyle = `rgba(255,238,174,${(0.2 - blastProgress) * 0.4})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (
      shot &&
      state.phase === "firing" &&
      elapsed >= 0 &&
      elapsed < 500 &&
      lastShot !== shot.id
    ) {
      lastShot = shot.id;
      globalThis.WebGameFeedback?.effect("shot");
    }
    if (
      shot &&
      state.phase === "firing" &&
      elapsed >= shot.flightMs &&
      elapsed < shot.flightMs + 650 &&
      impactSound !== shot.id
    ) {
      impactSound = shot.id;
      render();
      if (shot.impact.type !== "miss")
        globalThis.WebGameFeedback?.effect("hit");
    }
    const deadline =
      state.phase === "firing"
        ? shot?.endsAt
        : state.status === "setup"
          ? state.setupDeadline
          : state.turnDeadline;
    if (deadline && at >= deadline && !refreshing) {
      refreshing = true;
      refresh()
        .catch(() => {})
        .finally(() => setTimeout(() => (refreshing = false), 800));
    }
  }
  if (charge) {
    const percent = Aim.chargePercent(performance.now() - charge.at);
    $("power").value = percent;
    syncAim();
    $("fire").textContent = "THẢ";
    $("fire").dataset.hint = Math.round(percent) + "% LỰC";
  }
  requestAnimationFrame(drawFrame);
}
requestAnimationFrame(drawFrame);

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
    const running =
      state.status === "playing" &&
      state.phase === "aim" &&
      state.turn === mark;
    $("clock-" + mark).textContent = formatClock(ms);
    $("clock-" + mark).classList.toggle("running", running);
    $("clock-" + mark).classList.toggle("low", running && ms <= 60000);
  }
}
function tickTurn() {
  if (!state) return;
  const at = Date.now() + offset;
  const deadline =
    state.status === "setup" ? state.setupDeadline : state.turnDeadline;
  const seconds = deadline
    ? Math.max(0, Math.ceil((deadline - at) / 1000))
    : null;
  $("turn-clock").textContent = seconds === null ? "" : String(seconds);
  $("turn-clock").classList.toggle("urgent", seconds !== null && seconds <= 5);
  $("turn-clock").setAttribute(
    "aria-label",
    seconds === null ? "" : `${seconds} giây còn lại`,
  );
}
setInterval(tickTurn, 250);
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
  const pathId = /^\/(?:gunny\/)?room\/([a-f0-9-]{36}|[a-fA-F0-9]{8})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    await refresh();
    roomId = state.id;
    history.replaceState(null, "", `/gunny/room/${state.roomCode || roomId}`);
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
