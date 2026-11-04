const assert = require("node:assert/strict");
const engine = require("../src/services/coquayEngine");
const rng = (n) => Math.floor(Math.random() * n),
  T = true,
  F = false;
// 1) Nạp đạn: đúng số viên theo đợt, luôn có ít nhất 1 thật và 1 lép
const ranges = { 1: [2, 3], 2: [4, 5], 3: [6, 8], 4: [6, 8] };
const seen = { 1: new Set(), 2: new Set(), 3: new Set() };
for (let i = 0; i < 3000; i += 1) {
  const state = engine.createState(100);
  for (let load = 1; load <= 4; load += 1) {
    const { live, blank } = engine.loadChamber(state, rng);
    const size = live + blank;
    const [min, max] = ranges[load];
    assert(size >= min && size <= max, `đợt ${load} có ${size} viên`);
    assert(live >= 1 && blank >= 1, "mỗi đợt có ít nhất 1 thật và 1 lép");
    assert.equal(state.chamber.length, size);
    assert.equal(state.chamber.filter(Boolean).length, live);
    if (load <= 3) seen[load].add(size);
  }
}
assert.deepEqual([...seen[1]].sort(), [2, 3]);
assert.deepEqual([...seen[2]].sort(), [4, 5]);
assert.deepEqual([...seen[3]].sort(), [6, 7, 8]);

// 2) Luật bắn
const fixed = (chamber) => {
  const state = engine.createState(100);
  state.chamber = [...chamber];
  state.loads = 1;
  state.lastLoad = { live: 1, blank: 1 };
  return state;
};
let s = fixed([F, T, F]);
assert.equal(engine.shoot(s, "player", "player", rng).live, false);
assert.equal(s.turn, "player", "tự bắn lép giữ lượt");
assert.equal(s.hp.player, 3);
engine.shoot(s, "player", "player", rng);
assert.equal(s.hp.player, 2, "tự bắn thật mất 1 máu");
assert.equal(s.turn, "bot", "tự bắn thật mất lượt");
s = fixed([F, T]);
engine.shoot(s, "player", "bot", rng);
assert.equal(s.turn, "bot", "bắn đối phương lép vẫn chuyển lượt");
assert.equal(s.hp.bot, 3);
s = fixed([T, F]);
engine.shoot(s, "player", "bot", rng);
assert.equal(s.turn, "bot");
assert.equal(s.hp.bot, 2);
assert.throws(() => engine.shoot(s, "player", "bot", rng), /NOT_YOUR_TURN/);
// hết đạn thì nạp đợt mới, người cầm súng giữ lượt
s = fixed([F]);
const reload = engine.shoot(s, "player", "player", rng);
assert(
  reload.reloaded &&
    s.loads === 2 &&
    s.chamber.length >= 4 &&
    s.turn === "player",
);
// Cưa: đạn thật gây 2 sát thương, kể cả tự bắn; đạn lép thì mất tác dụng
s = fixed([T, F, T]);
engine.applyItem(s, "player", "saw");
engine.shoot(s, "player", "bot", rng);
assert.equal(s.hp.bot, 1);
assert.equal(s.saw, false);
s = fixed([F, T]);
engine.applyItem(s, "player", "saw");
engine.shoot(s, "player", "bot", rng);
assert.equal(s.saw, false, "cưa bị tiêu dù đạn lép");
s = fixed([T, F]);
engine.applyItem(s, "player", "saw");
engine.shoot(s, "player", "player", rng);
assert.equal(s.hp.player, 1, "tự bắn khi đã cưa mất 2 máu");
// Bia Đỡ Đạn: chặn 1 sát thương khi đối phương bắn trúng, không chặn khi tự bắn
s = fixed([F, T, F]);
engine.applyItem(s, "player", "shield");
engine.shoot(s, "player", "bot", rng);
const blocked = engine.shoot(s, "bot", "player", rng);
assert.equal(blocked.blocked, 1);
assert.equal(s.hp.player, 3);
assert.equal(s.shield.player, false);
s = fixed([T, F]);
engine.applyItem(s, "player", "shield");
engine.shoot(s, "player", "player", rng);
assert.equal(s.hp.player, 2);
assert.equal(s.shield.player, true);
s = fixed([T, F, T]);
s.saw = true;
s.turn = "bot";
s.shield.player = true;
engine.shoot(s, "bot", "player", rng);
assert.equal(s.hp.player, 2, "cưa + bia: trúng 2, chặn 1");
// Còng: bắn ai cũng vậy, lần súng lẽ ra sang tay Bot thì quay lại tay mình
s = fixed([F, T, F]);
engine.applyItem(s, "player", "cuffs");
const cuffShot = engine.shoot(s, "player", "bot", rng);
assert(cuffShot.cuffSkip);
assert.equal(s.turn, "player");
assert.equal(s.cuffed, null);
s = fixed([T, F, F]);
engine.applyItem(s, "player", "cuffs");
engine.shoot(s, "player", "player", rng);
assert.equal(s.turn, "player", "tự bắn thật khi đã còng vẫn giữ súng");
s = fixed([F, F, T]);
engine.applyItem(s, "player", "cuffs");
engine.shoot(s, "player", "player", rng);
assert.equal(s.cuffed, "bot", "tự bắn lép: còng vẫn chờ lần chuyển lượt");
assert.throws(() => engine.applyItem(s, "player", "cuffs"), /ITEM_UNAVAILABLE/);
// Kính lúp chỉ xem, không đổi viên đạn
s = fixed([T, F]);
assert.deepEqual(engine.applyItem(s, "player", "magnifier"), {
  key: "magnifier",
  live: true,
});
assert.deepEqual(s.chamber, [T, F]);
// chết là kết thúc ván
s = fixed([T, F]);
s.hp.bot = 1;
engine.shoot(s, "player", "bot", rng);
assert.equal(s.status, "won");
s = fixed([T, F]);
s.hp.player = 1;
engine.shoot(s, "player", "player", rng);
assert.equal(s.status, "lost");

console.log(
  "Original coquay engine: load, shooting, saw, shield, cuffs, peek and terminal states passed",
);
