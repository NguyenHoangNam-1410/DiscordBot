const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const {
  GAMES,
  addGameChannel,
  removeGameChannel,
  getGameChannels,
  SINGLE_CHANNEL_GAMES,
  listGameChannels,
} = require("../services/gameChannelService");
const {
  REWARD_GAMES,
  setGameReward,
  listGameRewards,
} = require("../services/gameRewardService");
const { formatCoins } = require("../utils/economy");
const {
  BET_GAMES,
  setGameBetLimit,
  listGameBetLimits,
} = require("../services/gameBetLimitService");
const { getEconomyDashboard } = require("../services/economyService");
const {
  getOperationalHealth,
} = require("../services/operationalHealthService");
const {
  configKeysForScope,
  GAME_CONFIG_SPECS,
  listGameConfigs,
  setGameConfig,
  resetGameConfig,
} = require("../services/gameConfigService");
const {
  listGachaPool,
  tierSummary,
  addGachaItem,
  setGachaEnabled,
  gachaItemChoices,
} = require("../services/gachaPoolService");
const {
  listBuffs,
  setBuff,
  removeBuff,
} = require("../services/gameBuffService");

const LABELS = {
  baucua: "Bầu cua",
  taixiu: "Tài xỉu",
  chinchiro: "Chinchiro",
  blackjack: "Xì dách",
  poker: "Poker",
  duangua: "Đua ngựa",
  mines: "Dò mìn",
  coquay: "Cò quay Nga",
  hardcore: "Sinh tồn",
  vuatiengviet: "Vua tiếng Việt",
  2048: "2048",
};
const choices = GAMES.map((game) => ({ name: LABELS[game], value: game }));
const rewardChoices = REWARD_GAMES.map((game) => ({
  name: LABELS[game],
  value: game,
}));
const betChoices = BET_GAMES.map((game) => ({
  name: LABELS[game],
  value: game,
}));
const configChoices = configKeysForScope("system").map((key) => ({
  name: `${GAME_CONFIG_SPECS[key].label} (${key})`,
  value: key,
}));
const tierChoices = ["R", "SR", "SSR", "UR"].map((value) => ({
  name: value,
  value,
}));
const buffChoices = [
  { name: "Nhân số xu drop", value: "coins" },
  { name: "Tăng tỷ lệ ra vật phẩm Gacha", value: "gacha_luck" },
];
const buffLabels = Object.fromEntries(
  buffChoices.map((item) => [item.value, item.name]),
);

