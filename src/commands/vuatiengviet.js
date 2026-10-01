const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { startVuaSession, getVuaSession, endVuaSession, vuaQuestionText,
  skipVuaSessionForPlayer, setVuaUiMessage } = require('../services/funGameService');
const { formatCoins } = require('../utils/economy');
const { requireGameChannel } = require('../utils/gameChannel');
const { channelHasGame } = require('../services/gameChannelService');
const { getGameReward } = require('../services/gameRewardService');
const { getInventory } = require('../services/shopService');
const { itemGames } = require('../services/itemGameService');
const { useItem } = require('../services/itemEffectService');

function isAdmin(interaction) {
  const ids = String(process.env.ADMIN_USER_ID || '').split(/[,;\n]/).map(id => id.trim()).filter(Boolean);
  return ids.includes(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function questionEmbed(guildId, question, notice = null) {
  const baseReward = getGameReward(guildId, 'vuatiengviet');
  const reward = baseReward * (question.hard ? 10 : 1);
  return new EmbedBuilder().setColor(0x9B59B6).setTitle('👑 VUA TIẾNG VIỆT')
    .setDescription(`Sắp xếp các chữ cái thành từ hoặc cụm từ có nghĩa:\n\n${vuaQuestionText(question)}`)
    .addFields(
      { name: 'Thưởng cho người trả lời đúng', value: `${formatCoins(reward)} :coin:`, inline: true },
      ...(question.hard ? [{ name: 'Thưởng câu khó', value: '10 :gem:', inline: true }] : []),
      { name: 'Thời gian', value: question.hard ? `${question.durationSeconds} giây` : 'Không giới hạn', inline: true },
      ...(notice ? [{ name: 'Cập nhật', value: String(notice).slice(0, 1024), inline: false }] : []),
    )
    .setFooter({ text: 'Nhập đáp án trong channel • Bỏ qua: giới hạn lượt/ngày, hồi chiêu 5 phút mỗi người' });
}

function controlRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vuatiengviet:skip').setLabel('Bỏ qua câu').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vuatiengviet:items').setLabel('Vật phẩm').setEmoji('🎒').setStyle(ButtonStyle.Primary),
  )];
}

const QUICK_LABELS = Object.freeze({
  quiz_living_dictionary: 'Từ điển', quiz_first_word: 'Mở đầu', quiz_syllable_lengths: 'Đếm âm tiết',
  quiz_letter_position: 'Kính soi chữ', quiz_extra_time: 'Gia hạn',
});

function privateItemPanel(guildId, userId, status = null) {
  const items = getInventory(guildId, userId)
    .filter(row => row.quantity > 0 && itemGames(row.item)?.includes('vuatiengviet'))
    .slice(0, 25);
  const description = items.length
    ? `${status ? `${status}\n\n` : ''}Vật phẩm Vua Tiếng Việt đang có:\n\n${items.map(row => `• **${row.item.name} ×${row.quantity}**\n_${row.item.description}_`).join('\n\n')}`.slice(0, 4000)
    : `${status ? `${status}\n\n` : ''}Bạn chưa có vật phẩm dùng trong Vua Tiếng Việt.`;
  const rows = [];
  for (let index = 0; index < items.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(items.slice(index, index + 5).map(row => new ButtonBuilder()
      .setCustomId(`vuatiengviet:item:${userId}:${row.item.id}`)
      .setLabel(`${QUICK_LABELS[row.item.effect] || row.item.name} (${row.quantity})`.slice(0, 80))
      .setStyle(ButtonStyle.Secondary))));
  }
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎒 VẬT PHẨM VUA TIẾNG VIỆT').setDescription(description)
    .setFooter({ text: 'Bảng riêng tư chỉ bạn thấy • Dùng nhanh sẽ trừ 1 vật phẩm' })], components: rows };
}

async function updateQuestionMessage(guildId, channel, notice = null) {
  const session = getVuaSession(guildId);
  if (!session || !channel?.isTextBased?.()) return null;
  const payload = { content: null, embeds: [questionEmbed(guildId, session.question, notice)], components: controlRows(), allowedMentions: { parse: [] } };
  let message = null;
  if (session.uiMessageId && channel.messages?.fetch) message = await channel.messages.fetch(session.uiMessageId).catch(() => null);
  if (message) return message.edit(payload);
  message = await channel.send(payload);
  setVuaUiMessage(guildId, channel.id, message.id);
  return message;
}

