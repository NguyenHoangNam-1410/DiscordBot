"use strict";

// Every bank event and Discord call below is simulated; never transfers money.
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { spawnSync } = require("node:child_process");
process.env.DB_PATH = ":memory:";
process.env.COMMAND_PREFIX = "!";
const { db } = require("../src/db");
const { createStore } = require("../src/payments/store");
const { validateConfig } = require("../src/payments/config");
const {
  bankTime,
  verifySignature,
  transaction,
  createHandler,
  ENDPOINT,
} = require("../src/payments/casso");
const { createRuntime } = require("../src/payments/runtime");
const { createCommand } = require("../src/commands/bet");
const { createWebServer } = require("../src/webGames/http");
const ui = require("../src/payments/discord");
const secret = "test-only-casso-signature-key-not-for-production";
const G = "123456789012345678",
  U = "222222222222222222",
  C = "333333333333333333";
const base = Date.parse("2026-11-10T10:00:00+07:00");
let time = base,
  seq = 100;
const now = () => time;
const raw = {
  ...require("../docs/casso-payments.example.json"),
  enabled: true,
  guildId: G,
};
const config = validateConfig(raw, { CASSO_WEBHOOK_SECRET: secret });
const store = createStore(db, { now });
const reset = () => {
  db.exec("DELETE FROM bank_bet_receipts; DELETE FROM bank_bet_orders;");
  time = base;
};
function order(amount = 10000, side = "BLG", userId = U, extra = {}) {
  return store.create(config, {
    guildId: G,
    channelId: C,
    userId,
    requestId: String(++seq),
    amount,
    side,
    ...extra,
  });
}
function event(o, extra = {}) {
  const id = ++seq;
  return {
    id,
    reference: `REF${id}`,
    bankCode: "OCB",
    accountNumber: config.mainAccountNumber,
    virtualAccount: config.accountNumber,
    amount: o.amount,
    description: `CK ${o.memo} chuyen tien`,
    happenedAt: time,
    ...extra,
  };
}
function paid(o, extra = {}) {
  return store.receive(config, event(o, extra));
}
function total(side) {
  return (
    store.totals(G, config.campaignId).find((r) => r.side === side)?.amount || 0
  );
}
function payload(t) {
  return {
    error: 0,
    data: {
      id: t.id,
      reference: t.reference,
      bankAbbreviation: t.bankCode,
      accountNumber: t.accountNumber,
      virtualAccountNumber: t.virtualAccount,
      amount: t.amount,
      description: t.description,
      transactionDateTime: new Date(t.happenedAt + 7 * 3600_000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
      counterAccountNumber: "must-not-be-stored",
      runningBalance: 12345678,
    },
  };
}
function sign(data, key = secret) {
  function sort(v) {
    if (!v || typeof v !== "object") return v;
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, sort(x)]),
    );
  }
  const t = String(time);
  return `t=${t},v1=${createHmac("sha512", key)
    .update(t + "." + JSON.stringify(sort(data)))
    .digest("hex")}`;
}

