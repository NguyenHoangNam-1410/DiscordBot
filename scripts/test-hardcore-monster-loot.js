"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const loot = require("../src/hardcore/monsterLoot");
const core = require("../src/services/hardcoreV2");
const stats = require("../src/services/hardcoreStats");
const world = require("../src/services/hardcoreWorld");
const view = require("../src/services/hardcoreV2View");
const items = Object.values(core.ITEMS).flat();
const get = (id) => items.find((item) => item.id === id);
const session = {
  id: "loot",
  guild_id: "loot",
  user_id: "player",
  channel_id: "c",
};
const groups = [];
function state(rank = "normal", floor = 11, name = "Loot test") {
  const s = stats.createState("barbarian", 10000);
  s.floor = floor;
  s.cleared = floor - 1;
  s.lastLog = "";
  s.encounter = world.makeEnemy(s, rank, name, () => 0.5);
  Object.assign(s.encounter, {
    hp: 1,
    maxHp: 1,
    mechanic: null,
    combatTurn: 1,
    defense: 0,
    resistance: 0,
    evasion: 0,
    accuracy: 100000,
    critChance: 0,
    damageMin: 30,
    damageMax: 30,
    damageType: "physical",
    nextDamageType: "physical",
  });
  return s;
}
function sequence(values, fallback = 0.5) {
  let count = 0;
  const rng = () => values[count++] ?? fallback;
  rng.count = () => count;
  return rng;
}
function kill(s, values = [0, 0, 0], action = "attack") {
  const enemy = s.encounter;
  const afterKill = sequence(values);
  core.act(s, session, action, () => (enemy.hp > 0 ? 0.5 : afterKill()));
  return enemy;
}
function json(payload) {
  return JSON.stringify(payload.embeds.map((embed) => embed.toJSON()));
}
function bounds(payload) {
  const embeds = payload.embeds.map((embed) => embed.toJSON());
  let total = 0;
  for (const embed of embeds) {
    assert((embed.fields?.length || 0) <= 25);
    assert((embed.description?.length || 0) <= 4096);
    total +=
      (embed.title?.length || 0) +
      (embed.description?.length || 0) +
      (embed.footer?.text?.length || 0);
    for (const field of embed.fields || []) {
      assert(field.value.length <= 1024);
      total += field.name.length + field.value.length;
    }
  }
  assert(total <= 6000);
}
try {
  for (const [luck, expected] of [
    [0, 0.01],
    [1, 0.015],
    [10, 0.06],
    [29, 0.155],
    [30, 0.16],
    [37, 0.195],
    [38, 0.2],
    [100000, 0.2],
    [-5, 0.01],
    [NaN, 0.01],
  ])
    assert(Math.abs(loot.chance(luck) - expected) < 1e-12);
  groups.push("LUCK formula, invalid/negative inputs and 20% cap");

  for (const [rank, rarities] of [
    ["normal", ["common", "rare"]],
    ["mimic", ["common", "rare"]],
    ["elite", ["rare", "legendary"]],
    ["boss", ["legendary", "cursed"]],
    ["final_boss", ["legendary", "cursed"]],
  ]) {
    for (const [roll, expected] of [
      [0, rarities[0]],
      [0.599999, rarities[0]],
      [0.6, rarities[1]],
      [0.999999, rarities[1]],
    ]) {
      const s = state(rank);
      s.luck = 38;
      s.encounter.hp = 0;
      assert.deepEqual(loot.odds(s).rarities, rarities);
      const rng = sequence([0.199999, roll]);
      assert.equal(loot.roll(s, s.encounter, rng), expected);
      assert.equal(rng.count(), 2);
      assert.equal(loot.roll(s, s.encounter, rng), null);
      assert.equal(rng.count(), 2);
    }
  }
  groups.push("rank pools, 60/40 boundaries, one roll per defeated monster");

  const failed = state();
  failed.luck = 38;
  failed.encounter.hp = 0;
  const missed = sequence([0.2]);
  assert.equal(loot.roll(failed, failed.encounter, missed), null);
  assert.equal(missed.count(), 1);
  assert.equal(
    loot.roll(failed, failed.encounter, () => {
      throw new Error("reroll");
    }),
    null,
  );
  const alive = state();
  assert.equal(
    loot.roll(alive, alive.encounter, () => {
      throw new Error("alive");
    }),
    null,
  );
  alive.hp = 0;
  alive.encounter.hp = 0;
  assert.equal(
    loot.roll(alive, alive.encounter, () => {
      throw new Error("dead player");
    }),
    null,
  );
  alive.encounter = { type: "rngesus" };
  assert.equal(loot.odds(alive), null);
  assert.equal(
    loot.roll(alive, alive.encounter, () => {
      throw new Error("not combat");
    }),
    null,
  );
  groups.push(
    "failed rolls settle once; living monsters, player death and RNGesus cannot drop",
  );

  for (const floor of world.REGIONS.map((region) => region.start).filter(
    (floor) => floor > 1,
  )) {
    const s = state("boss", floor);
    assert(loot.hasRegionBossChest(s));
    assert.equal(loot.odds(s).chance, 0);
    s.encounter.hp = 0;
    assert.equal(
      loot.roll(s, s.encounter, () => {
        throw new Error("region boss roll");
      }),
      null,
    );
    const won = state("boss", floor);
    kill(won, [0.69, 0]);
    assert.equal(won.lastReceivedItems.length, 0);
    assert.equal(won.phase, "boss_chest");
    assert.equal(won.encounter.item.rarity, "legendary");
  }
  const urChest = state("boss", 100);
  kill(urChest, [0.7, 0]);
  assert.equal(urChest.encounter.item.rarity, "cursed");
  for (const floor of [50, 150, 250, 999]) {
    const s = state(floor === 999 ? "final_boss" : "boss", floor);
    assert(!loot.hasRegionBossChest(s));
    assert.deepEqual(loot.odds(s).rarities, ["legendary", "cursed"]);
  }
  const echo = state("boss", 100);
  echo.encounter.echoId = "echo";
  assert(!loot.hasRegionBossChest(echo));
  groups.push(
    "region boss chest exclusion, unchanged 70/30 chest, ordinary/final boss and Echo eligibility",
  );

  const locked = state();
  locked.luck = 10;
  const untouched = JSON.stringify(locked);
  assert(Math.abs(loot.odds(locked).chance - 0.06) < 1e-12);
  bounds(view.privatePayload(locked, "test", "public", "encounter"));
  assert.equal(JSON.stringify(locked), untouched);
  core.prepareItemCombat(locked, () => 0.5);
  assert.equal(loot.odds(locked).luck, 10);
  locked.luck = 100;
  assert(Math.abs(loot.odds(locked).chance - 0.06) < 1e-12);
  const loaded = core.normalize(JSON.parse(JSON.stringify(locked)));
  assert(Math.abs(loot.odds(loaded).chance - 0.06) < 1e-12);
  loaded.encounter.hp = 0;
  assert.equal(loot.roll(loaded, loaded.encounter, sequence([0.15])), null);
  const settled = core.normalize(JSON.parse(JSON.stringify(loaded)));
  assert.equal(
    loot.roll(settled, settled.encounter, () => {
      throw new Error("resume reroll");
    }),
    null,
  );
  groups.push(
    "readonly details, combat-entry LUCK snapshot and resume without reroll",
  );

  for (const rank of ["normal", "elite", "boss"]) {
    for (const action of ["attack", "skill"]) {
      const s = state(rank);
      s.pityRare = 2;
      s.pityLegendary = 3;
      const enemy = kill(s, [0, 0.99, 0], action);
      assert(enemy.itemDrop.settled);
      assert.equal(s.kills, 1);
      assert.equal(s.cleared, 11);
      assert.equal(s.lastReceivedItems.length, 1);
      assert.equal(
        s.lastReceivedItems[0].rarity,
        { normal: "rare", elite: "legendary", boss: "cursed" }[rank],
      );
      assert.equal(s.pityRare, 2);
      assert.equal(s.pityLegendary, 3);
      assert.match(s.lastLog, /Nhặt được trang bị/);
      const battle = view.embed(s, session.user_id).toJSON();
      const turn = battle.fields.find((field) =>
        /Lượt vừa rồi/.test(field.name),
      );
      assert(turn.value.includes(s.lastReceivedItems[0].name));
      const situation = battle.fields.find((field) =>
        /Đối thủ|Tình huống/.test(field.name),
      );
      assert.doesNotMatch(situation.value, /Rơi trang bị|LUCK|Khi có drop/);
    }
  }
  groups.push(
    "attack/skill kill receipt, rarity, immediate pickup, turn log and unchanged chest pity",
  );

  const duplicate = state();
  core.receiveItem(duplicate, get("rusted_edge"));
  const oldDefinition = duplicate.items[0].definition;
  oldDefinition.effects.str = 7;
  stats.recompute(duplicate);
  const strBefore = duplicate.str;
  kill(duplicate);
  assert.equal(duplicate.items.length, 1);
  assert.equal(duplicate.items[0].level, 2);
  assert.equal(duplicate.str, strBefore + 7);
  assert.equal(duplicate.items[0].definition.effects.str, 7);
  assert.equal(duplicate.lastReceivedItems[0].level, 2);
  groups.push("duplicate item levels and preserved old-run stat snapshot");

  for (const [kind, reward] of [
    ["ancient_mimic", "rare"],
    ["blood_mimic", "rare"],
  ]) {
    const s = state(
      "elite",
      11,
      kind === "ancient_mimic" ? "Ancient Mimic" : "Blood Mimic",
    );
    s.encounter.mimicKind = kind;
    assert.deepEqual(loot.odds(s).rarities, ["rare", "legendary"]);
    const before = view
      .embed(s, session.user_id)
      .toJSON()
      .fields.find((field) => /Đối thủ|Tình huống/.test(field.name)).value;
    assert.doesNotMatch(before, /Hạ quái nhận|Thưởng riêng|Rơi trang bị/);
    const detail = json(view.privatePayload(s, "test", "public", "encounter"));
    assert.match(detail, /Thưởng riêng chắc chắn/);
    kill(s, [0, 0, 0, 0.99, 0]);
    assert.equal(s.lastReceivedItems.length, 2);
    assert.equal(s.lastReceivedItems[0].rarity, reward);
    assert.equal(s.lastReceivedItems[1].rarity, "legendary");
  }
  groups.push(
    "Ancient/Blood Mimic guaranteed reward plus independent elite LUCK drop, private reward description",
  );

  const grave = state("elite", 102);
  const luckReward = items.find((item) => item.effects.luck > 0);
  const echoes = require("../src/services/hardcoreEchoRepository");
  echoes.onDeath(
    { ...session, id: "loot-grave-death", user_id: "ghost" },
    grave,
  );
  const claimedGrave = echoes.claim(session, grave);
  assert(claimedGrave);
  grave.encounter.echoId = claimedGrave.id;
  grave.encounter.echo = { kills: 0 };
  grave.encounter.echoItem = {
    definition: luckReward,
    level: 100,
    cleansedLevels: 0,
  };
  const entryChance = loot.chance(grave.luck);
  const graveEnemy = kill(grave, [(entryChance + loot.CAP) / 2]);
  assert.equal(grave.lastReceivedItems.length, 1);
  assert.equal(grave.lastReceivedItems[0].name, luckReward.name);
  assert.equal(grave.lastReceivedItems[0].level, 100);
  assert.equal(loot.odds(grave, graveEnemy).chance, entryChance);
  assert.equal(loot.chance(grave.luck), loot.CAP);
  assert.doesNotMatch(grave.lastLog, /Nhặt được trang bị/);
  groups.push(
    "Grave Echo guaranteed item retained; new LUCK cannot boost its own drop roll",
  );

  const counter = state();
  core.receiveItem(counter, get("living_armor"));
  kill(counter, [0, 0, 0], "defend");
  assert.equal(counter.kills, 1);
  assert.equal(counter.lastReceivedItems.length, 1);
  assert.match(counter.lastLog, /Nhặt được trang bị/);
  const final = state("final_boss", 999);
  final.encounter.mechanic = "deimoss";
  kill(final, [0, 0.99, 0]);
  assert.equal(final.lastReceivedItems[0].rarity, "cursed");
  assert.equal(final.cleared, 999);
  assert.equal(final.phase, "summit");
  groups.push("counter kills and final Deimoss settle item drops");

  for (const rank of ["normal", "elite", "boss", "final_boss"]) {
    const s = state(rank);
    s.luck = 100;
    const payload = view.privatePayload(s, "test", "public", "encounter");
    bounds(payload);
    assert.match(json(payload), /20%/);
    assert.match(json(payload), /60%/);
    assert.match(json(payload), /40%/);
    const buttons = JSON.stringify(
      view.rows(session.id, s).map((row) => row.toJSON()),
    );
    assert.match(buttons, /view_encounter/);
  }
  for (const field of view.ratesFields("loot"))
    assert(field.value.length <= 1024);
  assert.match(
    JSON.stringify(view.ratesFields("loot")),
    /Rơi trang bị từ quái/,
  );
  groups.push(
    "detail button for every combat, formula and rarity descriptions inside Discord limits",
  );

  const isolated = state();
  isolated.luck = 0;
  isolated.pityLegendary = 100;
  isolated.legendaryFind = 1;
  isolated.modifiers.unstable_rift = 100;
  assert.equal(loot.odds(isolated).chance, 0.01);
  assert.equal(core.legendaryChance(isolated), 0.35);
  groups.push(
    "monster drop remains independent of chest pity, SSR-find and Rift bonuses",
  );

  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const rank of ["normal", "elite", "boss"]) {
    const s = state(rank);
    s.luck = 100;
    s.encounter.hp = 0;
    let drops = 0,
      higher = 0;
    for (let i = 0; i < 50000; i++) {
      delete s.encounter.itemDrop;
      const rarity = loot.roll(s, s.encounter, random);
      if (rarity) {
        drops++;
        if (rarity === loot.odds(s).rarities[1]) higher++;
      }
    }
    assert(Math.abs(drops / 50000 - 0.2) < 0.01);
    assert(Math.abs(higher / drops - 0.4) < 0.02);
  }
  groups.push(
    "150,000 seeded drop simulations respect 20% drop and 40% higher-rarity share",
  );

  const service = require("../src/services/hardcoreService");
  const repo = require("../src/services/hardcoreRepository");
  const inventory = require("../src/services/hardcoreInventoryService");
  inventory.grant("loot-tx", "player", "living_armor", 1);
  const run = service.startHardcore({
    guildId: "loot-tx",
    userId: "player",
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    loadout: { itemIds: ["living_armor"] },
    forcedEncounter: state().encounter,
  });
  assert(run.state.encounter.itemDrop);
  const saved = repo.parseState(repo.getSession(run.session.id));
  const played = service.playHardcore({
    sessionId: run.session.id,
    userId: "player",
    expectedTurn: saved.turn,
    action: "defend",
  });
  assert.equal(played.state.kills, 1);
  const persisted = repo.getSession(run.session.id).state_json;
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "player",
        expectedTurn: saved.turn,
        action: "defend",
      }),
    /STALE_ACTION/,
  );
  assert.equal(repo.getSession(run.session.id).state_json, persisted);
  groups.push(
    "persisted combat snapshot and transactional stale-click rejection",
  );

  console.log("Hardcore monster loot: " + groups.length + " groups passed");
  for (const group of groups) console.log("  ✓ " + group);
} finally {
  db.close();
}
