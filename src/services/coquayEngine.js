// Lõi luật Cò quay Nga (kiểu Buckshot Roulette): thuần logic, không đụng DB/Discord, RNG được truyền vào.
const MAX_HP = 3;
const STAGES = Object.freeze([
  [2, 3],
  [4, 5],
  [6, 8],
]);
const SIDES = Object.freeze(["player", "bot"]);
const other = (side) => (side === "player" ? "bot" : "player");

function stageRange(loadNumber) {
  return STAGES[Math.min(STAGES.length, Math.max(1, loadNumber)) - 1];
}
function remaining(state) {
  const live = state.chamber.filter(Boolean).length;
  return {
    live,
    blank: state.chamber.length - live,
    total: state.chamber.length,
  };
}
function createState(stake) {
  return {
    stake,
    hp: { player: MAX_HP, bot: MAX_HP },
    turn: "player",
    chamber: [],
    loads: 0,
    lastLoad: null,
    saw: false,
    shield: { player: false, bot: false },
    cuffed: null,
    peek: null,
    history: [],
    status: "playing",
  };
}
// Mỗi đợt nạp luôn có ít nhất 1 đạn thật và 1 đạn lép.
function loadChamber(state, rng) {
  const loadNumber = state.loads + 1;
  const [min, max] = stageRange(loadNumber);
  const size = min + rng(max - min + 1, `load-size-${loadNumber}`);
  const live = 1 + rng(size - 1, `load-live-${loadNumber}`);
  const shells = [...Array(live).fill(true), ...Array(size - live).fill(false)];
  for (let index = shells.length - 1; index > 0; index -= 1) {
    const target = rng(index + 1, `load-shuffle-${loadNumber}-${index}`);
    [shells[index], shells[target]] = [shells[target], shells[index]];
  }
  state.chamber = shells;
  state.loads = loadNumber;
  state.lastLoad = { live, blank: size - live };
  state.peek = null;
  return state.lastLoad;
}
function shoot(
  state,
  shooter,
  target,
  rng,
  reload = (current) => loadChamber(current, rng),
) {
  if (state.status !== "playing") throw new Error("GAME_OVER");
  if (state.turn !== shooter || !SIDES.includes(target))
    throw new Error("NOT_YOUR_TURN");
  const live = state.chamber.shift();
  const sawed = state.saw;
  state.saw = false;
  state.peek = null;
  let damage = live ? (sawed ? 2 : 1) : 0;
  let blocked = 0;
  if (damage && target !== shooter && state.shield[target]) {
    state.shield[target] = false;
    blocked = 1;
    damage -= 1;
  }
  state.hp[target] = Math.max(0, state.hp[target] - damage);
  const entry = {
    shooter,
    target,
    live,
    sawed,
    damage,
    blocked,
    cuffSkip: false,
    reloaded: null,
  };
  // Tự bắn đạn lép thì giữ lượt; mọi trường hợp khác súng sang tay đối phương (trừ khi đối phương đang bị còng).
  let next = target === shooter && !live ? shooter : other(shooter);
  if (next !== shooter && state.cuffed === next) {
    state.cuffed = null;
    next = shooter;
    entry.cuffSkip = true;
  }
  state.turn = next;
  if (state.hp[target] <= 0)
    state.status = target === "player" ? "lost" : "won";
  else if (!state.chamber.length) entry.reloaded = reload(state);
  state.history.push(entry);
  if (state.history.length > 12) state.history.shift();
  return entry;
}
const ITEM_KEYS = Object.freeze(["magnifier", "shield", "saw", "cuffs"]);
function canUseItem(state, side, key) {
  if (state.status !== "playing" || state.turn !== side) return false;
  if (key === "magnifier") return state.peek === null;
  if (key === "shield") return !state.shield[side];
  if (key === "saw") return !state.saw;
  if (key === "cuffs") return state.cuffed === null;
  return false;
}
function applyItem(state, side, key) {
  if (!canUseItem(state, side, key)) throw new Error("ITEM_UNAVAILABLE");
  if (key === "magnifier") {
    state.peek = state.chamber[0];
    return { key, live: state.peek };
  }
  if (key === "shield") state.shield[side] = true;
  else if (key === "saw") state.saw = true;
  else if (key === "cuffs") state.cuffed = other(side);
  return { key };
}
// Xác suất người chơi thắng ở mọi trạng thái công khai (máu, số đạn thật/lép còn lại, lượt, đợt nạp kế tiếp),
// giải bằng lặp giá trị: người chơi tối đa hóa, bot tối thiểu hóa. Không dùng vật phẩm.
let solved = null;
const keyOf = (hpP, hpB, live, blank, turn, stage) =>
  `${hpP}:${hpB}:${live}:${blank}:${turn}:${stage}`;
