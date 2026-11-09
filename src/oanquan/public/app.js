"use strict";
const $ = (id) => document.getElementById(id),
  API = "/api/games/oanquan";
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
  direction = null,
  drag = null,
  suppressPointerClick = false,
  rotated = false,
  orientationOwner = null,
  replay = null,
  replayFrame = null;
const cells = [],
  effects = new Set(),
  reduced = matchMedia("(prefers-reduced-motion: reduce)");
const serverNow = () => Date.now() + offset;
const animating = () => !!state?.lastMove && serverNow() < state.animationUntil;
const canAct = () =>
  !!(
    state?.me &&
    state.status === "playing" &&
    state.turn === state.me &&
    connected &&
    !pending &&
    !animating()
  );
const label = (i) =>
  i === 0
    ? "Quan trái"
    : i === 6
      ? "Quan phải"
      : i < 6
        ? String.fromCharCode(96 + i)
        : String.fromCharCode(113 - i);
const choice = () =>
  state?.legalMoves.find(
    (m) => m.pit === selected && m.direction === direction,
  );
function resetPreview() {
  if (drag?.moved) suppressPointerClick = true;
  cancelDrag();
  selected = null;
  direction = null;
}
function directionTo(i, origin = selected) {
  if (origin === null) return null;
  return [-1, 1].find((d) => (origin + d + 12) % 12 === i) ?? null;
}
function select(i) {
  if (!canAct()) return;
  if (selected === i) {
    resetPreview();
  } else if (directionTo(i) !== null) {
    direction = directionTo(i);
    commitMove();
    return;
  } else if (state.legalMoves.some((m) => m.pit === i)) {
    selected = i;
    direction = null;
  } else return;
  notice("");
  render();
}
function cancelDrag() {
  if (!drag) return;
  const gesture = drag;
  drag = null;
  if (cells[gesture.pit]?.hasPointerCapture(gesture.id))
    cells[gesture.pit].releasePointerCapture(gesture.id);
}
function pitAt(e) {
  const el = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest("[data-pit]");
  return el?.parentElement === $("board") ? Number(el.dataset.pit) : null;
}
function beginDrag(e, pit) {
  if (e.button === 0 && e.isPrimary) suppressPointerClick = false;
  if (
    e.button !== 0 ||
    !e.isPrimary ||
    !canAct() ||
    !state.legalMoves.some((m) => m.pit === pit)
  )
    return;
  drag = { id: e.pointerId, pit, x: e.clientX, y: e.clientY, moved: false };
  cells[pit].setPointerCapture(e.pointerId);
}
function moveDrag(e) {
  if (!drag || drag.id !== e.pointerId) return;
  if (!canAct()) {
    resetPreview();
    render();
    return;
  }
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8)
    return;
  drag.moved = true;
  selected = drag.pit;
  direction = directionTo(pitAt(e));
  if (e.pointerType !== "touch") e.preventDefault();
  render();
}
function endDrag(e) {
  if (!drag || drag.id !== e.pointerId) return;
  const gesture = drag,
    target = pitAt(e);
  cancelDrag();
  if (!gesture.moved) return;
  suppressPointerClick = true;
  selected = gesture.pit;
  direction = directionTo(target);
  if (canAct() && choice()) commitMove();
  else {
    resetPreview();
    render();
  }
}
function slot(i) {
  const n = (i + (rotated ? 6 : 0)) % 12,
    mobile =
      document.body.classList.contains("wg-mobile") && innerHeight > innerWidth;
  if (mobile)
    return n === 0
      ? { r: 1, c: 1, rs: 1, cs: 2 }
      : n === 6
        ? { r: 7, c: 1, rs: 1, cs: 2 }
        : n < 6
          ? { r: n + 1, c: 1, rs: 1, cs: 1 }
          : { r: 13 - n, c: 2, rs: 1, cs: 1 };
  return n === 0
    ? { r: 1, c: 1, rs: 2, cs: 1 }
    : n === 6
      ? { r: 1, c: 7, rs: 2, cs: 1 }
      : n < 6
        ? { r: 2, c: n + 1, rs: 1, cs: 1 }
        : { r: 1, c: 13 - n, rs: 1, cs: 1 };
}
function buildBoard() {
  if (cells.length) return;
  for (let i = 0; i < 12; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.pit = i;
    button.addEventListener("click", (e) => {
      if (!e.detail || !suppressPointerClick) select(i);
    });
    button.addEventListener("pointerdown", (e) => beginDrag(e, i));
    button.addEventListener("pointermove", moveDrag);
    button.addEventListener("pointerup", endDrag);
    button.addEventListener("pointercancel", () => {
      resetPreview();
      render();
    });
    button.addEventListener("lostpointercapture", () => {
      if (drag?.pit === i) {
        resetPreview();
        render();
      }
    });
    cells.push(button);
    $("board").append(button);
  }
}
function visual() {
  return replay?.view || state;
}
function visualScores() {
  const v = visual();
  return Object.fromEntries(
    ["X", "O"].map((k) => [
      k,
      v.captured[k].dan +
        10 * v.captured[k].quan -
        v.debt[k] +
        v.debt[k === "X" ? "O" : "X"],
    ]),
  );
}
function renderBoard() {
  if (!state) return;
  buildBoard();
  const v = visual();
  for (let i = 0; i < 12; i++) {
    const el = cells[i],
      p = v.pits[i],
      s = slot(i),
      own = state.me && (state.me === "X" ? i > 0 && i < 6 : i > 6),
      target = canAct() && directionTo(i) !== null,
      legal = canAct() && state.legalMoves.some((m) => m.pit === i);
    el.style.gridRow = s.r + " / span " + s.rs;
    el.style.gridColumn = s.c + " / span " + s.cs;
    // Preserve the current transient effect when asynchronous snapshots arrive.
    const transient = ["capture-hit", "sow-hit", "pickup-hit"].filter((c) =>
      el.classList.contains(c),
    );
    el.className =
      "pit" +
      (i === 0 || i === 6 ? " quan-pit" : i < 6 ? " home-x" : " home-o") +
      (legal ? " legal" : "") +
      (target ? " direction-option" : "") +
      (selected === i ? " selected" : "") +
      (!replay && state.lastMove?.touched.includes(i) ? " recent" : "");
    if (
      selected !== null &&
      direction !== null &&
      (selected + direction + 12) % 12 === i
    )
      el.classList.add("direction-target");
    for (const cls of transient) el.classList.add(cls);
    el.setAttribute("aria-disabled", String(!legal && !target));
    el.setAttribute("aria-pressed", String(selected === i));
    el.setAttribute(
      "aria-label",
      label(i) +
        ": " +
        p.dan +
        " dân" +
        (p.quan ? ", 1 quan" : "") +
        (own ? ", ô của bạn" : "") +
        (target ? ", chọn để rải theo hướng này ngay" : ""),
    );
    if (el.dataset.contents !== p.dan + ":" + p.quan) {
      el.dataset.contents = p.dan + ":" + p.quan;
      el.replaceChildren();
      const title = document.createElement("span"),
        pile = document.createElement("span"),
        count = document.createElement("span");
      title.className = "pit-label";
      title.textContent = label(i);
      pile.className = "stones";
      pile.setAttribute("aria-hidden", "true");
      if (p.quan) {
        const q = document.createElement("span");
        q.className = "mandarin";
        pile.append(q);
      }
      for (let n = 0; n < Math.min(p.dan, 24); n++) {
        const stone = document.createElement("i");
        stone.className = "pebble";
        stone.style.setProperty("--tilt", ((n * 47) % 100) - 50 + "deg");
        pile.append(stone);
      }
      count.className = "pit-count";
      count.textContent = p.dan + (p.quan ? " + Q" : "");
      el.append(title, pile, count);
    }
  }
}
function pulse(el, cls) {
  if (!el || reduced.matches) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), {
    once: true,
  });
}
function flight(from, to, capture = false) {
  if (!from || !to || reduced.matches || document.hidden) return;
  const a = from.getBoundingClientRect(),
    b = to.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const dot = document.createElement("span");
  dot.className = "stone-flight";
  dot.setAttribute("aria-hidden", "true");
  dot.style.left = a.left + a.width / 2 + "px";
  dot.style.top = a.top + a.height / 2 + "px";
  document.body.append(dot);
  effects.add(dot);
  const dx = b.left + b.width / 2 - a.left - a.width / 2,
    dy = b.top + b.height / 2 - a.top - a.height / 2;
  const animation = dot.animate(
    [
      { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
      {
        transform:
          "translate(" + dx / 2 + "px," + (dy / 2 - 22) + "px) scale(1.25)",
        opacity: 1,
      },
      {
        transform: "translate(" + dx + "px," + dy + "px) scale(.7)",
        opacity: 0.4,
      },
    ],
    { duration: capture ? 450 : 170, easing: "ease-out" },
  );
  const remove = () => {
    dot.remove();
    effects.delete(dot);
  };
  animation.onfinish = remove;
  animation.oncancel = remove;
}
function applyStep(step, fx) {
  const v = replay.view,
    p = step.pit != null ? v.pits[step.pit] : null;
  if (step.type === "pickup") {
    replay.hand = step.dan;
    p.dan = 0;
    replay.origin = step.pit;
    replay.caption = "Bốc " + step.dan + " dân từ " + label(step.pit);
    if (fx) {
      pulse(cells[step.pit], "pickup-hit");
      for (let n = 0; n < Math.min(3, step.dan); n++)
        flight(cells[step.pit], $("hand-release"));
    }
  }
  if (step.type === "sow") {
    p.dan++;
    replay.hand = step.hand;
    replay.caption =
      "Rải vào " + label(step.pit) + " · Còn " + step.hand + " dân trên tay";
    if (fx) {
      pulse(cells[step.pit], "sow-hit");
    }
    replay.origin = step.pit;
  }
  if (step.type === "capture" || step.type === "collect") {
    v.captured[step.mark].dan += step.dan;
    v.captured[step.mark].quan += step.quan;
    p.dan = 0;
    p.quan = 0;
    replay.caption =
      (step.type === "capture"
        ? "Đập " + label(step.gap) + " → Ăn "
        : "Thu quân · ") +
      label(step.pit) +
      " · " +
      step.dan +
      " dân" +
      (step.quan ? " + 1 quan" : "");
    if (fx) {
      pulse(cells[step.pit], "capture-hit");
      flight(cells[step.pit], $("bank-" + step.mark), true);
      pulse($("bank-" + step.mark), "bank-hit");
    }
  }
  if (step.type === "refill") {
    v.captured[step.mark].dan -= step.own;
    const lender = step.mark === "X" ? "O" : "X";
    v.captured[lender].dan -= step.loan;
    v.debt[step.mark] += step.loan;
    replay.hand = 5;
    replay.caption =
      "Rải lại 5 dân" +
      (step.loan ? " · Vay " + step.loan + " dân" : " từ kho");
  }
  if (step.type === "seed") {
    p.dan = 1;
    replay.hand--;
    if (fx) {
      pulse(cells[step.pit], "sow-hit");
    }
  }
}
// All poses and landings follow server time, including reconnects and background tabs.
const settlePhase = (step) =>
  ({
    pickup: 0.62,
    sow: 0.9,
    capture: 0.94,
    collect: 0.94,
    refill: 0.55,
    seed: 0.9,
  })[step.type] ?? 0;
function stepDuration(m, i) {
  return (m.steps[i + 1]?.offset ?? m.duration) - m.steps[i].offset;
}
const clamp = (n) => Math.max(0, Math.min(1, n));
const mix = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
function point(el, raised = true) {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2 - (raised ? 26 : 0),
  };
}
function stepEnd(step) {
  return step.type === "capture" ||
    step.type === "collect" ||
    step.type === "refill"
    ? $("bank-" + step.mark)
    : cells[step.pit];
}
function hideHand() {
  $("sowing-hand").hidden = true;
  $("sowing-stone").hidden = true;
  for (const el of effects) {
    for (const animation of el.getAnimations()) animation.cancel();
    el.remove();
  }
  effects.clear();
}
function renderHand(m, elapsed) {
  const hand = $("sowing-hand"),
    stone = $("sowing-stone");
  if (document.hidden) {
    hideHand();
    return;
  }
  while (
    replay.motionIndex + 1 < m.steps.length &&
    m.steps[replay.motionIndex + 1].offset <= elapsed
  )
    replay.motionIndex++;
  const i = replay.motionIndex,
    step = m.steps[i];
  if (!step) return;
  if (replay.captionIndex !== i) {
    replay.captionIndex = i;
    replay.caption =
      step.type === "pickup"
        ? "Gom " + step.dan + " dân từ " + label(step.pit)
        : step.type === "sow" || step.type === "seed"
          ? "Rải từng viên vào " + label(step.pit)
          : step.type === "capture"
            ? "Đập " + label(step.gap) + " → Gom quân ở " + label(step.pit)
            : step.type === "collect"
              ? "Thu quân ở " + label(step.pit) + " về kho"
              : "Lấy 5 dân để rải lại";
    $("instruction").textContent = replay.caption;
    $("last-action").textContent = replay.caption;
  }
  const t = clamp((elapsed - step.offset) / stepDuration(m, i)),
    target = point(stepEnd(step)),
    from = i ? point(stepEnd(m.steps[i - 1])) : target;
  let pos = target,
    curl = 1,
    pose = "holding",
    tilt = 0,
    lift = 0;
  if (step.type === "pickup") {
    pos = mix(from, target, clamp(t / 0.3));
    curl = clamp((t - 0.25) / 0.4);
    lift = -Math.sin(clamp((t - 0.3) / 0.7) * Math.PI) * 9;
    pose = t < 0.7 ? "gathering" : "holding";
  } else if (step.type === "sow" || step.type === "seed") {
    const travel = clamp(t / 0.62),
      eased = travel * travel * (3 - 2 * travel);
    pos = mix(from, target, eased);
    lift = -Math.sin(travel * Math.PI) * (reduced.matches ? 0 : 15);
    curl =
      t < 0.62
        ? 1
        : t < 0.78
          ? 1 - (t - 0.62) / 0.16
          : clamp((t - 0.85) / 0.15);
    pose = t < 0.62 ? "holding" : "sowing";
    tilt = t > 0.62 ? -12 * Math.sin(((t - 0.62) / 0.38) * Math.PI) : 0;
    if (t >= 0.64 && t < 0.9 && !reduced.matches) {
      const fall = (t - 0.64) / 0.26,
        release = { x: target.x - 8, y: target.y + 14 },
        landing = point(cells[step.pit], false),
        p = mix(release, landing, fall);
      stone.hidden = false;
      stone.style.left = p.x + "px";
      stone.style.top = p.y - Math.sin(fall * Math.PI) * 7 + "px";
      stone.style.transform =
        "translate(-50%,-50%) rotate(" + fall * 90 + "deg)";
    } else stone.hidden = true;
  } else if (step.type === "capture") {
    const gap = point(cells[step.gap]),
      pile = point(cells[step.pit]);
    if (t < 0.4) {
      pos = mix(from, gap, clamp(t / 0.22));
      curl = 0;
      pose = "tapping";
      lift = t > 0.22 ? 24 * Math.sin(((t - 0.22) / 0.18) * Math.PI) : 0;
      if (replay.hitIndex !== i && t >= 0.28) {
        replay.hitIndex = i;
        if (t < 0.4) pulse(cells[step.gap], "capture-hit");
      }
    } else if (t < 0.8) {
      pos = mix(gap, pile, clamp((t - 0.4) / 0.2));
      curl = clamp((t - 0.6) / 0.2);
      pose = "gathering";
    } else {
      pos = mix(pile, target, clamp((t - 0.8) / 0.2));
      pose = "carrying";
    }
  } else if (step.type === "collect") {
    const pile = point(cells[step.pit]);
    pos =
      t < 0.65
        ? mix(from, pile, clamp(t / 0.3))
        : mix(pile, target, clamp((t - 0.65) / 0.35));
    curl = clamp((t - 0.3) / 0.3);
    pose = t < 0.65 ? "gathering" : "carrying";
  } else {
    pos = mix(from, target, clamp(t / 0.4));
    pose = "gathering";
  }
  if (step.type !== "sow" && step.type !== "seed") stone.hidden = true;
  if (reduced.matches) {
    pos = target;
    lift = 0;
    tilt = 0;
  }
  hand.hidden = false;
  hand.dataset.pose = pose;
  hand.dataset.step = step.type;
  hand.style.left = pos.x + "px";
  hand.style.top = pos.y + lift + "px";
  hand.style.setProperty("--curl", curl);
  hand.style.setProperty("--hand-tilt", tilt + "deg");
  const carrying =
      (step.type === "capture" && t >= 0.78) ||
      (step.type === "collect" && t >= 0.6),
    load = carrying ? step.dan + step.quan : replay.hand;
  $("hand-load").textContent = load;
  hand.classList.toggle("loaded", load > 0);
}
function replayTick() {
  cancelAnimationFrame(replayFrame);
  replayFrame = null;
  if (!replay) return;
  const m = state.lastMove,
    elapsed = serverNow() - m.at;
  let changed = false;
  while (replay.index < m.steps.length) {
    const step = m.steps[replay.index],
      landing = step.offset + stepDuration(m, replay.index) * settlePhase(step);
    if (elapsed < landing) break;
    applyStep(step, elapsed - landing < 180 && !document.hidden);
    replay.index++;
    changed = true;
  }
  if (serverNow() >= state.animationUntil) {
    replay = null;
    hideHand();
    WebGameFeedback.update("oanquan", state);
    render();
    return;
  }
  if (changed) render();
  renderHand(m, elapsed);
  replayFrame = requestAnimationFrame(replayTick);
}
function moveText(m) {
  if (!m) return "Chưa có lượt rải.";
  return (
    "Lượt " +
    m.ply +
    " · " +
    state.playerLabels[m.mark] +
    " · " +
    label(m.pit) +
    " · " +
    (m.direction === 1 ? "Thuận vòng" : "Ngược vòng") +
    " · " +
    (m.gained >= 0 ? "+" : "") +
    m.gained +
    " điểm"
  );
}
const reasons = {
  all_quan: "Hai quan đã bị ăn. Thu quân và quyết toán nợ.",
  no_supply: "Không đủ dân để rải lại. Chốt điểm còn lại.",
  repetition: "Lặp thế ba lần. Chốt điểm.",
  move_limit: "Đạt 500 lượt. Chốt điểm.",
  timeout: "Hết thời gian trên đồng hồ.",
  resign: "Một người chơi đầu hàng.",
  expired: "Phòng chờ hết hạn sau 10 phút.",
  cancelled: "Chủ phòng đã hủy.",
};
function render() {
  if (!state) return;
  const playing = state.status === "playing",
    waiting = state.status === "waiting",
    running = !!replay,
    scores = visualScores();
  $("room-code").textContent = state.id.slice(0, 8).toUpperCase();
  $("move-count").textContent = state.ply + " lượt";
  $("rules-detail").textContent = state.rulesLabel;
  $("status-title").textContent = running
    ? "Đang rải / ăn quân"
    : waiting
      ? "Đang chờ đối thủ"
      : playing
        ? "Lượt " + state.playerLabels[state.turn]
        : state.winner
          ? state.players[state.winner] + " chiến thắng!"
          : state.reason === "draw"
            ? "Hai bên hòa nhau"
            : "Phòng đã đóng";
  $("status-detail").textContent = running
    ? "Đồng hồ tạm dừng trong lúc rải quân."
    : waiting
      ? "Đồng hồ bắt đầu khi đối thủ tham gia."
      : playing
        ? state.me
          ? "Bạn chơi bên " + state.playerLabels[state.me]
          : "Khán giả · Xem trực tiếp"
        : reasons[state.endReason] || "";
  $("board-state").textContent = $("status-title").textContent;
  for (const mark of ["X", "O"]) {
    $("name-" + mark).textContent = state.players[mark] || "Đang chờ đối thủ";
    $("you-" + mark).hidden = mark !== state.me;
    $("role-" + mark).textContent = state.playerLabels[mark];
    $("player-" + mark).dataset.side = state.sideBySeat[mark];
    $("player-" + mark).classList.toggle(
      "active",
      playing && state.turn === mark && !running,
    );
    $("score-" + mark).textContent =
      scores[mark] +
      " điểm · " +
      visual().captured[mark].dan +
      " dân, " +
      visual().captured[mark].quan +
      " quan";
    $("bank-" + mark).textContent =
      state.playerLabels[mark] + " · " + scores[mark] + " điểm";
  }
  $("hand-counter").textContent = running
    ? "Trên tay: " + replay.hand + " dân"
    : "1 quan = 10 điểm";
  $("instruction").textContent = running
    ? replay.caption
    : !playing
      ? reasons[state.endReason] || "Chờ đối thủ tham gia."
      : !state.me
        ? "Khán giả đang xem trực tiếp."
        : !canAct()
          ? pending
            ? "Đang xác nhận…"
            : "Chờ lượt của bạn."
          : selected === null
            ? "Kéo ô dân sang ô liền kề, hoặc chọn ô rồi chọn ô liền kề để rải ngay."
            : "Đã chọn " +
              label(selected) +
              " · Chọn ô liền kề để rải ngay. Bấm lại hoặc chuột phải để hủy.";
  $("last-action").textContent = running
    ? replay.caption
    : moveText(state.lastMove);
  const history = $("move-history");
  if (history.dataset.ply !== String(state.ply)) {
    history.dataset.ply = state.ply;
    history.replaceChildren();
    for (const m of [...state.history].reverse()) {
      const li = document.createElement("li");
      li.textContent = moveText(m);
      history.append(li);
    }
    $("history-count").textContent = state.ply + " lượt rải";
  }
  $("debt-detail").textContent =
    "Nợ dân · Xanh: " +
    state.debt.X +
    " · Cam: " +
    state.debt.O +
    ". Điểm đã tính khoản vay.";
  $("connect-player").hidden = !!state.me || !(playing || waiting);
  $("pair-panel").hidden = !!state.me || !pairVisible;
  $("leave").hidden = !state.me || !(playing || waiting);
  $("leave").textContent = waiting ? "Hủy phòng" : "Đầu hàng";
  WebGamePlayers.render(state);
  WebGameBoardUI.renderRules("oanquan", state);
  WebGameMobile.update("oanquan", state);
  renderBoard();
  updateClock();
}
$("rotate-board").addEventListener("click", () => {
  resetPreview();
  rotated = !rotated;
  $("rotate-board").setAttribute("aria-pressed", String(rotated));
  render();
});
document.addEventListener("contextmenu", (e) => {
  if (selected === null && !drag && !e.target.closest("#board")) return;
  e.preventDefault();
  suppressPointerClick = true;
  resetPreview();
  notice("");
  render();
});
async function commitMove() {
  if (!canAct() || !choice()) return;
  const data = { roomId, version: state.version, pit: selected, direction };
  pending = true;
  resetPreview();
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
}
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
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    resetPreview();
    hideHand();
  } else if (replay) replayTick();
});
window.addEventListener("blur", () => {
  resetPreview();
  if (state) render();
});
window.addEventListener("resize", () => {
  if (state) requestAnimationFrame(renderBoard);
});
function accept(next) {
  if (
    state &&
    next.id === state.id &&
    (next.version < state.version ||
      (next.version === state.version &&
        next.me === state.me &&
        next.serverNow <= state.serverNow))
  )
    return;
  if (
    !state ||
    state.version !== next.version ||
    state.me !== next.me ||
    state.id !== next.id
  )
    resetPreview();
  if (orientationOwner !== next.me) {
    orientationOwner = next.me;
    rotated = next.me === "O";
    $("rotate-board").setAttribute("aria-pressed", String(rotated));
  }
  if (state && state.status !== next.status) $("leave-dialog").close();
  state = next;
  offset = next.serverNow - Date.now();
  if (next.lastMove && serverNow() < next.animationUntil) {
    if (replay?.ply !== next.ply) {
      replay = {
        ply: next.ply,
        view: structuredClone(next.lastMove.before),
        index: 0,
        motionIndex: 0,
        hitIndex: -1,
        hand: 0,
        origin: next.lastMove.pit,
        caption: "Bắt đầu rải quân…",
      };
    }
  } else {
    replay = null;
    hideHand();
    cancelAnimationFrame(replayFrame);
    WebGameFeedback.update("oanquan", next);
  }
  if (!["waiting", "playing"].includes(state.status)) {
    clearTimeout(pairTimer);
    pairing = false;
    pairVisible = false;
    pairingToken = null;
    pairAttempt++;
    clearStoredPairing();
  }
  render();
  if (replay) replayTick();
}
function notice(message) {
  $("notice").textContent = message || "";
  $("notice").hidden = !message;
}
function connection(ok) {
  connected = ok;
  if (!ok) resetPreview();
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
  const pathId = /^\/(?:oanquan\/)?room\/([a-f0-9-]{36})$/.exec(
    location.pathname,
  )?.[1];
  if (!ticket && !pathId) return;
  connection(false);
  try {
    roomId = ticket ? (await api("/api/login", { ticket })).roomId : pathId;
    history.replaceState(null, "", `/oanquan/room/${roomId}`);
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
