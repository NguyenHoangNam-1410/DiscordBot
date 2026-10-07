const godReveal = require("./events/godReveal");
const { RNGESUS_CYCLE_RULES, rngesusChaosRules } = require("./events/rngesus");
const {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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

const RATE_CATEGORIES = Object.freeze([
  {
    id: "encounters",
    name: "Encounter & sự kiện",
    emoji: "🌀",
    fields: [
      "Encounter",
      "15 surprise event",
      "Hợp đồng và Class Shrine",
      "Wrong Portal",
    ],
  },
  {
    id: "loot",
    name: "Hòm, item & Luck",
    emoji: "🎁",
    fields: ["Hòm và pity", "100 trang bị riêng", "Luck"],
  },
  {
    id: "rngesus",
    name: "RNGesus",
    emoji: "☠️",
    fields: ["RNGesus", "📊 Chu kỳ gặp RNGesus", "🎲 Cách tính Chaos"],
  },
  {
    id: "combat",
    name: "Chiến đấu & Rift",
    emoji: "⚔️",
    fields: ["Phòng thủ và boss", "Rift"],
  },
  {
    id: "rewards",
    name: "Dịch vụ & phần thưởng",
    emoji: "💎",
    fields: [
      "Dịch vụ và Merchant",
      "Payout",
      "Kim cương và khung hồ sơ",
      "Giới hạn",
    ],
  },
]);

function ratesEmbed(category = null) {
  if (require("./shared/version").useV2()) {
    return new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle("🎰 SINH TỒN v2.0.1 · TỶ LỆ VÀ CƠ CHẾ")
      .setDescription(
        "Run mới dùng v2.0.1. Kết quả ẩn được lưu; mở lại UI/restart không roll lại. Run cũ tiếp tục theo luật legacy.",
      )
      .addFields(require("./ui/index").ratesFields(category));
  }
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("🎰 SINH TỒN · TỶ LỆ VÀ CƠ CHẾ")
    .setDescription(
      "Kết quả ẩn được lưu trong run; mở UI mới hoặc restart không roll lại.",
    )
    .addFields(
      {
        name: "Encounter",
        value:
          "53% quái thường · 12% Elite · 10% hòm · 8% Shrine · 5% kho báu · 6% bẫy · 4% surprise · 2% phòng trống. Boss mỗi 50 tầng; tầng 999 là Final Boss. RNGesus roll trước pool này.",
      },
      {
        name: "Hòm và pity",
        value:
          "3% Ancient Mimic, tổng 15% Mimic. Hòm còn lại: SSR 10% · UR 3% · SR 22% · R 40% · rỗng 20% · giả 5%. SSR = min(35%, 10% + max(0,pity−9)×2% + Luck×0,2% + Legendary Find). Năm hòm không SR+ bảo đảm hòm tiếp tối thiểu SR, không Mimic. Kho báu: SSR 35%, SR 65%; Unstable tăng SSR kho báu tối đa 70%.",
      },
      {
        name: "100 trang bị riêng",
        value:
          "R 32 · SR 28 · SSR 24 · UR 16. Nhặt lại tăng level. Buff và curse UR tách riêng; chỉ Goblin’s Debt (−15%) và Crown of Ruin (−10%) phạt payout. Item chỉ tồn tại trong run; các món từ run cũ vẫn được đọc.",
      },
      {
        name: "15 surprise event",
        value:
          "Healer · Treasure Goblin · Blacksmith · Purifier · Altar of Sacrifice · Cursed Gambler · Lost Adventurer · Blood Fountain · Horadric Forge · Rift Merchant · Mirror of Fate · Treasure Room · Rift Contract · Class Shrine · Strange Doors. Chọn đều trong pool hợp lệ; có thể bỏ qua.",
      },
      {
        name: "Dịch vụ và Merchant",
        value:
          "Rèn: 12% payout để tăng 1 level, gồm buff/curse mới. Giải nguyền: 20% để gỡ 1 lớp curse, giữ buff. Merchant bán 3/5 offer: bình 5%, hồi đầy 8%, Luck 10%, SR 15%, vé 25% payout. Nút hiển thị số xu thực tế.",
      },
      {
        name: "Hợp đồng và Class Shrine",
        value:
          "Ba tầng không bình → SSR; không skill → bonus +50% cược; không thủ → +5 damage. Vi phạm chỉ hủy thưởng. Class Shrine buff riêng tối đa 3 tầng; xem Rift & hiệu ứng để biết buff đang có.",
      },
      {
        name: "RNGesus",
        value:
          "Boss tầng 50/100/… và 999 được ưu tiên. Các tầng còn lại roll RNGesus trước pool encounter thường. Vượt bằng bỏ chạy, vé hoặc hối lộ; cầu nguyện thành công cũng tính là vượt. RNGesus không thể bị đánh bại và không cho rút thưởng.",
      },
      {
        name: "📊 Chu kỳ gặp RNGesus",
        value: RNGESUS_CYCLE_RULES,
      },
      {
        name: "🎲 Cách tính Chaos",
        value: rngesusChaosRules(true),
      },
      {
        name: "Luck",
        value:
          "SSR +Luck×0,2%; phát hiện Mimic = min(95%,25%+Luck×3%+item); Goblin = min(90%,min(80%,60%+Luck×1%)+item). Lucky Break = min(30%,Luck×1,5%), chỉ né Tax Collector/Potion Thief. Không tác động Wrong Portal.",
      },
      {
        name: "Wrong Portal",
        value:
          "50% tốt: Healing Sanctuary (+10 Max HP, đầy HP, +1 bình), Treasure Vault (bonus +50% cược), Rift Blessing (+4 Defense/+5 Resistance/+1 Luck). 50% xấu: mất 15% Max HP (giữ ≥1), Energy về 0, mất tối đa 2 bình, payout ×0,9 hoặc −5 Defense/Resistance; sau đó Elite đánh phủ đầu.",
      },
      {
        name: "Phòng thủ và boss",
        value:
          "Thủ: Defense ×2, miễn chí mạng, giảm thêm 40% damage sau giảm trừ, hồi 1 Energy. Butcher/Assur/Deimoss gây vật lý; Riftwalker/Lucion gây phép. Bình hồi clamp(35%+Potion Power,10%,75%) Max HP, ít nhất 20.",
      },
      {
        name: "Rift",
        value:
          "Mỗi 10 tầng thêm 1 stack, phát đủ 8 loại trước khi lặp. Stone Skin +10% Defense; Elemental +4% damage/+4 điểm % phép; Bloodlust +8% damage khi HP ≤50%; Fortified +10% HP; Swift +3 Accuracy/+1 Evasion; Soul Drain 1 Energy, từ stack 5 là 2; Cursed Ground −4 Resistance hiệu dụng/stack; Unstable tăng hòm và Mimic.",
      },
      {
        name: "Payout",
        value:
          "Hệ số = 1 + min(f,50)×0,06 + max(0,f−50)×0,10 + floor(f/5)×0,15; f dừng ở 100. Mốc 5/50/100: ×1,45/×5,50/×12,00. Payout = max(0,min(10.000.000,floor((cược×hệ số+bonus)×payoutFactor))−payoutSpent). Phí dịch vụ tăng payoutSpent; thuế/hối lộ/Goblin/curse nhân payoutFactor.",
      },
      {
        name: "Kim cương và khung hồ sơ",
        value:
          "Tổng kim cương tạm giữ: tầng 100/200/300/400/500/600/700/800/900 = 100/200/400/800/1.600/3.200/6.400/12.800/25.600; hạ boss tầng 999 = 51.200. Rút thưởng mới cộng vào tài khoản; chết, bỏ run hoặc hết hạn mất hết. Khung hồ sơ vĩnh viễn: vượt 333 Bạc, 666 Vàng, 999 Kim cương. /hoso hiển thị tầng cao nhất đã vượt.",
      },
      {
        name: "Giới hạn",
        value:
          "Tầng 100 hoàn thành; Overrun tới 999, phải hạ Final Boss. Vé tối đa 1, nhận thêm bỏ đi; bình tối đa 5. Run không hoạt động 7 ngày mất cược. /sinhton tieptuc giữ nguyên tiến trình và kết quả đã roll.",
      },
    );
  const selected = RATE_CATEGORIES.find((item) => item.id === category);
  if (selected)
    embed.setFields(
      embed.data.fields.filter((field) => selected.fields.includes(field.name)),
    );
  return embed;
}

function ratesPayload(userId, category = "encounters") {
  const selected =
    RATE_CATEGORIES.find((item) => item.id === category) || RATE_CATEGORIES[0];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`hardcore-rates:${userId}`)
    .setPlaceholder("Chọn nhóm tỷ lệ Sinh tồn…")
    .addOptions(
      RATE_CATEGORIES.map((item) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setValue(item.id)
          .setEmoji(item.emoji)
          .setDefault(item.id === selected.id),
      ),
    );
  return {
    embeds: [
      ratesEmbed(selected.id).setTitle(
        `🎰 SINH TỒN ${require("./shared/version").useV2() ? "v2.0.1" : "legacy"} · ${selected.name.toUpperCase()}`,
      ),
    ],
    components: [new ActionRowBuilder().addComponents(menu)],
    allowedMentions: { parse: [] },
  };
}

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
  async handleRatesSelect(interaction) {
    const [, ownerId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId)
      return interaction.reply({
        content: "Chỉ người mở bảng tỷ lệ mới có thể chọn nhóm.",
        flags: MessageFlags.Ephemeral,
      });
    return interaction.update(ratesPayload(ownerId, interaction.values[0]));
  },
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
