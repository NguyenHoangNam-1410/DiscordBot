"use strict";
const { ROWS, isQuan, normalizeRules } = require("./rules");
const other = (s) => (s === "X" ? "O" : "X");
const next = (i, d) => (i + d + 12) % 12;
const count = (p) => p.dan + p.quan;
function createState(first = "X") {
  const s = {
    pits: Array.from({ length: 12 }, (_, i) => ({
      dan: isQuan(i) ? 0 : 5,
      quan: isQuan(i) ? 1 : 0,
    })),
    captured: { X: { dan: 0, quan: 0 }, O: { dan: 0, quan: 0 } },
    debt: { X: 0, O: 0 },
    turn: first,
    ply: 0,
    repetitions: {},
  };
  s.repetitions[JSON.stringify([s.pits, s.captured, s.debt, s.turn])] = 1;
  return s;
}
function scores(s) {
  return Object.fromEntries(
    ["X", "O"].map((k) => [
      k,
      s.captured[k].dan +
        10 * s.captured[k].quan -
        s.debt[k] +
        s.debt[other(k)],
    ]),
  );
}
function moveError(s, mark, pit, direction) {
  if (s.turn !== mark) return "NOT_TURN";
  if (!Number.isInteger(pit) || !ROWS[mark].includes(pit)) return "NOT_OWN_PIT";
  if (direction !== 1 && direction !== -1) return "INVALID_DIRECTION";
  if (s.pits[pit].dan === 0) return "EMPTY_PIT";
  return null;
}
function legalMoves(s) {
  return ROWS[s.turn]
    .filter((i) => s.pits[i].dan > 0)
    .flatMap((pit) => [-1, 1].map((direction) => ({ pit, direction })));
}
function applyMove(input, { pit, direction }, inputRules = {}) {
  const error = moveError(input, input.turn, pit, direction);
  if (error) throw Object.assign(new Error(error), { code: error });
  const s = structuredClone(input),
    rules = normalizeRules(inputRules),
    mark = s.turn,
    steps = [],
    before = structuredClone(input),
    touched = new Set();
  const record = (type, data = {}) => steps.push({ type, ...data });
  function capture(i, seat, type = "capture", gap = null) {
    const taken = { ...s.pits[i] };
    s.captured[seat].dan += taken.dan;
    s.captured[seat].quan += taken.quan;
    s.pits[i] = { dan: 0, quan: 0 };
    touched.add(i);
    record(type, { pit: i, mark: seat, gap, ...taken });
  }
  let current = pit,
    stopReason = "quan",
    loop = new Set();
  while (true) {
    const key = JSON.stringify([current, s.pits]);
    if (loop.has(key) || loop.size >= 1024) {
      stopReason = "relay_loop";
      break;
    }
    loop.add(key);
    let hand = s.pits[current].dan;
    s.pits[current].dan = 0;
    touched.add(current);
    record("pickup", { pit: current, dan: hand, mark });
    while (hand > 0) {
      current = next(current, direction);
      s.pits[current].dan++;
      hand--;
      touched.add(current);
      record("sow", { pit: current, hand, mark });
    }
    const adjacent = next(current, direction);
    if (isQuan(adjacent)) {
      stopReason = "quan";
      break;
    }
    if (count(s.pits[adjacent]) > 0) {
      current = adjacent;
      continue;
    }
    let gap = adjacent;
    while (true) {
      const target = next(gap, direction);
      if (count(s.pits[target]) === 0) {
        stopReason = "double_empty";
        break;
      }
      if (
        s.pits[target].quan &&
        !rules.allowYoungQuan &&
        s.pits[target].dan < 5
      ) {
        stopReason = "young_quan";
        break;
      }
      capture(target, mark, "capture", gap);
      if (!s.pits.some((p) => p.quan)) {
        stopReason = "all_quan";
        break;
      }
      gap = next(target, direction);
      if (isQuan(gap) || count(s.pits[gap]) > 0) {
        stopReason = "capture_end";
        break;
      }
    }
    break;
  }
  s.ply++;
  s.turn = other(mark);
  let reason = null;
  if (!s.pits.some((p) => p.quan)) reason = "all_quan";
  // Refill only the next player's empty row. Loans transfer real citizens; debt is settled at scoring.
  if (!reason && ROWS[s.turn].every((i) => s.pits[i].dan === 0)) {
    const seat = s.turn,
      lender = other(seat),
      own = Math.min(5, s.captured[seat].dan),
      loan = 5 - own;
    if (s.captured[lender].dan < loan) reason = "no_supply";
    else {
      s.captured[seat].dan -= own;
      s.captured[lender].dan -= loan;
      s.debt[seat] += loan;
      record("refill", { mark: seat, own, loan });
      for (const i of ROWS[seat]) {
        s.pits[i].dan = 1;
        touched.add(i);
        record("seed", { pit: i, mark: seat });
      }
    }
  }
  const position = JSON.stringify([s.pits, s.captured, s.debt, s.turn]);
  s.repetitions[position] = (s.repetitions[position] || 0) + 1;
  if (!reason && s.repetitions[position] >= 3) reason = "repetition";
  if (!reason && s.ply >= 500) reason = "move_limit";
  if (reason) {
    for (const seat of ["X", "O"])
      for (const i of ROWS[seat])
        if (count(s.pits[i])) capture(i, seat, "collect");
    // Neutral end pits: left belongs to host, right to guest only for final collection.
    for (const [i, seat] of [
      [0, "X"],
      [6, "O"],
    ])
      if (count(s.pits[i])) capture(i, seat, "collect");
  }
  const totals = scores(s),
    winner = reason
      ? totals.X === totals.O
        ? null
        : totals.X > totals.O
          ? "X"
          : "O"
      : null;
  // Keep a full second per pit; the server pauses both clocks for this timeline.
  const weights = {
    pickup: 1000,
    sow: 1000,
    capture: 1800,
    refill: 1000,
    seed: 1000,
    collect: 1100,
  };
  let duration = 0;
  for (const step of steps) {
    step.offset = duration;
    duration += weights[step.type];
  }
  return {
    state: s,
    reason,
    winner,
    move: {
      mark,
      pit,
      direction,
      ply: s.ply,
      before: {
        pits: before.pits,
        captured: before.captured,
        debt: before.debt,
      },
      steps,
      duration,
      stopReason,
      touched: [...touched],
      gained:
        s.captured[mark].dan -
        before.captured[mark].dan +
        10 * (s.captured[mark].quan - before.captured[mark].quan),
    },
  };
}
module.exports = { createState, scores, moveError, legalMoves, applyMove };
