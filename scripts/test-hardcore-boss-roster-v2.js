"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  world = require("../src/hardcore/engine/world");
const boss = require("../src/hardcore/bosses/mechanics"),
  u = require("../src/hardcore/bosses/mechanicsV2"),
  cat = require("../src/hardcore/bosses/catalogV2");
const display = require("../src/hardcore/bosses/display"),
  view = require("../src/hardcore/ui"),
  service = require("../src/hardcore"),
  repo = require("../src/hardcore/storage/sessions");
const session = { id: "b2", guild_id: "b2", user_id: "u", channel_id: "c" },
  groups = [];
let seed = 123456789;
const rng = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 2 ** 32;
};
function state(def = cat.POOL[0], floor = 50, key = "sorceress") {
  const s = stats.createState(key, 10000);
  Object.assign(s, {
    bossRosterVersion: 2,
    floor,
    cleared: floor - 1,
    godRngesusEnabled: false,
  });
  stats.addSource(s, { vit: 2000, str: 600, ene: 600, dex: 600 }, "test");
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  s.encounter = world.makeEnemy(
    s,
    floor === 999 ? "final_boss" : "boss",
    null,
    rng,
    def,
  );
  boss.refresh(s);
  return s;
}
const find = (id) => cat.CATALOG[id],
  cmd = (s, c) => "boss_" + s.encounter.boss.id + "__" + c;
function bounds(s) {
  const rows = view.rows("b2", s);
  assert(rows.length <= 5, "rows " + s.encounter.name);
  for (const row of rows) {
    const r = row.toJSON();
    assert(r.components.length <= 5);
    for (const c of r.components) {
      assert(c.custom_id.length <= 100);
      if (c.type === 3) {
        assert(c.options.length <= 25);
        assert(
          c.options.every(
            (o) => o.label.length <= 100 && o.value.length <= 100,
          ),
        );
      }
    }
  }
  for (const p of [
    { embeds: [view.embed(s, "u")] },
    ...["stats", "items", "effects", "encounter"].map((tab) =>
      view.privatePayload(s, "b2", "m", tab),
    ),
  ]) {
    let len = 0;
    for (const value of p.embeds || []) {
      const e = value.toJSON ? value.toJSON() : value;
      assert((e.fields || []).length <= 25);
      assert((e.description || "").length <= 4096);
      len +=
        (e.title || "").length +
        (e.description || "").length +
        (e.footer?.text || "").length;
      for (const f of e.fields || []) {
        assert(f.value.length <= 1024);
        len += f.name.length + f.value.length;
      }
      assert(!JSON.stringify(e).includes("undefined"));
    }
    assert(len <= 6000);
  }
}
assert.equal(cat.POOL.length, 39);
const counts = Array.from({ length: 19 }, () => Array(39).fill(0));
for (let n = 0; n < 10000; n++) {
  const s = { bossHistory: [] };
  for (let k = 0; k < 19; k++) {
    s.floor = (k + 1) * 50;
    const d = cat.choose(s, rng);
    counts[k][cat.POOL.findIndex((v) => v.id === d.id)]++;
  }
  assert.equal(s.bossHistory.length, 19);
}
for (const row of counts)
  for (const c of row)
    assert(
      Math.abs(c - 10000 / 39) < 6 * Math.sqrt((10000 / 39) * (1 - 1 / 39)),
    );
