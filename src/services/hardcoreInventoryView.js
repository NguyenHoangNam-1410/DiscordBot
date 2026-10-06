"use strict";
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const bag = require("./hardcoreInventoryService");
const { getAccount } = require("./economyService");
const { getPlayerProgression } = require("./playerLevelService");
const v2View = require("./hardcoreV2View");
const { E } = require("./hardcoreIcons");
const { appEmoji, appEmojiObject } = require("../utils/appEmoji");
const currencyIcon = (currency) =>
  currency === "diamonds" ? appEmoji("gem", "💎") : appEmoji("coin", "🪙");
function ticketIcon(item) {
  if (item.id === "survival_escape") return E.ticket;
  if (item.id === "survival_prayer") return "🙏";
  return "🎟️";
}
function ticketOptionEmoji(item) {
  return item.id === "survival_escape"
    ? appEmojiObject("ticket_rngesus") || { name: "🎫" }
    : { name: ticketIcon(item) };
}
const productName = (item) =>
  item.typeCode === "ticket" ? `${ticketIcon(item)} ${item.name}` : item.name;
const money = (n) => n.toLocaleString("vi-VN");
const PAGE_SIZE = 5,
  SELECT_PAGE_SIZE = 20;
const row = (...components) =>
  new ActionRowBuilder().addComponents(...components);
const button = (id, label, disabled = false, style = ButtonStyle.Secondary) =>
  new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
