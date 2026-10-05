const {
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  getProgress,
  claimMissions,
  checkIn,
} = require("../services/progressionService");
const { getAccount, getRank } = require("../services/economyService");
const {
  getAchievements,
  claimAchievements,
  achievementCategory,
} = require("../services/achievementService");
const { getPlayerProgression } = require("../services/playerLevelService");
const {
  claimNewbieBonus,
  hasClaimedNewbieBonus,
  NEWBIE_DIAMONDS,
} = require("../services/onboardingService");
const { formatCoins } = require("../utils/economy");
const { getTicketBalances } = require("../services/gachaService");
const {
  claimWeeklyRoleRewards,
} = require("../services/weeklyRoleRewardService");
const { memberRoleIds } = require("./thuongrole");

function claimRoleRewards(guildId, userId, member) {
  try {
    return {
      ...claimWeeklyRoleRewards({
        guildId,
        userId,
        roleIds: memberRoleIds(member),
      }),
      status: "claimed",
    };
  } catch (error) {
    if (error.message === "ALREADY_CLAIMED") return { status: "already" };
    if (error.message === "NO_ELIGIBLE_ROLE") return { status: "none" };
    throw error;
  }
}

const { getCatalogItem } = require("../services/itemCatalogService");
const { rewardSummary } = require("../utils/rewardText");
function rewardText(item) {
  const info = item.item ? getCatalogItem(item.item) : null;
  return rewardSummary({
    coins: item.coins,
    diamonds: item.diamonds,
    experience: item.experience,
    item: item.item,
    quantity: item.quantity || 1,
    itemName: info?.name,
    itemRarity: info?.rarity,
  });
}
function missionLine(mission) {
  const mark = mission.claimed ? "✅" : mission.complete ? "🎁" : "▫️";
  return `${mark} **${mission.label}** — ${mission.progress}/${mission.target}\n↳ ${rewardText(mission)}${mission.complete && !mission.claimed ? " · có thể nhận" : ""}`;
}
function achievementLine(item) {
  const mark = item.claimed ? "✅" : item.complete ? "🎁" : "▫️";
  const rewards = [
    item.reward ? `${formatCoins(item.reward)} :coin:` : null,
    item.diamonds ? `${item.diamonds} :gem:` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const progress =
    item.metric === "balance"
      ? item.complete
        ? "Đã đạt mốc"
        : "Chưa đạt mốc"
      : `${formatCoins(item.progress)}/${formatCoins(item.target)}`;
  const description = String(item.description || "Chưa có diễn giải");
  return `${mark} **${item.name}**\n${description.length > 500 ? `${description.slice(0, 497)}…` : description}\nTiến độ: **${progress}** · Thưởng: ${rewards || "Không có"}`;
}
const pending = (list) =>
  list.filter((item) => item.complete && !item.claimed).length;

const ACHIEVEMENT_PAGE_SIZE = 5;
const ACHIEVEMENT_STATUSES = Object.freeze([
  { label: "Tất cả", value: "all" },
  { label: "Đang làm", value: "progress" },
  { label: "Có thể nhận", value: "ready" },
  { label: "Đã nhận", value: "claimed" },
]);
const ACHIEVEMENT_CATEGORIES = Object.freeze([
  { label: "Mọi loại", value: "all" },
  { label: "Số ván chơi", value: "games" },
  { label: "Số ván thắng", value: "wins" },
  { label: "Khám phá game", value: "gameTypes" },
  { label: "Mốc xu", value: "balance" },
  { label: "Sinh tồn · tầng", value: "hardcoreFloor" },
  { label: "Sinh tồn · hành trình", value: "hardcoreJourney" },
  { label: "Sinh tồn · tầng theo class", value: "hardcoreClass" },
  { label: "Sinh tồn · sự kiện và chiến đấu", value: "hardcoreEvents" },
  { label: "Game cược · số ván thắng", value: "betWins" },
  { label: "Game cược · khám phá", value: "betGames" },
  { label: "Game cược · tiền cược và thắng lớn", value: "betMoney" },
  { label: "Dò mìn · số ván thắng", value: "minesWins" },
  { label: "Dò mìn · thành tích", value: "minesFeats" },
  { label: "Bầu cua", value: "baucua" },
  { label: "Đua ngựa", value: "horse" },
  { label: "Poker · số ván thắng", value: "pokerWins" },
  { label: "Poker · hạng bài thắng", value: "pokerHands" },
  { label: "Poker · chiến tích", value: "pokerFeats" },
  { label: "Chinchiro · số ván thắng", value: "chinchiroWins" },
  { label: "Chinchiro · tay đặc biệt", value: "chinchiroHands" },
  { label: "Chinchiro · chuỗi thắng", value: "chinchiroStreak" },
  { label: "Gacha · số lượt quay", value: "gachaPulls" },
  { label: "Gacha · vật phẩm hiếm", value: "gachaRare" },
  { label: "Gacha · kim cương đã tiêu", value: "gachaSpent" },
]);
function selection(value, choices) {
  return choices.some((choice) => choice.value === value) ? value : "all";
}
function pageNumber(value) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 0 ? page : 0;
}

