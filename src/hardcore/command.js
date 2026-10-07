const godReveal = require("./events/godReveal");
const {
  ratesEmbed,
  ratesPayload,
  handleSelect: handleRatesSelect,
  handlePage: handleRatesPage,
} = require("./ui/ratesPanel");
const {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require("discord.js");
const { requireGameChannel } = require("../utils/gameChannel");
const { formatCoins } = require("../utils/economy");
const {
  openHardcoreSetup,
  setMessageId,
  hardcoreEmbed,
  hardcoreRows,
  getHardcoreRecord,
  getHardcoreTop,
  getHardcoreRun,
  withHardcoreSession,
} = require("./runtime/index");

function recordEmbed(user, record) {
  const survival = record.runs
    ? Math.round((record.escapes / record.runs) * 100)
    : 0;
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("☠️ HỒ SƠ SINH TỒN")
    .setDescription(
      `**Người chơi:** <@${user.id}>${record.activeVersion ? `\nRun đang chơi: **${record.activeVersion}**` : ""}${record.versions?.length ? `\n\n**Theo phiên bản (từ ngày phát hành v2):**\n${record.versions.map((v) => `${v.release_version}: ${v.runs} run · cao nhất ${v.best_floor} · rút ${v.escapes}`).join("\n")}` : ""}`,
    )
    .addFields(
      { name: "Tầng cao nhất", value: String(record.best_floor), inline: true },
      { name: "Số run", value: String(record.runs), inline: true },
      {
        name: "Hoàn thành tầng 100",
        value: String(record.completions),
        inline: true,
      },
      { name: "Đã rút thưởng", value: String(record.escapes), inline: true },
      { name: "Đã chết", value: String(record.deaths), inline: true },
      { name: "Tỷ lệ rút an toàn", value: `${survival}%`, inline: true },
    );
}

const profileView = require("./ui/profile");
const overviewFor = (guildId) => (user) =>
  recordEmbed(user, getHardcoreRecord(guildId, user.id));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hardcore")
    .setDescription("Chơi Sinh tồn vượt tầng bằng xu")
    .addSubcommand((command) =>
      command
        .setName("thap")
        .setDescription("Mở hoặc tiếp tục Tháp Định Mệnh 15 tầng của tuần"),
    )
    .addSubcommand((command) =>
      command
        .setName("batdau")
        .setDescription("Mở bảng chọn nhân vật và nhập xu cược"),
    )
    .addSubcommand((command) =>
      command
        .setName("hoso")
        .setDescription("Xem thành tích Sinh tồn")
        .addUserOption((option) =>
          option.setName("user").setDescription("Người chơi cần xem"),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("cuahang")
        .setDescription("Mua vé và 5 trang bị đổi mỗi ngày lúc 00:00 Việt Nam"),
    )
    .addSubcommand((command) =>
      command
        .setName("tuido")
        .setDescription("Xem túi Sinh tồn và lọc theo độ hiếm hoặc vé"),
    )
    .addSubcommand((command) =>
      command.setName("top").setDescription("Xem bảng xếp hạng tầng cao nhất"),
    )
    .addSubcommand((command) =>
      command.setName("rates").setDescription("Xem tỷ lệ gacha và sự kiện"),
    )
    .addSubcommand((command) =>
      command
        .setName("tieptuc")
        .setDescription("Đăng bảng mới cho lượt Sinh tồn đang chơi"),
    ),
  recordEmbed,
  ratesEmbed,
  handleProfileSelect: (interaction) =>
    profileView.handleSelect(
      interaction,
      overviewFor(interaction.guildId),
      (id) => interaction.client.users.fetch(id),
    ),
  handleProfilePage: (interaction) =>
    profileView.handlePage(
      interaction,
      overviewFor(interaction.guildId),
      (id) => interaction.client.users.fetch(id),
    ),
  handleTopSelect: (interaction) => profileView.handleTopSelect(interaction),
  handleTopPage: (interaction) => profileView.handleTopPage(interaction),
  handleRatesSelect,
  handleRatesPage,
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Game chỉ dùng được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "thap")
      return require("../services/hardcoreTowerService").openTower(interaction);
    if (["cuahang", "tuido"].includes(subcommand)) {
      const view = require("./inventory/view");
      return interaction.reply({
        ...(subcommand === "cuahang"
          ? view.shopPayload(interaction.guildId, interaction.user.id)
          : view.inventoryPayload(interaction.guildId, interaction.user.id)),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "hoso") {
      const user = interaction.options.getUser?.("user") || interaction.user;
      return interaction.reply({
        ...profileView.profilePayload(
          interaction.guildId,
          interaction.user.id,
          user,
          "overview",
          0,
          overviewFor(interaction.guildId)(user),
        ),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "top")
      return interaction.reply({
        ...profileView.topPayload(
          interaction.guildId,
          interaction.user.id,
          "all",
          0,
        ),
        flags: MessageFlags.Ephemeral,
      });
    if (subcommand === "rates")
      return interaction.reply({
        ...ratesPayload(interaction.user.id),
        flags: MessageFlags.Ephemeral,
      });
    if (subcommand === "batdau")
      return openHardcoreSetup(interaction, {
        stake: interaction.options.getInteger?.("xu"),
        classKey: interaction.options.getString?.("class"),
      });
    if (!(await requireGameChannel(interaction, "hardcore"))) return null;
    if (subcommand === "tieptuc") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const run = getHardcoreRun(interaction.guildId, interaction.user.id);
      if (!run)
        return interaction.editReply({
          content: "Bạn không có lượt Sinh tồn nào đang diễn ra.",
        });
      return withHardcoreSession(run.session.id, async () => {
        const current = getHardcoreRun(
          interaction.guildId,
          interaction.user.id,
        );
        if (!current || current.session.id !== run.session.id)
          return interaction.editReply({
            content: "Lượt Sinh tồn này đã kết thúc.",
          });
        if (current.session.channel_id !== interaction.channelId)
          return interaction.editReply({
            content:
              "Hãy tiếp tục lượt này trong kênh Sinh tồn nơi bạn đã bắt đầu.",
          });
        const initialGodFrame = godReveal.frame(
          current.state,
          interaction.user.id,
        );
        const message = await interaction.channel.send(
          initialGodFrame || {
            embeds: [
              hardcoreEmbed(
                current.state,
                interaction.user.id,
                null,
                current.session.id,
              ),
            ],
            components: hardcoreRows(current.session.id, current.state),
            allowedMentions: { parse: [] },
          },
        );
        setMessageId(current.session.id, message.id);
        if (initialGodFrame) {
          await godReveal.play(
            current.session.id,
            current.state,
            interaction.user.id,
            (payload) => message.edit(payload),
          );
          await message.edit({
            content: "",
            embeds: [
              hardcoreEmbed(
                current.state,
                interaction.user.id,
                null,
                current.session.id,
              ),
            ],
            components: hardcoreRows(current.session.id, current.state),
            allowedMentions: { parse: [] },
          });
        }
        if (current.session.message_id) {
          const previous = await interaction.channel.messages
            .fetch(current.session.message_id)
            .catch(() => null);
          if (previous)
            await previous.edit({ components: [] }).catch(() => null);
        }
        return interaction.editReply({
          content: "Đã mở bảng Sinh tồn mới. Bảng cũ đã được khóa.",
        });
      });
    }
    return interaction.reply({
      content: "Dùng `/sinhton batdau` để mở bảng chuẩn bị.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
