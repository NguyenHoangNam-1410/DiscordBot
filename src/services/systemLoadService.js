"use strict";
// Tải hệ thống của máy chủ chạy bot: CPU, RAM, ổ đĩa, tiến trình bot, độ trễ vòng lặp sự kiện và kết nối Discord.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { monitorEventLoopDelay } = require("node:perf_hooks");

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
let lastCpu = { at: Date.now(), usage: process.cpuUsage() };

const THRESHOLDS = Object.freeze({
  loadPerCore: { warn: 0.8, bad: 1.5 },
  memoryPercent: { warn: 85, bad: 95 },
  diskPercent: { warn: 85, bad: 95 },
  loopP99Ms: { warn: 200, bad: 1000 },
  pingMs: { warn: 400, bad: 1500 },
});

function level(value, limits) {
  return value >= limits.bad ? 2 : value >= limits.warn ? 1 : 0;
}

async function diskUsage(target) {
  try {
    const stat = await fs.promises.statfs(target);
    const total = stat.blocks * stat.bsize;
    const free = stat.bavail * stat.bsize;
    return {
      total,
      free,
      used: total - free,
      percent: total ? ((total - free) / total) * 100 : 0,
    };
  } catch {
    return null;
  }
}

async function directoryBytes(directory) {
  let total = 0;
  try {
    for (const entry of await fs.promises.readdir(directory, {
      withFileTypes: true,
    }))
      if (entry.isFile())
        total += (await fs.promises.stat(path.join(directory, entry.name)))
          .size;
  } catch {}
  return total;
}

// % của một lõi (100 = một lõi đầy). Tính theo khoảng từ lần đo trước; nếu quá gần nhau thì dùng trung bình từ lúc khởi động.
function processCpuPercent(now = Date.now()) {
  const usage = process.cpuUsage();
  const total = (u) => (u.user + u.system) / 1000;
  const elapsedMs = now - lastCpu.at;
  let percent;
  if (elapsedMs >= 2000)
    percent = ((total(usage) - total(lastCpu.usage)) / elapsedMs) * 100;
  else percent = (total(usage) / Math.max(1, process.uptime() * 1000)) * 100;
  if (elapsedMs >= 2000) lastCpu = { at: now, usage };
  return Math.max(0, percent);
}

async function collect({
  client = null,
  dbPath = null,
  backupDir = null,
  now = Date.now(),
} = {}) {
  const cores = os.cpus().length || 1;
  const [load1, load5, load15] = os.loadavg();
  const total = os.totalmem();
  const free = os.freemem();
  const memory = process.memoryUsage();
  const loop = {
    meanMs: Number.isFinite(loopDelay.mean) ? loopDelay.mean / 1e6 : 0,
    p99Ms: loopDelay.percentile(99) / 1e6,
    maxMs: loopDelay.max / 1e6,
  };
  loopDelay.reset();
  const data = {
    cores,
    load: { one: load1, five: load5, fifteen: load15, perCore: load1 / cores },
    memory: {
      total,
      free,
      used: total - free,
      percent: ((total - free) / total) * 100,
    },
    process: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      cpuPercent: processCpuPercent(now),
      uptimeSeconds: Math.floor(process.uptime()),
      pid: process.pid,
    },
    loop,
    disk: await diskUsage(dbPath ? path.dirname(dbPath) : process.cwd()),
    backupBytes: backupDir ? await directoryBytes(backupDir) : 0,
    discord: client
      ? {
          ping: Number.isFinite(client.ws?.ping) ? client.ws.ping : null,
          guilds: client.guilds?.cache?.size ?? null,
          ready: typeof client.isReady === "function" ? client.isReady() : null,
        }
      : null,
  };
  return { ...data, ...assess(data) };
}

// Đánh giá tổng thể: 0 ổn, 1 cần chú ý, 2 nghiêm trọng, kèm danh sách cảnh báo.
function assess(data) {
  const warnings = [];
  let worst = 0;
  const check = (value, limits, message) => {
    if (value == null || !Number.isFinite(value)) return;
    const result = level(value, limits);
    if (result) warnings.push({ level: result, message });
    worst = Math.max(worst, result);
  };
  check(
    data.load.perCore,
    THRESHOLDS.loadPerCore,
    `Tải CPU cao: ${data.load.one.toFixed(2)} trên ${data.cores} lõi`,
  );
  check(
    data.memory.percent,
    THRESHOLDS.memoryPercent,
    `RAM đã dùng ${data.memory.percent.toFixed(0)}%`,
  );
  check(
    data.disk?.percent,
    THRESHOLDS.diskPercent,
    `Ổ đĩa đã dùng ${data.disk?.percent?.toFixed(0)}%`,
  );
  check(
    data.loop.p99Ms,
    THRESHOLDS.loopP99Ms,
    `Bot bị trễ (p99 ${data.loop.p99Ms.toFixed(0)} ms)`,
  );
  check(
    data.discord?.ping,
    THRESHOLDS.pingMs,
    `Độ trễ Discord ${data.discord?.ping} ms`,
  );
  if (data.discord && data.discord.ready === false)
    (warnings.push({ level: 2, message: "Bot chưa kết nối Discord" }),
      (worst = 2));
  return { status: worst, warnings };
}

module.exports = { collect, assess, THRESHOLDS };
