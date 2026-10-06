const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const {
  PAGE_SIZE,
  entries,
  validateEntries,
  sortedEntries,
  changelogPanel,
  handleChangelogButton,
} = require("../src/services/changelogService");
const { parseArguments, createEntry, appendEntry } = require("./add-changelog");
const command = require("../src/commands/changelog");

const U = "123456789012345678";
const json = (payload) => ({
  embed: payload.embeds[0].toJSON(),
  buttons: payload.components.flatMap((row) => row.toJSON().components),
});
const fixture = Array.from({ length: 8 }, (_, index) => ({
  id: "entry-" + index,
  title: "Bản " + index,
  updatedAt: "2026-10-0" + (index + 1) + "T10:00:00+07:00",
  auditedAt: "2026-10-09T00:00:00Z",
  changes: ["Thay đổi " + index],
})).reverse();

async function run() {
  // Pagination stays newest-first even when the input catalog is unsorted.
  const shuffled = [fixture[3], ...fixture.filter((_, index) => index !== 3)];
  const ordered = sortedEntries(shuffled);
  assert.equal(ordered[0].id, "entry-7");
  assert.notEqual(ordered, shuffled);
  assert.equal(
    shuffled[0].id,
    "entry-4",
    "sorting must not mutate the catalog",
  );
  const seen = [];
  for (let page = 0; page < 3; page += 1) {
    const panel = json(changelogPanel(U, page, shuffled));
    assert.match(
      panel.embed.footer.text,
      new RegExp("Trang " + (page + 1) + "/3"),
    );
    assert.equal(panel.embed.fields.length, page === 2 ? 2 : PAGE_SIZE);
    seen.push(...panel.embed.fields.map((field) => field.value));
    assert.equal(
      new Set(panel.buttons.map((button) => button.custom_id)).size,
      4,
    );
    assert.deepEqual(
      panel.buttons.map((button) => button.disabled),
      [page === 0, page === 0, page === 2, page === 2],
    );
    for (const button of panel.buttons) assert(button.custom_id.length <= 100);
  }
  assert.deepEqual(
    seen,
    ordered.map((entry) => "• " + entry.changes[0]),
  );
  assert.equal(new Set(seen).size, fixture.length);
  for (const value of [-1, "abc", NaN, Infinity, 1.5])
    assert.match(
      json(changelogPanel(U, value, fixture)).embed.footer.text,
      /Trang 1\/3/,
    );
  assert.match(
    json(changelogPanel(U, 999, fixture)).embed.footer.text,
    /Trang 3\/3/,
  );
  const empty = json(changelogPanel(U, 0, []));
  assert.match(empty.embed.description, /Chưa có/);
  assert.equal(empty.buttons.length, 0);
  assert.equal(json(changelogPanel(U, 0, [fixture[0]])).buttons.length, 0);

  // Use absolute timestamps for ordering and Vietnam time for presentation.
  const utc = { ...fixture[0], id: "utc", updatedAt: "2026-10-06T23:30:00Z" };
  const local = {
    ...fixture[0],
    id: "local",
    updatedAt: "2026-10-07T06:20:00+07:00",
  };
  const timezonePanel = json(changelogPanel(U, 0, [local, utc]));
  assert.match(
    timezonePanel.embed.fields[0].name,
    /06:30.*07\/10\/2026|07\/10\/2026.*06:30/,
  );
  assert.equal(sortedEntries([local, utc])[0].id, "utc");

  const bad = (patch) => [{ ...fixture[0], ...patch }];
  assert.throws(() => validateEntries({}), /danh sách/);
  assert.throws(() => validateEntries([fixture[0], fixture[0]]), /trùng/);
  for (const patch of [
    { id: "" },
    { title: "" },
    { title: "a".repeat(101) },
    { changes: [] },
    { changes: [""] },
    { changes: ["a".repeat(1023)] },
    { updatedAt: "2026-10-06T10:00:00" },
    { updatedAt: "invalid" },
    { auditedAt: "2025-10-06T10:00:00Z" },
    { commit: "abc1234" },
  ])
    assert.throws(() => validateEntries(bad(patch)));

  // Every real entry is displayed exactly once and fits Discord's embed limits.
  assert(entries.length >= 37);
  const allValues = [];
  const pages = Math.ceil(entries.length / PAGE_SIZE);
  for (let page = 0; page < pages; page += 1) {
    const { embed } = json(changelogPanel(U, page));
    assert(embed.title.length <= 256 && embed.description.length <= 4096);
    assert(embed.fields.length <= 25);
    for (const field of embed.fields) {
      assert(field.name.length <= 256 && field.value.length <= 1024);
      allValues.push(field.value);
    }
    const total =
      embed.title.length +
      embed.description.length +
      embed.footer.text.length +
      embed.fields.reduce(
        (sum, field) => sum + field.name.length + field.value.length,
        0,
      );
    assert(total <= 6000);
  }
  assert.deepEqual(
    allValues,
    entries.map((entry) =>
      entry.changes.map((change) => "• " + change).join("\n"),
    ),
  );

  // Audit helper records time automatically, resolves historical commits, rejects duplicates.
  const options = parseArguments([
    "--title",
    "  Cập nhật  ",
    "--change",
    " Một ",
    "--change",
    "Hai",
  ]);
  assert.deepEqual(options, { title: "Cập nhật", changes: ["Một", "Hai"] });
  const now = new Date("2026-10-09T00:00:00Z");
  const entry = createEntry(options, now);
  assert.equal(entry.updatedAt, now.toISOString());
  assert.equal(entry.auditedAt, now.toISOString());
  assert.equal(appendEntry(fixture, entry)[0], entry);
  const sha = "a".repeat(40);
  const old = createEntry(
    { ...options, commit: "a".repeat(7) },
    now,
    () => sha + "\n2026-10-01T09:00:00+07:00",
  );
  assert.equal(old.commit, sha);
  assert.equal(old.updatedAt, "2026-10-01T09:00:00+07:00");
  assert.equal(old.auditedAt, now.toISOString());
  assert.throws(() => appendEntry([{ ...old, id: "short" }], old), /đã có/);
  for (const args of [
    [],
    ["--title", "X"],
    ["--change", "X"],
    ["--unknown", "X"],
    ["--title", "X", "--change"],
    ["--title", "X", "--title", "Y"],
    ["--title", "X", "--change", "Y", "--commit", "--all"],
  ])
    assert.throws(() => parseArguments(args));

  // Slash execution and owner-bound button navigation.
  assert.equal(command.data.toJSON().name, "changelog");
  assert.equal(command.data.toJSON().options[0].min_value, 1);
  let response;
  await command.execute({
    user: { id: U },
    options: { getInteger: () => null },
    reply: async (payload) => {
      response = payload;
    },
  });
  assert.equal(response.flags, MessageFlags.Ephemeral);
  assert.match(json(response).embed.footer.text, /Trang 1\//);
  assert.deepEqual(response.allowedMentions, { parse: [] });
  await command.execute({
    user: { id: U },
    options: { getInteger: () => 2 },
    reply: async (payload) => {
      response = payload;
    },
  });
  assert.match(json(response).embed.footer.text, /Trang 2\//);
  let updates = 0;
  const fake = (customId, userId = U) => ({
    customId,
    user: { id: userId },
    isButton: () => true,
    update: async (payload) => {
      updates += 1;
      response = payload;
    },
    reply: async (payload) => {
      response = payload;
    },
  });
  await handleChangelogButton(fake("changelog:" + U + ":1:next"));
  assert.match(json(response).embed.footer.text, /Trang 2\//);
  await handleChangelogButton(fake("changelog:" + U + ":1:next", "999"));
  assert.equal(updates, 1);
  assert.equal(response.flags, MessageFlags.Ephemeral);
  assert.match(response.content, /\/changelog/);
  for (const id of [
    "changelog:" + U + ":-1:prev",
    "changelog:" + U + ":1:bogus",
    "changelog:bad",
  ])
    await handleChangelogButton(fake(id));
  assert.equal(updates, 1);
  assert.match(response.content, /không hợp lệ/);
  await handleChangelogButton(fake("changelog:" + U + ":99999999:last"));
  assert.match(
    json(response).embed.footer.text,
    new RegExp("Trang " + pages + "/" + pages),
  );

  // Command registry and actual component routing use an in-memory database.
  const Database = require("better-sqlite3");
  require.cache[require.resolve("better-sqlite3")].exports = function () {
    return new Database(":memory:");
  };
  const { db } = require("../src/db");
  require.cache[require.resolve("better-sqlite3")].exports = Database;
  try {
    const registry = require("../src/commandRegistry");
    const schemas = registry
      .loadCommands()
      .map((module) => module.data.toJSON());
    const names = schemas.map((schema) => schema.name);
    assert.equal(names.filter((name) => name === "changelog").length, 1);
    assert(!names.includes("changlog"));
    assert.equal(new Set(names).size, names.length);
    for (const schema of schemas) assert((schema.options || []).length <= 25);
    const router = require("../src/componentRouter");
    assert.equal(
      await router.routeComponentInteraction(
        fake("changelog:" + U + ":0:first"),
      ),
      true,
    );
    assert.match(json(response).embed.footer.text, /Trang 1\//);
    assert.equal(
      await router.routeComponentInteraction(fake("unknown")),
      false,
    );
    assert.match(
      JSON.stringify(require("../src/commands/trochoi").helpEmbed().toJSON()),
      /\/changelog/,
    );
  } finally {
    db.close();
  }
  console.log(
    JSON.stringify({
      ok: true,
      changelog: true,
      entries: entries.length,
      pages,
      groups: 8,
    }),
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
