const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { getAccount, getRank } = require("../services/economyService");
const { getProfileAppearance } = require("../services/profileCosmeticService");
const { renderProfileCard } = require("../services/profileCardService");
const { getAchievements } = require("../services/achievementService");
const {
  getAllGameStats,
  summarizeGameStats,
} = require("../services/playerGameStatsService");
const {
  getPlayerProgression,
  xpForNextLevel,
  levelReward,
} = require("../services/playerLevelService");
const { getTicketBalances } = require("../services/gachaService");

function number(value) {
  return Number(value).toLocaleString("vi-VN");
}
function signed(value) {
  return `${value > 0 ? "+" : ""}${number(value)}`;
}
function expBar(current, target, size = 12) {
  const filled = Math.max(
    0,
    Math.min(
      size,
      Math.floor(
        ((Number(current) || 0) / Math.max(1, Number(target) || 1)) * size,
      ),
    ),
  );
  return `${"▰".repeat(filled)}${"▱".repeat(size - filled)}`;
}
function rewardSummary(level) {
  const reward = levelReward(level);
  return [
    reward.coins ? `${number(reward.coins)} :coin:` : null,
    reward.diamonds ? `${number(reward.diamonds)} :gem:` : null,
    reward.freePulls ? `${reward.freePulls} vé Gacha ×1 SSR` : null,
    reward.cosmetic ? "màu hồ sơ độc quyền" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
function overviewField(summary) {
  return {
    name: "📊 Tổng quan toàn bộ game",
    inline: false,
    value: `Đã chơi **${summary.activeGames}/9 game**${summary.favorite ? ` · Chơi nhiều nhất: **${summary.favorite.label.replace(/^\S+\s/, "")}** (${number(summary.favorite.played)} ván)` : ""}\nTổng cược **${number(summary.wagered)} :coin:** · Tổng nhận **${number(summary.payout)} :coin:** · Dòng xu ròng **${signed(summary.net)} xu**`,
  };
}
function survivalField(appearance) {
  return {
    name: "🏔️ Sinh tồn",
    value: `Tầng cao nhất đã vượt: **${number(appearance.bestFloor || 0)}**\n${appearance.frame ? `🖼️ **${appearance.frame.name}** · Đã mở vĩnh viễn` : "Khung hồ sơ: Bạc 333 · Vàng 666 · Kim cương 999"}`,
    inline: false,
  };
}
function levelField(
  progress = { level: 1, experience: 0, diamonds: 0, free_gacha_pulls: 0 },
  guildId = null,
) {
  const target = xpForNextLevel(progress.level, guildId);
  const nextLevel = progress.level + 1;
  const percent = Math.max(
    0,
    Math.min(100, Math.floor((progress.experience / target) * 100)),
  );
  const tickets =
    guildId && progress.user_id
      ? getTicketBalances(guildId, progress.user_id)
      : { single: 0, ten: 0 };
  return {
    name: ":test_tube: Cấp độ & EXP",
    inline: false,
    value: `Cấp **${progress.level}** · :test_tube: **${number(progress.experience)}/${number(target)}**\n${expBar(progress.experience, target)} **${percent}%**\n🎁 Lên cấp **${nextLevel}**: ${rewardSummary(nextLevel)}\n:gem: **${number(progress.diamonds)}** kim cương · 🎟️ Vé ×1 **${tickets.single}** · Vé ×10 **${tickets.ten}**`,
  };
}
function profileSelectRow(ownerId, targetId, stats, selected = "overview") {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`hoso:${ownerId}:${targetId}`)
    .setPlaceholder("Chọn game muốn xem chi tiết…");
  menu.addOptions(
    new StringSelectMenuOptionBuilder()
      .setLabel("Tổng quan hồ sơ")
      .setValue("overview")
      .setEmoji("📊")
      .setDefault(selected === "overview"),
  );
  for (const item of stats) {
    const [emoji, ...name] = item.label.split(" ");
    const description =
      item.game === "vuatiengviet"
        ? `${number(item.coinsEarned)} xu đã kiếm được`
        : `${number(item.played)} ván · ${item.winRate.toFixed(1)}% thắng`;
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(name.join(" "))
        .setValue(item.game)
        .setEmoji(emoji)
        .setDescription(description)
        .setDefault(selected === item.game),
    );
  }
  return new ActionRowBuilder().addComponents(menu);
}
function overviewEmbed(
  user,
  account,
  rank,
  appearance,
  badges,
  stats,
  progress,
  guildId = null,
  serverName = "Server hiện tại",
) {
  return new EmbedBuilder()
    .setColor(Number.parseInt(appearance.color.value.slice(1), 16))
    .setTitle(
      `🏠 ${serverName.toUpperCase()}\n📊 ${user.globalName || user.username} · HỒ SƠ TỔNG QUAN`,
    )
    .setThumbnail(user.displayAvatarURL({ extension: "png", size: 256 }))
    .setDescription(
      badges.length
        ? `🏅 ${badges.map((item) => `**${item.name}**`).join(" · ")}`
        : "Chưa mở khóa huy hiệu thành tựu.",
    )
    .addFields(
      { name: "Xếp hạng", value: `#${rank}`, inline: true },
      {
        name: "Số dư",
        value: `${number(account.balance)} :coin:`,
        inline: true,
      },
      {
        name: "Tổng số ván",
        value: number(account.games_played),
        inline: true,
      },
      levelField(progress, guildId),
      survivalField(appearance),
      overviewField(summarizeGameStats(stats)),
    )
    .setFooter({ text: "Chọn một game trong menu để xem chi tiết" });
}
function gameDetailEmbed(
  user,
  account,
  rank,
  appearance,
  item,
  serverName = "Server hiện tại",
) {
  const color =
    item.net > 0
      ? 0x2ecc71
      : item.net < 0
        ? 0xe74c3c
        : Number.parseInt(appearance.color.value.slice(1), 16);
  if (item.game === "vuatiengviet") {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(
        `🏠 ${serverName.toUpperCase()}\n${item.label.toUpperCase()} · THỐNG KÊ`,
      )
      .setAuthor({
        name: `${user.globalName || user.username} · Hạng #${rank}`,
        iconURL: user.displayAvatarURL({ extension: "png", size: 128 }),
      })
      .setDescription(
        "Vua Tiếng Việt dùng câu hỏi có sẵn của bot nên hồ sơ không tính tỷ lệ thắng/thua.",
      )
      .addFields(
        {
          name: ":coin: Tổng xu đã kiếm được",
          value: `## ${number(item.coinsEarned)} :coin:`,
        },
        {
          name: "🏦 Tài khoản hiện tại",
          value: `Số dư **${number(account.balance)} :coin:** · Xếp hạng server **#${rank}**`,
        },
      )
      .setFooter({ text: "Số xu được cộng dồn trọn đời trong server này" });
  }
  const performance = item.played
    ? `${item.winRate.toFixed(1)}%`
    : "Chưa có dữ liệu";
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(
      `🏠 ${serverName.toUpperCase()}\n${item.label.toUpperCase()} · THỐNG KÊ CHI TIẾT`,
    )
    .setAuthor({
      name: `${user.globalName || user.username} · Hạng #${rank}`,
      iconURL: user.displayAvatarURL({ extension: "png", size: 128 }),
    })
    .setDescription(
      item.played
        ? `Đã chơi **${number(item.played)} ván** ${item.label.replace(/^\S+\s/, "")}.`
        : `Người chơi chưa tham gia ${item.label.replace(/^\S+\s/, "")}.`,
    )
    .addFields(
      {
        name: "🎮 Kết quả",
        value: `✅ Thắng: **${number(item.wins)}**\n❌ Thua: **${number(item.losses)}**\n➖ Hòa: **${number(item.draws)}**`,
        inline: true,
      },
      {
        name: "📈 Hiệu suất",
        value: `Tỷ lệ thắng: **${performance}**\nVán có kết quả: **${number(item.wins + item.losses)}**\nTổng số ván: **${number(item.played)}**`,
        inline: true,
      },
      {
        name: ":coin: Dòng xu",
        value: `Đã cược: **${number(item.wagered)} :coin:**\nĐã nhận: **${number(item.payout)} :coin:**\nRòng: **${signed(item.net)} :coin:**`,
        inline: true,
      },
      {
        name: "🏦 Tài khoản hiện tại",
        value: `Số dư **${number(account.balance)} :coin:** · Xếp hạng server **#${rank}**`,
      },
    )
    .setFooter({
      text:
        item.recordedGames < item.played
          ? `Dòng xu có ${number(item.recordedGames)}/${number(item.played)} ván còn lưu lịch sử`
          : "Số liệu riêng của server này",
    });
}

