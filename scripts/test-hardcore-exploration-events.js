"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  world = require("../src/hardcore/engine/world"),
  marks = require("../src/hardcore/events/explorationMarks"),
  view = require("../src/hardcore/ui");
const session = {
    id: "marks",
    guild_id: "marks",
    user_id: "u",
    channel_id: "c",
  },
  rng = () => 0.99;
let groups = 0;
function test(name, fn) {
  fn();
  groups++;
  console.log("PASS " + name);
}
function fresh(floor = 6) {
  const s = stats.createState("sorceress", 10000);
  Object.assign(s, {
    floor,
    cleared: floor - 1,
    godRngesusEnabled: false,
    encounter: { type: "empty" },
    lastLog: "",
  });
  return s;
}
function trap(s, kind, good = false, lucky = false) {
  s.phase = "encounter";
  s.encounter = {
    type: "trap",
    kind,
    name: kind === "tax" ? "Tax Collector" : "The Thief",
    good,
    lucky,
  };
}
function healer(s, back = false) {
  s.phase = "encounter";
  s.encounter = {
    type: "surprise",
    kind: "healer",
    name: "Wandering Healer",
    healerReturn: back,
  };
}
function act(s, a) {
  core.act(s, session, a, rng);
}
function kill(s) {
  const e = s.encounter;
  e.hp = 1;
  e.defense = 0;
  e.resistance = 0;
  e.evasion = 0;
  s.mana = s.maxMana;
  core.act(s, session, "skill", () => 0.5);
  assert(e.defeatSettled);
}
function detail(s) {
  return JSON.stringify(
    view.privatePayload(s, session.id, "public", "encounter"),
  );
}
test("Lucky Break: linear scaling to 50% at 200 LUCK, with legacy isolation", () => {
  for (const [luck, chance] of [[-1, 0], [0, 0], [20, 0.05], [100, 0.25], [199, 0.4975], [200, 0.5], [400, 0.5]]) {
    const s = fresh(2);
    s.luck = luck;
    assert.equal(stats.luckyBreakChance(s), chance);
    for (const kind of ["tax", "potion_thief"]) {
      trap(s, kind);
      assert(detail(s).includes("200 LUCK"));
      assert(detail(s).includes("50%"));
    }
    for (const [roll, expected] of [[chance, false], [Math.max(0, chance - 0.00001), chance > 0]]) {
      s.encounter = { type: "empty" };
      const calls = [0.9, 0, roll, 0.5, 0.5];
      const e = core.generateEncounter(s, session, () => calls.shift() ?? 0.5);
      assert.equal(e.kind, "tax");
      assert.equal(e.lucky, expected, `LUCK ${luck}, roll ${roll}`);
    }
  }
  const old = fresh();
  old.luck = 20;
  old.gameplayVersion = 2;
  assert.equal(stats.luckyBreakChance(old), 0.3);
  old.gameplayVersion = 3;
  old.mode = "tower";
  assert.equal(stats.luckyBreakChance(old), 0.3);
});
test("Tax: current payout, Lucky Break and permanent outlaw", () => {
  const s = fresh();
  trap(s, "tax");
  const before = core.payout(s),
    rate = s.eventPayoutFactor;
  act(s, "next");
  assert.equal(s.payoutTaxSpent, Math.ceil(before * 0.15));
  assert.equal(s.eventPayoutFactor, rate);
  const lucky = fresh();
  trap(lucky, "tax", false, true);
  act(lucky, "next");
  assert.equal(lucky.payoutSpent, 0);
  const rebel = fresh();
  trap(rebel, "tax");
  act(rebel, "tax_resist");
  assert(marks.data(rebel).outlaw);
  assert.equal(rebel.payoutSpent, 0);
  assert.equal(marks.incoming(rebel, { rank: "boss" }), 1.2);
  assert.equal(marks.incoming(rebel, { rank: "final_boss" }), 1.2);
  assert.equal(marks.incoming(rebel, { rank: "elite" }), 1);
});
test("The Thief: locked coin/potion branches and Lucky Break", () => {
  const s = fresh();
  trap(s, "potion_thief", true);
  const before = core.payout(s),
    rate = s.eventPayoutFactor;
  act(s, "next");
  assert.equal(s.payoutEventSpent, Math.ceil(before * 0.1));
  assert.equal(s.eventPayoutFactor, rate);
  assert(s.lastLog.includes("payout"));
  for (const n of [0, 1, 5, 6]) {
    const x = fresh();
    x.potions = n;
    trap(x, "potion_thief", false);
    act(x, "next");
    assert.equal(x.potions, n - Math.ceil(n / 2));
    assert.equal(x.payoutSpent, 0);
  }
  const x = fresh();
  trap(x, "potion_thief", true, true);
  act(x, "next");
  assert.equal(x.payoutSpent, 0);
  assert.equal(x.potions, 3);
});
test("Thief Elite: same room, first turn, reward and free shops", () => {
  const s = fresh();
  trap(s, "potion_thief");
  const hp = s.hp;
  act(s, "thief_fight");
  assert.equal(s.floor, 6);
  assert.equal(s.hp, hp);
  assert.equal(s.encounter.rank, "elite");
  assert.equal(s.encounter.name, "The Thief");
  kill(s);
  assert(marks.data(s).underworld);
  assert(s.bonus >= 2000);
  assert.equal(marks.incoming(s, { rank: "elite" }), 1.3);
  assert.equal(marks.incoming(s, { rank: "boss" }), 1);
  for (const kind of ["merchant", "diamond_shop"]) {
    const x = fresh(106);
    marks.ensure(x).underworld = true;
    x.encounter = core.makeSurprise(x, () => 0.5, kind);
    assert(x.encounter.offers.every((o) => o.price === 0));
    const spent = x.payoutSpent;
    act(x, "buy_0");
    assert.equal(x.payoutSpent, spent);
    assert(x.lastLog.includes("miễn phí"));
    assert.equal(x.floor, 107);
    if (kind === "diamond_shop") assert.equal(x.shopCounts.diamond_shop, 1);
  }
});
test("Incoming damage and preview include rank mark", () => {
  const s = fresh();
  s.defense = 0;
  s.resistance = 0;
  s.evasion = 0;
  const e = {
    type: "combat",
    rank: "elite",
    damageMin: 100,
    damageMax: 100,
    accuracy: 1000,
    critChance: 0,
    damageType: "physical",
    nextDamageType: "physical",
  };
  s.encounter = e;
  const normal = core.attackDamage(e, s, s, () => 0.5, {
    raw: 100,
    critical: false,
  }).damage;
  marks.ensure(s).underworld = true;
  const boosted = core.attackDamage(e, s, s, () => 0.5, {
    raw: 100,
    critical: false,
  }).damage;
  assert.equal(boosted, Math.floor(normal * 1.3));
  assert.equal(core.incomingPreview(s).low, boosted);
});
test("Healer donation, checkpoint restriction and guaranteed return", () => {
  const s = fresh(5);
  healer(s);
  s.hp = 101;
  s.maxHp = Math.max(s.maxHp, 101);
  s.mana = 0;
  s.potions = 0;
  act(s, "event_healer_blood");
  assert.equal(s.hp, 30);
  assert.equal(s.potions, 2);
  assert.equal(s.phase, "upgrade");
  assert.equal(marks.data(s).vulnerable.due, 15);
  const copy = JSON.parse(JSON.stringify(s));
  core.normalize(copy);
  assert.deepEqual(copy.explorationMarks, s.explorationMarks);
  s.floor = 10;
  s.hp = 1;
  assert.equal(core.heal(s, s.maxHp, { checkpoint: true }), 0);
  assert.equal(s.hp, 1);
  assert(core.healEvent(s, s.maxHp * 0.3).hp > 0);
  s.cleared = 14;
  s.floor = 15;
  assert(!marks.healerDue(s));
  s.cleared = 15;
  s.floor = 16;
  assert(marks.healerDue(s));
  const returned = core.generateEncounter(s, session, rng);
  assert(returned.healerReturn);
  s.encounter = returned;
  s.phase = "encounter";
  s.hp = 1;
  s.mana = 0;
  const before = {
    str: s.str,
    dex: s.dex,
    vit: s.vit,
    ene: s.ene,
    luck: s.luck,
  };
  act(s, "event_healer_return");
  assert.equal(s.hp, s.maxHp);
  assert.equal(s.mana, s.maxMana);
  assert(marks.data(s).vitalBlessing);
  assert(!marks.data(s).vulnerable);
  for (const k of ["str", "dex", "vit", "ene"])
    assert.equal(s[k], before[k] + 10);
  assert.equal(s.luck, before.luck + 40);
  healer(s);
  assert(
    core.actions(s).find((a) => a.action === "event_healer_blood").disabled,
  );
});
test("Mimic identities and first kills activate double Blood Mimic chance", () => {
  const s = fresh();
  s.encounter = core.makeChest(s, () => 0.1);
  assert.equal(s.encounter.kind, "mimic");
  act(s, "open");
  assert.equal(s.floor, 6);
  assert.equal(s.encounter.name, "Mimic");
  assert.equal(s.encounter.rank, "mimic");
  kill(s);
  assert(marks.data(s).mimic);
  assert(!marks.boosted(s));
  s.phase = "encounter";
  s.encounter = world.makeEnemy(s, "ancient_mimic", null, () => 0.5);
  assert.equal(s.encounter.rank, "elite");
  assert.equal(s.encounter.name, "Ancient Mimic");
  kill(s);
  assert(marks.boosted(s));
  const base = fresh();
  const a = core.makeSurprise(base, () => 0.5, "fountain"),
    b = core.makeSurprise(s, () => 0.5, "fountain");
  assert(Math.abs(1 - b.goodThreshold - 2 * (1 - a.goodThreshold)) < 1e-10);
  assert(marks.fields(s).some((f) => f.name.includes("Mimic")));
});
test("Weighted event pool doubles only Blood Fountain and Mirror", () => {
  const s = fresh();
  Object.assign(marks.ensure(s), { mimic: true, ancientMimic: true });
  const pool = core.EVENTS.filter(
    (k) => !["blacksmith", "horadric", "purifier", "diamond_shop"].includes(k),
  ).flatMap((k) => Array(["fountain", "mirror"].includes(k) ? 2 : 1).fill(k));
  pool.forEach((k, i) => {
    let first = true;
    const e = core.makeSurprise(s, () => {
      if (first) {
        first = false;
        return (i + 0.5) / pool.length;
      }
      return 0.5;
    });
    assert.equal(e.kind, k);
  });
});
test("Removed encounters stay removed, including saved runs and Tower isolation", () => {
  const s = fresh(2);
  Object.assign(marks.ensure(s), { outlaw: true, underworld: true });
  const calls = [0.9, 0, 0.5, 0.5, 0.5, 0.5];
  const e = core.generateEncounter(s, session, () => calls.shift() ?? 0.5);
  assert.equal(e.kind, "portal");
  const tower = fresh();
  tower.mode = "tower";
  tower.explorationMarks = {
    version: 1,
    outlaw: true,
    underworld: true,
    vitalBlessing: true,
  };
  assert.equal(marks.incoming(tower, { rank: "boss" }), 1);
  assert.equal(marks.incoming(tower, { rank: "elite" }), 1);
  assert(!marks.freeMerchant(tower, "merchant"));
  assert.equal(marks.fields(tower).length, 0);
});
test("Event descriptions and Rift fields remain readable and fit Discord", () => {
  const s = fresh();
  trap(s, "tax");
  assert(detail(s).includes("Royal Outlaw"));
  trap(s, "potion_thief");
  assert(detail(s).includes("Underworld Lead"));
  healer(s);
  assert(detail(s).includes("Hiến máu"));
  Object.assign(marks.ensure(s), {
    outlaw: true,
    underworld: true,
    mimic: true,
    ancientMimic: true,
    vulnerable: { from: 6, due: 16 },
  });
  const payload = view.privatePayload(s, session.id, "public", "effects");
  for (const embed of payload.embeds) {
    const e = embed.toJSON();
    assert((e.fields || []).every((f) => f.value.length <= 1024));
    assert(!JSON.stringify(e).includes("undefined"));
  }
  assert(JSON.stringify(payload).includes("Vulnerable"));
});
db.close();
console.log(groups + " exploration-event groups passed");
