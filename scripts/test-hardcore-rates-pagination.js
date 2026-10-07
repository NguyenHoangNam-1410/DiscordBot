"use strict";
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function emojiFixture(animated) {
  const source = ["shared/icons.js", "ui/rules.js", "towerMemories.js"]
    .map((file) =>
      fs.readFileSync(path.join(__dirname, "../src/hardcore", file), "utf8"),
    )
    .join("\n");
  const words = [...source.matchAll(/"([A-Za-z_][A-Za-z0-9_]{1,31})"/g)].map(
    (match) => match[1],
  );
  const names = new Set(
    words
      .flatMap((word) => [
        word,
        "event_" + word,
        "tower_remember_" + word,
        "chest_" + word,
      ])
      .filter((name) => name.length <= 32),
  );
  return [...names].map((name) => [name, "1557025794268729466", animated]);
}

function textLength(embed) {
  return (
    (embed.title || "").length +
    (embed.description || "").length +
    (embed.author?.name || "").length +
    (embed.footer?.text || "").length +
    (embed.fields || []).reduce(
      (sum, field) => sum + field.name.length + field.value.length,
      0,
    )
  );
}
function validate(payload) {
  assert.equal(
    payload.embeds.length,
    1,
    "Only one page may be sent per message",
  );
  const embeds = payload.embeds.map((embed) => embed.toJSON());
  assert(embeds.reduce((sum, embed) => sum + textLength(embed), 0) <= 6000);
  for (const embed of embeds) {
    assert((embed.title || "").length <= 256);
    assert((embed.description || "").length <= 4096);
    assert((embed.footer?.text || "").length <= 2048);
    assert((embed.fields || []).length <= 25);
    for (const field of embed.fields || []) {
      assert(field.name.length > 0 && field.name.length <= 256);
      assert(field.value.length > 0 && field.value.length <= 1024);
    }
  }
  for (const row of payload.components || []) row.toJSON();
  return embeds[0];
}
function preserved(fields, expected) {
  for (const field of expected)
    assert.equal(
      fields
        .filter((part) => part.name === field.name)
        .map((part) => part.value)
        .join(""),
      field.value,
      "Lost rule content: " + field.name,
    );
}

