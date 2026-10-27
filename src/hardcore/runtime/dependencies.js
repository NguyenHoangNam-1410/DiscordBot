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

  const {
    getGameChannel,
    channelHasGame,
  } = require("../../services/gameChannelService");

  const { requireGameChannel } = require("../../utils/gameChannel");

  const { createFairness, fairInt } = require("../../services/fairnessService");

  const hardcoreRepository = require("../storage/sessions");

  const godRngesus = require("../events/godRngesus");

  const godReveal = require("../events/godReveal");

  const { addDiamonds } = require("../../services/playerLevelService");

  const hardcoreView = require("../ui/index");

  const hardcoreInventory = require("../inventory/service");

  const hardcoreInventoryView = require("../inventory/view");

  const { runDiamondReward } = require("../shared/rewards");
  const hardcoreV2 = require("../engine/index");

  const hardcoreV2View = require("../ui/index");

  const hardcoreStats = require("../engine/stats");

  const hardcoreEchoes = require("../storage/echoes");

  const { RELEASE, isV2 } = require("../shared/version");

  const MIN_BET = 10;

  const MAX_BET = 100_000;

  const MAX_PAYOUT = 10_000_000;

  const MAX_FLOOR = 999;

  const COMPLETION_FLOOR = 100;

  const STALE_MS = 7 * 24 * 60 * 60 * 1000;

  const { CLASSES } = hardcoreStats;

  const fairStateContext = new AsyncLocalStorage();

  const getSession = hardcoreRepository.getSession;

  const getHardcoreByUser = (guildId, userId) => {
    const session = hardcoreRepository.getByUser(guildId, userId);
    return dependencies.retireLegacySession(session) ? null : session;
  };

  const saveState = hardcoreRepository.saveState;

  const setMessageId = hardcoreRepository.setMessageId;

  const SETUP_IDLE_MS = 5 * 60_000;

  const setupDrafts = new Map();

  const TRAP_KILLERS = Object.freeze({
    tax_collector: "Tax Collector",
    tax: "Tax Collector",
    portal: "Wrong Portal",
    potion_thief: "Potion Thief",
    bounty_hunter: "Bounty Hunter",
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
    channelHasGame,
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
    runDiamondReward,
    hardcoreV2,
    hardcoreV2View,
    hardcoreStats,
    hardcoreEchoes,
    RELEASE,
    isV2,
    MIN_BET,
    MAX_BET,
    MAX_PAYOUT,
    MAX_FLOOR,
    COMPLETION_FLOOR,
    STALE_MS,
    CLASSES,
    fairStateContext,
    getSession,
    getHardcoreByUser,
    saveState,
    setMessageId,
    SETUP_IDLE_MS,
    setupDrafts,
    TRAP_KILLERS,
    hardcoreQueues,
  };
};
