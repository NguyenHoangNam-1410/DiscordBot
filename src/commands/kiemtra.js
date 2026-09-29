const {
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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

function rewardText(item) {
  return [
    item.coins ? `${formatCoins(item.coins)} xu` : null,
    item.experience ? `${item.experience} EXP` : null,
    item.diamonds ? `${item.diamonds} :gem:` : null,
    item.item ? `×${item.quantity || 1} vật phẩm` : null,
  ]
    .filter(Boolean)
    .join(" + ");
}
function missionLine(mission) {
  const mark = mission.claimed ? "✅" : mission.complete ? "🎁" : "▫️";
  return `${mark} **${mission.label}** — ${mission.progress}/${mission.target}\n↳ ${rewardText(mission)}${mission.complete && !mission.claimed ? " · có thể nhận" : ""}`;
}
function achievementLine(item) {
  const mark = item.claimed ? "✅" : item.complete ? "🎁" : "▫️";
  const rewards = [
    item.reward ? `${formatCoins(item.reward)} xu` : null,
    item.diamonds ? `${item.diamonds} :gem:` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  return `${mark} **${item.name}** — ${item.progress}/${item.target}\n↳ ${rewards}`;
}
const pending = (list) =>
  list.filter((item) => item.complete && !item.claimed).length;

function menuRow(userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`kiemtra:${userId}`)
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
  if (key === "thanhtuu")
    return base("🏅 THÀNH TỰU").setDescription(
      getAchievements(guildId, userId).map(achievementLine).join("\n\n"),
    );
  if (key === "nhanthanhtuu") {
    const rewards = claimAchievements(guildId, userId);
    return base("🏆 NHẬN THÀNH TỰU").setDescription(
      rewards.length
        ? `Đã nhận **${rewards.length}** thành tựu: **${formatCoins(rewards.reduce((sum, item) => sum + item.reward, 0))} xu** + **${rewards.reduce((sum, item) => sum + (item.diamonds || 0), 0)} :gem:**.`
        : "Chưa có thành tựu mới để nhận.",
    );
  }
  if (key === "nhanvaitro") {
    const result = claimRoleRewards(guildId, userId, member);
    if (result.status === "claimed")
      return base("🎁 ĐÃ NHẬN THƯỞNG VAI TRÒ")
        .setDescription(
          `${result.claimed.map((config) => `<@&${config.role_id}> — **${formatCoins(config.amount)} xu**`).join("\n")}\n\nTổng cộng: **${formatCoins(result.total)} xu**`,
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
      `${formatCoins(result.coins)} xu`,
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
          value: `${formatCoins(account.balance)} xu`,
          inline: true,
        },
        { name: "Cấp", value: String(progression.level), inline: true },
      );
}

module.exports = {
  claimRoleRewards,
  async show(interaction) {
    return interaction.reply({
      embeds: [overview(interaction.guildId, interaction.user.id)],
      components: [menuRow(interaction.user.id)],
      flags: MessageFlags.Ephemeral,
    });
  },
  async handleSelect(interaction) {
    const [, ownerId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId)
      return interaction.reply({
        content: "Chỉ người mở lệnh này mới dùng được menu.",
        flags: MessageFlags.Ephemeral,
      });
    return interaction.update({
      embeds: [
        build(
          interaction.guildId,
          interaction.user,
          interaction.values[0],
          interaction.member,
        ),
      ],
      components: [menuRow(ownerId)],
      allowedMentions: { parse: [] },
    });
  },
};
