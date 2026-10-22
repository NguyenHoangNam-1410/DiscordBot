"use strict";
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const path = require("node:path");
const banners = require("./banners"),
  service = require("./service"),
  progress = require("../characters/progression"),
  characters = require("../characters");
const { itemIcon, SKILL_ICONS } = require("../shared/icons");
const { appEmoji } = require("../../utils/appEmoji");
const number = (n) => Number(Number(n).toFixed(1)).toLocaleString("vi-VN");
const row = (...c) => new ActionRowBuilder().addComponents(...c);
const icon = (c) => appEmoji("class_" + characters.get(c.id)?.profileKey, "👤");
const ERRORS = {
  INSUFFICIENT_CHARACTER_SPARK: "Cần đủ 200 Spark để đổi nhân vật SSR.",
  INSUFFICIENT_CHARACTER_TICKETS: "Không đủ vé cho lựa chọn này.",
  INSUFFICIENT_DIAMONDS: "Không đủ gem.",
  STALE_CHARACTER_GACHA: "Bảng đã thay đổi. Đã cập nhật số dư; hãy chọn lại.",
  STALE_CHARACTER_POOL: "Banner đã cập nhật tỷ lệ. Hãy xem lại trước khi quay.",
  CHARACTER_BANNER_CLOSED: "Banner này đã đóng.",
  CHARACTER_GACHA_NOT_OPENED: "Mở /sinhton gacha để nhận vé tân thủ trước.",
};
function resultText(results) {
  const grouped = new Map();
  for (const r of results) {
    const key = r.kind + ":" + r.id + ":" + Boolean(r.duplicate);
    const old = grouped.get(key);
    if (old) old.count++;
    else grouped.set(key, { ...r, count: 1 });
  }
  return [...grouped.values()]
    .map((r) =>
      r.kind === "item"
        ? itemIcon(require("../inventory/service").product(r.id)) +
          " **" +
          r.name +
          " [R] ×" +
          r.count +
          "** → Túi Sinh tồn"
        : icon(r) +
          " **" +
          r.name +
          " [" +
          r.rarity +
          "] ×" +
          r.count +
          "** · " +
          (r.duplicate
            ? "+" + r.cards * r.count + " thẻ " + r.name
            : "Mở nhân vật S0"),
    )
    .join("\n");
}
function payload(
  userId,
  {
    guildId = null,
    bannerId = null,
    receipt = null,
    showHistory = false,
    showDetails = false,
    notice = "",
  } = {},
) {
  const b = banners.get(bannerId) || banners.list()[0];
  if (!b) throw Error("NO_CHARACTER_BANNER");
  const a = progress.account(userId),
    revision = a?.revision || 0;

  const custom = (action) =>
    ["hardcore-cg", userId, b.id, b.version, revision, action].join(":");
  const groups = b.groups.map(
    (g) =>
      "**" +
      g.rarity +
      " " +
      number((g.weight / b.totalWeight) * 100) +
      "%** · " +
      g.entries.length +
      " " +
      (g.kind === "item" ? "trang bị" : "nhân vật") +
      (g.rateUp ? "; xem tỷ lệ rate-up bên dưới." : ", chia đều trong nhóm."),
  );
  const payment =
    b.payment.kind === "ticket"
      ? "🎟️ **" +
        number(progress.wallet(userId, b.payment.currencyId)) +
        " vé**"
      : appEmoji("gem", "💎") +
        " **" +
        number(
          require("../../services/playerLevelService").getPlayerProgression(
            guildId,
            userId,
          ).diamonds,
        ) +
        " gem**";
  const ssr = b.groups.find((g) => g.rateUp);
  const featured = ssr ? characters.get(ssr.rateUp.characterId) : null;
  const paymentSymbol =
    b.payment.kind === "ticket" ? "🎟️" : appEmoji("gem", "💎");
  const resources =
    payment +
    (b.spark
      ? " · ✨ **" +
        number(progress.wallet(userId, b.spark.currencyId)) +
        " Spark**"
      : "");
  const skillLine = featured
    ? (SKILL_ICONS[featured.profileKey] || "✨") +
      " **" +
      require("../engine/stats").CLASSES[featured.profileKey].skill +
      "** · " +
      featured.role
    : b.description || "";
  const overview = [
    skillLine,
    resources,
    featured
      ? "🎴 **Thẻ " +
        featured.name +
        ": " +
        number(progress.cards(userId, featured.id)) +
        "**"
      : "",
    "**×1:** " +
      number(b.payment.unitCost) +
      " " +
      paymentSymbol +
      " · **×10:** " +
      number(b.payment.unitCost * 10) +
      " " +
      paymentSymbol,
  ]
    .filter(Boolean)
    .join("\n");
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(
      showDetails
        ? "CHI TIẾT BANNER · " + b.name
        : featured
          ? featured.name + " [" + featured.rarity + "]"
          : b.name,
    )
    .setDescription(showDetails ? b.description || b.name : overview);
  if (b.graphic && !showDetails)
    embed.setImage("attachment://" + b.id + "-banner.jpg");
  if (showDetails) {
    embed.addFields({ name: "Tỷ lệ", value: groups.join("\n") });
    if (ssr) {
      const chance = ssr.entries.length === 1 ? 1 : ssr.rateUp.chance;
      embed.addFields({
        name: "Rate-up SSR",
        value:
          "Roll độ hiếm trước: **SSR " +
          number((ssr.weight / b.totalWeight) * 100) +
          "%**. Sau khi ra SSR, **" +
          characters.get(ssr.rateUp.characterId).name +
          " " +
          number(chance * 100) +
          "%** trong nhóm SSR. " +
          (ssr.entries.length === 1
            ? "Hiện chưa có SSR khác nên mọi SSR đều là " +
              characters.get(ssr.rateUp.characterId).name +
              ". Khi có SSR khác trong pool: rate-up " +
              number(ssr.rateUp.chance * 100) +
              "%, còn lại chia đều cho SSR khác."
            : "SSR khác (" +
              ssr.entries
                .filter((c) => c.id !== ssr.rateUp.characterId)
                .map((c) => c.name)
                .join(", ") +
              ") chia đều phần tỷ lệ còn lại. Spark chỉ đổi " +
              characters.get(ssr.rateUp.characterId).name +
              ".") +
          " Không có pity hoặc bảo hiểm 50/50; mỗi lượt độc lập.",
      });
    }
    const sr = b.groups
      .filter((g) => g.kind === "character")
      .flatMap((g) => g.entries);
    if (sr.length)
      embed.addFields({
        name: "Nhân vật trong banner",
        value: sr
          .map((c) => icon(c) + " " + c.name + " [" + c.rarity + "]")
          .join(" · "),
      });
    for (const rarity of [...new Set(sr.map((c) => c.rarity))]) {
      const cards = sr
        .filter((c) => c.rarity === rarity)
        .map(
          (c) => c.name + ": **" + number(progress.cards(userId, c.id)) + "**",
        )
        .join(" · ");
      embed.addFields({
        name: "Thẻ " + rarity,
        value:
          cards +
          "\nNhận trùng " +
          rarity +
          ": +" +
          progress.DUPLICATE_CARDS[rarity] +
          " thẻ của chính nhân vật. **" +
          progress.SOUL_COST[rarity] +
          " thẻ của đúng nhân vật** nâng nhân vật đó thêm 1 tinh hồn, tối đa S6. Dùng trong bảng Nhân vật.",
      });
    }
    embed.addFields({
      name: "Quy tắc",
      value:
        "Item R vào Túi Sinh tồn của server đang quay. x10 là 10 lượt độc lập, không bảo đảm nhân vật." +
        (b.payment.currencyId === "novice_ticket"
          ? " Vé tân thủ cấp một lần cho tài khoản Discord, không nhận lại khi đổi server."
          : "") +
        (b.spark
          ? " Mỗi lượt +1 Spark; số dư **" +
            number(progress.wallet(userId, b.spark.currencyId)) +
            "** / **" +
            banners.SSR_SPARK_COST +
            (b.spark.characterId
              ? "** để đổi **" +
                characters.get(b.spark.characterId).name +
                "** tại /sinhton cuahang. Chỉ đổi nhân vật rate-up; trùng nhận 50 thẻ của chính nhân vật."
              : "** để đổi SSR khi cửa hàng tương ứng mở.")
          : " Banner này không cộng Spark."),
    });
  }
  if (receipt)
    embed.addFields({
      name:
        (receipt.kind === "spark"
          ? "Đổi " + receipt.sparkSpent + " Spark"
          : "Kết quả ×" + receipt.pulls) +
        (receipt.duplicate ? " · đã xử lý trước đó" : ""),
      value: resultText(receipt.results),
    });
  if (showHistory) {
    const h = service.history(userId);
    embed.addFields({
      name: "5 lượt quay gần nhất",
      value: h.length
        ? h
            .map(
              (h) =>
                "**×" +
                h.pulls +
                "** · " +
                new Date(h.created_at).toLocaleString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                }) +
                " · " +
                (banners.get(h.banner_id)?.name || h.banner_id) +
                " · " +
                [...new Set(h.results.map((r) => r.rarity))]
                  .map(
                    (rarity) =>
                      rarity +
                      " " +
                      h.results.filter((r) => r.rarity === rarity).length,
                  )
                  .join(" / "),
            )
            .join("\n")
        : "Chưa quay banner nào.",
    });
  }
  const button = (action, label, disabled = false) =>
    new ButtonBuilder()
      .setCustomId(custom(action))
      .setLabel(label)
      .setStyle(
        action.startsWith("pull") ? ButtonStyle.Primary : ButtonStyle.Secondary,
      )
      .setDisabled(disabled);
  return {
    content: notice,
    embeds: [embed],
    attachments: [],
    files:
      b.graphic && !showDetails
        ? [
            {
              attachment: path.resolve(
                __dirname,
                "../../../assets/banners",
                b.graphic,
              ),
              name: b.id + "-banner.jpg",
            },
          ]
        : [],
    components: [
      row(
        new StringSelectMenuBuilder()
          .setCustomId(custom("banner"))
          .setPlaceholder("Chọn banner")
          .addOptions(
            banners.list().map((x) => ({
              label: x.name,
              value: x.id,
              default: x.id === b.id,
            })),
          ),
      ),
      row(
        button(
          "pull1",
          "Quay ×1",
          b.payment.kind === "ticket" &&
            progress.wallet(userId, b.payment.currencyId) < b.payment.unitCost,
        ),
        button(
          "pull10",
          "Quay ×10",
          b.payment.kind === "ticket" &&
            progress.wallet(userId, b.payment.currencyId) <
              b.payment.unitCost * 10,
        ),
        button(
          showDetails ? "overview" : "details",
          showDetails ? "Về banner" : "Chi tiết banner",
        ),
        button("history", "Lịch sử"),
        button("characters", "Nhân vật"),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}
async function open(interaction) {
  await interaction.deferReply();
  const opened = service.open({ userId: interaction.user.id });
  return interaction.editReply(
    payload(interaction.user.id, {
      guildId: interaction.guildId,
      notice: opened.granted
        ? "🎟️ Đã nhận **30 vé tân thủ**. Chúc bạn may mắn!"
        : "",
    }),
  );
}
async function handle(interaction, logger = console) {
  const parts = interaction.customId.split(":"),
    [prefix, owner, bannerId, rawVersion, rawRevision, action] = parts;
  const reject = (content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const b = banners.get(bannerId);
  if (
    !interaction.guildId ||
    parts.length !== 6 ||
    prefix !== "hardcore-cg" ||
    owner !== interaction.user.id ||
    !b?.enabled ||
    !/^\d+$/.test(rawVersion) ||
    !/^\d+$/.test(rawRevision) ||
    !Number.isSafeInteger(Number(rawRevision))
  )
    return reject("Bảng gacha không hợp lệ hoặc thuộc người chơi khác.");
  if (
    ![
      "banner",
      "pull1",
      "pull10",
      "shop",
      "redeem",
      "details",
      "overview",
      "history",
      "characters",
    ].includes(action)
  )
    return reject("Thao tác gacha không hợp lệ.");
  if (
    action === "banner" &&
    (interaction.values?.length !== 1 ||
      !banners.list().some((b) => b.id === interaction.values[0]))
  )
    return reject("Banner không có trong danh sách.");
  if (action === "shop" || action === "redeem")
    return interaction.update({
      ...require("../inventory/view").shopPayload(interaction.guildId, owner),
      attachments: [],
    });
  if (action === "characters")
    return interaction.update({
      ...require("../ui/characters").payload(owner),
      attachments: [],
    });
  await interaction.deferUpdate();
  try {
    const receipt = action.startsWith("pull")
      ? service.pull({
          guildId: interaction.guildId,
          userId: owner,
          bannerId,
          poolVersion: Number(rawVersion),
          expectedRevision: Number(rawRevision),
          pulls: action === "pull1" ? 1 : 10,
          operationId: interaction.id,
        })
      : null;
    return interaction.editReply(
      payload(owner, {
        guildId: interaction.guildId,
        bannerId: action === "banner" ? interaction.values[0] : bannerId,
        receipt,
        showHistory: action === "history",
        showDetails: action === "details",
      }),
    );
  } catch (error) {
    if (!ERRORS[error.message])
      logger.error?.(
        { err: error, component: "hardcore-character-gacha" },
        "character gacha failed",
      );
    return interaction.editReply(
      payload(owner, {
        guildId: interaction.guildId,
        bannerId,
        notice:
          ERRORS[error.message] ||
          "Không thể xử lý lượt quay. Vé và phần thưởng được bảo vệ trong giao dịch; hãy mở lại bảng để kiểm tra.",
      }),
    );
  }
}
module.exports = { payload, open, handle, resultText };
