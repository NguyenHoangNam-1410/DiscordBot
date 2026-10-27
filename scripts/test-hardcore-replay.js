"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  { gunzipSync, inflateRawSync } = require("node:zlib");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const service = require("../src/hardcore"),
  repo = require("../src/hardcore/storage/sessions"),
  store = require("../src/hardcore/replay/store"),
  view = require("../src/hardcore/replay/view");
let groups = 0;
async function test(name, f) {
  await f();
  console.log("PASS " + name);
  groups++;
}
const rows = (id) =>
  db
    .prepare(
      "SELECT * FROM hardcore_replay_frames WHERE session_id=? ORDER BY seq",
    )
    .all(id);
function start(user, extra = {}) {
  db.prepare(
    "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES('replay',?,1000000,0,0)",
  ).run(user);
  return service.startHardcore({
    guildId: "replay",
    userId: user,
    channelId: "c",
    classKey: "sorceress",
    stake: 100000,
    forcedEncounter: { type: "empty", name: "Empty" },
    ...extra,
  });
}
function play(run, action, extra = {}) {
  return service.playHardcore({
    sessionId: run.session.id,
    userId: run.session.user_id,
    expectedTurn: JSON.parse(
      repo.getSession(run.session.id)?.state_json || '{"turn":0}',
    ).turn,
    action,
    ...extra,
  });
}
function end(run) {
  return service.forceEndHardcoreSession(run.session.id, "replay", "test");
}
let finished, partial;
async function main() {
  await test("Start/action/final snapshots persist transactionally; active and cross-guild exports are rejected", () => {
    finished = start("history");
    const id = finished.session.id;
    assert.equal(rows(id).length, 1);
    assert.equal(rows(id)[0].turn, 0);
    assert.throws(() => store.get("replay", id), /REPLAY_RUN_ACTIVE/);
    assert.throws(() => store.get("other", id), /REPLAY_NOT_FOUND/);
    const result = play(finished, "next");
    assert.equal(rows(id).length, 2);
    assert.equal(rows(id)[1].floor, 1);
    assert.equal(rows(id)[1].turn, result.state.turn);
    const s = JSON.parse(repo.getSession(id).state_json);
    s.encounter = { type: "empty", name: "Empty" };
    repo.saveState(finished.session, s);
    const out = play(finished, "retreat");
    assert(out.settled);
    assert(!repo.getSession(id));
    const data = store.get("replay", id.toUpperCase());
    assert.equal(data.frames.length, 3);
    assert.equal(data.frames.at(-1).action, "retreat");
    assert.equal(data.result.reason, "cashout");
    assert.equal(data.result.payout, out.result.payout);
    assert(!data.partial);
    assert.throws(() => play(finished, "retreat"), /INVALID_SESSION/);
    assert.equal(rows(id).length, 3);
  });
  await test("Snapshot failure at start refunds nothing and rolls the wager reservation back; legacy runs also record", () => {
    db.exec(
      "CREATE TRIGGER replay_start_failure BEFORE INSERT ON hardcore_replay_frames WHEN NEW.action='start' BEGIN SELECT RAISE(ABORT,'REPLAY_START_FAILURE'); END;",
    );
    try {
      assert.throws(() => start("bad-start"), /REPLAY_START_FAILURE/);
      assert.equal(
        db
          .prepare(
            "SELECT balance FROM economy_accounts WHERE guild_id='replay' AND user_id='bad-start'",
          )
          .get().balance,
        1000000,
      );
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) n FROM hardcore_sessions WHERE user_id='bad-start'",
          )
          .get().n,
        0,
      );
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) n FROM hardcore_replays WHERE user_id='bad-start'",
          )
          .get().n,
        0,
      );
    } finally {
      db.exec("DROP TRIGGER replay_start_failure");
    }
    const beta = start("beta-admin", { beta: true });
    end(beta);
    assert.equal(store.get("replay", beta.session.id).result.payout, 0);
  });
  await test("Invalid, forged and stale actions do not create frames or change the saved run", () => {
    const run = start("rollback");
    const before = repo.getSession(run.session.id).state_json;
    assert.throws(
      () => play(run, "next", { userId: "intruder" }),
      /INVALID_SESSION/,
    );
    assert.throws(
      () => play(run, "next", { expectedTurn: 42 }),
      /STALE_ACTION/,
    );
    const state = JSON.parse(before);
    state.encounter = {
      type: "combat",
      name: "Guard",
      hp: 100,
      maxHp: 100,
      damageMin: 1,
      damageMax: 2,
      defense: 0,
      resistance: 0,
      accuracy: 1,
      evasion: 1,
    };
    repo.saveState(run.session, state);
    const saved = repo.getSession(run.session.id).state_json;
    assert.throws(() => play(run, "not-an-action"), /INVALID_ACTION/);
    assert.equal(repo.getSession(run.session.id).state_json, saved);
    assert.equal(rows(run.session.id).length, 1);
    end(run);
  });
  await test("Midrun rollout is marked partial and admin/timeout endings preserve their final frame", () => {
    partial = start("partial");
    db.prepare("DELETE FROM hardcore_replay_frames WHERE session_id=?").run(
      partial.session.id,
    );
    db.prepare("DELETE FROM hardcore_replays WHERE session_id=?").run(
      partial.session.id,
    );
    const state = JSON.parse(repo.getSession(partial.session.id).state_json);
    state.turn = 9;
    state.floor = 7;
    repo.saveState(partial.session, state);
    play(partial, "next");
    assert.equal(rows(partial.session.id)[0].turn, 9);
    assert.equal(rows(partial.session.id)[1].turn, 10);
    end(partial);
    const data = store.get("replay", partial.session.id);
    assert(data.partial);
    assert.equal(data.frames.at(-1).action, "end:admin-refund");
    const timeout = start("timeout");
    db.prepare("UPDATE hardcore_sessions SET updated_at=0 WHERE id=?").run(
      timeout.session.id,
    );
    service.cleanupStaleHardcoreSessions(Date.now());
    assert.equal(
      store.get("replay", timeout.session.id).result.reason,
      "forfeit",
    );
  });
  await test("A replay write failure rolls back action, settlement, rewards and session deletion together", () => {
    const run = start("write-failure");
    const saved = repo.getSession(run.session.id).state_json;
    const money = db
      .prepare(
        "SELECT balance FROM economy_accounts WHERE guild_id='replay' AND user_id='write-failure'",
      )
      .get().balance;
    db.exec(
      "CREATE TRIGGER replay_failure BEFORE INSERT ON hardcore_replay_frames WHEN NEW.action='retreat' BEGIN SELECT RAISE(ABORT,'REPLAY_TEST_FAILURE'); END;",
    );
    try {
      assert.throws(() => play(run, "retreat"), /REPLAY_TEST_FAILURE/);
      assert.equal(repo.getSession(run.session.id).state_json, saved);
      assert.equal(
        db
          .prepare(
            "SELECT balance FROM economy_accounts WHERE guild_id='replay' AND user_id='write-failure'",
          )
          .get().balance,
        money,
      );
      assert.equal(
        db
          .prepare("SELECT ended_at FROM hardcore_replays WHERE session_id=?")
          .get(run.session.id).ended_at,
        null,
      );
      assert.equal(rows(run.session.id).length, 1);
    } finally {
      db.exec("DROP TRIGGER replay_failure");
    }
    end(run);
  });
  await test("Beta death/revive/end and a lethal real combat retain exact post-action history", () => {
    const beta = start("beta", { beta: true });
    let s = JSON.parse(repo.getSession(beta.session.id).state_json);
    s.hp = 0;
    require("../src/hardcore/beta").markDeath(s, "death");
    repo.saveState(beta.session, s);
    play(beta, "beta_revive");
    play(beta, "beta_end");
    assert(store.get("replay", beta.session.id).result.beta);
    assert.equal(rows(beta.session.id).length, 3);
    const run = start("death");
    s = JSON.parse(repo.getSession(run.session.id).state_json);
    s.hp = 1;
    s.defense = 0;
    s.resistance = 0;
    s.encounter = {
      type: "combat",
      name: "Lethal Guard",
      rank: "normal",
      hp: 100000,
      maxHp: 100000,
      damageMin: 100000,
      damageMax: 100000,
      damageType: "magic",
      nextDamageType: "magic",
      combatTurn: 1,
      defense: 0,
      resistance: 0,
      accuracy: 99999,
      evasion: 0,
    };
    repo.saveState(run.session, s);
    const out = play(run, "defend");
    assert(out.settled);
    const data = store.get("replay", run.session.id);
    assert.equal(data.result.reason, "death");
    assert.equal(data.frames.at(-1).state.hp, 0);
  });
  await test("Old finished runs yield honest summary-only replays, missing codes do not fabricate turns", () => {
    const id = "abcdefabcdef";
    db.prepare(
      "INSERT INTO hardcore_run_archive(session_id,guild_id,user_id,gameplay_version,release_version,class_key,cleared,reason,stake,payout,diamonds,turns,created_at,ended_at) VALUES(?,'replay','old',3,'3.1.0','druid',10,'death',100000,0,0,20,1,2)",
    ).run(id);
    const old = store.get("replay", id);
    assert(old.summaryOnly);
    assert.equal(old.frames.length, 0);
    assert.equal(old.result.turns, 20);
    assert.throws(
      () => store.get("replay", "000000000000"),
      /REPLAY_NOT_FOUND/,
    );
    assert.throws(
      () => store.get("replay", "../../file"),
      /INVALID_REPLAY_CODE/,
    );
  });
  await test("Export is offline, compressed, immutable and never exposes fairness seeds or raw HTML names", () => {
    const data = store.get("replay", finished.session.id);
    const raw = JSON.parse(
      inflateRawSync(rows(finished.session.id)[0].state_blob),
    ).state;
    assert(raw.fair.serverSeed);
    const json = JSON.stringify(data);
    assert(!json.includes(raw.fair.serverSeed));
    assert(!json.includes("serverSeed"));
    assert(!json.includes("user_id"));
    data.frames[0].state.playerName = "</script><img src=x onerror=alert(1)>";
    const html = view.html(data).toString();
    assert(!html.includes(data.frames[0].state.playerName));
    assert(html.includes("connect-src 'none'"));
    assert(!html.includes("<script src="));
    assert(!html.includes("<link "));
    const encoded = html.match(/id="replay-data"[^>]*>([^<]+)<\/script>/)[1];
    assert.deepEqual(
      JSON.parse(gunzipSync(Buffer.from(encoded, "base64"))),
      data,
    );
    assert.equal(
      store.get("replay", finished.session.id).frames[0].state.hp,
      raw.hp,
    );
  });
  await test("Client handles turn/floor jumps, Prev/Next, slider, empty history and malformed input", async () => {
    class Element {
      constructor(id) {
        this.id = id;
        this.value = id === "mode" ? "turn" : "";
        this.listeners = {};
        this.children = [];
        this.style = {};
        this.textContent = "";
        this.disabled = false;
      }
      replaceChildren(...x) {
        this.children = x;
      }
      append(...x) {
        this.children.push(...x);
      }
      addEventListener(k, f) {
        this.listeners[k] = f;
      }
    }
    async function mount(data) {
      const map = new Map();
      const document = {
        getElementById: (id) => {
          if (!map.has(id)) map.set(id, new Element(id));
          return map.get(id);
        },
        createElement: (tag) => new Element(tag),
        addEventListener: () => {},
      };
      document.getElementById("replay-data").textContent = view
        .html(data)
        .toString()
        .match(/id="replay-data"[^>]*>([^<]+)<\/script>/)[1];
      const result = await vm.runInNewContext(
        fs.readFileSync(
          require.resolve("../src/hardcore/replay/client"),
          "utf8",
        ),
        {
          document,
          Intl,
          Response,
          Blob,
          DecompressionStream,
          Uint8Array,
          atob,
          console,
        },
      );
      return {
        result,
        map,
        fire: (id, event = "click") =>
          map.get(id).listeners[event]({ preventDefault() {} }),
      };
    }
    const data = store.get("replay", finished.session.id);
    data.frames = data.frames.slice(0, 1).concat(
      [1, 2, 3].map((turn, i) => ({
        ...data.frames[0],
        seq: turn,
        turn,
        floor: i < 2 ? 1 : 2,
      })),
    );
    for (const f of data.frames) {
      f.state = structuredClone(f.state);
      f.state.items = [
        { name: "First Item", rarity: "R", level: 1, effects: { vit: 5 } },
        { name: "Second Item", rarity: "SR", level: 2, effects: { ene: 7 } },
      ];
      f.state.presentation = {
        rifts: [
          { title: "Stone Skin ×2", text: "Lá chắn đá còn 12 / 20 HP." },
          { title: "Soul Drain ×5", text: "Còn 2 lần hút MP." },
        ],
        effects: [
          { title: "Royal Outlaw", text: "Boss gây thêm 20% DMG." },
          { title: "Vulnerable", text: "Checkpoint không hồi HP đến tầng 30." },
        ],
      };
      f.state.hp = 20;
      f.state.mana = 1;
    }
    data.frames[1].state.hp = 27;
    data.frames[1].state.mana = 2;
    data.frames[1].state.lastStatChanges = { hp: 999 };
    const ui = await mount(data);
    const read = (id) => {
      const content = (e) => e.textContent + e.children.map(content).join(" ");
      return content(ui.map.get(id));
    };
    assert.equal(ui.result.getIndex(), 0);
    ui.fire("next");
    assert.equal(ui.result.getIndex(), 1);
    assert(read("changes").includes("HP: +7"));
    assert(read("changes").includes("MP: +1"));
    assert(!read("changes").includes("999"));
    ui.fire("itemsNext");
    assert(read("items").includes("Second Item"));
    assert(ui.map.get("itemsNext").disabled);
    assert.equal(ui.result.getIndex(), 1);
    ui.fire("riftsNext");
    assert(read("rifts").includes("2 lần hút MP"));
    ui.fire("effectsNext");
    assert(read("effects").includes("Vulnerable"));
    assert(read("items").includes("Second Item"));
    ui.fire("itemsPrev");
    assert(read("items").includes("First Item"));
    ui.fire("prev");
    assert.equal(ui.result.getIndex(), 0);
    ui.map.get("position").value = "2";
    ui.fire("jump", "submit");
    assert.equal(ui.result.getIndex(), 2);
    ui.map.get("position").value = "99";
    ui.fire("jump", "submit");
    assert.equal(ui.result.getIndex(), 2);
    assert(ui.map.get("message").textContent.includes("Không có"));
    ui.map.get("mode").value = "floor";
    ui.fire("mode", "change");
    ui.fire("next");
    assert.equal(ui.result.getIndex(), 3);
    assert(ui.map.get("next").disabled);
    ui.fire("prev");
    assert.equal(ui.result.getIndex(), 0);
    ui.map.get("timeline").value = "1";
    ui.fire("timeline", "input");
    assert.equal(ui.result.getIndex(), 3);
    const empty = await mount({
      ...data,
      frames: [],
      summaryOnly: true,
      partial: true,
    });
    assert(empty.map.get("scene").hidden);
    assert(empty.map.get("next").disabled);
  });
  await test("Rift descriptions capture combat status and remain frozen; old frames supplement text without changing stored stats", () => {
    const raw = JSON.parse(
      inflateRawSync(rows(finished.session.id)[0].state_blob),
    ).state;
    raw.rift.stacks.stone_skin = 2;
    raw.rift.stacks.soul_drain = 5;
    raw.encounter = {
      type: "combat",
      name: "Snapshot enemy",
      hp: 100,
      maxHp: 100,
      rift: {
        version: 2,
        stacks: { ...raw.rift.stacks },
        stoneArmor: 12,
        stoneArmorMax: 20,
        brokenArmor: false,
        soulDrainCharges: 2,
        manaFracture: true,
      },
    };
    const before = JSON.stringify(raw),
      presentation = require("../src/hardcore/replay/presentation").capture(
        raw,
      );
    assert.equal(JSON.stringify(raw), before);
    assert(
      presentation.rifts
        .find((r) => r.title.startsWith("Stone Skin"))
        .text.includes("12"),
    );
    assert(
      presentation.rifts
        .find((r) => r.title.startsWith("Soul Drain"))
        .text.includes("2 lần hút còn lại"),
    );
    const saved = rows(finished.session.id)[0],
      old = JSON.parse(inflateRawSync(saved.state_blob));
    const frozen = old.view.presentation;
    const capture = require("../src/hardcore/replay/presentation").capture;
    require("../src/hardcore/replay/presentation").capture = () => {
      throw Error("Must not reinterpret frozen presentation");
    };
    try {
      assert.deepEqual(
        store.get("replay", finished.session.id).frames[0].state.presentation,
        frozen,
      );
    } finally {
      require("../src/hardcore/replay/presentation").capture = capture;
    }
    delete old.view.presentation;
    const blob = require("node:zlib").deflateRawSync(
      Buffer.from(JSON.stringify(old)),
    );
    db.prepare(
      "UPDATE hardcore_replay_frames SET state_blob=? WHERE session_id=? AND seq=0",
    ).run(blob, finished.session.id);
    try {
      const supplemented = store.get("replay", finished.session.id);
      assert(supplemented.frames[0].state.presentation.supplemented);
      assert.equal(supplemented.frames[0].state.hp, old.view.hp);
      assert.deepEqual(rows(finished.session.id)[0].state_blob, blob);
    } finally {
      db.prepare(
        "UPDATE hardcore_replay_frames SET state_blob=? WHERE session_id=? AND seq=0",
      ).run(saved.state_blob, finished.session.id);
    }
  });
  await test("Real slash command exports completed runs only and checks the invoking server", async () => {
    const command = require("../src/commandRegistry")
      .loadCommands("./commands")
      .find((c) => c.data.toJSON().name === "sinhton");
    const option = command.data
      .toJSON()
      .options.find((o) => o.name === "replay");
    assert(option.options[0].required);
    let reply;
    const invoke = async (guildId, code, attachmentSizeLimit) =>
      command.execute({
        guildId,
        user: { id: "viewer" },
        attachmentSizeLimit,
        options: { getSubcommand: () => "replay", getString: () => code },
        deferReply: async () => {},
        editReply: async (p) => {
          reply = p;
        },
      });
    await invoke("replay", finished.session.id);
    assert(reply.files[0].name.endsWith(".html"));
    assert(reply.files[0].attachment.toString().includes("REPLAY OFFLINE"));
    const active = start("active");
    await invoke("replay", active.session.id);
    assert(reply.content.includes("vẫn đang chơi"));
    assert(!reply.files);
    await invoke("other", finished.session.id);
    assert(reply.content.includes("Không tìm thấy"));
    await invoke("replay", finished.session.id, 1);
    assert(reply.content.includes("vượt giới hạn"));
    end(active);
  });
  console.log(
    groups +
      " replay groups passed; in-memory SQLite and executable offline client.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
