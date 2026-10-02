// Bảng quản trị dạng giao diện (nút + menu + modal) cho /quantri: thưởng vai trò hàng tuần và hệ số thắng cược 1-1.
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { isAdminInteraction } = require("../utils/adminCheck");
const { coins } = require("../utils/rewardText");
const {
  MAX_WEEKLY_ROLE_REWARD,
  listWeeklyRoleRewards,
  setWeeklyRoleReward,
  removeWeeklyRoleReward,
} = require("../services/weeklyRoleRewardService");
const {
  MIN_WIN_MULTIPLIER,
  MAX_WIN_MULTIPLIER,
  WIN_MULTIPLIER_GAMES,
  listWinMultipliers,
  describeWinMultiplier,
  setWinMultiplier,
  resetAllWinMultipliers,
  formatMultiplier,
} = require("../services/winMultiplierService");

const DENY = "Chỉ quản trị đã mở bảng này mới được sử dụng.";
const rtpText = (value) => `${value.toFixed(1).replace(".", ",")}%`;

// ───────────────────────── Thưởng vai trò hàng tuần ─────────────────────────
// customId: admin-rolereward:<chủ bảng>:<hành động>   |   modal: admin-rolereward:<chủ bảng>:<roleId>
function roleName(interaction, roleId) {
  return interaction.guild?.roles?.cache?.get(roleId)?.name || `Vai trò ${roleId}`;
}

function roleRewardPanel(guildId, ownerId, { status = null, mode = "main", interaction = null } = {}) {
  const configs = listWeeklyRoleRewards(guildId);
  const lines = configs.length
    ? configs
        .map((item) => `<@&${item.role_id}> — **${coins(item.amount)}/người/tuần** · từ tuần \`${item.starts_week_key}\``)
        .join("\n")
    : "Chưa cấu hình vai trò nào nhận thưởng hàng tuần.";
  const intro = {
    main: "Dùng các nút bên dưới để thêm, sửa hoặc xóa mức thưởng.",
    add: "**Bước 1/2:** chọn vai trò cần đặt hoặc sửa mức thưởng. Sau đó nhập số xu.",
    remove: "Chọn vai trò muốn **xóa** khỏi danh sách thưởng.",
  }[mode];
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🎁 THƯỞNG VAI TRÒ HÀNG TUẦN")
    .setDescription([status, lines, intro].filter(Boolean).join("\n\n").slice(0, 4000))
    .setFooter({ text: "Người chơi nhận bằng /nhiemvu nhan (loại Thưởng vai trò) · Quên nhận sẽ mất phần tuần đó · Mức mới áp dụng từ tuần hiện tại" });
  const id = (action) => `admin-rolereward:${ownerId}:${action}`;
  let rows;
  if (mode === "add") {
    rows = [
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId(id("pick")).setPlaceholder("Chọn vai trò để đặt mức thưởng…").setMinValues(1).setMaxValues(1),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id("back")).setLabel("Quay lại").setEmoji("↩️").setStyle(ButtonStyle.Secondary)),
    ];
  } else if (mode === "remove") {
    rows = [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("drop"))
          .setPlaceholder("Chọn vai trò để xóa thưởng…")
          .addOptions(
            configs.slice(0, 25).map((item) =>
              new StringSelectMenuOptionBuilder()
                .setLabel((interaction ? roleName(interaction, item.role_id) : item.role_id).slice(0, 100))
                .setValue(item.role_id)
                .setDescription(`${new Intl.NumberFormat("vi-VN").format(item.amount)} xu/người/tuần`),
            ),
          ),
      ),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id("back")).setLabel("Quay lại").setEmoji("↩️").setStyle(ButtonStyle.Secondary)),
    ];
  } else {
    rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id("add")).setLabel("Thêm / Sửa vai trò").setEmoji("➕").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(id("remove")).setLabel("Xóa vai trò").setEmoji("🗑️").setStyle(ButtonStyle.Danger).setDisabled(!configs.length),
        new ButtonBuilder().setCustomId(id("refresh")).setLabel("Làm mới").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
      ),
    ];
  }
  return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
}

