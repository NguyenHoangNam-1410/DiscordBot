"use strict";
// Vua tiếng Việt: trả lời đúng câu khó nhận thêm 1 vật phẩm Vua tiếng Việt, độ hiếm theo tỷ lệ Gacha.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const testDb = path.resolve(__dirname, "../data/test-vua-hard-reward.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;
const drop = require("../src/services/gameItemDropService"),
  gachaPool = require("../src/services/gachaPoolService"),
  shop = require("../src/services/shopService"),
  fun = require("../src/services/funGameService"),
  channels = require("../src/services/gameChannelService"),
  { handleGameMessage } = require("../src/services/gameMessageService"),
  { quizAnswerAnnouncement } = require("../src/utils/rewardText");
const G = "g-vua",
  C = "c-vua",
  U = "u-vua";
let count = 0;
const test = async (name, fn) => (await fn(), count++, console.log("PASS " + name));

(async () => {
  await test("Tỷ lệ độ hiếm khớp Gacha (R 44 / SR 28 / SSR 20 / UR 8), chia đều trong độ hiếm", () => {
    const rates = drop.questionRewardRates("vuatiengviet", G);
    const tiers = Object.fromEntries(rates.map((r) => [r.tier, r.rate]));
    const gacha = {};
    for (const e of gachaPool.listGachaPool(G, { luckMultiplier: 1 }))
      if (["R", "SR", "SSR", "UR"].includes(e.tier)) gacha[e.tier] = (gacha[e.tier] || 0) + e.effectiveWeight;
    const total = Object.values(gacha).reduce((a, b) => a + b, 0);
    for (const tier of ["R", "SR", "SSR", "UR"])
      assert.ok(Math.abs(tiers[tier] - (gacha[tier] / total) * 100) < 1e-9, tier);
    assert.ok(Math.abs(rates.reduce((n, r) => n + r.rate, 0) - 100) < 1e-9);
    for (const r of rates) for (const item of r.items) assert.equal(item.rarity, r.tier);
  });

  await test("Chọn theo mốc xác suất: đầu/cuối từng độ hiếm và chia đều trong độ hiếm", () => {
    const at = (p, pick = 0) => {
      let call = 0;
      return drop.rollQuestionItem("vuatiengviet", G, (n) => (call++ === 0 ? Math.min(n - 1, Math.floor(p * n)) : pick));
    };
    assert.equal(at(0).rarity, "R");
    assert.equal(at(0.4399).rarity, "R");
    assert.equal(at(0.4401).rarity, "SR");
    assert.equal(at(0.7199).rarity, "SR");
    assert.equal(at(0.7201).rarity, "SSR");
    assert.equal(at(0.9199).rarity, "SSR");
    assert.equal(at(0.9201).rarity, "UR");
    assert.equal(at(0.99999).rarity, "UR");
    assert.notEqual(at(0.8, 0).id, at(0.8, 1).id, "hai vật phẩm SSR đều nhau");
    // Mô phỏng thật: tần suất gần tỷ lệ kỳ vọng.
    const seen = {};
    for (let i = 0; i < 20000; i++) {
      const item = drop.rollQuestionItem("vuatiengviet", G);
      seen[item.rarity] = (seen[item.rarity] || 0) + 1;
    }
    for (const [tier, expected] of Object.entries({ R: 44, SR: 28, SSR: 20, UR: 8 }))
      assert.ok(Math.abs((seen[tier] / 20000) * 100 - expected) < 1.5, tier + " " + seen[tier]);
  });

  await test("Game không có vật phẩm thì không rơi gì; mọi độ hiếm có vật phẩm đều xuất hiện", () => {
    const base = drop.questionRewardRates("vuatiengviet", G);
    assert.deepEqual(base.map((r) => r.tier), ["R", "SR", "SSR", "UR"]);
    assert.equal(drop.rollQuestionItem("khong-co-game", G), null);
  });

  await test("Trả lời đúng câu khó: nhận xu, kim cương và đúng 1 vật phẩm vào túi; thông báo ghi vật phẩm", async () => {
    channels.setGameChannel(G, "vuatiengviet", C);
    const session = fun.startVuaSession(G);
    session.question.hard = true;
    session.question.expiresAt = Date.now() + 60_000;
    session.question.durationSeconds = 60;
    fun.saveSession?.(G, "vuatiengviet", session);
    const answer = session.question.answer;
    const sent = [];
    const message = {
      guildId: G,
      channelId: C,
      author: { id: U, bot: false },
      content: answer,
      channel: { send: async (p) => sent.push(p), id: C },
    };
    const owned = () =>
      drop.dropPool("vuatiengviet").reduce((n, item) => n + shop.getInventoryQuantity(G, U, item.id), 0);
    const before = owned();
    await handleGameMessage(message);
    assert.equal(owned(), before + 1, "đúng 1 vật phẩm Vua tiếng Việt");
    assert.match(sent[0].content, /Vật phẩm Vua tiếng Việt/);
  });

  await test("Câu thường không nhận vật phẩm; thông báo không có dòng vật phẩm", async () => {
    const session = fun.startVuaSession(G);
    session.question.hard = false;
    delete session.question.expiresAt;
    fun.saveSession?.(G, "vuatiengviet", session);
    const sent = [];
    const owned = () =>
      drop.dropPool("vuatiengviet").reduce((n, item) => n + shop.getInventoryQuantity(G, U, item.id), 0);
    const before = owned();
    await handleGameMessage({
      guildId: G,
      channelId: C,
      author: { id: U, bot: false },
      content: session.question.answer,
      channel: { send: async (p) => sent.push(p), id: C },
    });
    assert.equal(owned(), before);
    assert.doesNotMatch(sent[0].content, /Vật phẩm Vua tiếng Việt/);
  });

  await test("Thông báo và giao diện câu khó nêu rõ phần thưởng vật phẩm và tỷ lệ", () => {
    const item = drop.dropPool("vuatiengviet")[0];
    assert.match(quizAnswerAnnouncement({ userId: U, reward: 1, answer: "x", item }), new RegExp(item.name));
    assert.doesNotMatch(quizAnswerAnnouncement({ userId: U, reward: 1, answer: "x" }), /Vật phẩm/);
    const vua = require("../src/commands/vuatiengviet");
    const embed = vua.questionEmbed(G, { hard: true, expiresAt: Date.now() + 1000, mixed: "a b", hint: "h", answer: "ab", durationSeconds: 60 }).toJSON();
    const field = embed.fields.find((f) => f.name === "Thưởng câu khó");
    assert.match(field.value, /vật phẩm Vua tiếng Việt ngẫu nhiên/);
    assert.match(field.value, /R 44% · SR 28% · SSR 20% · UR 8%/);
  });
  console.log("vua hard reward ok (" + count + ")");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
