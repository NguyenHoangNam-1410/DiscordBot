"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  collect,
  assess,
  THRESHOLDS,
} = require("../src/services/systemLoadService");
const command = require("../src/commands/healthcheck");

const base = () => ({
  cores: 4,
  load: { one: 0.4, five: 0.3, fifteen: 0.2, perCore: 0.1 },
  memory: { total: 8e9, free: 6e9, used: 2e9, percent: 25 },
  process: {
    rss: 1e8,
    heapUsed: 5e7,
    heapTotal: 8e7,
    cpuPercent: 3,
    uptimeSeconds: 90000,
    pid: 1,
  },
  loop: { meanMs: 2, p99Ms: 20, maxMs: 40 },
  disk: { total: 20e9, free: 10e9, used: 10e9, percent: 50 },
  backupBytes: 1e9,
  discord: { ping: 80, guilds: 2, ready: true },
});

(async () => {
  // Ngưỡng cảnh báo
  assert.deepEqual(assess(base()), { status: 0, warnings: [] });
  const warn = (patch) => assess({ ...base(), ...patch });
  assert.equal(
    warn({ load: { one: 3.5, five: 1, fifteen: 1, perCore: 0.9 } }).status,
    1,
  );
  assert.equal(
    warn({ load: { one: 8, five: 1, fifteen: 1, perCore: 2 } }).status,
    2,
  );
  assert.equal(warn({ memory: { ...base().memory, percent: 90 } }).status, 1);
  assert.equal(warn({ memory: { ...base().memory, percent: 97 } }).status, 2);
  assert.equal(warn({ disk: { ...base().disk, percent: 88 } }).status, 1);
  assert.equal(warn({ disk: { ...base().disk, percent: 99 } }).status, 2);
  assert.equal(
    warn({ disk: null }).status,
    0,
    "không đọc được ổ đĩa không báo lỗi giả",
  );
  assert.equal(warn({ loop: { meanMs: 5, p99Ms: 300, maxMs: 900 } }).status, 1);
  assert.equal(
    warn({ discord: { ping: 2000, guilds: 1, ready: true } }).status,
    2,
  );
  assert.equal(
    warn({ discord: { ping: 50, guilds: 1, ready: false } }).status,
    2,
  );
  const many = warn({
    load: { one: 8, five: 1, fifteen: 1, perCore: 2 },
    disk: { ...base().disk, percent: 99 },
  });
  assert.equal(many.status, 2);
  assert.equal(many.warnings.length, 2);
  assert.ok(THRESHOLDS.diskPercent.warn < THRESHOLDS.diskPercent.bad);

  // Đo thật: số liệu hợp lệ, không NaN
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bot-health-"));
  fs.writeFileSync(path.join(directory, "a.sqlite"), "x".repeat(1234));
  const real = await collect({
    client: {
      ws: { ping: 55 },
      guilds: { cache: { size: 3 } },
      isReady: () => true,
    },
    dbPath: path.join(directory, "db.sqlite"),
    backupDir: directory,
  });
  for (const value of [
    real.cores,
    real.load.one,
    real.memory.percent,
    real.process.rss,
    real.process.cpuPercent,
    real.loop.meanMs,
    real.loop.p99Ms,
    real.disk.percent,
  ])
    assert.ok(Number.isFinite(value), String(value));
  assert.equal(real.backupBytes, 1234);
  assert.equal(real.discord.ping, 55);
  assert.ok([0, 1, 2].includes(real.status));
  fs.rmSync(directory, { recursive: true, force: true });

  // Embed: đủ trường, không vượt giới hạn Discord, hiện cảnh báo
  const embed = command
    .healthEmbed({
      ...base(),
      status: 1,
      warnings: [{ level: 1, message: "Ổ đĩa đã dùng 88%" }],
    })
    .toJSON();
  assert.match(embed.title, /TẢI HỆ THỐNG/);
  assert.ok(embed.fields.every((f) => f.value.length <= 1024));
  assert.ok(
    embed.fields.some((f) => f.name === "Cảnh báo" && /Ổ đĩa/.test(f.value)),
  );
  assert.ok(
    !JSON.stringify(embed).includes("NaN") &&
      !JSON.stringify(embed).includes("undefined"),
  );
  const calm = command
    .healthEmbed({ ...base(), status: 0, warnings: [] })
    .toJSON();
  assert.ok(!calm.fields.some((f) => f.name === "Cảnh báo"));

  // Lệnh: chỉ admin
  assert.equal(command.data.toJSON().name, "healthcheck");
  const replies = [];
  const interaction = (admin) => ({
    user: { id: "u" },
    memberPermissions: { has: () => admin },
    client: {
      ws: { ping: 30 },
      guilds: { cache: { size: 1 } },
      isReady: () => true,
    },
    reply: async (p) => replies.push(p),
    deferReply: async (p) => replies.push({ deferred: p }),
    editReply: async (p) => replies.push(p),
  });
  await command.execute(interaction(false));
  assert.match(replies.at(-1).content, /Chỉ admin/);
  assert.ok(replies.at(-1).flags, "lỗi quyền chỉ hiện riêng");
  await command.execute(interaction(true));
  assert.ok(replies.at(-2).deferred.flags, "kết quả chỉ hiện riêng cho admin");
  assert.equal(replies.at(-1).embeds.length, 1);

  console.log(JSON.stringify({ ok: true, healthcheck: true }));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
