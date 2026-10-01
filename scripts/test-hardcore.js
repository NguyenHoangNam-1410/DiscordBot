const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "gamebot-hardcore-test-"),
);
process.env.DB_PATH = path.join(temporary, "test.sqlite");
const { db } = require("../src/db");
const hardcore = require("../src/services/hardcoreService");
const repository = require("../src/services/hardcoreRepository");
const equipment = require("../src/services/hardcoreEquipment");

function fixedRoll(value, work) {
  const original = crypto.randomInt;
  crypto.randomInt = (maximum) => Math.floor(maximum * value);
  try {
    return work();
  } finally {
    crypto.randomInt = original;
  }
}
function stateFor(classKey = "barbarian") {
  return {
    classKey,
    stake: 10,
    floor: 1,
    cleared: 0,
    hp: 500,
    maxHp: 500,
    damageMin: 100,
    damageMax: 100,
    accuracy: 100,
    evasion: 0,
    critChance: 0,
    defense: 0,
    resistance: 0,
    energy: 3,
    maxEnergy: 5,
    potions: 0,
    escapeTokens: 0,
    luck: 0,
    items: [],
    pityRare: 0,
    pityLegendary: 0,
    modifiers: {},
    bosses: 0,
    bonus: 0,
    payoutFactor: 1,
    turn: 0,
    phase: "encounter",
    completed: false,
    finalBossDefeated: false,
    encounter: {
      type: "combat",
      hp: 10000,
      maxHp: 10000,
      defense: 0,
      resistance: 0,
      accuracy: 100,
      evasion: 0,
      damageMin: 100,
      damageMax: 100,
      critChance: 0,
      magicChance: 0,
      rank: "normal",
    },
  };
}

assert.equal(Object.keys(hardcore.CLASSES).length, 7);
const startCommand = require("../src/commands/hardcore")
  .data.toJSON()
  .options.find((option) => option.name === "batdau");
