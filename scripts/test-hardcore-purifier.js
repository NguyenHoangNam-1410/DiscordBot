"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/services/hardcoreV2");
const stats = require("../src/services/hardcoreStats");
const view = require("../src/services/hardcoreV2View");
const purifier = require("../src/hardcore/events/purifier");
const service = require("../src/services/hardcoreService");
const repo = require("../src/services/hardcoreRepository");
const { routeComponentInteraction } = require("../src/componentRouter");
const session = {
  id: "purifier",
  guild_id: "purifier",
  user_id: "u",
  channel_id: "c",
};
const rng = () => 0.99;
const item = (id) =>
  Object.values(core.ITEMS)
    .flat()
    .find((i) => i.id === id);
function fresh() {
  const s = stats.createState("barbarian", 10000);
  Object.assign(s, {
    floor: 6,
    cleared: 5,
    hp: s.maxHp,
    lastLog: "Giữ log trước",
    pendingMilestones: [],
  });
  core.receiveItem(s, item("glass_cannon"), 3, 1);
  core.receiveItem(s, item("blood_pact"), 2);
  core.receiveItem(s, core.ITEMS.common[0]);
  s.encounter = core.makeSurprise(s, rng, "purifier");
  return s;
}
const cleanAction = (s) =>
  core.actions(s).find((a) => a.action === "event_cleanse");
const components = (s) => view.rows("purifier", s).map((r) => r.toJSON());
const menu = (s) =>
  components(s)
    .flatMap((r) => r.components)
    .find((c) => c.type === 3);
function validUI(s) {
  const before = JSON.stringify(s);
  const rows = components(s);
  assert(rows.length <= 5);
  for (const row of rows) {
    assert(row.components.length <= 5);
    for (const c of row.components) {
      assert(c.custom_id.length <= 100);
      if (c.type === 3) {
        assert(row.components.length === 1);
        assert(c.options.length <= 25);
      }
    }
  }
  const e = view.embed(s, "u").toJSON();
  assert(!JSON.stringify(e).includes("undefined"));
  assert((e.fields || []).every((f) => f.value.length <= 1024));
  assert.equal(JSON.stringify(s), before, "render mutated state");
}
const s = fresh();
assert.equal(s.encounter.targetId, null);
assert(cleanAction(s).disabled);
const options = menu(s).options;
assert.equal(options.length, 2);
assert(
  options.some(
    (o) =>
      o.value === "glass_cannon" &&
      o.label.endsWith("Lv.3") &&
      o.description === "Còn 2 cấp nguyền",
  ),
);
assert(
  options.some(
    (o) => o.value === "blood_pact" && o.description === "Còn 2 cấp nguyền",
  ),
);
assert(!options.some((o) => o.value === core.ITEMS.common[0].id));
validUI(s);
const initial = structuredClone(s);
let calls = 0;
core.act(s, session, "purifier_select_glass_cannon", () => {
  calls++;
  return 0.99;
});
assert.equal(calls, 0, "preview consumed RNG");
assert.equal(s.encounter.targetId, "glass_cannon");
const unchanged = structuredClone(s);
unchanged.encounter = initial.encounter;
assert.deepEqual(unchanged, initial, "preview changed gameplay or receipts");
assert(!cleanAction(s).disabled);
const preview = JSON.stringify(view.embed(s, "u").toJSON());
assert(preview.includes("Lời nguyền sẽ gỡ"));
assert(preview.includes("→"));
assert(preview.includes(core.purifierCost(s).toLocaleString("vi-VN")));
assert(menu(s).options.find((o) => o.value === "glass_cannon").default);
core.act(s, session, "purifier_select_blood_pact", rng);
assert.equal(s.encounter.targetId, "blood_pact");
assert(menu(s).options.find((o) => o.value === "blood_pact").default);
const chosen = s.items.find((i) => i.definition.id === "blood_pact");
const other = structuredClone(
  s.items.find((i) => i.definition.id === "glass_cannon"),
);
const level = chosen.level,
  spent = s.payoutSpent,
  cost = core.purifierCost(s);
core.act(s, session, "event_cleanse", rng);
assert.equal(chosen.cleansedLevels, level);
assert.equal(chosen.rarity, "cursed");
assert.equal(chosen.level, level);
assert.equal(s.payoutSpent, spent + cost);
assert.deepEqual(
  s.items.find((i) => i.definition.id === "glass_cannon"),
  other,
);
assert.equal(s.lastPurifiedItem.name, chosen.name);
assert.throws(
  () => core.act(s, session, "event_cleanse", rng),
  /INVALID_ACTION/,
);
assert.equal(s.payoutSpent, spent + cost);
// Reject forged/non-cursed selections, and no charge on skip/insufficient payout.
for (const action of [
  "purifier_select_missing",
  "purifier_select_" + core.ITEMS.common[0].id,
  "purifier_page_9",
  "event_cleanse",
]) {
  const a = fresh(),
    before = JSON.stringify(a);
  assert.throws(() => core.act(a, session, action, rng), /INVALID_ACTION/);
  assert.equal(JSON.stringify(a), before);
}
const skipped = fresh();
const skippedItems = structuredClone(skipped.items),
  skippedSpent = skipped.payoutSpent;