for (const floor of [666, 999]) {
  let calls = 0;
  const s = { floor };
  assert.equal(
    cat.choose(s, () => {
      calls++;
      return 0;
    }).floor,
    floor,
  );
  assert.equal(calls, 0);
  assert.equal(s.bossHistory, undefined);
}
for (const floor of [50, 300, 350, 650, 700, 950]) {
  const s = state(find("nithogur"), floor);
  assert.equal(s.encounter.boss.depth, cat.depth(floor));
}
groups.push(
  "10,000 independent schedules: uniform 39-boss pool at all 19 milestones, repeats and three Depths; fixed milestones consume no roster RNG",
);
for (const def of [...cat.POOL, ...cat.FIXED]) {
  const s = state(def, def.floor || 50),
    before = JSON.stringify(s);
  for (let i = 0; i < 100; i++) {
    view.embed(s, "u");
    view.rows("b2", s);
    display.status(s);
    display.details(s);
    core.attackDamagePreview(s);
    core.skillDamagePreview(s);
    core.incomingPreview(s);
  }
  bounds(s);
  assert.equal(JSON.stringify(s), before, def.id + " render mutated state");
  const copy = JSON.parse(before);
  core.normalize(copy);
  assert.deepEqual(
    copy.encounter,
    s.encounter,
    def.id + " resumed state changed",
  );
}
groups.push(
  "All 41 bosses: 100 readonly renders/previews, Discord limits and exact JSON resume",
);
for (const key of Object.keys(stats.CLASSES))
  for (const floor of [50, 350, 950])
    for (const def of cat.POOL) {
      const s = state(def, floor, key);
      for (const offer of boss.choices(s).filter((o) => !o.disabled)) {
        const run = structuredClone(s),
          round = run.encounter.boss.round,
          hp = run.hp,
          mp = run.mana,
          ep = run.encounter.hp;
        core.act(run, session, offer.action, rng);
        if (offer.kind === "selector") {
          assert.equal(run.encounter.boss.round, round);
          assert.equal(run.hp, hp);
          assert.equal(run.mana, mp);
          assert.equal(run.encounter.hp, ep);
        } else if (run.encounter === null || run.encounter.boss?.id !== def.id)
          continue;
        else
          assert.equal(
            run.encounter.boss.round,
            round + 1,
            def.id + " action must cost a turn",
          );
        if (run.encounter.boss?.version === 2) {
          boss.validate(run);
          bounds(run);
        }
      }
      for (const action of ["attack", "defend", "skill"]) {
        const run = structuredClone(s);
        if (!core.actions(run).some((o) => o.action === action && !o.disabled))
          continue;
        core.act(run, session, action, rng);
        if (run.encounter.boss?.version === 2) boss.validate(run);
      }
    }
groups.push(
  "7 classes × 39 bosses × 3 Depths: all opening components and common actions, selector resource conservation",
);
let s = state(find("quov")),
  round = s.encounter.boss.round;
for (let n = 0; n < 100; n++) {
  const hp = s.hp,
    mp = s.mana,
    pots = s.potions,
    eh = s.encounter.hp,
    fair = s.fairCounter;
  core.act(s, session, cmd(s, "ward" + (n % 3)), () => {
    throw Error("SELECTOR_CALLED_RNG");
  });
  assert.equal(s.hp, hp);
  assert.equal(s.mana, mp);
  assert.equal(s.potions, pots);
  assert.equal(s.encounter.hp, eh);
  assert.equal(s.encounter.boss.round, round);
  assert.equal(s.fairCounter, fair);
}
for (const bad of [
  "boss_baal__purify0",
  cmd(s, "ward8"),
  cmd(s, "target_fake"),
  "boss_select",
]) {
  const before = JSON.stringify(s);
  assert.throws(() => core.act(s, session, bad, rng), /INVALID_ACTION/);
  assert.equal(JSON.stringify(s), before);
}
groups.push(
  "Repeated selectors call no RNG/turn effects; forged, wrong-boss and nonexistent actions leave state unchanged",
);
for (const kind of ["war", "protection", "arcane"]) {
  for (let mask = 0; mask < 32; mask++) {
    s = state(find("kabraxis"), 666);
    s.prophecy = { kind };
    s.encounter.boss.seal = kind;
    const x = u.current(s);
    x.m.seals = Array.from({ length: 5 }, (_, i) =>
      mask & (1 << i) ? "broken" : "purified",
    );
    x.m.generated = 5;
    x.e.hp = Math.floor(x.e.maxHp * 0.25);
    boss.refresh(s);
    const broken = x.m.seals.filter((v) => v === "broken").length;
    assert.equal(boss.playerFactor(s, false), 1 + (5 - broken) * 0.05);
    assert.equal(boss.resPenalty(s), kind === "protection" ? broken * 5 : 0);
    assert.equal(
      boss.effectiveMaxMana(s),
      kind === "arcane"
        ? Math.min(s.maxMana, Math.max(2, s.maxMana - broken))
        : s.maxMana,
    );
    boss.validate(s);
    bounds(s);
  }
  s = state(find("kabraxis"), 666);
  s.encounter.boss.seal = kind;
  const x = u.current(s);
  x.m.pending = true;
  x.m.generated = 1;
  x.m.resonance = 3;
  const initial = x.e.hp;
  core.act(s, session, cmd(s, "purify_seal"), rng);
  assert.deepEqual(x.m.seals, ["purified"]);
  assert.equal(x.m.resonance, 0);
  assert.equal(x.e.hp, initial);
}
s = state(find("kabraxis"), 666);
s.encounter.boss.seal = "arcane";
boss.beginAction(s, "skill");
s.encounter.boss.mpChanged = true;
boss.afterPlayer(s, "skill", { dealt: 1 });
assert.equal(u.current(s).m.resonance, 1);
groups.push(
  "Kabraxis: all 96 seal/route combinations, exact costs, phase-three bonuses and net-zero MP resonance",
);
const permutations = (a) =>
  a.length
    ? a.flatMap((n, i) =>
        permutations(a.filter((_, j) => j !== i)).map((t) => [n, ...t]),
      )
    : [[]];