function menuRow(userId, status = "all", category = "all", page = 0) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`kiemtra:${userId}:${status}:${category}:${page}`)
      .setPlaceholder("Chọn mục muốn xem hoặc nhận…")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Tổng quan")
          .setValue("tongquan")
          .setEmoji("📊")
          .setDescription("Việc còn chưa nhận"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Nhiệm vụ hằng ngày")
          .setValue("ngay")
          .setEmoji("📋")
          .setDescription("Xem tiến độ nhiệm vụ hôm nay"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Nhiệm vụ hằng tuần")
          .setValue("tuan")
          .setEmoji("📅")
          .setDescription("Xem tiến độ nhiệm vụ tuần này"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Nhận thưởng nhiệm vụ")
          .setValue("nhannhiemvu")
          .setEmoji("🎁")
          .setDescription("Nhận mọi nhiệm vụ đã hoàn thành"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Thành tựu")
          .setValue("thanhtuu")
          .setEmoji("🏅")
          .setDescription("Xem tiến độ thành tựu"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Nhận thưởng thành tựu")
          .setValue("nhanthanhtuu")
          .setEmoji("🏆")
          .setDescription("Nhận mọi thành tựu đã hoàn thành"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Nhận thưởng vai trò tuần này")
          .setValue("nhanvaitro")
          .setEmoji("🎁")
          .setDescription("Nhận xu hàng tuần từ các vai trò của bạn"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Điểm danh hôm nay")
          .setValue("diemdanh")
          .setEmoji("📅")
          .setDescription("Điểm danh và nhận thưởng chuỗi"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Thưởng tân thủ")
          .setValue("tanthu")
          .setEmoji("🎉")
          .setDescription(
            `Nhận 1 vé Gacha ×10 và ${NEWBIE_DIAMONDS.toLocaleString("vi-VN")} kim cương`,
          ),
      ),
  );
}
function achievementPanel(
  guildId,
  userId,
  status = "all",
  category = "all",
  requestedPage = 0,
) {
  status = selection(status, ACHIEVEMENT_STATUSES);
  category = selection(category, ACHIEVEMENT_CATEGORIES);
  const achievements = getAchievements(guildId, userId).filter(
    (item) =>
      (category === "all" || achievementCategory(item) === category) &&
      (status === "all" ||
        (status === "progress" && !item.complete && !item.claimed) ||
        (status === "ready" && item.complete && !item.claimed) ||
        (status === "claimed" && item.claimed)),
  );
  const pages = Math.max(
    1,
    Math.ceil(achievements.length / ACHIEVEMENT_PAGE_SIZE),
  );
  const page = Math.min(pageNumber(requestedPage), pages - 1);
  const visible = achievements.slice(
    page * ACHIEVEMENT_PAGE_SIZE,
    (page + 1) * ACHIEVEMENT_PAGE_SIZE,
  );
  const embed = base("🏅 THÀNH TỰU")
    .setDescription(
      visible.length
        ? visible.map(achievementLine).join("\n\n")
        : "Không có thành tựu trong bộ lọc này.",
    )
    .setFooter({
      text: `Trang ${page + 1}/${pages} · ${achievements.length} thành tựu`,
    });
  const filterRow = (name, current, choices) =>
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`kiemtra-${name}:${userId}:${status}:${category}`)
        .setPlaceholder(
          name === "status" ? "Lọc theo trạng thái" : "Lọc theo loại thành tựu",
        )
        .addOptions(
          choices.map((choice) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(choice.label)
              .setValue(choice.value)
              .setDefault(choice.value === current),
          ),
        ),
    );
  const pageRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `kiemtra-page:${userId}:${status}:${category}:${Math.max(0, page - 1)}:prev`,
      )
      .setLabel("Trước")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`kiemtra-pageinfo:${userId}:${status}:${category}:${page}`)
      .setLabel(`Trang ${page + 1}/${pages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(
        `kiemtra-page:${userId}:${status}:${category}:${Math.min(pages - 1, page + 1)}:next`,
      )
      .setLabel("Sau")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );
  return {
    embeds: [embed],
    components: [
      menuRow(userId, status, category, page),
      filterRow("status", status, ACHIEVEMENT_STATUSES),
      filterRow("category", category, ACHIEVEMENT_CATEGORIES),
      pageRow,
    ],
    allowedMentions: { parse: [] },
  };
}
function base(title) {
  return new EmbedBuilder().setColor(0x8b5cf6).setTitle(title);
}

function overview(guildId, userId) {
  const progress = getProgress(guildId, userId);
  const achievements = getAchievements(guildId, userId);
  const daily = pending(progress.daily);
  const weekly = pending(progress.weekly);
  const badges = pending(achievements);
  const newbie = hasClaimedNewbieBonus(guildId, userId);
  return base("📊 KIỂM TRA THƯỞNG & NHIỆM VỤ")
    .setDescription(
      "Chọn mục trong menu để xem chi tiết hoặc nhận thưởng ngay.",
    )
    .addFields(
      {
        name: "📋 Nhiệm vụ ngày",
        value: `${progress.daily.filter((m) => m.complete).length}/${progress.daily.length} hoàn thành · **${daily}** chưa nhận`,
        inline: true,
      },
      {
        name: "📅 Nhiệm vụ tuần",
        value: `${progress.weekly.filter((m) => m.complete).length}/${progress.weekly.length} hoàn thành · **${weekly}** chưa nhận`,
        inline: true,
      },
      {
        name: "🏅 Thành tựu",
        value: `**${badges}** thành tựu chưa nhận`,
        inline: true,
      },
      {
        name: "📅 Điểm danh",
        value: `Chuỗi hiện tại **${progress.streak}/7**`,
        inline: true,
      },
      {
        name: "🎁 Thưởng vai trò",
        value: "Nhận mỗi tuần bằng menu này hoặc `/nhiemvu nhan`",
        inline: true,
      },
      {
        name: "🎉 Thưởng tân thủ",
        value: newbie
          ? "✅ Đã nhận"
          : `🎁 Chưa nhận: 1 vé Gacha ×10 + ${NEWBIE_DIAMONDS.toLocaleString("vi-VN")} :gem:`,
        inline: true,
      },
    )
    .setFooter({ text: "Menu chỉ dành cho người mở lệnh" });
}

function build(guildId, user, key, member = null) {
  const userId = user.id;
  if (key === "ngay" || key === "tuan") {
    const progress = getProgress(guildId, userId);
    const daily = key === "ngay";
    return base(daily ? "📋 NHIỆM VỤ HẰNG NGÀY" : "📅 NHIỆM VỤ HẰNG TUẦN")
      .setDescription(
        (daily ? progress.daily : progress.weekly).map(missionLine).join("\n"),
      )
      .setFooter({
        text: daily
          ? `Ngày ${progress.dailyKey}`
          : `Tuần từ ${progress.weeklyKey}`,
      });
  }
  if (key === "nhannhiemvu") {
    const rewards = claimMissions(guildId, userId);
    return base("🎁 NHẬN THƯỞNG NHIỆM VỤ").setDescription(
      rewards.length
        ? rewards
            .map((item) => `• ${item.label}: ${rewardText(item)}`)
            .join("\n")
        : "Chưa có nhiệm vụ hoàn thành chưa nhận thưởng.",
    );
  }
  if (key === "nhanthanhtuu") {
    const rewards = claimAchievements(guildId, userId);
    return base("🏆 NHẬN THÀNH TỰU").setDescription(
      rewards.length
        ? `Đã nhận **${rewards.length}** thành tựu: **${formatCoins(rewards.reduce((sum, item) => sum + item.reward, 0))} :coin:** + **${rewards.reduce((sum, item) => sum + (item.diamonds || 0), 0)} :gem:**.`
        : "Chưa có thành tựu mới để nhận.",
    );
  }
  if (key === "nhanvaitro") {
    const result = claimRoleRewards(guildId, userId, member);
    if (result.status === "claimed")
      return base("🎁 ĐÃ NHẬN THƯỞNG VAI TRÒ")
        .setDescription(
          `${result.claimed.map((config) => `<@&${config.role_id}> — **${formatCoins(config.amount)} :coin:**`).join("\n")}\n\nTổng cộng: **${formatCoins(result.total)} :coin:**`,
        )
        .setFooter({
          text: `Tuần ${result.week} • Mỗi vai trò chỉ nhận một lần`,
        });
    return base("🎁 THƯỞNG VAI TRÒ").setDescription(
      result.status === "already"
        ? "Bạn đã nhận toàn bộ thưởng vai trò của tuần này."
        : "Bạn không có vai trò nào được thiết lập thưởng trong tuần này.",
    );
  }
  if (key === "diemdanh") {
    const result = checkIn(guildId, userId);
    if (!result.ok)
      return base("📅 ĐIỂM DANH").setDescription(
        `Bạn đã điểm danh hôm nay. Chuỗi điểm danh: **${result.streak}/7**.`,
      );
    const reward = [
      `${formatCoins(result.coins)} :coin:`,
      result.diamonds ? `${result.diamonds} :gem:` : null,
    ]
      .filter(Boolean)
      .join(" + ");
    return base("📅 ĐIỂM DANH THÀNH CÔNG").setDescription(
      `Ngày **${result.date}** · chuỗi **${result.streak}/7** · nhận **${reward}**.${result.reset ? "\n🎉 Hoàn thành chuỗi 7 ngày! Chuỗi đã đặt lại." : ""}`,
    );
  }
  if (key === "tanthu") {
    const result = claimNewbieBonus(guildId, userId);
    if (!result.claimed)
      return base("🎉 THƯỞNG TÂN THỦ").setDescription(
        "Bạn đã nhận thưởng tân thủ trước đây. Mỗi người chỉ nhận một lần trong mỗi server.",
      );
    const tickets = getTicketBalances(guildId, userId);
    return base("🎉 ĐÃ NHẬN THƯỞNG TÂN THỦ")
      .setDescription(
        `<@${userId}> nhận **1 vé Gacha ×10** và **${result.diamonds.toLocaleString("vi-VN")} :gem:**.`,
      )
      .addFields({
        name: "Hiện có",
        value: `:gem: **${result.balance.toLocaleString("vi-VN")}** · 🎟️ Vé ×10 **${tickets.ten}**`,
      })
      .setFooter({ text: "Dùng /vatpham quay để sử dụng vé" });
  }
  const account = getAccount(guildId, userId);
  const rank = getRank(guildId, userId);
  const progression = getPlayerProgression(guildId, userId);
  return key === "tongquan"
    ? overview(guildId, userId)
    : base("📊 HỒ SƠ NHANH").addFields(
        { name: "Hạng", value: `#${rank}`, inline: true },
        {
          name: "Số dư",
          value: `${formatCoins(account.balance)} :coin:`,
          inline: true,
        },
        { name: "Cấp", value: String(progression.level), inline: true },
      );
}

module.exports = {
  claimRoleRewards,
  achievementPanel,
  async show(interaction) {
    return interaction.reply({
      embeds: [overview(interaction.guildId, interaction.user.id)],
      components: [menuRow(interaction.user.id)],
      flags: MessageFlags.Ephemeral,
    });
  },
  async handleSelect(interaction) {
    const [, ownerId, rawStatus, rawCategory, rawPage] =
      interaction.customId.split(":");
    if (interaction.user.id !== ownerId)
      return interaction.reply({
        content: "Chỉ người mở lệnh này mới dùng được menu.",
        flags: MessageFlags.Ephemeral,
      });
    const status = selection(rawStatus, ACHIEVEMENT_STATUSES);
    const category = selection(rawCategory, ACHIEVEMENT_CATEGORIES);
    const page = pageNumber(rawPage);
    if (interaction.values[0] === "thanhtuu")
      return interaction.update(
        achievementPanel(interaction.guildId, ownerId, status, category, page),
      );
    return interaction.update({
      embeds: [
        build(
          interaction.guildId,
          interaction.user,
          interaction.values[0],
          interaction.member,
        ),
      ],
      components: [menuRow(ownerId, status, category, page)],
      allowedMentions: { parse: [] },
    });
  },
  async handleAchievementFilter(interaction) {
    const [kind, ownerId, rawStatus, rawCategory] =
      interaction.customId.split(":");
    if (interaction.user.id !== ownerId)
      return interaction.reply({
        content: "Chỉ người mở lệnh này mới dùng được bộ lọc.",
        flags: MessageFlags.Ephemeral,
      });
    const status =
      kind === "kiemtra-status" ? interaction.values[0] : rawStatus;
    const category =
      kind === "kiemtra-category" ? interaction.values[0] : rawCategory;
    return interaction.update(
      achievementPanel(interaction.guildId, ownerId, status, category, 0),
    );
  },
  async handleAchievementPage(interaction) {
    const [, ownerId, status, category, page] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId)
      return interaction.reply({
        content: "Chỉ người mở lệnh này mới chuyển trang.",
        flags: MessageFlags.Ephemeral,
      });
    return interaction.update(
      achievementPanel(interaction.guildId, ownerId, status, category, page),
    );
  },
};
