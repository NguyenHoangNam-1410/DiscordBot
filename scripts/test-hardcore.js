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
assert.equal(startCommand.options?.length || 0, 0, "Start opens the setup UI without required slash options");
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
async function finishChecks() {
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
    "Hardcore: classes, regions, checkpoints, modifiers, bosses, pity, Median gear, resume UI and final-floor persistence passed.",
  );
}
finishChecks().catch((error) => {
  console.error(error);
  db.close();
  process.exitCode = 1;
});