async function main() {
  const missingQrStartup = spawnSync(
    process.execPath,
    [
      "-e",
      `
    process.env.DB_PATH = ':memory:';
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const original = Module._load;
    Module._load = function(name,...args) {
      if(name === 'vietqr') throw Object.assign(new Error("Cannot find module 'vietqr'"), {code:'MODULE_NOT_FOUND'});
      return original.call(this,name,...args);
    };
    (async()=> {
      assert(require('./src/commandRegistry').loadCommands().some(c=>c.data.name==='bet'));
      require('./src/webGames');
      require('./src/payments/runtime').runtime();
      const {createWebServer}=require('./src/webGames/http');
      const web=createWebServer({games:[],config:{origin:'http://127.0.0.1',secure:false}});
      await new Promise(resolve=>web.server.listen(0,'127.0.0.1',resolve));
      try { assert.equal((await fetch('http://127.0.0.1:'+web.server.address().port+'/healthz')).status,200); }
      finally { await web.stop(); }
      await assert.rejects(()=>require('./src/payments/discord').renderQR({}), {code:'MODULE_NOT_FOUND'});
      console.log('startup and web health work without QR dependency');
    })().catch(error=>{console.error(error);process.exitCode=1});
  `,
    ],
    {
      cwd: require("node:path").resolve(__dirname, ".."),
      encoding: "utf8",
      timeout: 20000,
    },
  );
  assert.equal(
    missingQrStartup.status,
    0,
    missingQrStartup.stderr || missingQrStartup.error?.message,
  );
  assert.match(missingQrStartup.stdout, /web health work/);
  assert.equal(config.closesAt, Date.parse("2026-11-14T19:00:00Z"));
  assert.equal(config.maxTransactionAmount, 20000);
  assert.equal(config.maxUserAmount, 50000);
  assert.equal(config.maxTransactions, 3);
  for (const patch of [
    { sides: ["BLG", "LG"] },
    { sides: ["BLG", "BLG"] },
    { guildId: "bad" },
    { accountNumber: "../escape" },
    { bankBin: "970407" },
    { closesAt: "2026-11-15T02:00:00Z" },
    { maxUserAmount: 10000 },
    { maxTransactions: 0 },
    { waitMinutes: 0 },
  ])
    assert.throws(() =>
      validateConfig({ ...raw, ...patch }, { CASSO_WEBHOOK_SECRET: secret }),
    );
  assert.throws(() => validateConfig(raw, {}), /CASSO_WEBHOOK_SECRET/);
  assert.deepEqual(validateConfig({ enabled: false }), { enabled: false });

  const a = order(20000);
  assert.equal(paid(a).reason, "matched");
  time += 1000;
  const b = order(10000, "GENG");
  assert.equal(total("BLG"), 20000, "unpaid selection does not switch sides");
  assert.equal(paid(b).reason, "matched");
  assert.equal(total("BLG"), 0);
  assert.equal(
    total("GENG"),
    30000,
    "latest payment moves the complete wallet",
  );
  time += 1000;
  const c = order(20000, "BLG");
  paid(c);
  assert.equal(total("BLG"), 50000);
  assert.equal(store.player(G, config.campaignId, U).count, 3);
  assert.throws(() => order(1), /3 giao dịch/);
  assert.deepEqual(store.totals("different-guild", config.campaignId), []);
  assert.deepEqual(store.totals(G, "different-campaign"), []);
  const duplicate = event(c, { id: store.get(c.id).provider_id });
  assert.equal(store.receive(config, duplicate).duplicate, true);
  assert.equal(total("BLG"), 50000);
  const restore = createStore(db, { now });
  assert.equal(
    restore.player(G, config.campaignId, U).amount,
    50000,
    "new store reads durable results",
  );

  reset();
  const early = order(20000, "BLG");
  const tEarly = event(early);
  time += 2000;
  const late = order(10000, "GENG");
  const tLate = event(late);
  assert.equal(store.receive(config, tLate).reason, "matched");
  assert.equal(store.receive(config, tEarly).reason, "matched");
  assert.equal(
    total("GENG"),
    30000,
    "out-of-order callbacks preserve bank-time ordering",
  );
  const copy = { ...tLate, id: ++seq };
  assert.equal(
    store.receive(config, copy).duplicate,
    true,
    "bank references also deduplicate",
  );
  const tie1 = order(1000, "BLG", "ties");
  const tie2 = order(1000, "GENG", "ties");
  const tx1 = event(tie1),
    tx2 = event(tie2);
  store.receive(config, tx2);
  store.receive(config, tx1);
  assert.equal(
    store.player(G, config.campaignId, "ties").side,
    "GENG",
    "same-second ties use provider id",
  );

  reset();
  order(20000);
  order(20000, "GENG");
  assert.throws(() => order(10001), /50.000đ/);
  assert.throws(() => order(20001), /20.000đ/);
  assert.throws(() => order(0), /Mỗi giao dịch/);
  assert.throws(() => order(10000, "LG"), /Chỉ nhận/);
  assert.throws(
    () => order(10000, "BLG", U, { guildId: "other" }),
    /server này/,
  );
  order(10000);
  assert.throws(() => order(1), /3 giao dịch/);
  time += 15 * 60_000;
  store.expire();
  assert.doesNotThrow(
    () => order(10000),
    "unpaid expired reservations are released",
  );
  const same = order(10000, "GENG", "idempotent", { requestId: "repeat" });
  assert.equal(
    order(10000, "GENG", "idempotent", { requestId: "repeat" }).id,
    same.id,
  );
  assert.equal(store.player(G, config.campaignId, "idempotent").rows.length, 1);

  // Releasing expired reservations must not let delayed callbacks exceed either hard limit.
  reset();
  const expiredOrders = [order(20000), order(20000), order(10000)];
  const delayed = expiredOrders.map((o) => event(o));
  time += 16 * 60_000;
  store.expire();
  const fresh = order(20000, "GENG");
  paid(fresh);
  assert.equal(store.receive(config, delayed[0]).reason, "matched");
  assert.equal(store.receive(config, delayed[1]).reason, "user_limit");
  assert.equal(store.receive(config, delayed[2]).reason, "matched");
  assert.equal(store.player(G, config.campaignId, U).amount, 50000);
  assert.equal(total("GENG"), 50000);
  reset();
  const delayedSmall = [order(1), order(1), order(1)].map((o) => event(o));
  time += 16 * 60_000;
  store.expire();
  paid(order(1));
  assert.equal(store.receive(config, delayedSmall[0]).reason, "matched");
  assert.equal(store.receive(config, delayedSmall[1]).reason, "matched");
  assert.equal(store.receive(config, delayedSmall[2]).reason, "user_limit");
  assert.equal(store.player(G, config.campaignId, U).count, 3);

  for (const [patch, reason] of [
    [{ amount: 9999 }, "amount_mismatch"],
    [{ description: "GENG PLACEHOLDER" }, "side_mismatch"],
    [{ happenedAt: null }, "missing_time"],
    [{ happenedAt: base - 61_000 }, "invalid_time"],
    [{ happenedAt: base + 301_000 }, "invalid_time"],
  ]) {
    reset();
    const o = order();
    if (patch.description) patch.description = `GENG ${o.id}`;
    assert.equal(paid(o, patch).reason, reason);
    assert.equal(store.get(o.id).status, "review");
    assert.equal(total("BLG"), 0);
    assert.equal(
      db.prepare("SELECT reason FROM bank_bet_receipts").get().reason,
      reason,
    );
    time += 1000;
    assert.equal(
      paid(o).reason,
      "matched",
      "a later exact payment can resolve an order",
    );
  }
  reset();
  const receiveAt = order();
  const inTime = event(receiveAt);
  time += 20 * 60_000;
  store.expire();
  assert.equal(store.get(receiveAt.id).status, "expired");
  assert.equal(
    store.receive(config, inTime).reason,
    "matched",
    "delayed notification for an on-time payment",
  );
  const tooLate = order();
  time = tooLate.expires_at;
  assert.equal(paid(tooLate).reason, "after_expiry");
  assert.equal(store.get(tooLate.id).status, "review");
  const before = order();
  assert.equal(paid(before, { amount: -10000 }).ignored, "outgoing");
  assert.equal(paid(before, { bankCode: "TCB" }).ignored, "receiver");
  assert.equal(
    paid(before, { virtualAccount: "" }).ignored,
    "receiver",
    "main-account-only transfer is not a VA payment",
  );
  assert.equal(paid(before, { virtualAccount: "OTHER" }).ignored, "receiver");
  assert.equal(
    paid(before, { accountNumber: "wrong-main" }).ignored,
    "receiver",
  );
  const valid = event(before, {
    accountNumber: config.accountNumber,
    virtualAccount: "",
  });
  assert.equal(
    store.receive(config, valid).reason,
    "matched",
    "VA may be reported as accountNumber",
  );
  const unknown = event(before, {
    description: "BLG transfer without reference",
  });
  assert.equal(store.receive(config, unknown).reason, "unknown_order");
  assert.equal(store.get(before.id).status, "paid");
  assert.equal(paid(before).reason, "extra_transfer");
  assert.equal(
    store.player(G, config.campaignId, U).count,
    2,
    "extra transfer does not double-count",
  );

  reset();
  time = config.closesAt - 2000;
  const closing = order();
  const beforeClose = event(closing);
  assert.equal(closing.expires_at, config.closesAt);
  time = config.closesAt;
  assert.throws(() => order(), /Đã chốt sổ/);
  assert.equal(paid(closing).reason, "after_close");
  assert.equal(
    store.receive(config, { ...beforeClose, id: ++seq, reference: "ontime" })
      .reason,
    "matched",
  );
  assert.match(
    ui.summary(config, [], { amount: 0, count: 0, side: null, rows: [] }, time)
      .embeds[0].data.description,
    /Đã chốt sổ/,
  );
  assert.match(
    ui.summary(config, [], { amount: 0, count: 0, side: null, rows: [] }, base)
      .embeds[0].data.description,
    /02:00.*15\/11\/2026.*giờ Việt Nam/,
  );
  assert.equal(bankTime("2026-11-15 02:00:00"), config.closesAt);
  for (const bad of [
    "2026-11-15",
    "2026-02-31 02:00:00",
    "not a date",
    null,
    "2026-11-15 25:00:00",
  ])
    assert.equal(bankTime(bad), null);

  // Hit the real shared HTTP server: provider POST bypasses only the bank route's browser CSRF check.
  reset();
  const pending = order();
  const incoming = payload(event(pending));
  assert(verifySignature(sign(incoming), incoming, secret));
  assert(!verifySignature(sign(incoming), { ...incoming, error: 1 }, secret));
  assert(!verifySignature(sign(incoming), incoming, "wrong secret"));
  // Published Casso payload, checksum recomputed with their reference JS implementation:
  // the checksum currently printed in that example does not match its own payload/key.
  // This fixed vector is independent of the test signing helper.
  // The checksum key below is public sample data, never a production credential.
  const official = {
    error: 0,
    data: {
      id: 218897,
      reference: "FT24364030863634",
      description: "hoi lai 100 bao mun dua",
      amount: 16775000,
      runningBalance: 16775000,
      transactionDateTime: "2024-12-23 07:00:00",
      accountNumber: "123456789",
      bankName: "MBBank",
      bankAbbreviation: "MBB",
      virtualAccountNumber: "",
      virtualAccountName: "",
      counterAccountName: "",
      counterAccountNumber: "",
      counterAccountBankId: "",
      counterAccountBankName: "",
    },
  };
  assert(
    verifySignature(
      "t=1734924830020,v1=b3d9438862f167b4e441451b46adaff01f4aaa0c05fa86df1803b7452616c449b9f69837be23b76f79862b346c8bc90a4f1152397a886d4ec24e857cdf6ad08f",
      official,
      "g3oZ950pJQ4k6REhOPGkx37RsXgWz9QJ9RCAZ7i0yagLF32XQZtemQ6r3JIo4MCr",
    ),
  );
  const reordered = {
    data: Object.fromEntries(Object.entries(incoming.data).reverse()),
    error: 0,
  };
  assert(verifySignature(sign(incoming), reordered, secret));
  assert.equal(
    transaction({ ...incoming, data: { ...incoming.data, id: "123" } }),
    null,
  );
  const handler = createHandler({
    getConfig: () => config,
    getStore: () => store,
  });
  const httpConfig = { origin: "http://localhost", secure: false };
  const server = createWebServer({
    games: [],
    config: httpConfig,
    webhooks: [{ path: ENDPOINT, handle: handler }],
  });
  await new Promise((resolve) => server.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.server.address().port}`;
  httpConfig.origin = origin;
  async function post(data, signature = sign(data), extra = {}) {
    return fetch(origin + ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-casso-signature": signature,
        ...extra,
      },
      body: JSON.stringify(data),
    });
  }
  try {
    assert.equal((await fetch(origin + ENDPOINT)).status, 405);
    assert.equal((await post(incoming, "bad")).status, 401);
    assert.equal((await post(incoming, sign(incoming, "wrong"))).status, 401);
    assert.equal(store.get(pending.id).status, "pending");
    assert.equal(
      (
        await post(
          { ...incoming, data: { ...incoming.data, amount: 20000 } },
          sign(incoming),
        )
      ).status,
      401,
    );
    const test = { error: 0, data: { ...incoming.data, id: 0 } };
    assert.equal((await post(test)).status, 200);
    assert.equal(
      store.get(pending.id).status,
      "pending",
      "provider test never books money",
    );
    const response = await post(incoming);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal((await post(incoming)).status, 200);
    assert.equal(store.player(G, config.campaignId, U).amount, 10000);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM bank_bet_receipts").get().n,
      1,
    );
    assert(
      !JSON.stringify(
        db.prepare("SELECT * FROM bank_bet_receipts").all(),
      ).includes("must-not-be-stored"),
    );
    const oversize = { ...incoming, padding: "x".repeat(33 * 1024) };
    assert.equal((await post(oversize)).status, 413);
    assert.equal(
      (await post(incoming, sign(incoming), { "content-type": "text/plain" }))
        .status,
      415,
    );
    assert.equal(
      (
        await fetch(origin + "/api/games/caro/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
      "ordinary browser CSRF protection still applies",
    );
    assert.equal(
      (await fetch(origin + "/data/bank-payments.json")).status,
      404,
    );
    assert.equal((await fetch(origin + "/payments/config.js")).status, 404);
  } finally {
    await server.stop();
  }

  // Commands, persistent Discord edits, transient failure/restart, and prefix all use the same ledger.
  reset();
  let failDiscord = true,
    edits = [],
    calls = [];
  const client = {
    channels: {
      fetch: async () => ({
        messages: {
          edit: async (id, data) => {
            if (failDiscord)
              throw Object.assign(new Error("transient"), { code: 50001 });
            edits.push({ id, data });
          },
        },
      }),
    },
  };
  const runtime = createRuntime({ db, read: () => config, now });
  runtime.start(client, null, true);
  const fakeQR = async () =>
    new (require("discord.js").AttachmentBuilder)(Buffer.from("test-image"), {
      name: "bank-qr.png",
    });
  const cmd = createCommand(() => runtime, fakeQR);
  function interaction(amount = null, side = null, user = U) {
    return {
      id: String(++seq),
      guildId: G,
      channelId: C,
      user: { id: user },
      createdTimestamp: now(),
      options: { getInteger: () => amount, getString: () => side },
      reply: async (p) => {
        calls.push(p);
      },
      deferReply: async () => {},
      editReply: async (p) => {
        calls.push(p);
        return { id: `message${seq}` };
      },
    };
  }
  await cmd.execute(interaction(20000, "BLG"));
  let placed = runtime.store.player(G, config.campaignId, U).rows[0];
  assert(placed.message_id);
  assert.equal(
    calls.at(-1).embeds[0].data.image.url,
    "attachment://bank-qr.png",
  );
  assert.equal(calls.at(-1).files[0].name, "bank-qr.png");
  // Parse the actual EMV payload generated for the QR and verify the transfer destination and memo.
  function tlv(text) {
    const fields = new Map();
    for (let i = 0; i < text.length;) {
      const key = text.slice(i, i + 2),
        length = Number(text.slice(i + 2, i + 4));
      assert(
        Number.isInteger(length) &&
          length >= 0 &&
          i + 4 + length <= text.length,
      );
      assert(!fields.has(key));
      fields.set(key, text.slice(i + 4, i + 4 + length));
      i += 4 + length;
    }
    return fields;
  }
  const encoded = ui.qrText(placed);
  const qr = tlv(encoded),
    merchant = tlv(qr.get("38")),
    receiver = tlv(merchant.get("01"));
  assert.equal(receiver.get("00"), "970448");
  assert.equal(receiver.get("01"), config.accountNumber);
  assert.equal(qr.get("54"), "20000");
  assert.equal(qr.get("53"), "704");
  assert.equal(qr.get("58"), "VN");
  assert.equal(tlv(qr.get("62")).get("08"), placed.memo);
  assert.equal(qr.get("63").length, 4);
  await cmd.execute(interaction(10001, null));
  assert.match(calls.at(-1).content, /Nhập đủ/);
  await cmd.execute(interaction(null, null));
  assert(calls.at(-1).flags, "slash summary is private");
  runtime.store.receive(config, event(placed));
  await runtime.sync();
  assert(
    calls.some((p) => p.embeds?.[0].data.title.includes("Đã nhận tiền")),
    "updates through valid interaction credentials",
  );
  await runtime.stop();

  // Simulate the bot restarting after the bank callback but before editing the message.
  const newer = order(10000, "GENG");
  store.bindMessage(newer.id, "saved-message");
  paid(newer);
  const restarted = createRuntime({ db, read: () => config, now });
  restarted.start(client, null, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    store.get(newer.id).ui_dirty,
    1,
    "failed Discord edit stays queued",
  );
  failDiscord = false;
  time += 31_000;
  await restarted.sync();
  assert(
    edits.some(
      (e) =>
        e.id === "saved-message" &&
        e.data.embeds[0].data.title.includes("Đã nhận tiền"),
    ),
  );
  assert.equal(store.get(newer.id).ui_dirty, 0);
  assert.equal(total("GENG"), 30000);
  const stale = store.get(newer.id);
  db.prepare(
    "UPDATE bank_bet_orders SET revision=revision+1,ui_dirty=1 WHERE id=?",
  ).run(stale.id);
  store.acknowledge(stale);
  assert.equal(
    store.get(stale.id).ui_dirty,
    1,
    "old UI acknowledgement cannot clear a newer update",
  );
  await restarted.stop();

  reset();
  calls = [];
  const prefixRuntime = createRuntime({ db, read: () => config, now });
  prefixRuntime.start(client, null, true);
  const prefixCommand = createCommand(() => prefixRuntime, fakeQR);
  const qrFailureCommand = createCommand(
    () => prefixRuntime,
    async () => {
      throw new Error("QR service down");
    },
  );
  await qrFailureCommand.execute(interaction(10000, "BLG", "qr-error"));
  assert.match(calls.at(-1).content, /giải phóng hạn mức/);
  assert.equal(
    prefixRuntime.store.player(G, config.campaignId, "qr-error").rows[0].status,
    "expired",
  );
  const missingQrCommand = createCommand(
    () => prefixRuntime,
    async () => {
      throw Object.assign(new Error("Cannot find module 'vietqr'"), {
        code: "MODULE_NOT_FOUND",
      });
    },
  );
  await missingQrCommand.execute(interaction(10000, "BLG", "missing-qr"));
  assert.match(calls.at(-1).content, /npm ci/);
  assert.equal(
    prefixRuntime.store.player(G, config.campaignId, "missing-qr").rows[0]
      .status,
    "expired",
  );
  const prefixMessage = {
    id: "prefix-request",
    guildId: G,
    channelId: C,
    author: { id: U },
    content: "!bet 10000 geng",
    createdTimestamp: time,
    client: { commands: new Map([["bet", prefixCommand]]) },
    channel: { sendTyping: async () => {} },
    reply: async (data) => {
      calls.push(data);
      return {
        id: "prefix-result",
        edit: async (p) => {
          calls.push(p);
          return { id: "prefix-result" };
        },
      };
    },
  };
  assert(
    await require("../src/services/slashPrefixService").handleSlashPrefix(
      prefixMessage,
    ),
  );
  assert.equal(
    prefixRuntime.store.player(G, config.campaignId, U).rows[0].side,
    "GENG",
  );
  const denied = interaction(10000, "BLG");
  denied.guildId = "other";
  await prefixCommand.execute(denied);
  assert.match(calls.at(-1).content, /chưa được bật/);
  await prefixRuntime.stop();
  const unavailable = createRuntime({ db, read: () => config, now });
  assert.throws(() => unavailable.start(client, null, false), /WEB_ENABLED/);
  assert.equal(unavailable.ready(), false);
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("QR must not make network requests");
  };
  try {
    const raster = (await ui.renderQR(placed)).attachment;
    assert.equal(raster.subarray(1, 4).toString(), "PNG");
    assert.equal(raster.readUInt32BE(16), raster.readUInt32BE(20));
    assert(raster.readUInt32BE(16) >= 256, "PNG is large enough to scan");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  const registered = require("../src/commandRegistry").loadCommands();
  assert.equal(registered.filter((c) => c.data.name === "bet").length, 1);
  assert.equal(
    registered.find((c) => c.data.name === "bet").data.toJSON().options[1]
      .choices.length,
    2,
  );
  console.log(
    JSON.stringify({
      ok: true,
      bankPayments:
        "V2 signatures, authenticated HTTP, exact receiver/amount/reference, test isolation, replay dedup, 20k/50k/3 limits, pending reservations, 02:00 UTC+7 cutoff, latest-payment wallet reassignment, delayed/out-of-order delivery, review ledger, restart-safe Discord edits, slash/prefix, private config",
    }),
  );
  db.close();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
