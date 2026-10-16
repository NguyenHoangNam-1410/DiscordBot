"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const stats = require("../src/hardcore/engine/stats"),
  core = require("../src/hardcore/engine"),
  chars = require("../src/hardcore/characters"),
  souls = require("../src/hardcore/characters/souls"),
  kit = require("../src/hardcore/characters/venance"),
  awake = require("../src/hardcore/awakening"),
  bosses = require("../src/hardcore/bosses/mechanics"),
  ui = require("../src/hardcore/ui"),
  progress = require("../src/hardcore/characters/progression");
const session = {
    id: "venance-test",
    guild_id: "g",
    user_id: "v",
    channel_id: "c",
  },
  rng = () => 0.5;
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS " + name);
}
function fresh(n = 0, awakened = false, rarity = "SSR") {
  const s = chars.preview("venance", n, rarity);
  Object.assign(s, {
    floor: 6,
    cleared: 5,
    encounter: {
      type: "combat",
      name: "Fixture",
      rank: "normal",
      hp: 100000,
      maxHp: 100000,
      defense: 0,
      resistance: 0,
      evasion: 0,
      accuracy: 100000,
      critChance: 0,
      damageMin: 1,
      damageMax: 1,
      damageType: "physical",
      nextDamageType: "physical",
      combatTurn: 1,
    },
  });
  if (awakened) {
    s.floor = 100;
    awake.grant(s, { rank: "boss", hp: 0 });
    s.floor = 6;
  }
  core.prepareItemCombat(s, rng);
  s.spellMin = s.spellMax = 100;
  return s;
}
const act = (s, a, random = rng) => {
  s.spellMin = s.spellMax = 100;
  const result = core.act(s, session, a, random);
  s.spellMin = s.spellMax = 100;
  return result;
};
try {
  test("Distinct SSR profile, base stats, native cards and seven free starters", () => {
    chars.validate();
    const s = chars.preview("venance");
    assert.deepEqual(
      [
        s.maxHp,
        s.maxMana,
        s.damageMin,
        s.damageMax,
        s.spellMin,
        s.spellMax,
        s.defense,
        s.resistance,
        s.accuracy,
        s.evasion,
      ],
      [112, 4, 8, 13, 52, 57, 6, 18, 76, 7],
    );
    assert.equal(chars.get("venance").starter, false);
    assert.equal(Object.keys(chars.ownedCharacters()).length, 7);
    assert(!chars.ownedCharacters("v").venance);
    progress.grantCharacter("v", "venance", Date.now());
    progress.grantCharacter("v", "venance", Date.now());
    assert.equal(progress.cards("v", "mage", "SSR"), 50);
    assert(
      !require("../src/hardcore/gacha/banners.json").banners?.some((b) =>
        JSON.stringify(b).includes("venance"),
      ),
    );
  });
  test("Skill costs MP, deals zero, receives counter, preserves all three subsequent actions", () => {
    const s = fresh();
    const hp = s.hp,
      e = s.encounter.hp;
    act(s, "skill");
    assert.equal(s.encounter.hp, e);
    assert.equal(s.mana, 2);
    assert(s.hp < hp);
    assert.equal(kit.frame(s).remaining, 3);
    for (let i = 2; i >= 0; i--) {
      const mana = s.mana,
        hp = s.encounter.hp;
      act(s, "attack");
      assert.equal(s.mana, mana);
      assert.equal(hp - s.encounter.hp, 220);
      assert.equal(kit.frame(s).remaining, i);
    }
    const mana = s.mana;
    act(s, "attack");
    assert.equal(s.mana, mana + 1);
    assert(s.lastLog.includes("Tấn công"));
  });
  test("Potion, Defend, recast, sigil one-use and heal restrictions", () => {
    const s = fresh();
    act(s, "skill");
    act(s, "attack");
    act(s, "potion");
    assert.equal(kit.frame(s).remaining, 1);
    act(s, "attack");
    assert(kit.frame(s).ready);
    s.hp = 50;
    s.healingReduction = 0.5;
    const expected = core.healingAmount(s, s.maxHp * 0.05),
      hp = s.hp;
    act(s, "defend");
    assert(s.hp >= hp + expected - 1);
    assert.equal(s.mana, 4);
    assert(!kit.frame(s).ready);
    act(s, "skill");
    assert.equal(kit.frame(s).remaining, 3);
    assert.equal(kit.frame(s).hits, 0);
    assert(!kit.frame(s).sigilUsed);
    s.mana = 4;
    act(s, "attack");
    act(s, "skill");
    assert.equal(kit.frame(s).hits, 0);
    assert(!kit.frame(s).ready);
  });
  test("S1/S4/S5 coefficients and one-hit sigil", () => {
    for (const [n, damage, ready] of [
      [0, 220, false],
      [1, 250, false],
      [4, 250, true],
      [5, 280, true],
    ]) {
      const s = fresh(n);
      act(s, "skill");
      let hp = s.encounter.hp;
      act(s, "attack");
      assert.equal(hp - s.encounter.hp, damage);
      assert.equal(kit.frame(s).ready, ready);
    }
  });
  test("S2 only once per combat; phase and recast do not reload", () => {
    const s = fresh(2);
    act(s, "skill");
    assert(kit.frame(s).firstBarrierUsed);
    assert(kit.frame(s).barrier > 0);
    kit.frame(s).barrier = 0;
    s.mana = 4;
    act(s, "skill");
    assert.equal(kit.frame(s).barrier, 0);
    s.encounter.boss = { phase: 2 };
    core.prepareItemCombat(s, rng);
    assert(kit.frame(s).firstBarrierUsed);
    delete s.encounter.boss;
  });
  test("Awakening third hit / S3 / S6 pulse, previews stay pure", () => {
    for (const [n, third] of [
      [0, 297],
      [3, 400],
      [6, 627],
    ]) {
      const s = fresh(n, true);
      act(s, "skill");
      act(s, "attack");
      act(s, "attack");
      const before = JSON.stringify(s);
      const forecast = core.attackDamagePreview(s);
      assert.equal(JSON.stringify(s), before);
      assert.equal(forecast.low, third);
      const hp = s.encounter.hp;
      act(s, "attack");
      assert.equal(hp - s.encounter.hp, third);
      assert(kit.frame(s).barrier > 0);
      assert.equal(kit.frame(s).remaining, 0);
      core.normalize(s);
    }
  });
  test("No awakening finisher before floor 100 and an interrupted chain loses third hit", () => {
    const s = fresh(6);
    act(s, "skill");
    act(s, "attack");
    act(s, "attack");
    const hp = s.encounter.hp;
    act(s, "attack");
    assert.equal(hp - s.encounter.hp, 280);
    assert(!s.lastLog.includes("Xung tinh giới"));
    const a = fresh(6, true);
    act(a, "skill");
    act(a, "attack");
    act(a, "defend");
    const before = a.encounter.hp;
    act(a, "attack");
    assert.equal(before - a.encounter.hp, 280);
  });
  test("Empowered attack cannot leech MP, gains never hide drains", () => {
    const s = fresh(6);
    s.items.push({
      definition: {
        id: "fixture-mp",
        effects: {},
        passive: { version: 1, kind: "mpLeech", amount: 0.35 },
      },
      level: 1,
    });
    act(s, "skill");
    s.mana = 1;
    act(s, "attack", () => 0);
    assert.equal(s.mana, 1);
    s.modifiers.soul_drain = 1;
    delete s.encounter.rift;
    core.prepareItemCombat(s, rng);
    act(s, "attack");
    assert(s.mana <= 1);
  });
  test("Shield damage qualifies; invulnerability does not", () => {
    const s = fresh(4);
    act(s, "skill");
    s.encounter.rift.stoneArmor = 1000;
    s.encounter.rift.stoneArmorMax = 1000;
    const hp = s.encounter.hp;
    act(s, "attack");
    assert.equal(s.encounter.hp, hp);
    assert.equal(kit.frame(s).hits, 1);
    assert(kit.frame(s).ready);
    const immune = fresh(4);
    immune.encounter.mechanic = "riftwalker";
    immune.encounter.combatTurn = 2;
    act(immune, "skill");
    assert.equal(immune.encounter.combatTurn, 3);
    act(immune, "attack");
    assert.equal(kit.frame(immune).hits, 0);
    assert.equal(kit.frame(immune).remaining, 2);
  });
  test("S6 overkill reports strength without pulse spilling to a dead target", () => {
    const s = fresh(6, true);
    act(s, "skill");
    act(s, "attack");
    act(s, "attack");
    s.encounter.hp = 10;
    const p = core.attackDamagePreview(s);
    assert.equal(p.low, 448);
    const e = s.encounter;
    act(s, "attack");
    assert.equal(e.hp, 0);
    assert(!s.lastLog.includes("Xung tinh giới"));
    assert(s.lastLog.includes("448 DMG"));
  });
  test("UR/LR scales absolute once, snapshots persist, invalid rarity is rejected", () => {
    assert.throws(() => chars.preview("venance", 0, "LR"), /INVALID_VENANCE/);
    const ssr = chars.preview("venance", 6),
      ur = chars.preview("venance", 6, "UR"),
      lr = chars.preview("venance", 6, "LR");
    assert.equal(ur.maxHp, 123);
    assert.equal(lr.maxHp, 134);
    stats.recompute(lr);
    assert.equal(lr.maxHp, 134);
    assert.equal(kit.config(ssr).damageMultiplier, 1);
    assert.equal(kit.config(lr).damageMultiplier, 1.15);
    const s = fresh(6, true, "LR");
    act(s, "skill");
    act(s, "attack");
    core.normalize(JSON.parse(JSON.stringify(s)));
    s.venanceProfile.coefficient = 99;
    assert.throws(() => core.normalize(s), /INVALID_VENANCE/);
  });
  test("UI resolves uploaded emoji names dynamically and keeps all six souls in the soul tab", () => {
    const icons = require("../src/utils/appEmoji"),
      soulIcon = require("../src/hardcore/shared/icons").soulIcon;
    assert.equal(stats.CLASSES.venance.emoji, "🔮");
    assert.equal(soulIcon("venance", 1), "✨");
    icons.setApplicationEmojisForTest([
      ["class_venance", "1557000000000000001"],
      ["skill_venance_astral_armament", "1557000000000000002"],
      ["soul_venance_1", "1557000000000000003"],
      ...[
        "attack_venance_empowered",
        "effect_venance_astral_armament",
        "awaken_venance_astral_codex",
        "innate_venance_runic_reflux",
        ...[2, 3, 4, 5, 6].map((n) => "soul_venance_" + n),
      ].map((name, i) => [name, String(1557000000000000100n + BigInt(i))]),
    ]);
    assert(stats.CLASSES.venance.emoji.includes("class_venance"));
    assert(soulIcon("venance", 1).includes("soul_venance_1"));
    for (const tab of ["stats", "skills", "souls"]) {
      const p = require("../src/hardcore/ui/characters").payload("unowned", {
          id: "venance",
          tab,
        }),
        text = JSON.stringify(p);
      assert(!/undefined|NaN/.test(text));
      assert(p.components.length <= 5);
      assert.equal(
        p.embeds[0].data.fields.filter((f) => /^🔒 S[1-6]/.test(f.name)).length,
        tab === "souls" ? 6 : 0,
      );
      assert(p.embeds[0].length <= 6000);
    }
    for (let n = 1; n <= 6; n++)
      assert(soulIcon("venance", n).includes("soul_venance_" + n));
    const s = fresh(6, true);
    act(s, "skill");
    assert(s.lastLog.includes("skill_venance_astral_armament"));
    assert(kit.innateText(s).includes("innate_venance_runic_reflux"));
    assert(kit.awakeningText(s).includes("awaken_venance_astral_codex"));
    const b = JSON.stringify(ui.embed(s, "v"));
    assert(b.includes("effect_venance_astral_armament"));
    assert(b.includes("attack_venance_empowered"));
    act(s, "attack");
    assert(s.lastLog.includes("attack_venance_empowered"));
    assert(b.includes("cường hóa 3 hành động"));
    assert(!/undefined|NaN/.test(b));
  });

  test("Boss selectors cost no empowerment; paid boss actions cost exactly one", () => {
    function boss(id) {
      const s = fresh(6, true);
      s.bossRosterVersion = 2;
      s.floor = 150;
      s.cleared = 149;
      stats.addSource(s, { vit: 10000 });
      s.hp = s.maxHp;
      s.encounter = require("../src/hardcore/engine/world").makeEnemy(
        s,
        "boss",
        null,
        rng,
        require("../src/hardcore/bosses/catalogV2").CATALOG[id],
      );
      core.prepareItemCombat(s, rng);
      act(s, "skill");
      return s;
    }
    const s = boss("necrobot"),
      f = kit.frame(s),
      before = JSON.stringify(f);
    const free = core.actions(s).find((a) => bosses.isFree(s, a.action));
    assert(free);
    act(s, free.action);
    assert.equal(JSON.stringify(f), before);
    const a = boss("lilith"),
      paid = core
        .actions(a)
        .find(
          (x) =>
            x.action.startsWith("boss_") &&
            !bosses.isFree(a, x.action) &&
            !x.disabled,
        );
    assert(paid);
    act(a, paid.action);
    assert.equal(kit.frame(a).remaining, 2);
    assert.equal(kit.frame(a).hits, 0);
  });
  test("Real module targeting never spills a lethal third hit into the next module", () => {
    const s = fresh(6, true);
    s.bossRosterVersion = 2;
    s.floor = 200;
    s.encounter = require("../src/hardcore/engine/world").makeEnemy(
      s,
      "boss",
      null,
      rng,
      require("../src/hardcore/bosses/catalogV2").CATALOG.necrobot,
    );
    stats.addSource(s, { vit: 10000 });
    s.hp = s.maxHp;
    core.prepareItemCombat(s, rng);
    act(s, "skill");
    kit.frame(s).hits = 2;
    const m = s.encounter.boss.mechanicState,
      target = m.target;
    assert(m.targets[target]);
    m.targets[target].hp = 1;
    const others = Object.entries(m.targets)
      .filter(([k]) => k !== target)
      .map(([k, v]) => [k, v.hp]);
    act(s, "attack");
    assert.equal(m.targets[target].hp, 0);
    for (const [k, hp] of others) assert.equal(m.targets[k].hp, hp);
    assert(!s.lastLog.includes("Xung tinh giới"));
  });
  test("Owned-only setup and run startup, persistence and failed-start rollback", () => {
    const service = require("../src/hardcore"),
      repo = require("../src/hardcore/storage/sessions"),
      economy = require("../src/services/economyService");
    const flow = require("../src/hardcore/runtime/setupFlow")({
      CLASSES: require("../src/hardcore/legacy/catalog").CLASSES,
      useV2: () => true,
      hardcoreView: require("../src/hardcore/legacy/ui"),
      getAccount: () => ({ balance: 1000 }),
      getGameBetLimit: () => 100000,
      MAX_BET: 100000,
    });
    const draft = {
      id: "setup",
      version: 0,
      guildId: "g",
      userId: "v",
      classKey: "venance",
      stake: 10,
      stage: "class",
    };
    assert(flow.selectableClasses(draft).venance);
    assert(!flow.selectableClasses({ ...draft, userId: "unowned" }).venance);
    const preview = flow.setupPayload(draft);
    assert(!/undefined|NaN/.test(JSON.stringify(preview)));
    assert(
      preview.components[0]
        .toJSON()
        .components[0].options.some((o) => o.value === "venance"),
    );
    economy.creditCoins({ guildId: "g", userId: "unowned", amount: 1000 });
    const money = economy.getAccount("g", "unowned").balance;
    assert.throws(
      () =>
        service.startHardcore({
          guildId: "g",
          userId: "unowned",
          channelId: "c",
          classKey: "venance",
          stake: 10,
        }),
      /CHARACTER_NOT_OWNED/,
    );
    assert.equal(economy.getAccount("g", "unowned").balance, money);
    economy.creditCoins({ guildId: "g", userId: "v", amount: 1000 });
    const run = service.startHardcore({
      guildId: "g",
      userId: "v",
      channelId: "c",
      classKey: "venance",
      stake: 10,
      forcedEncounter: { type: "empty" },
    });
    assert.equal(run.state.venanceProfile.rarity, "SSR");
    assert.equal(run.state.bossDamageProfile.playerDamage, 2);
    Object.assign(run.state, { encounter: fresh().encounter });
    core.prepareItemCombat(run.state, rng);
    act(run.state, "skill");
    repo.saveState(run.session, run.state);
    const saved = JSON.parse(repo.getSession(run.session.id).state_json);
    core.normalize(saved);
    assert.equal(kit.frame(saved).remaining, 3);
    assert.equal(saved.characterSoul.characterId, "venance");
    const turn = saved.turn;
    const next = service.playHardcore({
      sessionId: run.session.id,
      userId: "v",
      expectedTurn: turn,
      action: "attack",
    });
    assert.equal(kit.frame(next.state).remaining, 2);
    const persisted = repo.getSession(run.session.id).state_json;
    assert.throws(
      () =>
        service.playHardcore({
          sessionId: run.session.id,
          userId: "v",
          expectedTurn: turn,
          action: "attack",
        }),
      /STALE/,
    );
    assert.equal(repo.getSession(run.session.id).state_json, persisted);
    repo.deleteSession(run.session.id);
  });

  test("Mage equipment, Forge and free-skill relic integrate with zero-damage preparation", () => {
    const s = fresh(6),
      forge = require("../src/hardcore/equipment/forge").prepare(s, "x");
    assert.equal(forge.boons[0].key, "ene");
    assert.equal(forge.boons[2].key, "resistance");
    const items = require("../src/hardcore/item").ITEMS_V3;
    for (const pool of Object.values(items))
      assert(pool.some((i) => i.affinity.classes.includes("venance")));
    const item = items.common.find((i) =>
      i.affinity.classes.includes("venance"),
    );
    s.items = [{ definition: item, level: 1 }];
    assert(
      require("../src/hardcore/equipment/affinityEffects").strength(s) > 0,
    );
    s.activeRelic = "astral_singularity";
    s.relics = [{ id: "astral_singularity" }];
    s.skillManaExtra = 2;
    assert.equal(core.skillManaCost(s), 0);
    const hp = s.encounter.hp;
    s.mana = 0;
    act(s, "skill");
    assert.equal(s.mana, 0);
    assert.equal(s.encounter.hp, hp);
    assert.equal(kit.frame(s).remaining, 3);
    const shrine = fresh();
    shrine.classShrine = { from: 1, until: 10, consumed: false };
    assert.equal(core.skillManaCost(shrine), 0);
    act(shrine, "skill");
    assert(shrine.classShrine.consumed);
    assert.equal(core.skillManaCost(shrine), 2);
  });
  test("A phase transition keeps the timer/S2 flag; revival does not reload the cast", () => {
    const s = fresh(6, true);
    s.bossRosterVersion = 2;
    s.floor = 999;
    s.encounter = require("../src/hardcore/engine/world").makeEnemy(
      s,
      "final_boss",
      null,
      rng,
      require("../src/hardcore/bosses/catalogV2").CATALOG.deimoss,
    );
    stats.addSource(s, { vit: 10000 });
    s.hp = s.maxHp;
    core.prepareItemCombat(s, rng);
    act(s, "skill");
    const f = kit.frame(s);
    f.hits = 2;
    const e = s.encounter;
    e.hp = 1;
    for (const unit of Object.values(e.boss.mechanicState.targets)) unit.hp = 0;
    e.boss.mechanicState.target = "boss";
    act(s, "attack");
    assert.equal(e.boss.phase, 2);
    assert.equal(f.remaining, 2);
    assert(f.firstBarrierUsed);
    assert(!s.lastLog.includes("Xung tinh giới"));
    assert.equal(e.hp, e.maxHp);
    s.hp = 0;
    s.reviveTickets = 1;
    const before = JSON.stringify(f);
    assert(core.reviveAfterDeath(s, session, rng, "death"));
    assert.equal(JSON.stringify(f), before);
    assert.equal(s.hp, Math.ceil(s.maxHp / 2));
  });

  function nextRoom(s) {
    s.phase = "encounter";
    s.encounter = require("../src/hardcore/engine/world").makeEnemy(
      s,
      "normal",
      null,
      rng,
    );
    Object.assign(s.encounter, {
      hp: 100000,
      maxHp: 100000,
      defense: 0,
      resistance: 0,
      evasion: 0,
      damageMin: 1,
      damageMax: 1,
    });
    core.prepareItemCombat(s, rng);
    return s.encounter;
  }
  test("Killing a room keeps the cast through events/checkpoints; third hit continues in the next combat", () => {
    const s = fresh(0, true);
    act(s, "skill");
    s.encounter.hp = 1;
    act(s, "attack");
    assert.equal(kit.frame(s).remaining, 2);
    assert.equal(kit.frame(s).hits, 1);
    assert(kit.empowered(s));
    const saved = JSON.parse(JSON.stringify(s));
    core.normalize(saved);
    assert.equal(kit.frame(saved).remaining, 2);
    s.phase = "encounter";
    s.encounter = { type: "empty", name: "Fixture" };
    const f = JSON.stringify(kit.frame(s));
    act(s, "next");
    assert.equal(JSON.stringify(kit.frame(s)), f);
    s.floor = 10;
    s.cleared = 9;
    s.phase = "encounter";
    s.encounter = { type: "empty", name: "Checkpoint approach" };
    act(s, "next");
    assert.equal(s.phase, "upgrade");
    assert.equal(kit.frame(s).remaining, 2);
    act(s, "upgrade_ene");
    assert.equal(kit.frame(s).remaining, 2);
    const e = nextRoom(s);
    let hp = e.hp;
    act(s, "attack");
    assert.equal(hp - e.hp, 220);
    assert.equal(kit.frame(s).hits, 2);
    assert.equal(kit.frame(s).remaining, 1);
    const before = JSON.stringify(s);
    assert.equal(core.attackDamagePreview(s).low, 297);
    assert.equal(JSON.stringify(s), before);
    hp = e.hp;
    act(s, "attack");
    assert.equal(hp - e.hp, 297);
    assert.equal(kit.frame(s).remaining, 0);
    assert.equal(kit.frame(s).hits, 3);
  });
  test("Ready sigil carries to another room; Barrier resets and S2 reloads only for the new combat", () => {
    const s = fresh(4, true);
    act(s, "skill");
    assert(kit.frame(s).firstBarrierUsed);
    s.encounter.hp = 1;
    act(s, "attack");
    assert(kit.frame(s).ready);
    assert.equal(kit.frame(s).barrier, 0);
    assert.equal(kit.frame(s).remaining, 2);
    nextRoom(s);
    assert(kit.frame(s).ready);
    assert.equal(kit.frame(s).barrier, 0);
    assert(!kit.frame(s).firstBarrierUsed);
    s.hp = 50;
    act(s, "defend");
    assert(!kit.frame(s).ready);
    assert(kit.frame(s).sigilUsed);
    assert.equal(kit.frame(s).remaining, 1);
    assert(s.lastLog.includes("Hồi lưu"));
    act(s, "skill");
    assert.equal(kit.frame(s).remaining, 3);
    assert.equal(kit.frame(s).hits, 0);
    assert(!kit.frame(s).sigilUsed);
    assert(kit.frame(s).firstBarrierUsed);
    assert(kit.frame(s).barrier > 0);
  });
  test("Old saved encounter frames migrate without reloading buff, sigil or S2; invalid run frames fail", () => {
    const s = fresh(6, true);
    act(s, "skill");
    act(s, "attack");
    const expected = structuredClone(kit.frame(s));
    s.encounter.venanceCombat = structuredClone(s.venanceState);
    delete s.venanceState;
    core.normalize(s);
    assert.deepEqual(s.venanceState, expected);
    assert.deepEqual(s.encounter.venanceCombat, { version: 2 });
    core.prepareItemCombat(s, rng);
    assert.deepEqual(kit.frame(s), expected);
    const bad = structuredClone(s);
    bad.venanceState.remaining = 4;
    assert.throws(() => core.normalize(bad), /INVALID_VENANCE_COMBAT/);
  });
  test("Real beta transaction persists remaining empowerment after a kill and a server-style resume", () => {
    const service = require("../src/hardcore"),
      repo = require("../src/hardcore/storage/sessions");
    const enemy = structuredClone(fresh().encounter);
    delete enemy.venanceCombat;
    enemy.hp = enemy.maxHp = 1;
    const run = service.startHardcore({
      guildId: "g",
      userId: "cross-room",
      channelId: "c",
      beta: true,
      forcedEncounter: enemy,
    });
    const cast = service.playHardcore({
      sessionId: run.session.id,
      userId: "cross-room",
      expectedTurn: 0,
      action: "skill",
    });
    assert.equal(kit.frame(cast.state).remaining, 3);
    const killed = service.playHardcore({
      sessionId: run.session.id,
      userId: "cross-room",
      expectedTurn: cast.state.turn,
      action: "attack",
    });
    assert(!killed.settled);
    assert.equal(kit.frame(killed.state).remaining, 2);
    assert.equal(kit.frame(killed.state).hits, 1);
    const saved = JSON.parse(repo.getSession(run.session.id).state_json);
    core.normalize(saved);
    assert.equal(kit.frame(saved).remaining, 2);
    assert.equal(kit.frame(saved).hits, 1);
    saved.encounter = { type: "empty", name: "Between rooms" };
    assert(
      require("../src/hardcore/ui")
        .embed(saved, "cross-room")
        .data.description.includes("Giữ qua phòng"),
    );
    service.playHardcore({
      sessionId: run.session.id,
      userId: "cross-room",
      expectedTurn: killed.state.turn,
      action: "beta_end",
    });
  });
  console.log(count + " Venance groups passed (no simulation).");
} finally {
  db.close();
}
