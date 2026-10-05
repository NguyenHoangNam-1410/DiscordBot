"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  setApplicationEmojisForTest,
  loadApplicationEmojis,
} = require("../src/utils/appEmoji");
const display = require("../src/utils/cardDisplay");
// Run the real game schema and transactions in memory, never touch the live database.
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
process.env.DB_PATH = path.join(
  __dirname,
  "../data/card-display-memory.sqlite",
);
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const blackjack = require("../src/services/blackjackService");
const duel = require("../src/services/blackjackDuelService");
const poker = require("../src/services/pokerService");
const multiplayer = require("../src/services/pokerMultiplayerService");
const ranks = [
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
const suits = { "♠": "S", "♣": "C", "♦": "D", "♥": "H" };
const faceEntries = display.CARD_EMOJI_NAMES.map((name, index) => [
  name,
  String(100000000000000000n + BigInt(index)),
]);
const backEntries = display.CARD_BACK_NAMES.map((name, index) => [
  name,
  String(200000000000000000n + BigInt(index)),
]);
const register = () =>
  setApplicationEmojisForTest([...faceEntries, ...backEntries]);
const textOf = (embed) => {
  const data = embed.toJSON();
  return [data.description, ...(data.fields || []).map((f) => f.value)].join(
    "\n",
  );
};
function checkBacks(text, name, count) {
  const matches = [
    ...text.matchAll(/<a?:(cardBack_(?:red|green|blue)[1-5]):\d+>/g),
  ];
  assert.equal(matches.length, count);
  assert(
    matches.every((m) => m[1] === name),
    "A game must use a single card back",
  );
  assert(!text.includes("??"));
}
function noFaces(text, cards) {
  for (const card of cards)
    assert(
      !text.includes(display.cardFace(card)),
      `Hidden card leaked: ${card}`,
    );
}
async function main() {
  register();
  assert.equal(display.CARD_EMOJI_NAMES.length, 52);
  assert.equal(new Set(display.CARD_EMOJI_NAMES).size, 52);
  for (const [suit, code] of Object.entries(suits))
    for (const rank of ranks) {
      assert.equal(display.cardEmojiName(rank + suit), `${rank}${code}`);
      assert.match(
        display.cardFace(rank + suit),
        new RegExp(`^<:${rank}${code}:\\d+>$`),
      );
    }
  const originalRandomInt = crypto.randomInt;
  try {
    for (let index = 0; index < 15; index++) {
      crypto.randomInt = (limit) => {
        assert.equal(limit, 15);
        return index;
      };
      assert.equal(display.createCardBack(), display.CARD_BACK_NAMES[index]);
    }
    setApplicationEmojisForTest([backEntries[7]]);
    crypto.randomInt = (limit) => {
      assert.equal(limit, 1);
      return 0;
    };
    assert.equal(display.createCardBack(), backEntries[7][0]);
  } finally {
    crypto.randomInt = originalRandomInt;
    register();
  }
  assert.equal(display.cardEmojiName("11♥"), null);
  assert.equal(
    display.renderCardText("Bỏ 10♦ và A♠."),
    `Bỏ ${display.cardFace("10♦")} và ${display.cardFace("A♠")}.`,
  );
  const legacy = { fair: { serverSeed: "old-persisted-seed" } };
  assert.equal(
    display.hiddenCards(legacy, 2, "old-game"),
    display.hiddenCards(JSON.parse(JSON.stringify(legacy)), 2, "old-game"),
  );
  const stable = { cardBack: "cardBack_blue2" };
  setApplicationEmojisForTest([]);
  assert.equal(display.cardFace("3♥"), "**3♥**");
  assert.equal(display.hiddenCards(stable, 2), "🂠　🂠");
  register();
  checkBacks(display.hiddenCards(stable, 3), stable.cardBack, 3);
  const appEntries = new Map(
    [...faceEntries, ...backEntries].map(([name, id]) => [
      id,
      { name, id, animated: false },
    ]),
  );
  let uploaded = false;
  await loadApplicationEmojis(
    {
      application: {
        emojis: {
          fetch: async () => appEntries,
          create: async () => {
            uploaded = true;
            throw Error("Must not upload");
          },
        },
      },
    },
    { info() {}, warn() {} },
  );
  assert.equal(uploaded, false);
  assert.match(display.cardFace("Q♠"), /^<:QS:/);

  const bj = blackjack.startBlackjack({
    guildId: "cards-bj",
    channelId: "c",
    userId: "human",
    stake: 10,
    forcedDeck: ["2♣", "7♥", "8♣", "5♠", "3♦"].reverse(),
  });
  assert(!bj.immediate);
  assert(display.CARD_BACK_NAMES.includes(bj.state.cardBack));
  const bjText = textOf(
    blackjack.blackjackEmbed(bj.state, "human", null, bj.session.id),
  );
  checkBacks(bjText, bj.state.cardBack, 1);
  noFaces(bjText, [bj.state.dealer[1]]);
  assert(bjText.includes(display.cardFace("2♣")));
  const bjReload = JSON.parse(
    blackjack.getSessionByUser("cards-bj", "human").state_json,
  );
  assert.equal(bjReload.cardBack, bj.state.cardBack);
  assert.equal(
    textOf(blackjack.blackjackEmbed(bjReload, "human", null, bj.session.id)),
    bjText,
  );
  const hit = blackjack.playAction({
    sessionId: bj.session.id,
    userId: "human",
    action: "hit",
  });
  assert.equal(hit.state.cardBack, bj.state.cardBack);
  assert.equal(
    JSON.parse(blackjack.getSessionByUser("cards-bj", "human").state_json)
      .cardBack,
    bj.state.cardBack,
  );
  const swapState = {
    ...bj.state,
    itemEffect: "blackjack_swap",
    itemEffectUsed: false,
  };
  const buttons = blackjack
    .actionRows(bj.session.id, swapState)
    .flatMap((row) => row.toJSON().components)
    .filter((b) => b.custom_id.includes(":swap:"));
  assert.equal(
    buttons[0].emoji.name,
    display.cardEmojiName(bj.state.hands[0].cards[0]),
  );

  const { table } = blackjack.createBlackjackTable({
    guildId: "cards-table",
    channelId: "c",
    dealerId: "dealer",
    ante: 10,
  });
  const lobby = JSON.parse(table.state_json);
  assert(display.CARD_BACK_NAMES.includes(lobby.cardBack));
  const tableState = {
    ...lobby,
    dealer: ["4♦", "8♣"],
    turn: 0,
    players: [
      { id: "p1", cards: ["5♠", "7♥"], status: "playing", stake: 10 },
      { id: "p2", cards: ["6♦", "9♥"], status: "playing", stake: 10 },
    ],
  };
  const playing = { ...table, status: "playing" };
  const tableText = textOf(blackjack.blackjackTableEmbed(playing, tableState));
  checkBacks(tableText, tableState.cardBack, 5);
  noFaces(tableText, ["8♣", "5♠", "7♥", "6♦", "9♥"]);
  const own = blackjack.tablePrivateText(playing, tableState, "p1");
  checkBacks(own, tableState.cardBack, 1);
  noFaces(own, ["8♣", "6♦", "9♥"]);
  assert(own.includes(display.cardFace("5♠")));
  const complete = textOf(
    blackjack.blackjackTableEmbed(
      { ...table, status: "completed" },
      tableState,
    ),
  );
  for (const card of ["4♦", "8♣", "5♠", "7♥", "6♦", "9♥"])
    assert(complete.includes(display.cardFace(card)));

  const invite = duel.createBlackjackDuel({
    guildId: "cards-duel",
    channelId: "c",
    challengerId: "alice",
    opponentId: "bob",
    stake: 10,
  });
  const accepted = duel.acceptBlackjackDuel(invite.id, "bob", Date.now(), [
    "6♦",
    "7♥",
    "8♣",
    "5♠",
  ]);
  const duelState = duel.duelState(accepted);
  assert(display.CARD_BACK_NAMES.includes(duelState.cardBack));
  const publicDuel = textOf(duel.blackjackDuelEmbed(accepted));
  checkBacks(publicDuel, duelState.cardBack, 4);
  noFaces(
    publicDuel,
    Object.values(duelState.players).flatMap((p) => p.cards),
  );
  const duelPrivate = duel.privateHandText(accepted, "alice");
  assert(
    duelPrivate.includes(display.cardFace(duelState.players.alice.cards[0])),
  );
  noFaces(duelPrivate, duelState.players.bob.cards);

  for (const variant of ["texas", "omaha", "pineapple", "sixplus"]) {
    const run = poker.startPoker({
      guildId: `cards-poker-${variant}`,
      channelId: "c",
      userId: "human",
      variant,
    });
    assert(display.CARD_BACK_NAMES.includes(run.state.cardBack));
    const pokerText = textOf(
      poker.pokerEmbed(run.state, "human", run.session.id),
    );
    const count =
      5 -
      run.state.board.length +
      run.state.players.slice(1).reduce((n, p) => n + p.hole.length - 1, 0);
    checkBacks(pokerText, run.state.cardBack, count);
    for (const bot of run.state.players.slice(1))
      noFaces(
        pokerText,
        bot.hole.filter((card) => card !== bot.revealedCard),
      );
    for (const card of [...run.state.board, ...run.state.players[0].hole])
      assert(pokerText.includes(display.cardFace(card)));
    const reload = JSON.parse(poker.getSession(run.session.id).state_json);
    assert.equal(reload.cardBack, run.state.cardBack);
    const discarded = { ...run.state, phase: "discard" };
    const discardButtons = poker
      .pokerRows(run.session.id, discarded)[0]
      .toJSON().components;
    assert.equal(
      discardButtons[0].emoji.name,
      display.cardEmojiName(run.state.players[0].hole[0]),
    );
  }
  const mp = multiplayer.createPokerLobby({
    guildId: "cards-mp",
    channelId: "c",
    userId: "p1",
    username: "P1",
    variant: "pineapple",
  });
  assert(display.CARD_BACK_NAMES.includes(mp.state.cardBack));
  const mpState = {
    ...mp.state,
    phase: "discard",
    street: "flop",
    board: ["2♠", "3♥", "4♣"],
    turnUserId: "p1",
    discardPending: ["p1", "p2"],
    players: [
      { ...mp.state.players[0], hole: ["A♥", "K♦", "Q♣"] },
      { ...mp.state.players[0], id: "p2", hole: ["7♠", "8♥", "9♦"] },
    ],
  };
  db.prepare("UPDATE poker_sessions SET state_json=? WHERE id=?").run(
    JSON.stringify(mpState),
    mp.session.id,
  );
  const publicMp = textOf(multiplayer.pokerTableEmbed(mpState, mp.session.id));
  checkBacks(publicMp, mpState.cardBack, 8);
  noFaces(
    publicMp,
    mpState.players.flatMap((p) => p.hole),
  );
  let privateReply;
  await multiplayer.handlePokerButton({
    customId: `poker:${mp.session.id}:view`,
    guildId: "cards-mp",
    channelId: "c",
    user: { id: "p1" },
    reply: async (payload) => {
      privateReply = payload;
    },
  });
  assert(privateReply.content.includes(display.cardFace("A♥")));
  noFaces(privateReply.content, mpState.players[1].hole);
  assert.equal(
    privateReply.components[0].toJSON().components[1].emoji.name,
    "AH",
  );
  const afterDiscard = {
    ...mpState,
    turnUserId: "p2",
    discardPending: ["p2"],
    players: [
      { ...mpState.players[0], hole: ["A♥", "K♦"] },
      mpState.players[1],
    ],
  };
  db.prepare("UPDATE poker_sessions SET state_json=? WHERE id=?").run(
    JSON.stringify(afterDiscard),
    mp.session.id,
  );
  await multiplayer.handlePokerButton({
    customId: `poker:${mp.session.id}:view`,
    guildId: "cards-mp",
    channelId: "c",
    user: { id: "p1" },
    reply: async (payload) => {
      privateReply = payload;
    },
  });
  const waitingButtons = privateReply.components[0].toJSON().components;
  assert.equal(waitingButtons.length, 3);
  assert(waitingButtons.slice(1).every((button) => button.disabled));
  assert.equal(waitingButtons[2].emoji.name, "KD");
  setApplicationEmojisForTest([]);
  db.close();
  console.log(
    "Card display tests passed: 52 emoji mappings, all card games, hidden-card privacy, fixed backs, persistence, buttons and reuse of uploaded emoji.",
  );
}
main().catch((error) => {
  console.error(error);
  try {
    db.close();
  } catch {}
  process.exitCode = 1;
});