for (const order of permutations(["Ruin", "Silence", "Hunger"])) {
  s = state(find("deimoss"), 999);
  const e = s.encounter,
    b = e.boss,
    bars = b.bars.slice(),
    initial = s.bonus,
    hp = s.hp;
  assert.equal(
    Object.values(b.mechanicState.targets).reduce((n, v) => n + v.hp, 0),
    bars[0],
  );
  for (const k of order) {
    core.act(s, session, cmd(s, "target_" + k), rng);
    const target = b.mechanicState.targets[k].hp;
    assert.equal(boss.applyDamage(s, 1e9), target);
  }
  assert.equal(e.hp, 0);
  assert(boss.advancePhase(s));
  assert.equal(e.hp, bars[1]);
  assert.equal(s.hp, hp);
  assert.equal(s.bonus, initial);
  assert.equal(s.finalBossDefeated, false);
  const copy = structuredClone(s);
  core.normalize(copy);
  assert.deepEqual(copy.encounter, e);
}
for (const decision of ["burn", "implant", "leave"]) {
  s = state(find("deimoss"), 999);
  const x = u.current(s);
  x.e.hp = 0;
  boss.advancePhase(s);
  x.e.hp = Math.floor(x.e.maxHp * 0.7);
  boss.beginAction(s, "attack");
  boss.afterPlayer(s, "attack", { dealt: 1 });
  const n = x.e.hp,
    mp = s.mana,
    r = x.b.round;
  core.act(s, session, cmd(s, "core_" + decision), () => {
    throw Error("CORE_CALLED_RNG");
  });
  assert.equal(x.b.round, r);
  assert.equal(x.e.hp, n);
  assert.equal(s.mana, mp - (decision === "burn" ? 1 : 0));
  assert.equal(x.m.cores[0].choice, decision);
  assert.throws(
    () => core.act(s, session, cmd(s, "core_" + decision), rng),
    /INVALID_ACTION/,
  );
}
for (const plane of [0, 1, 2]) {
  s = state(find("deimoss"), 999);
  const x = u.current(s);
  x.b.phase = 3;
  x.e.hp = x.e.maxHp = x.b.bars[2];
  x.m.targets = null;
  x.m.target = "boss";
  x.m.plane = null;
  core.act(s, session, cmd(s, "plane" + plane), () => {
    throw Error("PLANE_CALLED_RNG");
  });
  assert.equal(x.m.planeTurns, 3);
  assert.equal(x.b.round, 0);
  if (plane === 2) {
    s.hp--;
    const hp = s.hp;
    assert.equal(core.heal(s, s.maxHp), 0);
    assert.equal(s.hp, hp);
    assert(core.actions(s).find((o) => o.action === "potion").disabled);
  }
  for (let i = 0; i < 3; i++) core.act(s, session, "defend", rng);
  assert.equal(x.m.planeTurns, 0);
  assert(core.actions(s).find((o) => o.action === "attack").disabled);
}
groups.push(
  "Deimoss: all six Spire orders, overflow discarded, three Core choices and three Planes, no phase/reward duplication",
);
s = state(find("nithogur"));
s.encounter.hp = s.encounter.maxHp = 100000;
core.act(s, session, cmd(s, "anchor"), rng);
const snapshot = structuredClone(u.current(s).m.anchor);
core.act(s, session, "skill", rng);
const kills = s.kills;
core.act(s, session, cmd(s, "rewind"), rng);
assert.equal(s.mana, snapshot.mana);
assert.equal(s.encounter.hp, snapshot.enemyHp);
assert.equal(s.kills, kills);
assert.equal(s.encounter.boss.round, 3);
assert.throws(
  () => core.act(s, session, cmd(s, "rewind"), rng),
  /INVALID_ACTION/,
);
s = state(find("lilith"));
core.act(s, session, cmd(s, "bargain2"), rng);
const limit = boss.healingLimit(s);
s.hp = 1;
core.heal(s, 1e9);
assert.equal(s.hp, limit);
for (const bad of [
  (s) => (s.encounter.boss.id = "forged"),
  (s) => (s.encounter.boss.id = "constructor"),
  (s) => (s.encounter.boss.id = "toString"),
  (s) => (s.encounter.boss.version = 3),
  (s) => (s.encounter.boss.version = 1),
  (s) => {
    s.bossDamageProfile = require("../src/hardcore/bosses/balanceV2").snapshot(
      s.classKey,
    );
    delete s.encounter.boss.playerDamageScale;
  },
  (s) => (s.encounter.boss.round = -1),
  (s) => (s.encounter.boss.mechanicState.pattern = [0, 0, 0]),
  (s) => (s.encounter.boss.mechanicState.heat = 101),
  (s) => (s.encounter.boss.baseRes = NaN),
]) {
  const run = state(find("machine"));
  bad(run);
  assert.throws(() => boss.validate(run), /INVALID_BOSS_STATE/);
}
const doorsState = state(find("machine"));
doorsState.encounter = {
  type: "surprise",
  kind: "doors",
  boss: world.makeEnemy(doorsState, "boss", "Premature Rift Boss", rng),
};
assert.doesNotThrow(() => boss.validate(doorsState));
groups.push(
  "Finite rewind, Lilith healing debt, invalid persisted IDs/numeric states rejected",
);
db.prepare(
  "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
).run("b2-tx", "u", 1000000);
delete process.env.HARDCORE_BOSS_ROSTER_VERSION;
db.prepare(
  "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
).run("b2-default", "u", 1000000);
const defaultRun = service.startHardcore({
  guildId: "b2-default",
  userId: "u",
  channelId: "c",
  stake: 10000,
  classKey: "sorceress",
  forcedEncounter: { type: "empty" },
});
assert.equal(defaultRun.state.bossRosterVersion, 2);
assert.deepEqual(
  defaultRun.state.bossDamageProfile,
  require("../src/hardcore/bosses/balanceV2").snapshot("sorceress"),
);
process.env.HARDCORE_BOSS_ROSTER_VERSION = "1";
db.prepare(
  "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
).run("b2-old-override", "u", 1000000);
const oldOverride = service.startHardcore({
  guildId: "b2-old-override",
  userId: "u",
  channelId: "c",
  stake: 10000,
  classKey: "sorceress",
  forcedEncounter: { type: "empty" },
});
assert.equal(oldOverride.state.bossRosterVersion, 1);
assert.equal(oldOverride.state.bossDamageProfile, undefined);
const migratedOld = structuredClone(oldOverride.state);
delete migratedOld.bossRosterVersion;
core.normalize(migratedOld);
assert.equal(migratedOld.bossRosterVersion, 1);
process.env.HARDCORE_BOSS_ROSTER_VERSION = "2";
const run = service.startHardcore({
  guildId: "b2-tx",
  userId: "u",
  channelId: "c",
  stake: 10000,
  classKey: "sorceress",
  forcedEncounter: { type: "empty" },
});
assert.equal(run.state.bossRosterVersion, 2);
assert.deepEqual(
  run.state.bossDamageProfile,
  require("../src/hardcore/bosses/balanceV2").snapshot("sorceress"),
);
const pinnedProfile = structuredClone(run.state.bossDamageProfile);
assert.throws(
  () =>
    core.normalize({
      ...run.state,
      bossDamageProfile: { ...pinnedProfile, playerDamage: 100 },
    }),
  /INVALID_BOSS_BALANCE_PROFILE/,
);
s = state(find("necrobot"));
s.fair = run.state.fair;
s.fairCounter = run.state.fairCounter;
repo.saveState(run.session, s);
let result = service.playHardcore({
  sessionId: run.session.id,
  userId: "u",
  action: cmd(s, "target_Barrier"),
  expectedTurn: s.turn,
});
assert.equal(result.state.encounter.boss.round, 0);
assert.equal(result.state.turn, 1);
const saved = repo.getByUser("b2-tx", "u").state_json;
for (const stale of [cmd(s, "target_Weapon"), "attack"])
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "u",
        action: stale,
        expectedTurn: 0,
      }),
    /STALE_ACTION/,
  );