assert.equal(
  startCommand.options?.length || 0,
  0,
  "Start opens the setup UI without required slash options",
);
assert.equal(hardcore.REGIONS.length, 8);
for (const region of hardcore.REGIONS) {
  assert.equal(hardcore.regionForFloor(region.start).name, region.name);
  assert.equal(hardcore.regionForFloor(region.end).name, region.name);
  if (region.end < 999)
    assert(
      hardcore.enemyScale(region.end + 1).hp >
        hardcore.enemyScale(region.end).hp,
    );
  const delta =
    hardcore.enemyScale(region.start + 2).hp -
    hardcore.enemyScale(region.start + 1).hp;
  assert(
    Math.abs(delta - region.hpSlope) < 1e-8,
    "Each stage must scale linearly",
  );
}
assert(
  hardcore.enemyScale(999).hp < 100,
  "Late floors must not use exponential scaling",
);
for (const [classKey, damage] of Object.entries({
  amazon: 170,
  assassin: 130,
  barbarian: 165,
  druid: 135,
  necromancer: 155,
  paladin: 140,
  sorceress: 210,
})) {
  const state = stateFor(classKey);
  state.hp = 400;
  const acted = fixedRoll(0, () => hardcore.playerAttack(state, "skill"));
  assert.equal(10000 - state.encounter.hp, damage, classKey);
  assert.equal(state.energy, 1);
  if (classKey === "druid") assert.equal(state.hp, 460);
  if (["assassin", "necromancer"].includes(classKey)) assert(acted.dodge);
  if (classKey === "paladin") assert(acted.defend);
}
const riftwalker = stateFor();
riftwalker.encounter.mechanic = "riftwalker";
fixedRoll(0, () => {
  const damage = [];
  for (let i = 0; i < 4; i++) {
    const before = riftwalker.encounter.hp;
    hardcore.playerAttack(riftwalker, "attack");
    damage.push(before - riftwalker.encounter.hp);
  }
  assert.deepEqual(damage, [0, 100, 100, 0]);
});
const deimoss = stateFor();
deimoss.encounter.mechanic = "deimoss";
fixedRoll(0, () => hardcore.playerAttack(deimoss, "attack"));
assert.equal(deimoss.encounter.hp, 9925);
const butcher = stateFor();
butcher.hp = butcher.maxHp = 10000;
butcher.encounter.mechanic = "butcher";
fixedRoll(0, () => {
  const damage = [];
  for (let i = 0; i < 6; i++) {
    const before = butcher.hp;
    hardcore.enemyTurn(butcher);
    damage.push(before - butcher.hp);
  }
  assert.deepEqual(damage, [108, 115, 124, 132, 140, 140]);
});
const lucion = stateFor();
lucion.encounter.mechanic = "lucion";
lucion.encounter.hp = 500;
lucion.encounter.maxHp = 1000;
fixedRoll(0, () => hardcore.enemyTurn(lucion));
assert.equal(lucion.encounter.hp, 535);
const cursed = stateFor();
cursed.resistance = 20;
cursed.encounter.magicChance = 1;
cursed.modifiers = { cursed_ground: 3, soul_drain: 3 };
fixedRoll(0, () => hardcore.enemyTurn(cursed));
assert.equal(cursed.hp, 420);
assert.equal(cursed.resistance, 14);
assert.equal(cursed.energy, 1);
const blood = stateFor();
blood.encounter.hp = 1;
blood.modifiers.bloodlust = 1;
fixedRoll(0, () => hardcore.enemyTurn(blood));
assert.equal(blood.hp, 392);
const stacks = {
  fortified: 2,
  stone_skin: 2,
  elemental_dominion: 2,
  swift_horror: 2,
};
const normal = fixedRoll(0, () => hardcore.makeEnemy(10));
const fortified = fixedRoll(0, () =>
  hardcore.makeEnemy(10, "normal", null, stacks),
);
assert(
  fortified.maxHp > normal.maxHp &&
    fortified.defense > normal.defense &&
    fortified.damageMax > normal.damageMax,
);
assert(
  fortified.accuracy > normal.accuracy && fortified.evasion > normal.evasion,
);
assert.deepEqual(
  [5, 100, 400, 700].map((floor) => hardcore.checkpointGrowth(floor)),
  [
    { hp: 6, attack: 1 },
    { hp: 10, attack: 2 },
    { hp: 14, attack: 3 },
    { hp: 30, attack: 6 },
  ],
);
const checkpoint = stateFor();
checkpoint.floor = 5;
checkpoint.encounter = { type: "empty" };
fixedRoll(0, () => hardcore.completeFloor(checkpoint, "test"));
assert.equal(checkpoint.phase, "upgrade");
assert.equal(checkpoint.maxHp, 506);
assert.equal(checkpoint.bosses, 0);
const modifiers = stateFor();
fixedRoll(0, () => {
  for (let floor = 10; floor <= 90; floor += 10) {
    modifiers.floor = floor;
    modifiers.encounter = { type: "empty" };
    hardcore.completeFloor(modifiers, "test");
  }
});
assert.equal(Object.keys(modifiers.modifiers).length, 8);
assert.equal(
  Object.values(modifiers.modifiers).reduce((a, b) => a + b, 0),
  9,
);
for (let floor = 50; floor <= 250; floor += 50) {
  const state = stateFor();
  state.floor = floor;
  assert.equal(hardcore.generateEncounter(state).rank, "boss");
}
assert.deepEqual(
  [50, 100, 150, 200, 250].map(
    (floor) => hardcore.makeEnemy(floor, "boss").mechanic,
  ),
  ["butcher", "riftwalker", "assur", "lucion", "deimoss"],
);
const notBoss = stateFor();
notBoss.floor = 5;
assert.notEqual(
  fixedRoll(0.99, () => hardcore.generateEncounter(notBoss)).rank,
  "boss",
);
const final = stateFor();
final.floor = 999;
final.cleared = 998;
final.encounter = hardcore.generateEncounter(final);
assert.equal(final.encounter.name, "Deimoss the Fleshweaver");
assert.equal(final.encounter.rank, "final_boss");
assert.throws(
  () => hardcore.completeFloor(final, "bypass"),
  /FINAL_BOSS_REQUIRED/,
);
final.finalBossDefeated = true;
hardcore.completeFloor(final, "victory");
assert.equal(final.phase, "summit");
assert.equal(final.cleared, 999);
const completed = stateFor();
completed.floor = 100;
completed.encounter = { type: "empty" };
fixedRoll(0, () => hardcore.completeFloor(completed, "completed"));
assert(completed.completed);
assert.equal(
  hardcore.baseMultiplier({ cleared: 999, bosses: 19 }),
  hardcore.baseMultiplier({ cleared: 100, bosses: 2 }),
);
assert.equal(
  hardcore.potentialPayout({
    ...stateFor(),
    cleared: 999,
    bosses: 19,
    bonus: 100_000_000,
  }),
  10_000_000,
);
const pity = stateFor();
pity.pityRare = 5;
assert.equal(fixedRoll(0.99, () => hardcore.makeChest(pity)).kind, "rare");
assert.equal(
  fixedRoll(0, () => hardcore.makeChest(pity)).kind,
  "legendary",
  "Pity must still allow SSR and bypass Mimic",
);
assert.equal(
  fixedRoll(0.13, () => hardcore.chooseRarity(stateFor())),
  "rare",
  "Base SR interval is 22%",
);
const pitySsr = stateFor();
pitySsr.pityLegendary = 10;
assert.equal(
  fixedRoll(0.11, () => hardcore.chooseRarity(pitySsr)),
  "legendary",
);
const converted = equipment.convertMedianItem(
  {
    id: 1,
    name: "Test SU",
    base_item: "Sacred Sword",
    type: "SU",
    stats: ["+100% Enhanced Damage", "+20% All Resistances", "+100 to Life"],
  },
  "cursed",
);
assert.equal(converted.attack, 3);
assert.equal(converted.resistance, 6);
assert.equal(converted.maxHp, 15);
assert.equal(converted.bonusPenalty, 0.15);
const actualSchema = equipment.convertMedianItem(
  {
    name: "Median weapon",
    base_type: "Short Sword",
    type_code: "TU",
    tier_or_variant: "Tier 4",
    stats_json: JSON.stringify([
      "Required Strength: 999",
      "Strength Damage Bonus: (0.11 per Strength)%",
      "+100% Enhanced Damage",
      "Poison Resist +(10 to 20)%",
      "-50% to Enemy Fire Resistance",
      "20% Life stolen per Hit",
    ]),
  },
  "common",
);
assert.equal(actualSchema.attack, 3);
assert.equal(actualSchema.resistance, 5);
assert(!actualSchema.maxHp);
assert.equal(actualSchema.base, "Short Sword");
assert.equal(actualSchema.source, "TU");
const gear = stateFor();
hardcore.applyItem(gear, converted, "cursed");
hardcore.applyItem(gear, converted, "cursed");
assert.equal(gear.items[0].level, 2);
assert.equal(gear.items[0].definition.base, "Sacred Sword");
assert.equal(gear.damageMin, 106);
assert(Math.abs(gear.payoutFactor - 0.85 ** 2) < 1e-8);
hardcore.applyItem(gear, { ...converted, bonusPenalty: 0 }, "legendary");
assert.equal(
  gear.items.length,
  2,
  "Cursed and normal SU must preserve separate effect levels",
);
const medianPath = path.join(temporary, "median.sqlite");
const median = new (require("better-sqlite3"))(medianPath);
median.exec(
  "CREATE TABLE items (id INTEGER, name TEXT, base_item TEXT, type TEXT, stats TEXT)",
);
for (const type of ["TU", "RW", "SU", "Set"])
  median
    .prepare("INSERT INTO items VALUES (?,?,?,?,?)")
    .run(type.length, `${type} test`, "Sword", type, "+50% Enhanced Damage");
