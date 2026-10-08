"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    royal,
    bosses,
    ITEMS,
    stats,
    itemPassives,
    godRngesus,
    memories,
    rngesusEncounterChance,
    world,
    echoes,
    goblinRewardRarity,
    EVENTS,
    PURIFIER_COST_RATE,
    PURIFIER_EVENT_WEIGHT,
    PAID_EVENTS,
    EVENT_NAMES,
    pick,
    int,
    randomItem,
    MERCHANT_PRICES,
    PAYOUT_PRICES,
    BLOOD_PRICES,
    DIAMOND_PRICES,
  } = dependencies;
  const rngesusFleeChance = (...args) =>
    dependencies.rngesusFleeChance(...args);
  const rngesusPrayerChance = (...args) =>
    dependencies.rngesusPrayerChance(...args);
  const payout = (...args) => dependencies.payout(...args);
  const penalty = (...args) => dependencies.penalty(...args);
  const makeChest = (...args) => dependencies.makeChest(...args);
  const makeShrine = (...args) => dependencies.makeShrine(...args);

  function purifierCost(state) {
    return serviceCost(state, PURIFIER_COST_RATE);
  }

  function serviceCost(state, fraction) {
    return Math.max(1, Math.ceil(payout(state) * fraction));
  }

  // Convert pending pre-policy shops once; retain offers, chest outcomes and locked prices thereafter.
  function upgradeCoinShopPrices(state, encounter) {
    if (
      encounter?.type !== "surprise" ||
      !["merchant", "payout_shop"].includes(encounter.kind) ||
      encounter.coinPayoutPriceVersion === 1
    )
      return;
    for (const offer of encounter.offers || []) {
      const fraction =
        encounter.kind === "merchant"
          ? MERCHANT_PRICES[offer.key]
          : PAYOUT_PRICES[offer.item?.rarity];
      if (!fraction) continue;
      offer.price = serviceCost(state, fraction);
      offer.fraction = fraction;
      delete offer.basePrice;
      delete offer.discount;
    }
    delete encounter.passivePriceVersion;
    itemPassives.discountOffers(state, encounter);
    encounter.coinPayoutPriceVersion = 1;
  }

  function makeSurprise(state, rng, kind = null) {
    const eligible = EVENTS.filter((key) => {
      if (state.floor === 1 && PAID_EVENTS.has(key)) return false;
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
        if (key === "payout_shop" && payout(state) < 1) return false;
      }
      return true;
    });
    if (state.floor === 1 && PAID_EVENTS.has(kind)) kind = null;
    if (royal.eligible(state).length) eligible.push("royal_invitation");
    const eventPool = eligible.flatMap((key) =>
      Array(
        key === "royal_invitation"
          ? royal.WEIGHT
          : key === "purifier"
            ? PURIFIER_EVENT_WEIGHT
            : 1,
      ).fill(key),
    );
    kind = kind || pick(eventPool, rng);
    if (kind === "royal_invitation") return royal.encounter(state);
    const e = {
      type: "surprise",
      kind,
      name: EVENT_NAMES[kind],
      roll: rng(),
      roll2: rng(),
    };
    if (kind === "goblin")
      e.goblinItem = randomItem(goblinRewardRarity(e.roll2), rng);
    const itemPool = state.items.filter(
      (x) =>
        kind !== "purifier" ||
        (x.definition.curse && x.level > (x.cleansedLevels || 0)),
    );
    if (["blacksmith", "purifier", "horadric"].includes(kind)) {
      e.targetId = pick(itemPool, rng)?.definition.id;
      e.forgeStat = rng() < 0.5 ? "str" : "vit";
      if (kind === "purifier") {
        e.targetId = null;
        e.purifierPage = 0;
      }
    }
    if (kind === "adventurer") {
      e.rescueItem = randomItem(rng() < 0.3 ? "rare" : "common", rng);
      e.robItem = randomItem(rng() < 0.25 ? "cursed" : "legendary", rng);
    }
    if (kind === "fountain") {
      e.goodThreshold = itemPassives.goodChance(state, 0.85);
      e.healThreshold = (0.6 * e.goodThreshold) / 0.85;
      e.enemy = world.makeEnemy(state, "mimic", "Blood Mimic", rng);
    }
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
      e.doors = {
        light: rng() < itemPassives.goodChance(state, 0.7),
        gold: rng() < itemPassives.goodChance(state, 0.7),
        dark: rng() < itemPassives.goodChance(state, 0.6),
      };
      e.doorChances = {
        light: itemPassives.goodChance(state, 0.7),
        gold: itemPassives.goodChance(state, 0.7),
        dark: itemPassives.goodChance(state, 0.6),
      };
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
      const available = payout(state),
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
            ? Math.max(1, Math.ceil(available * PAYOUT_PRICES[rarity]))
            : kind === "blood_shop"
              ? Math.max(1, Math.ceil(maxHp * BLOOD_PRICES[rarity]))
              : DIAMOND_PRICES[rarity];
        return { item: randomItem(rarity, rng), price };
      });
      state.shopCounts[kind] = (state.shopCounts[kind] || 0) + 1;
      state.shopLast[kind] = state.floor;
      if (kind === "diamond_shop") e.priceVersion = 2;
    }
    if (kind === "merchant") {
      const pool = Object.entries(MERCHANT_PRICES).map(([key, fraction]) => ({
        key,
        fraction,
      }));
      e.offers = [];
      while (e.offers.length < 3) {
        const index = int(0, pool.length - 1, rng);
        const offer = pool.splice(index, 1)[0];
        e.offers.push({
          ...offer,
          price: serviceCost(state, offer.fraction),
          item: offer.key === "item" ? randomItem("rare", rng) : null,
          ...(offer.key === "chest" ? { chest: makeChest(state, rng) } : {}),
        });
      }
      e.priceVersion = 2;
    }
    if (["merchant", "payout_shop"].includes(kind))
      e.coinPayoutPriceVersion = 1;
    itemPassives.discountOffers(state, e);
    return itemPassives.prepareForecast(state, e, rng);
  }

  function rollRngesus(state, rng) {
    const chance = rngesusEncounterChance(state);
    state.lastChaosChance = chance;
    state.lastChaosSpike = false;
    if (!chance) return false;
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
    if (
      bosses.enabled(state) &&
      (bosses.at(state.floor) || state.floor === 333)
    )
      return generateRawEncounter(state, session, rng);
    const god = godRngesus.tryEncounter(state, session, rng);
    if (god) return god;
    return itemPassives.prepareForecast(
      state,
      generateRawEncounter(state, session, rng),
      rng,
    );
  }

  function generateRawEncounter(state, session, rng) {
    if (bosses.enabled(state) && state.floor === 333 && !state.prophecy)
      return { type: "prophecy", name: "Threefold Prophecy" };
    if (bosses.enabled(state) && bosses.at(state.floor)) {
      const enemy = world.makeEnemy(
        state,
        state.floor === 999 ? "final_boss" : "boss",
        null,
        rng,
      );
      if (bosses.CHEST_FLOORS.includes(state.floor))
        enemy.boss.chestItem = randomItem(
          rng() < 0.7 ? "legendary" : "cursed",
          rng,
        );
      if (state.floor === 666) {
        enemy.boss.rewardItem = structuredClone(
          pick(ITEMS[rng() < 0.666 ? "legendary" : "cursed"], rng),
        );
        return { type: "boss_gate", name: enemy.name, enemy };
      }
      return enemy;
    }
    if (state.floor === 999)
      return world.makeEnemy(state, "final_boss", null, rng);
    if (state.floor % 50 === 0)
      return world.makeEnemy(state, "boss", null, rng);
    if (rollRngesus(state, rng))
      return {
        type: "rngesus",
        name: "RNGesus",
        encounterChance: state.lastChaosChance,
        fleeChance: rngesusFleeChance(state),
        fleeSuccess: rng() < rngesusFleeChance(state),
        prayerChance: rngesusPrayerChance(state),
        prayerSuccess: rng() < rngesusPrayerChance(state),
        prayerItem: randomItem("cursed", rng),
      };
    const due = state.debts.findIndex(
      (debt) =>
        debt.due <= state.floor && (state.floor > 1 || debt.kind !== "tax"),
    );
    if (due >= 0) {
      const debt = state.debts.splice(due, 1)[0];
      return memories.makeEncounter(state, debt, rng);
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
    if (roll < 0.83 - extra / 2) return makeShrine(state, rng);
    if (roll < 0.88) return makeChest(state, rng, true);
    if (roll < 0.94) {
      const kind = pick(
        state.floor === 1
          ? ["potion_thief", "portal"]
          : ["tax", "potion_thief", "portal"],
        rng,
      );
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
        good:
          rng() <
          (kind === "portal" ? itemPassives.goodChance(state, 0.5) : 0.5),
        goodChance:
          kind === "portal" ? itemPassives.goodChance(state, 0.5) : 0.5,
        effect:
          kind === "portal"
            ? pick(["healing", "treasure", "blessing"], rng)
            : null,
        badEffect: pick(
          state.floor === 1
            ? ["blood", "mana", "supply", "curse"]
            : ["blood", "mana", "supply", "payout", "curse"],
          rng,
        ),
        enemy: world.makeEnemy(state, "elite", "Rift Ambusher", rng),
      };
    }
    if (roll < 0.98 && state.floor - (state.lastSurpriseFloor ?? -10) >= 2) {
      state.lastSurpriseFloor = state.floor;
      return makeSurprise(state, rng);
    }
    return { type: "empty", name: "Phòng trống" };
  }
  return {
    purifierCost,
    serviceCost,
    upgradeCoinShopPrices,
    makeSurprise,
    rollRngesus,
    echoEnemy,
    generateEncounter,
    generateRawEncounter,
  };
};