function fallbackEmbed(
  user,
  account,
  rank,
  appearance,
  badges = [],
  stats = [],
  progress,
  guildId = null,
  serverName = "Server hiện tại",
) {
  const colorEmoji = appearance.color?.emoji
    ? `${appearance.color.emoji} `
    : "";
  return new EmbedBuilder()
    .setColor(Number.parseInt(appearance.color.value.slice(1), 16))
    .setTitle(
      `🏠 ${serverName.toUpperCase()}\n${user.globalName || user.username} · #${rank}`,
    )
    .setThumbnail(user.displayAvatarURL({ extension: "png", size: 256 }))
    .setDescription(`Màu hồ sơ: ${colorEmoji}**${appearance.color.name}**`)
    .addFields(
      {
        name: "Số dư",
        value: `${Number(account.balance).toLocaleString("vi-VN")} :coin:`,
        inline: true,
      },
      {
        name: "Tổng số ván",
        value: String(account.games_played),
        inline: true,
      },
      {
        name: "Huy hiệu",
        value: badges.length
          ? badges.map((item) => `🏅 ${item.name}`).join("\n")
          : "Chưa có",
        inline: false,
      },
    )
    .addFields(
      levelField(progress, guildId),
      survivalField(appearance),
      overviewField(summarizeGameStats(stats)),
    )
    .setFooter({ text: "Đang dùng giao diện hồ sơ dự phòng" });
}

