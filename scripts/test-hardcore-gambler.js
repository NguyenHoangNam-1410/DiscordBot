"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/services/hardcoreV2");
const stats = require("../src/services/hardcoreStats");
const view = require("../src/services/hardcoreV2View");
const gambler = require("../src/hardcore/events/gambler");

const session = { id: "g", guild_id: "g", user_id: "u", channel_id: "c" };
const rng = () => 0.7; // ổ bài không có Xì dách tự nhiên
function create(overrides = {}) {
  const s = stats.createState("barbarian", 10000);
  Object.assign(s, {
    floor: 5,
    cleared: 4,
    bonus: 50000,
    encounter: { type: "surprise", name: "Cursed Gambler", kind: "gambler" },
    ...overrides,
  });
  stats.recompute(s);
  return s;
}
const gamble = (s) => s.encounter.gamble;
const resolved = (s) => s.encounter?.kind !== "gambler";
const act = (s, action) => core.act(s, session, action, rng);
const names = (s) => core.actions(s).map((a) => a.action);

// 1) Bắt buộc tham gia: 4 lựa chọn (2 trò × 2 khoản cược), không Bỏ qua, không Rút thưởng
{
  const s = create();
  assert.deepEqual(names(s), [
    "gamble_blackjack_payout",
    "gamble_blackjack_stats",
    "gamble_coquay_payout",
    "gamble_coquay_stats",
  ]);
  assert.throws(() => act(s, "event_skip"), /INVALID_ACTION|STALE/);
  assert.throws(() => act(s, "retreat"), /CANNOT_RETREAT/);
  assert.throws(() => act(s, "event_gamble_10"), /INVALID_ACTION/);
  // Hiển thị không lỗi trước và sau khi chọn
  assert.ok(!JSON.stringify(view.embed(s, "u").toJSON()).includes("undefined"));
  const rows = view.rows("sid", s).flatMap((row) => row.toJSON().components);
  assert.ok(!rows.some((c) => /retreat|event_skip/.test(c.custom_id || "")));
}

// 2) Cược payout 20%: trừ ngay; thắng Xì dách → bonus +2×; không có hệ số thêm
const forceBlackjack = (s, player, dealer) => {
  const g = gamble(s);
  g.player = player;
  g.dealer = dealer;
  g.status = "playing";
};
{
  const s = create();
  const wager = core.serviceCost(s, 0.2);
  const bonus = s.bonus;
  act(s, "gamble_blackjack_payout");
  assert.equal(s.payoutSpent, wager);
  assert.equal(s.encounter.stake.amount, wager);
  assert.equal(gamble(s).game, "blackjack");
  forceBlackjack(s, ["10♠", "8♥"], ["10♦", "7♣"]);
  assert.deepEqual(names(s), ["gamble_hit", "gamble_stand"]);
  assert.throws(() => act(s, "retreat"), /CANNOT_RETREAT/);
  act(s, "gamble_stand");
  assert.ok(resolved(s), "thắng thì kết thúc event");
  assert.equal(s.bonus, bonus + wager * 2);
  assert.match(s.lastLog, /THẮNG/);
}
// Xì dách tự nhiên (A+K ngay khi chia) cũng chỉ trả x2 như thắng thường, không +50%
{
  const s = create();
  const wager = core.serviceCost(s, 0.2);
  const bonus = s.bonus;
  core.act(s, session, "gamble_blackjack_payout", () => 0.5);
  assert.ok(resolved(s), "Xì dách tự nhiên thắng ngay");
  assert.equal(s.bonus, bonus + wager * 2);
}
{
  const s = create();
  const wager = core.serviceCost(s, 0.2);
  const bonus = s.bonus;
  act(s, "gamble_blackjack_payout");
  const g = gamble(s);
  g.player = ["9♠", "5♥"]; // 14, phải rút
  g.dealer = ["10♦", "7♣"];
  g.deck = ["7♠"]; // rút ra 21 → tự dừng, thắng 17
  act(s, "gamble_hit");
  assert.ok(resolved(s));
  assert.equal(s.bonus, bonus + wager * 2, "21 thắng thường, không +50%");
}
// Thua: mất cược, không bonus
{
  const s = create();
  const bonus = s.bonus;
  act(s, "gamble_blackjack_payout");
  forceBlackjack(s, ["10♠", "8♥"], ["10♦", "9♣"]);
  act(s, "gamble_stand");
  assert.ok(resolved(s));
  assert.equal(s.bonus, bonus);
  assert.match(s.lastLog, /THUA/);
}
// Chưa đủ 16 điểm không được dừng
{
  const s = create();
  act(s, "gamble_blackjack_payout");
  forceBlackjack(s, ["5♠", "6♥"], ["10♦", "9♣"]);
  assert.equal(
    core.actions(s).find((a) => a.action === "gamble_stand").disabled,
    true,
  );
  assert.throws(() => act(s, "gamble_stand"), /./);
}
// Quắc → thua
{
  const s = create();
  act(s, "gamble_blackjack_payout");
  const g = gamble(s);
  g.player = ["10♠", "6♥"];
  g.dealer = ["10♦", "9♣"];
  g.deck = ["K♠"];
  act(s, "gamble_hit");
  assert.ok(resolved(s));
  assert.match(s.lastLog, /THUA/);
}
// Hòa → chia lại ván mới, event chưa kết thúc cho đến khi phân thắng thua
{
  const s = create();
  const bonus = s.bonus;
  act(s, "gamble_blackjack_payout");
  forceBlackjack(s, ["10♠", "8♥"], ["10♦", "8♣"]);
  act(s, "gamble_stand");
  assert.ok(!resolved(s), "hòa phải chia lại");
  assert.equal(gamble(s).redeals, 1);
  assert.equal(gamble(s).status, "playing");
  assert.equal(s.bonus, bonus);
  assert.match(core.actions(s)[0].action, /gamble_hit/);
  // Chia lại nhiều lần vẫn kết thúc được
  for (let i = 0; i < 50 && !resolved(s); i += 1) {
    const g = gamble(s);
    g.player = ["10♠", "8♥"];
    g.dealer = ["10♦", "8♣"];
    act(s, "gamble_stand");
    if (!resolved(s) && gamble(s).status !== "playing") break;
  }
}
// Hai bên cùng quắc cũng là hòa → chia lại
{
  const g = gambler.newGame("blackjack", () => 0.7);
  g.player = ["10♠", "6♥"];
  g.dealer = ["10♦", "4♣"];
  g.deck = ["K♠", "Q♣", "9♥"];
  g.status = "playing";
  gambler.act(g, "gamble_hit", () => 0.7);
  assert.equal(g.redeals, 1);
  assert.equal(
    g.status === "playing" || g.status === "won" || g.status === "lost",
    true,
  );
  assert.match(g.log, /chia lại/);
}

