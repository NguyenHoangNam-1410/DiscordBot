const { MessageFlags } = require('discord.js');
const { startBlackjack, setMessageId: setBlackjackMessage, blackjackEmbed, actionRows } = require('./blackjackService');
const { startMines, setMessageId: setMinesMessage, minesEmbed, minesRows } = require('./minesService');
const { startHardcore, setMessageId: setHardcoreMessage, hardcoreEmbed, hardcoreRows } = require('./hardcoreService');
const { startPoker, setPokerMessage, pokerEmbed, pokerRows } = require('./pokerService');
const { createRound } = require('./multiplayerGameService');
const { createHorseRace } = require('./horseRaceService');
const { startChinchiro, setMessageId: setChinchiroMessage, chinchiroEmbed, chinchiroRows } = require('./chinchiroService');
const rpsDuel = require('./rpsDuelService');
const blackjackDuel = require('./blackjackDuelService');
const { formatCoins } = require('../utils/economy');

async function handleReplayButton(interaction, logger = console) {
  const [, game, ...args] = interaction.customId.split(':');
  try {
    if (game === 'baucua' || game === 'taixiu') return createRound(interaction, game, logger);
    if (game === 'duangua') return createHorseRace(interaction, logger);
    let started; let payload; let setMessage;
    if (game === 'blackjack') { started = startBlackjack({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, stake: Number(args[0]) }); payload = { embeds: [blackjackEmbed(started.state, interaction.user.id, started.result, started.session?.id)], components: actionRows(started.session?.id || 'complete', started.state, started.immediate) }; setMessage = id => !started.immediate && setBlackjackMessage(started.session.id, id); }
    else if (game === 'mines') { started = startMines({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, stake: Number(args[0]), mineCount: Number(args[1]) }); payload = { embeds: [minesEmbed(started.state, interaction.user.id, null, started.session.id)], components: minesRows(started.session.id, started.state) }; setMessage = id => setMinesMessage(started.session.id, id); }
    else if (game === 'hardcore') { started = startHardcore({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, stake: Number(args[0]), classKey: args[1] }); payload = { embeds: [hardcoreEmbed(started.state, interaction.user.id, null, started.session.id)], components: hardcoreRows(started.session.id, started.state) }; setMessage = id => setHardcoreMessage(started.session.id, id); }
    else if (game === 'poker') { started = startPoker({ guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, variant: args[0] }); payload = { embeds: [pokerEmbed(started.state, interaction.user.id, started.session.id)], components: pokerRows(started.session.id, started.state) }; setMessage = id => setPokerMessage(started.session.id, id); }
    else if (game === 'chinchiro') { started = startChinchiro({ guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, stake: Number(args[0]) }); payload = { embeds: [chinchiroEmbed(started.state, interaction.user.id, started.session?.id)], components: chinchiroRows(started.session?.id || 'complete', started.state) }; setMessage = id => !started.immediate && setChinchiroMessage(started.session.id, id); }
    else if (game === 'oantuti') {
      const command = require('../commands/oantuti');
      const replayOptions = { getInteger: () => Number(args[0]), getString: name => name === 'chon' ? args[1] : null, getUser: () => null };
      const proxy = new Proxy(interaction, { get(target, property) { if (property === 'isReplay') return true; if (property === 'options') return replayOptions; const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value; } });
      return command.execute(proxy);
    }
    else if (game === 'rpsduel' || game === 'bjduel') {
      const opponentId = interaction.user.id === args[1] ? args[2] : args[1];
      if (![args[1], args[2]].includes(interaction.user.id)) return interaction.reply({ content: 'Chỉ người trong ván cũ mới có thể tái đấu.', flags: MessageFlags.Ephemeral });
      const service = game === 'rpsduel' ? rpsDuel : blackjackDuel;
      const duel = game === 'rpsduel'
        ? service.createDuel({ guildId: interaction.guildId, channelId: interaction.channelId, challengerId: interaction.user.id, opponentId, stake: Number(args[0]) })
        : service.createBlackjackDuel({ guildId: interaction.guildId, channelId: interaction.channelId, challengerId: interaction.user.id, opponentId, stake: Number(args[0]) });
      const embed = game === 'rpsduel' ? service.duelEmbed(duel) : service.blackjackDuelEmbed(duel);
      const rows = service.inviteButtons(duel.id);
      const response = await interaction.reply({ content: `<@${opponentId}>, bạn nhận được lời tái đấu!`, embeds: [embed], components: rows, allowedMentions: { users: [opponentId] }, withResponse: true });
      const id = response?.resource?.message?.id || response?.id;
      if (id) (game === 'rpsduel' ? service.setDuelMessage : service.setBlackjackDuelMessage)(duel.id, id);
      return duel;
    }
    else return interaction.reply({ content: 'Không thể chơi lại game này.', flags: MessageFlags.Ephemeral });
    const response = await interaction.reply({ ...payload, withResponse: true }); const id = response?.resource?.message?.id || response?.id; if (id) setMessage(id); return started;
  } catch (error) {
    logger.warn?.({ err: error, game, userId: interaction.user.id }, 'replay failed');
    const content = error.message === 'ACTIVE_SESSION' ? 'Bạn đang có một ván chưa kết thúc.' : error.message === 'BET_LIMIT' ? `Mức cược cũ vượt giới hạn hiện tại **${formatCoins(error.maxBet)} xu**. Hãy tạo ván mới với mức cược thấp hơn.` : error.code === 'INSUFFICIENT_FUNDS' ? 'Bạn không đủ xu để chơi lại.' : 'Không thể chơi lại với cấu hình cũ.';
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
module.exports = { handleReplayButton };
