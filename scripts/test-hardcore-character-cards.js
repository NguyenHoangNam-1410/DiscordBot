"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const p = require("../src/hardcore/characters/progression"),
  catalog = require("../src/hardcore/characters"),
  gacha = require("../src/hardcore/gacha/service"),
  ui = require("../src/hardcore/ui/characters");
let count = 0;
const test = (name, f) => {
  f();
  count++;
  console.log("PASS " + name);
};
const extra = {
  ...catalog.get("venance"),
  id: "other_mage",
  name: "Other Mage",
};
const extra2 = { ...extra, id: "third_mage", name: "Third Mage" };
const wrong = { ...extra, id: "other_warrior", classKey: "warrior" };
catalog.catalog.characters.push(extra, extra2, wrong);
const setup = (user, level = 6) => {
  gacha.open({ userId: user });
  p.grantCharacter(user, "venance", 0);
  db.prepare(
    "UPDATE hardcore_owned_characters SET soul_level=? WHERE user_id=? AND character_id='venance'",
  ).run(level, user);
};
const args = (user) => ({
  userId: user,
  characterId: "venance",
  expectedRarity: "SSR",
  sourceIds: ["venance"],
  operationId: user + "-asc",
});
try {
  test("Soul cards are character-bound even within one class", () => {
    setup("own", 0);
    p.addCards("own", "other_mage", 100);
    assert.throws(
      () =>
        p.upgrade({
          userId: "own",
          characterId: "venance",
          expectedLevel: 0,
          operationId: "own-up",
        }),
      /INSUFFICIENT_CHARACTER_CARDS/,
    );
    p.addCards("own", "venance", 50);
    p.upgrade({
      userId: "own",
      characterId: "venance",
      expectedLevel: 0,
      operationId: "own-up",
    });
    assert.equal(p.cards("own", "venance"), 0);
    assert.equal(p.cards("own", "other_mage"), 100);
  });
  test("100 cards from one character ascend SSR then UR, LR is final", () => {
    setup("one");
    p.addCards("one", "venance", 250);
    const snapshot = JSON.stringify(catalog.preview("venance", 6, "SSR"));
    const a = args("one");
    const r = p.ascend(a);
    assert.equal(r.rarity, "UR");
    assert.equal(r.materials[0].cost, 100);
    assert.equal(p.cards("one", "venance"), 150);
    assert(p.ascend(a).duplicate);
    assert.equal(p.cards("one", "venance"), 150);
    assert.throws(
      () => p.ascend({ ...a, operationId: "one-stale" }),
      /STALE_CHARACTER_ASCENSION/,
    );
    assert.equal(
      JSON.stringify(catalog.preview("venance", 6, "SSR")),
      snapshot,
    );
    const ur = catalog.preview("venance", 6, p.getOwned("one").venance.rarity);
    assert.equal(ur.venanceProfile.rarity, "UR");
    p.ascend({ ...a, expectedRarity: "UR", operationId: "one-lr" });
    assert.equal(p.getOwned("one").venance.rarity, "LR");
    assert.equal(p.cards("one", "venance"), 50);
    assert.throws(
      () => p.ascend({ ...a, expectedRarity: "LR", operationId: "no-lr-plus" }),
      /STALE_CHARACTER_ASCENSION/,
    );
    p.grantCharacter("one", "venance", 0);
    assert.equal(p.cards("one", "venance"), 100);
  });
  test("New runs receive owned rarity while an existing run keeps its saved SSR profile", () => {
    setup("run");
    p.addCards("run", "venance", 200);
    db.prepare(
      "INSERT INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES('g','run',1000000,0,0)",
    ).run();
    const service = require("../src/hardcore"),
      repo = require("../src/hardcore/storage/sessions");
    const start = () =>
      service.startHardcore({
        guildId: "g",
        userId: "run",
        channelId: "c",
        stake: 100000,
        classKey: "venance",
        forcedEncounter: { type: "empty" },
      });
    const first = start();
    assert.equal(first.state.venanceProfile.rarity, "SSR");
    const saved = JSON.stringify(repo.getSession(first.session.id));
    p.ascend(args("run"));
    assert.equal(JSON.stringify(repo.getSession(first.session.id)), saved);
    repo.deleteSession(first.session.id);
    const next = start();
    assert.equal(next.state.venanceProfile.rarity, "UR");
    assert.equal(next.state.characterSoul.soulLevel, 6);
    repo.deleteSession(next.session.id);
  });
  test("Two exact 50-card packs can come from different same-class SSR characters", () => {
    setup("two");
    p.addCards("two", "other_mage", 50);
    p.addCards("two", "third_mage", 50);
    const a = { ...args("two"), sourceIds: ["other_mage", "third_mage"] };
    p.ascend(a);
    assert.equal(p.cards("two", "other_mage"), 0);
    assert.equal(p.cards("two", "third_mage"), 0);
    assert(p.ascend({ ...a, sourceIds: [...a.sourceIds].reverse() }).duplicate);
  });
  test("75+25 cannot form two packs; partial debits roll back with no revision change", () => {
    setup("split");
    p.addCards("split", "other_mage", 75);
    p.addCards("split", "third_mage", 25);
    const rev = p.account("split").revision;
    assert.throws(
      () =>
        p.ascend({ ...args("split"), sourceIds: ["other_mage", "third_mage"] }),
      /INSUFFICIENT_CHARACTER_CARDS/,
    );
    assert.equal(p.cards("split", "other_mage"), 75);
    assert.equal(p.cards("split", "third_mage"), 25);
    assert.equal(p.account("split").revision, rev);
    assert.throws(
      () =>
        p.ascend({
          ...args("split"),
          sourceIds: ["other_mage", "third_mage", "venance"],
        }),
      /INVALID_ASCENSION_MATERIALS/,
    );
    assert.equal(p.getOwned("split").venance.rarity, "SSR");
  });
  test("Wrong class, SR cards, pre-S6, unowned targets and conflicting retries fail closed", () => {
    setup("guards", 5);
    p.addCards("guards", "venance", 100);
    assert.throws(() => p.ascend(args("guards")), /STALE_CHARACTER_ASCENSION/);
    db.prepare(
      "UPDATE hardcore_owned_characters SET soul_level=6 WHERE user_id='guards'",
    ).run();
    for (const id of ["sorceress", "other_warrior", "missing"]) {
      if (catalog.get(id)) p.addCards("guards", id, 100);
      assert.throws(
        () => p.ascend({ ...args("guards"), sourceIds: [id] }),
        /INVALID_ASCENSION_MATERIALS/,
      );
    }
    assert.throws(
      () => p.ascend({ ...args("guards"), characterId: "other_mage" }),
      /CHARACTER_NOT_OWNED/,
    );
    assert.throws(
      () => p.ascend({ ...args("one"), sourceIds: ["other_mage"] }),
      /INVALID_CHARACTER_OPERATION/,
    );
    assert.equal(p.cards("guards", "venance"), 100);
  });
  test("Ascension UI uses a source selector, finite costs and valid Discord rows", () => {
    setup("panel");
    p.addCards("panel", "venance", 100);
    const state = {
      rarity: "all",
      classKey: "all",
      page: 0,
      id: "venance",
      tab: "souls",
    };
    const screen = ui.payload("panel", state);
    assert(
      screen.components
        .flatMap((r) => r.components)
        .some((c) => c.data.label?.includes("Nâng UR")),
    );
    const panel = ui.ascensionPayload("panel", state, "SSR");
    assert(panel.embeds[0].data.description.includes("100 thẻ"));
    const menu = panel.components[0].components[0].toJSON();
    assert.equal(menu.options[0].value, "venance");
    assert.equal(menu.max_values, 1);
    for (const view of [screen, panel]) {
      assert(view.components.length <= 5);
      for (const row of view.components)
        for (const c of row.components) {
          const j = c.toJSON();
          assert(j.custom_id.length <= 100);
        }
    }
  });
  test("Migration restores only receipt-proven card identity, retaining ambiguous balances and souls", () => {
    const old = new Database(":memory:"),
      versions = new Set();
    const schema = require("../src/hardcore/characters/schema");
    schema(old, (v, n, f) => {
      if (v === 44) {
        f();
        versions.add(v);
      }
    });
    const pool = old.prepare(
      "INSERT INTO hardcore_character_cards VALUES(?,?,?,?,0)",
    );
    for (const [user, n] of [
      ["exact", 30],
      ["ambiguous", 30],
      ["missing", 15],
    ])
      pool.run(user, "warrior", "SR", n);
    old
      .prepare(
        "INSERT INTO hardcore_owned_characters VALUES('ambiguous','druid',1,'SR',0)",
      )
      .run();
    const record = old.prepare(
      "INSERT INTO hardcore_character_operations VALUES(?,?,?,'{}',?,0)",
    );
    const reward = {
      kind: "character",
      id: "barbarian",
      duplicate: true,
      cards: 50,
    };
    for (const user of ["exact", "ambiguous"]) {
      record.run(
        user + "draw",
        user,
        "draw",
        JSON.stringify({ results: [reward] }),
      );
      record.run(
        user + "soul",
        user,
        "soul",
        JSON.stringify({
          characterId: user === "exact" ? "barbarian" : "druid",
          cost: 20,
        }),
      );
    }
    const migrate = (v, n, f) => {
      if (!versions.has(v)) {
        old.transaction(f)();
        versions.add(v);
      }
    };
    schema(old, migrate);
    schema(old, migrate);
    assert.equal(
      old
        .prepare(
          "SELECT quantity FROM hardcore_character_card_balances WHERE user_id='exact' AND character_id='barbarian'",
        )
        .get().quantity,
      30,
    );
    assert.equal(
      old
        .prepare(
          "SELECT quantity FROM hardcore_character_cards WHERE user_id='exact'",
        )
        .get().quantity,
      0,
    );
    for (const user of ["ambiguous", "missing"]) {
      assert.equal(
        old
          .prepare(
            "SELECT COUNT(*) n FROM hardcore_character_card_balances WHERE user_id=?",
          )
          .get(user).n,
        0,
      );
      assert.equal(
        old
          .prepare(
            "SELECT reason FROM hardcore_character_card_migrations WHERE user_id=?",
          )
          .get(user).reason,
        "requires_reconciliation",
      );
    }
    assert.equal(
      old
        .prepare(
          "SELECT soul_level FROM hardcore_owned_characters WHERE user_id='ambiguous'",
        )
        .get().soul_level,
      1,
    );
    old.close();
  });
} finally {
  catalog.catalog.characters.splice(-3);
}
(async () => {
  setup("route");
  p.addCards("route", "venance", 100);
  let result;
  const custom =
    "hardcore-char:route:all:all:0:venance:souls:ascend_select_SSR";
  await ui.handle({
    customId: custom,
    user: { id: "outsider" },
    reply: async (p) => {
      result = p;
    },
  });
  assert(result.content.includes("Chỉ người mở"));
  assert.equal(p.cards("route", "venance"), 100);
  const interaction = {
    customId: custom,
    user: { id: "route" },
    values: ["venance"],
    id: "route-action",
    deferUpdate: async () => {},
    editReply: async (p) => {
      result = p;
    },
  };
  await ui.handle(interaction);
  assert.equal(p.getOwned("route").venance.rarity, "UR");
  assert(result.content.includes("UR"));
  await ui.handle(interaction);
  assert.equal(p.cards("route", "venance"), 0);
  console.log("PASS Real ascension component guards owner and replays once");
  console.log(
    count + 1 + " character card groups passed; in-memory databases only.",
  );
  db.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