assert.equal(repo.getByUser("b2-tx", "u").state_json, saved);
assert.throws(
  () =>
    service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      action: "boss_baal__purify0",
      expectedTurn: 1,
    }),
  /INVALID_ACTION/,
);
assert.equal(repo.getByUser("b2-tx", "u").state_json, saved);
result = service.playHardcore({
  sessionId: run.session.id,
  userId: "u",
  action: "attack",
  expectedTurn: 1,
});
assert.throws(
  () =>
    service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      action: cmd(s, "target_Weapon"),
      expectedTurn: 1,
    }),
  /STALE_ACTION/,
);
assert.equal(result.state.encounter.boss.round, 1);
groups.push(
  "Real SQLite transaction: selector and combat revision race/stale guards, forged-action rollback, new-run roster only",
);

// Branches reached only after counters/windows have evolved.
const ops = { hurt: core.hurt, heal: core.heal, addSource: stats.addSource };
function hold(id, floor = 50) {
  const s = state(find(id), floor);
  s.encounter.hp = s.encounter.maxHp = 100000;
  s.encounter.damageMin = s.encounter.damageMax = 1;
  return s;
}
s = hold("machine");
core.act(s, session, "skill", () => 0);
assert.equal(u.current(s).m.heat, cat.config("machine", 50).amount);
u.current(s).m.heat = 100;
const playerHp = s.hp,
  enemyHp = s.encounter.hp;
