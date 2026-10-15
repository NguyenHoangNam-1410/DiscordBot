const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const testDb = path.resolve(__dirname, "../data/test-chatbot.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;
delete process.env.OPENAI_API_KEY;
delete process.env.CHATBOT_DAILY_LIMIT;

const chatbot = require("../src/services/chatbotService");
const { handleChatbotMessage } = require("../src/services/chatbotMessageService");
const command = require("../src/commands/chatbot");

const calls = [];
let failChat = false, flagIt = false;
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body, auth: init.headers.authorization });
  if (url.endsWith("/moderations")) return { ok: true, json: async () => ({ results: [{ flagged: flagIt }] }) };
  if (failChat) return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, json: async () => ({ choices: [{ message: { content: "Xin chào!" } }] }) };
};

(async () => {
  const G = "g", C = "c", U = "u";
  // chưa có khóa: báo chưa cấu hình, không gọi API, không trừ lượt
  assert.equal((await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "hi" })).error, "DISABLED");
  assert.equal(calls.length, 0);
  process.env.OPENAI_API_KEY = "sk-test";

  const ok = await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "chào bạn" });
  assert(ok.ok);
  assert.equal(ok.remaining, 19);
  assert.equal(ok.limit, 20, "mặc định 20 lượt/ngày");
  const chat = calls.find((c) => c.url.endsWith("/chat/completions"));
  assert.equal(chat.body.model, "gpt-4o-mini");
  assert.equal(chat.auth, "Bearer sk-test");
  assert(chat.body.max_tokens <= 400);
  assert.equal(chat.body.messages[0].role, "system");
  // trí nhớ hội thoại
  await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "tiếp tục" });
  const second = calls.filter((c) => c.url.endsWith("/chat/completions")).at(-1).body.messages;
  assert.equal(second.length, 4, "system + 2 lượt cũ + tin mới");

  // quá dài: không trừ lượt, không gọi API
  const before = calls.length;
  assert.equal((await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "x".repeat(501) })).error, "TOO_LONG");
  assert.equal(calls.length, before);

  // lỗi API: hoàn lượt
  const used = chatbot.usage(G, U).used;
  failChat = true;
  assert.equal((await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "lỗi" })).error, "API");
  assert.equal(chatbot.usage(G, U).used, used, "lỗi API không mất lượt");
  failChat = false;

  // bị kiểm duyệt: hoàn lượt
  flagIt = true;
  assert.equal((await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "xấu" })).error, "FLAGGED");
  assert.equal(chatbot.usage(G, U).used, used);
  flagIt = false;

  // hết 20 lượt
  while (chatbot.usage(G, U).remaining > 0) assert((await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "a" })).ok);
  const limited = await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "nữa" });
  assert.equal(limited.error, "LIMIT");
  assert.equal(chatbot.usage(G, U).used, 20);
  // người khác vẫn còn lượt; ngày hôm sau reset
  assert((await chatbot.ask({ guildId: G, userId: "other", channelId: C, text: "hi" })).ok);
  assert((await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "hi", now: Date.now() + 24 * 3600_000 })).ok);

  // handler tin nhắn
  const sent = [];
  const msg = (over = {}) => ({
    guildId: G, channelId: C, content: "chào", author: { id: "m1", bot: false },
    channel: { sendTyping: async () => {} }, reply: async (p) => sent.push(p), ...over,
  });
  assert.equal(await handleChatbotMessage(msg()), false, "kênh chưa đăng ký: bỏ qua");
  chatbot.setChannel(G, C, "admin");
  assert.equal(await handleChatbotMessage(msg({ channelId: "other" })), false);
  assert.equal(await handleChatbotMessage(msg({ author: { id: "b", bot: true } })), false);
  assert.equal(await handleChatbotMessage(msg({ content: "/xu" })), false);
  assert.equal(await handleChatbotMessage(msg()), true);
  assert.match(sent[0].content, /Xin chào!/);
  assert.match(sent[0].content, /Còn 19\/20 lượt/);
  assert.deepEqual(sent[0].allowedMentions.parse, [], "không ping ai");
  assert(sent[0].content.length <= 2000);

  // lệnh /chatbot
  const reply = [];
  const interaction = (sub, extra = {}) => ({
    guildId: G, user: { id: "admin" }, memberPermissions: { has: () => true },
    options: { getSubcommand: () => sub, getChannel: () => ({ id: "newch" }) },
    reply: async (p) => reply.push(p.content), ...extra,
  });
  await command.execute(interaction("luot"));
  assert.match(reply.at(-1), /lượt/);
  await command.execute(interaction("kenh", { user: { id: "plain" }, memberPermissions: { has: () => false } }));
  assert.match(reply.at(-1), /Chỉ admin/);
  await command.execute(interaction("kenh"));
  assert.equal(chatbot.getChannelId(G), "newch");
  await command.execute(interaction("tat"));
  assert.equal(chatbot.getChannelId(G), null);
  console.log("chatbot ok");
})();
