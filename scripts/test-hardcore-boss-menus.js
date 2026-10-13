"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  world = require("../src/hardcore/engine/world"),
  display = require("../src/hardcore/bosses/displayV2"),
  catalog = require("../src/hardcore/bosses/catalogV2"),
  view = require("../src/hardcore/ui"),
  service = require("../src/services/hardcoreService"),
  repo = require("../src/services/hardcoreRepository"),
  { routeComponentInteraction } = require("../src/componentRouter");
db.prepare(
  "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
).run("boss-menus", "u", 10000000);
let groups = 0;
async function test(label, f) {
  await f();
  groups++;
  console.log("PASS " + label);
}
function runBoss(id) {
  const run = service.startHardcore({
    guildId: "boss-menus",
    userId: "u",
    channelId: "c",
    stake: 10000,
    classKey: "assassin",
    forcedEncounter: { type: "empty" },
  });
  service.setMessageId(run.session.id, "public");
  const s = run.state;
  s.floor = id === "kabraxis" ? 666 : id === "deimoss" ? 999 : 150;
  s.cleared = 149;
  s.sources.event.vit = 10000;
  core.normalize(s);
  s.hp = s.maxHp;
  s.encounter = world.makeEnemy(
    s,
    "boss",
    null,
    () => 0.4,
    catalog.CATALOG[id],
  );
  core.prepareItemCombat(s, () => 0.4);
  repo.saveState(run.session, s);
  return run;
}
function menu(s, id) {
  return view
    .rows(id, s)
    .flatMap((r) => r.toJSON().components)
    .find((c) => c.type === 3 && c.custom_id.includes("boss_select"));
}
function mock(id, turn, raw, values, extra = {}) {
  const responses = { acks: 0, updates: [], replies: [], errors: [] };
  const interaction = {
    customId: "hardcore:" + id + ":" + turn + ":" + raw,
    values,
    user: { id: "u" },
    guildId: "boss-menus",
    channelId: "c",
    message: { id: "public" },
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    deferUpdate: async () => {
      responses.acks++;
    },
    editReply: async (p) => responses.updates.push(p),
    followUp: async (p) => responses.replies.push(p),
    ...extra,
  };
  const logger = {
    error: (data, msg) => responses.errors.push({ data, msg }),
    warn() {},
    debug() {},
  };
  return { interaction, logger, responses };
}
async function route(input) {
  assert.equal(
    await routeComponentInteraction(input.interaction, input.logger),
    true,
  );
}
async function main() {
  await test("Lilith action menu reaches real handler, acknowledges and advances exactly once", async () => {
    const run = runBoss("lilith"),
      s = run.state,
      m = menu(s, run.session.id);
    assert(m);
    const raw = m.custom_id.split(":")[3],
      value = m.options[0].value,
      input = mock(run.session.id, s.turn, raw, [value]);
    await route(input);
    assert.equal(input.responses.acks, 1);
    assert.equal(input.responses.updates.length, 1);
    assert.equal(input.responses.errors.length, 0);
    let live = repo.parseState(repo.getSession(run.session.id));
    assert.equal(live.turn, s.turn + 1);
    assert.equal(live.encounter.boss.round, 1);
    assert(live.encounter.boss.mechanicState.bargain > 0);
    const before = repo.getSession(run.session.id).state_json;
    await route(mock(run.session.id, s.turn, raw, [value]));
    assert.equal(repo.getSession(run.session.id).state_json, before);
    repo.deleteSession(run.session.id);
  });
  await test("Free target selectors route without spending a boss combat turn", async () => {
    const run = runBoss("lazarus"),
      s = run.state,
      m = menu(s, run.session.id);
    assert(m);
    const value = m.options.find((o) => !o.value.endsWith("target_boss")).value;
    const input = mock(run.session.id, s.turn, m.custom_id.split(":")[3], [
      value,
    ]);
    await route(input);
    const live = repo.parseState(repo.getSession(run.session.id));
    assert.equal(live.turn, s.turn + 1);
    assert.equal(live.encounter.boss.round, 0);
    assert.notEqual(live.encounter.boss.mechanicState.target, "boss");
    assert.equal(input.responses.errors.length, 0);
    assert.equal(input.responses.updates.length, 1);
    const updatedMenu = input.responses.updates[0].components
      .flatMap((row) => row.toJSON().components)
      .find((c) => c.type === 3);
    assert.equal(
      updatedMenu.options.find((o) => o.value === value).default,
      true,
    );
    repo.deleteSession(run.session.id);
  });

  await test("Necrobot selector publishes current target and forging stat receipt stays in one field", async () => {
    const run = runBoss("necrobot"),
      s = run.state,
      m = menu(s, run.session.id);
    const selected = m.options.find((o) => o.value.endsWith("target_Barrier"));
    const input = mock(run.session.id, s.turn, m.custom_id.split(":")[3], [
      selected.value,
    ]);
    await route(input);
    const live = repo.parseState(repo.getSession(run.session.id));
    assert.equal(live.encounter.boss.round, 0);
    assert.equal(live.encounter.boss.mechanicState.target, "Barrier");
    assert.equal(input.responses.updates.length, 1);
    assert.match(
      JSON.stringify(input.responses.updates[0].embeds),
      /Mục tiêu:.*Barrier/,
    );
    const option = input.responses.updates[0].components
      .flatMap((row) => row.toJSON().components)
      .find((c) => c.type === 3)
      .options.find((o) => o.value === selected.value);
    assert.equal(option.default, true);
    const gear = Object.values(core.ITEMS)
      .flat()
      .find((i) => i.name === "Astral Mail");
    assert(gear);
    core.receiveItem(s, gear);
    s.bonus = 1000000;
    s.encounter = core.makeSurprise(s, () => 0.5, "blacksmith");
    s.encounter.targetId = gear.id;
    core.act(s, run.session, "event_smith", () => 0.5);
    const embed = view.embed(s, "u").toJSON();
    const index = embed.fields.findIndex((f) =>
      f.name.includes("Lượt vừa rồi"),
    );
    assert(index >= 0);
    assert(
      index === embed.fields.length - 1 ||
        embed.fields[index + 1].name !== "\u200b",
      "forge receipt must not split into blank continuation field",
    );
    assert.match(embed.fields[index].value, /Rèn:/);
    assert.doesNotMatch(embed.fields[index].value, /\n\s*\n/);
    repo.deleteSession(run.session.id);
  });
  await test("Invalid menu values return a response and contextual error log, without changing state", async () => {
    const run = runBoss("lilith"),
      s = run.state,
      m = menu(s, run.session.id),
      raw = m.custom_id.split(":")[3],
      before = repo.getSession(run.session.id).state_json;
    for (const values of [
      [],
      ["missing"],
      [m.options[0].value, m.options[1].value],
    ]) {
      const input = mock(run.session.id, s.turn, raw, values);
      await route(input);
      assert.equal(input.responses.acks, 1);
      assert.equal(input.responses.replies.length, 1);
      assert.equal(input.responses.errors.length, 1);
      assert.equal(input.responses.errors[0].data.rawAction, raw);
      assert.equal(
        input.responses.errors[0].data.componentId,
        input.interaction.customId,
      );
      assert.equal(repo.getSession(run.session.id).state_json, before);
    }
    for (const extra of [
      { user: { id: "other" } },
      { message: { id: "old" } },
    ]) {
      const input = mock(
        run.session.id,
        s.turn,
        raw,
        [m.options[0].value],
        extra,
      );
      await route(input);
      assert.equal(input.responses.replies.length, 1);
      assert.equal(repo.getSession(run.session.id).state_json, before);
    }
    repo.deleteSession(run.session.id);
  });
  await test("Gharbad signs have names, clear true/false status and matching choices", () => {
    const run = runBoss("gharbad"),
      s = run.state,
      m = s.encounter.boss.mechanicState;
    for (let rule = 0; rule < 3; rule++)
      for (let sign = 0; sign < 3; sign++) {
        m.surrenderRule = rule;
        m.sign = sign;
        const before = JSON.stringify(s),
          text = display.status(s);
        assert(text.includes(["Hình thoi", "Tam giác", "Hình tròn"][sign]));
        assert.match(
          text,
          rule === sign ? /✅ Đầu hàng thật/ : /❌ Đầu hàng giả/,
        );
        assert.match(
          text,
          rule === sign
            ? /Chọn \*\*Chấp nhận\*\* hoặc \*\*Khám xét\*\*/
            : /Chọn \*\*Tấn công lời đầu hàng\*\*/,
        );
        assert.equal(JSON.stringify(s), before);
      }
    repo.deleteSession(run.session.id);
  });

  await test("Lilith details show exact HP costs, per-depth damage bonuses, duration and heal cap with standard icons", () => {
    const run = runBoss("lilith"),
      s = run.state,
      m = s.encounter.boss.mechanicState;
    const { E } = require("../src/hardcore/shared/icons");
    for (const floor of [150, 450, 750]) {
      s.encounter.boss.floor = floor;
      const power = catalog.config("lilith", floor).power;
      const before = JSON.stringify(s),
        text = display.details(s);
      for (const [i, rate] of [0.05, 0.1, 0.2].entries()) {
        assert(text.includes(Math.ceil(s.maxHp * rate) + " HP"));
        assert(
          text.includes("DMG +" + Math.round(power * (i + 1) * 100) + "%"),
        );
        assert(text.includes(i + 1 + " lượt kế tiếp"));
      }
      assert(text.includes(E.hp));
      assert(text.includes(E.attack));
      assert.doesNotMatch(text, /Bargain 0|trần 3|ngân sách hồi|tăng cửa sổ/);
      assert.equal(JSON.stringify(s), before);
    }
    m.bargain = 3;
    m.bargainBonus = 0.3;
    m.healDebt = 89;
    const before = JSON.stringify(s),
      text = display.status(s);
    assert(text.includes("DMG của bạn +30%"));
    assert(text.includes(s.maxHp - 89 + "/" + s.maxHp + " HP"));
    assert(text.includes("3 lượt"));
    for (const e of view
      .privatePayload(s, run.session.id, "public", "encounter")
      .embeds.map((e) => e.toJSON())) {
      assert((e.fields || []).every((f) => f.value.length <= 1024));
      assert(
        (e.title || "").length +
          (e.description || "").length +
          (e.fields || []).reduce(
            (n, f) => n + f.name.length + f.value.length,
            0,
          ) <=
          6000,
      );
    }
    assert.equal(JSON.stringify(s), before);
    repo.deleteSession(run.session.id);
  });

  await test("Azmodan explains both explosion targets and all 39 boss details fit Discord", () => {
    for (const id of Object.keys(catalog.CATALOG)) {
      const run = runBoss(id),
        s = run.state;
      const before = JSON.stringify(s),
        text = display.details(s);
      assert.doesNotMatch(
        text,
        /Chu kỳ \d; trần|Đổi mục tiêu\/Ward\/Plane|undefined/,
      );
      if (id === "azmodan") {
        assert.match(text, /Ấn máu: tự nổ sau 3 lượt/);
        assert.match(display.status(s), /DMG chuẩn.*cho bạn/);
        s.encounter.boss.mechanicState.reflected = true;
        assert.match(display.status(s), /boss mất.*5% Max HP/);
        s.encounter.boss.mechanicState.reflected = false;
      }
      for (const embed of view
        .privatePayload(s, run.session.id, "public", "encounter")
        .embeds.map((e) => e.toJSON())) {
        assert(
          (embed.fields || []).every((f) => f.value.length <= 1024),
          id + " field too long",
        );
        assert(
          (embed.title || "").length +
            (embed.description || "").length +
            (embed.fields || []).reduce(
              (n, f) => n + f.name.length + f.value.length,
              0,
            ) <=
            6000,
          id + " message too long",
        );
      }
      assert.equal(JSON.stringify(s), before);
      repo.deleteSession(run.session.id);
    }
  });

  await test("Compact V3 battle shows final counter damage, hit and Crit without duplicate stats", () => {
    const stats = require("../src/hardcore/engine/stats");
    const { E } = require("../src/hardcore/shared/icons");
    for (const key of Object.keys(stats.CLASSES)) {
      const s = stats.createState(key, 10000);
      s.floor = 6;
      s.cleared = 5;
      s.encounter = world.makeEnemy(s, "normal", "UI test", () => 0.5);
      s.encounter.damageMin = 100;
      s.encounter.damageMax = 120;
      s.encounter.critChance = 0.25;
      s.encounter.nextDamageType = "physical";
      const before = JSON.stringify(s),
        p = core.incomingPreview(s),
        embed = view.embed(s, "u").toJSON();
      assert.equal(embed.title, "SINH TỒN v3.0.0 · TẦNG 6 · Sanctuary");
      assert(
        embed.description.startsWith(
          stats.CLASSES[key].emoji +
            " **" +
            stats.CLASSES[key].name +
            "** · <@u>",
        ),
      );
      assert.equal(
        (JSON.stringify(embed).match(/Tỷ lệ vật lý đánh trúng quái/g) || [])
          .length,
        1,
      );
      assert(!embed.description.includes("Phép luôn trúng"));
      const foe = embed.fields.find((f) => f.name.includes("Đối thủ")).value;
      assert.doesNotMatch(foe, /Dự báo|DEF|RES|Tỷ lệ vật lý trúng/);
      assert(foe.includes(p.low + "–" + p.high + " DMG"));
      assert(foe.includes("25% CRIT"));
      assert(p.high < 120, "Counter is reduced by the character's defenses");
      assert.equal(JSON.stringify(s), before);
      s.encounter.nextDamageType = "magic";
      require("../src/hardcore/rift").encounter(s).lockedCounterType = "magic";
      assert.equal(core.incomingPreview(s).critChance, 0);
      assert(
        view
          .embed(s, "u")
          .toJSON()
          .fields.find((f) => f.name.includes("Đối thủ"))
          .value.includes(E.magic + " Phép"),
      );
      assert(
        view
          .embed(s, "u")
          .toJSON()
          .fields.find((f) => f.name.includes("Đối thủ"))
          .value.split("Đòn kế tiếp:")[1]
          .includes("trúng bạn") === false &&
          !view
            .embed(s, "u")
            .toJSON()
            .fields.find((f) => f.name.includes("Đối thủ"))
            .value.includes("CRIT"),
      );
    }
    const run = runBoss("bul_kathos"),
      s = run.state;
    s.encounter.boss.mechanicState.clashWrong = true;
    assert.equal(core.incomingPreview(s).critChance, 1);
    assert(
      view
        .embed(s, "u")
        .toJSON()
        .fields.find((f) => f.name.includes("Đối thủ"))
        .value.includes("100% CRIT"),
    );
    s.encounter.boss.mechanicState.skipCounter = true;
    assert(
      view
        .embed(s, "u")
        .toJSON()
        .fields.find((f) => f.name.includes("Đối thủ"))
        .value.includes("Không phản công"),
    );
    repo.deleteSession(run.session.id);
    const tickets = stats.createState("necromancer", 10000);
    tickets.prayerBoost = true;
    tickets.encounter = { type: "empty" };
    assert(
      !JSON.stringify(view.embed(tickets, "u").toJSON()).includes(
        "Vé cầu nguyện",
      ),
    );
    tickets.encounter = {
      type: "rngesus",
      encounterChance: 0.01,
      fleeChance: 0.9,
      prayerChance: 0.6,
    };
    assert(
      JSON.stringify(view.embed(tickets, "u").toJSON()).includes(
        "Vé cầu nguyện",
      ),
    );
    const legacy = stats.createState("necromancer", 10000, {
      gameplayVersion: 2,
    });
    legacy.floor = 6;
    legacy.encounter = world.makeEnemy(legacy, "normal", null, () => 0.5);
    assert(
      view
        .embed(legacy, "u")
        .toJSON()
        .fields.some((f) => f.name.includes("Necromancer")),
    );
  });

  console.log(
    groups + " deterministic boss menu/display groups passed; no simulations.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
