require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const pino = require('pino');
const { db } = require('./db');

const { loadCommands } = require('./commandRegistry');
const monitoring = require('./services/monitoringService');
const { startEconomyMaintenance } = require('./services/economyService');
const { handlePrefixMessage } = require('./services/prefixCommandService');
const { handleGameMessage } = require('./services/gameMessageService');
const { handleGamePrefix } = require('./services/gamePrefixService');
const { resumeOpenRounds } = require('./services/multiplayerGameService');
const { startBlackjackDuelMaintenance } = require('./services/blackjackDuelService');
const { startPokerMaintenance } = require('./services/pokerService');
const { resumeHorseRaces } = require('./services/horseRaceService');
const { cleanupStaleHardcoreSessions } = require('./services/hardcoreService');
const { startTimedChallengeMaintenance } = require('./services/timedChallengeService');
const { startCommerceMaintenance } = require('./services/commerceMaintenanceService');
const { startRpsDuelMaintenance } = require('./services/rpsDuelService');
const { startDatabaseBackups } = require('./services/databaseBackupService');
const { createRateLimiter } = require('./services/rateLimitService');
const { routeComponentInteraction } = require('./componentRouter');

if (!process.env.DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN in .env');
const logDir = path.resolve(process.env.LOG_DIR || './logs');
fs.mkdirSync(logDir, { recursive: true });
const logger = pino({ level: process.env.LOG_LEVEL || 'info' }, pino.multistream([{ stream: process.stdout }, { stream: pino.destination({ dest: path.join(logDir, process.env.LOG_FILE_NAME || 'bot.log'), sync: false }) }]));
const maintenanceTimers = [startEconomyMaintenance(logger)];
const rateLimiter = createRateLimiter();
let backupManager = null;
let shuttingDown = false;
const messageCommandsEnabled = /^(1|true|yes)$/i.test(process.env.ENABLE_MESSAGE_COMMANDS || process.env.ENABLE_PREFIX_COMMANDS || 'false');
const intents = [GatewayIntentBits.Guilds];
if (messageCommandsEnabled) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
const client = new Client({ intents });
const commandModules = loadCommands();
client.commands = new Collection(commandModules.map(command => [command.data.toJSON().name, command]));

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'game bot shutting down');
  for (const timer of maintenanceTimers) clearInterval(timer);
  rateLimiter.stop();
  await backupManager?.stop().catch(error => logger.error({ err: error }, 'could not finish database backup'));
  client.destroy();
  try { db.close(); } catch (error) { logger.error({ err: error }, 'could not close database'); }
  logger.flush?.();
  process.exitCode = exitCode;
}
process.once('SIGINT', () => { shutdown('SIGINT').catch(() => { process.exitCode = 1; }); });
process.once('SIGTERM', () => { shutdown('SIGTERM').catch(() => { process.exitCode = 1; }); });
process.on('unhandledRejection', error => { logger.error({ err: error }, 'unhandled rejection'); monitoring.recordRuntimeError(error, { source: 'unhandledRejection' }); });
process.on('uncaughtException', error => {
  logger.fatal({ err: error }, 'uncaught exception');
  monitoring.recordRuntimeError(error, { source: 'uncaughtException' });
  shutdown('uncaughtException', 1).catch(() => { process.exitCode = 1; });
});
client.once(Events.ClientReady, () => {
  const resumedRounds = resumeOpenRounds(client, logger);
  const resumedHorseRaces = resumeHorseRaces(client, logger);
  const expiredHardcoreRuns = cleanupStaleHardcoreSessions();
  maintenanceTimers.push(startTimedChallengeMaintenance(client, logger));
  maintenanceTimers.push(startCommerceMaintenance(client, logger));
  maintenanceTimers.push(startRpsDuelMaintenance(client, logger));
  maintenanceTimers.push(startBlackjackDuelMaintenance(client, logger));
  maintenanceTimers.push(startPokerMaintenance(client, logger));
  backupManager = startDatabaseBackups(logger);
  logger.info({ user: client.user.tag, resumedRounds, resumedHorseRaces, expiredHardcoreRuns }, 'game bot ready');
});
if (messageCommandsEnabled) client.on(Events.MessageCreate, message => {
  const rate = rateLimiter.consume(`message:${message.guildId}:${message.author.id}`, 8, 5_000);
  if (!rate.allowed) return;
  (async () => {
    if (await handlePrefixMessage(message, logger)) return;
    if (await handleGamePrefix(message)) return;
    await handleGameMessage(message);
  })().catch(error => { logger.error({ err: error }, 'message command failed'); monitoring.recordRuntimeError(error, { source: 'message' }); });
});
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      return;
    }
    const delivery = rateLimiter.consume(`interaction:${interaction.id}`, 1, 5 * 60_000);
    if (!delivery.allowed) return;
    const kind = interaction.isChatInputCommand() ? 'command' : interaction.isModalSubmit() ? 'modal' : 'component';
    const limit = kind === 'component' ? 12 : 6;
    const rate = rateLimiter.consume(`${kind}:${interaction.guildId}:${interaction.user.id}`, limit, 5_000);
    if (!rate.allowed) {
      return interaction.reply({ content: `Bạn thao tác quá nhanh. Hãy thử lại sau ${Math.ceil(rate.retryAfter / 1000)} giây.`, flags: MessageFlags.Ephemeral });
    }
    if (await routeComponentInteraction(interaction, logger)) return;
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return interaction.reply({ content: 'Lệnh này không có trong phiên bản game bot.', flags: MessageFlags.Ephemeral });
    await command.execute(interaction);
  } catch (error) {
    logger.error({ err: error }, 'interaction failed');
    monitoring.recordRuntimeError(error, { source: 'interaction' });
    const payload = { content: 'Có lỗi khi xử lý lệnh.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});
client.login(process.env.DISCORD_TOKEN).catch(error => { logger.fatal({ err: error }, 'discord login failed'); process.exitCode = 1; });
