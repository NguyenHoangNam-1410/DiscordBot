const {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { db } = require("../db");
const { isAdmin } = require("../commands/vuatiengviet");
const { requireGameChannel } = require("../utils/gameChannel");
const {
  addGameChannel,
  getGameChannels,
} = require("../services/gameChannelService");
const {
  getGameReward,
  setGameReward,
} = require("../services/gameRewardService");
function createBoardPuzzleCommand({
  game,
  name,
  icon,
  service,
  view,
  maxMate = 5,
  sourceName = "Lichess",
  notation = "UCI và SAN",
  errors = {},
}) {
  const { HELP, roundPayload } = view;

  const ERRORS = {
    ...errors,
    BOARD_CHANNEL_BUSY:
      "Kênh đang có một bàn cờ vua hoặc cờ tướng chưa giải. Hãy giải hoặc đóng bàn hiện tại trước.",
    CHESS_LOADING: "Kênh này đang lấy puzzle. Hãy chờ một chút rồi thử lại.",
    CHESS_CHANGED:
      "Bàn cũ vừa được giải hoặc thay đổi. Hãy kiểm tra kết quả trước khi mở bàn mới.",
    CHESS_CHANNEL_REQUIRED: `Kênh này chưa được cấu hình cho ${name.toLowerCase()}. Admin dùng /${game} cauhinh kenh hoặc /quantri datkenh.`,
    CHESS_MAINTENANCE: `🔴 ${name} đang bảo trì.`,
    LICHESS_BUSY:
      "Lichess đang giới hạn yêu cầu. Hãy thử lại sau ít nhất một phút. Bàn cũ được giữ nguyên.",
    LICHESS_UNAVAILABLE:
      "Chưa kết nối được Lichess. Hãy thử lại sau; bàn cũ được giữ nguyên.",
    LICHESS_NO_PUZZLE:
      "Chưa lấy được puzzle chiếu hết phù hợp. Hãy thử lại sau; bàn cũ được giữ nguyên.",
  };

  function configEmbed(guildId) {
    const base = getGameReward(guildId, game);
    const channels = getGameChannels(guildId, game);
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${icon} ${name.toUpperCase()} · CẤU HÌNH`)
      .setDescription(
        `Kênh chơi: ${channels.length ? channels.map((row) => `<#${row.channel_id}>`).join(", ") : "Chưa đặt"}\n` +
          `Thưởng cơ sở: **${base.toLocaleString("vi-VN")} xu** · Thưởng = cơ sở × N².\n` +
          Array.from(
            { length: maxMate },
            (_, i) =>
              `Mate ${i + 1}: **${(base * (i + 1) ** 2).toLocaleString("vi-VN")} xu**`,
          ).join("\n"),
      )
      .setFooter({
        text: "Cấu hình thưởng áp dụng cho bàn mới · Một bàn/kênh · Thời hạn 1 giờ",
      });
  }

  async function configure(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({
        content: `Chỉ quản trị mới được cấu hình ${name.toLowerCase()}.`,
        flags: MessageFlags.Ephemeral,
      });
    const picked = interaction.options.getChannel("kenh");
    const id = interaction.options.getString("idkenh");
    const base = interaction.options.getInteger("thuong");
    if (picked && id)
      return interaction.reply({
        content: "Chỉ chọn kenh hoặc idkenh trong một lần cấu hình.",
        flags: MessageFlags.Ephemeral,
      });
    let channel = picked;
    if (id) {
      if (!/^\d{17,20}$/.test(id))
        return interaction.reply({
          content: "ID kênh không hợp lệ.",
          flags: MessageFlags.Ephemeral,
        });
      channel = await interaction.guild.channels.fetch(id).catch(() => null);
    }
    if (
      (picked || id) &&
      (!channel ||
        channel.guildId !== interaction.guildId ||
        channel.type !== ChannelType.GuildText)
    )
      return interaction.reply({
        content: "Chọn kênh văn bản thuộc server này.",
        flags: MessageFlags.Ephemeral,
      });
    db.transaction(() => {
      if (base !== null) setGameReward(interaction.guildId, game, base);
      if (channel) addGameChannel(interaction.guildId, game, channel.id);
    })();
    return interaction.reply({
      embeds: [configEmbed(interaction.guildId)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }

  return {
    data: new SlashCommandBuilder()
      .setName(game)
      .setDescription(`Giải puzzle chiếu hết ${name.toLowerCase()}`)
      .addSubcommand((sub) =>
        sub
          .setName("choi")
          .setDescription(
            `Mở một puzzle ngẫu nhiên trong kênh ${name.toLowerCase()}`,
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("boqua")
          .setDescription("Quản trị: bỏ bàn hiện tại và mở puzzle mới"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("xem")
          .setDescription("Xem riêng bàn hoặc kết quả gần nhất của kênh"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("huongdan")
          .setDescription(`Cách nhập lời giải ${notation}`),
      )
      .addSubcommand((sub) =>
        sub
          .setName("cauhinh")
          .setDescription(
            `Quản trị: cấu hình kênh và thưởng ${name.toLowerCase()}`,
          )
          .addChannelOption((opt) =>
            opt
              .setName("kenh")
              .setDescription(`Thêm một kênh ${name.toLowerCase()}`)
              .addChannelTypes(ChannelType.GuildText),
          )
          .addStringOption((opt) =>
            opt
              .setName("idkenh")
              .setDescription("Hoặc nhập ID kênh văn bản")
              .setMinLength(17)
              .setMaxLength(20),
          )
          .addIntegerOption((opt) =>
            opt
              .setName("thuong")
              .setDescription("Xu cơ sở; thưởng = cơ sở × N² (áp dụng bàn mới)")
              .setMinValue(1)
              .setMaxValue(40_000),
          ),
      ),
    configEmbed,
    async execute(interaction) {
      if (!interaction.guildId)
        return interaction.reply({
          content: `${name} chỉ chơi trong server.`,
          flags: MessageFlags.Ephemeral,
        });
      const sub = interaction.options.getSubcommand();
      if (sub === "cauhinh") return configure(interaction);
      if (sub === "huongdan")
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle(`${icon} ${name.toUpperCase()} · CÁCH CHƠI`)
              .setDescription(HELP)
              .addFields(
                {
                  name: "Lệnh",
                  value: `\`/${game} choi\` mở bàn · \`/${game} xem\` xem riêng bàn/kết quả.
Quản trị: \`/${game} boqua\` thay bàn · \`/${game} cauhinh\` đặt kênh và thưởng.`,
                },
                {
                  name: "Thưởng và thành tựu",
                  value: `Thưởng = cơ sở × N², N ngẫu nhiên 1–${maxMate}. Thưởng của bàn được khóa khi mở. Thành tựu theo số puzzle đã giải và mate cao nhất; nhận tại \`/nhiemvu kiemtra\`.`,
                },
                { name: "Nguồn thế cờ", value: sourceName },
              ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      if (sub === "boqua" && !isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ quản trị mới được bỏ bàn cờ đang mở.",
          flags: MessageFlags.Ephemeral,
        });
      if (!(await requireGameChannel(interaction, game))) return;
      service.expireRounds();
      if (sub === "xem") {
        const round = service.latestRound(
          interaction.guildId,
          interaction.channelId,
        );
        if (
          round &&
          round.status === "open" &&
          service.hasSolved(
            interaction.guildId,
            interaction.user.id,
            round.puzzle_id,
          )
        ) {
          const payload = roundPayload(round);
          payload.embeds[0].addFields({
            name: "Thế đã nhận thưởng",
            value:
              "Bạn đã nhận thưởng thế này. Đáp án đúng sẽ hiện ♻️, bàn vẫn dành cho người chơi khác.",
          });
          return interaction.reply({
            ...payload,
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply(
          round
            ? { ...roundPayload(round), flags: MessageFlags.Ephemeral }
            : {
                content: `Kênh chưa có bàn cờ. Dùng /${game} choi để mở bàn.`,
                flags: MessageFlags.Ephemeral,
              },
        );
      }
      const active = service.currentRound(
        interaction.guildId,
        interaction.channelId,
      );
      if (active && sub === "choi")
        return interaction.reply({
          content: `Kênh đã có bàn chưa giải: ${active.message_id ? `https://discord.com/channels/${active.guild_id}/${active.channel_id}/${active.message_id}` : "đang gửi lên kênh"}. Dùng /${game} xem để xem riêng.`,
          flags: MessageFlags.Ephemeral,
        });
      await interaction.deferReply();
      let result;
      try {
        result = await service.startRound({
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId: interaction.user.id,
          replace: sub === "boqua",
        });
        if (result.existing)
          return interaction.editReply({
            content: `Kênh vừa có bàn mới. Dùng /${game} xem để xem bàn hiện hành.`,
            allowedMentions: { parse: [] },
          });
        const sent = await interaction.editReply(
          roundPayload(result.round, result.image),
        );
        const message = sent?.id ? sent : await interaction.fetchReply();
        if (!message?.id) throw new Error("CHESS_PUBLICATION_FAILED");
        service.attachMessage(result.round.id, message.id);
      } catch (error) {
        if (result?.round) {
          service.publicationFailed(result);
          if (
            result.previous &&
            service.currentRound(interaction.guildId, interaction.channelId)
              ?.id === result.previous.id
          )
            await service.updateBoard(interaction.client, result.previous);
        }
        console.warn("chess command failed", error.code || error.message);
        return interaction.editReply({
          content:
            ERRORS[error.message] ||
            "Chưa mở được bàn cờ. Hãy kiểm tra quyền xem kênh, dùng lệnh và gửi ảnh của bot rồi thử lại.",
          embeds: [],
          components: [],
          attachments: [],
        });
      }
      if (result.previous)
        await service.updateBoard(interaction.client, {
          ...result.previous,
          status: "skipped",
        });
      const published = service.getRound(result.round.id);
      if (published && published.status !== "open")
        await service.updateBoard(interaction.client, published);
    },
  };
}
module.exports = { createBoardPuzzleCommand };
