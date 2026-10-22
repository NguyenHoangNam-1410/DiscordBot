const assert = require("node:assert/strict");
const { convertLink, embedHost } = require("../src/services/embedLinkService");
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
      options: { getString: () => link },
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
  console.log("embed link tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