function roleRewardModal(ownerId, roleId, currentAmount) {
  const input = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel("Số xu mỗi thành viên nhận mỗi tuần")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(12)
    .setPlaceholder(`1 đến ${new Intl.NumberFormat("vi-VN").format(MAX_WEEKLY_ROLE_REWARD)}`);
  if (currentAmount) input.setValue(String(currentAmount));
  return new ModalBuilder()
    .setCustomId(`admin-rolereward:${ownerId}:${roleId}`)
    .setTitle("Thưởng vai trò hàng tuần")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function guardAdmin(interaction, ownerId) {
  if (!interaction.guildId || !isAdminInteraction(interaction) || interaction.user.id !== ownerId) {
    await interaction.reply({ content: DENY, flags: MessageFlags.Ephemeral });
    return false;
  }
  return true;
}

// Dùng chung cho nút, menu chọn vai trò/xóa và modal (customId bắt đầu bằng admin-rolereward:).
async function handleRoleRewardInteraction(interaction) {
  const [, ownerId, action] = interaction.customId.split(":");
  if (!(await guardAdmin(interaction, ownerId))) return null;
  const guildId = interaction.guildId;
  const panel = (options) => roleRewardPanel(guildId, ownerId, { interaction, ...options });
  if (interaction.isModalSubmit?.()) {
    const roleId = action; // modal: phần thứ ba là id vai trò
    try {
      const amountText = String(interaction.fields.getTextInputValue("amount")).replace(/[.,\s]/g, "");
      const config = setWeeklyRoleReward({ guildId, roleId, amount: Number(amountText), createdBy: interaction.user.id });
      return interaction.update(panel({ status: `✅ Đã đặt <@&${roleId}> nhận **${coins(config.amount)}/người/tuần**.` }));
    } catch (error) {
      if (error.message !== "INVALID_ROLE_REWARD") throw error;
      return interaction.reply({
        content: `Số xu không hợp lệ: nhập số nguyên từ **1** đến **${new Intl.NumberFormat("vi-VN").format(MAX_WEEKLY_ROLE_REWARD)}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
  if (action === "add") return interaction.update(panel({ mode: "add" }));
  if (action === "remove") return interaction.update(panel({ mode: "remove" }));
  if (action === "back" || action === "refresh") return interaction.update(panel());
  if (action === "pick") {
    const roleId = interaction.values?.[0];
    if (!roleId) return interaction.reply({ content: "Chưa chọn vai trò nào.", flags: MessageFlags.Ephemeral });
    const current = listWeeklyRoleRewards(guildId).find((item) => item.role_id === roleId);
    return interaction.showModal(roleRewardModal(ownerId, roleId, current?.amount));
  }
  if (action === "drop") {
    const roleId = interaction.values?.[0];
    const removed = roleId ? removeWeeklyRoleReward(guildId, roleId) : false;
    return interaction.update(panel({ status: removed ? `🗑️ Đã xóa thưởng của <@&${roleId}>.` : "Vai trò này không còn trong danh sách thưởng." }));
  }
  return interaction.reply({ content: "Thao tác không hợp lệ. Mở lại `/quantri xemthuongvaitro`.", flags: MessageFlags.Ephemeral });
}

// ───────────────────────── Hệ số thắng cược 1-1 với nhà cái ─────────────────────────
// customId: admin-winmult:<chủ bảng>:<hành động>   |   modal: admin-winmult:<chủ bảng>:<game>
function winMultiplierPanel(guildId, ownerId, status = null) {
  const items = listWinMultipliers(guildId);
  const description = items
    .map((item) => {
      const rtp = item.rtp === null ? "" : ` · RTP ước tính **${rtpText(item.rtp)}**${item.rtp > 100 ? " ⚠️ có lợi cho người chơi" : ""}`;
      return `${item.emoji} **${item.label}** · **${formatMultiplier(item.value)}**${item.customized ? ` (mặc định ${formatMultiplier(item.fallback)}) 🟢` : " ⚪ mặc định"}${rtp}\n_${item.note}_`;
    })
    .join("\n\n");
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("🎯 HỆ SỐ THẮNG · CƯỢC 1-1 VỚI NHÀ CÁI")
    .setDescription([status, description].filter(Boolean).join("\n\n").slice(0, 4000))
    .setFooter({
      text: `Hệ số = tổng tiền nhận về / tiền cược khi thắng (x2 = ăn 1 đền 1) · Cho phép x${String(MIN_WIN_MULTIPLIER).replace(".", ",")}–x${MAX_WIN_MULTIPLIER} · Ván đang chơi giữ hệ số đã khóa · RTP là ước tính khi chơi tối ưu, không dùng vật phẩm`,
    });
  const id = (action) => `admin-winmult:${ownerId}:${action}`;
  const select = new StringSelectMenuBuilder()
    .setCustomId(id("pick"))
    .setPlaceholder("Chọn game để đổi hệ số thắng…")
    .addOptions(
      items.map((item) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.label.slice(0, 100))
          .setValue(item.game)
          .setEmoji(item.emoji)
          .setDescription(`Hiện tại ${formatMultiplier(item.value)}${item.customized ? ` · mặc định ${formatMultiplier(item.fallback)}` : " · mặc định"}`.slice(0, 100)),
      ),
    );
  const anyCustom = items.some((item) => item.customized);
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id("reset")).setLabel("Khôi phục mặc định").setEmoji("↩️").setStyle(ButtonStyle.Danger).setDisabled(!anyCustom),
        new ButtonBuilder().setCustomId(id("refresh")).setLabel("Làm mới").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

function winMultiplierModal(guildId, ownerId, game) {
  const item = describeWinMultiplier(guildId, game);
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(`Hệ số thắng mới · ${item.label}`.slice(0, 45))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(8)
    .setValue(String(item.value))
    .setPlaceholder(`${MIN_WIN_MULTIPLIER} đến ${MAX_WIN_MULTIPLIER} (mặc định ${item.fallback})`);
  return new ModalBuilder()
    .setCustomId(`admin-winmult:${ownerId}:${game}`)
    .setTitle("Hệ số thắng cược 1-1")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function handleWinMultiplierInteraction(interaction) {
  const [, ownerId, action] = interaction.customId.split(":");
  if (!(await guardAdmin(interaction, ownerId))) return null;
  const guildId = interaction.guildId;
  if (interaction.isModalSubmit?.()) {
    const game = action; // modal: phần thứ ba là game
    if (!WIN_MULTIPLIER_GAMES.some((item) => item.game === game))
      return interaction.reply({ content: "Game không hợp lệ.", flags: MessageFlags.Ephemeral });
    try {
      const item = setWinMultiplier(guildId, game, interaction.fields.getTextInputValue("value"), interaction.user.id);
      return interaction.update(winMultiplierPanel(guildId, ownerId, `✅ **${item.label}** đã đổi thành **${formatMultiplier(item.value)}**; áp dụng cho các ván mở từ bây giờ.`));
    } catch (error) {
      if (error.message !== "INVALID_WIN_MULTIPLIER") throw error;
      return interaction.reply({
        content: `Hệ số không hợp lệ: nhập số từ **${String(error.min).replace(".", ",")}** đến **${error.max}** (ví dụ \`1,9\` hoặc \`2\`).`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
  if (action === "pick") {
    const game = interaction.values?.[0];
    if (!WIN_MULTIPLIER_GAMES.some((item) => item.game === game))
      return interaction.reply({ content: "Game không hợp lệ.", flags: MessageFlags.Ephemeral });
    return interaction.showModal(winMultiplierModal(guildId, ownerId, game));
  }
  if (action === "reset") {
    resetAllWinMultipliers(guildId);
    return interaction.update(winMultiplierPanel(guildId, ownerId, "↩️ Đã khôi phục hệ số thắng mặc định cho tất cả game."));
  }
  if (action === "refresh") return interaction.update(winMultiplierPanel(guildId, ownerId));
  return interaction.reply({ content: "Thao tác không hợp lệ. Mở lại `/quantri hesothang`.", flags: MessageFlags.Ephemeral });
}

module.exports = {
  roleRewardPanel,
  handleRoleRewardInteraction,
  winMultiplierPanel,
  handleWinMultiplierInteraction,
};