median.close();
const catalog = equipment.loadMedianEquipment(hardcore.ITEMS, medianPath);
assert.equal(catalog.common[0].source, "TU");
assert.equal(catalog.rare[0].source, "RW");
assert.equal(catalog.legendary.length, 2);
assert.equal(catalog.cursed.length, 1);
const started = hardcore.startHardcore({
  guildId: "test-hardcore",
  userId: "player",
  channelId: "c",
  stake: 10,
  classKey: "necromancer",
  forcedEncounter: { type: "rngesus" },
});
assert.throws(
  () =>
    hardcore.playHardcore({
      sessionId: started.session.id,
      userId: "player",
      expectedTurn: 0,
      action: "retreat",
    }),
  /CANNOT_RETREAT/,
);
assert.equal(
  repository.parseState(repository.getSession(started.session.id)).turn,
  0,
);
const saved = {
  ...stateFor(),
  floor: 999,
  cleared: 998,
  damageMin: 1_000_000,
  damageMax: 1_000_000,
  hp: 1_000_000,
  maxHp: 1_000_000,
  modifiers: { stone_skin: 1 },
};
saved.encounter = hardcore.generateEncounter(saved);
repository.saveState(started.session, saved);
assert.deepEqual(
  hardcore.getHardcoreRun("test-hardcore", "player").state.encounter,
  saved.encounter,
);
let played;
for (let i = 0; i < 20; i++) {
  const run = hardcore.getHardcoreRun("test-hardcore", "player");
  played = hardcore.playHardcore({
    sessionId: started.session.id,
    userId: "player",
    expectedTurn: run.state.turn,
    action: "attack",
  });
  if (played.state.phase === "summit") break;
}
assert(played.state.finalBossDefeated && played.state.cleared === 999);
hardcore.playHardcore({
  sessionId: started.session.id,
  userId: "player",
  expectedTurn: played.state.turn,
  action: "retreat",
});
assert.equal(
  hardcore.getHardcoreRecord("test-hardcore", "player").best_floor,
  999,
);
const largeUi = stateFor();
largeUi.modifiers = Object.fromEntries(
  Object.keys(hardcore.RIFT_MODIFIERS).map((key) => [key, 12]),
);
largeUi.items = Array.from({ length: 150 }, (_, index) => ({
  name: `Trang bị ${index}`,
  rarity: "legendary",
  level: 1,
  definition: converted,
}));
const embed = hardcore.hardcoreEmbed(largeUi, "player").toJSON();
assert(embed.fields.length <= 25);
const embedLength = [
  embed.title,
  embed.description,
  embed.footer?.text,
  ...embed.fields.flatMap((field) => [field.name, field.value]),
]
  .filter(Boolean)
  .join("").length;