function isAdmin(interaction) {
  const ids = String(process.env.ADMIN_USER_ID || "")
    .split(/[,;\n]/)
    .map((id) => id.trim())
    .filter(Boolean);
  return (
    ids.includes(interaction.user.id) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}
function durationText(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return (
    [
      days && `${days} ngày`,
      hours && `${hours} giờ`,
      minutes && `${minutes} phút`,
    ]
      .filter(Boolean)
      .join(" ") || "< 1 phút"
  );
}
function sizeText(bytes) {
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}
function configValueText(item) {
  if (item.key === "HARD_QUESTION_CHANCE" || item.key.endsWith("_DROP_CHANCE"))
    return `${item.value} (${(item.value * 100).toFixed(2).replace(/\.00$/, "")}%)`;
  if (item.key === "HARD_QUESTION_DURATION_SECONDS")
    return `${item.value} giây`;
  return item.key === "ECONOMY_STARTING_COINS" ||
    item.key === "VUATIENGVIET_REWARD" ||
    item.key === "POKER_ANTE"
    ? `${formatCoins(item.value)} :coin:`
    : String(item.value);
}

const CONFIG_LABELS = {
  system: "HỆ THỐNG",
  ...LABELS,
  chatbot: "CHATBOT",
  gacha: "GACHA",
};
const CONFIG_PAGE_SIZE = 8;
function configPanel(
  guildId,
  status = null,
  scope = "system",
  ownerId = "",
  requestedPage = 0,
) {
  if (!Object.hasOwn(CONFIG_LABELS, scope))
    throw new Error("INVALID_CONFIG_SCOPE");
  const all = listGameConfigs(guildId, scope);
  const pages = Math.max(1, Math.ceil(all.length / CONFIG_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, requestedPage));
  const configs = all.slice(
    page * CONFIG_PAGE_SIZE,
    (page + 1) * CONFIG_PAGE_SIZE,
  );
  const description = configs
    .map(
      (item) =>
        `**${item.label}** · \`${item.key}\`\n${configValueText(item).slice(0, 180) || "(trống)"} · ${item.customized ? "🟢 tùy chỉnh" : "⚪ mặc định"}\n_${item.note}_`,
    )
    .join("\n\n");
  const select = new StringSelectMenuBuilder()
    .setCustomId(`game-config-select:${scope}:${ownerId}:${page}`)
    .setPlaceholder("Chọn cấu hình muốn chỉnh sửa…")
    .addOptions(
      configs.map((item) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.label.slice(0, 100))
          .setValue(item.key)
          .setDescription((configValueText(item) || "(trống)").slice(0, 100)),
      ),
    );
  const navigation = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `game-config-page:${scope}:${ownerId}:${Math.max(0, page - 1)}`,
      )
      .setLabel("Trước")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(
        `game-config-page:${scope}:${ownerId}:${Math.min(pages - 1, page + 1)}`,
      )
      .setLabel("Sau")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === pages - 1),
  );
  return {
    allowedMentions: { parse: [] },
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`⚙️ CẤU HÌNH ${CONFIG_LABELS[scope]}`)
        .setDescription(`${status ? status + "\n\n" : ""}${description}`)
        .setFooter({
          text: `Trang ${page + 1}/${pages} • Chọn mục để sửa hoặc khôi phục • Chỉ admin • Theo server`,
        }),
    ],
    components: [
      new ActionRowBuilder().addComponents(select),
      ...(pages > 1 ? [navigation] : []),
    ],
  };
}
function configEditModal(guildId, key, scope, ownerId, page) {
  const item = listGameConfigs(guildId, scope).find(
    (config) => config.key === key,
  );
  if (!item) throw new Error("INVALID_GAME_CONFIG");
  const hint =
    item.choices?.join(" | ") ||
    (item.type === "string"
      ? item.note
      : `${item.min} đến ${item.max}${item.type === "integer" ? " · số nguyên" : ""}`);
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(("Giá trị mới · " + item.label).slice(0, 45))
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(item.maxLength || 24)
    .setPlaceholder(hint.slice(0, 100));
  if (String(item.value)) input.setValue(String(item.value));
  const reset = new TextInputBuilder()
    .setCustomId("reset")
    .setLabel("Gõ MACDINH để khôi phục (tùy chọn)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(7);
  return new ModalBuilder()
    .setCustomId(`game-config-modal:${scope}:${ownerId}:${page}:${key}`)
    .setTitle("Chỉnh cấu hình " + CONFIG_LABELS[scope].slice(0, 25))
    .addComponents(
      new ActionRowBuilder().addComponents(input),
      new ActionRowBuilder().addComponents(reset),
    );
}
function configContext(interaction, key = null) {
  const [, scope, ownerId, rawPage] = interaction.customId.split(":");
  const page = Number(rawPage);
  if (
    !interaction.guildId ||
    !isAdmin(interaction) ||
    interaction.user.id !== ownerId ||
    !Object.hasOwn(CONFIG_LABELS, scope) ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page >= Math.ceil(configKeysForScope(scope).length / CONFIG_PAGE_SIZE) ||
    (key !== null && !configKeysForScope(scope).includes(key))
  )
    return null;
  return { scope, ownerId, page };
}
const deniedConfig = (interaction) =>
  interaction.reply({
    content:
      "Cấu hình không hợp lệ hoặc bạn không có quyền. Chỉ admin đã mở bảng mới được thao tác; hãy mở lại lệnh cấu hình.",
    flags: MessageFlags.Ephemeral,
  });
async function openConfig(interaction, scope = "system") {
  if (!interaction.guildId || !isAdmin(interaction))
    return deniedConfig(interaction);
  return interaction.reply({
    ...configPanel(interaction.guildId, null, scope, interaction.user.id),
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  configPanel,
  openConfig,
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Quản trị trò chơi, economy và vận hành bot")
    .addSubcommand((command) =>
      command
        .setName("setup")
        .setDescription(
          "Thêm/gỡ channel được chơi một game (Vua tiếng Việt chỉ 1)",
        )
        .addStringOption((option) =>
          option
            .setName("trochoi")
            .setDescription("Trò chơi")
            .setRequired(true)
            .addChoices(...choices),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel chứa game; có thể dùng chung")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName("hanhdong")
            .setDescription("Thêm hoặc gỡ channel (mặc định: thêm)")
            .addChoices(
              { name: "Thêm channel", value: "add" },
              { name: "Gỡ channel", value: "remove" },
            ),
        ),
    )
    .addSubcommand((command) =>
      command.setName("channels").setDescription("Xem channel đã thiết lập"),
    )
    .addSubcommand((command) =>
      command
        .setName("reward")
        .setDescription("Đặt phần thưởng xu cho một game")
        .addStringOption((option) =>
          option
            .setName("trochoi")
            .setDescription("Game có thưởng cố định")
            .setRequired(true)
            .addChoices(...rewardChoices),
        )
        .addIntegerOption((option) =>
          option
            .setName("xu")
            .setDescription("Số xu thưởng (0–100.000)")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(100000),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("rewards")
        .setDescription("Xem phần thưởng của từng game"),
    )
    .addSubcommand((command) =>
      command
        .setName("maxbet")
        .setDescription("Đặt giới hạn cược tối đa cho một game")
        .addStringOption((option) =>
          option
            .setName("trochoi")
            .setDescription("Game đặt cược")
            .setRequired(true)
            .addChoices(...betChoices),
        )
        .addIntegerOption((option) =>
          option
            .setName("xu")
            .setDescription("Giới hạn mỗi người/ván (10–100.000)")
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(100000),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("maxbets")
        .setDescription("Xem giới hạn cược của các game"),
    )
    .addSubcommand((command) =>
      command
        .setName("economy")
        .setDescription("Xem sức khỏe nền kinh tế trong 24 giờ"),
    )
    .addSubcommand((command) =>
      command
        .setName("health")
        .setDescription("Kiểm tra database, backup và phiên đang chạy"),
    )
    .addSubcommand((command) =>
      command
        .setName("configs")
        .setDescription("Xem và chỉnh cấu hình chung của bot"),
    )
    .addSubcommand((command) =>
      command
        .setName("config")
        .setDescription("Thay đổi một biến chung của hệ thống")
        .addStringOption((option) =>
          option
            .setName("bien")
            .setDescription("Biến cần thay đổi")
            .setRequired(true)
            .addChoices(...configChoices),
        )
        .addNumberOption((option) =>
          option
            .setName("giatri")
            .setDescription("Giá trị mới")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(1_000_000),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("configreset")
        .setDescription("Khôi phục một biến về giá trị .env/mặc định")
        .addStringOption((option) =>
          option
            .setName("bien")
            .setDescription("Biến cần khôi phục")
            .setRequired(true)
            .addChoices(...configChoices),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("gachaadd")
        .setDescription(
          "Thêm vật phẩm catalog vào pool Gacha (tỷ lệ bậc không đổi)",
        )
        .addStringOption((option) =>
          option
            .setName("item")
            .setDescription("Vật phẩm")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("tier")
            .setDescription("Bậc hiếm")
            .setRequired(true)
            .addChoices(...tierChoices),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("gachatoggle")
        .setDescription("Bật hoặc tắt một phần thưởng trong pool Gacha")
        .addStringOption((option) =>
          option
            .setName("reward")
            .setDescription("Phần thưởng trong pool")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("state")
            .setDescription("Trạng thái")
            .setRequired(true)
            .addChoices(
              { name: "Bật", value: "on" },
              { name: "Tắt", value: "off" },
            ),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("gachapool")
        .setDescription("Xem tỷ lệ theo bậc và pool Gacha hiện tại"),
    )
    .addSubcommand((command) =>
      command
        .setName("buffset")
        .setDescription("Bật, tắt hoặc xem buff sự kiện có thời hạn")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Thao tác")
            .setRequired(true)
            .addChoices(
              { name: "Bật/cập nhật", value: "set" },
              { name: "Tắt", value: "remove" },
              { name: "Xem buff đang chạy", value: "list" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Loại buff (bắt buộc khi bật hoặc tắt)")
            .addChoices(...buffChoices),
        )
        .addNumberOption((option) =>
          option
            .setName("percent")
            .setDescription("Hệ số 100–1000%; ví dụ 200% là nhân đôi")
            .setMinValue(100)
            .setMaxValue(1000),
        )
        .addNumberOption((option) =>
          option
            .setName("hours")
            .setDescription("Thời lượng buff, tối đa 720 giờ")
            .setMinValue(0.1)
            .setMaxValue(720),
        ),
    ),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Lệnh này chỉ dùng được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "setup") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được thiết lập channel game.",
          flags: MessageFlags.Ephemeral,
        });
      const game = interaction.options.getString("trochoi", true);
      const channel = interaction.options.getChannel("channel", true);
      if (interaction.options.getString("hanhdong") === "remove") {
        const removed = removeGameChannel(
          interaction.guildId,
          game,
          channel.id,
        );
        return interaction.reply({
          content: removed
            ? `✅ Đã gỡ <#${channel.id}> khỏi **${LABELS[game]}**.`
            : `<#${channel.id}> không nằm trong danh sách channel của **${LABELS[game]}**.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      addGameChannel(interaction.guildId, game, channel.id);
      const all = getGameChannels(interaction.guildId, game)
        .map((row) => `<#${row.channel_id}>`)
        .join(", ");
      return interaction.reply({
        content: SINGLE_CHANNEL_GAMES.includes(game)
          ? `✅ Đã đặt <#${channel.id}> làm channel duy nhất của **${LABELS[game]}**.`
          : `✅ Đã thêm <#${channel.id}> cho **${LABELS[game]}**. Các channel hiện tại: ${all}.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "reward") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được thay đổi phần thưởng game.",
          flags: MessageFlags.Ephemeral,
        });
      const game = interaction.options.getString("trochoi", true);
      const reward = interaction.options.getInteger("xu", true);
      setGameReward(interaction.guildId, game, reward);
      return interaction.reply({
        content: `✅ Phần thưởng **${LABELS[game]}** đã đặt thành **${formatCoins(reward)} :coin:** mỗi đáp án đúng.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "rewards") {
      const description = listGameRewards(interaction.guildId)
        .map(
          (item) =>
            `**${LABELS[item.game]}:** ${formatCoins(item.reward)} :coin:`,
        )
        .join("\n");
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle("💰 PHẦN THƯỞNG GAME")
            .setDescription(description),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "maxbet") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được thay đổi giới hạn cược.",
          flags: MessageFlags.Ephemeral,
        });
      const game = interaction.options.getString("trochoi", true);
      const maxBet = interaction.options.getInteger("xu", true);
      setGameBetLimit(interaction.guildId, game, maxBet);
      return interaction.reply({
        content: `✅ Giới hạn cược của **${LABELS[game]}** là **${formatCoins(maxBet)} :coin:/người/ván**.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "maxbets") {
      const description = listGameBetLimits(interaction.guildId)
        .map(
          (item) =>
            `**${LABELS[item.game]}:** ${formatCoins(item.maxBet)} :coin:/người/ván`,
        )
        .join("\n");
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle("🎚️ GIỚI HẠN CƯỢC")
            .setDescription(description),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "economy") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được xem bảng điều khiển economy.",
          flags: MessageFlags.Ephemeral,
        });
      const stats = getEconomyDashboard(interaction.guildId);
      const direction =
        stats.net > 0 ? "📈 Tăng" : stats.net < 0 ? "📉 Giảm" : "➖ Không đổi";
      const categories = stats.categories.length
        ? stats.categories
            .map(
              (item) =>
                `**${item.category}:** +${formatCoins(item.incoming)} / −${formatCoins(item.outgoing)} · ${item.transactions} giao dịch`,
            )
            .join("\n")
        : "Chưa có giao dịch trong 24 giờ qua.";
      const embed = new EmbedBuilder()
        .setColor(
          stats.net > 0 ? 0x2ecc71 : stats.net < 0 ? 0xe74c3c : 0x95a5a6,
        )
        .setTitle("📊 SỨC KHỎE ECONOMY · 24 GIỜ")
        .addFields(
          {
            name: "Tổng cung",
            value: `${formatCoins(stats.supply)} :coin:`,
            inline: true,
          },
          {
            name: "Người chơi",
            value: `${stats.users} tổng · ${stats.activeUsers} hoạt động`,
            inline: true,
          },
          {
            name: "Trung bình",
            value: `${formatCoins(stats.average)} :coin:/người`,
            inline: true,
          },
          {
            name: "Dòng vào",
            value: `+${formatCoins(stats.minted)} :coin:`,
            inline: true,
          },
          {
            name: "Dòng ra",
            value: `−${formatCoins(stats.spent)} :coin:`,
            inline: true,
          },
          {
            name: "Biến động",
            value: `${direction} ${formatCoins(Math.abs(stats.net))} :coin:`,
            inline: true,
          },
          { name: "Nguồn giao dịch lớn nhất", value: categories },
        )
        .setFooter({
          text: `${stats.transactions} giao dịch trong 24 giờ · Chỉ admin nhìn thấy`,
        })
        .setTimestamp();
      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "health") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được xem trạng thái vận hành.",
          flags: MessageFlags.Ephemeral,
        });
      const health = getOperationalHealth();
      const backupTime = health.backup.lastSuccessAt
        ? `<t:${Math.floor(new Date(health.backup.lastSuccessAt).getTime() / 1000)}:R>`
        : health.backup.running
          ? "Đang tạo bản sao đầu tiên"
          : "Chưa có trong phiên chạy này";
      const healthy =
        health.database.check === "ok" &&
        !health.backup.lastError &&
        !health.backup.discord?.lastError;
      const embed = new EmbedBuilder()
        .setColor(healthy ? 0x2ecc71 : 0xe67e22)
        .setTitle(`${healthy ? "✅" : "⚠️"} TRẠNG THÁI VẬN HÀNH`)
        .addFields(
          {
            name: "Database",
            value: `${health.database.check === "ok" ? "Toàn vẹn" : health.database.check} · ${sizeText(health.database.bytes)} · schema v${health.database.migration} · ghi ${health.database.synchronous}`,
            inline: true,
          },
          {
            name: "Thời gian chạy",
            value: durationText(health.runtime.uptimeSeconds),
            inline: true,
          },
          {
            name: "Lỗi runtime",
            value: String(health.runtime.runtimeErrors),
            inline: true,
          },
          {
            name: "Phiên hoạt động",
            value: `${health.active.total} tổng · ${health.active.sessions} cá nhân · ${health.active.multiplayer} bàn chung · ${health.active.duels} solo`,
          },
          {
            name: "Backup gần nhất",
            value: `${backupTime}\nLịch: mỗi ${health.backup.intervalMinutes} phút · giữ ${health.backup.retention} bản
${
  health.backup.discord?.configured
    ? "DM Discord: " +
      (health.backup.discord.lastSuccessAt
        ? "<t:" +
          Math.floor(
            new Date(health.backup.discord.lastSuccessAt).getTime() / 1000,
          ) +
          ":R>"
        : health.backup.discord.waitingForDiscord
          ? "Chờ Discord kết nối"
          : "Chưa gửi thành công")
    : "Chỉ lưu trên máy chủ; chưa cấu hình DM Discord."
}
${health.backup.discord?.lastError ? "⚠️ " + health.backup.discord.lastError : ""}${health.backup.lastError ? `\n⚠️ ${health.backup.lastError}` : ""}`,
          },
        )
        .setTimestamp();
      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "configs") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được xem cấu hình game.",
          flags: MessageFlags.Ephemeral,
        });
      return interaction.reply({
        ...configPanel(
          interaction.guildId,
          null,
          "system",
          interaction.user.id,
        ),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "config") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được thay đổi cấu hình game.",
          flags: MessageFlags.Ephemeral,
        });
      const key = interaction.options.getString("bien", true);
      if (!configKeysForScope("system").includes(key))
        return deniedConfig(interaction);
      const value = interaction.options.getNumber("giatri", true);
      try {
        const item = setGameConfig(
          interaction.guildId,
          key,
          value,
          interaction.user.id,
        );
        return interaction.reply({
          content: `✅ **${item.label}** đã đổi thành **${configValueText(item)}** và áp dụng ngay cho server này.\n_${item.note}_`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        if (error.message === "INVALID_DROP_RANGE")
          return interaction.reply({
            content:
              "Khoảng drop không hợp lệ: giá trị tối thiểu không được lớn hơn giá trị tối đa.",
            flags: MessageFlags.Ephemeral,
          });
        if (error.message !== "INVALID_GAME_CONFIG_VALUE") throw error;
        const spec = error.spec;
        return interaction.reply({
          content: `Giá trị không hợp lệ. **${spec.label}** nhận ${spec.type === "integer" ? "số nguyên " : "số "}từ **${spec.min}** đến **${spec.max}**.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    if (subcommand === "configreset") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được khôi phục cấu hình game.",
          flags: MessageFlags.Ephemeral,
        });
      const key = interaction.options.getString("bien", true);
      if (!configKeysForScope("system").includes(key))
        return deniedConfig(interaction);
      const item = resetGameConfig(interaction.guildId, key);
      return interaction.reply({
        content: `↩️ **${item.label}** đã trở về **${configValueText(item)}** từ .env/mặc định.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "gachaadd") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được thay đổi pool Gacha.",
          flags: MessageFlags.Ephemeral,
        });
      try {
        const entry = addGachaItem(
          interaction.guildId,
          interaction.options.getString("item", true),
          interaction.options.getString("tier", true),
          interaction.user.id,
        );
        const summary = tierSummary(interaction.guildId).find(
          (row) => row.tier === entry.tier,
        );
        return interaction.reply({
          content: `✅ Đã thêm/bật **${entry.name}** ở bậc **${entry.tier}**. Bậc ${entry.tier} giữ nguyên **${summary.rate.toFixed(2)}%**, chia đều cho **${summary.count}** phần thưởng (mỗi phần **${entry.rate.toFixed(2)}%**).`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        if (error.message === "INVALID_GACHA_ITEM")
          return interaction.reply({
            content: "Vật phẩm không tồn tại trong catalog.",
            flags: MessageFlags.Ephemeral,
          });
        if (error.message === "INVALID_GACHA_TIER")
          return interaction.reply({
            content:
              "Bậc Gacha phải trùng với phân loại R/SR/SSR/UR của vật phẩm.",
            flags: MessageFlags.Ephemeral,
          });
        throw error;
      }
    }
    if (subcommand === "gachatoggle") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được thay đổi tỷ lệ Gacha.",
          flags: MessageFlags.Ephemeral,
        });
      try {
        const entry = setGachaEnabled(
          interaction.guildId,
          interaction.options.getString("reward", true),
          interaction.options.getString("state", true) === "on",
          interaction.user.id,
        );
        return interaction.reply({
          content:
            entry.weight === 0
              ? `✅ Đã tắt **${entry.name}**; các phần thưởng còn lại trong bậc ${entry.tier} chia lại tỷ lệ bậc.`
              : `✅ Đã bật **${entry.name}** (${entry.rate.toFixed(2)}%).`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        if (error.message === "INVALID_GACHA_REWARD")
          return interaction.reply({
            content: "Phần thưởng này không có trong pool Gacha.",
            flags: MessageFlags.Ephemeral,
          });
        if (error.message === "GACHA_REQUIRES_HIGH_TIER")
          return interaction.reply({
            content:
              "Không thể tắt phần thưởng bậc cao cuối cùng vì Gacha cần bảo đảm SR và UR.",
            flags: MessageFlags.Ephemeral,
          });
        if (error.message === "EMPTY_GACHA_POOL")
          return interaction.reply({
            content: "Không thể tắt phần thưởng cuối cùng trong pool Gacha.",
            flags: MessageFlags.Ephemeral,
          });
        throw error;
      }
    }
    if (subcommand === "gachapool") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được xem cấu hình Gacha.",
          flags: MessageFlags.Ephemeral,
        });
      const pool = listGachaPool(interaction.guildId);
      const tiers = tierSummary(interaction.guildId);
      const description = tiers
        .map((row) => {
          const lines = pool
            .filter((entry) => entry.tier === row.tier)
            .map(
              (entry) =>
                `• ${entry.name} — ${entry.weight > 0 ? `${entry.rate.toFixed(2)}%` : "_đã tắt_"}${entry.customized ? " · tùy chỉnh" : ""}`,
            );
          return `**${row.tier} — ${row.rate.toFixed(2)}%** (${row.count} phần thưởng, chia đều)\n${lines.join("\n")}`;
        })
        .join("\n\n");
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle("🎰 POOL GACHA")
            .setDescription(description.slice(0, 4096))
            .setFooter({
              text: "Tỷ lệ bậc cố định (chỉnh bằng /gacha cauhinh); vật phẩm trong bậc ngẫu nhiên đều.",
            }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "buffset") {
      if (!isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được điều chỉnh buff sự kiện.",
          flags: MessageFlags.Ephemeral,
        });
      const action = interaction.options.getString("action", true);
      if (action === "list") {
        const buffs = listBuffs(interaction.guildId);
        const description = buffs.length
          ? buffs
              .map(
                (buff) =>
                  `**${buffLabels[buff.buff_type]}:** ×${(buff.chance_bps / 10_000).toFixed(2).replace(/\.00$/, "")} · hết hạn <t:${Math.floor(buff.ends_at / 1000)}:R>`,
              )
              .join("\n")
          : "Không có buff sự kiện nào đang hoạt động.";
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xf1c40f)
              .setTitle("🎊 BUFF SỰ KIỆN")
              .setDescription(description),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      const type = interaction.options.getString("type");
      if (!type)
        return interaction.reply({
          content: "Cần chọn `loai` buff khi bật hoặc tắt.",
          flags: MessageFlags.Ephemeral,
        });
      if (action === "remove") {
        const removed = removeBuff(interaction.guildId, type);
        return interaction.reply({
          content: removed
            ? `✅ Đã tắt **${buffLabels[type]}**.`
            : "Buff này hiện không hoạt động.",
          flags: MessageFlags.Ephemeral,
        });
      }
      const percent = interaction.options.getNumber("percent");
      const hours = interaction.options.getNumber("hours");
      if (percent === null || hours === null)
        return interaction.reply({
          content: "Khi bật buff, cần nhập `phantram` và `sogio`.",
          flags: MessageFlags.Ephemeral,
        });
      const buff = setBuff({
        guildId: interaction.guildId,
        type,
        percent,
        hours,
        updatedBy: interaction.user.id,
      });
      const detail =
        type === "gacha_luck"
          ? `nhân trọng số vật phẩm lên **${percent}%**`
          : `nhân lượng drop lên **${percent}%**`;
      return interaction.reply({
        content: `✅ Đã bật **${buffLabels[type]}**: ${detail}, kết thúc <t:${Math.floor(buff.ends_at / 1000)}:R>.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const settings = new Map();
    for (const row of listGameChannels(interaction.guildId))
      settings.set(row.game, [
        ...(settings.get(row.game) || []),
        row.channel_id,
      ]);
    const description = GAMES.map(
      (game) =>
        `**${LABELS[game]}:** ${
          settings.has(game)
            ? settings
                .get(game)
                .map((id) => `<#${id}>`)
                .join(", ")
            : "Chưa thiết lập"
        }`,
    ).join("\n");
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🎮 CHANNEL TRÒ CHƠI")
          .setDescription(description),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
  async handleConfigPage(interaction) {
    const ctx = configContext(interaction);
    if (!ctx) return deniedConfig(interaction);
    return interaction.update(
      configPanel(interaction.guildId, null, ctx.scope, ctx.ownerId, ctx.page),
    );
  },
  async handleConfigSelect(interaction) {
    const key = interaction.values?.[0];
    if (typeof key !== "string") return deniedConfig(interaction);
    const ctx = configContext(interaction, key);
    if (!ctx) return deniedConfig(interaction);
    return interaction.showModal(
      configEditModal(
        interaction.guildId,
        key,
        ctx.scope,
        ctx.ownerId,
        ctx.page,
      ),
    );
  },
  async handleConfigModal(interaction) {
    const key = interaction.customId.split(":")[4];
    if (typeof key !== "string") return deniedConfig(interaction);
    const ctx = configContext(interaction, key);
    if (!ctx) return deniedConfig(interaction);
    try {
      const reset = interaction.fields.getTextInputValue("reset").trim();
      if (reset && reset !== "MACDINH")
        return interaction.reply({
          content:
            "Để khôi phục, nhập đúng MACDINH; để trống nếu chỉ sửa giá trị.",
          flags: MessageFlags.Ephemeral,
        });
      const value = interaction.fields.getTextInputValue("value");
      const spec = GAME_CONFIG_SPECS[key];
      if (
        !reset &&
        ["channels", "chatbot_channel"].includes(spec.storage) &&
        value.trim()
      ) {
        for (const id of value.split(/\s*,\s*/)) {
          const channel = await interaction.guild?.channels
            .fetch(id.trim())
            .catch(() => null);
          if (
            !channel ||
            channel.guildId !== interaction.guildId ||
            channel.type !== ChannelType.GuildText
          )
            return interaction.reply({
              content: "Chỉ nhận ID kênh văn bản thuộc server này.",
              flags: MessageFlags.Ephemeral,
            });
        }
      }
      // Recheck privileges after channel lookup before writing.
      if (!configContext(interaction, key)) return deniedConfig(interaction);
      const item = reset
        ? resetGameConfig(interaction.guildId, key)
        : setGameConfig(interaction.guildId, key, value, interaction.user.id);
      return interaction.update(
        configPanel(
          interaction.guildId,
          `✅ **${item.label}**: ${configValueText(item) || "(trống)"}${reset ? " · đã khôi phục" : ""}.`,
          ctx.scope,
          ctx.ownerId,
          ctx.page,
        ),
      );
    } catch (error) {
      if (error.message === "INVALID_DROP_RANGE")
        return interaction.reply({
          content: "Giá trị tối thiểu không được lớn hơn giá trị tối đa.",
          flags: MessageFlags.Ephemeral,
        });
      if (error.message !== "INVALID_GAME_CONFIG_VALUE") throw error;
      const spec = error.spec;
      const range =
        spec.type === "string"
          ? spec.choices?.join(" | ") || spec.note
          : `${spec.min}–${spec.max}${spec.type === "integer" ? " (số nguyên)" : ""}`;
      return interaction.reply({
        content: `Giá trị không hợp lệ. **${spec.label}**: ${range}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused?.() || "";
    const source =
      subcommand === "gachaadd"
        ? gachaItemChoices()
        : subcommand === "gachatoggle"
          ? listGachaPool(interaction.guildId).map((entry) => ({
              name: `${entry.tier} · ${entry.name} · ${entry.weight > 0 ? `${entry.rate.toFixed(2)}%` : "đã tắt"}`,
              value: entry.rewardKey,
            }))
          : [];
    const query = String(focused).toLocaleLowerCase("vi");
    return interaction.respond(
      source
        .filter(
          (item) =>
            item.name.toLocaleLowerCase("vi").includes(query) ||
            item.value.includes(query),
        )
        .slice(0, 25),
    );
  },
};
