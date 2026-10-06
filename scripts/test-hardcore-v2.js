"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hardcore-v2-"));
process.env.DB_PATH = path.join(temp, "test.sqlite");
delete process.env.HARDCORE_GAMEPLAY_VERSION;
const { db } = require("../src/db");
const service = require("../src/services/hardcoreService");
const stats = require("../src/services/hardcoreStats");
const world = require("../src/services/hardcoreWorld");
const core = service.V2;
const view = require("../src/services/hardcoreV2View");
const repo = require("../src/services/hardcoreRepository");
const echoes = require("../src/services/hardcoreEchoRepository");
const { getAccount } = require("../src/services/economyService");
const currency = require("../src/services/playerLevelService");
let number = 0;
const start = (classKey = "barbarian") =>
  service.startHardcore({
    guildId: "v2",
    userId: `u${++number}`,
    channelId: "c",
    stake: 10,
    classKey,
    forcedEncounter: { type: "empty", name: "Trống" },
  });
function save(run, edit) {
  const state = repo.parseState(repo.getSession(run.session.id));
  edit(state);
  repo.saveState(run.session, state);
  return state;
}
function play(run, action) {
  const s = repo.parseState(repo.getSession(run.session.id));
  return service.playHardcore({
    sessionId: run.session.id,
    userId: run.session.user_id,
    expectedTurn: s.turn,
    action,
  });
}
const item = (id) =>
  Object.values(core.ITEMS)
    .flat()
    .find((i) => i.id === id);