function detail(item) {
  if (item.typeCode === "ticket") return item.text;
  return `${v2View.effectText(item.effects)}${v2View.passiveText(item)}${item.curse ? `\n☣️ ${v2View.effectText(item.curse.effects)}` : ""}`;
}
function filterMenu(id, selected = "all", includeTickets = true) {
  return new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder("Lọc theo độ hiếm / vé")
    .addOptions(
      bag.FILTERS.filter((filter) => includeTickets || filter !== "ticket").map(
        (filter) => ({
          label:
            filter === "all" ? "Tất cả" : filter === "ticket" ? "Vé" : filter,
          value: filter,
          default: selected === filter,
        }),
      ),
    );
}
function shopPayload(guildId, userId) {
  const today = bag.shop(guildId);
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("🛒 SINH TỒN · CỬA HÀNG")
    .setDescription(
      `Ngày **${today.day}** · đổi 5 trang bị lúc **00:00 giờ Việt Nam**.\nMua không giới hạn lượt; hàng vào túi Sinh tồn để chọn trước run.\n${currencyIcon("coins")} **${money(getAccount(guildId, userId).balance)}** · ${currencyIcon("diamonds")} **${money(getPlayerProgression(guildId, userId).diamonds)}**\nGiá trang bị: R 10.000 · SR 50.000 · SSR 100.000 · UR 200.000 ${currencyIcon("coins")}`,
    );
  today.products.forEach((item) =>
    embed.addFields({
      name: `${productName(item)} [${item.typeCode === "ticket" ? "Vé" : item.typeCode}] · ${money(item.price)} ${currencyIcon(item.currency)}`,
      value: detail(item).slice(0, 1024) || "—",
    }),
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`hardcore-store:${userId}:${today.day}:buy`)
    .setPlaceholder("Chọn sản phẩm để nhập số lượng")
    .addOptions(
      today.products.map((item) => ({
        label: item.name,
        value: item.id,
        ...(item.typeCode === "ticket"
          ? { emoji: ticketOptionEmoji(item) }
          : {}),
        description: `${money(item.price)} ${item.currency === "diamonds" ? "kim cương" : "xu"} / ${item.typeCode === "ticket" ? "vé" : item.typeCode}`,
      })),
    );
  return {
    content: "",
    embeds: [embed],
    components: [
      row(menu),
      row(
        button(`hardcore-store:${userId}:${today.day}:refresh`, "Làm mới"),
        button(`hardcore-bag:${userId}:all:0:open`, "Túi đồ"),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}
function inventoryPayload(guildId, userId, filter = "all", page = 0) {
  const items = bag.inventory(guildId, userId, filter),
    pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  page = Math.max(0, Math.min(pages - 1, Number(page) || 0));
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🎒 SINH TỒN · TÚI ĐỒ")
    .setDescription(
      "Trang bị xếp **UR → SSR → SR → R**. Vé ở cuối danh sách.\nMỗi run chọn tối đa 5 món khác nhau, một bản mỗi món, và một vé mỗi loại. Đồ/vé mang vào run không hoàn khi chết hoặc rút thưởng.",
    )
    .setFooter({
      text: `Bộ lọc: ${filter} · Trang ${page + 1}/${pages} · ${items.length} loại`,
    });
  items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach((item) =>
    embed.addFields({
      name: `${productName(item)} [${item.typeCode === "ticket" ? "Vé" : item.typeCode}] ×${money(item.quantity)}`,
      value: detail(item).slice(0, 1024) || "—",
    }),
  );
  if (!items.length)
    embed.addFields({
      name: "Túi đồ",
      value: "Chưa có vật phẩm trong bộ lọc này. Mua tại `/sinhton cuahang`.",
    });
  const id = (next, action = "open") =>
    `hardcore-bag:${userId}:${filter}:${next}:${action}`;
  return {
    content: "",
    embeds: [embed],
    components: [
      row(filterMenu(id(page, "filter"), filter)),
      row(
        button(id(page - 1), "Trang trước", page === 0),
        button(id(page + 1), "Trang sau", page === pages - 1),
        button(`hardcore-store:${userId}:_:refresh`, "Cửa hàng"),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}
async function handleStore(interaction) {
  const [, ownerId, day, action, itemId] = interaction.customId.split(":");
  if (!interaction.guildId || ownerId !== interaction.user.id)
    return interaction.reply({
      content: "Đây là cửa hàng của người chơi khác.",
      flags: MessageFlags.Ephemeral,
    });
  if (action === "refresh")
    return interaction.update(shopPayload(interaction.guildId, ownerId));
  if (action === "buy") {
    const today = bag.shop(interaction.guildId);
    const item = today.products.find(
      (entry) => entry.id === interaction.values?.[0],
    );
    if (day !== today.day || !item)
      return interaction.update({
        ...shopPayload(interaction.guildId, ownerId),
        content: "Cửa hàng đã đổi ngày. Hãy chọn lại sản phẩm.",
      });
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`hardcore-store:${ownerId}:${day}:purchase:${item.id}`)
        .setTitle("Sinh tồn · Mua vật phẩm")
        .addComponents(
          row(
            new TextInputBuilder()
              .setCustomId("quantity")
              .setLabel("Số lượng (1–500 mỗi lần mua)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(3)
              .setValue("1"),
          ),
        ),
    );
  }
  if (action !== "purchase")
    return interaction.reply({
      content: "Thao tác không hợp lệ.",
      flags: MessageFlags.Ephemeral,
    });
  await interaction.deferUpdate();
  const raw = interaction.fields.getTextInputValue("quantity").trim();
  let notice;
  try {
    if (!/^\d+$/.test(raw)) throw new Error("INVALID_QUANTITY");
    const result = bag.purchase({
      guildId: interaction.guildId,
      userId: ownerId,
      itemId,
      quantity: Number(raw),
      day,
      operationId: interaction.id,
    });
    notice = `${result.duplicate ? "Giao dịch đã xử lý:" : "Đã mua"} **${productName(bag.product(itemId))} ×${result.quantity}**, giá **${money(result.cost)} ${currencyIcon(result.currency)}**.`;
  } catch (error) {
    const messages = {
      INVALID_QUANTITY:
        "Nhập số nguyên từ 1 đến 500; có thể mua tiếp không giới hạn lượt.",
      SHOP_EXPIRED: "Cửa hàng đã đổi ngày, hãy chọn lại sản phẩm.",
      NOT_FOR_SALE: "Sản phẩm không còn bán hôm nay.",
      INSUFFICIENT_DIAMONDS: "Bạn không đủ kim cương.",
      INSUFFICIENT_FUNDS: "Bạn không đủ xu.",
    };
    notice = messages[error.code || error.message];
    if (!notice) throw error;
  }
  return interaction.editReply({
    ...shopPayload(interaction.guildId, ownerId),
    content: notice,
  });
}
async function handleBag(interaction) {
  const [, ownerId, currentFilter, rawPage, action] =
    interaction.customId.split(":");
  if (!interaction.guildId || ownerId !== interaction.user.id)
    return interaction.reply({
      content: "Đây là túi đồ của người chơi khác.",
      flags: MessageFlags.Ephemeral,
    });
  const filter = action === "filter" ? interaction.values?.[0] : currentFilter;
  if (!bag.FILTERS.includes(filter))
    return interaction.reply({
      content: "Bộ lọc không hợp lệ.",
      flags: MessageFlags.Ephemeral,
    });
  return interaction.update(
    inventoryPayload(
      interaction.guildId,
      ownerId,
      filter,
      action === "filter" ? 0 : Number(rawPage),
    ),
  );
}
function loadoutPage(draft) {
  const items = bag
    .inventory(draft.guildId, draft.userId, draft.itemFilter || "all")
    .filter((item) => item.typeCode !== "ticket");
  const pages = Math.max(1, Math.ceil(items.length / SELECT_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, draft.itemPage || 0));
  return {
    items: items.slice(page * SELECT_PAGE_SIZE, (page + 1) * SELECT_PAGE_SIZE),
    page,
    pages,
  };
}
function setupPayload(draft, context) {
  const id = (action) =>
    `hardcore-setup:${draft.id}:${draft.version}:${action}`;
  const loadout = {
    itemIds: draft.itemIds || [],
    ticketIds: draft.ticketIds || [],
  };
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(
      draft.stage === "review"
        ? "⚔️ SINH TỒN · XÁC NHẬN RUN"
        : "🎒 SINH TỒN · CHỌN ĐỒ MANG THEO",
    )
    .setDescription(
      `Cược: **${money(draft.stake)} ${currencyIcon("coins")}** · Trang bị **${loadout.itemIds.length}/5**\nChọn một bản mỗi món, không trùng lặp; một vé mỗi loại.\nTiền cược, đồ và vé chỉ trừ khi bấm **Bắt đầu** ở màn xác nhận; không hoàn khi tử trận hoặc rút thưởng.`,
    )
    .addFields(
      {
        name: "Trang bị đã chọn",
        value:
          loadout.itemIds
            .map((itemId) => {
              const item = bag.product(itemId);
              return `**${item.name} [${item.typeCode}] Lv.1**`;
            })
            .join("\n") || "Không mang trang bị.",
      },
      {
        name: "Vé đã chọn",
        value:
          loadout.ticketIds
            .map((itemId) => {
              const ticket = bag.product(itemId);
              return `**${productName(ticket)}** · ${ticket.text}`;
            })
            .join("\n")
            .slice(0, 1024) || "Không mang vé.",
      },
    );
  for (const itemId of loadout.itemIds) {
    const item = bag.product(itemId);
    embed.addFields({
      name: `${item.name} [${item.typeCode}] Lv.1`,
      value: detail(item).slice(0, 1024) || "—",
    });
  }
  if (draft.stage === "review") {
    const preview = bag.preview(draft.classKey, draft.stake, loadout);
    embed.addFields({
      name: `${preview.className} · Chỉ số ban đầu sau trang bị`,
      value: v2View.statLine(preview),
    });
    return {
      content: "",
      embeds: [embed],
      components: [
        row(
          button(id("loadout_back"), "Đổi đồ"),
          button(
            id("start"),
            "Bắt đầu",
            draft.stake > Math.min(context.balance, context.maxBet),
            ButtonStyle.Success,
          ),
          button(id("cancel"), "Hủy"),
        ),
      ],
      allowedMentions: { parse: [] },
    };
  }
  const availableTickets = bag.inventory(draft.guildId, draft.userId, "ticket");
  const ticketMenu = new StringSelectMenuBuilder()
    .setCustomId(id("tickets"))
    .setPlaceholder("Chọn vé mang theo (mỗi loại 1)")
    .setMinValues(0)
    .setMaxValues(Math.max(1, availableTickets.length))
    .setDisabled(!availableTickets.length)
    .addOptions(
      availableTickets.length
        ? availableTickets.map((ticket) => ({
            label: `${ticket.name} ×${ticket.quantity}`,
            value: ticket.id,
            emoji: ticketOptionEmoji(ticket),
            default: loadout.ticketIds.includes(ticket.id),
          }))
        : [{ label: "Chưa có vé", value: "none" }],
    );
  const page = loadoutPage(draft);
  const itemMenu = new StringSelectMenuBuilder()
    .setCustomId(id("items"))
    .setPlaceholder(`Chọn trang bị · trang ${page.page + 1}/${page.pages}`)
    .setMinValues(0)
    .setMaxValues(Math.max(1, Math.min(5, page.items.length)))
    .setDisabled(!page.items.length)
    .addOptions(
      page.items.length
        ? page.items.map((item) => ({
            label: `${item.name} [${item.typeCode}] ×${item.quantity}`.slice(
              0,
              100,
            ),
            value: item.id,
            description: detail(item).replace(/[*\n]/g, " ").slice(0, 100),
            default: loadout.itemIds.includes(item.id),
          }))
        : [{ label: "Chưa có trang bị", value: "none" }],
    );
  embed.setFooter({
    text: `Trang ${page.page + 1}/${page.pages}. Đổi trang/bộ lọc vẫn giữ lựa chọn; bỏ chọn ở trang chứa món để gỡ.`,
  });
  return {
    content: "",
    embeds: [embed],
    components: [
      row(ticketMenu),
      row(filterMenu(id("item_filter"), draft.itemFilter || "all", false)),
      row(itemMenu),
      row(
        button(id("class_back"), "Nhân vật / cược"),
        button(id("items_prev"), "Trang trước", page.page === 0),
        button(id("items_next"), "Trang sau", page.page === page.pages - 1),
        button(id("review"), "Tiếp: xem chỉ số", false, ButtonStyle.Success),
        button(id("cancel"), "Hủy"),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}
module.exports = {
  shopPayload,
  inventoryPayload,
  handleStore,
  handleBag,
  setupPayload,
  loadoutPage,
  detail,
};