async function scenario(version, emojis) {
  process.env.HARDCORE_GAMEPLAY_VERSION = version;
  const Database = require("better-sqlite3");
  require.cache[require.resolve("better-sqlite3")].exports = function () {
    return new Database(":memory:");
  };
  const { db } = require("../src/db");
  require.cache[require.resolve("better-sqlite3")].exports = Database;
  const { setApplicationEmojisForTest } = require("../src/utils/appEmoji");
  const command = require("../src/commands/hardcore");
  const rules = require("../src/commands/luat");
  const panel = require("../src/hardcore/ui/ratesPanel");
  const view = require("../src/hardcore/ui");
  // Bot imports commands before loading application emojis from Discord.
  setApplicationEmojisForTest(
    emojis === "fallback" ? [] : emojiFixture(emojis === "animated"),
  );
  const { routeComponentInteraction } = require("../src/componentRouter");
  const { MessageFlags } = require("discord.js");
  const categories = ["encounters", "loot", "rngesus", "combat", "rewards"];
  let maximum = 0,
    rulePages = 0;
  for (const category of categories) {
    const pages = panel.ratesPages(category);
    const allFields = [];
    for (let i = 0; i < pages.length; i++) {
      const payload = panel.ratesPayload("owner", category, i);
      const serialized = validate(payload);
      maximum = Math.max(maximum, textLength(serialized));
      assert(
        serialized.footer.text.startsWith(
          "Trang " + (i + 1) + "/" + pages.length,
        ),
      );
      const selected = payload.components[0]
        .toJSON()
        .components[0].options.filter((option) => option.default);
      assert.deepEqual(
        selected.map((option) => option.value),
        [category],
      );
      if (pages.length > 1) {
        const buttons = payload.components[1].toJSON().components;
        assert.equal(buttons[0].disabled, i === 0);
        assert.equal(buttons[1].disabled, i === pages.length - 1);
      }
      allFields.push(...serialized.fields);
    }
    if (version === "2") preserved(allFields, view.ratesFields(category));
    validate({ embeds: [command.ratesEmbed(category)] });
  }
  if (version === "2" && emojis !== "fallback") {
    const header = command.ratesEmbed("encounters").data;
    const originalText =
      (header.title || "").length +
      (header.description || "").length +
      view
        .ratesFields("encounters")
        .reduce(
          (sum, field) => sum + field.name.length + field.value.length,
          0,
        );
    assert(
      originalText > 6000,
      "The original single-message payload must exceed the API limit",
    );
    assert(
      panel.ratesPages("encounters").length > 1,
      "Reproduce the production emoji overflow",
    );
    assert(panel.ratesPages("rewards").length > 1);
  }

  let last;
  const interaction = {
    guildId: "rates-test",
    user: { id: "owner" },
    options: { getSubcommand: () => "rates" },
    reply: async (payload) => {
      last = payload;
      return payload;
    },
    update: async (payload) => {
      last = payload;
      return payload;
    },
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
  };
  await command.execute(interaction);
  validate(last);
  assert(last.embeds[0].data.footer.text.startsWith("Trang 1/"));
  assert.equal(last.flags, MessageFlags.Ephemeral);

  const encounterPages = panel.ratesPages("encounters");
  if (encounterPages.length > 1) {
    const next = last.components[1].toJSON().components[1].custom_id;
    await routeComponentInteraction({ ...interaction, customId: next });
    const second = validate(last);
    assert(second.footer.text.startsWith("Trang 2/"));
    await routeComponentInteraction({
      ...interaction,
      isButton: () => false,
      isStringSelectMenu: () => true,
      customId: "hardcore-rates:owner",
      values: ["rewards"],
    });
    assert(validate(last).footer.text.startsWith("Trang 1/"));
    assert(last.embeds[0].data.title.includes("DỊCH VỤ"));
  }

  let updates = 0;
  await routeComponentInteraction({
    ...interaction,
    customId: "hardcore-rates-page:owner:encounters:1",
    user: { id: "stranger" },
    update: async () => {
      updates++;
    },
  });
  assert.equal(updates, 0);
  assert.equal(last.flags, MessageFlags.Ephemeral);
  assert(last.content.includes("Chỉ người mở"));
  for (const customId of [
    "hardcore-rates-page:owner:nope:1",
    "hardcore-rates-page:owner:encounters:NaN",
    "hardcore-rates-page:owner:encounters:-1",
  ]) {
    await routeComponentInteraction({
      ...interaction,
      customId,
      update: async () => {
        updates++;
      },
    });
    assert(last.content.includes("không hợp lệ"));
  }
  assert.equal(updates, 0);
  await routeComponentInteraction({
    ...interaction,
    isButton: () => false,
    isStringSelectMenu: () => true,
    customId: "hardcore-rates:owner",
    values: ["loot"],
    user: { id: "stranger" },
    update: async () => {
      updates++;
    },
  });
  assert.equal(updates, 0);
  assert.equal(last.flags, MessageFlags.Ephemeral);

  await rules.execute({
    ...interaction,
    options: { getString: () => "hardcore" },
  });
  const allRules = [];
  const count = Number(
    last.embeds[0].data.footer.text.match(/Trang \d+\/(\d+)/)[1],
  );
  for (let page = 0; page < count; page++) {
    if (page)
      await routeComponentInteraction({
        ...interaction,
        customId: "luat:hardcore:owner:" + page + ":next",
      });
    const serialized = validate(last);
    allRules.push(...serialized.fields);
    maximum = Math.max(maximum, textLength(serialized));
    assert(
      serialized.footer.text.startsWith("Trang " + (page + 1) + "/" + count),
    );
    rulePages++;
  }
  if (version === "2")
    for (const category of categories)
      preserved(allRules, view.ratesFields(category));
  db.close();
  console.log(
    JSON.stringify({ version, emojis, maximumMessageText: maximum, rulePages }),
  );
}

function stress() {
  const { paginateRuleEmbed } = require("../src/hardcore/ui/rulePages");
  const value =
    "a".repeat(1009) +
    "<a:long_emoji:1557025794268729466>" +
    "😀".repeat(900) +
    "\n" +
    "Một mô tả dài. ".repeat(1000);
  const pages = paginateRuleEmbed({
    title: "Long field fixture",
    description: "Preserve everything",
    fields: [{ name: "Long event", value }],
  });
  const fields = pages.flatMap((page) => validate({ embeds: [page] }).fields);
  assert.equal(fields.map((field) => field.value).join(""), value);
  for (const field of fields) {
    assert(!field.value.replace(/<a?:\w+:\d+>/g, "").includes("<"));
    assert(!/[\uD800-\uDBFF]$/.test(field.value));
    assert(!/^[\uDC00-\uDFFF]/.test(field.value));
  }
  const many = paginateRuleEmbed({
    title: "Many fields",
    fields: Array.from({ length: 60 }, (_, index) => ({
      name: String(index),
      value: "x",
    })),
  });
  assert.equal(many.length, 3);
  assert.equal(
    many.reduce(
      (count, page) => count + validate({ embeds: [page] }).fields.length,
      0,
    ),
    60,
  );
}
if (process.argv[2] === "scenario") {
  scenario(process.argv[3], process.argv[4]).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  stress();
  for (const version of ["2", "legacy"])
    for (const emojis of ["fallback", "loaded", "animated"]) {
      const output = execFileSync(
        process.execPath,
        [__filename, "scenario", version, emojis],
        { encoding: "utf8" },
      );
      process.stdout.write(output);
    }
  console.log(
    "Rates pagination passed: production emoji overflow, full rule content, field/message limits, slash/menu/page routing, ownership and legacy.",
  );
}
