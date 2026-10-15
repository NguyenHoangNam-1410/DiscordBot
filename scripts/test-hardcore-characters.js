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
  assert.equal(characters.catalog.characters.length, 7);
  assert.equal(
    characters.catalog.characters.flatMap((c) => c.souls).length,
    42,
  );
  const owned = characters.ownedCharacters();
  assert.equal(Object.keys(owned).length, 7);
  assert(Object.values(owned).every((c) => c.soulLevel === 0));
  owned.amazon.soulLevel = 6;
  assert.equal(characters.ownedCharacters().amazon.soulLevel, 0);
  assert.equal(characters.catalog.soulDesign.completionTarget.min, 0.3);
  assert.equal(characters.catalog.soulDesign.completionTarget.max, 0.35);
  assert.equal(characters.catalog.soulDesign.validated, false);
  setApplicationEmojisForTest([
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
  const overview = ui.payload(owner);
  limits(overview);
  assert(stringify(overview).includes("class_amazon"));
  const frozen = JSON.stringify(characters.catalog);
  for (const c of characters.catalog.characters) {
    const current = characters.preview(c.id);
    const actual = stats.createState(c.classKey, 0, { gameplayVersion: 3 });
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
      if (tab === "souls") {
        assert.equal(
          p.embeds[0].data.fields.filter((f) => /^🔒 S[1-6]/.test(f.name))
            .length,
          6,
        );
        assert(stringify(p).includes("30–35%"));
        assert(stringify(p).includes("chưa kiểm chứng"));
      }
    }
  }
  assert.equal(JSON.stringify(characters.catalog), frozen);
  let result = await click(overview, "rarity", ["SSR"]);
  limits(result.payload);
  assert(stringify(result.payload).includes("Chưa có nhân vật"));
  assert(component(result.payload, "character").disabled);
  assert((await click(result.payload, "character", ["amazon"])).error);
  result = await click(overview, "class", ["druid"]);
  assert.equal(component(result.payload, "character").options.length, 1);
  const filtered = result.payload;
  assert((await click(filtered, "character", ["sorceress"])).error);
  result = await click(filtered, "character", ["druid"]);
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
    const more = ui.payload(owner, { classKey: "amazon" });
    limits(more);
    const next = await click(more, "next");
    limits(next.payload);
    assert.equal(component(next.payload, "character").options.length, 7);
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
    "PASS: seven S0 entitlements, 42 draft souls, live S0 stats, all tabs/filters, empty pool, future same-class characters, pagination, ownership/forged guards, command/routes and Discord limits; no simulations.",
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
