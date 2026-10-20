const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const {
  PAGE_SIZE,
  entries,
  validateEntries,
  sortedEntries,
  changelogPanel,
  handleChangelogButton,
  TYPE_KEYS,
  SCOPE_KEYS,
  TYPES,
  SCOPES,
} = require("../src/services/changelogService");
const { parseArguments, createEntry, appendEntry } = require("./add-changelog");
const command = require("../src/commands/changelog");

const U = "123456789012345678";
const json = (payload) => ({
  embed: payload.embeds[0].toJSON(),
  buttons: payload.components
    .flatMap((row) => row.toJSON().components)
    .filter((component) => component.type === 2),
  selects: payload.components
    .flatMap((row) => row.toJSON().components)
    .filter((component) => component.type === 3),
});
const fixture = Array.from({ length: 8 }, (_, index) => ({
  id: "entry-" + index,
  title: "Bản " + index,
  updatedAt: "2026-10-0" + (index + 1) + "T10:00:00+07:00",
  auditedAt: "2026-10-09T00:00:00Z",
  type: ["feature", "fix", "balance", "improvement"][index % 4],
  scope: ["survival", "chatbot"][index % 2],
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
    { type: undefined },
    { type: "bogus" },
    { scope: undefined },
    { scope: "bogus" },
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
    "--type",
    "fix",
    "--scope",
    "survival",
    "--change",
    "Hai",
  ]);
  assert.deepEqual(options, {
    title: "Cập nhật",
    type: "fix",
    scope: "survival",
    changes: ["Một", "Hai"],
  });
  assert.equal(createEntry(options, new Date("2026-10-09T00:00:00Z")).type, "fix");
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
    ["--title", "X", "--change", "Y"],
    ["--title", "X", "--change", "Y", "--type", "fix"],
    ["--title", "X", "--change", "Y", "--type", "bogus", "--scope", "survival"],
    ["--title", "X", "--change", "Y", "--type", "fix", "--scope", "bogus"],
    ["--unknown", "X"],
    ["--title", "X", "--change"],
    ["--title", "X", "--title", "Y"],
    ["--title", "X", "--change", "Y", "--commit", "--all"],
  ])
    assert.throws(() => parseArguments(args));

  // Slash execution and owner-bound button navigation.
  assert.equal(command.data.toJSON().name, "changelog");
  assert.equal(command.data.toJSON().options[0].min_value, 1);
  const optionSchemas = command.data.toJSON().options;
  assert.deepEqual(
    optionSchemas.find((option) => option.name === "loai").choices.map((c) => c.value),
    TYPE_KEYS,
  );
  assert.deepEqual(
    optionSchemas.find((option) => option.name === "doi_tuong").choices.map((c) => c.value),
    SCOPE_KEYS,
  );
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

  // Bộ lọc theo loại và đối tượng: kết hợp được, giữ nguyên khi chuyển trang, chọn "Tất cả" để bỏ lọc.
  const filtered = json(changelogPanel(U, 0, fixture, { type: "fix" }));
  assert.equal(filtered.embed.fields.length, 2);
  assert.match(filtered.embed.description, /Loại \*\*Sửa lỗi\*\*/);
  assert.match(filtered.embed.footer.text, /2 bản cập nhật/);
  for (const field of filtered.embed.fields) assert.match(field.name, /🐛 Sửa lỗi/);
  const both = json(changelogPanel(U, 0, fixture, { type: "feature", scope: "survival" }));
  assert.equal(both.embed.fields.length, 2);
  for (const field of both.embed.fields)
    assert.match(field.name, /✨ Tính năng · Sinh tồn/);
  const none = json(changelogPanel(U, 0, fixture, { type: "fix", scope: "survival" }));
  assert.equal((none.embed.fields || []).length, 0);
  assert.match(none.embed.description, /khớp bộ lọc/);
  assert.equal(none.selects.length, 2, "vẫn có menu để bỏ lọc");
  assert.equal(
    json(changelogPanel(U, 0, fixture, { type: "bogus", scope: "bogus" })).embed.fields.length,
    PAGE_SIZE,
    "bộ lọc không hợp lệ bị bỏ qua",
  );
  const paged = json(changelogPanel(U, 0, fixture, { scope: "survival" }));
  assert.equal(paged.buttons.length, 4);
  assert.ok(paged.buttons.every((button) => /:(\d+):(\d+)$/.test(button.custom_id)));
  assert.equal(paged.selects[0].options.length, TYPE_KEYS.length + 1);
  assert.equal(paged.selects[1].options.length, SCOPE_KEYS.length + 1);
  assert.equal(paged.selects[1].options.filter((o) => o.default).map((o) => o.value)[0], "survival");
  for (const component of [...paged.buttons, ...paged.selects])
    assert(component.custom_id.length <= 100);
  // Bấm Sau giữ nguyên bộ lọc; chọn menu đổi lọc về trang 1; "all" bỏ lọc; giá trị lạ bị từ chối.
  const selectFake = (customId, values, userId = U) => ({
    customId,
    values,
    user: { id: userId },
    update: async (payload) => {
      response = payload;
    },
    reply: async (payload) => {
      response = payload;
    },
  });
  const scopeIndex = SCOPE_KEYS.indexOf("survival") + 1;
  await handleChangelogButton(fake("changelog:" + U + ":0:next:0:" + scopeIndex));
  const afterNext = json(response);
  assert.match(afterNext.embed.description, /Đối tượng \*\*Sinh tồn\*\*/);
  await handleChangelogButton(selectFake("changelog:" + U + ":0:type:0:" + scopeIndex, ["balance"]));
  assert.match(json(response).embed.description, /Loại \*\*Điều chỉnh\*\*.*Đối tượng \*\*Sinh tồn\*\*/s);
  await handleChangelogButton(selectFake("changelog:" + U + ":0:scope:1:" + scopeIndex, ["all"]));
  assert.doesNotMatch(json(response).embed.description, /Đối tượng/);
  const beforeBad = response;
  await handleChangelogButton(selectFake("changelog:" + U + ":0:type:0:0", ["bogus"]));
  assert.match(response.content, /không hợp lệ/);
  assert.notEqual(response, beforeBad);
  await handleChangelogButton(selectFake("changelog:" + U + ":0:type:0:0", ["fix"], "999"));
  assert.match(response.content, /\/changelog/);
  // /changelog loai:... doi_tuong:... mở sẵn đã lọc
  await command.execute({
    user: { id: U },
    options: {
      getInteger: () => null,
      getString: (name) => ({ loai: "fix", doi_tuong: "survival" })[name] ?? null,
    },
    reply: async (payload) => {
      response = payload;
    },
  });
  for (const field of json(response).embed.fields)
    assert.match(field.name, /🐛 Sửa lỗi · Sinh tồn/);
  // Dữ liệu thật: mọi entry có đủ loại và đối tượng; mọi bộ lọc hiển thị trọn vẹn và phân trang đúng.
  for (const entry of entries) {
    assert.ok(TYPES[entry.type] && SCOPES[entry.scope], entry.title);
  }
  for (const type of TYPE_KEYS)
    for (const scope of [null, ...SCOPE_KEYS]) {
      const expected = entries.filter(
        (entry) => entry.type === type && (!scope || entry.scope === scope),
      ).length;
      let seenCount = 0;
      const total = Math.max(1, Math.ceil(expected / PAGE_SIZE));
      for (let page = 0; page < total; page += 1) {
        const panel = json(changelogPanel(U, page, entries, { type, scope }));
        const fields = panel.embed.fields || [];
        seenCount += fields.length;
        for (const field of fields)
          assert(field.name.length <= 256 && field.value.length <= 1024);
      }
      assert.equal(seenCount, expected, type + "/" + scope);
    }

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
      await router.routeComponentInteraction({
        ...selectFake("changelog:" + U + ":0:type:0:0", ["fix"]),
        isButton: () => false,
        isStringSelectMenu: () => true,
      }),
      true,
    );
    assert.match(json(response).embed.description, /Loại \*\*Sửa lỗi\*\*/);
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
