const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { getInventory, transferInventory } = require("../services/shopService");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("giftitem")
    .setDescription("Tặng vật phẩm cho người chơi khác")
    .addUserOption((o) =>
      o.setName("user").setDescription("Người nhận").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("item")
        .setDescription("Vật phẩm muốn tặng")
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
      getInventory(interaction.guildId, interaction.user.id)
        .filter(
          (x) =>
            x.item.tradeable &&
            `${x.item_id} ${x.item.name}`.toLowerCase().includes(q),
        )
        .slice(0, 25)
        .map((x) => ({
          name: `${x.item.name} ×${x.quantity}`.slice(0, 100),
          value: x.item_id,
        })),
    );
  },
  async execute(interaction) {
    const receiver = interaction.options.getUser("user", true);
    if (receiver.bot || receiver.id === interaction.user.id)
      return interaction.reply({
        content: "Người nhận không hợp lệ.",
        flags: MessageFlags.Ephemeral,
      });
    try {
      const result = transferInventory({
        guildId: interaction.guildId,
        fromUserId: interaction.user.id,
        toUserId: receiver.id,
        itemId: interaction.options.getString("item", true),
        quantity: interaction.options.getInteger("quantity") || 1,
      });
      return interaction.reply({
        content: `🎁 <@${interaction.user.id}> đã tặng <@${receiver.id}> **${result.quantity}× ${result.item.name}**.`,
        allowedMentions: { users: [receiver.id] },
      });
    } catch (error) {
      const content =
        error.message === "ITEM_NOT_OWNED"
          ? "Bạn không đủ số lượng vật phẩm."
          : error.message === "ITEM_NOT_TRADEABLE"
            ? "Vật phẩm này không thể tặng."
            : error.message === "ALREADY_OWNED"
              ? "Người nhận đã sở hữu vật phẩm không cộng dồn này."
              : "Không thể tặng vật phẩm.";
      return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  },
};
