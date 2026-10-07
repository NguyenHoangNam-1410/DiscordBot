// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const crypto = require("node:crypto");

  const { performance } = require("node:perf_hooks");

  const {
    rngesusChance,
    rngesusEncounterChance,
    resetRngesusEncounter,
  } = require("../events/rngesus");

  const { AsyncLocalStorage } = require("node:async_hooks");

  const {
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");

  const emoji = require("../../discordEmojiMap");

  const { appEmoji } = require("../../utils/appEmoji");

  const { E, eventIcon } = require("../shared/icons");

  const icon = (key, fallback) => appEmoji(key, emoji[`:${key}:`] || fallback);

  const { formatCoins } = require("../../utils/economy");

  const { db } = require("../../db");

  const {
    spendCoins,
    settleReservedGame,
    creditCoins,
    getAccount,
  } = require("../../services/economyService");

  const { getGameBetLimit } = require("../../services/gameBetLimitService");

  const { getGameChannel } = require("../../services/gameChannelService");

  const { requireGameChannel } = require("../../utils/gameChannel");

  const { createFairness, fairInt } = require("../../services/fairnessService");

  const hardcoreRepository = require("../storage/sessions");

  const godRngesus = require("../events/godRngesus");

  const godReveal = require("../events/godReveal");

  const { addDiamonds } = require("../../services/playerLevelService");

  const hardcoreView = require("../legacy/ui/index");

  const hardcoreInventory = require("../inventory/service");

  const hardcoreInventoryView = require("../inventory/view");

  const {
    rarityLabel,
    normalizeEquipment,
    effectText,
  } = require("../shared/equipment");

  const { chaosLabel } = hardcoreView;

  const {
    clamp,
    hitChance,
    defenseReduction,
    physicalAfterDefense,
    magicAfterResistance,
    enemyScale,
    baseMultiplier,
    potentialPayout,
    runDiamondReward,
    REGIONS,
    RIFT_MODIFIERS,
    regionForFloor,
    checkpointGrowth,
    BOSS_MECHANICS,
    enemyDamageType,
    serviceCost,
    forgeTarget,
    curseTarget,
    luckyBreakChance,
    goblinCatchChance,
    GOBLIN_REWARDS,
    goblinRewardRarity,
    goblinEscapeCost,
    itemEffects,
    itemCurse,
    classShrineActive,
    payoutReductionCost,
    taxCost,
    SURPRISE_EVENTS,
    SURPRISE_ODDS,
    PORTAL_GOOD_CHANCE,
    PORTAL_GOOD_EFFECTS,
    portalBadEffects,
    portalEffectOdds,
    SHRINE_KINDS,
    SHRINE_EFFECTS,
    shrineFakeDamage,
    MERCHANT_OFFERS,
  } = require("../legacy/formulas/index");

  // Preserve the legacy catalog for saved runs; v2 has a separate source-based engine.
  const { ITEMS } = require("../itemLegacy");

  const hardcoreV2 = require("../engine/index");

  const hardcoreV2View = require("../ui/index");

  const hardcoreStats = require("../engine/stats");

  const hardcoreEchoes = require("../storage/echoes");

  const { RELEASE, isV2, useV2 } = require("../shared/version");

  const MIN_BET = 10;

  const MAX_BET = 100_000;

  const MAX_PAYOUT = 10_000_000;

  const MAX_FLOOR = 999;

  const COMPLETION_FLOOR = 100;

  const STALE_MS = 7 * 24 * 60 * 60 * 1000;

  const {
    LUCKY_BREAK_LOG,
    CLASSES,
    ENEMY_NAMES,
    BOSS_NAMES,
    FALLBACK_ITEMS,
    ITEM_LIMITS,
    DISPLAY_STATS,
  } = require("../legacy/catalog");

  const fairStateContext = new AsyncLocalStorage();

  const noteEvent = (...args) => hardcoreV2.noteEvent(...args);

  const getSession = hardcoreRepository.getSession;

  const getHardcoreByUser = hardcoreRepository.getByUser;

  const saveState = hardcoreRepository.saveState;

  const setMessageId = hardcoreRepository.setMessageId;

  const SETUP_IDLE_MS = 5 * 60_000;

  const setupDrafts = new Map();

  const TRAP_KILLERS = Object.freeze({
    tax_collector: "Tax Collector",
    tax: "Tax Collector",
    portal: "Wrong Portal",
    potion_thief: "Potion Thief",
    wrong_portal: "Wrong Portal",
  });

  const hardcoreQueues = new Map();
  return {
    crypto,
    performance,
    rngesusChance,
    rngesusEncounterChance,
    resetRngesusEncounter,
    AsyncLocalStorage,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    emoji,
    appEmoji,
    E,
    eventIcon,
    icon,
    formatCoins,
    db,
    spendCoins,
    settleReservedGame,
    creditCoins,
    getAccount,
    getGameBetLimit,
    getGameChannel,
    requireGameChannel,
    createFairness,
    fairInt,
    hardcoreRepository,
    godRngesus,
    godReveal,
    addDiamonds,
    hardcoreView,
    hardcoreInventory,
    hardcoreInventoryView,
    rarityLabel,
    normalizeEquipment,
    effectText,
    chaosLabel,
    clamp,
    hitChance,
    defenseReduction,
    physicalAfterDefense,
    magicAfterResistance,
    enemyScale,
    baseMultiplier,
    potentialPayout,
    runDiamondReward,
    REGIONS,
    RIFT_MODIFIERS,
    regionForFloor,
    checkpointGrowth,
    BOSS_MECHANICS,
    enemyDamageType,
    serviceCost,
    forgeTarget,
    curseTarget,
    luckyBreakChance,
    goblinCatchChance,
    GOBLIN_REWARDS,
    goblinRewardRarity,
    goblinEscapeCost,
    itemEffects,
    itemCurse,
    classShrineActive,
    payoutReductionCost,
    taxCost,
    SURPRISE_EVENTS,
    SURPRISE_ODDS,
    PORTAL_GOOD_CHANCE,
    PORTAL_GOOD_EFFECTS,
    portalBadEffects,
    portalEffectOdds,
    SHRINE_KINDS,
    SHRINE_EFFECTS,
    shrineFakeDamage,
    MERCHANT_OFFERS,
    ITEMS,
    hardcoreV2,
    hardcoreV2View,
    hardcoreStats,
    hardcoreEchoes,
    RELEASE,
    isV2,
    useV2,
    MIN_BET,
    MAX_BET,
    MAX_PAYOUT,
    MAX_FLOOR,
    COMPLETION_FLOOR,
    STALE_MS,
    LUCKY_BREAK_LOG,
    CLASSES,
    ENEMY_NAMES,
    BOSS_NAMES,
    FALLBACK_ITEMS,
    fairStateContext,
    ITEM_LIMITS,
    noteEvent,
    getSession,
    getHardcoreByUser,
    saveState,
    setMessageId,
    SETUP_IDLE_MS,
    setupDrafts,
    TRAP_KILLERS,
    DISPLAY_STATS,
    hardcoreQueues,
  };
};