module.exports = {
  profileSelectRow,
  overviewEmbed,
  gameDetailEmbed,
  data: new SlashCommandBuilder()
    .setName("hoso")
    .setDescription("Xem profile game và số xu")
    .addUserOption((option) =>
      option.setName("nguoidung").setDescription("Người chơi cần xem"),
    ),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Lệnh này chỉ dùng được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    const user = interaction.options.getUser("nguoidung") || interaction.user;
    if (user.bot)
      return interaction.reply({
        content: "Bot không có profile game.",
        flags: MessageFlags.Ephemeral,
      });
    await interaction.deferReply();
    const account = getAccount(interaction.guildId, user.id);
    const rank = getRank(interaction.guildId, user.id);
    const appearance = getProfileAppearance(interaction.guildId, user.id);
    const badges = getAchievements(interaction.guildId, user.id)
      .filter((item) => item.complete)
      .slice(-3)
      .reverse();
    const gameStats = getAllGameStats(interaction.guildId, user.id);
    const levelProgress = getPlayerProgression(interaction.guildId, user.id);
    const gameSummary = summarizeGameStats(gameStats);
    const displayName = user.globalName || user.username;
    const serverName = interaction.guild?.name || "Server hiện tại";
    try {
      const image = await renderProfileCard({
        displayName,
        username: user.username,
        avatarUrl: user.displayAvatarURL({ extension: "png", size: 256 }),
        account,
        rank,
        appearance,
        progress: levelProgress,
        xpTarget: xpForNextLevel(levelProgress.level, interaction.guildId),
        serverName,
      });
      const attachment = new AttachmentBuilder(image, {
        name: `profile-${user.id}.png`,
      });
      const embed = new EmbedBuilder()
        .setColor(Number.parseInt(appearance.color.value.slice(1), 16))
        .setTitle(`🏠 ${serverName.toUpperCase()}`)
        .setDescription(
          badges.length
            ? `🏅 ${badges.map((item) => `**${item.name}**`).join(" · ")}`
            : "Chưa mở khóa huy hiệu thành tựu.",
        )
        .addFields(
          levelField(levelProgress, interaction.guildId),
          survivalField(appearance),
          overviewField(gameSummary),
        )
        .setImage(`attachment://profile-${user.id}.png`)
        .setFooter({
          text: `Màu hồ sơ: ${appearance.color?.emoji ? `${appearance.color.emoji} ` : ""}${appearance.color.name}`,
        });
      return interaction.editReply({
        embeds: [embed],
        files: [attachment],
        components: [profileSelectRow(interaction.user.id, user.id, gameStats)],
      });
    } catch (error) {
      console.error("[hoso] profile image render failed", error);
      return interaction.editReply({
        embeds: [
          fallbackEmbed(
            user,
            account,
            rank,
            appearance,
            badges,
            gameStats,
            levelProgress,
            interaction.guildId,
            serverName,
          ),
        ],
        components: [profileSelectRow(interaction.user.id, user.id, gameStats)],
      });
    }
  },
  async handleSelect(interaction) {
    const [, ownerId, targetId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId)
      return interaction.reply({
        content: "Chỉ người mở hồ sơ này mới có thể dùng menu.",
        flags: MessageFlags.Ephemeral,
      });
    const user = await interaction.client.users
      .fetch(targetId)
      .catch(() => null);
    if (!user)
      return interaction.reply({
        content: "Không thể tải người chơi này.",
        flags: MessageFlags.Ephemeral,
      });
    const account = getAccount(interaction.guildId, targetId);
    const rank = getRank(interaction.guildId, targetId);
    const appearance = getProfileAppearance(interaction.guildId, targetId);
    const badges = getAchievements(interaction.guildId, targetId)
      .filter((item) => item.complete)
      .slice(-3)
      .reverse();
    const levelProgress = getPlayerProgression(interaction.guildId, targetId);
    const stats = getAllGameStats(interaction.guildId, targetId);
    const selected = interaction.values[0];
    const serverName = interaction.guild?.name || "Server hiện tại";
    const item = stats.find((entry) => entry.game === selected);
    const embed =
      selected === "overview"
        ? overviewEmbed(
            user,
            account,
            rank,
            appearance,
            badges,
            stats,
            levelProgress,
            interaction.guildId,
            serverName,
          )
        : item
          ? gameDetailEmbed(user, account, rank, appearance, item, serverName)
          : null;
    if (!embed)
      return interaction.reply({
        content: "Game được chọn không hợp lệ.",
        flags: MessageFlags.Ephemeral,
      });
    return interaction.update({
      embeds: [embed],
      components: [profileSelectRow(ownerId, targetId, stats, selected)],
      allowedMentions: { parse: [] },
    });
  },
};
