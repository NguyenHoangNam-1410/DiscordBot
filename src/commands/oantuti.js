const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { consumeCommandCooldown } = require("../services/funGameService");
const { formatCoins, economyError } = require("../utils/economy");
const { requireGameChannel } = require("../utils/gameChannel");
const { getGameBetLimit } = require("../services/gameBetLimitService");
const {
  createDuel,
  setDuelMessage,
  duelEmbed,
  inviteButtons,
} = require("../services/rpsDuelService");
const {
  createRpsBotRound,
  confirmRows,
  pendingEmbed,
} = require("../services/rpsBotService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("oantuti")
    .setDescription("Chơi oẳn tù tì bằng xu")
    .addIntegerOption((option) =>
      option
        .setName("xu")
        .setDescription("Số xu cược (10–100.000)")
        .setRequired(true)
        .setMinValue(10)
        .setMaxValue(100000),
    )
    .addStringOption((option) =>
      option
        .setName("chon")
        .setDescription("Chọn tay khi đấu với bot")
        .addChoices(
          { name: "Búa", value: "bua" },
          { name: "Kéo", value: "keo" },
          { name: "Bao", value: "bao" },
        ),
    )
    .addUserOption((option) =>
      option
        .setName("doithu")
        .setDescription("Người chơi bạn muốn thách đấu solo"),
    ),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Game chỉ chơi được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    if (!(await requireGameChannel(interaction, "oantuti"))) return;
    const stake = interaction.options.getInteger("xu", true);
    const opponent = interaction.options.getUser("doithu");
    const maxBet = getGameBetLimit(interaction.guildId, "oantuti");
    if (stake > maxBet)
      return interaction.reply({
        content: `Giới hạn cược Oẳn tù tì của server là **${formatCoins(maxBet)} :coin:**.`,
        flags: MessageFlags.Ephemeral,
      });
    const remaining = interaction.isReplay
      ? 0
      : consumeCommandCooldown(
          interaction.guildId,
          interaction.user.id,
          "oantuti",
        );
    if (remaining)
      return interaction.reply({
        content: `Hãy chờ ${Math.ceil(remaining / 1000)} giây trước khi chơi tiếp.`,
        flags: MessageFlags.Ephemeral,
      });
    if (opponent) {
      if (opponent.bot)
        return interaction.reply({
          content:
            "Không thể thách đấu với bot. Bỏ tùy chọn `doithu` để chơi với máy.",
          flags: MessageFlags.Ephemeral,
        });
      let duel;
      try {
        duel = createDuel({
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          challengerId: interaction.user.id,
          opponentId: opponent.id,
          stake,
        });
      } catch (error) {
        if (error.message === "SELF_DUEL")
          return interaction.reply({
            content: "Bạn không thể tự thách đấu chính mình.",
            flags: MessageFlags.Ephemeral,
          });
        if (error.message === "ACTIVE_DUEL")
          return interaction.reply({
            content:
              "Một trong hai người đang có lời thách đấu hoặc ván solo chưa kết thúc.",
            flags: MessageFlags.Ephemeral,
          });
        return economyError(interaction, error);
      }
      const response = await interaction.reply({
        content: `<@${opponent.id}>, bạn nhận được một lời thách đấu!`,
        embeds: [duelEmbed(duel)],
        components: inviteButtons(duel.id),
        allowedMentions: { users: [opponent.id] },
        withResponse: true,
      });
      const messageId = response?.resource?.message?.id || response?.id;
      if (messageId) setDuelMessage(duel.id, messageId);
      return response;
    }
    const choice = interaction.options.getString("chon");
    if (!choice)
      return interaction.reply({
        content:
          "Hãy chọn `chon` để đấu với bot, hoặc chọn `doithu` để tạo ván solo.",
        flags: MessageFlags.Ephemeral,
      });
    const round = createRpsBotRound({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      stake,
      choice,
    });
    return interaction.reply({
      embeds: [pendingEmbed(round)],
      components: confirmRows(round),
    });
  },
};
