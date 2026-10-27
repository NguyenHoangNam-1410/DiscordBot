"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const oracle = require("../src/services/oracleLogService");
const command = require("../src/commands/oracle");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oracle-log-"));
const file = path.join(directory, "oracle-arm.log");
process.env.ORACLE_ARM_LOG = file;
const NOW = Date.UTC(2026, 9, 27, 9, 0, 0);
const ts = (minutes) =>
  new Date(NOW - minutes * 60_000).toISOString().replace(/\.\d+Z$/, "Z");
const OCID =
  "ocid1.instance.oc1.ap-singapore-1.anrxxxxxxxxxxxxxxxxxxxxxxxabc123";

const running = [
  `${ts(30)} Bắt đầu: VM.Standard.A1.Flex 2 OCPU / 12 GB, AD: UASe:AP-SINGAPORE-1-AD-1`,
  `${ts(30)} Lần 1 · AD UASe:AP-SINGAPORE-1-AD-1`,
  `${ts(30)} Hết capacity, thử lại.`,
  `${ts(27)} Lần 2 · AD UASe:AP-SINGAPORE-1-AD-1`,
  `${ts(27)} Bị giới hạn tốc độ (429), nghỉ 300s.`,
  `${ts(4)} Lần 3 · AD UASe:AP-SINGAPORE-1-AD-1`,
  `${ts(4)} Hết capacity, thử lại.`,
].join("\n");
const success = `${running}
${ts(1)} Lần 4 · AD UASe:AP-SINGAPORE-1-AD-1
${ts(1)} TẠO THÀNH CÔNG:
${JSON.stringify({ data: { id: OCID, "display-name": "discord-bot-arm", shape: "VM.Standard.A1.Flex", "shape-config": { ocpus: 2, "memory-in-gbs": 12 }, region: "ap-singapore-1", "lifecycle-state": "PROVISIONING" } }, null, 2)}
`;
const failed = `${running}
${ts(1)} Lần 4 · AD x
${ts(1)} Lỗi không thể thử lại, dừng (kiểm tra OCID, quyền, hạn mức):
ServiceError:
{
    "code": "InvalidParameter",
    "message": "Invalid format for ssh public key",
    "status": 400
}
`;

(async () => {
  // Phân tích log đang chạy
  let entries = oracle.parseLog(running);
  assert.equal(entries.length, 7);
  let summary = oracle.summarize(entries, { now: NOW });
  assert.equal(summary.state, "running");
  assert.equal(summary.attempts, 3);
  assert.equal(summary.capacity, 2);
  assert.equal(summary.ratelimit, 1);
  // Quá lâu không có dòng mới → có thể đã dừng
  assert.equal(
    oracle.summarize(entries, { now: NOW + 60 * 60_000 }).state,
    "stale",
  );
  assert.equal(oracle.summarize([], { now: NOW }).state, "empty");

  // Thành công luôn là mục cuối cùng hiển thị, OCID bị che
  entries = oracle.parseLog(success);
  summary = oracle.summarize(entries, { now: NOW });
  assert.equal(summary.state, "success");
  const picked = oracle.recent(entries, 5);
  assert.equal(picked.at(-1).kind, "success");
  assert.ok(picked.at(-1).details.some((d) => /discord-bot-arm/.test(d)));
  const embed = command.checkEmbed({
    log: { truncated: false },
    entries,
    summary,
    limit: 5,
  });
  const json = JSON.stringify(embed.toJSON());
  assert.match(json, /ĐÃ TẠO ĐƯỢC VM/);
  assert.ok(!json.includes(OCID), "không để lộ OCID đầy đủ");
  assert.match(json, /ocid1…abc123/);
  const text = embed.toJSON().description;
  assert.ok(
    text.lastIndexOf("TẠO THÀNH CÔNG") > text.lastIndexOf("Hết capacity"),
  );
  assert.ok(text.length <= 4096);

  // Script dừng vì lỗi: hiện mã và thông điệp lỗi
  entries = oracle.parseLog(failed);
  summary = oracle.summarize(entries, { now: NOW });
  assert.equal(summary.state, "error");
  assert.match(
    command.checkEmbed({ log: {}, entries, summary, limit: 5 }).toJSON()
      .description,
    /InvalidParameter · Invalid format for ssh public key/,
  );

  // Đọc file: không có, rồi có
  assert.equal(oracle.readLog(), null);
  fs.writeFileSync(file, success);
  const read = oracle.readLog();
  assert.equal(read.truncated, false);

  // Lệnh: chỉ chủ bot (ADMIN_USER_ID), kể cả người có quyền Administrator cũng không được
  assert.equal(command.data.toJSON().name, "oracle");
  assert.equal(command.data.toJSON().options[0].name, "check");
  const replies = [];
  const interaction = (id, extra = {}) => ({
    user: { id },
    memberPermissions: { has: () => true },
    options: { getInteger: () => null },
    reply: async (p) => replies.push(p),
    deferReply: async (p) => replies.push({ deferred: p }),
    editReply: async (p) => replies.push(p),
    ...extra,
  });
  process.env.ADMIN_USER_ID = "111";
  await command.execute(interaction("222"));
  assert.match(replies.at(-1).content, /Chỉ chủ bot/);
  delete process.env.ADMIN_USER_ID;
  await command.execute(interaction("111"));
  assert.match(
    replies.at(-1).content,
    /Chỉ chủ bot/,
    "chưa đặt ADMIN_USER_ID thì từ chối",
  );
  process.env.ADMIN_USER_ID = "111";
  await command.execute(interaction("111"));
  assert.ok(replies.at(-2).deferred.flags, "kết quả chỉ hiện riêng");
  assert.equal(replies.at(-1).embeds.length, 1);
  fs.rmSync(file);
  await command.execute(interaction("111"));
  assert.match(replies.at(-1).content, /Chưa thấy file log/);

  fs.rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, oracleCheck: true }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
