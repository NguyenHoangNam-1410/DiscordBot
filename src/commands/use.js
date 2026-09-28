const { ActionRowBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { getInventory } = require('../services/shopService');
const { useItem } = require('../services/itemEffectService');

const TYPE_LABELS = { color: 'Màu hồ sơ', chest: 'Hộp quà', consumable: 'Vật phẩm dùng' };
const RARITY_EMOJI = { common: '⚪', rare: '🔵', epic: '🟣', legendary: '🟠', mythic: '🔴', R: '⚪', SR: '🔵', SSR: '🟠', UR: '🔴' };

function usePanel(guildId, userId, status = null) {
  const inventory = getInventory(guildId, userId).slice(0, 25);
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎒 SỬ DỤNG VẬT PHẨM')
    .setDescription(inventory.length
      ? `${status ? `${status}\n\n` : ''}Chọn một vật phẩm trong menu bên dưới để dùng hoặc trang bị.\n\n${inventory.map(entry => `${RARITY_EMOJI[entry.item.rarity] || '▫️'} **${entry.item.name}${['R', 'SR', 'SSR', 'UR'].includes(entry.item.rarity) ? ` [${entry.item.rarity}]` : ''}** ×${entry.quantity}\n_${entry.item.description}_`).join('\n')}`
      : `${status ? `${status}\n\n` : ''}Kho đồ chưa có vật phẩm có thể sử dụng.`)
    .setFooter({ text: 'Menu chỉ người mở mới sử dụng được • Hiển thị tối đa 25 vật phẩm' });
  if (!inventory.length) return { embeds: [embed], components: [] };
  const select = new StringSelectMenuBuilder().setCustomId(`use:${userId}`).setPlaceholder('Chọn vật phẩm muốn sử dụng…')
    .addOptions(inventory.map(entry => new StringSelectMenuOptionBuilder()
      .setLabel(`${entry.item.name} ×${entry.quantity}`.slice(0, 100))
      .setValue(entry.item_id)
      .setDescription(`${TYPE_LABELS[entry.item.type] || 'Vật phẩm'} · ${entry.item.description}`.slice(0, 100))
      .setEmoji(RARITY_EMOJI[entry.item.rarity] || '▫️')));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function errorText(error) {
  const map = {
    ITEM_NOT_OWNED: 'Bạn không sở hữu vật phẩm này hoặc vật phẩm đã hết.',
    WRONG_EFFECT_CHANNEL: 'Vật phẩm phải dùng trong đúng channel game hỗ trợ.',
    NO_ACTIVE_GAME: 'Channel này chưa có câu hỏi đang hoạt động.',
    NO_ACTIVE_MINES: 'Bạn chưa có ván Mines đang hoạt động trong channel này.',
    NO_HIDDEN_MINE: 'Không còn quả mìn ẩn nào để dò.',
    NO_HIDDEN_SAFE_CELL: 'Không còn ô an toàn ẩn nào để tìm.',
    NO_ACTIVE_SHARED_ROUND: 'Channel này chưa có ván Bầu cua/Tài xỉu đang nhận cược.',
    ROUND_EFFECT_ACTIVE: 'Ván này đã có hiệu ứng cùng loại; vật phẩm không bị trừ.',
    NO_RADAR_AREA: 'Không còn khu vực phù hợp để Radar quét.',
    HARD_QUESTION_REQUIRED: 'Từ Điển Sống chỉ dùng được khi câu hỏi hiện tại là câu khó.',
    QUESTION_EXPIRED: 'Câu hỏi khó đã hết thời gian; vật phẩm không bị trừ.',
    HIGHER_EFFECT_ACTIVE: 'Ván này đã có hiệu ứng bậc cao hơn; chỉ hiệu ứng cao nhất được tính và vật phẩm không bị trừ.',
    EFFECT_ALREADY_ACTIVE: 'Hiệu ứng này đã sẵn sàng; không thể cộng dồn và vật phẩm không bị trừ.',
    ITEM_NOT_USABLE: 'Vật phẩm này không thể sử dụng trực tiếp.',
  };
  return map[error.message] || 'Không thể sử dụng vật phẩm lúc này.';
}

async function handleSelect(interaction) {
  const [, ownerId] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) return interaction.reply({ content: 'Chỉ người mở kho đồ này mới được chọn vật phẩm.', flags: MessageFlags.Ephemeral });
  try {
    const result = useItem({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, itemId: interaction.values[0] });
    await interaction.update(usePanel(interaction.guildId, interaction.user.id, `✅ Đã dùng **${result.item.name}**.`));
    if (result.ephemeral) return interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
    if (interaction.channel?.send) return interaction.channel.send({ content: result.message, allowedMentions: { parse: [] } });
    return interaction.followUp({ content: result.message });
  } catch (error) {
    return interaction.reply({ content: errorText(error), flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName('use').setDescription('Mở kho và chọn vật phẩm để sử dụng hoặc trang bị'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng được trong server.', flags: MessageFlags.Ephemeral });
    return interaction.reply({ ...usePanel(interaction.guildId, interaction.user.id), flags: MessageFlags.Ephemeral });
  },
  usePanel,
  handleSelect,
};
