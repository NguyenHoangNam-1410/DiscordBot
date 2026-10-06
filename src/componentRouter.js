const { MessageFlags } = require("discord.js");
const {
  handleBetButton,
  handleBetModal,
} = require("./services/multiplayerGameService");
const { handleBlackjackButton } = require("./services/blackjackService");
const {
  handleBlackjackTableButton,
  handleBlackjackTablePrivateButton,
  getBlackjackTableLock,
} = require("./services/blackjackService");
const {
  handleBlackjackDuelButton,
} = require("./services/blackjackDuelService");
const {
  handlePokerButton,
  handlePokerPrivateButton,
  handlePokerModal,
} = require("./services/pokerService");
const {
  handleHorseButton,
  handleHorseModal,
} = require("./services/horseRaceService");
const { handleMinesButton } = require("./services/minesService");
const { handleCoquayButton } = require("./services/coquayService");
const {
  handleHardcoreButton,
  handleHardcoreSetup,
} = require("./services/hardcoreService");
const { handleCoinRequestButton } = require("./services/coinRequestService");
const { handleReplayButton } = require("./services/replayService");
const { handleChinchiroButton } = require("./services/chinchiroService");
const profileCommand = require("./commands/hoso");
const shopCommand = require("./commands/shop");
const gachaCommand = require("./commands/gacha");
const useCommand = require("./commands/use");
const leaderboardCommand = require("./commands/xephang");
const helpCommand = require("./commands/trogiup");
const rulesCommand = require("./commands/luat");
const gameCommand = require("./commands/game");
const vuaTiengVietCommand = require("./commands/vuatiengviet");
const itemCatalogViewCommand = require("./commands/itemCatalogView");
const adminCommand = require("./commands/quantri");
const hardcoreCommand = require("./commands/hardcore");
const {
  handleRoleRewardInteraction,
  handleWinMultiplierInteraction,
} = require("./commands/quantriPanels");
const checklistCommand = require("./commands/kiemtra");

