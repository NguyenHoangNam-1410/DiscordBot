"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const spelling = require("../src/utils/vietnameseSpelling");
const injected = [
  "thuỷ tinh",
  "hoả hoạn",
  "https://bad.example/thuỷ",
  "thủy 123",
  "song tử dịệp",
];
const source = require("../data/games/vietnamese-game-words.json");
source.vuaWords.push(...injected);
const games = require("../src/services/funGameService");
source.vuaWords.splice(-injected.length);
let groups = 0;
function test(name, f) {
  f();
  console.log("PASS " + name);
  groups++;
}
const sorted = (value) =>
  Array.from(value.replace(/ · |\s/gu, "").normalize("NFC"))
    .sort()
    .join("");
function stored(guild, answer, extra = {}) {
  const session = {
    question: {
      answer,
      mixed: "old puzzle",
      hint: "Gợi ý",
      hard: true,
      expiresAt: Date.now() + 12345,
      durationSeconds: 60,
      ...extra,
    },
    recent: [answer],
    rounds: 4,
    ui: { channelId: "c", messageId: "m" },
  };
  db.prepare(
    "INSERT INTO game_sessions(guild_id,game,state_json,updated_at) VALUES(?,'vuatiengviet',?,0)",
  ).run(guild, JSON.stringify(session));
  return session;
}
try {
  test("Open oa/oe/uy syllables use the requested tone convention in NFC and NFD", () => {
    const examples = {
      thuỷ: "thủy",
      hoả: "hỏa",
      hoá: "hóa",
      toà: "tòa",
      khoẻ: "khỏe",
      huỷ: "hủy",
      uỷ: "ủy",
      luỹ: "lũy",
      nguỵ: "ngụy",
      qũy: "quỹ",
      "thuỷ hoả": "thủy hỏa",
    };
    for (const [a, b] of Object.entries(examples)) {
      assert.equal(spelling.validatedVuaWord(a), b);
      assert.equal(spelling.validatedVuaWord(a.normalize("NFD")), b);
      assert.equal(spelling.validatedVuaWord(b), b);
    }
    assert.equal(spelling.canonicalVietnameseTones("THUỶ HOẢ"), "THỦY HỎA");
  });
  test("qu- and closed syllables stay intact; accents and distinct words are preserved", () => {
    for (const word of [
      "quý",
      "quỳ",
      "quỷ",
      "quỹ",
      "quỵ",
      "hoàn",
      "hoạt",
      "hoạch",
      "thuần",
      "thuyền",
      "quyền",
      "quyết",
      "già",
      "giỏi",
      "rượu",
      "người",
      "hữu nghị",
    ])
      assert.equal(spelling.validatedVuaWord(word), word);
    assert.notEqual(
      spelling.normalizeVuaAnswer("thuy tinh"),
      spelling.normalizeVuaAnswer("thủy tinh"),
    );
    assert.notEqual(
      spelling.normalizeVuaAnswer("hóa"),
      spelling.normalizeVuaAnswer("hỏa"),
    );
  });
  test("Before publication reject markup, URLs, numbers, malformed tone sequences and invalid input", () => {
    for (const bad of [
      null,
      undefined,
      42,
      {},
      "",
      "<b>thủy tinh</b>",
      "https://bad.example",
      "thủy123",
      "song tử dịệp",
      "thủy😀",
      "a".repeat(46),
      "bcdf",
    ])
      assert.equal(spelling.validatedVuaWord(bad), null, String(bad));
    assert.equal(
      spelling.validatedVuaWord("  THUỶ\u00a0  TINH  "),
      "thủy tinh",
    );
    for (const q of [...games.VUA_QUESTIONS, ...games.HARD_VUA_QUESTIONS])
      assert.equal(spelling.validatedVuaWord(q.answer), q.answer);
    assert(games.VUA_QUESTIONS.some((q) => q.answer === "thủy tinh"));
    assert(
      !games.VUA_QUESTIONS.some(
        (q) => q.answer.includes("https") || q.answer === "song tử dịệp",
      ),
    );
  });
  test("Published mixed letters and hints use the canonical answer; saved legacy timer and progress remain", () => {
    const before = stored("restore", "thuỷ tinh");
    const restored = games.getVuaSession("restore");
    assert.equal(restored.question.answer, "thủy tinh");
    assert.equal(sorted(restored.question.mixed), sorted("thủy tinh"));
    assert.equal(restored.question.expiresAt, before.question.expiresAt);
    assert.equal(restored.rounds, 4);
    assert.deepEqual(restored.ui, before.ui);
    const persisted = JSON.parse(
      db
        .prepare(
          "SELECT state_json FROM game_sessions WHERE guild_id='restore'",
        )
        .get().state_json,
    );
    assert.equal(persisted.question.answer, "thủy tinh");
    assert.equal(games.vuaQuestionText(restored.question).includes("ỷ"), false);
    stored("mixed-only", "thủy tinh", {
      mixed: "t · h · u · ỷ · t · i · n · h",
    });
    assert.equal(
      sorted(games.getVuaSession("mixed-only").question.mixed),
      sorted("thủy tinh"),
    );
    const letter = games.revealVuaLetter("restore", "player");
    assert("thủytinh".includes(letter.letter));
  });
  test("Answer checking accepts equivalent tone placement but never removes accents", () => {
    stored("modern-answer", "thuỷ tinh", { hard: false, expiresAt: null });
    assert(!games.answerVuaSession("modern-answer", "thuy tinh").correct);
    assert(games.answerVuaSession("modern-answer", "THỦY TINH").correct);
    stored("old-answer", "hỏa hoạn", { hard: false, expiresAt: null });
    assert(games.answerVuaSession("old-answer", "hoả hoạn").correct);
  });
  test("Bad saved words are replaced without reward or round increments; cached sessions are also checked", () => {
    const previous = stored("invalid", "song tử dịệp", {
      hard: false,
      expiresAt: null,
    });
    const fixed = games.getVuaSession("invalid");
    assert(spelling.validatedVuaWord(fixed.question.answer));
    assert.equal(fixed.rounds, previous.rounds);
    const live = games.startVuaSession("cached", { forceHard: false });
    live.question.answer = "hoả hoạn";
    const cached = games.getVuaSession("cached");
    assert.equal(cached.question.answer, "hỏa hoạn");
    assert.equal(sorted(cached.question.mixed), sorted("hỏa hoạn"));
  });
  test("Every generated question is validated and answer normalization is idempotent", () => {
    for (let i = 0; i < 50; i++) {
      const q = games.startVuaSession("sample-" + i, {
        forceHard: i % 2 === 0,
      }).question;
      assert.equal(spelling.validatedVuaWord(q.answer), q.answer);
      assert.equal(sorted(q.mixed), sorted(q.answer));
      assert.equal(
        spelling.normalizeVuaAnswer(spelling.normalizeVuaAnswer(q.answer)),
        spelling.normalizeVuaAnswer(q.answer),
      );
    }
  });
  console.log(groups + " Vua spelling groups passed; in-memory SQLite.");
} finally {
  db.close();
}
