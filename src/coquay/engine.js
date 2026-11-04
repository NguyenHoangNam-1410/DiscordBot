"use strict";
// Preserve the original pure shooting engine. Internal player/bot keys are seats, never AI.
const core = require("../services/coquayEngine");
const sideOf = (mark) => (mark === "X" ? "player" : "bot");
const markOf = (side) => (side === "player" ? "X" : "O");
const ITEMS = Object.freeze([
  {
    id: "magnifier",
    name: "Kính lúp",
    description: "Xem kín viên tiếp theo. Không mất lượt.",
  },
  {
    id: "shield",
    name: "Bia đỡ đạn",
    description:
      "Chặn 1 sát thương từ một phát của đối thủ. Không chặn tự bắn.",
  },
  {
    id: "saw",
    name: "Cưa cầm tay",
    description:
      "Phát bắn tiếp theo gây 2 sát thương nếu là đạn thật, kể cả tự bắn. Đạn lép vẫn tiêu hiệu ứng.",
  },
  {
    id: "cuffs",
    name: "Còng số 8",
    description: "Lần tới chuyển súng, đối thủ mất một lượt. Không cộng dồn.",
  },
  {
    id: "medicine",
    name: "Thuốc lá · +1 HP",
    description:
      "Hồi ngay 1 HP, không vượt HP tối đa. Chỉ dùng khi đang mất máu; không mất lượt.",
  },
  {
    id: "beer",
    name: "Lon bia",
    description:
      "Loại viên tiếp theo, công bố thật/lép. Không mất lượt; hết đạn sẽ sang hiệp mới.",
  },
  {
    id: "inverter",
    name: "Bộ đảo đạn",
    description:
      "Đảo viên tiếp theo: thật ↔ lép. Không mất lượt; xóa thông tin kính lúp cũ.",
  },
]);
function error(code) {
  throw Object.assign(new Error(code), { code });
}
function create(rules) {
  const s = core.createState(0);
  s.hp = { player: rules.maxHp, bot: rules.maxHp };
  s.inventory = { player: [], bot: [] };
  s.knowledge = {};
  s.boxes = {
    X: { received: [], discarded: 0 },
    O: { received: [], discarded: 0 },
  };
  return s;
}
function load(s, rules, rng) {
  core.loadChamber(s, rng);
  s.knowledge = {};
  for (const side of ["player", "bot"]) {
    const drawn = Array.from(
      { length: 1 + rng(2) },
      () => ITEMS[rng(ITEMS.length)].id,
    );
    const space = Math.max(0, rules.itemLimit - s.inventory[side].length);
    const received = drawn.slice(0, space);
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
function usable(s, side, key, rules) {
  if (
    s.status !== "playing" ||
    s.turn !== side ||
    !s.inventory[side].includes(key)
  )
    return false;
  if (key === "medicine") return s.hp[side] < rules.maxHp;
  if (key === "beer" || key === "inverter") return s.chamber.length > 0;
  if (key === "magnifier") return !Object.hasOwn(s.knowledge, side);
  return core.canUseItem(s, side, key);
}
function act(s, mark, data, rules, rng) {
  const side = sideOf(mark);
  if (s.status !== "playing" || s.turn !== side) error("NOT_TURN");
  if (data.type === "shoot") {
    if (!["self", "opponent"].includes(data.target)) error("INVALID_ACTION");
    s.knowledge = {};
    const e = core.shoot(
      s,
      side,
      data.target === "self" ? side : core.other(side),
      rng,
      (current) => load(current, rules, rng),
    );
    return {
      type: "shoot",
      target: markOf(e.target),
      live: e.live,
      damage: e.damage,
      blocked: e.blocked,
      cuffSkip: e.cuffSkip,
      reloaded: !!e.reloaded,
    };
  }
  if (data.type !== "item" || !ITEMS.some((i) => i.id === data.itemId))
    error("INVALID_ACTION");
  const key = data.itemId;
  if (!usable(s, side, key, rules)) error("ITEM_UNAVAILABLE");
  s.inventory[side].splice(s.inventory[side].indexOf(key), 1);
  let result = { type: "item", itemId: key };
  if (key === "medicine") s.hp[side] = Math.min(rules.maxHp, s.hp[side] + 1);
  else if (key === "beer") {
    result.live = s.chamber.shift();
    s.knowledge = {};
    s.peek = null;
    if (!s.chamber.length) {
      load(s, rules, rng);
      result.reloaded = true;
    }
  } else if (key === "inverter") {
    s.chamber[0] = !s.chamber[0];
    s.knowledge = {};
    s.peek = null;
  } else {
    core.applyItem(s, side, key);
    if (key === "magnifier") {
      s.knowledge[side] = s.peek;
      s.peek = null;
    }
  }
  return result;
}
function view(s, mark, rules) {
  const side = mark ? sideOf(mark) : null;
  return {
    hp: { X: s.hp.player, O: s.hp.bot },
    round: s.loads,
    ammunition: core.remaining(s),
    lastLoad: s.lastLoad,
    inventories: { X: [...s.inventory.player], O: [...s.inventory.bot] },
    items: ITEMS,
    boxes: s.boxes,
    effects: {
      saw: s.saw,
      shield: { X: s.shield.player, O: s.shield.bot },
      cuffed: s.cuffed ? markOf(s.cuffed) : null,
    },
    knownShell:
      side && Object.hasOwn(s.knowledge, side) ? s.knowledge[side] : null,
    usableItems: side
      ? ITEMS.filter((i) => usable(s, side, i.id, rules)).map((i) => i.id)
      : [],
  };
}
module.exports = { create, begin, act, view, ITEMS, markOf, sideOf };
