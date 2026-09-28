const { handleBetButton, handleBetModal } = require('./services/multiplayerGameService');
const { handleBlackjackButton } = require('./services/blackjackService');
const { handleBlackjackDuelButton } = require('./services/blackjackDuelService');
const { handlePokerButton, handlePokerModal } = require('./services/pokerService');
const { handleHorseButton, handleHorseModal } = require('./services/horseRaceService');
const { handleMinesButton } = require('./services/minesService');
const { handleHardcoreButton } = require('./services/hardcoreService');
const { handleCoinRequestButton } = require('./services/coinRequestService');
const { handleRpsDuelButton } = require('./services/rpsDuelService');
const { handleReplayButton } = require('./services/replayService');
const { handleRpsBotButton } = require('./services/rpsBotService');
const { handleChinchiroButton } = require('./services/chinchiroService');
const profileCommand = require('./commands/hoso');
const shopCommand = require('./commands/shop');
const gachaCommand = require('./commands/gacha');
const useCommand = require('./commands/use');
const leaderboardCommand = require('./commands/xephang');
const helpCommand = require('./commands/trogiup');

const ROUTES = Object.freeze([
  { kind: 'button', prefix: 'replay:', handle: (interaction, logger) => handleReplayButton(interaction, logger) },
  { kind: 'select', prefix: 'hoso:', handle: interaction => profileCommand.handleSelect(interaction) },
  { kind: 'select', prefix: 'shop:', handle: interaction => shopCommand.handleSelect(interaction) },
  { kind: 'select', prefix: 'use:', handle: interaction => useCommand.handleSelect(interaction) },
  { kind: 'select', prefix: 'xephang:', handle: interaction => leaderboardCommand.handleSelect(interaction) },
  { kind: 'select', prefix: 'trogiup:', handle: interaction => helpCommand.handleSelect(interaction) },
  { kind: 'button', prefix: 'gacha:', handle: interaction => gachaCommand.handleButton(interaction) },
  { kind: 'button', prefix: 'rpsbot:', handle: handleRpsBotButton },
  { kind: 'button', prefix: 'chinchiro:', handle: handleChinchiroButton },
  { kind: 'button', prefix: 'anxin:', handle: handleCoinRequestButton },
  { kind: 'button', prefix: 'rpsduel:', handle: handleRpsDuelButton },
  { kind: 'button', prefix: 'bjduel:', handle: handleBlackjackDuelButton },
  { kind: 'button', prefix: 'poker:', handle: handlePokerButton },
  { kind: 'button', prefix: 'hardcore:', handle: handleHardcoreButton },
  { kind: 'button', prefix: 'mines:', handle: handleMinesButton },
  { kind: 'button', prefix: 'horserace:', handle: handleHorseButton },
  { kind: 'button', prefix: 'blackjack:', handle: handleBlackjackButton },
  { kind: 'button', prefix: 'gamebet:', handle: handleBetButton },
  { kind: 'modal', prefix: 'horserace-modal:', handle: handleHorseModal },
  { kind: 'modal', prefix: 'gamebet-modal:', handle: handleBetModal },
  { kind: 'modal', prefix: 'poker-modal:', handle: handlePokerModal },
]);

function interactionKind(interaction) {
  if (interaction.isButton()) return 'button';
  if (interaction.isStringSelectMenu()) return 'select';
  if (interaction.isModalSubmit()) return 'modal';
  return null;
}

async function routeComponentInteraction(interaction, logger) {
  const kind = interactionKind(interaction);
  if (!kind) return false;
  const route = ROUTES.find(item => item.kind === kind && interaction.customId.startsWith(item.prefix));
  if (!route) return false;
  await route.handle(interaction, logger);
  return true;
}

module.exports = { ROUTES, interactionKind, routeComponentInteraction };