assert(embedLength <= 6000);
const idle = hardcore.startHardcore({
  guildId: "idle-hardcore",
  userId: "player",
  channelId: "c",
  stake: 10,
  classKey: "druid",
  forcedEncounter: { type: "empty" },
});
hardcore.setMessageId(idle.session.id, "latest");
const stale = require("../src/services/staleSessionService");
assert.equal(
  stale.expireStaleSoloSessionsSync(
    Date.now() + stale.SOLO_SESSION_TTL_MS + 1000,
  ).length,
  0,
);
const expired = stale.expireStaleSoloSessionsSync(
  Date.now() + 7 * 24 * 60 * 60_000 + 1000,
);
assert.equal(expired.length, 1);
assert(expired[0].forfeit);
assert.equal(hardcore.getHardcoreByUser("idle-hardcore", "player"), null);
function withAuditRun(userId, patch, work) {
  const started = hardcore.startHardcore({
    guildId: "audit-hardcore",
    userId,
    channelId: "c",
    stake: 100,
    classKey: "barbarian",
    forcedEncounter: { type: "empty" },
  });
  repository.saveState(started.session, {
    ...started.state,
    floor: 2,
    cleared: 1,
    ...patch,
  });
  const act = (action) =>
    hardcore.playHardcore({
      sessionId: started.session.id,
      userId,
      expectedTurn: hardcore.getHardcoreRun("audit-hardcore", userId).state
        .turn,
      action,
    });
  try {
    work(started, act);
  } finally {
    if (repository.getSession(started.session.id))
      hardcore.forceEndHardcoreSession(
        started.session.id,
        "audit-hardcore",
        "test",
        { forfeit: true },
      );
  }
}

