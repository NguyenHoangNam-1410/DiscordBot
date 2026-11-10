"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { runtime } = require("../payments/runtime");
const ui = require("../payments/discord");

function createCommand(getRuntime = runtime, renderQR = ui.renderQR) {
  return {
    data: new SlashCommandBuilder()
      .setName("bet")
      .setDescription(
        "Tạo QR chuyển khoản theo phe hoặc xem thống kê tiền đã nhận",
      )
      .setDMPermission(false)
      .addIntegerOption((o) =>
        o
          .setName("sotien")
          .setDescription("Số tiền VND, tối đa 20.000đ mỗi giao dịch")
          .setMinValue(1)
          .setMaxValue(20000),
      )
      .addStringOption((o) =>
        o
          .setName("phe")
          .setDescription(
            "Phe được áp dụng cho toàn bộ tiền của bạn sau khi chuyển thành công",
          )
          .addChoices(
            { name: "BLG", value: "BLG" },
            { name: "GENG", value: "GENG" },
          ),
      ),
    async execute(interaction) {
      const bank = getRuntime();
      const c = bank.config();
      const fail = (content) =>
        interaction.reply({
          content,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      if (
        !interaction.guildId ||
        !bank.ready() ||
        interaction.guildId !== c.guildId
      )
        return fail("Nhận chuyển khoản chưa được bật cho server này.");
      const amount = interaction.options.getInteger("sotien");
      const side = interaction.options.getString("phe");
      if (amount === null && side === null) {
        bank.store.expire();
        return interaction.reply({
          ...ui.summary(
            c,
            bank.store.totals(c.guildId, c.campaignId),
            bank.store.player(c.guildId, c.campaignId, interaction.user.id),
          ),
          flags: MessageFlags.Ephemeral,
        });
      }
      if (amount === null || side === null)
        return fail(
          "Nhập đủ số tiền và phe, ví dụ `/bet sotien:10000 phe:BLG`. Dùng `/bet` để xem thống kê.",
        );
      await interaction.deferReply();
      let order;
      try {
        order = bank.store.create(c, {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId: interaction.user.id,
          requestId: interaction.id,
          amount,
          side,
        });
      } catch (error) {
        if (error.code?.startsWith("SQLITE")) throw error;
        return interaction.editReply({
          content: error.message,
          allowedMentions: { parse: [] },
        });
      }
      // A public bot message can be updated after interaction credentials expire and after restart.
      let payload = ui.payload(order);
      if (order.status === "pending") {
        try {
          const image = await renderQR(order);
          bank.store.expire();
          order = bank.store.get(order.id);
          payload = ui.payload(order);
          if (order.status === "pending") payload.files = [image];
        } catch {
          const released = bank.store.expireUnpublished(order.id);
          return interaction.editReply({
            content: `Chưa tạo được ảnh QR. Hãy thử lại.${released ? " Yêu cầu chưa hiển thị này đã được giải phóng hạn mức." : ""}`,
            allowedMentions: { parse: [] },
          });
        }
      }
      const message = await interaction.editReply(payload);
      bank.bind(order, interaction, message);
    },
  };
}
module.exports = { ...createCommand(), createCommand };
