"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const {
  safeAvatarURL,
  avatarFor,
  makePlayer,
  PLAYER_LABELS,
} = require("../src/webGames/playerIdentity");
const { createWebServer } = require("../src/webGames/http");
const avatar =
  "https://cdn.discordapp.com/avatars/123456789012345678/abcdef123456.png?size=128";
const changedAvatar =
  "https://cdn.discordapp.com/avatars/123456789012345678/0123456789abcd.png?size=128";
const host = {
  id: "123456789012345678",
  username: "Bách Tuệ",
  displayAvatarURL(options) {
    assert.deepEqual(options, {
      extension: "png",
      size: 128,
      forceStatic: true,
    });
    return avatar;
  },
};
const guest = {
  id: "234567890123456789",
  username: "Minh Anh",
  displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/2.png",
};
const code = (fn, expected) =>
  assert.throws(fn, (error) => error.code === expected);
async function main() {
  for (const url of [
    "http://cdn.discordapp.com/embed/avatars/0.png",
    "https://example.com/avatar.png",
    "data:image/svg+xml,bad",
    "javascript:alert(1)",
    "https://cdn.discordapp.com.evil.test/avatars/1/a.png",
    "https://user:password@cdn.discordapp.com/embed/avatars/0.png",
    "https://cdn.discordapp.com/api/token",
    "https://cdn.discordapp.com:444/embed/avatars/0.png",
  ])
    assert.equal(safeAvatarURL(url), null);
  assert.equal(safeAvatarURL(avatar), avatar);
  assert.equal(makePlayer(host).avatarUrl, avatar);
  assert.match(
    avatarFor({ id: "legacy" }),
    /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/,
  );
  assert.equal(
    avatarFor({ id: "1", discriminator: "0001" }),
    "https://cdn.discordapp.com/embed/avatars/1.png",
  );
  assert.equal(
    avatarFor({
      id: "1",
      displayAvatarURL() {
        throw Error("not available");
      },
    }),
    "https://cdn.discordapp.com/embed/avatars/0.png",
  );
  const games = [];
  for (const game of ["caro", "walls", "battleship"]) {
    const store = require(`../src/${game}/store`).createStore(db);
    const r = store.create({ guildId: game, channelId: "c", user: host });
    let view = store.snapshot(r, null);
    assert.equal(view.players.X, host.username);
    assert.equal(view.avatars.X, avatar);
    assert.equal(view.avatars.O, null);
    assert.deepEqual(view.playerLabels, PLAYER_LABELS[game]);
    const joined = store.join(r.id, guest);
    assert.equal(
      store.snapshot(joined, null).avatars.O,
      guest.displayAvatarURL(),
    );
    const saved = JSON.parse(
      db.prepare(`SELECT data_json FROM ${game}_rooms WHERE id=?`).get(r.id)
        .data_json,
    );
    delete saved.players.X.avatarUrl;
    db.prepare(`UPDATE ${game}_rooms SET data_json=? WHERE id=?`).run(
      JSON.stringify(saved),
      r.id,
    );
    const legacy = store.get(r.id);
    assert.match(store.snapshot(legacy, null).avatars.X, /embed\/avatars/);
    assert.equal(
      store.get(r.id).version,
      legacy.version,
      "read-only avatar fallbacks do not rewrite old saves",
    );
    const refreshed = store.updatePlayer(r.id, host);
    assert.equal(refreshed.version, legacy.version + 1);
    assert.equal(store.snapshot(refreshed, host.id).avatars.X, avatar);
    assert.equal(
      store.updatePlayer(r.id, host).version,
      refreshed.version,
      "confirming an unchanged profile preserves the board version",
    );
    const updated = store.updatePlayer(r.id, {
      ...host,
      displayAvatarURL: () => changedAvatar,
    });
    assert.equal(store.snapshot(updated, null).avatars.X, changedAvatar);
    code(
      () =>
        store.updatePlayer(r.id, { id: "stranger", username: "Wrong player" }),
      "NOT_PLAYER",
    );
    assert.equal(store.get(r.id).players.X.name, host.username);
    if (game !== "caro") {
      const discord = require(`../src/${game}/discord`);
      const text = discord
        .roomPayload(updated, "https://example.com/")
        .embeds[0].toJSON();
      assert(!/[✕◯]/.test(text.title));
      assert(text.description.includes(PLAYER_LABELS[game].X));
      assert(text.description.includes(PLAYER_LABELS[game].O));
      assert(!/\*\*[XO]:\*\*/.test(text.description));
    }
    games.push(require(`../src/${game}/webGame`).createGame({ store, db }));
  }
  // Use the actual shared browser renderer; failed images leave readable initials.
  const elements = new Map();
  const element = () => ({
    dataset: {},
    hidden: false,
    textContent: "",
    removeAttribute(name) {
      delete this[name];
    },
  });
  const context = {
    URL,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/webGames/public/players.js"),
      "utf8",
    ),
    context,
  );
  context.state = {
    players: { X: "Bách Tuệ", O: null },
    avatars: { X: avatar, O: null },
  };
  vm.runInContext("WebGamePlayers.render(state)", context);
  const img = elements.get("avatar-X"),
    fallback = elements.get("avatar-fallback-X");
  assert.equal(img.src, avatar);
  assert.equal(fallback.textContent, "B");
  assert.equal(img.hidden, true);
  img.onload();
  assert.equal(img.hidden, false);
  assert.equal(fallback.hidden, true);
  img.onerror();
  assert.equal(img.hidden, true);
  assert.equal(fallback.hidden, false);
  context.state.avatars.X = "https://evil.test/track.png";
  vm.runInContext("WebGamePlayers.render(state)", context);
  assert.equal(img.src, undefined);
  assert.equal(img.hidden, true);
  assert.equal(fallback.hidden, false);
  assert.equal(elements.get("avatar-O").src, undefined);
  const config = { origin: "", secure: false },
    web = createWebServer({ games, config });
  try {
    await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
    config.origin = `http://127.0.0.1:${web.server.address().port}`;
    for (const game of games) {
      const response = await fetch(config.origin + `/${game.id}/`),
        html = await response.text();
      assert.match(
        response.headers.get("content-security-policy"),
        /img-src 'self' https:\/\/cdn.discordapp.com;/,
      );
      assert(html.includes('src="/players.js"'));
      assert(html.includes('href="/players.css"'));
      assert(html.includes('id="avatar-X"'));
      assert(html.includes('id="avatar-O"'));
      const readable = html.replace(/<[^>]*>/g, "");
      if (game.id !== "caro")
        assert(
          !/(?<![\p{L}\p{N}])[OX](?![\p{L}\p{N}])/u.test(readable),
          "non-Caro placeholders must use game roles",
        );
    }
    assert.equal((await fetch(config.origin + "/players.js")).status, 200);
    assert.equal((await fetch(config.origin + "/players.css")).status, 200);
  } finally {
    await web.stop();
  }
  console.log(
    JSON.stringify({
      ok: true,
      players:
        "Discord avatars, safe CDN sources, legacy refresh, shared fallback renderer, game-specific roles, private state preserved",
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