function auditMechanics() {
  assert.deepEqual(
    [4, 5, 10, 20].map(hardcore.rngesusChance),
    [0, 0.003, 0.006, 0.01],
  );
  const chaos = { ...stateFor(), floor: 20, rngesusDry: 1000 };
  assert(
    hardcore.rollRngesus(chaos, {
      volatilityRoll: 1,
      spikeRoll: 0,
      severityRoll: 1,
      encounterRoll: 0,
    }),
  );
  assert.equal(chaos.lastChaosChance, 0.12);
  assert.equal(chaos.rngesusDry, 0);
  assert(
    !hardcore.rollRngesus(chaos, {
      volatilityRoll: 1,
      spikeRoll: 0,
      severityRoll: 1,
      encounterRoll: 0.12,
    }),
  );
  for (const floor of [5, 100, 400, 700]) {
    const checkpoint = stateFor();
    checkpoint.floor = floor;
    checkpoint.potions = 4;
    checkpoint.encounter = { type: "empty" };
    const growth = hardcore.checkpointGrowth(floor);
    fixedRoll(0, () => hardcore.completeFloor(checkpoint, "checkpoint"));
    assert.equal(checkpoint.maxHp, 500 + growth.hp);
    assert.equal(checkpoint.hp, checkpoint.maxHp);
    assert.equal(checkpoint.damageMin, 100 + growth.attack);
    assert.equal(checkpoint.potions, 5);
    assert.equal(checkpoint.phase, "upgrade");
    assert.match(checkpoint.lastLog, /4 → 5/);
  }
  const maximumUi = {
    ...structuredClone(largeUi),
    lastLog: "Diễn biến ".repeat(200),
    payoutSpent: 100,
    payoutServiceSpent: 50,
  };
  for (const classKey of Object.keys(hardcore.CLASSES)) {
    maximumUi.classKey = classKey;
    const value = hardcore
      .hardcoreEmbed(
        maximumUi,
        "player",
        { reason: "cashout", outcome: "win", payout: 1000, balance: 1000 },
        "session",
      )
      .toJSON();
    assert(value.fields.every((field) => field.value.length <= 1024));
    assert(
      [
        value.title,
        value.description,
        ...value.fields.flatMap((field) => [field.name, field.value]),
      ]
        .filter(Boolean)
        .join("").length <= 6000,
    );
  }
  assert.equal(hardcore.hitChance(-1000, 1000), 0.2);
  assert.equal(hardcore.hitChance(1000, -1000), 0.95);
  assert(hardcore.defenseReduction(1_000_000, 1) <= 0.75);
  assert.equal(hardcore.magicAfterResistance(100, 1000), 25);
  assert.equal(hardcore.magicAfterResistance(100, -1000), 150);
  for (const type of ["physical", "magic"]) {
    const normal = stateFor();
    normal.encounter.damageType = type;
    const guarded = structuredClone(normal);
    fixedRoll(0, () => hardcore.enemyTurn(normal));
    fixedRoll(0, () => hardcore.enemyTurn(guarded, true));
    assert.equal(500 - guarded.hp, Math.floor((500 - normal.hp) / 2));
  }
  for (const [index, type] of [
    "physical",
    "magic",
    "physical",
    "magic",
    "magic",
  ].entries()) {
    const enemy = hardcore.makeEnemy((index + 1) * 50, "boss", null, {
      elemental_dominion: 50,
    });
    assert.equal(hardcore.enemyDamageType(enemy), type);
    assert.equal(enemy.magicChance, type === "magic" ? 1 : 0);
    const state = stateFor();
    state.resistance = 75;
    state.encounter = {
      ...state.encounter,
      mechanic: enemy.mechanic,
      magicChance: type === "magic" ? 0 : 1,
    };
    fixedRoll(0, () => hardcore.enemyTurn(state));
    assert.equal(
      500 - state.hp,
      type === "magic" ? 25 : index === 0 ? 108 : 100,
      "Boss type must override old magicChance",
    );
  }
  const treasure = stateFor();
  assert.equal(
    fixedRoll(0.36, () => hardcore.makeChest(treasure, true)).kind,
    "rare",
  );
  treasure.luck = 10;
  assert.equal(
    fixedRoll(0.36, () => hardcore.makeChest(treasure, true)).kind,
    "legendary",
  );
  treasure.luck = 0;
  treasure.pityLegendary = 10;
  assert.equal(
    fixedRoll(0.36, () => hardcore.makeChest(treasure, true)).kind,
    "legendary",
  );
  assert.equal(
    hardcore.legendaryChance({ ...treasure, pityLegendary: 1000 }),
    0.35,
  );
  assert.equal(
    hardcore.legendaryChance({ ...treasure, pityLegendary: 1000 }, true),
    0.6,
  );
  const rates = {};
  for (let i = 0; i < 1000; i++) {
    const encounter = fixedRoll((i + 0.5) / 1000, () =>
      hardcore.generateEncounter(stateFor()),
    );
    const type = encounter.type === "combat" ? encounter.rank : encounter.type;
    rates[type] = (rates[type] || 0) + 1;
  }
  assert.deepEqual(rates, {
    normal: 470,
    elite: 120,
    chest: 150,
    shrine: 80,
    trap: 60,
    surprise: 60,
    blacksmith: 30,
    cleanse: 20,
    empty: 10,
  });
  const account = require("../src/services/economyService").getAccount;
  const smithItem = {
    name: "Audit blade",
    base: "Sword",
    attack: 5,
    text: "+5 sát thương",
  };
  withAuditRun(
    "forge",
    {
      encounter: { type: "blacksmith" },
      items: [
        {
          name: smithItem.name,
          rarity: "rare",
          level: 1,
          definition: smithItem,
        },
      ],
    },
    (started, act) => {
      const before = hardcore.getHardcoreRun("audit-hardcore", "forge").state;
      const balance = account("audit-hardcore", "forge").balance;
      const after = act("forge").state;
      assert.equal(after.items[0].level, 2);
      assert.equal(after.damageMin, before.damageMin + 5);
      assert.equal(
        after.payoutSpent,
        hardcore.serviceCost(before, "blacksmith"),
      );
      assert.equal(after.payoutServiceSpent, after.payoutSpent);
      assert.equal(account("audit-hardcore", "forge").balance, balance);
      assert.equal(
        hardcore.potentialPayout(after),
        hardcore.potentialPayout(before) - after.payoutSpent + 6,
      );
      assert.throws(
        () =>
          hardcore.playHardcore({
            sessionId: started.session.id,
            userId: "forge",
            expectedTurn: 0,
            action: "forge",
          }),
        /STALE_ACTION/,
      );
    },
  );
  withAuditRun(
    "forge-poor",
    {
      cleared: 0,
      encounter: { type: "blacksmith" },
      items: [
        {
          name: smithItem.name,
          rarity: "rare",
          level: 1,
          definition: smithItem,
        },
      ],
    },
    (started, act) => {
      const raw = repository.getSession(started.session.id).state_json;
      assert.throws(() => act("forge"), /INSUFFICIENT_RUN_PAYOUT/);
      assert.equal(repository.getSession(started.session.id).state_json, raw);
      const button = hardcore
        .hardcoreRows(
          started.session.id,
          hardcore.getHardcoreRun("audit-hardcore", "forge-poor").state,
        )[0]
        .toJSON().components[0];
      assert(button.disabled);
      assert.equal(act("ignore").state.cleared, 2);
    },
  );
  withAuditRun(
    "cleanse",
    {
      bonus: 1000,
      payoutFactor: 0.85 ** 2,
      encounter: { type: "cleanse" },
      items: [
        {
          name: "Audit curse",
          rarity: "cursed",
          level: 2,
          definition: { name: "Audit curse", attack: 5, bonusPenalty: 0.15 },
        },
      ],
    },
    (started, act) => {
      const balance = account("audit-hardcore", "cleanse").balance;
      const after = act("cleanse").state;
      assert.equal(after.items[0].cleansedLevels, 1);
      assert.equal(after.items[0].level, 2);
      assert.equal(after.payoutFactor, 0.85);
      assert.equal(after.damageMin, hardcore.CLASSES.barbarian.damageMin);
      assert.equal(account("audit-hardcore", "cleanse").balance, balance);
      hardcore.applyItem(after, after.items[0].definition, "cursed");
      assert.equal(after.items[0].cleansedLevels, 1);
      assert.equal(after.items[0].level, 3);
      assert(Math.abs(after.payoutFactor - 0.85 ** 2) < 1e-8);
    },
  );
  for (const [userId, encounter, action, rate] of [
    ["tax", { type: "trap", kind: "tax_collector" }, "continue", 0.15],
    ["bribe", { type: "rngesus", fleeChance: 0.75 }, "bribe", 0.4],
  ])
    withAuditRun(
      userId,
      { payoutSpent: 80, payoutServiceSpent: 80, encounter },
      (started, act) => {
        const before = hardcore.getHardcoreRun("audit-hardcore", userId).state;
        const available = hardcore.potentialPayout(before);
        const balance = account("audit-hardcore", userId).balance;
        const after = act(action).state;
        const cost = available - Math.floor(available * (1 - rate));
        assert.equal(after.payoutSpent, 80 + cost);
        assert.equal(after.payoutFactor, 1);
        assert.equal(after.payoutServiceSpent, 80);
        assert.equal(hardcore.potentialPayout(after), available - cost + 6);
        assert.equal(account("audit-hardcore", userId).balance, balance);
      },
    );
  for (const [userId, fleeRoll, tickets, expected] of [
    ["flee-success", 0.749999, 2, 2],
    ["flee-ticket", 0.75, 2, 1],
  ]) {
    withAuditRun(
      userId,
      {
        escapeTokens: tickets,
        encounter: { type: "rngesus", fleeChance: 0.75, fleeRoll },
      },
      (started, act) => {
        assert.throws(() => act("escape_token"), /INVALID_ACTION/);
        const rows = hardcore
          .hardcoreRows(
            started.session.id,
            hardcore.getHardcoreRun("audit-hardcore", userId).state,
          )[0]
          .toJSON().components;
        assert.equal(rows.length, 4);
        assert(!rows.some((row) => /escape_token|retreat/.test(row.custom_id)));
        const after = act("flee");
        assert(!after.settled);
        assert.equal(after.state.escapeTokens, expected);
        assert.equal(after.state.cleared, 2);
      },
    );
  }
  withAuditRun(
    "flee-death",
    { encounter: { type: "rngesus", fleeChance: 0.75, fleeRoll: 0.75 } },
    (started, act) => {
      const result = act("flee");
      assert(result.settled);
      assert.equal(result.result.payout, 0);
      assert.equal(
        hardcore.getHardcoreRecord("audit-hardcore", "flee-death").deaths,
        1,
      );
    },
  );
  withAuditRun(
    "prayer",
    {
      pityRare: 5,
      pityLegendary: 10,
      encounter: { type: "rngesus", fleeChance: 0.75, prayerSuccess: true },
    },
    (started, act) => {
      const after = act("pray").state;
      assert.equal(after.items[0].rarity, "legendary");
      assert.equal(after.pityRare, 5);
      assert.equal(after.pityLegendary, 10, "Only opened chests advance pity");
    },
  );
  for (const kind of ["healing", "escape_ticket", "cache", "ambush"])
    withAuditRun(
      `surprise-${kind}`,
      {
        hp: 60,
        encounter: {
          type: "surprise",
          kind,
          enemy: hardcore.makeEnemy(2, "champion"),
        },
      },
      (started, act) => {
        const after = act("explore").state;
        if (kind === "healing") {
          assert(after.hp > 60);
          assert.equal(after.potions, 4);
        }
        if (kind === "escape_ticket") assert.equal(after.escapeTokens, 1);
        if (kind === "cache") assert.equal(after.bonus, 50);
        if (kind === "ambush") {
          assert.equal(after.encounter.type, "combat");
          assert.equal(after.encounter.attacks, 1);
          assert.equal(after.cleared, 1);
        } else assert.equal(after.cleared, 2);
      },
    );
  withAuditRun(
    "progress",
    { floor: 101, cleared: 100, completed: true },
    (started, act) => {
      assert.equal(
        hardcore.getHardcoreRecord("audit-hardcore", "progress").completions,
        1,
      );
      assert.equal(
        hardcore.getHardcoreRecord("audit-hardcore", "progress").runs,
        1,
      );
      assert.equal(
        hardcore
          .getHardcoreTop("audit-hardcore")
          .find((entry) => entry.user_id === "progress").best_floor,
        100,
      );
      act("retreat");
      assert.equal(
        hardcore.getHardcoreRecord("audit-hardcore", "progress").completions,
        1,
      );
      assert.equal(
        hardcore.getHardcoreRecord("audit-hardcore", "progress").runs,
        1,
      );
    },
  );
  withAuditRun(
    "legacy-penalties",
    {
      payoutPenaltyVersion: undefined,
      payoutFactor: 0.85 * 0.6,
      bonus: 500,
      items: [
        {
          name: "Legacy curse",
          rarity: "cursed",
          level: 1,
          definition: { name: "Legacy curse", bonusPenalty: 0.15 },
        },
      ],
    },
    (started, act) => {
      const raw = repository.parseState(
        repository.getSession(started.session.id),
      );
      const expected = hardcore.potentialPayout(raw);
      const migrated = hardcore.getHardcoreRun(
        "audit-hardcore",
        "legacy-penalties",
      ).state;
      assert.equal(
        hardcore.potentialPayout(migrated),
        expected,
        "Migration must preserve the available payout",
      );
      assert.equal(migrated.payoutFactor, 0.85);
      assert.equal(migrated.payoutServiceSpent, 0);
      const later = { ...migrated, bonus: migrated.bonus + 100 };
      assert.equal(
        hardcore.potentialPayout(later) - expected,
        85,
        "Past bribes must not tax future bonuses",
      );
    },
  );
  withAuditRun(
    "summit",
    {
      floor: 999,
      cleared: 999,
      completed: true,
      finalBossDefeated: true,
      phase: "summit",
      encounter: { type: "summit" },
    },
    (started, act) => {
      assert.throws(() => act("attack"), /INVALID_ACTION/);
      assert.equal(act("retreat").result.reason, "summit");
      assert.equal(
        hardcore.getHardcoreRecord("audit-hardcore", "summit").escapes,
        1,
      );
    },
  );
}