boss.endAction(s, rng, ops);
assert(s.hp < playerHp);
assert(s.encounter.hp < enemyHp);
assert.equal(u.current(s).m.heat, 0);
s = state(find("machine"));
const killingHeat = u.current(s);
killingHeat.e.hp = 1;
killingHeat.m.heat = 99;
s.hp = 1;
assert.equal(
  core.act(s, session, "skill", () => 0),
  "death",
);
assert.equal(s.hp, 0, "Killing hit still resolves lethal Meltdown");
assert.equal(killingHeat.e.hp, 0);
assert(s.lastLog.includes("Meltdown"));
s = hold("assur");
for (let i = 0; i < 3; i++)
  core.act(
    s,
    session,
    cmd(s, "sigil" + u.current(s).m.pattern[u.current(s).m.cursor % 3]),
    rng,
  );
assert.equal(u.current(s).m.charges, 3);
core.act(s, session, cmd(s, "purify"), rng);
assert(u.isOpen(u.current(s)));
const doubleClue = state(find("control"), 50, "amazon");
core.act(doubleClue, session, "skill", () => 0);
assert.equal(
  u.current(doubleClue).m.hints,
  2,
  "Each hit supplies one exclusion clue",
);
s = hold("control");
core.act(s, session, "skill", rng);
core.act(s, session, "skill", rng);
assert.equal(u.current(s).m.hints, 2);
core.act(
  s,
  session,
  cmd(s, "frequency" + u.current(s).m.pattern[u.current(s).m.cursor % 3]),
  rng,
);
assert(u.isOpen(u.current(s)));
assert.equal(
  boss.counter(s).skip,
  false,
  "Counter suppression must not leak into the next turn",
);
s = hold("giyua");
core.act(s, session, cmd(s, "nest_harvest"), rng);
core.act(s, session, "defend", rng);
assert.equal(u.current(s).m.nests, 2);
s = hold("riftwalker");
for (let i = 0; i < 3; i++) core.act(s, session, "attack", rng);
assert.equal(u.current(s).m.echoes.length, 3);
const echoHp = s.hp;
core.act(s, session, cmd(s, "echo_0"), rng);
assert(s.hp < echoHp);
assert(u.current(s).m.echoes.length <= 3);
s = hold("gharbad");
let x = u.current(s);
x.m.sign = x.m.surrenderRule;
const g = s.hp;
s.hp -= 100;
core.act(s, session, cmd(s, "accept"), rng);
assert(s.hp > g - 100);
x.m.sign = (x.m.surrenderRule + 1) % 3;
const gh = x.e.hp;
core.act(s, session, cmd(s, "strike"), rng);
assert(x.e.hp < gh);
s = hold("phoboss");
u.current(s).m.dream = 5;
core.act(s, session, cmd(s, "wake"), rng);
assert.equal(u.current(s).m.dream, 3);
s = hold("anomaly");
u.current(s).m.shards = [0, 1, 2];
core.act(s, session, cmd(s, "overload"), rng);
assert.equal(s.encounter.defense, 0);
assert.equal(s.encounter.resistance, 0);
s = hold("zakarum");
core.act(s, session, cmd(s, "halo_Might"), rng);
assert(!u.current(s).m.halos.includes("Might"));
assert.equal(boss.playerFactor(s, false), 1.1);
core.act(s, session, cmd(s, "halo_Sanctuary"), rng);
assert.equal(boss.resPenalty(s), -5);
assert(boss.playerFactor(s, false) >= 1.1);
s = hold("uldyssian");
core.act(s, session, "attack", rng);
core.act(s, session, cmd(s, "rewrite_0"), rng);
assert.equal(u.current(s).m.timeline[0], "empty");
s = hold("xazax");
const xp = s.encounter.hp;
core.act(s, session, cmd(s, "portal_take"), rng);
assert(s.encounter.hp < xp);
s = hold("samael");
u.current(s).m.lights = 5;
const sp = s.hp;
core.act(s, session, "defend", rng);
assert(s.hp < sp);
assert.equal(u.current(s).m.lights, 0);
s = hold("death_projector");
u.current(s).m.zone = u.beamZone(u.current(s));
assert(!boss.counter(s).skip);
core.act(
  s,
  session,
  cmd(s, "zone" + ((u.beamZone(u.current(s)) + 1) % 3)),
  rng,
);
assert(boss.counter(s).skip);
s = hold("buyard");
u.current(s).m.heat = 50;
assert.equal(boss.playerFactor(s, false), 1.2);
u.current(s).m.heat = 80;
const bh = s.hp;
core.act(s, session, "defend", rng);
assert(s.hp < bh);
s = hold("bartuc");
core.act(s, session, "skill", rng);
assert(u.current(s).m.golemDamage > 0);
core.act(s, session, cmd(s, "cut"), rng);
assert.equal(u.current(s).m.tether, false);
assert.equal(u.current(s).m.golemDamage, 0);
s = hold("jitan");
assert.equal(core.attackDamagePreview(s).high, 0);
core.act(s, session, cmd(s, "gate" + u.current(s).m.pattern[0]), rng);
assert(core.attackDamagePreview(s).high > 0);
s = hold("greater_riftwalker");
x = u.current(s);
x.b.round = x.c.cycle - 1;
x.m.near = !u.stormNear(x);
assert(!boss.counter(s).skip);
core.act(s, session, cmd(s, "position"), rng);
assert(s.hp > 0);
s = hold("athulua", 950);
x = u.current(s);
x.b.round = x.c.cycle - 1;
core.act(s, session, "attack", () => 0);
assert.equal(x.m.arrow, 1);
assert.equal(x.m.siegeUntil, x.b.round + 2);
assert(
  core
    .actions(s)
    .some((o) => o.action === cmd(s, "zone" + x.m.siegeZone) && o.disabled),
);
s = hold("nemesis");
for (const a of ["attack", "defend", "attack", "defend"])
  core.act(s, session, a, rng);