function loadOutcomes(stage) {
  const [min, max] = stageRange(stage);
  const outcomes = [];
  for (let size = min; size <= max; size += 1)
    for (let live = 1; live < size; live += 1)
      outcomes.push({
        live,
        blank: size - live,
        weight: 1 / (max - min + 1) / (size - 1),
      });
  return outcomes;
}
function solve() {
  if (solved) return solved;
  const values = new Map();
  const value = (hpP, hpB, live, blank, turn, stage) => {
    if (hpP <= 0) return 0;
    if (hpB <= 0) return 1;
    if (!live && !blank)
      return loadOutcomes(stage).reduce(
        (sum, item) =>
          sum +
          item.weight *
            (values.get(
              keyOf(
                hpP,
                hpB,
                item.live,
                item.blank,
                turn,
                Math.min(3, stage + 1),
              ),
            ) ?? 0.5),
        0,
      );
    return values.get(keyOf(hpP, hpB, live, blank, turn, stage)) ?? 0.5;
  };
  const actionValue = (hpP, hpB, live, blank, turn, stage, target) => {
    const total = live + blank;
    let result = 0;
    if (live) {
      const nP = target === "player" ? hpP - 1 : hpP;
      const nB = target === "bot" ? hpB - 1 : hpB;
      result +=
        (live / total) * value(nP, nB, live - 1, blank, other(turn), stage);
    }
    if (blank)
      result +=
        (blank / total) *
        value(
          hpP,
          hpB,
          live,
          blank - 1,
          target === turn ? turn : other(turn),
          stage,
        );
    return result;
  };
  for (let iteration = 0; iteration < 200; iteration += 1) {
    let delta = 0;
    for (let stage = 1; stage <= 3; stage += 1)
      for (let hpP = 1; hpP <= MAX_HP; hpP += 1)
        for (let hpB = 1; hpB <= MAX_HP; hpB += 1)
          for (let live = 0; live <= 7; live += 1)
            for (let blank = 0; blank <= 7; blank += 1)
              for (const turn of SIDES) {
                if (!live && !blank) continue;
                const shootPlayer = actionValue(
                  hpP,
                  hpB,
                  live,
                  blank,
                  turn,
                  stage,
                  "player",
                );
                const shootBot = actionValue(
                  hpP,
                  hpB,
                  live,
                  blank,
                  turn,
                  stage,
                  "bot",
                );
                const next =
                  turn === "player"
                    ? Math.max(shootPlayer, shootBot)
                    : Math.min(shootPlayer, shootBot);
                const key = keyOf(hpP, hpB, live, blank, turn, stage);
                delta = Math.max(
                  delta,
                  Math.abs(next - (values.get(key) ?? 0.5)),
                );
                values.set(key, next);
              }
    if (delta < 1e-9) break;
  }
  solved = { values, actionValue, value };
  return solved;
}
function stateTuple(state) {
  const { live, blank } = remaining(state);
  return [
    Math.max(0, state.hp.player),
    Math.max(0, state.hp.bot),
    live,
    blank,
    state.turn,
    Math.min(3, state.loads + 1),
  ];
}
function playerWinChance(state) {
  return solve().value(...stateTuple(state));
}
// Bot chỉ biết số đạn thật/lép còn lại (thông tin công khai), không nhìn viên đang lên nòng, và luôn chọn nước tối ưu.
function botTarget(state, rng) {
  const { live, blank } = remaining(state);
  if (!blank) return "player";
  if (!live) return "bot";
  const [hpP, hpB, , , , stage] = stateTuple(state);
  const { actionValue } = solve();
  const atPlayer = actionValue(hpP, hpB, live, blank, "bot", stage, "player");
  const atSelf = actionValue(hpP, hpB, live, blank, "bot", stage, "bot");
  if (Math.abs(atPlayer - atSelf) < 1e-9)
    return rng(2, "bot-coin") ? "player" : "bot";
  return atPlayer < atSelf ? "player" : "bot";
}
function bestPlayerTarget(state) {
  const [hpP, hpB, live, blank, , stage] = stateTuple(state);
  const { actionValue } = solve();
  return actionValue(hpP, hpB, live, blank, "player", stage, "bot") >=
    actionValue(hpP, hpB, live, blank, "player", stage, "player")
    ? "bot"
    : "player";
}

module.exports = {
  MAX_HP,
  STAGES,
  ITEM_KEYS,
  other,
  stageRange,
  remaining,
  createState,
  loadChamber,
  shoot,
  canUseItem,
  applyItem,
  botTarget,
  bestPlayerTarget,
  playerWinChance,
  solve,
};
