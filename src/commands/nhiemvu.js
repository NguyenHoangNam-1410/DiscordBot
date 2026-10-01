const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { claimMissions, checkIn } = require("../services/progressionService");
const { claimAchievements } = require("../services/achievementService");
const { formatCoins } = require("../utils/economy");
const kiemtraCommand = require("./kiemtra");
const {
  claimNewbieBonus,
  NEWBIE_DIAMONDS,
} = require("../services/onboardingService");

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
const CLAIM_TYPES = Object.freeze([
  { name: "Tất cả", value: "tatca" },
  { name: "Nhiệm vụ", value: "nhiemvu" },
  { name: "Thành tựu", value: "thanhtuu" },
  { name: "Thưởng vai trò", value: "vaitro" },
]);
const number = (value) => Number(value).toLocaleString("vi-VN");

function roleLines(result) {
  return result.claimed.map(
    (config) =>
      `<@&${config.role_id}> — **${formatCoins(config.amount)} :coin:**`,
  );
}
function claimReply(interaction, type) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const lines = [];
  const empty = [];
  if (type === "tatca" || type === "nhiemvu") {
    const rewards = claimMissions(guildId, userId);
    if (rewards.length)
      lines.push(
        `🎁 **Nhiệm vụ** (${rewards.length}):`,
        ...rewards.map((item) => `• ${item.label}: ${rewardText(item)}`),
      );
    else empty.push("Chưa có nhiệm vụ hoàn thành chưa nhận thưởng.");
  }
  if (type === "tatca" || type === "thanhtuu") {
    const rewards = claimAchievements(guildId, userId);
    if (rewards.length)
      lines.push(
        `🏅 **Thành tựu** (${rewards.length}): **${formatCoins(rewards.reduce((sum, item) => sum + item.reward, 0))} :coin:** + **${rewards.reduce((sum, item) => sum + (item.diamonds || 0), 0)} :gem:**`,
      );
    else empty.push("Chưa có thành tựu mới để nhận.");
  }
  if (type === "tatca" || type === "vaitro") {
    const result = kiemtraCommand.claimRoleRewards(
      guildId,
      userId,
      interaction.member,
    );
    if (result.status === "claimed")
      lines.push(
        `🎖️ **Thưởng vai trò** (tuần ${result.week}):`,
        ...roleLines(result),
        `Tổng cộng: **${formatCoins(result.total)} :coin:**`,
      );
    else
      empty.push(
        result.status === "already"
          ? "Bạn đã nhận toàn bộ thưởng vai trò của tuần này."
          : "Bạn không có vai trò nào được thiết lập thưởng trong tuần này.",
      );
  }
  if (!lines.length)
    return interaction.reply({
      content:
        type === "tatca"
          ? "Hiện chưa có phần thưởng nào để nhận. Dùng `/nhiemvu kiemtra` để xem tiến độ."
          : empty[0],
      flags: MessageFlags.Ephemeral,
    });
  return interaction.reply({
    content: lines.join("\n"),
    allowedMentions: { parse: [] },
  });
}

module.exports = {
  rewardText,
  data: new SlashCommandBuilder()
    .setName("nhiemvu")
    .setDescription("Nhiệm vụ, điểm danh và phần thưởng hoạt động")
    .addSubcommand((command) =>
      command
        .setName("kiemtra")
        .setDescription(
          "Kiểm tra nhanh nhiệm vụ, thành tựu và thưởng chưa nhận",
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("nhan")
        .setDescription("Nhận phần thưởng đã hoàn thành")
        .addStringOption((option) =>
          option
            .setName("loai")
            .setDescription("Loại phần thưởng cần nhận (mặc định: tất cả)")
            .addChoices(...CLAIM_TYPES),
        ),
    )
    .addSubcommand((command) =>
      command.setName("diemdanh").setDescription("Điểm danh hằng ngày"),
    )
    .addSubcommand((command) =>
      command
        .setName("tanthu")
        .setDescription(
          "Nhận thưởng tân thủ: 1 vé Gacha ×10 và 3000 kim cương (một lần)",
        ),
    ),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Lệnh này chỉ dùng trong server.",
        flags: MessageFlags.Ephemeral,
      });
    const sub = interaction.options.getSubcommand();
    if (sub === "kiemtra") return kiemtraCommand.show(interaction);
    if (sub === "nhan")
      return claimReply(
        interaction,
        interaction.options.getString("loai") || "tatca",
      );
    if (sub === "tanthu") {
      const result = claimNewbieBonus(interaction.guildId, interaction.user.id);
      if (!result.claimed)
        return interaction.reply({
          content: "Bạn đã nhận thưởng tân thủ trước đây.",
          flags: MessageFlags.Ephemeral,
        });
      return interaction.reply({
        content: `🎉 <@${interaction.user.id}> nhận thưởng tân thủ: **1 vé Gacha ×10** + **${number(NEWBIE_DIAMONDS)} :gem:**. Dùng \`/vatpham quay\` để quay.`,
        allowedMentions: { users: [interaction.user.id] },
      });
    }
    const result = checkIn(interaction.guildId, interaction.user.id);
    if (!result.ok)
      return interaction.reply({
        content: `Bạn đã điểm danh hôm nay. Chuỗi điểm danh: **${result.streak}/7**.`,
        flags: MessageFlags.Ephemeral,
      });
    const reward = [
      `${formatCoins(result.coins)} :coin:`,
      result.diamonds ? `${result.diamonds} :gem:` : null,
    ]
      .filter(Boolean)
      .join(" + ");
    return interaction.reply({
      content: `📅 <@${interaction.user.id}> điểm danh ngày **${result.date}**, chuỗi điểm danh **${result.streak}/7**, nhận được: **${reward}**.${result.reset ? "\n🎉 Hoàn thành chuỗi 7 ngày! Chuỗi đã đặt lại; ngày mai bắt đầu lại từ 1/7." : ""}`,
      allowedMentions: { users: [interaction.user.id] },
    });
  },
};
