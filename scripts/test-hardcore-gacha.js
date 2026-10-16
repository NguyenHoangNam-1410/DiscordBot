"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const characters = require("../src/hardcore/characters"),
  p = require("../src/hardcore/characters/progression"),
  banners = require("../src/hardcore/gacha/banners"),
  gacha = require("../src/hardcore/gacha/service"),
  ui = require("../src/hardcore/gacha/ui"),
  charUi = require("../src/hardcore/ui/characters"),
  bag = require("../src/hardcore/inventory/service");
const levels = require("../src/services/playerLevelService");
let groups = 0;
function test(n, f) {
  f();
  groups++;
  console.log("PASS " + n);
}
function rngPairs(pairs) {
  let i = 0;
  return () => pairs[i++ % pairs.length];
}
function draw(user, pulls = 10, extra = {}) {
  return gacha.pull({
    guildId: "g",
    userId: user,
    bannerId: "novice",
    poolVersion: 1,
    expectedRevision: p.account(user)?.revision || 0,
    pulls,
    operationId: user + ":" + Math.random(),
    rng: () => 0,
    ...extra,
  });
}
function balance(user, id) {
  return (
    db
      .prepare(
        "SELECT quantity FROM hardcore_inventory WHERE guild_id='g' AND user_id=? AND item_id=?",
      )
      .get(user, id)?.quantity || 0
  );
}
function limits(payload) {
  assert(payload.components.length <= 5);
  let total = 0;
  for (const embed of payload.embeds) {
    const e = embed.toJSON();
    assert((e.description || "").length <= 4096);
    assert((e.fields || []).length <= 25);
    for (const f of e.fields || [])
      assert(
        f.name.length <= 256 && f.value.length <= 1024 && f.value.length > 0,
      );
    total +=
      (e.title || "").length +
      (e.description || "").length +
      (e.footer?.text || "").length +
      (e.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0);
  }
  assert(total <= 6000, total);
  for (const row of payload.components) {
    const components = row.toJSON().components;
    assert(components.length <= 5);
    for (const c of components) {
      assert(c.custom_id.length <= 100);
      if (c.type === 3) {
        assert(c.options.length > 0 && c.options.length <= 25);
        assert(c.options.filter((o) => o.default).length <= 1);
      }
    }
  }
  assert(!JSON.stringify(payload).includes("undefined"));
}
async function main() {
  test("Migration, four character rarities and finite SSR to UR to LR", () => {
    assert.deepEqual(characters.RARITIES, ["SR", "SSR", "UR", "LR"]);
    assert.equal(p.nextRarity("SSR"), "UR");
    assert.equal(p.nextRarity("UR"), "LR");
    assert.equal(p.nextRarity("LR"), null);
    assert.equal(p.nextRarity("LR+1"), null);
    assert.throws(
      () =>
        characters.validate([{ ...characters.get("amazon"), rarity: "SSR+" }]),
      /INVALID_CHARACTER_CATALOG/,
    );
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
  });
  test("Opening once grants 30 tickets globally; character reads and reopen never replenish", () => {
    assert.equal(Object.keys(characters.ownedCharacters("u")).length, 7);
    assert.equal(p.account("u"), null);
    assert(gacha.open({ userId: "u", now: 123 }).granted);
    assert.equal(p.wallet("u", "novice_ticket"), 30);
    assert(!gacha.open({ userId: "u", now: 456 }).granted);
    assert.equal(p.account("u").novice_claimed_at, 123);
    assert.equal(p.wallet("u", "novice_ticket"), 30);
    assert(
      Object.values(characters.ownedCharacters("u")).every(
        (x) => x.soulLevel === 0,
      ),
    );
  });
  test("Novice 80/20 exact boundary, 7 equal SRs and real survival R pool", () => {
    const b = banners.get("novice");
    assert.equal(b.groups[0].weight, 80);
    assert.equal(b.groups[1].weight, 20);
    assert.equal(b.groups[1].entries.length, 7);
    assert.equal(banners.roll(b, rngPairs([0.7999999, 0])).rarity, "R");
    assert.equal(banners.roll(b, rngPairs([0.8, 0])).rarity, "SR");
    assert.deepEqual(
      b.groups[0].entries.map((x) => x.id).sort(),
      bag.CATALOG.filter(
        (x) =>
          x.typeCode === "R" &&
          x.gachaEligible !== false &&
          x.category !== "consumable",
      )
        .map((x) => x.id)
        .sort(),
    );
    assert(
      b.groups[0].entries.every((x) => bag.product(x.id).catalogVersion === 3),
    );
    assert.equal(b.spark, null);
  });
  let receipt;
  test("x10 commits ten items and tickets together, no gem cost, no novice Spark", () => {
    const before = levels.getPlayerProgression("g", "u").diamonds;
    receipt = draw("u", 10, { operationId: "first-ten" });
    assert.equal(receipt.results.length, 10);
    assert.equal(p.wallet("u", "novice_ticket"), 20);
    assert.equal(balance("u", receipt.results[0].id), 10);
    assert.equal(levels.getPlayerProgression("g", "u").diamonds, before);
    assert.equal(receipt.sparkGain, 0);
    assert.equal(p.wallet("u", "standard_spark"), 0);
    assert.equal(gacha.history("u").length, 1);
    const stored = db
      .prepare(
        "SELECT * FROM hardcore_character_draws WHERE operation_id='first-ten'",
      )
      .get();
    assert.equal(JSON.parse(stored.pool_json).groups[1].weight, 20);
    assert.equal(JSON.parse(stored.results_json).length, 10);
  });
  test("Identical retries replay stored results; stale and conflicting operations do not spend", () => {
    const replay = draw("u", 10, {
      operationId: "first-ten",
      expectedRevision: 0,
      rng: () => {
        throw Error("REROLL");
      },
    });
    assert(replay.duplicate);
    assert.deepEqual(replay.results, receipt.results);
    assert.equal(p.wallet("u", "novice_ticket"), 20);
    assert.throws(
      () => draw("u", 10, { expectedRevision: 0 }),
      /STALE_CHARACTER_GACHA/,
    );
    assert.throws(
      () => draw("u", 1, { operationId: "first-ten" }),
      /INVALID_CHARACTER_OPERATION/,
    );
    assert.throws(
      () => draw("u", 1, { poolVersion: 2 }),
      /STALE_CHARACTER_POOL/,
    );
    assert.equal(p.wallet("u", "novice_ticket"), 20);
  });
  test("A mid-x10 failure rolls back ticket debit, card grants, item grants, history and revision", () => {
    gacha.open({ userId: "rollback" });
    let i = 0;
    const points = [0.9, 0.2, 0, 0];
    assert.throws(
      () =>
        draw("rollback", 10, {
          operationId: "fail-ten",
          rng: () => {
            if (i >= points.length) throw Error("INJECTED");
            return points[i++];
          },
        }),
      /INJECTED/,
    );
    assert.equal(p.wallet("rollback", "novice_ticket"), 30);
    assert.equal(p.account("rollback").revision, 0);
    assert.equal(p.cards("rollback", "warrior", "SR"), 0);
    assert.equal(gacha.history("rollback").length, 0);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) n FROM hardcore_inventory WHERE user_id='rollback'",
        )
        .get().n,
      0,
    );
    assert(
      !db
        .prepare(
          "SELECT 1 FROM hardcore_character_operations WHERE operation_id='fail-ten'",
        )
        .get(),
    );
  });
  test("Exactly 30 free pulls; no gem fallback, no re-grant after exhaustion, server changes share tickets", () => {
    draw("u", 10);
    draw("u", 10, { guildId: "other-guild" });
    assert.equal(p.wallet("u", "novice_ticket"), 0);
    assert(!gacha.open({ userId: "u" }).granted);
    assert.throws(() => draw("u", 1), /INSUFFICIENT_CHARACTER_TICKETS/);
    assert.equal(p.wallet("u", "novice_ticket"), 0);
  });
  test("Duplicate SR gives five class cards, no automatic levels or overflow loss", () => {
    gacha.open({ userId: "cards" });
    const r = draw("cards", 10, { rng: rngPairs([0.9, 0.2]) });
    assert(
      r.results.every(
        (x) => x.id === "barbarian" && x.duplicate && x.cards === 5,
      ),
    );
    assert.equal(p.cards("cards", "warrior", "SR"), 50);
    assert.equal(p.cards("cards", "mage", "SR"), 0);
    assert.equal(characters.ownedCharacters("cards").barbarian.soulLevel, 0);
  });
  test("Soul upgrade spends 20 shared-class SR cards, stale retry cannot double-upgrade", () => {
    const args = {
      userId: "cards",
      characterId: "druid",
      expectedLevel: 0,
      operationId: "upgrade-one",
    };
    const r = p.upgrade(args);
    assert.equal(r.soulLevel, 1);
    assert.equal(p.cards("cards", "warrior", "SR"), 30);
    assert.equal(characters.ownedCharacters("cards").druid.soulLevel, 1);
    assert(p.upgrade(args).duplicate);
    assert.equal(p.cards("cards", "warrior", "SR"), 30);
    assert.throws(
      () => p.upgrade({ ...args, operationId: "stale" }),
      /STALE_CHARACTER_SOUL/,
    );
    assert.equal(p.cards("cards", "warrior", "SR"), 30);
  });
  test("R rewards are consumed once when carried into a new survival run", () => {
    const service = require("../src/hardcore"),
      repo = require("../src/hardcore/storage/sessions");
    const id = receipt.results[0].id,
      before = balance("u", id);
    const run = service.startHardcore({
      guildId: "g",
      userId: "u",
      channelId: "c",
      stake: 10,
      classKey: "barbarian",
      loadout: { itemIds: [id], ticketIds: [] },
      forcedEncounter: { type: "empty" },
    });
    assert.equal(balance("u", id), before - 1);
    assert(
      run.state.items.some((x) => x.definition.id === id && x.level === 1),
    );
    assert.deepEqual(run.state.initialLoadout.itemIds, [id]);
    repo.deleteSession(run.session.id);
  });
  test("S6 caps upgrades and keeps cards available for another character of the same class", () => {
    p.addCards("cards", "warrior", "SR", 100, Date.now());
    for (let n = 1; n < 6; n++)
      p.upgrade({
        userId: "cards",
        characterId: "druid",
        expectedLevel: n,
        operationId: "cap-" + n,
      });
    assert.equal(characters.ownedCharacters("cards").druid.soulLevel, 6);
    assert.throws(
      () =>
        p.upgrade({
          userId: "cards",
          characterId: "druid",
          expectedLevel: 6,
          operationId: "overcap",
        }),
      /STALE_CHARACTER_SOUL/,
    );
    const before = p.cards("cards", "warrior", "SR");
    draw("cards", 1, { rng: rngPairs([0.9, 0.2]) });
    assert.equal(p.cards("cards", "warrior", "SR"), before + 5);
    p.upgrade({
      userId: "cards",
      characterId: "barbarian",
      expectedLevel: 0,
      operationId: "other-warrior",
    });
    assert.equal(p.cards("cards", "warrior", "SR"), before + 5 - 20);
    assert.equal(characters.ownedCharacters("cards").druid.soulLevel, 6);
  });
  test("Run startup snapshots the selected soul; upgrading midrun does not rewrite saved combat", () => {
    const service = require("../src/hardcore"),
      repo = require("../src/hardcore/storage/sessions");
    gacha.open({ userId: "runner" });
    p.addCards("runner", "warrior", "SR", 40, Date.now());
    db.prepare(
      "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES('g','runner',1000000,0,0)",
    ).run();
    const old = service.startHardcore({
      guildId: "g",
      userId: "runner",
      channelId: "c",
      stake: 10,
      classKey: "druid",
      forcedEncounter: { type: "empty" },
    });
    assert.equal(old.state.characterSoul.soulLevel, 0);
    p.upgrade({
      userId: "runner",
      characterId: "druid",
      expectedLevel: 0,
      operationId: "runner-1",
    });
    assert.equal(
      JSON.parse(repo.getSession(old.session.id).state_json).characterSoul
        .soulLevel,
      0,
    );
    repo.deleteSession(old.session.id);
    const next = service.startHardcore({
      guildId: "g",
      userId: "runner",
      channelId: "c",
      stake: 10,
      classKey: "druid",
      forcedEncounter: { type: "empty" },
    });
    assert.equal(next.state.characterSoul.soulLevel, 1);
    assert.equal(
      bag.preview("druid", 10, {}, "runner").characterSoul.soulLevel,
      1,
    );
    repo.deleteSession(next.session.id);
    assert.equal(
      require("../src/hardcore/characters/souls").level({
        ...next.state,
        mode: "tower_weekly",
      }),
      0,
    );
  });
  test("Future banners validate gem cost 300, x10 no discount, SSR copies and separate card rarities", () => {
    const extra = {
      ...characters.get("sorceress"),
      id: "future_mage",
      rarity: "SSR",
      starter: false,
      name: "Future Mage",
    };
    characters.catalog.characters.push(extra);
    const get = banners.get;
    try {
      const b = banners.resolve({
        id: "test_future",
        version: 2,
        name: "Future",
        enabled: true,
        payment: { kind: "gems", currencyId: "gems", unitCost: 300 },
        spark: { currencyId: "future_spark", perPull: 1 },
        pool: [
          {
            kind: "character",
            rarity: "SSR",
            weight: 100,
            characterIds: [extra.id],
          },
        ],
      });
      assert.throws(
        () =>
          banners.resolve({ ...b, payment: { ...b.payment, unitCost: 270 } }),
        /INVALID_CHARACTER_BANNER/,
      );
      assert.throws(
        () =>
          banners.resolve({
            ...b,
            pool: [
              {
                kind: "character",
                rarity: "SSR",
                weight: 100,
                characterIds: [],
              },
            ],
          }),
        /EMPTY_CHARACTER_POOL/,
      );
      banners.get = (id) => (id === b.id ? b : get(id));
      gacha.open({ userId: "future" });
      levels.addDiamonds("g", "future", 3000);
      p.addCards("future", "mage", "SR", 20, 0);
      const r = draw("future", 10, {
        bannerId: b.id,
        poolVersion: 2,
        rng: () => 0,
      });
      assert.equal(r.payment.cost, 3000);
      assert(!r.results[0].duplicate);
      assert(r.results.slice(1).every((x) => x.cards === 50));
      assert.equal(p.cards("future", "mage", "SSR"), 450);
      assert.equal(p.wallet("future", "future_spark"), 10);
      assert.equal(levels.getPlayerProgression("g", "future").diamonds, 0);
      p.upgrade({
        userId: "future",
        characterId: extra.id,
        expectedLevel: 0,
        operationId: "future-up",
      });
      assert.equal(p.cards("future", "mage", "SSR"), 400);
      assert.equal(p.cards("future", "mage", "SR"), 20);
      assert.throws(
        () => draw("future", 1, { bannerId: b.id, poolVersion: 2 }),
        /INSUFFICIENT_DIAMONDS/,
      );
      assert.equal(p.wallet("future", "future_spark"), 10);
    } finally {
      banners.get = get;
      characters.catalog.characters.pop();
    }
  });
  test("Venance rolls rarity first, then SSR rate-up; lone SSR is always Venance", () => {
    const b = banners.get("venance");
    assert.equal(banners.roll(b, rngPairs([0.799999, 0])).rarity, "R");
    assert.equal(banners.roll(b, rngPairs([0.8, 0])).rarity, "SR");
    assert.equal(banners.roll(b, rngPairs([0.989999, 0])).rarity, "SR");
    assert.equal(banners.roll(b, rngPairs([0.99, 0.99])).id, "venance");
    const extra = {
      ...characters.get("venance"),
      id: "offbanner_mage",
      name: "Other Mage",
    };
    characters.catalog.characters.push(extra);
    try {
      const definition = structuredClone(
        require("../src/hardcore/gacha/banners.json").banners.find(
          (b) => b.id === "venance",
        ),
      );
      definition.pool
        .find((p) => p.rarity === "SSR")
        .characterIds.push(extra.id);
      const future = banners.resolve(definition);
      assert.equal(
        banners.roll(future, rngPairs([0.99, 0.499999])).id,
        "venance",
      );
      assert.equal(banners.roll(future, rngPairs([0.99, 0.5, 0])).id, extra.id);
      assert.equal(banners.roll(future, rngPairs([0.99, 0.9, 0])).id, extra.id);
      assert.equal(
        banners.roll(future, rngPairs([0.99, 0.9, 0])).id,
        extra.id,
        "No guaranteed featured after losing rate-up",
      );
      definition.pool.find((p) => p.rarity === "SSR").rateUp.chance = 2;
      assert.throws(
        () => banners.resolve(definition),
        /INVALID_BANNER_RATE_UP/,
      );
    } finally {
      characters.catalog.characters.pop();
    }
    assert.throws(
      () =>
        banners.resolve({
          ...require("../src/hardcore/gacha/banners.json").banners[1],
          graphic: "../secret.jpg",
        }),
      /INVALID_BANNER_GRAPHIC/,
    );
  });
  test("Venance gem pulls cost 300 each, grant Spark on SSR too, retry once and roll back a failed x10", () => {
    gacha.open({ userId: "venance-paid" });
    levels.addDiamonds("g", "venance-paid", 3300);
    const r = draw("venance-paid", 10, { bannerId: "venance", rng: () => 0 });
    assert.equal(r.payment.cost, 3000);
    assert.equal(r.sparkGain, 10);
    assert.equal(p.wallet("venance-paid", "venance_spark"), 10);
    const args = {
      guildId: "g",
      userId: "venance-paid",
      bannerId: "venance",
      poolVersion: 1,
      expectedRevision: p.account("venance-paid").revision,
      pulls: 1,
      operationId: "venance-SSR",
      rng: () => 0.999,
    };
    const ssr = gacha.pull(args);
    assert.equal(ssr.results[0].id, "venance");
    assert.equal(p.wallet("venance-paid", "venance_spark"), 11);
    assert(gacha.pull(args).duplicate);
    assert.equal(p.wallet("venance-paid", "venance_spark"), 11);
    assert.equal(levels.getPlayerProgression("g", "venance-paid").diamonds, 0);
    levels.addDiamonds("g", "venance-paid", 3000);
    const before = JSON.stringify([
      p.account("venance-paid"),
      p.cards("venance-paid", "mage", "SSR"),
      gacha.history("venance-paid"),
    ]);
    let calls = 0;
    assert.throws(
      () =>
        draw("venance-paid", 10, {
          bannerId: "venance",
          rng: () => {
            if (++calls === 2) throw Error("FORCED_DRAW_FAILURE");
            return 0.999;
          },
        }),
      /FORCED_DRAW_FAILURE/,
    );
    assert.equal(
      levels.getPlayerProgression("g", "venance-paid").diamonds,
      3000,
    );
    assert.equal(p.wallet("venance-paid", "venance_spark"), 11);
    assert.equal(
      JSON.stringify([
        p.account("venance-paid"),
        p.cards("venance-paid", "mage", "SSR"),
        gacha.history("venance-paid"),
      ]),
      before,
    );
  });
  test("200 Spark redemption is atomic, replay-safe, revision-checked and duplicate SSR gives cards", () => {
    const user = "venance-spark";
    gacha.open({ userId: user });
    p.addWallet(user, "venance_spark", 199, 0);
    const args = {
      userId: user,
      bannerId: "venance",
      poolVersion: 1,
      expectedRevision: 0,
      operationId: "spark-first",
    };
    assert.throws(() => gacha.redeem(args), /INSUFFICIENT_CHARACTER_SPARK/);
    assert.equal(p.wallet(user, "venance_spark"), 199);
    p.addWallet(user, "venance_spark", 1, 0);
    const first = gacha.redeem(args);
    assert.equal(first.results[0].id, "venance");
    assert(!first.results[0].duplicate);
    assert(gacha.redeem(args).duplicate);
    assert.equal(p.wallet(user, "venance_spark"), 0);
    assert.throws(
      () => gacha.redeem({ ...args, operationId: "spark-stale" }),
      /STALE_CHARACTER_GACHA/,
    );
    p.addWallet(user, "venance_spark", 200, 0);
    const grant = p.grantCharacter;
    try {
      p.grantCharacter = () => {
        throw Error("FORCED_REDEEM_FAILURE");
      };
      assert.throws(
        () =>
          gacha.redeem({
            ...args,
            expectedRevision: 1,
            operationId: "spark-fail",
          }),
        /FORCED_REDEEM_FAILURE/,
      );
      assert.equal(p.wallet(user, "venance_spark"), 200);
      assert.equal(p.account(user).revision, 1);
    } finally {
      p.grantCharacter = grant;
    }
    const copy = gacha.redeem({
      ...args,
      expectedRevision: 1,
      operationId: "spark-copy",
    });
    assert(copy.results[0].duplicate);
    assert.equal(copy.results[0].cards, 50);
    assert.equal(p.cards(user, "mage", "SSR"), 50);
    assert.equal(p.wallet(user, "venance_spark"), 0);
    assert.throws(
      () =>
        gacha.redeem({
          ...args,
          bannerId: "novice",
          expectedRevision: 2,
          operationId: "spark-forge",
        }),
      /CHARACTER_BANNER_CLOSED/,
    );
  });
  test("Venance graphic attaches from the per-banner folder and Spark controls fit Discord", () => {
    const screen = ui.payload("venance-paid", {
      guildId: "g",
      bannerId: "venance",
    });
    limits(screen);
    assert.equal(
      screen.embeds[0].data.image.url,
      "attachment://venance-banner.jpg",
    );
    assert.equal(screen.files[0].name, "venance-banner.jpg");
    assert(require("node:fs").existsSync(screen.files[0].attachment));
    assert.equal(screen.embeds[0].data.title, "Venance [SSR]");
    assert(screen.embeds[0].data.description.includes("Astral Armament"));
    assert(
      screen.embeds[0].data.description.includes(
        require("../src/hardcore/shared/icons").SKILL_ICONS.venance,
      ),
    );
    assert(screen.embeds[0].data.description.includes("**×1:** 300"));
    assert(screen.embeds[0].data.description.includes("**×10:** 3.000"));
    assert(screen.embeds[0].data.description.includes("Spark"));
    assert(
      !(screen.embeds[0].data.fields || []).some((f) =>
        ["Tỷ lệ", "Quy tắc", "Rate-up SSR", "Nhân vật trong banner"].includes(
          f.name,
        ),
      ),
    );
    const details = ui.payload("venance-paid", {
      guildId: "g",
      bannerId: "venance",
      showDetails: true,
    });
    limits(details);
    assert(JSON.stringify(details).includes("SSR 1%"));
    assert(JSON.stringify(details).includes("Venance 100%"));
    assert(JSON.stringify(details).includes("/sinhton cuahang"));
    assert.equal(details.files.length, 0);
    assert.equal(details.embeds[0].data.image, undefined);
    limits(
      ui.payload("venance-paid", {
        guildId: "g",
        bannerId: "novice",
        showDetails: true,
      }),
    );
    assert.deepEqual(screen.attachments, []);
    limits(
      ui.payload("venance-spark", {
        guildId: "g",
        bannerId: "venance",
        receipt: {
          kind: "spark",
          sparkSpent: 200,
          results: [
            {
              kind: "character",
              id: "venance",
              name: "Venance",
              rarity: "SSR",
              duplicate: true,
              cards: 50,
              classKey: "mage",
            },
          ],
        },
      }),
    );
    assert.equal(
      ui.payload("venance-paid", { guildId: "g", bannerId: "novice" }).files
        .length,
      0,
    );
  });
  test("SQLite snapshot/backup includes accounts, claims, wallets, cards and exact draw results", () => {
    const copy = new Database(db.serialize());
    assert.equal(
      copy
        .prepare(
          "SELECT novice_claimed_at FROM hardcore_character_accounts WHERE user_id='u'",
        )
        .get().novice_claimed_at,
      123,
    );
    assert.equal(
      copy
        .prepare(
          "SELECT quantity FROM hardcore_character_wallets WHERE user_id='u' AND currency_id='novice_ticket'",
        )
        .get().quantity,
      0,
    );
    assert.equal(
      copy
        .prepare(
          "SELECT soul_level FROM hardcore_owned_characters WHERE user_id='cards' AND character_id='druid'",
        )
        .get().soul_level,
      6,
    );
    assert.deepEqual(
      JSON.parse(
        copy
          .prepare(
            "SELECT results_json FROM hardcore_character_draws WHERE operation_id='first-ten'",
          )
          .get().results_json,
      ),
      receipt.results,
    );
    copy.close();
  });
  test("Banner and character UI fit Discord at S6 and all R/SR result combinations", () => {
    for (const user of ["u", "cards", "runner"]) {
      limits(ui.payload(user));
      limits(ui.payload(user, { showHistory: true }));
      limits(charUi.payload(user, { id: "druid", tab: "souls" }));
    }
    limits(
      ui.payload("cards", {
        receipt: {
          pulls: 10,
          results: banners.get("novice").groups[0].entries.slice(0, 10),
        },
      }),
    );
    const screen = charUi.payload("cards", { id: "druid", tab: "souls" });
    assert.equal(
      screen.embeds[0].data.fields.filter((x) => /^✅ S[1-6]/.test(x.name))
        .length,
      6,
    );
    assert(JSON.stringify(screen).includes("Đã đạt S6"));
  });
  const routes = require("../src/componentRouter").ROUTES.filter(
    (x) => x.prefix === "hardcore-cg:",
  );
  assert.deepEqual(routes.map((x) => x.kind).sort(), ["button", "select"]);
  const command = require("../src/commandRegistry")
    .loadCommands("./commands")
    .find((c) => c.data.toJSON().name === "sinhton");
  assert(command.data.toJSON().options.some((o) => o.name === "gacha"));
  let opened;
  await command.execute({
    guildId: "g",
    user: { id: "ui-user" },
    options: { getSubcommand: () => "gacha" },
    deferReply: async () => {},
    editReply: async (x) => (opened = x),
  });
  limits(opened);
  assert.equal(p.wallet("ui-user", "novice_ticket"), 30);
  const pullId = opened.components
    .flatMap((x) => x.toJSON().components)
    .find((x) => x.label === "Quay ×1").custom_id;
  let response, rejected;
  const interaction = {
    guildId: "g",
    user: { id: "ui-user" },
    id: "discord-pull",
    customId: pullId,
    deferUpdate: async () => {},
    editReply: async (x) => (response = x),
    reply: async (x) => (rejected = x),
  };
  await ui.handle(interaction);
  assert(!rejected);
  limits(response);
  assert.equal(p.wallet("ui-user", "novice_ticket"), 29);
  await ui.handle(interaction);
  assert.equal(p.wallet("ui-user", "novice_ticket"), 29);
  await ui.handle({ ...interaction, id: "old-screen" });
  assert(response.content.includes("Bảng đã thay đổi"));
  assert.equal(p.wallet("ui-user", "novice_ticket"), 29);
  await ui.handle({ ...interaction, user: { id: "someone-else" } });
  assert(rejected);
  rejected = null;
  await ui.handle({
    ...interaction,
    customId: pullId.replace(/pull1$/, "banner"),
    values: ["forged"],
  });
  assert(rejected);
  groups++;
  console.log(
    "PASS Real command and component routes: owner guard, acknowledgements, replay and stale refresh",
  );
  const storeUi = require("../src/hardcore/inventory/view");
  gacha.open({ userId: "spark-ui" });
  p.addWallet("spark-ui", "venance_spark", 200, 0);
  const gachaScreen = ui.payload("spark-ui", {
    guildId: "g",
    bannerId: "venance",
  });
  const controls = gachaScreen.components.flatMap((r) => r.toJSON().components);
  assert(!controls.some((c) => c.custom_id.endsWith(":redeem")));
  assert(!controls.some((c) => c.custom_id.endsWith(":shop")));
  const detailsId = controls.find((c) =>
    c.custom_id.endsWith(":details"),
  ).custom_id;
  const shopId = detailsId.replace(/details$/, "shop");
  let sparkResponse,
    ack = 0,
    denial;
  const interactionForSpark = {
    guildId: "g",
    user: { id: "spark-ui" },
    id: "spark-ui-exchange",
    customId: shopId,
    deferUpdate: async () => {
      ack++;
    },
    update: async (v) => {
      sparkResponse = v;
    },
    editReply: async (v) => {
      sparkResponse = v;
    },
    reply: async (v) => {
      denial = v;
    },
  };
  const beforeView = JSON.stringify([
    p.account("spark-ui"),
    p.wallet("spark-ui", "venance_spark"),
    levels.getPlayerProgression("g", "spark-ui").diamonds,
  ]);
  await ui.handle({
    ...interactionForSpark,
    customId: detailsId,
    id: "view-details",
  });
  assert(sparkResponse.embeds[0].data.fields.some((f) => f.name === "Tỷ lệ"));
  const backId = sparkResponse.components
    .flatMap((r) => r.toJSON().components)
    .find((c) => c.custom_id.endsWith(":overview")).custom_id;
  await ui.handle({
    ...interactionForSpark,
    customId: backId,
    id: "view-overview",
  });
  assert(!(sparkResponse.embeds[0].data.fields || []).length);
  assert.equal(
    JSON.stringify([
      p.account("spark-ui"),
      p.wallet("spark-ui", "venance_spark"),
      levels.getPlayerProgression("g", "spark-ui").diamonds,
    ]),
    beforeView,
  );
  ack = 0;
  await ui.handle(interactionForSpark);
  limits(sparkResponse);
  assert(sparkResponse.embeds[0].data.title.includes("CỬA HÀNG"));
  assert.equal(p.wallet("spark-ui", "venance_spark"), 200);
  await ui.handle({
    ...interactionForSpark,
    customId: shopId.replace(/shop$/, "redeem"),
  });
  assert.equal(
    p.wallet("spark-ui", "venance_spark"),
    200,
    "Old gacha redeem buttons only redirect",
  );
  const menu = sparkResponse.components
    .flatMap((r) => r.toJSON().components)
    .find((c) => c.custom_id.endsWith(":spark"));
  assert.equal(menu.options.length, 1);
  assert.equal(menu.options[0].value, "venance@1");
  const sparkInteraction = {
    ...interactionForSpark,
    customId: menu.custom_id,
    values: ["venance@1"],
  };
  await storeUi.handleStore({
    ...sparkInteraction,
    user: { id: "wrong-owner" },
  });
  assert(denial);
  assert.equal(p.wallet("spark-ui", "venance_spark"), 200);
  await storeUi.handleStore(sparkInteraction);
  assert.equal(ack, 1);
  limits(sparkResponse);
  assert.equal(p.wallet("spark-ui", "venance_spark"), 0);
  assert(sparkResponse.content.includes("Đã đổi 200 Spark"));
  await storeUi.handleStore(sparkInteraction);
  assert.equal(p.wallet("spark-ui", "venance_spark"), 0);
  assert.equal(p.cards("spark-ui", "mage", "SSR"), 0);
  await storeUi.handleStore({ ...sparkInteraction, id: "spark-ui-stale" });
  assert(sparkResponse.content.includes("Bảng đã thay đổi"));
  await storeUi.handleStore({
    ...sparkInteraction,
    id: "spark-ui-forge",
    values: ["novice@1"],
  });
  assert(sparkResponse.content.includes("Chỉ đổi được nhân vật rate-up"));
  const getBanner = banners.get;
  try {
    const b = structuredClone(banners.get("venance"));
    b.id = "not_rate_up";
    b.groups.forEach((g) => {
      delete g.rateUp;
    });
    banners.get = (id) => (id === b.id ? b : getBanner(id));
    assert.throws(
      () =>
        gacha.redeem({
          userId: "spark-ui",
          bannerId: b.id,
          poolVersion: 1,
          expectedRevision: p.account("spark-ui").revision,
          operationId: "outside-rate-up",
        }),
      /CHARACTER_BANNER_CLOSED/,
    );
  } finally {
    banners.get = getBanner;
  }
  groups++;
  console.log(
    "PASS Spark store: rate-up-only offers, owner/replay/stale guards and old gacha buttons redirect",
  );
  const cp = charUi.payload("runner", { id: "druid", tab: "souls" });
  const upgrade = cp.components
    .flatMap((x) => x.toJSON().components)
    .find((x) => x.custom_id.endsWith(":upgrade_1"));
  let upgraded;
  await charUi.handle({
    guildId: "g",
    user: { id: "runner" },
    customId: upgrade.custom_id,
    id: "ui-upgrade",
    deferUpdate: async () => {},
    editReply: async (x) => (upgraded = x),
  });
  limits(upgraded);
  assert.equal(characters.ownedCharacters("runner").druid.soulLevel, 2);
  assert.equal(p.cards("runner", "warrior", "SR"), 0);
  groups++;
  console.log(
    "PASS Real character upgrade button spends once and refreshes all soul levels",
  );
  const backPanel = charUi.payload("runner", { id: "druid", tab: "souls" });
  const back = backPanel.components
    .flatMap((x) => x.toJSON().components)
    .find((x) => x.custom_id.endsWith(":gacha"));
  let returned;
  await charUi.handle({
    guildId: "g",
    user: { id: "runner" },
    customId: back.custom_id,
    update: async (x) => (returned = x),
  });
  limits(returned);
  assert.equal(returned.embeds[0].data.title, "Khởi Hành");
  console.log(groups + " character gacha groups passed; no simulations.");
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
