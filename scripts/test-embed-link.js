const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const testDb = path.resolve(__dirname, "../data/test-embed-link.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;
global.fetch = async () => {
  throw new Error("offline");
};
const {
  convertLink,
  embedHost,
  isAutoEnabled,
  setAutoEnabled,
  extractFacebookLinks,
  handleEmbedMessage,
  parseVideoUrl,
  resolveVideoUrl,
  videoMessage,
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
      deferReply: async () => out.push({ deferred: true }),
      editReply: async (payload) => out.push(payload),
    });
    return out.at(-1);
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
  // ---- Chỉ lấy video ----
  const page = (...metas) =>
    `<html><head><title>x</title>${metas.map(([k, v]) => `<meta property="${k}" content="${v}">`).join("")}</head></html>`;
  const base = "https://facebed.com/reel/42";
  assert.equal(
    parseVideoUrl(
      page(["og:video", "https://v.example.com/a.mp4?x=1&amp;y=2"]),
      base,
    ),
    "https://v.example.com/a.mp4?x=1&y=2",
  );
  assert.equal(
    parseVideoUrl(
      page(
        ["og:video", "https://v.example.com/plain.mp4"],
        ["og:video:secure_url", "https://v.example.com/secure.mp4"],
      ),
      base,
    ),
    "https://v.example.com/secure.mp4",
    "ưu tiên secure_url",
  );
  assert.equal(
    parseVideoUrl(page(["og:video", "/media/42.mp4"]), base),
    "https://facebed.com/media/42.mp4",
  );
  assert.equal(
    parseVideoUrl(
      page(["og:video", "http://insecure.example.com/a.mp4"]),
      base,
    ),
    null,
    "chỉ https",
  );
  assert.equal(
    parseVideoUrl(page(["og:video", "javascript:alert(1)"]), base),
    null,
  );
  assert.equal(
    parseVideoUrl(page(["og:image", "https://i.example.com/a.jpg"]), base),
    null,
    "ảnh không phải video",
  );
  assert.equal(
    parseVideoUrl(
      `<meta name='twitter:player:stream' content='https://v.example.com/t.mp4'>`,
      base,
    ),
    "https://v.example.com/t.mp4",
  );
  assert.equal(parseVideoUrl("<html>không có meta</html>", base), null);

  const asResponse = (status, body, headers = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  });
  const calls = [];
  const fetchWith = (handler) => {
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      return handler(url);
    };
  };
  fetchWith(() =>
    asResponse(200, page(["og:video", "https://v.example.com/a.mp4"])),
  );
  assert.equal(await resolveVideoUrl(base), "https://v.example.com/a.mp4");
  assert.match(calls.at(-1).init.headers["user-agent"], /Discordbot/);
  assert.equal(calls.at(-1).init.redirect, "manual");
  assert(calls.at(-1).init.signal instanceof AbortSignal);
  // Chỉ gọi tới host embed đã cấu hình
  calls.length = 0;
  assert.equal(await resolveVideoUrl("https://evil.example.com/reel/1"), null);
  assert.equal(await resolveVideoUrl("http://facebed.com/reel/1"), null);
  assert.equal(calls.length, 0, "không gọi mạng với host lạ");
  // Chuyển hướng cùng host được theo, sang host khác thì bỏ
  fetchWith((url) =>
    url.endsWith("/reel/42")
      ? asResponse(302, "", { location: "/reel/42/canonical" })
      : asResponse(200, page(["og:video", "https://v.example.com/c.mp4"])),
  );
  assert.equal(await resolveVideoUrl(base), "https://v.example.com/c.mp4");
  fetchWith(() =>
    asResponse(302, "", { location: "https://evil.example.com/x" }),
  );
  assert.equal(await resolveVideoUrl(base), null);
  fetchWith(() => asResponse(302, "", { location: "/loop" }));
  assert.equal(
    await resolveVideoUrl(base),
    null,
    "chuyển hướng vòng dừng sau vài lần",
  );
  // Lỗi mạng, 404, trang không có video → null
  fetchWith(() => asResponse(404, "nope"));
  assert.equal(await resolveVideoUrl(base), null);
  fetchWith(() =>
    asResponse(200, page(["og:image", "https://i.example.com/a.jpg"])),
  );
  assert.equal(await resolveVideoUrl(base), null);
  global.fetch = async () => {
    throw new Error("offline");
  };
  assert.equal(await resolveVideoUrl(base), null);

  // Tin nhắn tự động: chỉ gửi link video; không có video thì giữ link embed
  fetchWith(() =>
    asResponse(200, page(["og:video", "https://v.example.com/auto.mp4"])),
  );
  let vm = fakeMessage(`xem ${link}`);
  assert.equal(await handleEmbedMessage(vm), true);
  assert.equal(vm.replies[0].content, "[🎬](https://v.example.com/auto.mp4)");
  assert(!vm.replies[0].content.includes("facebed.com"), "không kèm thẻ embed");
  fetchWith(() =>
    asResponse(200, page(["og:image", "https://i.example.com/a.jpg"])),
  );
  vm = fakeMessage(`xem ${link}`);
  assert.equal(await handleEmbedMessage(vm), true);
  assert.equal(vm.replies[0].content, "https://facebed.com/reel/42");
  // Lệnh /embed chuyendoi cho Facebook cũng trả link video
  fetchWith(() =>
    asResponse(200, page(["og:video", "https://v.example.com/cmd.mp4"])),
  );
  assert.equal(
    (await run("https://www.facebook.com/reel/42")).content,
    "[🎬](https://v.example.com/cmd.mp4)",
  );
  fetchWith(() => asResponse(404, ""));
  assert.equal(
    (await run("https://www.facebook.com/reel/42")).content,
    "https://facebed.com/reel/42",
  );
  // Link dài: gói ẩn, thoát ngoặc đơn, quá giới hạn thì dùng link ngắn
  const longVideo =
    "https://video.fna.fbcdn.net/o1/v/t2/f2/m366/AQPw?" +
    "a=1&b=2&".repeat(150) +
    "x=(1)";
  const hidden = videoMessage(longVideo);
  assert.ok(
    hidden.startsWith("[🎬](https://video.fna.fbcdn.net/") &&
      hidden.endsWith(")"),
  );
  assert.ok(hidden.length <= 2000);
  assert.ok(hidden.includes("x=%281%29") && !hidden.includes("x=(1)"));
  assert.equal(videoMessage("https://v.example.com/" + "a".repeat(2100)), null);
  fetchWith(() =>
    asResponse(
      200,
      page(["og:video", "https://v.example.com/" + "a".repeat(2100)]),
    ),
  );
  assert.equal(
    (await run("https://www.facebook.com/reel/42")).content,
    "https://facebed.com/reel/42",
    "link video quá dài: dùng link embed ngắn",
  );
  console.log("embed link tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
