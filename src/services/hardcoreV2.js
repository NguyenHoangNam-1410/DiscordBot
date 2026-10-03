"use strict";
const stats = require("./hardcoreStats");
const world = require("./hardcoreWorld");
const echoes = require("./hardcoreEchoRepository");
const { ITEMS } = require("../hardcore/item");
const { spendDiamonds } = require("./playerLevelService");
const { runDiamondReward, baseMultiplier } = require("./hardcoreRewards");
const { clamp, recompute, addSource, mainStat } = stats;
const EVENTS = [
  "healer",
  "goblin",
  "blacksmith",
  "purifier",
  "sacrifice",
  "gambler",
  "adventurer",
  "fountain",
  "horadric",
  "merchant",
  "mirror",
  "treasure_room",
  "contract",
  "class_shrine",
  "doors",
  "duelist",
  "payout_shop",
  "blood_shop",
  "diamond_shop",
];
const EVENT_NAMES = {
  healer: "Wandering Healer",
  goblin: "Treasure Goblin",
  blacksmith: "Blacksmith",
  purifier: "Purifier",
  sacrifice: "Altar of Sacrifice",
  gambler: "Cursed Gambler",
  adventurer: "Lost Adventurer",
  fountain: "Blood Fountain",
  horadric: "Horadric Forge",
  merchant: "Rift Merchant",
  mirror: "Mirror of Fate",
  treasure_room: "Treasure Room",
  contract: "Rift Contract",
  class_shrine: "Class Shrine",
  doors: "Strange Doors",
  duelist: "Rift Duelist",
  payout_shop: "Payout Item Shop",
  blood_shop: "Blood Item Shop",
  diamond_shop: "Diamond Item Shop",
};
const pick = (pool, rng) => pool[Math.floor(rng() * pool.length)];
const int = (lo, hi, rng) => lo + Math.floor(rng() * (hi - lo + 1));
const randomItem = (rarity, rng) => structuredClone(pick(ITEMS[rarity], rng));
function normalize(state) {
  if (!["2.0.0", "2.0.1"].includes(state.releaseVersion))
    throw new Error("UNSUPPORTED_HARDCORE_VERSION");
  recompute(state);
  state.runDiamonds = runDiamondReward(state);
  return state;
}
function rawPayout(state) {
  if (!state.cleared) return 0;
  return Math.max(
    0,
    Math.min(
      10_000_000,
      Math.floor(
        (state.stake * baseMultiplier(state) + state.bonus) *
          state.payoutFactor,
      ),
    ) - (state.payoutSpent || 0),
  );
}
function payout(state) {
  if (!state.paradox || state.paradox.kind !== "blood") return rawPayout(state);
  return Math.max(
    0,
    Math.min(
      10_000_000,
      Math.floor(
        (state.stake * baseMultiplier(state) + state.bonus) *
          state.payoutFactor *
          (1 + state.paradox.bloodFactor),
      ),
    ) - (state.payoutSpent || 0),
  );
}
function heal(state, amount) {
  const actual = Math.max(
    0,
    Math.min(state.maxHp - state.hp, Math.floor(amount)),
  );
  state.hp += actual;
  if (state.paradox?.kind === "blood")
    state.paradox.bloodFactor = clamp(
      state.paradox.bloodFactor - actual / state.maxHp,
      -0.5,
      0.5,
    );
  return actual;
}
function hurt(state, amount, hostile = true, nonlethal = false) {
  const actual = Math.max(
    0,
    Math.min(state.hp - (nonlethal ? 1 : 0), Math.floor(amount)),
  );
  state.hp -= actual;
  if (hostile && state.paradox?.kind === "blood")
    state.paradox.bloodFactor = clamp(
      state.paradox.bloodFactor + actual / state.maxHp,
      -0.5,
      0.5,
    );
  return actual;
}
function penalty(state, fraction) {
  state.eventPayoutFactor *= 1 - fraction;
  recompute(state);
}
function charge(state, amount) {
  if (!Number.isSafeInteger(amount) || amount < 1 || rawPayout(state) < amount)
    throw new Error("INSUFFICIENT_RUN_PAYOUT");
  state.payoutSpent += amount;
}
function receiveItem(state, definition, levels = 1, cleansedLevels = 0) {
  if (
    !definition ||
    definition.catalogVersion !== 2 ||
    !Number.isSafeInteger(levels) ||
    levels < 1
  )
    throw new Error("INVALID_HARDCORE_ITEM");
  let item = state.items.find((x) => x.definition.id === definition.id);
  if (!item) {
    item = {
      name: definition.name,
      rarity: definition.rarity,
      definition: structuredClone(definition),
      level: 0,
      cleansedLevels: 0,
    };
    state.items.push(item);
  }
  item.level += levels;
  item.cleansedLevels += Math.min(levels, Math.max(0, cleansedLevels));
  if (definition.rarity === "cursed")
    item.rarity = item.level > item.cleansedLevels ? "cursed" : "legendary";
  recompute(state);
  for (let i = 0; i < levels; i++) {
    const e = definition.effects;
    if (e.heal) heal(state, e.heal);
    if (e.potions) state.potions = Math.min(5, state.potions + e.potions);
    if (e.escapeTokens) {
      const discarded = Math.max(0, state.escapeTokens + e.escapeTokens - 1);
      state.escapeTokens = Math.min(1, state.escapeTokens + e.escapeTokens);
      if (discarded)
        state.discardedTicketsThisTurn =
          (state.discardedTicketsThisTurn || 0) + discarded;
    }
  }
  return item;
}
function receiveSnapshot(state, snapshot) {
  return receiveItem(
    state,
    snapshot.definition,
    snapshot.level,
    snapshot.cleansedLevels || 0,
  );
}
function cleanse(state, item) {
  if (!item || item.level <= (item.cleansedLevels || 0))
    throw new Error("NO_CURSE");
  item.cleansedLevels = item.level;
  item.rarity = "legendary";
  recompute(state);
}
function grind(state, item) {
  if (!item) throw new Error("NO_FORGE_ITEM");
  const effects = { ...item.definition.effects };
  for (const key of [
    "heal",
    "potions",
    "escapeTokens",
    "bonusPenalty",
    "defenseSet",
  ])
    delete effects[key];
  item.level--;
  item.cleansedLevels = Math.min(item.level, item.cleansedLevels || 0);
  if (item.level === 0) state.items = state.items.filter((x) => x !== item);
  addSource(state, effects, "absorbed");
}
function remember(state, action, rng) {
  if (state.debts.length >= 8) return;
  state.debts.push({
    action,
    due: state.floor + int(10, 30, rng),
    good: rng() < 0.5,
    kind: rng() < 0.5 ? "tax" : "hunter",
    healRate: 0.1 + rng() * 0.1,
    bonusRate: 0.1 + rng() * 0.2,
  });
  state.lastLog += "\nThe Tower will remember this.";
}
function alive(state) {
  return state.hp > 0;
}
function nextMilestone(state, session, rng) {
  const phase = state.pendingMilestones.shift();
  if (phase) {
    state.phase = phase;
    state.encounter = { type: phase };
    return;
  }
  if (state.finalBossDefeated && state.cleared === 999) {
    state.phase = "summit";
    state.encounter = { type: "summit" };
    return;
  }
  state.phase = "encounter";
  state.encounter = generateEncounter(state, session, rng);
}
function completeFloor(state, session, rng, reward = 1) {
  const floor = state.floor;
  if (floor === 999 && !state.finalBossDefeated)
    throw new Error("FINAL_BOSS_REQUIRED");
  state.cleared = floor;
  state.bonus += Math.floor(state.stake * 0.01 * reward);
  if (
    state.encounter.type === "combat" &&
    ["boss", "final_boss"].includes(state.encounter.rank)
  )
    state.bosses++;
  if (
    state.contract &&
    floor >= state.contract.from &&
    floor <= state.contract.until
  ) {
    state.contract.remaining--;
    if (!state.contract.remaining) {
      const contract = state.contract;
      state.contract = null;
      if (contract.kind === "potion") receiveItem(state, contract.item);
      else if (contract.kind === "skill")
        state.bonus += Math.floor(state.stake * 0.5);
      else addSource(state, { [mainStat(state)]: 10 });
      state.lastLog += "\n📜 Hoàn thành Rift Contract.";
    }
  }
  if (
    state.classShrine?.classKey === "druid" &&
    floor >= state.classShrine.from &&
    floor <= state.classShrine.until
  )
    heal(state, state.maxHp * 0.05);
  if (state.classShrine && floor >= state.classShrine.until)
    state.classShrine = null;
  if (state.floorHpLoss) {
    const lost = hurt(state, Math.max(1, state.maxHp * state.floorHpLoss));
    state.lastLog += `\n🩸 Lời nguyền: −${lost} HP.`;
    if (!alive(state)) return;
  }
  if (floor % 5 === 0) {
    heal(state, state.maxHp);
    state.potions = Math.min(5, state.potions + 2);
    state.pendingMilestones.push("upgrade");
    state.lastLog +=
      "\n🏕️ Checkpoint: hồi đầy HP, +2 bình (tối đa 5); chọn +5 thuộc tính.";
  }
  if (floor % 10 === 0) {
    const keys = Object.keys(world.RIFT_MODIFIERS),
      missing = keys.filter((key) => !state.modifiers[key]);
    const key = pick(missing.length ? missing : keys, rng);
    state.modifiers[key] = (state.modifiers[key] || 0) + 1;
    state.lastLog += `\n🌀 ${world.RIFT_MODIFIERS[key].name} ×${state.modifiers[key]}.`;
  }
  if (state.paradox && floor >= state.paradox.until) state.paradox = null;
  if (floor % 25 === 0 && floor < 999) state.pendingMilestones.push("paradox");
  if ([199, 399, 699, 899].includes(floor))
    state.pendingMilestones.push("severance");
  if (floor >= 100) state.completed = true;
  state.runDiamonds = runDiamondReward(state);
  state.floor = Math.min(999, floor + 1);
  nextMilestone(state, session, rng);
}
function legendaryChance(state) {
  return clamp(
    0.1 +
      Math.max(0, state.pityLegendary - 9) * 0.02 +
      state.luck * 0.002 +
      state.legendaryFind,
    0.1,
    0.35,
  );
}
function makeChest(state, rng, treasure = false) {
  const guaranteed = state.pityRare >= 5;
  const unstable = state.modifiers.unstable_rift || 0;
  const ancient = clamp(0.03 + unstable * 0.01, 0, 0.15),
    mimic = clamp(0.12 + unstable * 0.03 + state.mimicChance, 0, 0.65);
  const mimicRoll = rng();
  let kind =
    !guaranteed && mimicRoll < ancient
      ? "ancient_mimic"
      : !guaranteed && mimicRoll < ancient + mimic
        ? "mimic"
        : "safe";
  let rarity = null;
  const lootRoll = rng();
  if (treasure)
    rarity =
      lootRoll < Math.min(0.7, 0.35 + unstable * 0.05) ? "legendary" : "rare";
  else {
    const ssr = legendaryChance(state);
    if (lootRoll < ssr) rarity = "legendary";
    else if (lootRoll < ssr + 0.03) rarity = "cursed";
    else if (lootRoll < ssr + 0.25) rarity = "rare";
    else if (lootRoll < ssr + 0.65) rarity = "common";
    else if (lootRoll < ssr + 0.85) kind = kind === "safe" ? "empty" : kind;
    else kind = kind === "safe" ? "fake" : kind;
    if ((guaranteed && !rarity) || (guaranteed && rarity === "common")) {
      rarity = "rare";
      kind = "safe";
    }
  }
  return {
    type: "chest",
    name: treasure ? "Treasure Chest" : "Hòm bí ẩn",
    kind,
    rarity,
    guaranteed,
    item: rarity ? randomItem(rarity, rng) : null,
    inspected: false,
    revealed: false,
    detectionChance: Math.min(
      0.95,
      0.25 + state.luck * 0.03 + state.mimicDetection,
    ),
    detectionSuccess:
      rng() < Math.min(0.95, 0.25 + state.luck * 0.03 + state.mimicDetection),
    mimic: world.makeEnemy(
      state,
      kind === "ancient_mimic" ? "ancient_mimic" : "mimic",
      null,
      rng,
    ),
  };
}
function serviceCost(state, fraction) {
  return Math.max(1, Math.ceil(rawPayout(state) * fraction));
}
function makeSurprise(state, rng, kind = null) {
  const eligible = EVENTS.filter((key) => {
    if (["blacksmith", "horadric"].includes(key) && !state.items.length)
      return false;
    if (
      key === "purifier" &&
      !state.items.some(
        (x) => x.level > (x.cleansedLevels || 0) && x.definition.curse,
      )
    )
      return false;
    if (key === "contract" && (state.contract || state.floor > 996))
      return false;
    if (key.endsWith("_shop")) {
      const max = { payout_shop: 5, blood_shop: 3, diamond_shop: 2 }[key];
      if (
        (state.shopCounts[key] || 0) >= max ||
        state.floor - (state.shopLast[key] ?? -100) < 50
      )
        return false;
      if (key === "diamond_shop" && state.floor < 101) return false;
      if (key === "payout_shop" && rawPayout(state) < 1) return false;
    }
    return true;
  });
  kind = kind || pick(eligible, rng);
  const e = {
    type: "surprise",
    kind,
    name: EVENT_NAMES[kind],
    roll: rng(),
    roll2: rng(),
  };
  const itemPool = state.items.filter(
    (x) =>
      kind !== "purifier" ||
      (x.definition.curse && x.level > (x.cleansedLevels || 0)),
  );
  if (["blacksmith", "purifier", "horadric"].includes(kind)) {
    e.targetId = pick(itemPool, rng)?.definition.id;
    e.forgeStat = rng() < 0.5 ? "str" : "vit";
  }
  if (kind === "adventurer") {
    e.rescueItem = randomItem(rng() < 0.3 ? "rare" : "common", rng);
    e.robItem = randomItem(rng() < 0.25 ? "cursed" : "common", rng);
  }
  if (kind === "fountain")
    e.enemy = world.makeEnemy(state, "mimic", "Blood Mimic", rng);
  if (kind === "mirror") {
    e.defenseStat = pick(["str", "dex"], rng);
    e.enemy = world.makeEnemy(state, "elite", "Mirror Clone", rng);
    Object.assign(e.enemy, {
      hp: state.maxHp,
      maxHp: state.maxHp,
      damageMin: state.damageMin,
      damageMax: state.damageMax,
      defense: state.defense,
      accuracy: state.accuracy,
      evasion: state.evasion,
      resistance: state.resistance,
      critChance: state.critChance,
    });
  }
  if (kind === "treasure_room") {
    e.mimicColor = pick(["red", "blue", "gold"], rng);
    e.enemy = world.makeEnemy(state, "mimic", "Treasure Room Mimic", rng);
  }
  if (kind === "contract" || kind === "doors")
    e.item = randomItem("legendary", rng);
  if (kind === "doors") {
    e.doors = { light: rng() < 0.7, gold: rng() < 0.7, dark: rng() < 0.6 };
    e.mimic = world.makeEnemy(state, "mimic", "Golden Door Mimic", rng);
    e.boss = world.makeEnemy(state, "boss", "Premature Rift Boss", rng);
  }
  if (kind === "duelist") {
    e.hands = Array.from({ length: 5 }, () => int(0, 2, rng));
    e.penalty = Array.from({ length: 6 }, () => pick(stats.ATTRIBUTES, rng));
    e.reward = randomItem(rng() < 0.75 ? "legendary" : "cursed", rng);
    e.lossItemId = pick(
      state.items.filter((x) => x.rarity !== "cursed"),
      rng,
    )?.definition.id;
    e.round = 0;
    e.wins = 0;
    e.mode = null;
    e.history = [];
  }
  if (kind.endsWith("_shop")) {
    const raw = rawPayout(state),
      maxHp = state.maxHp;
    const odds = {
      payout_shop: [0.45, 0.85, 1],
      blood_shop: [0, 0.55, 0.9],
      diamond_shop: [0, 0.4, 0.8],
    }[kind];
    e.offers = Array.from({ length: 3 }, () => {
      const roll = rng();
      const rarity =
        roll < odds[0]
          ? "common"
          : roll < odds[1]
            ? "rare"
            : roll < odds[2]
              ? "legendary"
              : "cursed";
      const price =
        kind === "payout_shop"
          ? Math.max(
              1,
              Math.ceil(
                raw * { common: 0.05, rare: 0.12, legendary: 0.25 }[rarity],
              ),
            )
          : kind === "blood_shop"
            ? Math.max(
                1,
                Math.ceil(
                  maxHp * { rare: 0.12, legendary: 0.25, cursed: 0.4 }[rarity],
                ),
              )
            : { rare: 200, legendary: 600, cursed: 1600 }[rarity];
      return { item: randomItem(rarity, rng), price };
    });
    state.shopCounts[kind] = (state.shopCounts[kind] || 0) + 1;
    state.shopLast[kind] = state.floor;
  }
  if (kind === "merchant") {
    const pool = [
      { key: "potion", fraction: 0.05 },
      { key: "heal", fraction: 0.08 },
      { key: "luck", fraction: 0.1 },
      { key: "item", fraction: 0.15 },
      { key: "ticket", fraction: 0.25 },
    ];
    e.offers = [];
    while (e.offers.length < 3) {
      const index = int(0, pool.length - 1, rng);
      const offer = pool.splice(index, 1)[0];
      e.offers.push({
        ...offer,
        price: serviceCost(state, offer.fraction),
        item: offer.key === "item" ? randomItem("rare", rng) : null,
      });
    }
  }
  return e;
}
function rollRngesus(state, rng) {
  const base =
    state.floor < 5
      ? 0
      : state.floor < 10
        ? 0.003
        : state.floor < 20
          ? 0.006
          : 0.01;
  if (!base) {
    state.lastChaosChance = 0;
    return false;
  }
  const volatility = 0.25 + rng() * 2.75,
    spike = rng() < 0.025;
  const chance = clamp(
    base * volatility +
      (state.rngesusDry || 0) * 0.0005 +
      (spike ? 0.04 + rng() * 0.06 : 0),
    0,
    0.12,
  );
  state.lastChaosChance = chance;
  state.lastChaosSpike = spike;
  const hit = rng() < chance;
  state.rngesusDry = hit ? 0 : (state.rngesusDry || 0) + 1;
  return hit;
}
function echoEnemy(state, echo, rng, challenge = false) {
  const enemy = world.makeEnemy(
    state,
    echo.is_nemesis ? "boss" : "elite",
    `${echo.is_nemesis ? "Server Nemesis" : "Grave Echo"}: ${echo.name}`,
    rng,
  );
  enemy.mechanic = null;
  enemy.echoId = echo.id;
  enemy.echo = echo;
  enemy.echoItem = pick(echo.profile.items, rng) || null;
  if (challenge) {
    enemy.hp = Math.round(enemy.hp * 1.25);
    enemy.maxHp = enemy.hp;
    enemy.damageMin = Math.round(enemy.damageMin * 1.25);
    enemy.damageMax = Math.round(enemy.damageMax * 1.25);
  }
  const build = echo.profile.build;
  if (build === "dex") enemy.evasion += 8;
  if (build === "vit") enemy.defense += 12;
  if (build === "str") enemy.critChance += 0.1;
  if (build === "ene") enemy.damageType = enemy.nextDamageType = "magic";
  return enemy;
}
function generateEncounter(state, session, rng) {
  if (state.floor === 999)
    return world.makeEnemy(state, "final_boss", null, rng);
  if (state.floor % 50 === 0) return world.makeEnemy(state, "boss", null, rng);
  if (rollRngesus(state, rng))
    return {
      type: "rngesus",
      name: "RNGesus",
      fleeSuccess: rng() < 0.75,
      prayerSuccess: rng() < 0.1,
      prayerItem: randomItem(rng() < 0.85 ? "legendary" : "cursed", rng),
    };
  const due = state.debts.findIndex((debt) => debt.due <= state.floor);
  if (due >= 0) {
    const debt = state.debts.splice(due, 1)[0];
    return {
      type: "memory",
      name: "The Tower Remembers",
      debt,
      enemy:
        debt.kind === "hunter"
          ? world.makeEnemy(state, "elite", "Bounty Hunter", rng)
          : null,
    };
  }
  const band = Math.floor((state.floor - 1) / 100);
  if (state.floor >= 101 && !state.echoBands.includes(band) && rng() < 0.01) {
    const echo = echoes.claim(session, state);
    if (echo) {
      state.echoBands.push(band);
      return {
        type: "echo",
        name: `Grave Echo: ${echo.name}`,
        echo,
        awakens: rng() < 0.5,
        item: pick(echo.profile.items, rng) || null,
        enemy: echoEnemy(state, echo, rng),
        challenger: echoEnemy(state, echo, rng, true),
      };
    }
  }
  const extra = Math.min(0.16, (state.modifiers.unstable_rift || 0) * 0.02),
    roll = rng();
  if (roll < 0.53 - extra) return world.makeEnemy(state, "normal", null, rng);
  if (roll < 0.65 - extra) return world.makeEnemy(state, "elite", null, rng);
  if (roll < 0.75 - extra / 2) return makeChest(state, rng);
  if (roll < 0.83 - extra / 2)
    return {
      type: "shrine",
      name: "Shrine",
      kind: pick(
        ["healing", "armor", "blood", "experience", "corrupted", "fake"],
        rng,
      ),
      armorStat: rng() < 0.5 ? "str" : "vit",
    };
  if (roll < 0.88) return makeChest(state, rng, true);
  if (roll < 0.94) {
    const kind = pick(["tax", "potion_thief", "portal"], rng);
    return {
      type: "trap",
      name:
        kind === "portal"
          ? "Wrong Portal"
          : kind === "tax"
            ? "Tax Collector"
            : "Potion Thief",
      kind,
      lucky: rng() < Math.min(0.3, state.luck * 0.015),
      good: rng() < 0.5,
      effect:
        kind === "portal"
          ? pick(["healing", "treasure", "blessing"], rng)
          : null,
      badEffect: pick(["blood", "mana", "supply", "payout", "curse"], rng),
      enemy: world.makeEnemy(state, "elite", "Rift Ambusher", rng),
    };
  }
  if (roll < 0.98 && state.floor - (state.lastSurpriseFloor ?? -10) >= 2) {
    state.lastSurpriseFloor = state.floor;
    return makeSurprise(state, rng);
  }
  return { type: "empty", name: "Phòng trống" };
}
function initialize(classKey, stake, session, rng) {
  const state = stats.createState(classKey, stake);
  state.encounter = generateEncounter(state, session, rng);
  return state;
}
function shrineActive(state) {
  return (
    state.classShrine &&
    state.floor >= state.classShrine.from &&
    state.floor <= state.classShrine.until &&
    !state.classShrine.consumed
  );
}
function physicalRange(state) {
  if (state.paradox?.kind !== "inverse")
    return [state.damageMin, state.damageMax];
  return [Math.max(1, state.defense - 2), Math.max(1, state.defense + 3)];
}
function attackDamage(
  attacker,
  defender,
  state,
  rng,
  {
    magic = false,
    multiplier = 1,
    defend = false,
    player = false,
    critical = null,
    raw = null,
  } = {},
) {
  const hit =
    magic || rng() < world.hitChance(attacker.accuracy, defender.evasion);
  if (!hit) return { damage: 0, hit: false, crit: false };
  const crit =
    !magic && !defend && (critical ?? rng() < (attacker.critChance || 0));
  const range = player
    ? physicalRange(state)
    : [attacker.damageMin, attacker.damageMax];
  let damage = raw ?? int(...range, rng);
  damage *= multiplier * (crit ? 1.75 : 1);
  if (magic) {
    let res = defender.resistance;
    if (!player) {
      res -= world.effectiveStacks(state.modifiers.cursed_ground || 0) * 3;
      if (shrineActive(state) && state.classKey === "paladin") res += 10;
      if (defend) res += 15;
    }
    damage *= 1 - clamp(res, -50, 75) / 100;
  } else {
    let defense = defender.defense;
    if (!player) {
      if (state.paradox?.kind === "inverse")
        defense = (state.damageMin + state.damageMax) / 2;
      if (
        shrineActive(state) &&
        state.classKey === "barbarian" &&
        state.hp <= state.maxHp * 0.3
      )
        defense += 8;
    }
    damage *=
      1 - world.defenseReduction(defense * (defend ? 2 : 1), state.floor);
  }
  if (!player) damage *= (defend ? 0.85 : 1) * (1 + state.damageTaken);
  return { damage: Math.max(1, Math.floor(damage)), hit: true, crit };
}
function enemyTurn(state, rng, defend = false, dodge = false) {
  const enemy = state.encounter;
  if (dodge) return "💨 Bạn chặn/né hoàn toàn phản công.";
  if (
    shrineActive(state) &&
    ["assassin", "necromancer"].includes(state.classKey)
  ) {
    state.classShrine.consumed = true;
    return "✨ Class Shrine chặn phản công.";
  }
  const blood =
    enemy.hp < enemy.maxHp * 0.5
      ? 1 + world.effectiveStacks(state.modifiers.bloodlust || 0) * 0.06
      : 1;
  const frenzy =
    enemy.mechanic === "butcher" ? 1 + Math.min(5, enemy.frenzy + 1) * 0.08 : 1;
  const hit = attackDamage(enemy, state, state, rng, {
    magic: enemy.nextDamageType === "magic",
    multiplier: blood * frenzy,
    defend,
  });
  const actual = hurt(state, hit.damage);
  if (hit.hit && enemy.drainCharges > 0) {
    state.mana = Math.max(0, state.mana - 1);
    enemy.drainCharges--;
  }
  if (enemy.mechanic === "butcher")
    enemy.frenzy = Math.min(5, enemy.frenzy + 1);
  if (enemy.mechanic === "lucion" && actual)
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.floor(actual * 0.35));
  enemy.nextDamageType =
    enemy.damageType === "mixed"
      ? rng() < enemy.magicChance
        ? "magic"
        : "physical"
      : enemy.damageType;
  return hit.hit
    ? `${hit.crit ? "💥 Critical! " : ""}Bạn nhận ${actual} DMG${defend ? " (đã phòng thủ)" : ""}.`
    : "💨 Quái đánh trượt.";
}
function incomingPreview(state) {
  const e = state.encounter;
  if (e.type !== "combat") return null;
  const factor =
    (e.hp < e.maxHp * 0.5
      ? 1 + world.effectiveStacks(state.modifiers.bloodlust || 0) * 0.06
      : 1) *
    (e.mechanic === "butcher" ? 1 + Math.min(5, e.frenzy + 1) * 0.08 : 1);
  const low = attackDamage(e, state, state, () => 0, {
    magic: e.nextDamageType === "magic",
    multiplier: factor,
    critical: false,
    raw: e.damageMin,
  }).damage;
  const high = attackDamage(e, state, state, () => 0, {
    magic: e.nextDamageType === "magic",
    multiplier: factor,
    critical: false,
    raw: e.damageMax,
  }).damage;
  return {
    low,
    high,
    chance:
      e.nextDamageType === "magic"
        ? 1
        : world.hitChance(e.accuracy, state.evasion),
  };
}
function playerAttack(state, action, rng) {
  const e = state.encounter;
  let dodge = false,
    defend = false,
    hits = [];
  if (action === "defend") {
    state.mana = Math.min(state.maxMana, state.mana + 1);
    return { defend: true, dodge: false, log: "🛡️ Phòng thủ và hồi 1 Mana." };
  }
  if (action === "potion") {
    if (!state.potions) throw new Error("NO_POTION");
    if (state.hp >= state.maxHp) throw new Error("FULL_HP");
    state.potions--;
    const gained = heal(state, Math.max(20, state.maxHp * state.potionRate));
    return {
      defend: false,
      dodge: false,
      log: `🧪 Hồi ${gained} HP; quái còn sống phản công.`,
    };
  }
  if (action === "skill") {
    const free = state.classKey === "sorceress" && shrineActive(state);
    if (!free && state.mana < 2) throw new Error("NO_ENERGY");
    if (free) state.classShrine.consumed = true;
    else state.mana -= 2;
    if (["sorceress", "necromancer"].includes(state.classKey)) {
      hits = [
        attackDamage(state, e, state, rng, {
          player: true,
          magic: true,
          raw: int(state.spellMin, state.spellMax, rng),
          multiplier: state.classKey === "sorceress" ? 2.1 : 1.55,
        }),
      ];
      dodge = state.classKey === "necromancer";
    } else if (state.classKey === "amazon") {
      const shots = shrineActive(state) && rng() < 0.2 ? 3 : 2;
      hits = Array.from({ length: shots }, () =>
        attackDamage(state, e, state, rng, { player: true, multiplier: 0.85 }),
      );
    } else {
      hits = [
        attackDamage(state, e, state, rng, {
          player: true,
          multiplier: {
            barbarian: 1.65,
            assassin: 1.3,
            druid: 1.35,
            paladin: 1.4,
          }[state.classKey],
        }),
      ];
      dodge = state.classKey === "assassin";
      defend = state.classKey === "paladin";
      if (state.classKey === "druid") heal(state, state.maxHp * 0.12);
    }
  } else if (action === "attack") {
    hits = [attackDamage(state, e, state, rng, { player: true })];
    state.mana = Math.min(
      state.maxMana,
      state.mana +
        Math.max(
          1,
          Math.floor(
            state.maxMana *
              (["sorceress", "necromancer"].includes(state.classKey)
                ? 0.7
                : 0.4),
          ),
        ),
    );
  } else throw new Error("INVALID_ACTION");
  const bonus = ["boss", "final_boss"].includes(e.rank)
    ? state.bossDamage
    : e.rank === "elite"
      ? state.eliteDamage
      : 0;
  let damage = Math.floor(
    hits.reduce((sum, hit) => sum + hit.damage, 0) * (1 + bonus),
  );
  if (e.mechanic === "riftwalker" && e.combatTurn % 3 === 0) damage = 0;
  if (e.mechanic === "deimoss" && damage > 0)
    damage = Math.max(1, Math.floor(damage * 0.75));
  e.combatTurn++;
  e.hp = Math.max(0, e.hp - damage);
  return {
    defend,
    dodge,
    log: `${action === "skill" ? `✨ ${stats.CLASSES[state.classKey].skill}` : "⚔️ Tấn công"}: ${damage} DMG${hits.some((h) => h.crit) ? " · Critical" : ""}.`,
  };
}
function surpriseActions(state) {
  const e = state.encounter,
    k = e.kind;
  if (k.endsWith("_shop"))
    return e.offers.map((offer, i) => ({
      action: `buy_${i}`,
      label: `${i + 1}. ${offer.item.name} · ${offer.price}${k === "blood_shop" ? " HP" : k === "diamond_shop" ? " 💎" : " xu"}`,
      disabled:
        (k === "blood_shop" && state.hp <= offer.price) ||
        (k === "payout_shop" && rawPayout(state) < offer.price),
    }));
  if (k === "merchant")
    return e.offers.map((offer, i) => ({
      action: `buy_${i}`,
      label: `${{ potion: "Bình", heal: "Hồi đầy", luck: "Luck +1", item: "Item SR", ticket: "Vé" }[offer.key]} · ${offer.price} xu`,
      disabled: rawPayout(state) < offer.price,
    }));
  if (k === "duelist") {
    if (!e.mode)
      return [
        { action: "duel_stat", label: "Đấu thuộc tính" },
        { action: "duel_items", label: "Đấu trang bị" },
      ];
    return ["Búa", "Kéo", "Bao"].map((label, i) => ({
      action: `hand_${i}`,
      label,
    }));
  }
  return (
    {
      healer: [{ action: "event_heal", label: "Hồi máu +1 bình" }],
      goblin: [
        {
          action: "event_catch",
          label: `Bắt · ${Math.round(Math.min(0.9, 0.6 + state.luck * 0.01 + state.goblinChance) * 100)}%`,
        },
      ],
      blacksmith: [
        {
          action: "event_smith",
          label: `Rèn · ${serviceCost(state, 0.12)} xu`,
          disabled: rawPayout(state) < 1,
        },
      ],
      purifier: [
        {
          action: "event_cleanse",
          label: `Giải toàn bộ · ${serviceCost(state, 0.2)} xu`,
          disabled: rawPayout(state) < 1,
        },
      ],
      sacrifice: [
        {
          action: "event_sacrifice_hp",
          label: "Hiến 20% HP · +6 stat chính",
          disabled: state.hp <= 1,
        },
        {
          action: "event_sacrifice_payout",
          label: "10% payout · +6 VIT",
          disabled: rawPayout(state) < 1,
        },
      ],
      gambler: [
        {
          action: "event_gamble_10",
          label: "Cược 10% payout",
          disabled: rawPayout(state) < 1,
        },
        {
          action: "event_gamble_25",
          label: "Cược 25% payout",
          disabled: rawPayout(state) < 1,
        },
      ],
      adventurer: [
        {
          action: "event_rescue",
          label: "Cứu · 1 bình",
          disabled: state.potions < 1,
        },
        { action: "event_rob", label: "Cướp · R/UR" },
      ],
      fountain: [{ action: "event_drink", label: "Uống" }],
      horadric: [
        { action: "forge_main", label: "Nghiền · +6 stat chính" },
        {
          action: "forge_guard",
          label: `Nghiền · +7 ${(e.forgeStat || "str").toUpperCase()}`,
        },
        { action: "forge_vit", label: "Nghiền · +4 VIT" },
        ...(["legendary", "cursed"].includes(
          state.items.find((x) => x.definition.id === e.targetId)?.rarity,
        )
          ? [{ action: "forge_ticket", label: "Nghiền · Vé Thoát Hiểm" }]
          : []),
      ],
      mirror: [
        { action: "event_mirror_power", label: "+10 stat chính" },
        { action: "event_mirror_guard", label: "+8 VIT, +5 phòng thủ" },
        { action: "event_mirror_break", label: "Đập gương" },
      ],
      treasure_room: [
        ...(!e.inspected
          ? ["red", "blue", "gold"].map((color) => ({
              action: `inspect_${color}`,
              label: `Soi ${color}`,
            }))
          : []),
        ...["red", "blue", "gold"].map((color) => ({
          action: `chest_${color}`,
          label: `Mở ${color}`,
        })),
      ],
      contract: [
        { action: "contract_potion", label: "Không bình → SSR" },
        { action: "contract_skill", label: "Không skill → 50% cược" },
        { action: "contract_defend", label: "Không thủ → +10 stat" },
      ],
      class_shrine: [{ action: "event_class", label: "Nhận phúc class" }],
      doors: [
        { action: "door_light", label: "Cửa sáng · 70%" },
        { action: "door_gold", label: "Cửa vàng · 70%" },
        { action: "door_dark", label: "Cửa tối · 60%" },
      ],
    }[k] || []
  );
}
function actions(state) {
  if (state.phase === "upgrade")
    return stats.ATTRIBUTES.map((key) => ({
      action: `upgrade_${key}`,
      label: `+5 ${key.toUpperCase()}`,
    }));
  if (state.phase === "paradox")
    return [
      { action: "paradox_blood", label: "Máu là tiền · 5 tầng" },
      { action: "paradox_inverse", label: "Ngược đời · 5 tầng" },
    ];
  if (state.phase === "severance") {
    const keys = Object.keys(state.modifiers).filter(
      (key) => key !== "unstable_rift" && state.modifiers[key] > 0,
    );
    return keys.length
      ? keys.map((key) => ({
          action: `sever_${key}`,
          label: `Xóa ${world.RIFT_MODIFIERS[key].name}`,
        }))
      : [{ action: "sever_none", label: "Đi tiếp (không có modifier để xóa)" }];
  }
  if (state.phase === "summit") return [];
  const e = state.encounter;
  if (e.type === "combat")
    return [
      { action: "attack", label: "Tấn công" },
      { action: "defend", label: "Phòng thủ" },
      {
        action: "skill",
        label: stats.CLASSES[state.classKey].skill,
        disabled:
          state.mana < 2 &&
          !(state.classKey === "sorceress" && shrineActive(state)),
      },
      {
        action: "potion",
        label: `Bình ×${state.potions}`,
        disabled: !state.potions || state.hp === state.maxHp,
      },
    ];
  if (e.type === "surprise")
    return [
      ...surpriseActions(state),
      ...(e.kind === "duelist" && e.mode
        ? []
        : [{ action: "event_skip", label: "Bỏ qua" }]),
    ];
  if (e.type === "chest")
    return [
      { action: "inspect", label: "Kiểm tra", disabled: e.inspected },
      { action: "open", label: "Mở hòm" },
      { action: "sell", label: "Bán · 15% cược" },
      ...(e.revealed ? [{ action: "leave", label: "Né Mimic" }] : []),
    ];
  if (e.type === "shrine")
    return [
      { action: "touch", label: "Chạm Shrine" },
      { action: "skip", label: "Bỏ qua" },
    ];
  if (e.type === "rngesus")
    return [
      { action: "fight", label: "Đánh (chết)" },
      { action: "flee", label: "Chạy · 75%" },
      { action: "bribe", label: "Hối lộ · 40% payout" },
      { action: "pray", label: "Cầu nguyện · 10%" },
      {
        action: "ticket",
        label: "Vé Thoát Hiểm",
        disabled: !state.escapeTokens,
      },
    ];
  if (e.type === "echo")
    return [
      { action: "echo_pray", label: "Cầu nguyện · hồi 15% HP" },
      { action: "echo_rob", label: "Cướp · 50% thức tỉnh" },
      { action: "echo_challenge", label: "Khiêu chiến · +25% sức mạnh" },
      { action: "echo_skip", label: "Bỏ đi" },
    ];
  return [{ action: "next", label: "Đi tiếp" }];
}
function actSurprise(state, session, action, rng) {
  const e = state.encounter,
    k = e.kind;
  const done = (log) => {
    state.lastLog = log;
    completeFloor(state, session, rng, 0);
  };
  const combat = (enemy, log) => {
    state.encounter = enemy;
    state.lastLog = log;
  };
  const itemById = (id) =>
    state.items.find((item) => item.definition.id === id);
  if (action === "event_skip") {
    state.lastLog = `Bỏ qua ${e.name}.`;
    remember(state, "skip_event", rng);
    completeFloor(state, session, rng, 0);
    return;
  }
  if (k.endsWith("_shop") || k === "merchant") {
    const offer = e.offers[Number(action.slice(4))];
    if (!offer || !/^buy_\d$/.test(action)) throw new Error("INVALID_ACTION");
    if (k === "blood_shop") {
      if (state.hp <= offer.price) throw new Error("INSUFFICIENT_HP");
      hurt(state, offer.price, false);
    } else if (k === "diamond_shop")
      spendDiamonds(session.guild_id, session.user_id, offer.price, {
        reason: "hardcore:v2:item-shop",
        operationId: `hardcore-shop:${session.id}:${state.turn}`,
      });
    else charge(state, offer.price);
    if (offer.item) {
      const item = receiveItem(state, offer.item);
      done(`🎒 Nhận ${item.name} Lv.${item.level}.`);
    } else {
      if (offer.key === "potion")
        state.potions = Math.min(5, state.potions + 1);
      if (offer.key === "heal") heal(state, state.maxHp);
      if (offer.key === "luck") addSource(state, { luck: 1 });
      if (offer.key === "ticket") state.escapeTokens = 1;
      done(`🛒 Đã mua ${offer.key}.`);
    }
    return;
  }
  if (k === "duelist") {
    if (action === "duel_stat" || action === "duel_items") {
      e.mode = action === "duel_stat" ? "stat" : "items";
      state.lastLog = `Rift Duelist · ${e.mode === "stat" ? "Một ván thuộc tính" : "Thắng 3 trong tối đa 5 ván"}.`;
      return;
    }
    const hand = Number(action.slice(5));
    if (!/^hand_[012]$/.test(action) || !e.mode)
      throw new Error("INVALID_ACTION");
    const opponent = e.hands[e.round],
      won = (hand + 1) % 3 === opponent,
      tie = hand === opponent;
    e.history.push({
      hand,
      opponent,
      result: won ? "win" : tie ? "draw" : "loss",
    });
    e.round++;
    if (won) e.wins++;
    state.lastLog = `${["Búa", "Kéo", "Bao"][hand]} vs ${["Búa", "Kéo", "Bao"][opponent]}: ${won ? "Thắng" : tie ? "Hòa" : "Thua"}.`;
    if (e.mode === "stat") {
      if (won) addSource(state, { [["str", "dex", "ene"][hand]]: 6 });
      else
        for (const key of e.penalty)
          if (state[key] > 1) addSource(state, { [key]: -1 });
      completeFloor(state, session, rng, 0);
    } else if (e.wins >= 3 || e.round >= 5) {
      if (e.wins >= 3) {
        receiveItem(state, e.reward);
        state.lastLog += ` Nhận ${e.reward.name}.`;
      } else {
        const lost = itemById(e.lossItemId);
        if (lost && lost.rarity !== "cursed") {
          state.items = state.items.filter((x) => x !== lost);
          recompute(state);
          state.lastLog += ` Mất ${lost.name}.`;
        }
      }
      completeFloor(state, session, rng, 0);
    }
    return;
  }
  if (k === "healer") {
    const hp = heal(state, Math.max(20, state.maxHp * 0.3));
    state.potions = Math.min(5, state.potions + 1);
    done(`💚 Hồi ${hp} HP, +1 bình.`);
  } else if (k === "goblin") {
    if (e.roll < Math.min(0.9, 0.6 + state.luck * 0.01 + state.goblinChance)) {
      state.bonus += Math.floor(state.stake * 0.25);
      done("💰 Bắt được Goblin: bonus +25% cược.");
    } else {
      penalty(state, 0.1);
      done("🏃 Goblin thoát: mất 10% payout.");
    }
  } else if (k === "blacksmith") {
    charge(state, serviceCost(state, 0.12));
    const target = itemById(e.targetId);
    if (!target) throw new Error("NO_FORGE_ITEM");
    const item = receiveItem(
      state,
      target.definition,
      1,
      target.level === (target.cleansedLevels || 0) ? 1 : 0,
    );
    done(`🔨 ${item.name} Lv.${item.level}.`);
  } else if (k === "purifier") {
    charge(state, serviceCost(state, 0.2));
    const target = itemById(e.targetId);
    cleanse(state, target);
    done(
      `✨ ${target.name}: giải toàn bộ curse; giữ level và buff, chuyển SSR.`,
    );
  } else if (k === "sacrifice") {
    if (action === "event_sacrifice_hp") {
      if (state.hp <= 1) throw new Error("INSUFFICIENT_HP");
      hurt(state, state.maxHp * 0.2, false, true);
      addSource(state, { [mainStat(state)]: 6 });
    } else {
      charge(state, serviceCost(state, 0.1));
      addSource(state, { vit: 6 });
    }
    state.lastLog = "🩸 Hoàn thành hiến tế.";
    remember(state, "sacrifice", rng);
    completeFloor(state, session, rng, 0);
  } else if (k === "gambler") {
    const amount = serviceCost(
      state,
      action === "event_gamble_10" ? 0.1 : 0.25,
    );
    charge(state, amount);
    if (e.roll < 0.5) state.bonus += amount * 2;
    done(`🎲 ${e.roll < 0.5 ? "Thắng" : "Thua"} cược ${amount} xu.`);
  } else if (k === "adventurer") {
    if (action === "event_rescue") {
      if (state.potions < 1) throw new Error("NO_RESCUE_POTIONS");
      state.potions--;
      receiveItem(state, e.rescueItem);
      state.lastLog = `🤝 Cứu người: nhận ${e.rescueItem.name}.`;
    } else {
      receiveItem(state, e.robItem);
      state.lastLog = `🗡️ Cướp: nhận ${e.robItem.name}.`;
    }
    remember(state, action, rng);
    completeFloor(state, session, rng, 0);
  } else if (k === "fountain") {
    if (e.roll < 0.6) {
      heal(state, state.maxHp);
      done("🩸 Hồi đầy HP.");
    } else if (e.roll < 0.85) {
      addSource(state, { maxHp: 15 });
      heal(state, 15);
      done("🩸 +15 Max HP/HP.");
    } else combat(e.enemy, "Blood Mimic xuất hiện!");
  } else if (k === "horadric") {
    const target = itemById(e.targetId);
    grind(state, target);
    if (action === "forge_main") addSource(state, { [mainStat(state)]: 6 });
    else if (action === "forge_guard") addSource(state, { [e.forgeStat]: 7 });
    else if (action === "forge_vit") addSource(state, { vit: 4 });
    else state.escapeTokens = 1;
    done(`⚒️ Hấp thụ buff một cấp ${target.name}; nhận bonus đã chọn.`);
  } else if (k === "mirror") {
    if (action === "event_mirror_power") {
      addSource(state, { [mainStat(state)]: 10 });
      done("🪞 +10 stat chính.");
    } else if (action === "event_mirror_guard") {
      addSource(state, { vit: 8, [e.defenseStat]: 5 });
      done(`🪞 +8 VIT, +5 ${e.defenseStat.toUpperCase()}.`);
    } else {
      state.lastLog = "🪞 Đập gương.";
      remember(state, "mirror_break", rng);
      if (e.roll < 0.2) {
        addSource(state, { luck: 2 });
        completeFloor(state, session, rng, 0);
      } else {
        const log = state.lastLog;
        combat(e.enemy, log + "\nMirror Clone xuất hiện!");
      }
    }
  } else if (k === "treasure_room") {
    const color = action.split("_").at(-1);
    if (action.startsWith("inspect_")) {
      if (e.inspected) throw new Error("ALREADY_INSPECTED");
      e.inspected = color;
      state.lastLog = `🔍 ${color}: ${e.mimicColor === color ? "Mimic!" : "An toàn."}`;
      return;
    }
    if (color === e.mimicColor) combat(e.enemy, "Hòm là Mimic!");
    else {
      if (color === "red") addSource(state, { physical: 5, spell: 5 });
      if (color === "blue") addSource(state, { defense: 6, resistance: 5 });
      if (color === "gold") {
        state.bonus += Math.floor(state.stake * 0.5);
        addSource(state, { luck: 1 });
      }
      done(`🎁 Nhận thưởng hòm ${color}.`);
    }
  } else if (k === "contract") {
    state.contract = {
      kind: action.slice(9),
      from: state.floor + 1,
      until: state.floor + 3,
      remaining: 3,
      item: e.item,
    };
    done("📜 Hợp đồng cho 3 tầng tiếp theo.");
  } else if (k === "class_shrine") {
    state.classShrine = {
      classKey: state.classKey,
      from: state.floor + 1,
      until: state.floor + 3,
      consumed: false,
    };
    done("✨ Phúc class cho 3 tầng tiếp theo.");
  } else if (k === "doors") {
    const door = action.slice(5);
    if (e.doors[door]) {
      if (door === "light") {
        heal(state, state.maxHp);
        state.potions = Math.min(5, state.potions + 1);
      }
      if (door === "gold") state.bonus += Math.floor(state.stake * 0.5);
      if (door === "dark") receiveItem(state, e.item);
      done(`🚪 Cửa ${door}: nhận thưởng.`);
    } else if (door === "light") {
      hurt(state, state.maxHp * 0.2, true, true);
      done("🚪 Mất 20% Max HP, giữ ít nhất 1.");
    } else
      combat(
        door === "gold" ? e.mimic : e.boss,
        `🚪 ${door === "gold" ? "Mimic" : "Premature Rift Boss"} xuất hiện!`,
      );
  } else throw new Error("INVALID_ACTION");
}
function act(state, session, action, rng) {
  if (action === "retreat") {
    if (state.encounter.type === "rngesus") throw new Error("CANNOT_RETREAT");
    return state.phase === "summit"
      ? "summit"
      : state.cleared
        ? "cashout"
        : "forfeit";
  }
  if (
    !actions(state).some(
      (option) => option.action === action && !option.disabled,
    )
  )
    throw new Error("INVALID_ACTION");
  const before = Object.fromEntries(
    [
      "str",
      "dex",
      "vit",
      "ene",
      "maxHp",
      "hp",
      "damageMin",
      "damageMax",
      "spellMin",
      "spellMax",
      "defense",
      "accuracy",
      "evasion",
      "resistance",
      "critChance",
      "mana",
      "maxMana",
      "luck",
      "potions",
      "escapeTokens",
    ].map((key) => [key, state[key]]),
  );
  state.lastLog = "";
  state.discardedTicketsThisTurn = 0;
  if (state.phase === "upgrade") {
    const key = action.slice(8);
    addSource(state, { [key]: 5 }, "checkpoint");
    state.lastLog = `${key.toUpperCase()} +5.`;
    nextMilestone(state, session, rng);
  } else if (state.phase === "paradox") {
    state.paradox = {
      kind: action.slice(8),
      from: state.floor,
      until: state.floor + 4,
      bloodFactor: 0,
    };
    state.lastLog = `Rift Paradox: ${state.paradox.kind === "blood" ? "Máu là tiền" : "Ngược đời"}, 5 tầng.`;
    nextMilestone(state, session, rng);
  } else if (state.phase === "severance") {
    if (action !== "sever_none") delete state.modifiers[action.slice(6)];
    state.lastLog = "Rift Severance hoàn thành.";
    nextMilestone(state, session, rng);
  } else {
    const e = state.encounter;
    if (e.type === "combat") {
      if (e.echoId && !echoes.owns(session, e.echoId)) {
        e.echoId = null;
        e.echoItem = null;
        e.echo = null;
        state.lastLog =
          "Mộ đã hết thời gian claim; trận đấu tiếp tục, không còn loot từ mộ.\n";
      } else if (e.echoId) echoes.renew(session, e.echoId);
      const acted = playerAttack(state, action, rng);
      state.lastLog += acted.log;
      if (
        state.contract &&
        state.floor >= state.contract.from &&
        state.floor <= state.contract.until &&
        state.contract.kind === action
      ) {
        state.contract = null;
        state.lastLog += "\n📜 Vi phạm hợp đồng: hủy phần thưởng.";
      }
      if (e.hp <= 0) {
        if (e.rank === "final_boss" && e.mechanic === "deimoss")
          state.finalBossDefeated = true;
        if (e.echoId) {
          if (e.echoItem) receiveSnapshot(state, e.echoItem);
          state.bonus += Math.floor(state.stake * (0.25 + 0.1 * e.echo.kills));
          echoes.consume(session, e.echoId);
        }
        state.lastLog += `\n🏆 Hạ ${e.name}.`;
        completeFloor(state, session, rng, e.rewardMultiplier);
      } else
        state.lastLog += `\n${enemyTurn(state, rng, acted.defend, acted.dodge)}`;
    } else if (e.type === "surprise") actSurprise(state, session, action, rng);
    else if (e.type === "chest") {
      if (action === "inspect") {
        e.inspected = true;
        e.revealed =
          ["mimic", "ancient_mimic"].includes(e.kind) && e.detectionSuccess;
        state.lastLog = e.revealed
          ? "👁️ Phát hiện Mimic!"
          : "🔍 Không phát hiện dấu hiệu bất thường.";
      } else if (action === "sell") {
        state.bonus += Math.floor(state.stake * 0.15);
        state.lastLog = "Bán hòm: bonus +15% cược.";
        remember(state, "sell_chest", rng);
        completeFloor(state, session, rng, 0);
      } else if (action === "leave") {
        state.lastLog = "Tránh Mimic.";
        completeFloor(state, session, rng, 0);
      } else if (["mimic", "ancient_mimic"].includes(e.kind)) {
        state.pityRare++;
        state.pityLegendary++;
        state.encounter = e.mimic;
        state.lastLog = "Mimic xuất hiện!";
      } else {
        const rarity = e.kind === "safe" ? e.rarity : null;
        state.pityRare = ["rare", "legendary", "cursed"].includes(rarity)
          ? 0
          : state.pityRare + 1;
        state.pityLegendary =
          rarity === "legendary" ? 0 : state.pityLegendary + 1;
        if (rarity) {
          const item = receiveItem(state, e.item);
          state.lastLog = `🎒 ${item.name} Lv.${item.level}.`;
        } else
          state.lastLog =
            e.kind === "fake" ? "SSR giả: không có hiệu ứng." : "Hòm rỗng.";
        completeFloor(state, session, rng, 0);
      }
    } else if (e.type === "shrine") {
      if (action === "touch") {
        if (e.kind === "healing") heal(state, state.maxHp);
        if (e.kind === "armor") addSource(state, { [e.armorStat]: 5 });
        if (e.kind === "blood") addSource(state, { str: 8, vit: -5 });
        if (e.kind === "experience")
          state.bonus += Math.floor(state.stake * 0.25);
        if (e.kind === "corrupted") addSource(state, { str: 12, vit: -8 });
        if (e.kind === "fake") hurt(state, Math.max(10, state.maxHp * 0.3));
        state.lastLog = `Shrine ${e.kind}.`;
      } else state.lastLog = "Bỏ qua Shrine.";
      if (alive(state)) completeFloor(state, session, rng, 0);
    } else if (e.type === "trap") {
      if (e.kind !== "portal") {
        if (e.lucky) state.lastLog = "🍀 Lucky Break: tránh bẫy.";
        else if (e.kind === "tax") {
          penalty(state, 0.15);
          state.lastLog = "Thuế: mất 15% payout.";
        } else {
          state.potions = Math.max(0, state.potions - 1);
          state.lastLog = "Mất 1 bình máu nếu đang có.";
        }
        completeFloor(state, session, rng, 0);
      } else if (e.good) {
        if (e.effect === "healing") {
          addSource(state, { maxHp: 10 });
          heal(state, state.maxHp);
          state.potions = Math.min(5, state.potions + 1);
        }
        if (e.effect === "treasure")
          state.bonus += Math.floor(state.stake * 0.5);
        if (e.effect === "blessing")
          addSource(state, { str: 6, ene: 6, luck: 1 });
        state.lastLog = `Wrong Portal: ${e.effect}.`;
        completeFloor(state, session, rng, 0);
      } else {
        if (e.badEffect === "blood")
          hurt(state, state.maxHp * 0.15, true, true);
        if (e.badEffect === "mana") state.mana = 0;
        if (e.badEffect === "supply")
          state.potions = Math.max(0, state.potions - 2);
        if (e.badEffect === "payout") penalty(state, 0.1);
        if (e.badEffect === "curse") addSource(state, { str: -5, ene: -5 });
        state.encounter = e.enemy;
        state.lastLog = `Wrong Portal: ${e.badEffect}. Elite đánh phủ đầu.\n${enemyTurn(state, rng)}`;
      }
    } else if (e.type === "rngesus") {
      if (action === "fight") return "rngesus";
      if (action === "flee") {
        if (!e.fleeSuccess) {
          if (state.escapeTokens) state.escapeTokens--;
          else return "rngesus";
        }
        state.lastLog = "Thoát RNGesus.";
      }
      if (action === "bribe") {
        penalty(state, 0.4);
        state.lastLog = "Hối lộ: mất 40% payout.";
        remember(state, "bribe_rngesus", rng);
      }
      if (action === "pray") {
        if (!e.prayerSuccess) return "rngesus";
        receiveItem(state, e.prayerItem);
        state.lastLog = `Cầu nguyện thành công: ${e.prayerItem.name}.`;
        remember(state, "pray_rngesus", rng);
      }
      if (action === "ticket") {
        state.escapeTokens--;
        state.lastLog = "Dùng Vé Thoát Hiểm.";
      }
      completeFloor(state, session, rng, 0);
    } else if (e.type === "echo") {
      if (!echoes.owns(session, e.echo.id)) {
        state.lastLog = "Mộ đã hết thời gian claim.";
        completeFloor(state, session, rng, 0);
      } else if (action === "echo_pray" || action === "echo_skip") {
        if (action === "echo_pray") heal(state, state.maxHp * 0.15);
        echoes.release(session, e.echo.id);
        state.lastLog = "Để mộ yên nghỉ.";
        completeFloor(state, session, rng, 0);
      } else if (action === "echo_challenge") {
        state.encounter = e.challenger;
        state.lastLog = "Khiêu chiến Grave Echo mạnh hơn 25%.";
      } else {
        if (e.item) receiveSnapshot(state, e.item);
        if (e.awakens) {
          e.enemy.echoItem = null;
          state.encounter = e.enemy;
          state.lastLog = "Cướp mộ: Echo thức tỉnh!";
        } else {
          echoes.consume(session, e.echo.id);
          state.lastLog = "Cướp mộ an toàn.";
          completeFloor(state, session, rng, 0);
        }
      }
    } else if (e.type === "memory") {
      if (e.debt.good) {
        heal(state, state.maxHp * e.debt.healRate);
        state.bonus += Math.floor(state.stake * e.debt.bonusRate);
        state.lastLog = "The Tower Remembers: nhận hồi máu và bonus.";
        completeFloor(state, session, rng, 0);
      } else if (e.debt.kind === "tax") {
        penalty(state, 0.1);
        state.lastLog = "The Tower Remembers: mất 10% payout.";
        completeFloor(state, session, rng, 0);
      } else {
        state.encounter = e.enemy;
        state.lastLog = "The Tower Remembers: Bounty Hunter xuất hiện!";
      }
    } else {
      state.lastLog = "Phòng trống, đi tiếp.";
      completeFloor(state, session, rng, 0);
    }
  }
  recompute(state);
  if (state.discardedTicketsThisTurn)
    state.lastLog += `\n🎫 Bỏ ${state.discardedTicketsThisTurn} vé nhận thêm; chỉ giữ tối đa 1.`;
  delete state.discardedTicketsThisTurn;
  state.lastStatChanges = Object.fromEntries(
    Object.entries(before)
      .map(([key, value]) => [key, +(state[key] - value).toFixed(8)])
      .filter(([, value]) => value),
  );
  return alive(state) ? null : "death";
}
module.exports = {
  ITEMS,
  EVENTS,
  EVENT_NAMES,
  initialize,
  normalize,
  payout,
  rawPayout,
  heal,
  hurt,
  receiveItem,
  receiveSnapshot,
  cleanse,
  grind,
  remember,
  completeFloor,
  makeChest,
  makeSurprise,
  generateEncounter,
  actions,
  act,
  playerAttack,
  enemyTurn,
  incomingPreview,
  physicalRange,
  attackDamage,
  legendaryChance,
  serviceCost,
};