core.act(skipped, session, "purifier_select_glass_cannon", rng);
core.act(skipped, session, "event_skip", rng);
assert.equal(skipped.payoutSpent, skippedSpent);
assert.deepEqual(skipped.items, skippedItems);
const poor = fresh();
poor.payoutSpent += core.payout(poor);
core.act(poor, session, "purifier_select_glass_cannon", rng);
assert(cleanAction(poor).disabled);
assert.throws(
  () => core.act(poor, session, "event_cleanse", rng),
  /INVALID_ACTION/,
);
// Simulation policy selects then confirms, or skips when it cannot pay.
const policy = require("./hardcore-optimal-policy");
const policyState = fresh();
assert(policy.choose(policyState).startsWith("purifier_select_"));
core.act(policyState, session, policy.choose(policyState), rng);
assert.equal(policy.choose(policyState), "event_cleanse");
assert.equal(policy.choose(poor), "event_skip");
// A pending event from an old release remains usable and can change its target.
const old = fresh();
old.encounter.targetId = "glass_cannon";
delete old.encounter.purifierPage;
const resumed = JSON.parse(JSON.stringify(old));
core.normalize(resumed);
assert(!cleanAction(resumed).disabled);
core.act(resumed, session, "purifier_select_blood_pact", rng);
assert.equal(resumed.encounter.targetId, "blood_pact");
// More than Discord's 25-option limit remains fully accessible.
const large = fresh();
large.items = Array.from({ length: 52 }, (_, i) => ({
  definition: { ...item("glass_cannon"), id: "menu_curse_" + i },
  name: "Nguyền " + i,
  rarity: "cursed",
  level: 2,
  cleansedLevels: 1,
}));
assert.equal(menu(large).options.length, 25);
validUI(large);
core.act(large, session, "purifier_page_1", rng);
assert.equal(menu(large).options.length, 25);
validUI(large);
core.act(large, session, "purifier_page_2", rng);
assert.equal(menu(large).options.length, 2);
validUI(large);
core.act(large, session, "purifier_select_menu_curse_51", rng);
assert.equal(menu(large).options.filter((o) => o.default).length, 1);
core.act(large, session, "purifier_page_1", rng);
assert.equal(large.encounter.targetId, "menu_curse_51");
core.act(large, session, "purifier_page_0", rng);
assert.equal(menu(large).options[0].value, "menu_curse_0");
validUI(large);
const empty = fresh();
for (const i of empty.items) i.cleansedLevels = i.level;
assert.equal(menu(empty), undefined);
assert(cleanAction(empty).disabled);
validUI(empty);
// Real menu routing, saved choice, stale confirm and player/message access checks.
async function main() {
  db.prepare(
    "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
  ).run("purifier", "u", 1000000);
  const run = service.startHardcore({
    guildId: "purifier",
    userId: "u",
    channelId: "c",
    stake: 10000,
    classKey: "barbarian",
    forcedEncounter: { type: "empty" },
  });
  service.setMessageId(run.session.id, "public");
  const saved = fresh();
  saved.fair = run.state.fair;
  saved.fairCounter = run.state.fairCounter;
  repo.saveState(run.session, saved);
  let updates = [],
    replies = [];
  const interaction = (turn, values, extra = {}) => ({
    customId: `hardcore:${run.session.id}:${turn}:purifier_select`,
    values,
    user: { id: "u" },
    guildId: "purifier",
    channelId: "c",
    message: { id: "public" },
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    deferUpdate: async () => {},
    editReply: async (p) => updates.push(p),
    followUp: async (p) => replies.push(p),
    ...extra,
  });
  const logger = { error() {}, warn() {}, debug() {} };
  assert(
    await routeComponentInteraction(
      interaction(saved.turn, ["blood_pact"]),
      logger,
    ),
  );
  let live = repo.parseState(repo.getSession(run.session.id));
  assert.equal(live.encounter.targetId, "blood_pact");
  assert.equal(live.floor, saved.floor);
  assert.equal(live.payoutSpent, saved.payoutSpent);
  assert.equal(live.turn, saved.turn + 1);
  assert(updates.length === 1 && !replies.length);
  const locked = repo.getSession(run.session.id).state_json;
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "u",
        expectedTurn: saved.turn,
        action: "event_cleanse",
      }),
    /STALE_ACTION/,
  );
  assert.equal(repo.getSession(run.session.id).state_json, locked);
  await routeComponentInteraction(
    interaction(live.turn, ["glass_cannon"], { user: { id: "other" } }),
    logger,
  );
  await routeComponentInteraction(
    interaction(live.turn, ["glass_cannon"], { message: { id: "old" } }),
    logger,
  );
  await routeComponentInteraction(interaction(live.turn, ["missing"]), logger);
  await routeComponentInteraction(
    interaction(live.turn, ["blood_pact", "glass_cannon"]),
    logger,
  );
  assert.equal(repo.getSession(run.session.id).state_json, locked);
  const result = service.playHardcore({
    sessionId: run.session.id,
    userId: "u",
    expectedTurn: live.turn,
    action: "event_cleanse",
  });
  assert.equal(
    result.state.items.find((i) => i.definition.id === "blood_pact")
      .cleansedLevels,
    2,
  );
  assert.equal(
    result.state.items.find((i) => i.definition.id === "glass_cannon")
      .cleansedLevels,
    1,
  );
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "u",
        expectedTurn: live.turn,
        action: "event_cleanse",
      }),
    /STALE_ACTION/,
  );
  console.log(
    "Purifier: player selection, readonly preview, price/single-item cleanup, pagination, old pending saves, menu routing, access checks and stale transactions passed.",
  );
  db.close();
}
main().catch((e) => {
  console.error(e);
  db.close();
  process.exitCode = 1;
});
