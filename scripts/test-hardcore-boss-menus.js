"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  world = require("../src/hardcore/engine/world"),
  display = require("../src/hardcore/bosses/displayV2"),
  catalog = require("../src/hardcore/bosses/catalogV2"),
  view = require("../src/hardcore/ui"),
  service = require("../src/services/hardcoreService"),
  repo = require("../src/services/hardcoreRepository"),
  { routeComponentInteraction } = require("../src/componentRouter");
db.prepare(
  "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
).run("boss-menus", "u", 10000000);
let groups = 0;
async function test(label, f) {
  await f();
  groups++;
  console.log("PASS " + label);
}
function runBoss(id) {
  const run = service.startHardcore({
    guildId: "boss-menus",
    userId: "u",
    channelId: "c",
    stake: 10000,
    classKey: "assassin",
    forcedEncounter: { type: "empty" },
  });
  service.setMessageId(run.session.id, "public");
  const s = run.state;
  s.floor = 150;
  s.cleared = 149;
  s.sources.event.vit = 10000;
  core.normalize(s);
  s.hp = s.maxHp;
  s.encounter = world.makeEnemy(
    s,
    "boss",
    null,
    () => 0.4,
    catalog.CATALOG[id],
  );
  core.prepareItemCombat(s, () => 0.4);
  repo.saveState(run.session, s);
  return run;
}
function menu(s, id) {
  return view
    .rows(id, s)
    .flatMap((r) => r.toJSON().components)
    .find((c) => c.type === 3 && c.custom_id.includes("boss_select"));
}
function mock(id, turn, raw, values, extra = {}) {
  const responses = { acks: 0, updates: [], replies: [], errors: [] };
  const interaction = {
    customId: "hardcore:" + id + ":" + turn + ":" + raw,
    values,
    user: { id: "u" },
    guildId: "boss-menus",
    channelId: "c",
    message: { id: "public" },
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    deferUpdate: async () => {
      responses.acks++;
    },
    editReply: async (p) => responses.updates.push(p),
    followUp: async (p) => responses.replies.push(p),
    ...extra,
  };
  const logger = {
    error: (data, msg) => responses.errors.push({ data, msg }),
    warn() {},
    debug() {},
  };
  return { interaction, logger, responses };
}
async function route(input) {
  assert.equal(
    await routeComponentInteraction(input.interaction, input.logger),
    true,
  );
}
async function main() {
  await test("Lilith action menu reaches real handler, acknowledges and advances exactly once", async () => {
    const run = runBoss("lilith"),
      s = run.state,
      m = menu(s, run.session.id);
    assert(m);
    const raw = m.custom_id.split(":")[3],
      value = m.options[0].value,
      input = mock(run.session.id, s.turn, raw, [value]);
    await route(input);
    assert.equal(input.responses.acks, 1);
    assert.equal(input.responses.updates.length, 1);
    assert.equal(input.responses.errors.length, 0);
    let live = repo.parseState(repo.getSession(run.session.id));
    assert.equal(live.turn, s.turn + 1);
    assert.equal(live.encounter.boss.round, 1);
    assert(live.encounter.boss.mechanicState.bargain > 0);
    const before = repo.getSession(run.session.id).state_json;
    await route(mock(run.session.id, s.turn, raw, [value]));
    assert.equal(repo.getSession(run.session.id).state_json, before);
    repo.deleteSession(run.session.id);
  });
  await test("Free target selectors route without spending a boss combat turn", async () => {
    const run = runBoss("lazarus"),
      s = run.state,
      m = menu(s, run.session.id);
    assert(m);
    const value = m.options.find((o) => !o.value.endsWith("target_boss")).value;
    const input = mock(run.session.id, s.turn, m.custom_id.split(":")[3], [
      value,
    ]);
    await route(input);
    const live = repo.parseState(repo.getSession(run.session.id));
    assert.equal(live.turn, s.turn + 1);
    assert.equal(live.encounter.boss.round, 0);
    assert.notEqual(live.encounter.boss.mechanicState.target, "boss");
    assert.equal(input.responses.errors.length, 0);
    repo.deleteSession(run.session.id);
  });
  await test("Invalid menu values return a response and contextual error log, without changing state", async () => {
    const run = runBoss("lilith"),
      s = run.state,
      m = menu(s, run.session.id),
      raw = m.custom_id.split(":")[3],
      before = repo.getSession(run.session.id).state_json;
    for (const values of [
      [],
      ["missing"],
      [m.options[0].value, m.options[1].value],
    ]) {
      const input = mock(run.session.id, s.turn, raw, values);
      await route(input);
      assert.equal(input.responses.acks, 1);
      assert.equal(input.responses.replies.length, 1);
      assert.equal(input.responses.errors.length, 1);
      assert.equal(input.responses.errors[0].data.rawAction, raw);
      assert.equal(
        input.responses.errors[0].data.componentId,
        input.interaction.customId,
      );
      assert.equal(repo.getSession(run.session.id).state_json, before);
    }
    for (const extra of [
      { user: { id: "other" } },
      { message: { id: "old" } },
    ]) {
      const input = mock(
        run.session.id,
        s.turn,
        raw,
        [m.options[0].value],
        extra,
      );
      await route(input);
      assert.equal(input.responses.replies.length, 1);
      assert.equal(repo.getSession(run.session.id).state_json, before);
    }
    repo.deleteSession(run.session.id);
  });
  await test("Gharbad signs have names, clear true/false status and matching choices", () => {
    const run = runBoss("gharbad"),
      s = run.state,
      m = s.encounter.boss.mechanicState;
    for (let rule = 0; rule < 3; rule++)
      for (let sign = 0; sign < 3; sign++) {
        m.surrenderRule = rule;
        m.sign = sign;
        const before = JSON.stringify(s),
          text = display.status(s);
        assert(text.includes(["Hình thoi", "Tam giác", "Hình tròn"][sign]));
        assert.match(
          text,
          rule === sign ? /✅ Đầu hàng thật/ : /❌ Đầu hàng giả/,
        );
        assert.match(
          text,
          rule === sign
            ? /Chọn \*\*Chấp nhận\*\* hoặc \*\*Khám xét\*\*/
            : /Chọn \*\*Tấn công lời đầu hàng\*\*/,
        );
        assert.equal(JSON.stringify(s), before);
      }
    repo.deleteSession(run.session.id);
  });
  console.log(
    groups + " deterministic boss menu/display groups passed; no simulations.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
