"use strict";

const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const vnd = (value) => `${value.toLocaleString("vi-VN")}đ`;
const vietTime = (value) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value) + " (giờ Việt Nam)";
const STATUS = {
  pending: "Đang chờ chuyển khoản",
  paid: "Đã nhận tiền",
  expired: "Hết thời gian chờ",
  review: "Đã nhận giao dịch · Cần đối soát",
};
function qrInput(order) {
  return {
    acqId: order.bank_bin,
    accountNo: order.account_number,
    accountName: order.account_name,
    amount: order.amount,
    addInfo: order.memo,
    media: "png",
  };
}
function qrText(order) {
  return require("vietqr").genQRText(qrInput(order));
}
async function renderQR(order) {
  // Optional QR support must not prevent unrelated games or the web server from starting.
  const { generateQR } = require("vietqr");
  // Official VietQR 1.2+ generates both the payload and PNG locally, without an API key or network.
  const result = await generateQR(qrInput(order));
  if (
    result.code !== "00" ||
    !result.data?.qrDataURL?.startsWith("data:image/png;base64,")
  )
    throw new Error("Could not generate bank QR image");
  return new AttachmentBuilder(
    Buffer.from(
      result.data.qrDataURL.slice("data:image/png;base64,".length),
      "base64",
    ),
    { name: "bank-qr.png" },
  );
}
function payoutField(estimate, projected = false) {
  if (!estimate)
    return {
      name: "Tiền dự tính nếu thắng",
      value:
        "Chưa có tiền cược được xác nhận. Dự tính sẽ hiển thị sau khi bot nhận được giao dịch hợp lệ.",
    };
  const share = ((estimate.stake / estimate.winningPool) * 100).toLocaleString(
    "vi-VN",
    { maximumFractionDigits: 2 },
  );
  return {
    name: projected
      ? `Dự tính sau khi chuyển · ${estimate.side} thắng`
      : `Dự tính nếu ${estimate.side} thắng`,
    value:
      `**Nhận ${vnd(estimate.payout)}** = gốc ${vnd(estimate.stake)} + lãi ${vnd(estimate.profit)}.\n` +
      (estimate.mode === "refund"
        ? "Hiện một phe chưa có cược: nếu giữ tình trạng này đến chốt sổ, mọi người được hoàn đủ gốc, bất kể đội thắng."
        : `Bạn đóng góp **${share}%** tiền phe ${estimate.side}. Tổng quỹ hiện tại: **${vnd(estimate.totalPool)}**.`) +
      (projected
        ? "\nGiả sử khoản chuyển này được xác nhận mới nhất; QR đang chờ khác chưa được tính."
        : "") +
      "\nƯớc tính thay đổi theo giao dịch hợp lệ; dùng `/bet` để cập nhật.",
  };
}
function payload(order, estimate = null) {
  const embed = new EmbedBuilder()
    .setTitle(
      `${order.status === "paid" ? "✅" : "🏦"} ${STATUS[order.status]}`,
    )
    .setColor(
      order.status === "paid"
        ? 0x2ecc71
        : order.status === "review"
          ? 0xe67e22
          : 0x5865f2,
    )
    .setDescription(
      `<@${order.user_id}> · **${order.side}** · **${vnd(order.amount)}**`,
    )
    .addFields({ name: "Nội dung chuyển khoản", value: `\`${order.memo}\`` })
    .setFooter({ text: `${order.campaign_title} · ${order.id}` });
  if (order.status === "pending") {
    embed
      .addFields(
        {
          name: "Tài khoản nhận · OCB",
          value: `**${order.account_number}**\n${order.account_name}`,
        },
        {
          name: "Quy tắc ghi nhận",
          value: `Mỗi người tối đa **${vnd(order.max_user_amount)}**, **${order.max_transactions} giao dịch**; mỗi giao dịch tối đa **20.000đ**.\nNếu đây là giao dịch hợp lệ mới nhất, toàn bộ tiền đã nhận của bạn thuộc phe **${order.side}**. Chốt sổ **${vietTime(order.closes_at)}**.`,
        },
        {
          name: "Thời gian chờ",
          value: `Đến <t:${Math.floor(order.expires_at / 1000)}:F> (<t:${Math.floor(order.expires_at / 1000)}:R>).\nChuyển đúng số tiền và giữ nguyên nội dung. Bot tự xác nhận khi nhận được giao dịch.`,
        },
      )
      .setImage("attachment://bank-qr.png");
  } else if (order.status === "paid") {
    embed.addFields({
      name: "Đã xác nhận",
      value: `Ngân hàng ghi nhận lúc <t:${Math.floor(order.paid_at / 1000)}:F>.\nDùng \`/bet\` để xem tổng tiền và phe hiện tại của bạn.`,
    });
  } else if (order.status === "review") {
    embed.addFields({
      name: "Cần kiểm tra",
      value:
        "Giao dịch chưa được cộng vào thống kê. Có thể sai số tiền, nội dung, quá hạn hoặc vượt giới hạn. Liên hệ người phụ trách để đối soát; không chuyển thêm vào QR này.",
    });
  } else {
    embed.addFields({
      name: "Đã hết hạn",
      value:
        "Không chuyển tiền vào QR này. Giao dịch được ngân hàng ghi nhận trước hạn vẫn có thể được xác nhận khi thông báo đến trễ.",
    });
  }
  if (estimate) embed.addFields(payoutField(estimate, estimate.projected));
  return {
    content: "",
    embeds: [embed],
    components: [],
    attachments: [],
    allowedMentions: { parse: [] },
  };
}
function summary(config, totals, player, now = Date.now()) {
  const embed = new EmbedBuilder()
    .setTitle(`🏦 ${config.title}`)
    .setColor(now >= config.closesAt ? 0x95a5a6 : 0x5865f2)
    .setDescription(
      `${now >= config.closesAt ? "**Đã chốt sổ**" : "**Đang nhận chuyển khoản**"} · **${vietTime(config.closesAt)}**\nMỗi người tối đa **${vnd(config.maxUserAmount)}**, **${config.maxTransactions} giao dịch**; mỗi giao dịch tối đa **${vnd(config.maxTransactionAmount)}**.`,
    );
  for (const side of config.sides) {
    const row = totals.find((r) => r.side === side);
    embed.addFields({
      name: side,
      value: `**${vnd(row?.amount || 0)}** · ${row?.players || 0} người`,
      inline: true,
    });
  }
  embed.addFields(
    {
      name: "Quy tắc tính phe",
      value:
        "Toàn bộ tiền đã xác nhận của bạn thuộc phe trong giao dịch hợp lệ cuối cùng, theo thời gian ngân hàng. QR chưa thanh toán không đổi phe. Thông báo ngân hàng đến trễ có thể cập nhật thống kê.",
    },
    {
      name: "Của bạn",
      value: `Đã nhận **${vnd(player.amount)}** · **${player.count}/${config.maxTransactions} giao dịch** · Phe **${player.side || "Chưa chọn"}**`,
    },
    payoutField(player.payout),
    {
      name: "Quy tắc chia tiền",
      value:
        "Khi hai phe đều có cược, người bên thắng nhận lại gốc và chia toàn bộ tiền bên thua theo tỷ lệ đóng góp. Nếu một phe không có cược, hoàn đủ gốc cho mọi người, bất kể đội thắng. Làm tròn đến từng đồng, chia hết tổng quỹ.",
    },
  );
  if (player.rows.length)
    embed.addFields({
      name: "Yêu cầu gần đây",
      value: player.rows
        .slice(0, 5)
        .map(
          (o) =>
            `\`${o.id}\` · ${o.side} · ${vnd(o.amount)} · ${STATUS[o.status]}`,
        )
        .join("\n"),
    });
  embed.setFooter({
    text: "Chỉ tính tiền đã xác nhận · /bet sotien:10000 phe:BLG",
  });
  return { embeds: [embed], allowedMentions: { parse: [] } };
}
module.exports = { payload, summary, qrText, renderQR };