const { handleStore, handleBag } = require("./services/hardcoreInventoryView");
const ROUTES = Object.freeze([
  {
    kind: "button",
    prefix: "changelog:",
    handle: (interaction) => require("./commands/changelog").handleButton(interaction),
  },
  {
    kind: "button",
    prefix: "hardcore-tower:",
    handle: (interaction, logger) =>
      require("./services/hardcoreTowerService").handleTowerButton(
        interaction,
        logger,
      ),
  },
  ...["button", "select", "modal"].map((kind) => ({
    kind,
    prefix: "hardcore-store:",
    handle: handleStore,
  })),
  ...["button", "select"].map((kind) => ({
    kind,
    prefix: "hardcore-bag:",
    handle: handleBag,
  })),
  {
    kind: "button",
    prefix: "luat:",
    handle: (interaction) => rulesCommand.handleButton(interaction),
  },
  {
    kind: "button",
    prefix: "replay:",
    handle: (interaction, logger) => handleReplayButton(interaction, logger),
  },
  {
    kind: "select",
    prefix: "hoso:",
    handle: (interaction) => profileCommand.handleSelect(interaction),
  },
  { kind: "select", prefix: "hardcore-hoso:", handle: (i) => hardcoreCommand.handleProfileSelect(i) },
  { kind: "button", prefix: "hardcore-hosopg:", handle: (i) => hardcoreCommand.handleProfilePage(i) },
  { kind: "select", prefix: "hardcore-top:", handle: (i) => hardcoreCommand.handleTopSelect(i) },
  { kind: "button", prefix: "hardcore-toppg:", handle: (i) => hardcoreCommand.handleTopPage(i) },
  {
    kind: "select",
    prefix: "hardcore-rates:",
    handle: (interaction) => hardcoreCommand.handleRatesSelect(interaction),
  },
  {
    kind: "select",
    prefix: "shop:",
    handle: (interaction) => shopCommand.handleSelect(interaction),
  },
  { kind: "select", prefix: "hardcore-setup:", handle: handleHardcoreSetup },
  {
    kind: "select",
    prefix: "use:",
    handle: (interaction) => useCommand.handleSelect(interaction),
  },
  {
    kind: "select",
    prefix: "use-filter:",
    handle: (interaction) => useCommand.handleFilter(interaction),
  },
  {
    kind: "select",
    prefix: "iteminfo-filter:",
    handle: (interaction) => itemCatalogViewCommand.handleFilter(interaction),
  },
  {
    kind: "select",
    prefix: "game-config-select",
    handle: (interaction) => gameCommand.handleConfigSelect(interaction),
  },
  {
    kind: "select",
    prefix: "xephang:",
    handle: (interaction) => leaderboardCommand.handleSelect(interaction),
  },
  {
    kind: "select",
    prefix: "trogiup:",
    handle: (interaction) => helpCommand.handleSelect(interaction),
  },
  {
    kind: "select",
    prefix: "kiemtra:",
    handle: (interaction) => checklistCommand.handleSelect(interaction),
  },
  {
    kind: "select",
    prefix: "kiemtra-status:",
    handle: (interaction) =>
      checklistCommand.handleAchievementFilter(interaction),
  },
  {
    kind: "select",
    prefix: "kiemtra-category:",
    handle: (interaction) =>
      checklistCommand.handleAchievementFilter(interaction),
  },
  {
    kind: "button",
    prefix: "kiemtra-page:",
    handle: (interaction) =>
      checklistCommand.handleAchievementPage(interaction),
  },
  {
    kind: "button",
    prefix: "gacha-history:",
    handle: (interaction) => gachaCommand.handleHistoryButton(interaction),
  },
  {
    kind: "button",
    prefix: "gacha:",
    handle: (interaction) => gachaCommand.handleButton(interaction),
  },
  { kind: "button", prefix: "chinchiro:", handle: handleChinchiroButton },
  {
    kind: "button",
    prefix: "vuatiengviet:",
    handle: (interaction) => vuaTiengVietCommand.handleButton(interaction),
  },
  {
    kind: "button",
    prefix: "use-page:",
    handle: (interaction) => useCommand.handlePage(interaction),
  },
  {
    kind: "button",
    prefix: "iteminfo-page:",
    handle: (interaction) => itemCatalogViewCommand.handlePage(interaction),
  },
  {
    kind: "button",
    prefix: "admin-clear-all:",
    handle: (interaction) => adminCommand.handleClearAllButton(interaction),
  },
  {
    kind: "button",
    prefix: "admin-maintenance:",
    handle: (interaction) => adminCommand.handleMaintenanceButton(interaction),
  },
  {
    kind: "button",
    prefix: "admin-rolereward:",
    handle: handleRoleRewardInteraction,
  },
  {
    kind: "select",
    prefix: "admin-rolereward:",
    handle: handleRoleRewardInteraction,
  },
  {
    kind: "modal",
    prefix: "admin-rolereward:",
    handle: handleRoleRewardInteraction,
  },
  {
    kind: "button",
    prefix: "admin-winmult:",
    handle: handleWinMultiplierInteraction,
  },
  {
    kind: "select",
    prefix: "admin-winmult:",
    handle: handleWinMultiplierInteraction,
  },
  {
    kind: "modal",
    prefix: "admin-winmult:",
    handle: handleWinMultiplierInteraction,
  },
  { kind: "button", prefix: "anxin:", handle: handleCoinRequestButton },
  { kind: "button", prefix: "bjduel:", handle: handleBlackjackDuelButton },
  {
    kind: "button",
    prefix: "poker-private:",
    handle: handlePokerPrivateButton,
  },
  { kind: "button", prefix: "poker:", handle: handlePokerButton },
  { kind: "button", prefix: "hardcore:", handle: handleHardcoreButton },
  { kind: "button", prefix: "hardcore-setup:", handle: handleHardcoreSetup },
  { kind: "button", prefix: "mines:", handle: handleMinesButton },
  { kind: "button", prefix: "coquay:", handle: handleCoquayButton },
  { kind: "button", prefix: "horserace:", handle: handleHorseButton },
  { kind: "button", prefix: "blackjack:", handle: handleBlackjackButton },
  {
    kind: "button",
    prefix: "blackjack-table-private:",
    handle: handleBlackjackTablePrivateButton,
  },
  {
    kind: "button",
    prefix: "blackjack-table:",
    handle: handleBlackjackTableButton,
  },
  { kind: "button", prefix: "gamebet:", handle: handleBetButton },
  { kind: "modal", prefix: "horserace-modal:", handle: handleHorseModal },
  {
    kind: "modal",
    prefix: "hardcore-setup-modal:",
    handle: handleHardcoreSetup,
  },
  { kind: "modal", prefix: "gamebet-modal:", handle: handleBetModal },
  { kind: "modal", prefix: "poker-modal:", handle: handlePokerModal },
  { kind: "modal", prefix: "poker-private-modal:", handle: handlePokerModal },
  {
    kind: "modal",
    prefix: "game-config-modal:",
    handle: (interaction) => gameCommand.handleConfigModal(interaction),
  },
]);

function interactionKind(interaction) {
  if (interaction.isButton()) return "button";
  // Menu chọn chuỗi và menu chọn vai trò đều định tuyến theo tiền tố customId.
  if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu?.())
    return "select";
  if (interaction.isModalSubmit()) return "modal";
  return null;
}

async function routeComponentInteraction(interaction, logger) {
  const kind = interactionKind(interaction);
  if (!kind) return false;
  const route = ROUTES.find(
    (item) =>
      item.kind === kind && interaction.customId.startsWith(item.prefix),
  );
  if (!route) return false;
  const gameAction =
    /^(replay:|chinchiro:|bjduel:|poker:|poker-private:|hardcore-tower:|hardcore:|hardcore-setup:|hardcore-setup-modal:|mines:|coquay:|horserace:|blackjack:|gamebet:|gamebet-modal:|poker-modal:|poker-private-modal:|horserace-modal:)/.test(
      interaction.customId,
    );
  if (
    gameAction &&
    interaction.guildId &&
    !interaction.customId.startsWith("blackjack-table:") &&
    getBlackjackTableLock(interaction.guildId, interaction.user.id)
  ) {
    await interaction.reply({
      content:
        "Bạn đang ở bàn Xì dách và chỉ có thể thao tác tại bàn đó cho đến khi ván kết thúc.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  await route.handle(interaction, logger);
  return true;
}

module.exports = { ROUTES, interactionKind, routeComponentInteraction };
