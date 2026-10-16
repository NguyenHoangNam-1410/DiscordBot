"use strict";
const { AttachmentBuilder, MessageFlags } = require("discord.js");
const store = require("./store"),
  { html } = require("./view");
const errors = {
  INVALID_REPLAY_CODE:
    "Mã ván phải gồm đúng 12 ký tự hex, như mã ở cuối bảng Sinh tồn.",
  REPLAY_RUN_ACTIVE:
    "Ván này vẫn đang chơi. Chỉ xuất replay sau khi ván đã kết thúc.",
  REPLAY_NOT_FOUND: "Không tìm thấy ván này trong server hiện tại.",
  REPLAY_TOO_LARGE:
    "File replay vượt giới hạn gửi file của Discord. Chưa thể xuất toàn bộ ván này.",
};
async function open(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const data = store.get(
      interaction.guildId,
      interaction.options.getString("ma_van", true),
    );
    const buffer = html(data);
    if (
      buffer.length >
      Math.min(
        interaction.attachmentSizeLimit || 8 * 1024 * 1024,
        8 * 1024 * 1024,
      )
    )
      throw Error("REPLAY_TOO_LARGE");
    return interaction.editReply({
      content:
        "**Replay Sinh tồn · " +
        data.id +
        "**\nTải file HTML và mở bằng trình duyệt để xem offline. Chọn Lượt/Tầng, nhập số rồi Enter hoặc dùng Trước/Sau." +
        (data.summaryOnly
          ? "\nVán cũ chỉ còn tổng kết, không có lịch sử từng lượt."
          : data.partial
            ? "\nLịch sử chỉ có từ thời điểm bot bắt đầu ghi replay."
            : ""),
      files: [
        new AttachmentBuilder(buffer, {
          name: "sinhton-replay-" + data.id + ".html",
        }),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (!errors[error.message]) throw error;
    return interaction.editReply({
      content: errors[error.message],
      allowedMentions: { parse: [] },
    });
  }
}
module.exports = { open };
