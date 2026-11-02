"use strict";

const assert = require("node:assert/strict");
const { createPublicPages } = require("../src/webGames/publicPages");
const site = require("../src/webGames/publicSite.json");
const { createWebServer } = require("../src/webGames/http");

async function main() {
  // Static pages work without a database, game state, login or a Discord connection.
  const config = { origin: "", secure: false };
  const web = createWebServer({ games: [], config });
  try {
    await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
    config.origin = `http://127.0.0.1:${web.server.address().port}`;
    const html = {};
    for (const route of ["/", "/terms", "/privacy"]) {
      const response = await fetch(config.origin + route);
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type"),
        /^text\/html; charset=utf-8$/,
      );
      assert.equal(response.headers.get("set-cookie"), null);
      assert.match(
        response.headers.get("content-security-policy"),
        /default-src 'none'/,
      );
      html[route] = await response.text();
      assert.match(html[route], /<html lang="vi">/);
      assert.match(html[route], /name="viewport"/);
      for (const path of ["/terms", "/privacy", "/site.css"])
        assert(html[route].includes(`"${path}"`));
      assert(html[route].includes(`href="${site.supportUrl}"`));
      assert(html[route].includes(`href="mailto:${site.supportEmail}"`));
      assert(!html[route].includes('href="/api/'));
      const head = await fetch(config.origin + route, { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), "");
      assert.equal(
        Number(head.headers.get("content-length")),
        Buffer.byteLength(html[route]),
      );
    }
    assert.match(html["/terms"], /Điều khoản sử dụng/);
    assert.match(html["/terms"], /không có giá trị quy đổi hoặc rút ra tiền/);
    assert.match(html["/privacy"], /sao lưu/);
    assert.match(html["/privacy"], /Google Gemini, OpenAI, OpenRouter/);
    assert.match(html["/privacy"], /30 phút không được dùng tiếp/);
    assert.match(html["/privacy"], /12 giờ/);
    assert.match(html["/privacy"], /yêu cầu xem, sửa hoặc xóa dữ liệu/i);
    for (const route of ["/terms/", "/privacy/"]) {
      const redirect = await fetch(config.origin + route, {
        redirect: "manual",
      });
      assert.equal(redirect.status, 308);
      assert.equal(redirect.headers.get("location"), route.slice(0, -1));
    }
    const css = await fetch(config.origin + "/site.css");
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /^text\/css/);
    assert.match(await css.text(), /@media/);
    assert.equal((await fetch(config.origin + "/publicSite.json")).status, 404);
    assert.equal((await fetch(config.origin + "/.env")).status, 404);
    assert.equal((await fetch(config.origin + "/terms?ignored=1")).status, 200);
    assert.equal((await fetch(config.origin + "/healthz")).status, 200);
    for (const route of ["/terms", "/privacy"])
      assert(
        !html[route].includes("<script"),
        "policies have no JavaScript dependency",
      );
    const escaped = createPublicPages(
      [{ id: "caro", name: '<img src=x onerror="bad">' }],
      { ...site, appName: "<script>bad</script>" },
    )
      .get("/")
      .data.toString();
    assert(!escaped.includes("<img"));
    assert(!escaped.includes("<script>bad"));
    assert(escaped.includes("&lt;script&gt;"));
    assert(escaped.includes('href="/caro/"'));
    const legacy = createWebServer({
      games: [
        {
          id: "caro",
          name: "Caro",
          publicDir: require("node:path").join(__dirname, "../src/caro/public"),
        },
      ],
      legacyGame: "caro",
      config,
    });
    try {
      await new Promise((resolve) =>
        legacy.server.listen(0, "127.0.0.1", resolve),
      );
      const origin = `http://127.0.0.1:${legacy.server.address().port}`;
      const root = await (await fetch(origin + "/")).text();
      assert(root.includes('src="/portal.js"'));
      assert(root.includes('href="/caro/"'));
      assert.match(
        await (await fetch(origin + "/portal.js")).text(),
        /location\.hash/,
      );
    } finally {
      await legacy.stop();
    }
    for (const supportUrl of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:password@example.com",
    ])
      assert.throws(() => createPublicPages([], { ...site, supportUrl }));
    console.log(
      JSON.stringify({
        ok: true,
        publicPages:
          "public terms/privacy, contacts, no login/cookies, HEAD, redirects, mobile styles, escaped names, legacy portal preserved",
      }),
    );
  } finally {
    await web.stop();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