async function auditSetup() {
  const guildId = "audit-setup";
  const userId = "setup-player";
  const channelId = "c";
  require("../src/services/gameChannelService").setGameChannel(
    guildId,
    "hardcore",
    channelId,
  );
  const account = require("../src/services/economyService").getAccount;
  const balance = account(guildId, userId).balance;
  const edits = [];
  const warnings = [];
  const sent = [];
  const origin = {
    guildId,
    channelId,
    user: { id: userId },
    reply: async (payload) => ({ resource: { message: { id: "setup-ui" } } }),
    editReply: async (payload) => edits.push(payload),
  };
  let draft = await require("../src/commands/choi").execute({
    ...origin,
    options: {
      getSubcommandGroup: () => "sinhton",
      getSubcommand: () => "batdau",
      getInteger: () => null,
      getString: () => null,
    },
  });
  assert.equal(account(guildId, userId).balance, balance);
  assert.equal(hardcore.getHardcoreRun(guildId, userId), null);
  const ui = require("../src/services/hardcoreView");
  function component(action, options = {}) {
    return {
      guildId,
      channelId,
      user: { id: userId },
      message: { id: "setup-ui" },
      customId: `${options.modal ? "hardcore-setup-modal" : "hardcore-setup"}:${draft.id}:${draft.version}:${action}`,
      values: options.values,
      fields: { getTextInputValue: () => options.amount },
      deferUpdate: async function () {
        this.deferred = true;
      },
      editReply: async (payload) => edits.push(payload),
      update: async (payload) => edits.push(payload),
      followUp: async (payload) => warnings.push(payload),
      reply: async (payload) => warnings.push(payload),
      channel: {
        send: async (payload) => {
          sent.push(payload);
          return {
            id: "new-run",
            url: "https://discord.com/channels/g/c/new-run",
          };
        },
      },
    };
  }
  for (const classKey of Object.keys(hardcore.CLASSES)) {
    await hardcore.handleHardcoreSetup(
      component("class", { values: [classKey] }),
    );
    const payload = edits.at(-1);
    const embed = payload.embeds[0].toJSON();
    assert.equal(
      embed.fields.find((field) => field.name === "❤️ HP").value,
      String(hardcore.CLASSES[classKey].hp),
    );
    assert(
      embed.fields.some((field) =>
        field.name.includes(hardcore.CLASSES[classKey].skill),
      ),
    );
    assert.equal(
      payload.components[0].toJSON().components[0].options.length,
      7,
    );
    assert(
      payload.components[1]
        .toJSON()
        .components.find((button) => button.label === "Bắt đầu").disabled,
    );
  }
  for (const amount of ["100001", "1e2", String(balance + 1)]) {
    await hardcore.handleHardcoreSetup(
      component("bet", { modal: true, amount }),
    );
    assert.equal(draft.stake, null);
    assert.equal(account(guildId, userId).balance, balance);
    assert(!edits.at(-1).components[1].toJSON().components[0].disabled);
  }
  await hardcore.handleHardcoreSetup(
    component("bet", { modal: true, amount: "100" }),
  );
  require("../src/services/gameBetLimitService").setGameBetLimit(
    guildId,
    "hardcore",
    50,
  );
  await hardcore.handleHardcoreSetup(component("start"));
  assert.equal(hardcore.getHardcoreRun(guildId, userId), null);
  assert.equal(account(guildId, userId).balance, balance);
  assert(
    edits
      .at(-1)
      .components[1].toJSON()
      .components.find((button) => button.label === "Bắt đầu").disabled,
  );
  await hardcore.handleHardcoreSetup(
    component("bet", { modal: true, amount: "25" }),
  );
  const other = component("class", { values: ["amazon"] });
  other.user.id = "intruder";
  const chosen = draft.classKey;
  await hardcore.handleHardcoreSetup(other);
  assert.equal(draft.classKey, chosen);
  const start = component("start");
  const duplicate = component("start");
  await Promise.all([
    hardcore.handleHardcoreSetup(start),
    hardcore.handleHardcoreSetup(duplicate),
  ]);
  assert.equal(sent.length, 1);
  assert.equal(account(guildId, userId).balance, balance - 25);
  const run = hardcore.getHardcoreRun(guildId, userId);
  assert.equal(run.session.message_id, "new-run");
  assert(edits.some((payload) => payload.components?.length === 0));
  hardcore.forceEndHardcoreSession(run.session.id, guildId, "test");
  assert.equal(account(guildId, userId).balance, balance);
  draft = await hardcore.openHardcoreSetup(origin, {
    stake: 25,
    classKey: "amazon",
  });
  const fail = component("start");
  fail.channel.send = async () => {
    throw new Error("Discord unavailable");
  };
  await hardcore.handleHardcoreSetup(fail, { warn: () => {} });
  assert.equal(account(guildId, userId).balance, balance);
  assert.equal(hardcore.getHardcoreRun(guildId, userId), null);
  assert(edits.at(-1).components.length > 0);
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 6 * 60_000;
    await hardcore.handleHardcoreSetup(component("cancel"));
  } finally {
    Date.now = originalNow;
  }
  assert.equal(account(guildId, userId).balance, balance);
  assert.equal(edits.at(-1).components.length, 0);
  assert.equal(
    ui.hardcoreSetupPayload(
      { id: "preview", version: 0, classKey: null, stake: null },
      hardcore.CLASSES,
      { balance, maxBet: 50 },
    ).components.length,
    2,
  );
  const orphan = hardcore.startHardcore({
    guildId: "audit-timeout",
    userId: "orphan",
    channelId,
    stake: 100,
    classKey: "amazon",
  });
  const orphanBalance = account("audit-timeout", "orphan").balance;
  db.prepare("UPDATE hardcore_sessions SET updated_at=? WHERE id=?").run(
    Date.now() - 8 * 24 * 60 * 60_000,
    orphan.session.id,
  );
  assert.equal(hardcore.cleanupStaleHardcoreSessions(), 1);
  assert.equal(account("audit-timeout", "orphan").balance, orphanBalance + 100);
  const timeout = hardcore.startHardcore({
    guildId: "audit-timeout",
    userId: "timeout",
    channelId,
    stake: 100,
    classKey: "amazon",
  });
  hardcore.setMessageId(timeout.session.id, "timeout-ui");
  const timeoutBalance = account("audit-timeout", "timeout").balance;
  const timeoutEdits = [];
  const client = {
    channels: {
      fetch: async () => ({
        isTextBased: () => true,
        messages: {
          fetch: async () => ({
            edit: async (payload) => timeoutEdits.push(payload),
          }),
        },
      }),
    },
  };
  assert.equal(
    await stale.expireStaleSoloSessions(
      client,
      console,
      Date.now() + 8 * 24 * 60 * 60_000,
    ),
    1,
  );
  assert.equal(account("audit-timeout", "timeout").balance, timeoutBalance);
  assert.deepEqual(timeoutEdits[0].components, []);
}

