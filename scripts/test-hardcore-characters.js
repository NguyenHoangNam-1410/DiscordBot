"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const characters = require("../src/hardcore/characters");
const ui = require("../src/hardcore/ui/characters");
const stats = require("../src/hardcore/engine/stats");
const { setApplicationEmojisForTest } = require("../src/utils/appEmoji");
const owner = "697794640148955206";
const stringify = (p) =>
  JSON.stringify({
    ...p,
    embeds: p.embeds.map((e) => e.toJSON()),
    components: p.components.map((c) => c.toJSON()),
  });
function limits(p) {
  assert(p.components.length <= 5);
  const e = p.embeds[0].toJSON();
  assert((e.description || "").length <= 4096);
  assert((e.fields || []).length <= 25);
  assert(
    (e.fields || []).every((f) => f.value.length <= 1024 && f.value.length > 0),
  );
  const length =
    (e.title || "").length +
    (e.description || "").length +
    (e.footer?.text || "").length +
    (e.fields || []).reduce(
      (sum, f) => sum + f.name.length + f.value.length,
      0,
    );
  assert(length <= 6000, length);
  for (const row of p.components) {
    const r = row.toJSON();
    assert(r.components.length <= 5);
    for (const c of r.components) {
      assert(c.custom_id.length <= 100, c.custom_id);
      if (c.type === 3) {
        assert(c.options.length > 0 && c.options.length <= 25);
        assert(c.options.filter((o) => o.default).length <= 1);
        assert(
          c.options.every(
            (o) =>
              o.label.length <= 100 &&
              (!o.description || o.description.length <= 100),
          ),
        );
      }
    }
  }
  assert(!stringify(p).includes("undefined"));
  assert(!stringify(p).includes("NaN"));
}
function component(p, kind) {
  return p.components
    .flatMap((r) => r.toJSON().components)
    .find((c) => c.custom_id.endsWith(":" + kind));
}
async function click(p, kind, values, userId = owner, customId) {
  const result = {};
  await ui.handle({
    customId: customId || component(p, kind).custom_id,
    values,
    user: { id: userId },
    reply: async (data) => {
      result.error = data;
    },
    update: async (data) => {
      result.payload = data;
    },
  });
  return result;
}
async function main() {
  assert(characters.validate());
  assert.deepEqual(Object.keys(characters.CLASSES), [
    "warrior",
    "guardian",
    "assassin",
    "mage",
  ]);
  const expectedGroups = {
    warrior: ["barbarian", "druid"],
    guardian: ["paladin"],
    assassin: ["amazon", "assassin"],
    mage: ["sorceress", "necromancer", "venance"],
  };
  const expectedStats = {
    warrior: "str",
    guardian: "vit",
    assassin: "dex",
    mage: "ene",
  };
  for (const [key, ids] of Object.entries(expectedGroups)) {
    assert.deepEqual(
      characters
        .list({ classKey: key })
        .map((c) => c.id)
        .sort(),
      ids.sort(),
    );
    assert.equal(characters.CLASSES[key].primaryStat, expectedStats[key]);
    for (const id of ids) {
      const preview = require("../src/hardcore/ui").setupPreview(
        characters.get(id).profileKey,
      );
      assert(preview.role.includes(characters.CLASSES[key].name));
      assert(
        preview.role.includes("Build " + expectedStats[key].toUpperCase()),
      );
    }
  }
  assert(
    require("../src/hardcore/ui")
      .setupPreview("paladin")
      .build.includes("Ưu tiên VIT"),
  );
  assert.equal(characters.catalog.characters.length, 8);
  assert.equal(
    characters.catalog.characters.flatMap((c) => c.souls).length,
    48,
  );
  const owned = characters.ownedCharacters();
  assert.equal(Object.keys(owned).length, 7);
  assert(Object.values(owned).every((c) => c.soulLevel === 0));
  owned.amazon.soulLevel = 6;
  assert.equal(characters.ownedCharacters().amazon.soulLevel, 0);
  assert.equal(characters.catalog.soulDesign.completionTarget.min, 0.3);
  assert.equal(characters.catalog.soulDesign.completionTarget.max, 0.35);
  assert.equal(characters.catalog.soulDesign.validated, false);
  const { soulIcon } = require("../src/hardcore/shared/icons");
  assert.equal(soulIcon("amazon", 1), "✨");
  assert.equal(soulIcon("amazon", 0), "✨");
  assert.equal(soulIcon("unknown", 1), "✨");
  const soulEmojis = characters.catalog.characters.flatMap((c, ci) =>
    c.souls.map((s, si) => {
      assert.equal(s.emojiName, "soul_" + c.id + "_" + s.level);
      return [s.emojiName, String(1557000000000000500n + BigInt(ci * 6 + si))];
    }),
  );
  assert.equal(new Set(soulEmojis.map((x) => x[0])).size, 48);
  setApplicationEmojisForTest([
    ...soulEmojis,
    ...Object.keys(stats.CLASSES).map((k, i) => [
      "class_" + k,
      String(1557000000000000000n + BigInt(i)),
    ]),
    ...[
      "HP",
      "Mana",
      "STR",
      "DEX",
      "VIT",
      "ENE",
      "ACC",
      "EVA",
      "CRIT",
      "DEF",
      "RES",
    ].map((k, i) => [k, String(1557000000000000100n + BigInt(i))]),
  ]);
  // Exercise the /sinhton batdau payload with custom emoji markup, not only Unicode fallbacks.
  const setupView = require("../src/hardcore/legacy/ui");
  const setupDraft = {
    id: "setup-test",
    version: 0,
    classKey: null,
    stake: null,
  };
  const allSetupClasses = Object.fromEntries(
    characters.catalog.characters.map((c) => [
      c.profileKey,
      stats.CLASSES[c.profileKey],
    ]),
  );
  for (const gameplayVersion of [2, 3]) {
    for (const classes of [
      Object.fromEntries(
        Object.entries(allSetupClasses).filter(([k]) => k !== "venance"),
      ),
      allSetupClasses,
    ]) {
      const context = { gameplayVersion, balance: 100000, maxBet: 100000 };
      const screen = setupView.hardcoreSetupPayload(
        setupDraft,
        classes,
        context,
      );
      limits(screen);
      const text = stringify(screen);
      for (const c of Object.values(classes)) assert(text.includes(c.name));
      assert.equal(
        screen.components[0].toJSON().components[0].options.length,
        Object.keys(classes).length,
      );
      assert(
        screen.components[1]
          .toJSON()
          .components.find((c) => c.custom_id.endsWith(":next")).disabled,
      );
      for (const key of Object.keys(classes)) {
        const selected = setupView.hardcoreSetupPayload(
          { ...setupDraft, classKey: key, stake: 100000 },
          classes,
          context,
        );
        limits(selected);
        assert(
          !selected.components[1]
            .toJSON()
            .components.find((c) => c.custom_id.endsWith(":next")).disabled,
        );
      }
    }
  }
  // Test the actual open/setup flow for a player who owns the eighth character.
  const progress = require("../src/hardcore/characters/progression");
  progress.grantCharacter(owner, "venance", 0);
  const drafts = new Map();
  const setupFlow = require("../src/hardcore/runtime/setupFlow")({
    crypto: require("node:crypto"),
    MessageFlags: require("discord.js").MessageFlags,
    getAccount: () => ({ balance: 100000 }),
    getGameBetLimit: () => 100000,
    requireGameChannel: async () => true,
    useV2: () => true,
    MIN_BET: 10,
    MAX_BET: 100000,
    CLASSES: allSetupClasses,
    getHardcoreByUser: () => null,
    SETUP_IDLE_MS: 300000,
    setupDrafts: drafts,
    hardcoreView: setupView,
  });
  let opened;
  const draft = await setupFlow.openHardcoreSetup({
    guildId: "characters",
    channelId: "c",
    user: { id: owner, username: "Test" },
    reply: async (p) => {
      limits(p);
      opened = p;
      return { id: "setup-message" };
    },
    editReply: async () => {},
  });
  assert(opened);
  assert.equal(drafts.size, 1);
  assert.equal(opened.components[0].toJSON().components[0].options.length, 8);
  setupFlow.closeSetup(draft);
  // Keep the remaining character ownership assertions at their original seven-SR baseline.
  db.prepare(
    "DELETE FROM hardcore_owned_characters WHERE user_id=? AND character_id='venance'",
  ).run(owner);
  console.log(
    "PASS Setup overview and every character in V2/V3 fit Discord with custom emojis; real batdau flow opens with eight characters",
  );
  const overview = ui.payload(owner);
  limits(overview);
  assert.equal(component(overview, "class").options.length, 5);
  assert(stringify(overview).includes("class_amazon"));
  const frozen = JSON.stringify(characters.catalog);
  for (const c of characters.catalog.characters) {
    for (const soul of c.souls) {
      const expected = soulEmojis.find((x) => x[0] === soul.emojiName);
      assert.equal(
        soulIcon(c, soul.level),
        "<:" + soul.emojiName + ":" + expected[1] + ">",
      );
    }
    const soulState = characters.preview(c.id, 6);
    const summary = require("../src/hardcore/characters/souls").summary(
      soulState,
    );
    for (const soul of c.souls)
      assert(summary.includes(soulIcon(c, soul.level)));
    soulState.encounter = { type: "empty", name: "Fixture" };
    const battle = require("../src/hardcore/ui")
      .embed(soulState, owner)
      .toJSON();
    assert(battle.description.includes(soulIcon(c, 6)));
    const current = characters.preview(c.id);
    const actual = stats.createState(c.profileKey, 0, { gameplayVersion: 3 });
    for (const k of [
      "str",
      "dex",
      "vit",
      "ene",
      "maxHp",
      "maxMana",
      "defense",
      "resistance",
      "critChance",
    ])
      assert.equal(current[k], actual[k]);
    for (const tab of ["stats", "skills", "souls"]) {
      const p = ui.payload(owner, { id: c.id, tab });
      limits(p);
      if (tab === "souls")
        for (const soul of c.souls)
          assert(stringify(p).includes(soulIcon(c, soul.level)));
      if (c.starter)
        assert.equal(
          component(p, "upgrade_0").emoji.name,
          c.souls[0].emojiName,
        );
      else assert(!component(p, "upgrade_0"));
      {
        assert.equal(
          p.embeds[0].data.fields.filter((f) => /^🔒 S[1-6]/.test(f.name))
            .length,
          tab === "souls" ? 6 : 0,
        );
        assert.equal(
          stringify(p).includes("hiệu ứng chiến đấu"),
          tab === "souls",
        );
        assert.equal(stringify(p).includes("khởi đầu S0"), tab === "souls");
      }
    }
  }
  assert.equal(JSON.stringify(characters.catalog), frozen);
  let result = await click(overview, "rarity", ["SSR"]);
  limits(result.payload);
  assert(stringify(result.payload).includes("Venance"));
  assert.equal(component(result.payload, "character").options.length, 1);
  assert((await click(result.payload, "character", ["amazon"])).error);
  result = await click(overview, "class", ["warrior"]);
  assert.equal(component(result.payload, "character").options.length, 2);
  const filtered = result.payload;
  assert((await click(filtered, "character", ["sorceress"])).error);
  result = await click(filtered, "character", ["druid"]);
  assert.equal(
    result.payload.embeds[0].data.fields.filter((f) =>
      /^🔒 S[1-6]/.test(f.name),
    ).length,
    0,
    "stats tab does not repeat the dedicated soul tab",
  );
  assert(stringify(result.payload).includes("Wild Growth"));
  result = await click(result.payload, "tab_skills");
  assert(stringify(result.payload).includes("Wild Regeneration"));
  result = await click(result.payload, "tab_souls");
  assert(stringify(result.payload).includes("Rễ bám sinh tồn"));
  result = await click(result.payload, "overview");
  assert(component(result.payload, "overview").disabled);
  assert((await click(overview, "rarity", ["SR"], "other")).error);
  assert((await click(overview, "rarity", ["not_a_rarity"])).error);
  assert((await click(overview, "rarity", ["SR", "SSR"])).error);
  assert(
    (
      await click(
        overview,
        "rarity",
        ["SR"],
        owner,
        component(overview, "rarity").custom_id.replace(":0:", ":99999:"),
      )
    ).error,
  );
  const oldLength = characters.catalog.characters.length;
  try {
    for (let i = 0; i < 18; i++)
      characters.catalog.characters.push({
        ...characters.get("amazon"),
        id: "future_" + i,
        name: "Nhân vật mới " + i,
        starter: false,
      });
    assert(characters.validate());
    assert(!characters.ownedCharacters().future_0);
    const more = ui.payload(owner, { classKey: "assassin" });
    limits(more);
    const next = await click(more, "next");
    limits(next.payload);
    assert.equal(component(next.payload, "character").options.length, 8);
    assert((await click(next.payload, "character", ["future_17"])).payload);
    assert((await click(more, "character", ["future_17"])).error);
  } finally {
    characters.catalog.characters.splice(oldLength);
  }
  const commands = require("../src/commandRegistry").loadCommands("./commands");
  const command = commands.find((c) => c.data.toJSON().name === "sinhton");
  assert(command.data.toJSON().options.some((c) => c.name === "nhanvat"));
  const raw = require("../src/hardcore/command");
  let reply;
  await raw.execute({
    guildId: "characters",
    user: { id: owner },
    options: { getSubcommand: () => "nhanvat" },
    reply: async (p) => {
      reply = p;
    },
  });
  assert.equal(reply.flags, require("discord.js").MessageFlags.Ephemeral);
  limits(reply);
  reply = null;
  await command.execute({
    guildId: "characters",
    user: { id: owner },
    options: { getSubcommand: () => "nhanvat" },
    reply: async (p) => {
      reply = p;
    },
  });
  limits(reply);
  const routes = require("../src/componentRouter").ROUTES.filter(
    (r) => r.prefix === "hardcore-char:",
  );
  assert.deepEqual(routes.map((r) => r.kind).sort(), ["button", "select"]);
  const state = stats.createState("druid", 10000);
  const snapshot = JSON.stringify(state);
  ui.payload(owner, { id: "druid", tab: "souls" });
  assert.equal(JSON.stringify(state), snapshot);
  console.log(
    "PASS: seven S0 entitlements, Venance SSR, 48 combat souls, live S0 stats, all tabs/filters, SSR pool, future same-class characters, pagination, ownership/forged guards, command/routes and Discord limits; no simulations.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    setApplicationEmojisForTest([]);
    db.close();
  });
