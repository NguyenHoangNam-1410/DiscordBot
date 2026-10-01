const fs = require("node:fs");
const path = require("node:path");

const logDir = path.resolve(process.env.LOG_DIR || "./logs");
const eventsPath = path.join(logDir, "events.jsonl");
const statusPath = path.join(logDir, "status.json");
fs.mkdirSync(logDir, { recursive: true });
const runtimeStatus = {
  startedAt: new Date().toISOString(),
  runtimeErrors: 0,
  lastRuntimeErrorAt: null,
};

function writeEvent(event, data = {}) {
  const record = { at: new Date().toISOString(), event, ...data };
  fs.appendFileSync(eventsPath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}
function saveStatus(status) {
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf8");
  return status;
}
function loadStatus() {
  try {
    return JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch {
    return null;
  }
}
function recordSyncStart() {
  return writeEvent("sync_started");
}
function recordSyncResult(result) {
  const status = saveStatus({
    syncedAt: new Date().toISOString(),
    report: result.report,
    totals: result.totals,
  });
  writeEvent("sync_finished", {
    failed: result.report.filter((x) => !x.ok).length,
    totals: result.totals,
  });
  return status;
}
function recordSyncError(error) {
  writeEvent("sync_failed", {
    error: error?.stack || error?.message || String(error),
  });
}
function recordRuntimeError(error, context = {}) {
  runtimeStatus.runtimeErrors += 1;
  runtimeStatus.lastRuntimeErrorAt = new Date().toISOString();
  return writeEvent("runtime_error", {
    error: error?.stack || error?.message || String(error),
    ...context,
  });
}
function getStatus() {
  return { status: loadStatus(), logFile: eventsPath };
}
function getRuntimeStatus() {
  return { ...runtimeStatus, uptimeSeconds: Math.floor(process.uptime()) };
}
module.exports = {
  writeEvent,
  recordSyncStart,
  recordSyncResult,
  recordSyncError,
  recordRuntimeError,
  getStatus,
  getRuntimeStatus,
};
