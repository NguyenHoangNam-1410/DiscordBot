const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const testDb = path.resolve(__dirname, "../data/test-embed-link.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;
const {
  convertLink,
  embedHost,
  isAutoEnabled,
  setAutoEnabled,
  extractFacebookLinks,
  handleEmbedMessage,
} = require("../src/services/embedLinkService");
const { PermissionFlagsBits: Flags } = require("discord.js");
const embed = require("../src/commands/embed");

const ok = (input, url, kind, env = {}) => {
  const result = convertLink(input, env);
  assert.equal(result.ok, true, input);
  assert.equal(result.url, url, input);
  assert.equal(result.kind, kind, input);
};
const bad = (input, error, env = {}) =>
  assert.deepEqual(convertLink(input, env), { ok: false, error }, input);

// YouTube → watch?v=ID, bỏ tham số theo dõi, giữ mốc thời gian
const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
ok("https://youtu.be/dQw4w9WgXcQ?si=abc123", yt, "youtube");
ok("https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share", yt, "youtube");
ok("https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&pp=x", yt, "youtube");
ok("https://music.youtube.com/watch?v=dQw4w9WgXcQ", yt, "youtube");
ok("https://www.youtube.com/live/dQw4w9WgXcQ", yt, "youtube");
ok("https://youtu.be/dQw4w9WgXcQ?t=90", `${yt}&t=90s`, "youtube");
ok("https://youtu.be/dQw4w9WgXcQ?t=1m30s", `${yt}&t=90s`, "youtube");
ok("youtu.be/dQw4w9WgXcQ", yt, "youtube"); // thiếu https://
bad("https://www.youtube.com/", "NO_VIDEO");
bad("https://www.youtube.com/watch?v=short", "NO_VIDEO");
bad("https://www.youtube.com/@channel", "NO_VIDEO");

// Facebook → host embed, bỏ theo dõi, giữ tham số cần thiết
ok(
  "https://www.facebook.com/watch/?v=123456&fbclid=IwAR&mibextid=xyz",
  "https://facebed.com/watch/?v=123456",
  "facebook",
);
ok(
  "https://m.facebook.com/reel/987654321",
  "https://facebed.com/reel/987654321",
  "facebook",
);
ok("https://fb.watch/abcDEF/", "https://facebed.com/abcDEF/", "facebook");
ok(
  "https://web.facebook.com/share/v/AbCd1234/?mibextid=wwXIfr",
  "https://facebed.com/share/v/AbCd1234/",
  "facebook",
);
ok(
  "https://www.facebook.com/reel/1",
  "https://embed.example.org/reel/1",
  "facebook",
  { FACEBOOK_EMBED_HOST: "embed.example.org" },
);
bad("https://www.facebook.com/", "NO_VIDEO");

// Host embed tự cấu hình phải hợp lệ, nếu không dùng mặc định
assert.equal(embedHost({}), "facebed.com");
assert.equal(
  embedHost({ FACEBOOK_EMBED_HOST: "evil.com/path?x=1" }),
  "facebed.com",
);
assert.equal(embedHost({ FACEBOOK_EMBED_HOST: "a b" }), "facebed.com");
assert.equal(
  embedHost({ FACEBOOK_EMBED_HOST: "Embed.Example.ORG" }),
  "embed.example.org",
);

// Từ chối host lạ, giao thức lạ, thông tin đăng nhập, link giả host
bad("https://example.com/video", "UNSUPPORTED_HOST");
bad("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", "UNSUPPORTED_HOST");
bad("https://facebook.com.evil.io/reel/1", "UNSUPPORTED_HOST");
bad("javascript:alert(1)", "INVALID_URL");
bad("ftp://youtu.be/dQw4w9WgXcQ", "INVALID_URL");
bad("https://user:pass@youtu.be/dQw4w9WgXcQ", "INVALID_URL");
bad("", "INVALID_URL");
bad("a".repeat(2500), "INVALID_URL");

// Lệnh: trả link công khai (không ping), lỗi thì ẩn
(async () => {
  assert.equal(embed.data.toJSON().name, "embed");
  const run = async (link) => {
    const out = [];
    await embed.execute({
      options: { getSubcommand: () => "chuyendoi", getString: () => link },
      reply: async (payload) => out.push(payload),
    });
    return out[0];
  };
  const good = await run("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(good.content, yt);
  assert.deepEqual(good.allowedMentions, { parse: [] });
  assert.equal(good.flags, undefined);
  const rejected = await run("https://example.com");
  assert.match(rejected.content, /YouTube và Facebook/);
  assert.ok(rejected.flags);
  // ---- Tự nhận diện ----
  assert.deepEqual(
    extractFacebookLinks(
      "xem nè https://www.facebook.com/reel/111?mibextid=1, và (https://fb.watch/abc/) nữa https://youtu.be/dQw4w9WgXcQ <https://www.facebook.com/reel/222> https://www.facebook.com/reel/111",
    ),
    ["https://facebed.com/reel/111", "https://facebed.com/abc/"],
  );
  assert.deepEqual(extractFacebookLinks("không có link"), []);
  assert.deepEqual(extractFacebookLinks("https://youtu.be/dQw4w9WgXcQ"), []);
  assert.equal(
    extractFacebookLinks(
      [1, 2, 3, 4, 5]
        .map((n) => `https://www.facebook.com/reel/${n}`)
        .join(" "),
    ).length,
    3,
  );

  const permsFor = (granted) => ({
    has: (needed) => [].concat(needed).every((f) => granted.includes(f)),
  });
  const all = [
    Flags.ViewChannel,
    Flags.SendMessages,
    Flags.ReadMessageHistory,
    Flags.EmbedLinks,
  ];
  const fakeMessage = (
    content,
    { granted = all, thread = false, bot = false, guildId = "gA" } = {},
  ) => {
    const replies = [];
    return {
      replies,
      content,
      guildId,
      author: { bot },
      guild: { members: { me: {} } },
      channel: {
        isThread: () => thread,
        permissionsFor: () => permsFor(granted),
      },
      reply: async (payload) => replies.push(payload),
    };
  };
  const link = "https://www.facebook.com/reel/42?fbclid=x";
  let m = fakeMessage(`hay ${link}`);
  assert.equal(await handleEmbedMessage(m), true);
  assert.equal(m.replies[0].content, "https://facebed.com/reel/42");
  assert.deepEqual(m.replies[0].allowedMentions, {
    parse: [],
    repliedUser: false,
  });
  // Không có quyền gửi/nhúng/đọc lịch sử → im lặng
  for (const missing of [
    Flags.SendMessages,
    Flags.EmbedLinks,
    Flags.ReadMessageHistory,
    Flags.ViewChannel,
  ]) {
    m = fakeMessage(link, { granted: all.filter((f) => f !== missing) });
    assert.equal(await handleEmbedMessage(m), false);
    assert.equal(m.replies.length, 0);
  }
  // Thread cần SendMessagesInThreads
  m = fakeMessage(link, { thread: true });
  assert.equal(await handleEmbedMessage(m), false);
  m = fakeMessage(link, {
    thread: true,
    granted: [...all, Flags.SendMessagesInThreads],
  });
  assert.equal(await handleEmbedMessage(m), true);
  // Bot, tin không có link Facebook, DM: bỏ qua
  assert.equal(
    await handleEmbedMessage(fakeMessage(link, { bot: true })),
    false,
  );
  assert.equal(
    await handleEmbedMessage(fakeMessage("https://youtu.be/dQw4w9WgXcQ")),
    false,
  );
  assert.equal(
    await handleEmbedMessage(fakeMessage(link, { guildId: null })),
    false,
  );
  // Bật/tắt theo server
  assert.equal(isAutoEnabled("gA"), true, "mặc định bật");
  setAutoEnabled("gA", false, "admin");
  assert.equal(isAutoEnabled("gA"), false);
  m = fakeMessage(link);
  assert.equal(await handleEmbedMessage(m), false);
  assert.equal(isAutoEnabled("gB"), true, "server khác không bị ảnh hưởng");
  setAutoEnabled("gA", true, "admin");
  assert.equal(await handleEmbedMessage(fakeMessage(link)), true);

  // /embed tudong: chỉ admin
  const toggle = async (isAdminUser, value) => {
    const out = [];
    const vua = require("../src/commands/vuatiengviet");
    const original = vua.isAdmin;
    vua.isAdmin = () => isAdminUser;
    try {
      await embed.execute({
        guildId: "gC",
        user: { id: "u" },
        options: { getSubcommand: () => "tudong", getString: () => value },
        reply: async (payload) => out.push(payload),
      });
    } finally {
      vua.isAdmin = original;
    }
    return out[0];
  };
  assert.match((await toggle(false, "off")).content, /Chỉ admin/);
  assert.equal(isAutoEnabled("gC"), true);
  assert.match((await toggle(true, "off")).content, /Đã tắt/);
  assert.equal(isAutoEnabled("gC"), false);
  assert.match((await toggle(true, "on")).content, /Đã bật/);
  assert.equal(isAutoEnabled("gC"), true);
  console.log("embed link tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