// 3) Cược 10% chỉ số: trừ từng chỉ số, thắng nhận lại gấp đôi (net +10%)
{
  const s = create();
  const before = Object.fromEntries(
    ["str", "dex", "vit", "ene"].map((k) => [k, s[k]]),
  );
  act(s, "gamble_blackjack_stats");
  assert.equal(s.payoutSpent || 0, 0, "không trừ payout");
  const loss = s.encounter.stake.deduct;
  for (const key of Object.keys(before)) {
    assert.equal(loss[key], Math.max(1, Math.floor(before[key] * 0.1)), key);
    assert.equal(s[key], before[key] - loss[key], key);
  }
  forceBlackjack(s, ["10♠", "8♥"], ["10♦", "7♣"]);
  act(s, "gamble_stand");
  assert.ok(resolved(s));
  for (const key of Object.keys(before))
    assert.equal(s[key], before[key] + loss[key], `${key} thắng: net +10%`);
}
{
  const s = create();
  const before = s.str;
  act(s, "gamble_blackjack_stats");
  forceBlackjack(s, ["10♠", "8♥"], ["10♦", "9♣"]);
  act(s, "gamble_stand");
  assert.ok(resolved(s));
  assert.ok(s.str < before, "thua mất chỉ số đã cược");
}

// 4) Cò quay Nga: mỗi bên 1 mạng, không item
{
  const s = create();
  const wager = core.serviceCost(s, 0.2);
  const bonus = s.bonus;
  act(s, "gamble_coquay_payout");
  const r = gamble(s).roulette;
  assert.deepEqual(r.hp, { player: 1, bot: 1 });
  assert.deepEqual(names(s), ["gamble_self", "gamble_bot"]);
  assert.ok(r.chamber.some(Boolean) && r.chamber.some((x) => !x));
  r.chamber = [true, false];
  r.turn = "player";
  act(s, "gamble_bot");
  assert.ok(resolved(s));
  assert.equal(s.bonus, bonus + wager * 2);
  assert.match(s.lastLog, /THẮNG/);
}
{
  const s = create();
  const bonus = s.bonus;
  act(s, "gamble_coquay_payout");
  const r = gamble(s).roulette;
  r.chamber = [true, false];
  r.turn = "player";
  act(s, "gamble_self"); // đạn thật tự bắn → thua ngay
  assert.ok(resolved(s));
  assert.equal(s.bonus, bonus);
  assert.match(s.lastLog, /THUA/);
}
{
  const s = create();
  act(s, "gamble_coquay_stats");
  const r = gamble(s).roulette;
  r.chamber = [false, true];
  r.turn = "player";
  act(s, "gamble_self"); // đạn lép tự bắn giữ lượt
  assert.ok(!resolved(s));
  assert.equal(gamble(s).roulette.turn, "player");
  assert.equal(gamble(s).roulette.hp.player, 1);
  act(s, "gamble_bot"); // viên cuối là đạn thật → hạ Bot
  assert.ok(resolved(s));
}
// Bắn lép vào Bot → Bot đánh trả tự động, cuối cùng phải phân thắng thua
{
  let finished = 0;
  for (let trial = 0; trial < 200; trial += 1) {
    let seed = trial + 1;
    const seeded = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const g = gambler.newGame("coquay", seeded);
    for (let step = 0; step < 100 && !gambler.finished(g); step += 1)
      gambler.act(g, step % 2 ? "gamble_bot" : "gamble_self", seeded);
    if (gambler.finished(g)) finished += 1;
  }
  assert.equal(finished, 200, "mọi ván cò quay đều kết thúc");
}
// Mô phỏng Xì dách: luôn kết thúc, không bao giờ hòa
{
  const results = { won: 0, lost: 0 };
  for (let trial = 0; trial < 500; trial += 1) {
    let seed = trial + 7;
    const seeded = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const g = gambler.newGame("blackjack", seeded);
    for (let step = 0; step < 20 && !gambler.finished(g); step += 1) {
      const { canStand } = require("../src/services/blackjackService");
      gambler.act(
        g,
        canStand(g.player) ? "gamble_stand" : "gamble_hit",
        seeded,
      );
    }
    assert.ok(gambler.finished(g));
    assert.ok(["won", "lost"].includes(g.status));
    results[g.status] += 1;
  }
  assert.ok(results.won > 100 && results.lost > 100, JSON.stringify(results));
}
// Chi tiết sự kiện hiển thị đúng luật mới
assert.ok(
  !JSON.stringify(
    view.privatePayload(create(), "u", "m", "encounter"),
  ).includes("undefined"),
);

console.log(JSON.stringify({ ok: true, hardcoreGambler: true }));