assert.equal(u.current(s).m.lock, "attack");
assert(core.actions(s).find((o) => o.action === "attack").disabled);
s = hold("azmodan");
core.act(s, session, cmd(s, "reflect"), rng);
const ah = s.hp,
  ae = s.encounter.hp;
for (let i = 0; i < 2; i++) core.act(s, session, "defend", rng);
assert(s.encounter.hp < ae);
assert(s.hp > ah - s.maxHp * 0.05);
s = hold("dark_star_dragon");
x = u.current(s);
x.b.round = x.c.cycle - 1;
const pillars = x.m.pillars[0],
  dh = s.hp;
core.act(s, session, cmd(s, "cover0"), rng);
assert.equal(x.m.pillars[0], pillars - 1);
assert.equal(s.hp, dh);
s = hold("juris_khan");
core.act(s, session, cmd(s, "forward"), rng);
assert.equal(u.current(s).m.position, 1);
assert.equal(
  boss.playerFactor(s, false),
  1 + cat.config("juris_khan", 50).power,
);
s = hold("baal");
x = u.current(s);
x.m.corruption = 2;
core.act(s, session, cmd(s, "purify0"), rng);
assert.equal(x.m.corruption, 0);
assert.equal(x.m.purity, 0);
s = hold("belial");
core.act(s, session, cmd(s, "lie" + u.current(s).m.pattern[0]), rng);
assert(u.isOpen(u.current(s)));
s = state(find("astrogha"));
x = u.current(s);
const totem = x.m.targets.Venom.hp;
core.act(s, session, cmd(s, "target_Venom"), rng);
assert.equal(boss.applyDamage(s, 1e9), totem);
assert.equal(x.m.transfers.Venom, 3);
assert.equal(x.m.target, "Web");
assert(
  boss
    .choices(s)
    .filter((o) => o.menu === "position")
    .every((o) => o.disabled),
);
core.act(s, session, cmd(s, "target_Web"), rng);
boss.applyDamage(s, 1e9);
assert.equal(x.m.transfers.Web, 3);
assert(
  boss
    .choices(s)
    .filter((o) => o.menu === "position")
    .every((o) => o.disabled),
);
x.b.round = 3;
boss.refresh(s);
assert(boss.choices(s).some((o) => o.menu === "position" && !o.disabled));
const astroMenus = view
  .rows("b2", s)
  .map((row) => row.toJSON())
  .flatMap((row) => row.components)
  .filter((c) => c.type === 3);