async function postNextQuestionMessage(guildId, channel) {
  const session = getVuaSession(guildId);
  if (!session || !channel?.isTextBased?.()) return null;
  const previousMessageId = session.uiMessageId;
  const message = await channel.send({
    content: null,
    embeds: [questionEmbed(guildId, session.question)],
    components: controlRows(),
    allowedMentions: { parse: [] },
  });
  setVuaUiMessage(guildId, channel.id, message.id);
  if (previousMessageId && previousMessageId !== message.id && channel.messages?.fetch) {
    const previousMessage = await channel.messages.fetch(previousMessageId).catch(() => null);
    if (previousMessage) await previousMessage.edit({ components: [] }).catch(() => null);
  }
  return message;
}

async function updateEndedMessage(channel, session, userId) {
  if (!session?.uiMessageId || !channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(session.uiMessageId).catch(() => null);
  if (!message) return false;
  const ended = new EmbedBuilder().setColor(0x7F8C8D).setTitle('👑 VUA TIẾNG VIỆT')
    .setDescription(`🛑 Phiên đã được kết thúc bởi <@${userId}>.`);
  await message.edit({ content: null, embeds: [ended], components: [], allowedMentions: { parse: [] } });
  return true;
}

function skipErrorText(result) {
  if (result.error === 'LIMIT_REACHED') return `Bạn đã dùng hết **${result.limit} lượt bỏ qua** hôm nay.`;
  if (result.error === 'COOLDOWN') return `Bạn đang hồi chiêu bỏ qua. Dùng lại <t:${Math.ceil(result.cooldownUntil / 1000)}:R>.`;
  return 'Hiện chưa có phiên Vua Tiếng Việt.';
}

function skipStatusText(result) {
  return `⏭️ Đã bỏ qua câu · còn **${result.remaining}/${result.limit} lượt** hôm nay. Lượt tiếp theo sẵn sàng <t:${Math.ceil(result.cooldownUntil / 1000)}:R>.`;
}

const command = {
  data: new SlashCommandBuilder().setName('vuatiengviet').setDescription('Bắt đầu Vua tiếng Việt; quản lý câu hỏi bằng các nút'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Game chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!isAdmin(interaction)) return interaction.reply({ content: 'Chỉ admin mới được mở phiên Vua Tiếng Việt.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'vuatiengviet')) return;
    const guildId = interaction.guildId;
    let session = getVuaSession(guildId);
    if (!session) session = startVuaSession(guildId);
    if (session.uiMessageId) {
      const existing = session.uiChannelId === interaction.channelId
        ? await interaction.channel.messages.fetch(session.uiMessageId).catch(() => null) : null;
      if (existing) {
        const link = `https://discord.com/channels/${guildId}/${session.uiChannelId || interaction.channelId}/${session.uiMessageId}`;
        return interaction.reply({ content: `Phiên Vua Tiếng Việt đang chạy: ${link}`, flags: MessageFlags.Ephemeral });
      }
    }
    await interaction.reply({ embeds: [questionEmbed(guildId, session.question)], components: controlRows() });
    const message = await interaction.fetchReply();
    setVuaUiMessage(guildId, interaction.channelId, message.id);
    return message;
  },
  async handleButton(interaction) {
    if (!interaction.guildId || !channelHasGame(interaction.guildId, interaction.channelId, 'vuatiengviet'))
      return interaction.reply({ content: 'Các nút này chỉ dùng trong channel Vua tiếng Việt.', flags: MessageFlags.Ephemeral });
    const [, action, ownerId, itemId] = interaction.customId.split(':');
    const session = getVuaSession(interaction.guildId);
    if (!session) return interaction.reply({ content: 'Phiên Vua tiếng Việt đã kết thúc hoặc không còn hoạt động.', flags: MessageFlags.Ephemeral });
    if (session.uiMessageId && interaction.message?.id !== session.uiMessageId)
      return interaction.reply({ content: 'UI câu hỏi này đã cũ. Hãy dùng các nút trên tin câu hỏi mới nhất.', flags: MessageFlags.Ephemeral });
    if (action === 'items') return interaction.reply({ ...privateItemPanel(interaction.guildId, interaction.user.id), flags: MessageFlags.Ephemeral });
    if (action === 'item') {
      if (ownerId !== interaction.user.id) return interaction.reply({ content: 'Bảng vật phẩm này thuộc về người chơi khác.', flags: MessageFlags.Ephemeral });
      try {
        const result = useItem({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, itemId });
        const publicEffect = ['quiz_living_dictionary', 'quiz_extra_time'].includes(result.item.effect);
        if (publicEffect) {
          const notice = result.message.split('\n\nCâu tiếp theo:')[0];
          const update = result.item.effect === 'quiz_living_dictionary' ? postNextQuestionMessage : updateQuestionMessage;
          await update(interaction.guildId, interaction.channel, notice).catch(() => null);
        }
        return interaction.update(privateItemPanel(interaction.guildId, interaction.user.id,
          `✅ **${result.item.name}**: ${result.message}`));
      } catch (error) {
        const text = error.message === 'HARD_QUESTION_REQUIRED' ? 'Vật phẩm này chỉ dùng được ở câu khó; vật phẩm chưa bị trừ.'
          : error.message === 'QUESTION_EXPIRED' ? 'Câu khó đã hết hạn; vật phẩm chưa bị trừ.'
            : error.message === 'ITEM_NOT_OWNED' ? 'Bạn đã hết vật phẩm này.'
              : 'Không thể dùng vật phẩm lúc này; vật phẩm chưa bị trừ.';
        return interaction.update(privateItemPanel(interaction.guildId, interaction.user.id, `⚠️ ${text}`));
      }
    }
    if (action !== 'skip') return interaction.reply({ content: 'Thao tác không hợp lệ.', flags: MessageFlags.Ephemeral });
    const result = skipVuaSessionForPlayer(interaction.guildId, interaction.user.id);
    if (result.error) return interaction.reply({ content: skipErrorText(result), flags: MessageFlags.Ephemeral });
    await interaction.update({ content: null, embeds: [questionEmbed(interaction.guildId, result.nextQuestion, `⏭️ <@${interaction.user.id}> đã bỏ qua câu.`)], components: controlRows(), allowedMentions: { parse: [] } });
    return interaction.followUp({ content: skipStatusText(result), flags: MessageFlags.Ephemeral });
  },
  questionEmbed, controlRows, isAdmin, updateQuestionMessage, postNextQuestionMessage, privateItemPanel,
};

const playerCommand = {
  data: new SlashCommandBuilder().setName('vtv').setDescription('Lệnh người chơi cho Vua tiếng Việt')
    .addSubcommand(option => option.setName('boqua').setDescription('Bỏ qua câu hiện tại bằng một lượt cá nhân'))
    .addSubcommand(option => option.setName('ketthuc').setDescription('Kết thúc phiên hiện tại (chỉ admin)')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'vuatiengviet')) return;
    if (interaction.options.getSubcommand() === 'ketthuc') {
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Chỉ admin mới được kết thúc phiên.', flags: MessageFlags.Ephemeral });
      const session = getVuaSession(interaction.guildId);
      if (!session) return interaction.reply({ content: 'Hiện chưa có phiên Vua Tiếng Việt.', flags: MessageFlags.Ephemeral });
      endVuaSession(interaction.guildId);
      await updateEndedMessage(interaction.channel, session, interaction.user.id);
      return interaction.reply({ content: '🛑 Đã kết thúc phiên Vua Tiếng Việt.', flags: MessageFlags.Ephemeral });
    }
    if (!getVuaSession(interaction.guildId)) return interaction.reply({ content: 'Hiện chưa có phiên Vua Tiếng Việt. Hãy nhờ admin bắt đầu bằng `/choi vtv`.', flags: MessageFlags.Ephemeral });
    const result = skipVuaSessionForPlayer(interaction.guildId, interaction.user.id);
    if (result.error) return interaction.reply({ content: skipErrorText(result), flags: MessageFlags.Ephemeral });
    await updateQuestionMessage(interaction.guildId, interaction.channel, `⏭️ <@${interaction.user.id}> đã bỏ qua câu.`);
    return interaction.reply({ content: skipStatusText(result), flags: MessageFlags.Ephemeral });
  },
};

module.exports = { ...command, playerCommand };
