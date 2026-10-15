const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const testDb = path.resolve(__dirname, "../data/test-chatbot.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;
delete process.env.OPENAI_API_KEY;
delete process.env.CHATBOT_DAILY_LIMIT;

const chatbot = require("../src/services/chatbotService");

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

  // lệnh /chatbot
  chatbot.setChannel(G, C, "admin");
  const replies = [], edits = [];
  const slash = (sub, opts = {}, over = {}) => ({
    guildId: G, channelId: C, user: { id: opts.user || "slash" }, memberPermissions: { has: () => opts.admin !== false },
    options: {
      getSubcommand: () => sub,
      getString: () => opts.text ?? "chào",
      getInteger: () => opts.n,
      getChannel: () => ({ id: opts.channel || "newch" }),
    },
    reply: async (p) => replies.push(p.content),
    deferReply: async () => { replies.push("<defer>"); },
    editReply: async (p) => edits.push(p),
    ...over,
  });
  const cmd = command;
  // hỏi: sai kênh / chưa mở kênh
  await cmd.execute(slash("hoi", {}, { channelId: "other" }));
  assert.match(replies.at(-1), /trong kênh <#c>/);
  // hỏi đúng kênh
  await cmd.execute(slash("hoi"));
  assert.equal(replies.at(-1), "<defer>");
  assert.match(edits[0].content, /Xin chào!/);
  assert.match(edits[0].content, /Còn 19\/20 lượt/);
  assert.deepEqual(edits[0].allowedMentions.parse, [], "không ping ai");
  assert(edits[0].content.length <= 2000);
  // lỗi nhà cung cấp: log chẩn đoán, báo lỗi chung, không mất lượt
  const warn = console.warn;
  const logs = [];
  console.warn = (line) => logs.push(JSON.parse(line));
  global.fetch = async () => ({ ok: false, status: 403, text: async () => "API key not valid", json: async () => ({}) });
  const diagBefore = chatbot.usage(G, "diag").used;
  await cmd.execute(slash("hoi", { user: "diag" }));
  console.warn = warn;
  assert.equal(logs[0].status, 403);
  assert.match(logs[0].body, /API key not valid/);
  assert.match(edits.at(-1).content, /Lượt của bạn chưa bị trừ/);
  assert.equal(chatbot.usage(G, "diag").used, diagBefore);
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) });
  // xem lượt
  await cmd.execute(slash("luot"));
  assert.match(replies.at(-1), /lượt/);

  // giới hạn tùy chỉnh theo server
  await cmd.execute(slash("gioihan", { n: 3, admin: false }));
  assert.match(replies.at(-1), /Chỉ admin/);
  assert.equal(chatbot.dailyLimit(G), 20);
  await cmd.execute(slash("gioihan", { n: 3 }));
  assert.match(replies.at(-1), /3 lượt/);
  assert.equal(chatbot.dailyLimit(G), 3);
  assert.equal(chatbot.dailyLimit("otherguild"), 20, "giới hạn theo từng server");
  for (let i = 0; i < 3; i += 1) await cmd.execute(slash("hoi", { user: "lim" }));
  assert.match(edits.at(-1).content, /Còn 0\/3/);
  await cmd.execute(slash("hoi", { user: "lim" }));
  assert.match(replies.at(-1), /hết \*\*3 lượt\*\*/, "hết lượt: báo riêng tư, không gọi API");
  assert.throws(() => chatbot.setDailyLimit(G, 0, "a"), /INVALID_LIMIT/);
  assert.throws(() => chatbot.setDailyLimit(G, 501, "a"), /INVALID_LIMIT/);
  await cmd.execute(slash("gioihan", { n: 5 }));
  await cmd.execute(slash("hoi", { user: "lim" }));
  assert.match(edits.at(-1).content, /Còn 1\/5/, "nâng giới hạn có hiệu lực ngay");
  chatbot.setDailyLimit(G, 20, "admin");

  // kênh / tắt
  await cmd.execute(slash("kenh", { admin: false }));
  assert.match(replies.at(-1), /Chỉ admin/);
  await cmd.execute(slash("kenh"));
  assert.equal(chatbot.getChannelId(G), "newch");
  await cmd.execute(slash("hoi"));
  assert.match(replies.at(-1), /trong kênh <#newch>/);
  await cmd.execute(slash("tat"));
  assert.equal(chatbot.getChannelId(G), null);
  await cmd.execute(slash("hoi"));
  assert.match(replies.at(-1), /chưa mở kênh chatbot/);

  // 429: chuyển model dự phòng; hết danh sách thì thử lại một lần; lỗi khác (403) không thử lại
  process.env.CHATBOT_RETRY_DELAY_MS = "5";
  process.env.OPENAI_MODEL = "a:free, b:free";
  const tried = [];
  let limitedUntil = 0;
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith("/moderations")) return { ok: true, json: async () => ({ results: [{ flagged: false }] }) };
    tried.push(body.model);
    if (tried.length <= limitedUntil) return { ok: false, status: 429, text: async () => "rate limited", json: async () => ({}) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: `ok ${body.model}` } }] }) };
  };
  limitedUntil = 1; // model đầu bị giới hạn -> dùng dự phòng
  const fb = await chatbot.ask({ guildId: G, userId: "fb1", channelId: C, text: "chào" });
  assert(fb.ok && /ok b:free/.test(fb.text), "dùng model dự phòng khi model chính bị 429");
  tried.length = 0;
  limitedUntil = 2; // cả hai bị giới hạn -> thử lại vòng hai thành công
  const retry = await chatbot.ask({ guildId: G, userId: "fb2", channelId: C, text: "chào" });
  assert(retry.ok);
  assert.deepEqual(tried.slice(-3), ["a:free", "b:free", "a:free"]);
  tried.length = 0;
  limitedUntil = 99; // luôn bị giới hạn -> lỗi, hoàn lượt
  const hard = await chatbot.ask({ guildId: G, userId: "fb3", channelId: C, text: "chào" });
  assert.equal(hard.error, "API");
  assert.equal(hard.status, 429);
  assert.equal(chatbot.usage(G, "fb3").used, 0);
  delete process.env.OPENAI_MODEL;
  delete process.env.CHATBOT_RETRY_DELAY_MS;

  // Gemini: endpoint và model riêng, bỏ qua bước kiểm duyệt của OpenAI
  global.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    return { ok: true, json: async () => ({ choices: [{ message: { content: "Xin chào!" } }] }) };
  };
  process.env.CHATBOT_PROVIDER = "gemini";
  calls.length = 0;
  assert((await chatbot.ask({ guildId: G, userId: "gem", channelId: C, text: "chào" })).ok);
  assert.equal(calls.length, 1, "Gemini không gọi moderations");
  assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions$/);
  assert.match(calls[0].body.model, /^gemini/);
  process.env.OPENAI_MODEL = "gemini-custom";
  assert.equal(chatbot.model(), "gemini-custom");
  delete process.env.OPENAI_MODEL;
  // OpenRouter: cần chọn model; đúng endpoint, không kiểm duyệt OpenAI
  process.env.CHATBOT_PROVIDER = "openrouter";
  assert.equal(chatbot.isConfigured(), false, "OpenRouter chưa đặt OPENAI_MODEL thì chưa sẵn sàng");
  process.env.OPENAI_MODEL = "some/model:free";
  assert.equal(chatbot.isConfigured(), true);
  calls.length = 0;
  assert((await chatbot.ask({ guildId: G, userId: "orr", channelId: C, text: "chào" })).ok);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[0].body.model, "some/model:free");
  delete process.env.OPENAI_MODEL;
  delete process.env.CHATBOT_PROVIDER;
  // tiền tố: !chatbot hoi ... và bí danh !hoi ...
  chatbot.setChannel(G, C, "admin");
  global.fetch = async (url, init) => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: `echo:${JSON.parse(init.body).messages.at(-1).content}` } }] }),
  });
  const { handleSlashPrefix } = require("../src/services/slashPrefixService");
  const out = [];
  const pmsg = (content) => ({
    id: "p1", guildId: G, channelId: C, content, author: { id: "pfx", bot: false },
    member: { permissions: { has: () => false } }, guild: {}, client: {}, channel: { sendTyping: async () => {} },
    reply: async (p) => { out.push(p.content); return { edit: async (q) => out.push(q.content) }; },
  });
  assert.equal(await handleSlashPrefix(pmsg("!chatbot hoi Lorem ipsum dolor")), true);
  assert.match(out.at(-1), /^<@pfx> echo:Lorem ipsum dolor/);
  assert.equal(await handleSlashPrefix(pmsg("!hoi Xin chào bạn")), true);
  assert.match(out.at(-1), /^<@pfx> echo:Xin chào bạn/);
  assert.equal(await handleSlashPrefix(pmsg("!HOI abc")), true);
  assert.match(out.at(-1), /^<@pfx> echo:abc/);
  const count = out.length;
  assert.equal(await handleSlashPrefix(pmsg("!hoivui")), false, "không bắt nhầm lệnh khác bắt đầu bằng hoi");
  assert.equal(out.length, count);
  // tương tác: ping người được nhắc tới, mention người hỏi, tuyệt đối không ping vai trò / everyone / here, react emoji
  {
    const prep = chatbot.prepareQuestion("chào <@111111> và <@!222222> <@111111> <@&999999> @everyone @here <@333333> <@444444> <@555555>", { askerId: "555555", botId: "444444" });
    assert.deepEqual(prep.pinged, ["111111", "222222", "333333"], "tối đa 3 người, không trùng, bỏ người hỏi và bot");
    assert(!/<@&|@everyone|@here|<@!/.test(prep.text.replace(/\[vai trò\]/g, "")), "câu hỏi gửi AI không còn ping vai trò/everyone");
    const safe = chatbot.sanitizeReply("hi <@111111> <@&999999> @everyone @here <@777777> <@!222222>", ["111111", "222222"]);
    assert.equal(safe, "hi <@111111> [vai trò] everyone here [người dùng] <@222222>");

    const reactions = [], removed = [], payloads = [];
    chatbot.setChannel(G, C, "admin");
    let answer = "Chào <@111111>, <@&999999> @everyone đây!";
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: answer } }] }) });
    const source = {
      client: { user: { id: "botid" } },
      react: async (e) => reactions.push(e),
      reactions: { cache: new Map([["🤔", { users: { remove: async (id) => removed.push(id) } }]]) },
    };
    const inter = (user, text, over = {}) => ({
      guildId: G, channelId: C, user: { id: user }, client: { user: { id: "botid" } }, sourceMessage: source,
      memberPermissions: { has: () => false },
      options: { getSubcommand: () => "hoi", getString: () => text },
      reply: async (p) => payloads.push(p), deferReply: async () => {}, editReply: async (p) => payloads.push(p), ...over,
    });
    await command.execute(inter("asker1", "nói xin chào <@111111> nhé <@&999999> @everyone"));
    const out = payloads.at(-1);
    assert(out.content.startsWith("<@asker1> "), "mention người hỏi");
    assert(out.content.includes("<@111111>"), "gọi lại người được nhắc");
    assert(!/<@&|@everyone|@here/.test(out.content), "không có ping vai trò/everyone/here");
    assert.deepEqual(out.allowedMentions, { parse: [], users: ["asker1", "111111"], roles: [] });
    assert.deepEqual(reactions, ["🤔", "✅"]);
    assert.deepEqual(removed, ["botid"], "bỏ 🤔 sau khi trả lời xong");
    assert(out.content.length <= 2000);
    // lỗi: react ❌
    reactions.length = 0;
    global.fetch = async () => ({ ok: false, status: 500, text: async () => "", json: async () => ({}) });
    process.env.CHATBOT_RETRY_DELAY_MS = "1";
    const warn = console.warn; console.warn = () => {};
    await command.execute(inter("asker2", "hi"));
    console.warn = warn;
    assert.deepEqual(reactions, ["🤔", "❌"]);
    // hết lượt: react ⛔, trả lời riêng tư
    reactions.length = 0;
    chatbot.setDailyLimit(G, 1, "admin");
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) });
    await command.execute(inter("asker3", "hi"));
    await command.execute(inter("asker3", "hi"));
    assert.deepEqual(reactions.slice(-1), ["⛔"]);
    chatbot.setDailyLimit(G, 20, "admin");
    // slash thật (không có tin nhắn gốc): không react, vẫn mention
    const before = reactions.length;
    await command.execute(inter("asker4", "hi", { sourceMessage: undefined }));
    assert.equal(reactions.length, before);
    assert(payloads.at(-1).content.startsWith("<@asker4> "));
  }
  console.log("chatbot ok");
})();
