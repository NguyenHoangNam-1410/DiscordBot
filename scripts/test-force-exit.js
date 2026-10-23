"use strict";
const assert = require("node:assert/strict");
const { scheduleForcedExit } = require("../src/utils/forceExit");

(async () => {
  const logs = [];
  const exits = [];
  const logger = {
    warn: (data, message) => logs.push({ data, message }),
    flush: () => logs.push("flushed"),
  };
  const timer = scheduleForcedExit(logger, 0, {
    delayMs: 30,
    exit: (code) => exits.push(code),
    resources: () => ["TCPSocketWrap", "Timeout"],
  });
  assert.equal(typeof timer.hasRef, "function");
  assert.equal(
    timer.hasRef(),
    true,
    "không unref: phải giữ tiến trình đến lúc thoát cứng",
  );
  assert.deepEqual(exits, [], "chưa thoát ngay");
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(exits, [0]);
  assert.equal(
    logs[0].message,
    "event loop still active after shutdown; forcing exit",
  );
  assert.deepEqual(logs[0].data.resources, ["TCPSocketWrap", "Timeout"]);
  assert.equal(logs[1], "flushed");
  // Giữ mã thoát đã đặt trước đó (lỗi) thay vì ghi đè bằng 0
  process.exitCode = 1;
  scheduleForcedExit(logger, 0, {
    delayMs: 10,
    exit: (code) => exits.push(code),
    resources: () => [],
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(exits.at(-1), 1);
  process.exitCode = 0;

  // Tiến trình thật còn handle treo sẽ tự thoát cứng
  const { spawn } = require("node:child_process");
  const started = Date.now();
  const child = spawn(process.execPath, [
    "-e",
    `
    const { scheduleForcedExit } = require(${JSON.stringify(require.resolve("../src/utils/forceExit"))});
    setInterval(() => {}, 1000); // handle treo giữ vòng lặp sự kiện
    scheduleForcedExit({ warn() {}, flush() {} }, 0, { delayMs: 150 });
  `,
  ]);
  const code = await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(code, 0);
  assert.ok(Date.now() - started < 5000, "thoát cứng thay vì treo vô hạn");
  console.log(JSON.stringify({ ok: true, forceExit: true }));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
