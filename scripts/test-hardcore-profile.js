const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const testDb = path.resolve(__dirname, "../data/test-hardcore-profile.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const repo = require("../src/services/hardcoreRepository");
const echoes = require("../src/services/hardcoreEchoRepository");
const profile = require("../src/services/hardcoreProfile");
const { getAchievements } = require("../src/services/achievementService");
const router = require("../src/componentRouter");

const G = "g", U = "u", V = "viewer";
const user = { id: U };
const overview = { data: { title: "overview" } };
const everyComponent = (payload) => payload.components.flatMap((row) => row.components.map((c) => c.data.custom_id));

// lưu một ván có killer/boss rồi đọc lại
for (let i = 0; i < 20; i++) {
  const session = { id: `s${i}`, guild_id: G, user_id: U, created_at: 1000 + i };
  const state = {
    classKey: i % 2 ? "druid" : "paladin", cleared: 10 + i, stake: 1000, turn: 30 + i,
    kills: 5, bossKills: 1, evCount: 2, chainCount: 1,
    killedBy: i % 3 ? "Dark Knight" : "Wrong Portal",
  };
  echoes.archive(session, state, i % 4 ? "death" : "cashout", i % 4 ? 0 : 1500, 3);
  repo.addEventStats(G, U, { events: 2, chains: 1, kinds: ["healer"], kills: 5, bossKills: 1, bosses: { "Andariel": 1 } });
}
const stats = profile.gatherStats(G, U);
assert.equal(stats.totals.runs, 20);
assert.equal(stats.events.kills, 100);
assert.equal(stats.bosses[0].count, 20);
assert.equal(stats.killers[0].name, "Dark Knight");
assert.equal(stats.byClass.length, 2);

// mọi tab: embed hợp lệ, id duy nhất, description <= 4096
for (const tab of profile.TABS.map((t) => t.id)) {
  for (const page of [0, 1, 2, 99]) {
    const payload = profile.profilePayload(G, V, user, tab, page, { toJSON: () => ({}), data: {} });
    const ids = everyComponent(payload);
    assert.equal(new Set(ids).size, ids.length, `custom_id trùng ở tab ${tab}`);
    const e = payload.embeds[0];
    assert((e.data?.description || "").length <= 4096);
  }
}
// lịch sử: 20 ván / 8 = 3 trang
const hist = profile.profilePayload(G, V, user, "history", 0, overview);
assert.match(hist.embeds[0].data.footer.text, /Trang 1\/3/);
assert.equal(hist.components.length, 2);
assert.equal(profile.profilePayload(G, V, user, "history", 99, overview).embeds[0].data.footer.text.startsWith("Trang 3/3"), true);
assert.equal(profile.profilePayload(G, V, user, "class", 0, overview).components.length, 1, "tab không phân trang không có hàng nút");

// top có phân trang theo class
for (let n = 0; n < 25; n++)
  echoes.archive({ id: `t${n}`, guild_id: G, user_id: `p${n}`, created_at: 1 }, { classKey: "druid", cleared: 100 + n, stake: 10, turn: 1 }, "death", 0, 0);
const top = profile.topPayload(G, V, "druid", 0);
assert.match(top.embeds[0].data.footer.text, /Trang 1\/3/);
const ids = everyComponent(top);
assert.equal(new Set(ids).size, ids.length);
assert.match(top.embeds[0].data.description, /tầng \*\*124\*\*/);
assert.match(profile.topPayload(G, V, "druid", 2).embeds[0].data.description, /tầng \*\*100\*\*|tầng \*\*10[0-9]\*\*|tầng \*\*1[0-9]\*\*/);
assert.equal(profile.topPayload(G, V, "bogus", 0).embeds[0].data.title.includes("·  "), false);
assert.equal(profile.topPayload(G, V, "all", 0).components.length >= 1, true);

// thành tựu mới
const ach = (id) => getAchievements(G, U).find((a) => a.id === id);
assert(ach("hc_kills_50").complete && !ach("hc_kills_500").complete);
assert(ach("hc_boss_10").complete && !ach("hc_boss_50").complete);

// handler: chỉ chủ bảng mới điều khiển
(async () => {
  let replied = null, updated = null;
  const fake = (customId, uid, values) => ({
    customId, values, user: { id: uid }, guildId: G, client: { users: { fetch: async (id) => ({ id }) } },
    reply: async (x) => (replied = x), update: async (x) => (updated = x),
  });
  const cmd = require("../src/commands/hardcore");
  await cmd.handleProfileSelect(fake(`hardcore-hoso:${V}:${U}`, "intruder", ["class"]));
  assert(replied && !updated);
  await cmd.handleProfileSelect(fake(`hardcore-hoso:${V}:${U}`, V, ["economy"]));
  assert.match(updated.embeds[0].data.title, /XU VÀ KIM CƯƠNG/);
  await cmd.handleProfilePage(fake(`hardcore-hosopg:${V}:${U}:0:next`, V));
  assert.match(updated.embeds[0].data.footer.text, /Trang 2\/3/);
  await cmd.handleTopPage(fake(`hardcore-toppg:${V}:druid:0:next`, V));
  assert.match(updated.embeds[0].data.footer.text, /Trang 2\//);
  await cmd.handleTopSelect(fake(`hardcore-top:${V}`, V, ["paladin"]));
  assert.match(updated.embeds[0].data.title, /Paladin/);
  console.log("hardcore profile ok");
})();
