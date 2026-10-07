// Composed once by ../runtime/index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    potentialPayout,
    forgeTarget,
    curseTarget,
    goblinRewardRarity,
    SURPRISE_EVENTS,
    SURPRISE_ODDS,
    PORTAL_GOOD_CHANCE,
    PORTAL_GOOD_EFFECTS,
    portalBadEffects,
    portalEffectOdds,
    SHRINE_KINDS,
    MERCHANT_OFFERS,
    ITEMS,
    MAX_FLOOR,
    BOSS_NAMES,
  } = dependencies;
  const randomFloat = (...args) => dependencies.randomFloat(...args);
  const randomInt = (...args) => dependencies.randomInt(...args);
  const pick = (...args) => dependencies.pick(...args);
  const makeEnemy = (...args) => dependencies.makeEnemy(...args);
  const makeChest = (...args) => dependencies.makeChest(...args);
  const rollRngesus = (...args) => dependencies.rollRngesus(...args);

  function makeWrongPortal(state, rolls = {}) {
    const good = (rolls.goodRoll ?? randomFloat()) < PORTAL_GOOD_CHANCE;
    const effects = good ? PORTAL_GOOD_EFFECTS : portalBadEffects(state);
    const effectRoll = rolls.effectRoll ?? randomFloat();
    return {
      type: "trap",
      kind: "wrong_portal",
      portal: {
        good,
        goodChance: PORTAL_GOOD_CHANCE,
        odds: portalEffectOdds(state),
        effect:
          effects[
            Math.min(
              effects.length - 1,
              Math.floor(effectRoll * effects.length),
            )
          ],
      },
      enemy: good
        ? null
        : makeEnemy(state.floor, "elite", "Rift Ambusher", state.modifiers),
      luckyBreakRoll: good ? null : (rolls.luckyBreakRoll ?? randomFloat()),
    };
  }

  function makeSurprise(state, forcedKind = null) {
    const pool = Object.keys(SURPRISE_EVENTS).filter(
      (key) =>
        (key !== "blacksmith" ||
          (forgeTarget(state) && potentialPayout(state) > 0)) &&
        (key !== "purifier" ||
          (curseTarget(state) && potentialPayout(state) > 0)) &&
        (key !== "horadric" || forgeTarget(state)) &&
        (key !== "contract" ||
          (!state.contract && state.floor <= MAX_FLOOR - 3)) &&
        (!["merchant", "gambler"].includes(key) ||
          potentialPayout(state) > 0) &&
        (key !== "sacrifice" ||
          state.hp > Math.max(1, Math.floor(state.maxHp * 0.2)) ||
          potentialPayout(state) > 0) &&
        (key !== "healer" || state.hp < state.maxHp || state.potions < 5),
    );
    const kind = forcedKind || pick(pool);
    const event = { type: "surprise", kind };
    if (kind === "goblin") {
      event.successRoll = randomFloat();
      event.goblinItem = pick(ITEMS[goblinRewardRarity(randomFloat())]);
    }
    if (kind === "gambler")
      event.win = randomFloat() < SURPRISE_ODDS.gamblerWin;
    if (kind === "adventurer") {
      event.adventurerVersion = 3;
      const rarity =
        randomFloat() < SURPRISE_ODDS.adventurerRescueCommon
          ? "common"
          : "rare";
      event.rescueItem = pick(ITEMS[rarity]);
      event.robItem =
        randomFloat() < SURPRISE_ODDS.adventurerRobLegendary
          ? pick(ITEMS.legendary)
          : null;
    }
    if (kind === "fountain") {
      const roll = randomFloat();
      event.outcome =
        roll < SURPRISE_ODDS.fountainHeal
          ? "heal"
          : roll < SURPRISE_ODDS.fountainHeal + SURPRISE_ODDS.fountainMaxHp
            ? "hp"
            : "mimic";
      if (event.outcome === "mimic")
        event.enemy = makeEnemy(
          state.floor,
          "mimic",
          "Blood Mimic",
          state.modifiers,
        );
    }
    if (kind === "horadric") {
      const target = forgeTarget(state);
      event.targetName = target.name;
      event.targetRarity = target.rarity;
      event.targetBase = target.definition?.base || "";
    }
    if (kind === "merchant") {
      const offers = Object.keys(MERCHANT_OFFERS);
      event.offers = [];
      while (event.offers.length < 3)
        event.offers.push(offers.splice(randomInt(0, offers.length - 1), 1)[0]);
      event.item = pick(ITEMS.rare);
    }
    if (kind === "mirror") {
      event.lucky = randomFloat() < SURPRISE_ODDS.mirrorLucky;
      event.enemy = {
        ...makeEnemy(state.floor, "elite", "Mirror Clone", state.modifiers),
        hp: state.maxHp,
        maxHp: state.maxHp,
        damageMin: state.damageMin,
        damageMax: state.damageMax,
        defense: state.defense,
        accuracy: state.accuracy,
        evasion: state.evasion,
        resistance: state.resistance,
        critChance: state.critChance,
        damageType: "physical",
        nextDamageType: "physical",
        magicChance: 0,
      };
    }
    if (kind === "treasure_room") {
      event.mimicChest = pick(["red", "blue", "gold"]);
      event.enemy = makeEnemy(
        state.floor,
        "mimic",
        "Treasure Room Mimic",
        state.modifiers,
      );
    }
    if (kind === "contract") event.item = pick(ITEMS.legendary);
    if (kind === "doors") {
      event.doors = {
        light: randomFloat() < SURPRISE_ODDS.doorLight,
        gold: randomFloat() < SURPRISE_ODDS.doorGold,
        dark: randomFloat() < SURPRISE_ODDS.doorDark,
      };
      event.item = pick(ITEMS.legendary);
      event.mimic = makeEnemy(
        state.floor,
        "mimic",
        "Golden Door Mimic",
        state.modifiers,
      );
      event.boss = makeEnemy(
        state.floor,
        "boss",
        pick(BOSS_NAMES),
        state.modifiers,
      );
      event.boss.name = `Premature Rift Boss · ${event.boss.name}`;
    }
    return event;
  }

  function generateEncounter(state) {
    if (state.floor === MAX_FLOOR)
      return makeEnemy(state.floor, "final_boss", null, state.modifiers);
    if (state.floor % 50 === 0)
      return makeEnemy(state.floor, "boss", null, state.modifiers);
    if (rollRngesus(state)) {
      const fleeRoll = randomFloat();
      return {
        type: "rngesus",
        name: "RNGesus",
        fleeRoll,
        fleeSuccess: fleeRoll < 0.75,
        fleeChance: 0.75,
        prayerSuccess: randomFloat() < 0.3,
        prayerChance: 0.3,
        prayerRarity: randomFloat() < 0.85 ? "legendary" : "cursed",
        prayerItemRoll: randomFloat(),
        chaosChance: state.lastChaosChance,
        chaosSpike: state.lastChaosSpike,
      };
    }
    const roll = randomFloat();
    const extraChests = Math.min(
      0.16,
      (state.modifiers?.unstable_rift || 0) * 0.02,
    );
    if (roll < 0.53 - extraChests)
      return makeEnemy(state.floor, "normal", null, state.modifiers);
    if (roll < 0.65 - extraChests)
      return makeEnemy(state.floor, "elite", null, state.modifiers);
    if (roll < 0.75 - extraChests / 2) return makeChest(state);
    if (roll < 0.83 - extraChests / 2)
      return {
        type: "shrine",
        kind: pick(SHRINE_KINDS),
      };
    if (roll < 0.88) return makeChest(state, true);
    if (roll < 0.94) {
      const kind = pick(["tax_collector", "potion_thief", "wrong_portal"]);
      return kind === "wrong_portal"
        ? makeWrongPortal(state)
        : { type: "trap", kind, luckyBreakRoll: randomFloat() };
    }
    if (roll < 0.98) return makeSurprise(state);
    return { type: "empty" };
  }
  return { makeWrongPortal, makeSurprise, generateEncounter };
};