async function finishChecks() {
  auditMechanics();
  await auditSetup();
  require("../src/services/gameChannelService").setGameChannel(
    "resume-hardcore",
    "hardcore",
    "c",
  );
  const resume = hardcore.startHardcore({
    guildId: "resume-hardcore",
    userId: "player",
    channelId: "c",
    stake: 10,
    classKey: "amazon",
    forcedEncounter: { type: "empty" },
  });
  hardcore.setMessageId(resume.session.id, "old");
  const previousState = repository.getSession(resume.session.id).state_json;
  const edits = [];
  const messages = [];
  const replies = [];
  await require("../src/commands/hardcore").execute({
    guildId: "resume-hardcore",
    channelId: "c",
    user: { id: "player" },
    options: { getSubcommand: () => "tieptuc" },
    reply: async (payload) => replies.push(payload),
    channel: {
      send: async (payload) => {
        messages.push(payload);
        return { id: "new" };
      },
      messages: {
        fetch: async (id) => {
          assert.equal(id, "old");
          return { edit: async (payload) => edits.push(payload) };
        },
      },
    },
  });
  assert.equal(repository.getSession(resume.session.id).message_id, "new");
  assert.equal(
    repository.getSession(resume.session.id).state_json,
    previousState,
    "Resume must not roll or advance the run",
  );
  assert.equal(messages.length, 1);
  assert.deepEqual(edits[0].components, []);
  const oldReplies = [];
  await hardcore.handleHardcoreButton({
    customId: `hardcore:${resume.session.id}:0:continue`,
    guildId: "resume-hardcore",
    channelId: "c",
    user: { id: "player" },
    message: { id: "old" },
    deferUpdate: async () => {},
    followUp: async (payload) => oldReplies.push(payload),
  });
  assert.match(oldReplies[0].content, /đã cũ/);
  assert.equal(
    repository.parseState(repository.getSession(resume.session.id)).turn,
    0,
  );
  await hardcore.handleHardcoreButton({
    customId: `hardcore:${resume.session.id}:0:continue`,
    guildId: "resume-hardcore",
    channelId: "c",
    user: { id: "player" },
    message: { id: "new" },
    deferUpdate: async () => {},
    editReply: async (payload) => edits.push(payload),
  });
  assert.equal(
    repository.parseState(repository.getSession(resume.session.id)).cleared,
    1,
  );
  hardcore.forceEndHardcoreSession(
    resume.session.id,
    "resume-hardcore",
    "test",
    { forfeit: true },
  );
  db.close();
  if (
    path.dirname(temporary) === path.resolve(os.tmpdir()) &&
    path.basename(temporary).startsWith("gamebot-hardcore-test-")
  )
    fs.rmSync(temporary, { recursive: true, force: true });
  console.log(
    "Hardcore passed: 7 classes, 8 regions, checkpoints, modifiers, bosses, chest pity/Luck, Median gear, current-payout charges, legacy migration, vendors, surprises, RNGesus auto-ticket, setup/resume UI, live records and timeout.",
  );
}
finishChecks().catch((error) => {
  console.error(error);
  db.close();
  process.exitCode = 1;
});
