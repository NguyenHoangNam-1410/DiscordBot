"use strict";
// Cursed Gambler: người chơi bắt buộc chọn một trò (Xì dách hoặc Cò quay Nga) và một khoản cược, rồi chơi đến khi phân thắng thua.
// Luật rút gọn: chỉ thắng/thua, không item của trò, không hệ số thưởng thêm; Xì dách hòa thì chia lại ván.
const roulette = require("../../services/coquayEngine");

const WAGERS = Object.freeze({
  payout: Object.freeze({ key: "payout", fraction: 0.2, label: "20% payout" }),
  stats: Object.freeze({
    key: "stats",
    fraction: 0.1,
    label: "10% mọi chỉ số",
  }),
});
const GAMES = Object.freeze({
  blackjack: Object.freeze({ key: "blackjack", name: "Xì dách", icon: "🃏" }),
  coquay: Object.freeze({ key: "coquay", name: "Cò quay Nga", icon: "🔫" }),
});
const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
const SUITS = ["♠", "♥", "♦", "♣"];
const MAX_REDEALS = 100;

const blackjack = () => require("../../services/blackjackService");
const intRng = (rng) => (maximum) =>
  maximum <= 1 ? 0 : Math.min(maximum - 1, Math.floor(rng() * maximum));

function shuffled(rng) {
  const cards = SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`));
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [cards[index], cards[target]] = [cards[target], cards[index]];
  }
  return cards;
}
function draw(g, rng) {
  if (!g.deck.length) g.deck = shuffled(rng);
  return g.deck.pop();
}

// ---- Xì dách (không tách bài, không nhân thưởng) -------------------------------
function outcome(g) {
  const bj = blackjack();
  const { payout } = bj.evaluateHand(g.player, 1, g.dealer, 2);
  return payout > 1 ? "won" : payout === 1 ? "draw" : "lost";
}
function describe(g) {
  const bj = blackjack();
  const side = (cards, name) =>
    `${name}: ${cards.join(" ")} · ${bj.isXiBang(cards) ? "Xì bàng" : `${bj.handScore(cards).total} điểm`}`;
  return `${side(g.player, "Bạn")}\n${side(g.dealer, "Nhà cái")}`;
}
function deal(g, rng) {
  g.player = [draw(g, rng), draw(g, rng)];
  g.dealer = [draw(g, rng), draw(g, rng)];
  g.status = "playing";
}
function dealerPlay(g, rng) {
  const bj = blackjack();
  while (
    bj.handScore(g.dealer).total < bj.DEALER_MIN_STAND &&
    !bj.isXiBang(g.dealer) &&
    bj.handType(g.dealer) !== "ngulinh"
  )
    g.dealer.push(draw(g, rng));
}
// Hòa thì chia lại cho đến khi có người thắng.
function conclude(g, rng, playDealer = true) {
  if (playDealer) dealerPlay(g, rng);
  const result = outcome(g);
  if (result !== "draw") {
    g.status = result;
    return;
  }
  g.redeals = (g.redeals || 0) + 1;
  g.lastDraw = describe(g);
  if (g.redeals > MAX_REDEALS) throw new Error("GAMBLER_REDEAL_LIMIT");
  deal(g, rng);
  settleNatural(g, rng);
}
function settleNatural(g, rng) {
  const bj = blackjack();
  if (
    bj.isXiBang(g.player) ||
    bj.isXiBang(g.dealer) ||
    bj.isBlackjack(g.player)
  )
    conclude(g, rng, false);
  else autoStand(g, rng);
}
function autoStand(g, rng) {
  const bj = blackjack();
  const type = bj.handType(g.player);
  if (
    bj.handScore(g.player).total >= 21 ||
    type === "ngulinh" ||
    type === "bust"
  )
    conclude(g, rng);
}

// ---- Cò quay Nga (1 mạng mỗi bên, không dùng vật phẩm) ------------------------
function shotText(entry) {
  const who = entry.shooter === "player" ? "Bạn" : "Bot";
  const aim =
    entry.shooter === entry.target
      ? "tự bắn mình"
      : `bắn ${entry.target === "player" ? "bạn" : "Bot"}`;
  return `${who} ${aim}: ${entry.live ? "🔴 **đạn thật**" : "⚪ **đạn lép**"}${!entry.live && entry.shooter === entry.target ? " · giữ lượt" : ""}${entry.reloaded ? `\n🔄 Nạp lại: ${"🔴".repeat(entry.reloaded.live)}${"⚪".repeat(entry.reloaded.blank)}` : ""}`;
}
function runBot(g, rng) {
  const lines = [];
  const pick = intRng(rng);
  while (g.roulette.status === "playing" && g.roulette.turn === "bot") {
    const target = roulette.botTarget(g.roulette, (max) => pick(max));
    lines.push(
      shotText(roulette.shoot(g.roulette, "bot", target, (max) => pick(max))),
    );
  }
  return lines;
}

// ---- Giao diện chung -----------------------------------------------------------
function newGame(game, rng) {
  if (!GAMES[game]) throw new Error("INVALID_GAME");
  if (game === "blackjack") {
    const g = { game, deck: shuffled(rng), redeals: 0, log: "" };
    deal(g, rng);
    settleNatural(g, rng);
    return g;
  }
  const st = roulette.createState(0);
  st.hp = { player: 1, bot: 1 };
  roulette.loadChamber(st, intRng(rng));
  return { game, roulette: st, status: "playing", log: "" };
}
function finished(g) {
  return (g.game === "coquay" ? g.roulette.status : g.status) !== "playing";
}
function won(g) {
  return (g.game === "coquay" ? g.roulette.status : g.status) === "won";
}
function actions(g) {
  if (finished(g)) return [];
  if (g.game === "blackjack")
    return [
      { action: "gamble_hit", label: "Rút bài" },
      {
        action: "gamble_stand",
        label: blackjack().canStand(g.player) ? "Dừng" : "Dừng · cần ≥16 điểm",
        disabled: !blackjack().canStand(g.player),
      },
    ];
  return [
    { action: "gamble_self", label: "Tự bắn mình" },
    { action: "gamble_bot", label: "Bắn Bot" },
  ];
}
function act(g, action, rng) {
  if (finished(g)) throw new Error("STALE_ACTION");
  if (g.game === "blackjack") {
    const bj = blackjack();
    const redeals = g.redeals || 0;
    if (action === "gamble_hit") {
      g.player.push(draw(g, rng));
      autoStand(g, rng);
    } else if (action === "gamble_stand") {
      if (!bj.canStand(g.player)) throw new Error("MUST_HIT");
      conclude(g, rng);
    } else throw new Error("INVALID_ACTION");
    g.log =
      (g.redeals || 0) > redeals
        ? `Hòa ván trước:\n${g.lastDraw}\n→ chia lại ván mới.`
        : "";
    return g;
  }
  const pick = intRng(rng);
  const target =
    action === "gamble_self"
      ? "player"
      : action === "gamble_bot"
        ? "bot"
        : null;
  if (!target) throw new Error("INVALID_ACTION");
  const lines = [
    shotText(roulette.shoot(g.roulette, "player", target, (max) => pick(max))),
    ...runBot(g, rng),
  ];
  g.log = lines.join("\n");
  g.status = g.roulette.status;
  return g;
}
function text(g, { reveal = false } = {}) {
  if (g.game === "blackjack") {
    const bj = blackjack();
    const hide = !reveal && !finished(g);
    const dealer = hide
      ? `${g.dealer[0]} 🂠`
      : `${g.dealer.join(" ")} · ${bj.isXiBang(g.dealer) ? "Xì bàng" : `${bj.handScore(g.dealer).total} điểm`}`;
    return `${g.log ? `${g.log}\n\n` : ""}🃏 **Bạn:** ${g.player.join(" ")} · ${bj.isXiBang(g.player) ? "Xì bàng" : `${bj.handScore(g.player).total} điểm`}\n🏦 **Nhà cái:** ${dealer}\n*Dừng từ 16 điểm; hòa thì chia lại ván.*`;
  }
  const { live, blank } = roulette.remaining(g.roulette);
  return `${g.log ? `${g.log}\n\n` : ""}🔫 **Cò quay Nga** · mỗi bên **1 mạng** ❤️ vs ❤️\nỔ đạn còn: ${"🔴".repeat(live)}${"⚪".repeat(blank)} (${live} thật · ${blank} lép)\n*Bạn đi trước. Đạn thật trúng ai thì người đó thua.*`;
}

module.exports = {
  WAGERS,
  GAMES,
  newGame,
  actions,
  act,
  finished,
  won,
  text,
};
