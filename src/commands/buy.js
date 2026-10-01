const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { listShopItems, purchaseShopItem } = require("../services/shopService");
const { formatCoins } = require("../utils/economy");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Mua vật phẩm trong shop")
    .addStringOption((o) =>
      o
        .setName("item")
        .setDescription("Mã vật phẩm")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("quantity")
        .setDescription("Số lượng")
        .setMinValue(1)
        .setMaxValue(100),
    ),
  async autocomplete(interaction) {
    const q = String(interaction.options.getFocused() || "").toLowerCase();
    return interaction.respond(
      listShopItems(interaction.guildId)
        .filter((x) =>
          `${x.item_id} ${x.display_name}`.toLowerCase().includes(q),
        )
        .slice(0, 25)
        .map((x) => ({
          name: `${x.display_name} · ${formatCoins(x.final_price)} :coin:`.slice(
            0,
            100,
          ),
          value: x.item_id,
        })),
    );
  },
  async execute(interaction) {
    try {
      const result = purchaseShopItem({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        itemId: interaction.options.getString("item", true),
        quantity: interaction.options.getInteger("quantity") || 1,
      });
      return interaction.reply({
        content: `🛍️ Đã mua **${result.quantity}× ${result.catalog.name}** với **${formatCoins(result.paid)} :coin:**.`,
      });
    } catch (error) {
      const r = error.requirement;
      const content =
        error.code === "INSUFFICIENT_FUNDS"
          ? "Bạn không đủ xu để mua vật phẩm này."
          : error.message === "ALREADY_OWNED"
            ? "Bạn đã sở hữu vật phẩm không cộng dồn này."
            : error.message === "NON_STACKABLE_QUANTITY"
              ? "Vật phẩm này không cộng dồn, mỗi lần chỉ được mua một món."
              : error.message === "OUT_OF_STOCK"
                ? "Vật phẩm đã hết hàng."
                : error.message === "REQUIREMENT_NOT_MET"
                  ? r.code === "MIN_BALANCE"
                    ? `Chưa đủ điều kiện số dư tối thiểu ${formatCoins(r.required)} :coin:.`
                    : `Chưa đủ điều kiện: ${r.code} cần ${r.required}, hiện có ${r.current}.`
                  : "Vật phẩm không tồn tại hoặc không còn được bán.";
      return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  },
};
