"use strict";
const assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const engine = require("../src/coquay/engine");
const { normalizeRules } = require("../src/coquay/rules");
const { createStore, WAIT_MS } = require("../src/coquay/store");
const { createGame } = require("../src/coquay/webGame");
const { createWebServer } = require("../src/webGames/http");
let clock = Date.now(),
  serial = 0,
  web;
const now = () => clock,
  store = createStore(db, now);
const users = {
  X: { id: "100000000000000001", username: "Nguyễn An <script>" },
  O: { id: "100000000000000002", username: "Trần Bình" },
};
const create = (
  rules = {},
  guildId = `cq-${++serial}`,
  channelId = "channel",
) => store.create({ rules, guildId, channelId, user: users.X });
const match = (rules = {}) => store.join(create(rules).id, users.O);
const move = (r, data) => store.move(r.id, users[r.turn].id, data, r.version);
const code = (fn, c) => assert.throws(fn, (e) => e.code === c);
function patch(r, fn) {
  const current = store.get(r.id);
  fn(current.duel);
  db.prepare("UPDATE coquay_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(current),
    r.id,
  );
  return store.get(r.id);
}
async function main() {
  // Upgrade a populated legacy database, without refunds or touching other items.
  const legacyIds = [
    "coquay_magnifier",
    "coquay_decoy",
    "coquay_saw",
    "coquay_cuffs",
  ];
  db.exec(
    "DROP TABLE coquay_seats; DROP TABLE coquay_rooms; DROP TABLE coquay_channel_settings; DELETE FROM schema_migrations WHERE version=67;",
  );
  for (const id of [...legacyIds, "gacha_ticket_1"])
    db.prepare(
      "INSERT INTO user_inventory(guild_id,user_id,item_id,quantity,acquired_at,updated_at) VALUES('upgrade','u',?,3,1,1)",
    ).run(id);
  db.prepare(
    "INSERT INTO coquay_sessions(id,guild_id,user_id,channel_id,state_json,created_at,updated_at) VALUES('legacy','upgrade','u','c','{}',1,1)",
  ).run();
  const balanceBefore = db
    .prepare("SELECT count(*) n FROM economy_transactions")
    .get().n;
  const source = require("node:fs").readFileSync(
    require.resolve("../src/db"),
    "utf8",
  );
  const migration = source.slice(
    source.search(/runMigration\(\s*67,/),
    source.indexOf("module.exports = { db, dbPath, runMigration };"),
  );
  const applyUpgrade = () =>
    require("node:vm").runInNewContext(migration, {
      db,
      runMigration: require("../src/db").runMigration,
    });
  applyUpgrade();
  applyUpgrade();
  assert.equal(db.prepare("SELECT count(*) n FROM coquay_sessions").get().n, 0);
  assert.deepEqual(
    db
      .prepare(
        "SELECT item_id,quantity FROM user_inventory WHERE guild_id='upgrade'",
      )
      .all(),
    [{ item_id: "gacha_ticket_1", quantity: 3 }],
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM economy_transactions").get().n,
    balanceBefore,
  );
  // Retire the old channel catalog without changing live web rooms or their limits.
  const webRoom = create({}, "channel-upgrade");
  store.setChannelLimit("channel-upgrade", "channel", 7, "admin");
  db.exec(`DELETE FROM schema_migrations WHERE version=68;
    INSERT INTO game_channels VALUES('channel-upgrade','coquay','old-channel',1);
    INSERT INTO game_channels VALUES('channel-upgrade','poker','poker-channel',1);
    INSERT INTO game_settings VALUES('channel-upgrade','maintenance:coquay','1','admin',1);
    INSERT INTO game_settings VALUES('channel-upgrade','maintenance:poker','1','admin',1);`);
  const channelMigration = source.slice(
    source.search(/runMigration\(\s*68,/),
    source.indexOf("module.exports = { db, dbPath, runMigration };"),
  );
  for (let i = 0; i < 2; i++)
    require("node:vm").runInNewContext(channelMigration, {
      db,
      runMigration: require("../src/db").runMigration,
    });
  assert.deepEqual(
    db
      .prepare(
        "SELECT game,channel_id FROM game_channels WHERE guild_id='channel-upgrade'",
      )
      .all(),
    [{ game: "poker", channel_id: "poker-channel" }],
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT setting_key FROM game_settings WHERE guild_id='channel-upgrade'",
      )
      .all(),
    [{ setting_key: "maintenance:poker" }],
  );
  assert.equal(store.get(webRoom.id).status, "waiting");
  assert.equal(store.getChannelLimit("channel-upgrade", "channel"), 7);
  assert.deepEqual(normalizeRules(), {
    maxHp: 5,
    itemLimit: 4,
    timeMinutes: 30,
  });
  for (const v of [0, 21, 1.5, "5", NaN])
    code(() => normalizeRules({ maxHp: v }), "INVALID_RULES");
  for (const v of [0, 13, 1.5, "4", NaN])
    code(() => normalizeRules({ itemLimit: v }), "INVALID_RULES");
  const rules = normalizeRules({ maxHp: 20, itemLimit: 4 }),
    g = engine.create(rules);
  engine.begin(g, rules, () => 0);
  assert.equal(g.hp.player, 20);
  assert.equal(g.loads, 1);
  assert.equal(g.inventory.player.length, 1);
  for (let i = 0; i < 15; i++) {
    g.chamber = [false];
    g.turn = "player";
    engine.act(g, "X", { type: "shoot", target: "self" }, rules, () => 0);
    assert(g.inventory.player.length <= 4);
    assert(g.inventory.bot.length <= 4);
  }
  assert.equal(g.inventory.player.length, 4);
  assert.equal(g.boxes.X.discarded, 1);
  const smallRules = normalizeRules({ maxHp: 1, itemLimit: 1 });
  const small = engine.create(smallRules);
  engine.begin(small, smallRules, (max) => max - 1);
  assert.equal(small.inventory.player.length, 1);
  assert.equal(small.boxes.X.discarded, 1);
  assert.equal(small.boxes.O.discarded, 1);
  const fresh = (items, ammo = [true, false, true]) => {
    const s = engine.create(rules);
    s.loads = 1;
    s.chamber = ammo;
    s.inventory.player = [...items];
    return s;
  };
  let s = fresh(["magnifier", "inverter", "magnifier"]);
  engine.act(s, "X", { type: "item", itemId: "magnifier" }, rules, () => 0);
  assert.equal(engine.view(s, "X", rules).knownShell, true);
  assert.equal(engine.view(s, "O", rules).knownShell, null);
  assert.equal(engine.view(s, null, rules).knownShell, null);
  assert(!JSON.stringify(engine.view(s, null, rules)).includes("chamber"));
  code(
    () =>
      engine.act(s, "X", { type: "item", itemId: "magnifier" }, rules, () => 0),
    "ITEM_UNAVAILABLE",
  );
  engine.act(s, "X", { type: "item", itemId: "inverter" }, rules, () => 0);
  assert.equal(s.chamber[0], false);
  assert.deepEqual(s.knowledge, {});
  engine.act(s, "X", { type: "item", itemId: "magnifier" }, rules, () => 0);
  assert.equal(engine.view(s, "X", rules).knownShell, false);
  engine.act(s, "X", { type: "shoot", target: "self" }, rules, () => 0);
  assert.equal(s.turn, "player");
  assert.deepEqual(s.knowledge, {});
  s = fresh(["saw", "cuffs"]);
  engine.act(s, "X", { type: "item", itemId: "saw" }, rules, () => 0);
  engine.act(s, "X", { type: "item", itemId: "cuffs" }, rules, () => 0);
  s.shield.bot = true;
  const hit = engine.act(
    s,
    "X",
    { type: "shoot", target: "opponent" },
    rules,
    () => 0,
  );
  assert.equal(hit.damage, 1);
  assert.equal(hit.blocked, 1);
  assert(hit.cuffSkip);
  assert.equal(s.turn, "player");
  assert.equal(s.saw, false);
  s = fresh(["medicine"]);
  code(
    () =>
      engine.act(s, "X", { type: "item", itemId: "medicine" }, rules, () => 0),
    "ITEM_UNAVAILABLE",
  );
  assert.equal(s.inventory.player.length, 1);
  s.hp.player = 19;
  engine.act(s, "X", { type: "item", itemId: "medicine" }, rules, () => 0);
  assert.equal(s.hp.player, 20);
  s = fresh(["beer"], [false]);
  const beer = engine.act(
    s,
    "X",
    { type: "item", itemId: "beer" },
    rules,
    () => 0,
  );
  assert(beer.reloaded);
  assert.equal(beer.live, false);
  assert.equal(s.turn, "player");
  assert.equal(s.loads, 2);
  assert.equal(s.inventory.player.length, 1);
  code(
    () => engine.act(s, "X", { type: "shoot", target: "evil" }, rules, () => 0),
    "INVALID_ACTION",
  );
  // Store: membership, versions, clocks, persistence, termination, no economy settlement.
  let r = match();
  assert.equal(r.duel.hp.bot, 5);
  assert.equal(r.duel.loads, 1);
  code(
    () =>
      store.move(
        r.id,
        "outsider",
        { type: "shoot", target: "self" },
        r.version,
      ),
    "NOT_PLAYER",
  );
  code(
    () =>
      store.move(
        r.id,
        users.O.id,
        { type: "shoot", target: "self" },
        r.version,
      ),
    "NOT_TURN",
  );
  code(
    () =>
      store.move(
        r.id,
        users.X.id,
        { type: "shoot", target: "self" },
        r.version - 1,
      ),
    "STALE_BOARD",
  );
  code(() => create({}, r.guildId), "ALREADY_PLAYING");
  r = patch(r, (s) => {
    s.inventory.player = ["magnifier", "saw"];
    s.chamber = [false, true, true];
  });
  clock += 1250;
  r = move(r, { type: "item", itemId: "magnifier" });
  assert.equal(r.clocks.X, 1800000 - 1250);
  assert.equal(r.turn, "X");
  assert.equal(store.snapshot(r, users.X.id).knownShell, false);
  assert.equal(store.snapshot(r, users.O.id).knownShell, null);
  assert.equal(store.snapshot(r, null).knownShell, null);
  clock += 750;
  r = move(r, { type: "shoot", target: "self" });
  assert.equal(r.clocks.X, 1800000 - 2000);
  assert.equal(r.turn, "X");
  assert.deepEqual(createStore(db, now).get(r.id), r);
  r = patch(r, (s) => {
    s.hp.bot = 1;
    s.chamber = [true, false];
  });
  const histories = db.prepare("SELECT count(*) n FROM game_history").get().n;
  r = move(r, { type: "shoot", target: "opponent" });
  assert.equal(r.winner, "X");
  assert.equal(r.status, "finished");
  assert.equal(
    db.prepare("SELECT count(*) n FROM coquay_seats WHERE room_id=?").get(r.id)
      .n,
    0,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM game_history").get().n,
    histories,
  );
  assert.match(
    require("../src/coquay/discord")
      .roomPayload(r, "https://example.com/coquay")
      .embeds[0].toJSON().description,
    /Nguyễn An <script> thắng/,
  );
  code(() => move(r, { type: "shoot", target: "self" }), "ROOM_CLOSED");
  r = match({ timeMinutes: 1 });
  clock += 60001;
  code(() => move(r, { type: "shoot", target: "self" }), "ROOM_CLOSED");
  assert.equal(store.get(r.id).reason, "timeout");
  assert.equal(store.get(r.id).winner, "O");
  r = create();
  clock += WAIT_MS;
  assert.equal(store.get(r.id).reason, "expired");
  r = match();
  assert.equal(store.leave(r.id, users.O.id).winner, "X");
  r = match({ maxHp: 1 });
  r = patch(r, (s) => {
    s.chamber = [true, false];
  });
  r = move(r, { type: "shoot", target: "self" });
  assert.equal(r.winner, "O");
  assert.equal(r.duel.loads, 1, "Fatal shot never reloads or grants a box");
  store.setChannelLimit("limited", "channel", 1, "admin");
  r = create({}, "limited");
  code(
    () =>
      store.create({ guildId: "limited", channelId: "channel", user: users.O }),
    "CHANNEL_FULL",
  );
  store.leave(r.id, users.X.id);
  const pool = require("../src/services/gachaPoolService");
  assert(
    !pool.listGachaPool("retire").some((i) => i.itemId?.startsWith("coquay_")),
  );
  for (const id of [
    "coquay_magnifier",
    "coquay_decoy",
    "coquay_saw",
    "coquay_cuffs",
  ]) {
    assert.equal(
      require("../src/services/itemCatalogService").getCatalogItem(id),
      null,
    );
    assert.throws(
      () => pool.addGachaItem("retire", id, "SR", "admin"),
      /INVALID_GACHA_ITEM/,
    );
  }
  db.prepare(
    "INSERT INTO gacha_pool_entries(guild_id,reward_key,kind,item_id,display_name,tier,amount,weight,updated_by,updated_at) VALUES('retire','custom_old','item','coquay_saw','Old','SSR',1,100,'admin',1)",
  ).run();
  assert(
    !pool.listGachaPool("retire").some((i) => i.rewardKey === "custom_old"),
  );
  assert.throws(
    () => require("../src/services/coquayService").startCoquay({}),
    /chuyển sang web/,
  );
  assert(!require("../src/commands/choi").standaloneCommands.coquay);
  // Three clients see only their permitted information, including concurrent ACK and SSE.
  r = match({ maxHp: 12, itemLimit: 6 });
  r = patch(r, (s) => {
    s.inventory.player = ["magnifier"];
    s.chamber = [true, false, true, false];
  });
  const config = { origin: "", secure: false };
  web = createWebServer({ games: [createGame({ store, db })], config, now });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  const request = async (route, data, cookie, origin = config.origin) => {
    const response = await fetch(config.origin + "/api/games/coquay/" + route, {
      method: data ? "POST" : "GET",
      headers: {
        ...(data ? { "Content-Type": "application/json", Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const login = async (user) => {
    const ticket = new URL(web.issueTicket("coquay", r.id, user)).hash.slice(8);
    return (await request("login", { ticket })).cookie;
  };
  const cookies = [await login(users.X.id), await login(users.O.id), null],
    controllers = [
      new AbortController(),
      new AbortController(),
      new AbortController(),
    ];
  const readers = await Promise.all(
    cookies.map(async (cookie, i) => {
      const res = await fetch(
        `${config.origin}/api/games/coquay/events?room=${r.id}`,
        {
          headers: cookie ? { Cookie: cookie } : {},
          signal: controllers[i].signal,
        },
      );
      assert.equal(res.status, 200);
      const reader = res.body.getReader();
      await reader.read();
      return reader;
    }),
  );
  try {
    const events = readers.map((reader) => reader.read()),
      action = {
        roomId: r.id,
        type: "item",
        itemId: "magnifier",
        version: r.version,
      };
    assert.equal(
      (await request("move", action, cookies[0], "https://evil.example"))
        .status,
      403,
    );
    const both = await Promise.all([
      request("move", action, cookies[0]),
      request("move", action, cookies[0]),
    ]);
    assert.deepEqual(both.map((v) => v.status).sort(), [200, 409]);
    assert.equal(both.find((v) => v.status === 200).data.knownShell, true);
    const texts = await Promise.all(
      events.map(async (value) =>
        new TextDecoder().decode((await value).value),
      ),
    );
    assert.match(texts[0], /"knownShell":true/);
    assert.match(texts[1], /"knownShell":null/);
    assert.match(texts[2], /"knownShell":null/);
    for (const text of texts) assert(!text.includes('"chamber"'));
    assert.equal(
      (
        await request(
          "move",
          { ...action, version: store.get(r.id).version },
          null,
        )
      ).status,
      401,
    );
  } finally {
    controllers.forEach((c) => c.abort());
    for (const reader of readers) await reader.cancel().catch(() => {});
  }
  assert.equal(
    (await fetch(config.origin + `/coquay/room/${r.id}`)).status,
    200,
  );
  assert.match(await (await fetch(config.origin + "/")).text(), /Cò quay Nga/);
  // Commands and Discord room refresh use the common web lifecycle.
  const command = require("../src/commands/coquay"),
    runtime = require("../src/coquay/runtime"),
    schema = command.data.toJSON();
  assert.equal(schema.options.length, 4);
  assert.deepEqual(
    schema.options[0].options.map((o) => o.name),
    ["mau", "vatpham", "thoigian"],
  );
  const previous = runtime.isAvailable;
  runtime.isAvailable = () => true;
  try {
    const channels = require("../src/services/gameChannelService");
    assert(!channels.GAMES.includes("coquay"));
    const adminSchema = require("../src/commands/quantri").data.toJSON();
    assert(
      !adminSchema.options
        .find((o) => o.name === "datkenh")
        .options.find((o) => o.name === "trochoi")
        .choices.some((o) => o.value === "coquay"),
    );
    assert(
      !require("../src/services/gameConfigService").configKeysForScope("coquay")
        .length,
    );
    // Stale channel/maintenance rows must not block the web game.
    db.prepare(
      "INSERT INTO game_channels(guild_id,game,channel_id,updated_at) VALUES('discord','coquay','old-channel',1)",
    ).run();
    db.prepare(
      "INSERT INTO game_settings(guild_id,setting_key,setting_value,updated_by,updated_at) VALUES('discord','maintenance:coquay','1','admin',1)",
    ).run();
    const replies = [],
      i = {
        guildId: "discord",
        channelId: "chan",
        user: users.X,
        options: {
          getSubcommand: () => "choi",
          getInteger: (key) =>
            ({ mau: 8, vatpham: 7, thoigian: 10 })[key] ?? null,
        },
        reply: async (p) => replies.push(p),
        deferReply: async () => {},
        editReply: async (p) => {
          replies.push(p);
          return { id: "lobby" };
        },
      };
    await require("../src/commands/game").execute({
      ...i,
      memberPermissions: { has: () => true },
      options: { getSubcommand: () => "setup", getString: () => "coquay" },
    });
    assert.match(replies.at(-1).content, /không cần đặt kênh/);
    await command.execute(i);
    const room = runtime.store.listOpen("discord", "chan")[0];
    assert.equal(room.rules.maxHp, 8);
    assert.equal(room.rules.itemLimit, 7);
    assert.equal(room.messageId, "lobby");
    const button = {
      ...i,
      user: users.O,
      message: { id: "lobby" },
      customId: `coquay:join:${room.id}`,
      deferUpdate: async () => {},
      followUp: async (p) => replies.push(p),
      isButton: () => true,
      isModalSubmit: () => false,
      isStringSelectMenu: () => false,
    };
    assert(
      await require("../src/componentRouter").routeComponentInteraction(button),
    );
    assert.equal(runtime.store.get(room.id).status, "playing");
    await command.handleButton({ ...button, customId: "coquay:old:shoot:bot" });
    assert.match(replies.at(-1).content, /cũ/);
    const client = {
      channels: {
        fetch: () => {
          throw Error("Use bound interaction");
        },
      },
    };
    await runtime.syncMessages(client);
    assert.match(replies.at(-1).embeds[0].toJSON().title, /ĐANG ĐẤU/);
    runtime.store.leave(room.id, users.O.id);
    await runtime.syncMessages(client);
    assert.match(replies.at(-1).embeds[0].toJSON().description, /thắng/);
    // Prefix opens a room without any old game-channel setup.
    const old = process.env.COMMAND_PREFIX;
    process.env.COMMAND_PREFIX = "!";
    try {
      await require("../src/services/slashPrefixService").handleSlashPrefix({
        guildId: "prefix",
        channelId: "chan",
        author: users.X,
        content: "!coquay choi mau=9 vatpham=6",
        channel: {},
        reply: async (p) => {
          replies.push(p);
          return { id: "prefix" };
        },
      });
      assert.equal(runtime.store.listOpen("prefix", "chan")[0].rules.maxHp, 9);
    } finally {
      if (old === undefined) delete process.env.COMMAND_PREFIX;
      else process.env.COMMAND_PREFIX = old;
    }
    await command.execute({
      ...i,
      memberPermissions: { has: () => false },
      options: { getSubcommand: () => "cauhinh" },
    });
    assert.match(replies.at(-1).content, /Chỉ quản trị/);
  } finally {
    runtime.isAvailable = previous;
  }
  store.sweep();
  const health = require("../src/services/operationalHealthService"),
    baseline = health.getOperationalHealth().active.sessions;
  r = create({}, "health");
  assert.equal(health.getOperationalHealth().active.sessions, baseline + 1);
  store.leave(r.id, users.X.id);
  r = create({}, "reset");
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "reset",
  });
  assert.equal(store.get(r.id), null);
  console.log(
    JSON.stringify({
      ok: true,
      coquay:
        "7 tools, box capacity, secret shell, PvP, clocks, restart, locks, concurrent ACK/SSE, retirement, Discord and prefix",
    }),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (web) await web.stop();
    db.close();
  });
