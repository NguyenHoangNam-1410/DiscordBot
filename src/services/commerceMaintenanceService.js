const { cleanupShopPurchases } = require("./shopService");
const { cleanupClosedCoinRequestMessages } = require("./coinRequestService");
const { cleanupProgressionData } = require("./progressionService");
const { cleanupGachaHistory } = require("./gachaService");
const { cleanupDiamondTransactions } = require("./playerLevelService");
const { cleanupOldRounds } = require("./multiplayerGameService");
const { cleanupFinishedGameRecords } = require("./gameRecordCleanupService");

function startCommerceMaintenance(client, logger = console) {
  const run = async () => {
    const purchases = cleanupShopPurchases();
    const requests = await cleanupClosedCoinRequestMessages(client, logger);
    const progression = cleanupProgressionData();
    const gachaHistory = cleanupGachaHistory();
    const diamondTransactions = cleanupDiamondTransactions();
    const rounds = cleanupOldRounds(logger);
    const gameRecords = cleanupFinishedGameRecords();
    logger.info?.(
      {
        purchases,
        requests: requests.records,
        messages: requests.messages,
        progression,
        gachaHistory,
        diamondTransactions,
        rounds,
        gameRecords,
      },
      "commerce maintenance completed",
    );
  };
  run().catch((error) =>
    logger.error?.({ err: error }, "commerce maintenance failed"),
  );
  const timer = setInterval(() => {
    run().catch((error) =>
      logger.error?.({ err: error }, "commerce maintenance failed"),
    );
  }, 3_600_000);
  timer.unref?.();
  return timer;
}
module.exports = { startCommerceMaintenance };