const rng = () => 0.5;
const groups = [];
async function main() {
  // Independently checked formulas, attribute sources and caps.
  const barbarian = stats.createState("barbarian", 10);
  assert.deepEqual(
    [barbarian.str, barbarian.dex, barbarian.vit, barbarian.ene],
    [30, 14, 28, 8],
  );
  assert.equal(barbarian.maxHp, 130);
  assert.equal(barbarian.damageMin, 27);
  assert.equal(barbarian.spellMax, 12);
  assert.equal(barbarian.defense, 13);
  const sorceress = stats.createState("sorceress", 10);
  assert.equal(sorceress.maxHp, 94);
  assert.equal(sorceress.spellMin, 37);
  assert.equal(sorceress.maxMana, 3);
  assert.equal(world.hitChance(100, 100), 0.55);
  assert.equal(world.hitChance(100, 0), 0.95);
  assert.equal(world.defenseReduction(150, 100), 0.5);
  const inversePreview = stats.createState("barbarian", 10);
  inversePreview.paradox = { kind: "inverse" };
  assert.deepEqual(core.physicalRange(inversePreview), [11, 16]);
  assert(view.statLine(inversePreview).includes("**11–16** (Paradox)"));
  assert(view.statLine(inversePreview).includes("**DEF** **29.5** (Paradox)"));
  const depleted = stats.createState("barbarian", 10);
  stats.addSource(depleted, { str: -999, dex: -999, ene: -999 });
  assert.deepEqual(
    [
      depleted.damageMin,
      depleted.damageMax,
      depleted.spellMin,
      depleted.spellMax,
    ],
    [1, 3, 1, 3],
  );
  groups.push("formulas");

  assert.deepEqual(
    Object.values(core.ITEMS).map((pool) => pool.length),
    [10, 13, 24, 16],
  );
  const { validateItems } = require("../src/hardcore/item");
  const invalidRoles = structuredClone(core.ITEMS);
  invalidRoles.common[1].effects = { str: 9 };
  assert.throws(
    () => validateItems(invalidRoles),
    /DUPLICATE_HARDCORE_ITEM_ROLE/,
  );
  for (const item of core.ITEMS.common) {
    const [key, value] = Object.entries(item.effects)[0];
    const upgrade = core.ITEMS.rare.find((candidate) =>
      Object.hasOwn(candidate.effects, key),
    );
    if (upgrade)
      assert(
        upgrade.effects[key] > value,
        key + " SR upgrade must be stronger",
      );
  }
  const catalogState = stats.createState("barbarian", 10);
  for (const definition of Object.values(core.ITEMS).flat())
    core.receiveItem(catalogState, definition);
  assert.equal(catalogState.items.length, 63);
  assert(Number.isFinite(catalogState.maxHp));
  assert.equal(
    Object.values(core.ITEMS)
      .flat()
      .filter((i) => i.curse?.effects.bonusPenalty).length,
    1,
  );
  const stack = stats.createState("barbarian", 10);
  core.receiveItem(stack, item("rusted_edge"));
  core.receiveItem(stack, item("rusted_edge"));
  assert.equal(stack.str, 40);
  assert.equal(stack.items[0].level, 2);
  core.receiveItem(stack, item("red_potion_belt"));
  assert.equal(stack.potions, 4);
  core.normalize(stack);
  const snapshot = JSON.stringify(stack);
  for (let i = 0; i < 20; i++) core.normalize(stack);
  assert.equal(stack.potions, 4);
  assert.equal(stack.str, 40);
  assert.equal(
    JSON.stringify(stack),
    snapshot.replace('"runDiamonds":0', '"runDiamonds":0'),
  );
  groups.push("catalog and repeat resume");

  const inventory = stats.createState("barbarian", 10);
  inventory.encounter = { type: "empty" };
  inventory.phase = "encounter";
  const drops = Object.values(core.ITEMS).flat().slice(0, 7);
  for (const definition of drops) core.receiveItem(inventory, definition);
  assert.deepEqual(
    inventory.items.map((entry) => entry.definition.id),
    drops.map((definition) => definition.id).reverse(),
  );
  const firstPage = view
    .privatePayload(inventory, "recent", "public", "items", 0)
    .embeds[0].toJSON();
  const secondPage = view
    .privatePayload(inventory, "recent", "public", "items", 1)
    .embeds[0].toJSON();
  assert.deepEqual(
    firstPage.fields.slice(1).map((field) => field.name),
    inventory.items
      .slice(0, 5)
      .map(
        (entry) =>
          `${entry.name} Lv.${entry.level} [${{ common: "R", rare: "SR", legendary: "SSR", cursed: "UR" }[entry.rarity]}]`,
      ),
  );
  assert.equal(secondPage.fields[1].name, `${drops[1].name} Lv.1 [R]`);
  const oldest = inventory.items.at(-1);
  core.receiveItem(inventory, drops[0]);
  assert.equal(inventory.items.length, drops.length);
  assert.equal(inventory.items[0], oldest);
  assert.equal(oldest.level, 2);
  assert.deepEqual(
    inventory.items.slice(1).map((entry) => entry.definition.id),
    drops
      .slice(1)
      .map((definition) => definition.id)
      .reverse(),
  );
  const resumedInventory = JSON.parse(JSON.stringify(inventory));
  core.normalize(resumedInventory);
  assert.deepEqual(
    resumedInventory.items.map((entry) => entry.definition.id),
    inventory.items.map((entry) => entry.definition.id),
  );
  assert(
    view
      .privatePayload(resumedInventory, "recent", "public", "items", 0)
      .embeds[0].toJSON()
      .fields[1].name.startsWith(oldest.name + " Lv.2"),
  );
  groups.push("newest received equipment first");

  const cursed = stats.createState("barbarian", 10);
  cursed.cleared = 10;
  core.receiveItem(cursed, item("glass_cannon"));
  assert.equal(cursed.defense, 0);
  core.receiveItem(cursed, item("glass_cannon"));
  const target = cursed.items[0],
    power = cursed.str;
  core.cleanse(cursed, target);
  assert(cursed.defense > 0);
  const cleanLoot = stats.createState("barbarian", 10);
  core.receiveSnapshot(cleanLoot, {
    ...structuredClone(target),
    level: 2,
    cleansedLevels: 2,
  });
  assert(cleanLoot.defense > 0);
  assert.equal(cleanLoot.items[0].rarity, "cursed");
  core.receiveItem(cleanLoot, cleanLoot.items[0].definition, 1, 1);
  assert(cleanLoot.defense > 0);
  assert.equal(cleanLoot.items[0].cleansedLevels, 3);
  assert.equal(target.rarity, "cursed");
  assert.equal(target.cleansedLevels, 2);
  assert.equal(cursed.str, power);
  core.receiveItem(cursed, item("glass_cannon"));
  assert.equal(cursed.defense, 0);
  assert.equal(target.cleansedLevels, 2);
  const beforeForge = cursed.str;
  core.grind(cursed, target);
  assert.equal(cursed.str, beforeForge);
  assert(cursed.defense > 0);
  groups.push("cleanse and absorbed forge");

  const stale = start();
  const before = getAccount("v2", stale.session.user_id).balance;
  play(stale, "next");
  const saved = repo.getSession(stale.session.id).state_json;
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: stale.session.id,
        userId: stale.session.user_id,
        expectedTurn: 0,
        action: "next",
      }),
    /STALE_ACTION/,
  );
  assert.equal(repo.getSession(stale.session.id).state_json, saved);
  assert.equal(getAccount("v2", stale.session.user_id).balance, before);
  groups.push("stale transactions");

  const checkpoints = start();
  save(checkpoints, (s) => {
    s.floor = 25;
    s.cleared = 24;
    s.hp = 20;
    s.encounter = { type: "empty" };
  });
  const milestone = play(checkpoints, "next");
  assert.equal(milestone.state.phase, "upgrade");
  assert.equal(milestone.state.hp, milestone.state.maxHp);
  const upgraded = play(checkpoints, "upgrade_str");
  assert.equal(upgraded.state.str, 35);
  assert.equal(upgraded.state.phase, "paradox");
  assert.equal(upgraded.state.encounter.version, 2);
  assert.equal(upgraded.state.encounter.choices.length, 2);
  // Simulate a v1 selection already persisted before this release.
  save(checkpoints, (s) => {
    s.encounter = { type: "paradox" };
  });
  const paradox = play(checkpoints, "paradox_blood");
  assert.deepEqual(
    [paradox.state.paradox.from, paradox.state.paradox.until],
    [26, 30],
  );
  const p = paradox.state;
  const base = core.rawPayout(p);
  core.hurt(p, 13);
  assert(core.payout(p) > base);
  core.heal(p, 13);
  assert.equal(core.payout(p), base);
  const factor = p.paradox.bloodFactor;
  core.hurt(p, 10, false);
  assert.equal(p.paradox.bloodFactor, factor);
  p.paradox.bloodFactor = 0.5;
  assert.equal(core.rawPayout(p), base);
  groups.push("checkpoint and blood payout");

  const sever = start();
  save(sever, (s) => {
    s.floor = 199;
    s.cleared = 198;
    s.encounter = { type: "empty" };
    s.modifiers = { stone_skin: 22, unstable_rift: 10 };
  });
  assert.equal(play(sever, "next").state.phase, "severance");
  assert.throws(() => play(sever, "sever_unstable_rift"), /INVALID_ACTION/);
  assert(!play(sever, "sever_stone_skin").state.modifiers.stone_skin);
  assert.equal(world.effectiveStacks(3), 3);
  assert.equal(world.effectiveStacks(8), 5.5);
  assert.equal(world.effectiveStacks(999), 8);
  const enemy = world.makeEnemy(
    { ...stats.createState("barbarian", 10), modifiers: { soul_drain: 100 } },
    "normal",
    null,
    rng,
  );
  assert.equal(enemy.drainCharges, 3);
  groups.push("severance and diminishing stacks");

  const shopRun = start();
  save(shopRun, (s) => {
    s.cleared = 101;
    s.floor = 102;
    s.encounter = core.makeSurprise(s, rng, "diamond_shop");
  });
  const shopJson = repo.getSession(shopRun.session.id).state_json;
  assert.throws(() => play(shopRun, "buy_0"), /INSUFFICIENT_DIAMONDS/);
  assert.equal(repo.getSession(shopRun.session.id).state_json, shopJson);
  const price = repo.parseState(repo.getSession(shopRun.session.id)).encounter
    .offers[0].price;
  currency.addDiamonds("v2", shopRun.session.user_id, 2000);
  const oldTurn = repo.parseState(repo.getSession(shopRun.session.id)).turn;
  play(shopRun, "buy_0");
  assert.equal(
    currency.getPlayerProgression("v2", shopRun.session.user_id).diamonds,
    2000 - price,
  );
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: shopRun.session.id,
        userId: shopRun.session.user_id,
        expectedTurn: oldTurn,
        action: "buy_0",
      }),
    /STALE_ACTION/,
  );
  assert.equal(
    currency.getPlayerProgression("v2", shopRun.session.user_id).diamonds,
    2000 - price,
  );
  const blood = start();
  save(blood, (s) => {
    s.floor = 11;
    s.cleared = 10;
    s.encounter = core.makeSurprise(s, rng, "blood_shop");
    stats.addSource(s, { maxHp: s.encounter.offers[0].price - s.maxHp });
  });
  const bloodSnapshot = repo.getSession(blood.session.id).state_json;
  assert.throws(() => play(blood, "buy_0"), /INVALID_ACTION/);
  assert.equal(repo.getSession(blood.session.id).state_json, bloodSnapshot);
  groups.push("shops insufficient funds and replay");

  const duel = start();
  save(duel, (s) => {
    s.encounter = core.makeSurprise(s, rng, "duelist");
    s.encounter.hands = [1, 1, 1, 1, 1];
  });
  play(duel, "duel_items");
  play(duel, "hand_0");
  play(duel, "hand_0");
  const duelWin = play(duel, "hand_0");
  assert.equal(duelWin.state.cleared, 1);
  assert.equal(duelWin.state.items.length, 1);
  const statDuel = start();
  save(statDuel, (s) => {
    s.encounter = core.makeSurprise(s, rng, "duelist");
    s.encounter.hands = [1];
  });
  play(statDuel, "duel_stat");
  assert.equal(play(statDuel, "hand_0").state.str, 36);
  groups.push("duelist");

  const ghost = stats.createState("barbarian", 10);
  ghost.cleared = 101;
  ghost.floor = 102;
  ghost.encounter = { type: "combat" };
  core.receiveItem(ghost, item("rusted_edge"), 12);
  for (let i = 0; i < 15; i++)
    echoes.onDeath(
      { id: `death${i}`, guild_id: "echo", user_id: `dead${i}` },
      ghost,
      Date.now() + i,
    );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM hardcore_echoes WHERE guild_id='echo'")
      .get().n,
    10,
  );
  const claim1 = { id: "claim1", guild_id: "echo", user_id: "live1" },
    claim2 = { id: "claim2", guild_id: "echo", user_id: "live2" };
  const echo = echoes.claim(claim1, ghost);
  assert(echo);
  assert.equal(echo.profile.items[0].level, 5);
  assert.notEqual(echoes.claim(claim2, ghost)?.id, echo.id);
  assert.equal(
    echoes.claim({ id: "cross", guild_id: "other", user_id: "live" }, ghost),
    null,
  );
  assert.throws(() => echoes.consume(claim2, echo.id), /ECHO_EXPIRED/);
  ghost.encounter = { echoId: echo.id };
  echoes.onDeath(claim1, ghost);
  const nemesis = db
    .prepare("SELECT * FROM hardcore_echoes WHERE id=?")
    .get(echo.id);
  assert.equal(nemesis.is_nemesis, 1);
  assert.equal(nemesis.kills, 1);
  assert.equal(nemesis.claimed_by, null);
  groups.push("echo leases server isolation cap and nemesis");

  const memory = stats.createState("barbarian", 10);
  memory.encounter = { type: "empty" };
  for (let i = 0; i < 20; i++) core.remember(memory, "pray_rngesus", rng);
  assert.equal(memory.debts.length, 8);
  assert(memory.debts.every((d) => d.due >= 11 && d.due <= 31));
  const savedDebts = JSON.stringify(memory.debts);
  for (let i = 0; i < 5; i++) core.normalize(memory);
  assert.equal(JSON.stringify(memory.debts), savedDebts);
  groups.push("tower locked outcomes");

  const samples = [];
  for (const key of Object.keys(stats.CLASSES)) {
    const s = stats.createState(key, 10);
    s.encounter = world.makeEnemy(s, "normal", null, rng);
    s.hp = Math.max(1, s.maxHp - 20);
    s.mana = s.maxMana;
    core.playerAttack(s, "skill", rng);
    assert.equal(s.mana, s.maxMana - 2);
    samples.push(s);
  }
  for (const kind of core.EVENTS) {
    const s = structuredClone(catalogState);
    s.floor = 201;
    s.cleared = 200;
    s.bonus = 10000;
    s.encounter = core.makeSurprise(s, rng, kind);
    samples.push(s);
  }
  for (const phase of ["upgrade", "paradox", "severance", "summit"]) {
    const s = structuredClone(catalogState);
    s.phase = phase;
    s.encounter = { type: phase };
    samples.push(s);
  }
  for (const s of samples) {
    const serialized = view.embed(s, "player", null, "test").toJSON();
    assert(serialized.fields.every((f) => f.value.length <= 1024));
    const total =
      serialized.title.length +
      serialized.description.length +
      serialized.footer.text.length +
      serialized.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    assert(total <= 6000);
    const rows = view.rows("test", s).map((r) => r.toJSON());
    assert(rows.length <= 5);
    assert(rows.every((r) => r.components.length <= 5));
    const ids = rows.flatMap((r) => r.components.map((c) => c.custom_id));
    assert.equal(new Set(ids).size, ids.length);
    assert(ids.every((id) => id.length <= 100));
    for (const tab of ["items", "stats", "effects", "encounter"])
      view.privatePayload(s, "test", "public", tab, 0).embeds[0].toJSON();
  }
  const ui = start();
  service.setMessageId(ui.session.id, "public");
  const original = repo.getSession(ui.session.id).state_json;
  await service.handleHardcoreButton({
    customId: `hardcore:${ui.session.id}:0:view_stats_0`,
    guildId: "v2",
    channelId: "c",
    user: { id: ui.session.user_id },
    message: { id: "public" },
    deferReply: async () => {},
    editReply: async (p) =>
      assert(p.embeds[0].toJSON().title.includes("2.0.1")),
  });
  assert.equal(repo.getSession(ui.session.id).state_json, original);
  const rapid = start();
  service.setMessageId(rapid.session.id, "rapid-public");
  const replies = [];
  const rapidInteraction = () => ({
    customId: `hardcore:${rapid.session.id}:0:next`,
    guildId: "v2",
    channelId: "c",
    user: { id: rapid.session.user_id },
    message: { id: "rapid-public" },
    deferUpdate: async () => {},
    editReply: async (payload) => replies.push(payload),
    followUp: async (payload) => replies.push(payload),
  });
  await Promise.all([
    service.handleHardcoreButton(rapidInteraction()),
    service.handleHardcoreButton(rapidInteraction()),
  ]);
  const rapidState = repo.parseState(repo.getSession(rapid.session.id));
  assert.equal(rapidState.turn, 1);
  assert.equal(rapidState.cleared, 1);
  assert.equal(replies.length, 2);
  for (const payload of replies)
    assert(
      payload.components
        .flatMap((row) => row.toJSON().components)
        .every((c) => c.custom_id.split(":")[2] === "1"),
    );
  const restore = start();
  service.setMessageId(restore.session.id, "restore-public");
  let attempts = 0,
    fallback;
  await service.handleHardcoreButton({
    customId: `hardcore:${restore.session.id}:0:next`,
    guildId: "v2",
    channelId: "c",
    user: { id: restore.session.user_id },
    message: { id: "restore-public" },
    deferUpdate: async () => {},
    editReply: async (payload) => {
      if (++attempts === 1)
        throw new Error("Discord temporarily rejected embed");
      fallback = payload;
    },
  });
  assert.equal(attempts, 2);
  assert.equal(repo.parseState(repo.getSession(restore.session.id)).turn, 1);
  assert.equal(fallback.embeds.length, 0);
  assert(
    fallback.components
      .flatMap((row) => row.toJSON().components)
      .every((c) => c.custom_id.split(":")[2] === "1"),
  );
  const ended = play(ui, "retreat");
  assert(ended.settled);
  assert.equal(
    db
      .prepare(
        "SELECT release_version FROM hardcore_run_archive WHERE session_id=?",
      )
      .get(ui.session.id).release_version,
    "2.0.1",
  );
  const noBalance = JSON.stringify(
    service
      .hardcoreEmbed(ended.state, ui.session.user_id, ended.result)
      .toJSON(),
  );
  assert(!noBalance.includes('"balance"'));
  assert(!noBalance.includes("Số dư"));
  const final = start("sorceress");
  save(final, (s) => {
    s.floor = 999;
    s.cleared = 998;
    s.completed = true;
    s.encounter = world.makeEnemy(s, "final_boss", null, rng);
    s.encounter.hp = 1;
    s.mana = 2;
  });
  const win = play(final, "skill");
  assert.equal(win.state.phase, "summit");
  assert.equal(win.state.finalBossDefeated, true);
  assert.equal(win.state.cleared, 999);
  const moneyBefore = getAccount("v2", final.session.user_id).balance;
  const settled = play(final, "retreat");
  assert.equal(settled.result.reason, "summit");
  assert.equal(settled.result.diamonds, 51200);
  assert.equal(
    getAccount("v2", final.session.user_id).balance,
    moneyBefore + settled.result.payout,
  );
  assert.equal(
    currency.getPlayerProgression("v2", final.session.user_id).diamonds,
    51200,
  );
  assert.throws(() => play(final, "retreat"));
  const finalGate = start();
  save(finalGate, (s) => {
    s.floor = 999;
    s.cleared = 998;
    s.encounter = { type: "empty" };
  });
  const gateSaved = repo.getSession(finalGate.session.id).state_json;
  assert.throws(() => play(finalGate, "next"), /FINAL_BOSS_REQUIRED/);
  assert.equal(repo.getSession(finalGate.session.id).state_json, gateSaved);
  const funds = stats.createState("barbarian", 10);
  funds.floor = 11;
  funds.cleared = 10;
  funds.paradox = { kind: "blood", from: 11, until: 15, bloodFactor: 0.5 };
  const available = core.rawPayout(funds);
  funds.encounter = core.makeSurprise(funds, rng, "payout_shop");
  funds.encounter.offers[0].price = available + 1;
  assert(core.payout(funds) > available);
  assert(core.actions(funds).find((a) => a.action === "buy_0").disabled);
  assert.equal(
    JSON.stringify(
      service.hardcoreEmbed(win.state, final.session.user_id).toJSON(),
    ).includes("Số dư"),
    false,
  );
  groups.push("discord limits private readonly and version history");

  process.env.HARDCORE_GAMEPLAY_VERSION = "legacy";
  const legacy = start();
  assert.equal(legacy.state.gameplayVersion, undefined);
  assert.equal(legacy.state.runVersion, 4);
  delete process.env.HARDCORE_GAMEPLAY_VERSION;
  const resumed = service.getHardcoreRun("v2", legacy.session.user_id);
  assert.equal(resumed.state.runVersion, 4);
  const legacyAction = play(legacy, "continue");
  assert.equal(legacyAction.state.cleared, 1);
  const newlyStarted = start();
  assert.equal(newlyStarted.state.releaseVersion, "2.0.1");
  db.prepare("UPDATE hardcore_sessions SET updated_at=? WHERE id=?").run(
    Date.now() - 8 * 24 * 60 * 60 * 1000,
    newlyStarted.session.id,
  );
  const walletBeforeTimeout = getAccount(
    "v2",
    newlyStarted.session.user_id,
  ).balance;
  assert.equal(service.cleanupStaleHardcoreSessions(), 1);
  assert.equal(repo.getSession(newlyStarted.session.id), null);
  assert.equal(
    getAccount("v2", newlyStarted.session.user_id).balance,
    walletBeforeTimeout,
  );
  assert.equal(
    db
      .prepare("SELECT reason FROM hardcore_run_archive WHERE session_id=?")
      .get(newlyStarted.session.id).reason,
    "forfeit",
  );
  groups.push("legacy coexistence and rollback");
  console.log(JSON.stringify({ ok: true, release: "2.0.1", groups }));
}
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });
