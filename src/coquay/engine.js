"use strict";
// Web-only Buckshot 1v1 + Double or Nothing items; keep the shared Survival shooting core unchanged.
const core = require("../services/coquayEngine");
const sideOf = (mark) => (mark === "X" ? "player" : "bot");
const markOf = (side) => (side === "player" ? "X" : "O");
const ITEM_SET_VERSION = 2;
const ITEMS = Object.freeze([
  {
    id: "magnifier",
    name: "Kính lúp",
    englishName: "Magnifying Glass",
    description: "Xem kín viên hiện tại trong nòng. Không mất lượt.",
  },
  {
    id: "saw",
    name: "Cưa cầm tay",
    englishName: "Hand Saw",
    description:
      "Viên hiện tại gây 2 sát thương nếu là đạn thật, kể cả tự bắn. Hiệu ứng mất khi bắn hoặc dùng bia loại viên này.",
  },
  {
    id: "cuffs",
    name: "Còng tay",
    englishName: "Handcuffs",
    description:
      "Đối thủ bỏ qua lượt kế tiếp khi súng chuyển sang họ. Mỗi lượt liên tục của bạn chỉ dùng một còng; không cộng dồn.",
  },
  {
    id: "cigarettes",
    name: "Gói thuốc lá · +1 HP",
    englishName: "Cigarette Pack",
    description:
      "Hồi 1 HP, không vượt HP tối đa. Dùng lúc đầy HP vẫn tiêu món này; không mất lượt.",
  },
  {
    id: "beer",
    name: "Lon bia",
    englishName: "Beer",
    description:
      "Loại viên hiện tại khỏi nòng và công bố thật/lép. Giữ lượt, bỏ hiệu ứng cưa; hết đạn sẽ nạp hiệp mới.",
  },
  {
    id: "inverter",
    name: "Bộ đảo đạn",
    englishName: "Inverter",
    description:
      "Đảo viên hiện tại: thật ↔ lép. Giữ lượt; thông tin bạn đã biết về viên đó được cập nhật theo lần đảo.",
  },
  {
    id: "adrenaline",
    name: "Adrenaline",
    englishName: "Adrenaline",
    description:
      "Chọn một đạo cụ của đối thủ để cướp và dùng ngay cho bạn, không chiếm ô túi. Không cướp Adrenaline hoặc món chưa thể dùng.",
  },
  {
    id: "phone",
    name: "Điện thoại dùng một lần",
    englishName: "Burner Phone",
    description:
      "Cho riêng bạn biết vị trí và loại một viên ngẫu nhiên sau viên hiện tại. Chỉ còn một viên thì không dự đoán được nhưng vẫn tiêu điện thoại.",
  },
  {
    id: "expired_medicine",
    name: "Thuốc hết hạn",
    englishName: "Expired Medicine",
    description:
      "50% hồi 2 HP (tối đa HP của bàn), 50% mất 1 HP. Có thể chết vì dùng thuốc. Không mất lượt nếu còn sống.",
  },
]);
const catalog = new Set(ITEMS.map((i) => i.id));
function error(code) {
  throw Object.assign(new Error(code), { code });
}
function upgrade(s) {
  if (s.itemSetVersion === ITEM_SET_VERSION) return false;
  const convert = (values) =>
    (values || [])
      .map((id) => (id === "medicine" ? "cigarettes" : id))
      .filter((id) => catalog.has(id));
  for (const side of ["player", "bot"])
    s.inventory[side] = convert(s.inventory[side]);
  for (const mark of ["X", "O"])
    if (s.boxes?.[mark])
      s.boxes[mark].received = convert(s.boxes[mark].received);
  const old = s.knowledge || {};
  s.knowledge = {};
  for (const side of ["player", "bot"]) {
    if (typeof old[side] === "boolean")
      s.knowledge[side] = [{ index: 0, live: old[side], source: "magnifier" }];
    else if (Array.isArray(old[side])) s.knowledge[side] = old[side];
  }
  s.shield = { player: false, bot: false };
  s.cuffsUsed = { player: s.cuffed === "bot", bot: s.cuffed === "player" };
  s.itemSetVersion = ITEM_SET_VERSION;
  return true;
}
function create(rules) {
  const s = core.createState(0);
  s.hp = { player: rules.maxHp, bot: rules.maxHp };
  s.inventory = { player: [], bot: [] };
  s.knowledge = {};
  s.cuffsUsed = { player: false, bot: false };
  s.itemSetVersion = ITEM_SET_VERSION;
  s.boxes = {
    X: { received: [], discarded: 0 },
    O: { received: [], discarded: 0 },
  };
  return s;
}
function load(s, rules, rng) {
  core.loadChamber(s, rng, { maxImbalance: 2 });
  s.knowledge = {};
  const itemCount = 1 + rng(2, `load-item-count-${s.loads}`);
  for (const side of ["player", "bot"]) {
    const drawn = Array.from(
      { length: itemCount },
      () => ITEMS[rng(ITEMS.length)].id,
    );
    const space = Math.max(0, rules.itemLimit - s.inventory[side].length),
      received = drawn.slice(0, space);
    s.inventory[side].push(...received);
    s.boxes[markOf(side)] = {
      received,
      discarded: drawn.length - received.length,
    };
  }
  return s.lastLoad;
}
function begin(s, rules, rng) {
  load(s, rules, rng);
}
function canApply(s, side, key) {
  if (!catalog.has(key) || s.status !== "playing" || s.turn !== side)
    return false;
  if (key === "cuffs") return s.cuffed === null && !s.cuffsUsed[side];
  if (key === "saw") return !s.saw;
  return (
    ["cigarettes", "expired_medicine"].includes(key) || s.chamber.length > 0
  );
}
function stealable(s, side) {
  return [...new Set(s.inventory[core.other(side)])].filter(
    (key) => key !== "adrenaline" && canApply(s, side, key),
  );
}
function usable(s, side, key) {
  return (
    s.inventory[side].includes(key) &&
    (key === "adrenaline"
      ? stealable(s, side).length > 0
      : canApply(s, side, key))
  );
}
function learn(s, side, index, source) {
  const list = s.knowledge[side] || [];
  s.knowledge[side] = [
    ...list.filter((h) => h.index !== index),
    { index, live: s.chamber[index], source },
  ].sort((a, b) => a.index - b.index);
}
function advanceKnowledge(s) {
  for (const side of Object.keys(s.knowledge)) {
    const list = s.knowledge[side]
      .filter((h) => h.index > 0)
      .map((h) => ({ ...h, index: h.index - 1 }));
    if (list.length) s.knowledge[side] = list;
    else delete s.knowledge[side];
  }
}
function apply(s, side, key, rules, rng) {
  const result = {};
  if (key === "cigarettes" || key === "expired_medicine") {
    const before = s.hp[side],
      safe = key === "cigarettes" || rng(2, "expired-medicine") === 0;
    if (safe)
      s.hp[side] = Math.min(
        rules.maxHp,
        before + (key === "cigarettes" ? 1 : 2),
      );
    else s.hp[side] = Math.max(0, before - 1);
    result.healed = Math.max(0, s.hp[side] - before);
    result.damage = Math.max(0, before - s.hp[side]);
    if (key === "expired_medicine") result.success = safe;
    if (s.hp[side] === 0) s.status = side === "player" ? "lost" : "won";
  } else if (key === "beer") {
    advanceKnowledge(s);
    result.live = s.chamber.shift();
    s.peek = null;
    s.saw = false;
    if (!s.chamber.length) {
      load(s, rules, rng);
      result.reloaded = true;
    }
  } else if (key === "inverter") {
    s.chamber[0] = !s.chamber[0];
    s.peek = null;
    for (const list of Object.values(s.knowledge))
      for (const hint of list) if (hint.index === 0) hint.live = !hint.live;
  } else if (key === "magnifier") learn(s, side, 0, key);
  else if (key === "phone") {
    if (s.chamber.length > 1)
      learn(s, side, 1 + rng(s.chamber.length - 1, "phone-position"), key);
    else result.noPrediction = true;
  } else if (key === "saw") s.saw = true;
  else if (key === "cuffs") {
    s.cuffed = core.other(side);
    s.cuffsUsed[side] = true;
  }
  return result;
}
function act(s, mark, data, rules, rng) {
  upgrade(s);
  const side = sideOf(mark);
  if (s.status !== "playing" || s.turn !== side) error("NOT_TURN");
  if (data.type === "shoot") {
    if (!["self", "opponent"].includes(data.target)) error("INVALID_ACTION");
    advanceKnowledge(s);
    s.shield = { player: false, bot: false };
    const e = core.shoot(
      s,
      side,
      data.target === "self" ? side : core.other(side),
      rng,
      (current) => load(current, rules, rng),
    );
    if (s.turn !== side) s.cuffsUsed[s.turn] = false;
    return {
      type: "shoot",
      target: markOf(e.target),
      live: e.live,
      damage: e.damage,
      blocked: 0,
      cuffSkip: e.cuffSkip,
      reloaded: !!e.reloaded,
    };
  }
  const key = data.itemId;
  if (data.type !== "item" || !catalog.has(key)) error("INVALID_ACTION");
  if (!usable(s, side, key)) error("ITEM_UNAVAILABLE");
  let stolen = null;
  if (key === "adrenaline") {
    stolen = data.stolenItemId;
    if (!stealable(s, side).includes(stolen)) error("INVALID_STEAL");
  }
  // Validate both selections before consuming anything. Steal+use is one store transaction/version.
  s.inventory[side].splice(s.inventory[side].indexOf(key), 1);
  if (stolen)
    s.inventory[core.other(side)].splice(
      s.inventory[core.other(side)].indexOf(stolen),
      1,
    );
  return {
    type: "item",
    itemId: key,
    ...(stolen ? { stolenItemId: stolen } : {}),
    ...apply(s, side, stolen || key, rules, rng),
  };
}
function view(s, mark, rules) {
  const side = mark ? sideOf(mark) : null,
    hints = side ? s.knowledge[side] || [] : [];
  return {
    itemSet: "buckshot-1v1-double-or-nothing",
    hp: { X: s.hp.player, O: s.hp.bot },
    round: s.loads,
    ammunition: core.remaining(s),
    lastLoad: s.lastLoad,
    inventories: { X: [...s.inventory.player], O: [...s.inventory.bot] },
    items: ITEMS,
    boxes: s.boxes,
    effects: {
      saw: s.saw,
      cuffed: s.cuffed ? markOf(s.cuffed) : null,
      cuffsUsed: { X: s.cuffsUsed.player, O: s.cuffsUsed.bot },
    },
    knownShell: hints.find((h) => h.index === 0)?.live ?? null,
    knownShells: hints.map((h) => ({
      position: h.index + 1,
      live: h.live,
      source: h.source,
    })),
    usableItems:
      side && s.status === "playing"
        ? ITEMS.filter((i) => usable(s, side, i.id)).map((i) => i.id)
        : [],
    stealableItems:
      side && s.status === "playing" && s.turn === side
        ? stealable(s, side)
        : [],
  };
}
module.exports = {
  create,
  begin,
  act,
  view,
  ITEMS,
  ITEM_SET_VERSION,
  upgrade,
  markOf,
  sideOf,
};