assert.equal(astroMenus.length, 2);
assert.equal(new Set(astroMenus.map((c) => c.custom_id)).size, 2);
bounds(s);
const roundBeforeAstroMove = x.b.round;
core.act(s, session, cmd(s, "zone0"), rng);
assert.equal(x.m.zone, 0);
assert.equal(x.b.round, roundBeforeAstroMove + 1);
s = hold("atanna");
x = u.current(s);
core.act(s, session, cmd(s, "erase0"), rng);
assert(x.m.erased);
assert.equal(x.m.dreams[0], null);
assert(!boss.choices(s).length);
s = hold("inarius");
x = u.current(s);
core.act(s, session, cmd(s, "pull"), rng);
assert.equal(x.m.inarius, x.m.ritual);
assert.equal(x.m.lilith, x.m.ritual);
x.m.lilithHp = 10;
core.act(s, session, cmd(s, "protect"), rng);
assert(x.m.lilithHp > 10);
s = hold("sescheron");
x = u.current(s);
for (const n of x.m.code.slice()) core.act(s, session, cmd(s, "rune" + n), rng);
assert(u.isOpen(x));
assert.deepEqual(x.m.input, []);
s = state(find("deimoss"), 999);
x = u.current(s);
x.e.hp = 0;
boss.advancePhase(s);
x.m.cores = [{ stat: "ene", amount: 8, curse: "skillHpCost", choice: null }];
core.act(s, session, cmd(s, "core_implant"), rng);
assert(boss.skillHpCost(s) > 0);
x.m.cores = [
  { stat: "vit", amount: 8, curse: "healingReduction", choice: null },
];
core.act(s, session, cmd(s, "core_implant"), rng);
assert.equal(boss.healingFactor(s), 0.85);
groups.push(
  "Evolved mechanics: heat, puzzles, nightmares, echoes, halos, portals, positioning, bargain, combo lock, finite cover, NPC and Flesh Curses",
);

// Final reward is settled once through the real transaction path.
s = state(find("deimoss"), 999);
x = u.current(s);
x.b.phase = 3;
x.e.hp = 1;
x.e.maxHp = x.b.bars[2];
x.m.targets = null;
x.m.target = "boss";
x.m.plane = 0;
x.m.planeTurns = 3;
s.turn = result.state.turn;
s.fair = result.state.fair;
s.fairCounter = result.state.fairCounter;
repo.saveState(run.session, s);
result = service.playHardcore({
  sessionId: run.session.id,
  userId: "u",
  action: "skill",
  expectedTurn: s.turn,
});
assert.equal(result.state.phase, "summit");
assert.equal(result.state.finalBossDefeated, true);
assert.equal(result.state.bossKills, 1);
assert.throws(
  () =>
    service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      action: "skill",
      expectedTurn: result.state.turn,
    }),
  /INVALID_ACTION/,
);
const end = service.playHardcore({
  sessionId: run.session.id,
  userId: "u",
  action: "retreat",
  expectedTurn: result.state.turn,
});
assert(end.settled);
const bank = db
  .prepare(
    "SELECT balance FROM economy_accounts WHERE guild_id=? AND user_id=?",
  )
  .get("b2-tx", "u").balance;
assert.throws(
  () =>
    service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      action: "retreat",
      expectedTurn: end.state.turn,
    }),
  /INVALID_SESSION/,
);
assert.equal(
  db
    .prepare(
      "SELECT balance FROM economy_accounts WHERE guild_id=? AND user_id=?",
    )
    .get("b2-tx", "u").balance,
  bank,
);
s = state(find("deimoss"), 999);
x = u.current(s);
const ru = x.m.targets.Ruin;
boss.applyDamage(s, Math.floor(ru.hp / 2));
const sum = () => Object.values(x.m.targets).reduce((n, v) => n + v.hp, 0);
const beforeH = x.e.hp;
u.healBoss(x, 100);
assert(x.e.hp > beforeH);
assert.equal(x.e.hp, sum());
boss.validate(s);
core.act(s, session, cmd(s, "target_Ruin"), rng);
boss.applyDamage(s, 1e9);
u.healBoss(x, 1000);
assert.equal(x.m.targets.Ruin.hp, 0);
assert.equal(x.e.hp, sum());
boss.validate(s);
groups.push(
  "Hunger healing preserves Spire HP sums and never resurrects a destroyed Spire",
);
groups.push(
  "Actual final-phase death and cashout: one boss tally/reward/settlement; stale components cannot claim again",
);

console.log(
  "Boss roster 2: " + groups.length + " groups passed\n" + groups.join("\n"),
);
db.close();
