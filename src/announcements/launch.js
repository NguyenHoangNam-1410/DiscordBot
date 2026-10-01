const { EmbedBuilder } = require("discord.js");

function launchEmbeds() {
  const welcome = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🎉 GAME HUB CHÍNH THỨC MỞ CỬA 🎉")
    .setDescription(
      "Chơi game, làm nhiệm vụ, quay Gacha, sưu tầm vật phẩm và leo bảng xếp hạng ngay trong server!",
    )
    .addFields(
      {
        name: "🚀 Bắt đầu chỉ với 3 lệnh",
        value: [
          "**1️⃣ `/batdau`** — nhận gói chào mừng và xem hướng dẫn nhanh",
          "**2️⃣ `/nhiemvu tanthu`** — nhận quà tân thủ",
          "**3️⃣ `/choi`** — chọn game và bắt đầu. Người mới nên thử **Vua tiếng Việt** hoặc **Oẳn tù tì**.",
        ].join("\n"),
      },
      {
        name: "🎁 Quà tân thủ (mỗi người nhận một lần)",
        value: [
          "• :coin: **500 xu** và 🎨 **màu hồ sơ Xanh Băng** — `/batdau`",
          "• 🎟️ **1 Vé Gacha ×10** và :gem: **3.000 kim cương** — `/nhiemvu tanthu`",
        ].join("\n"),
      },
      {
        name: "🎟️ Vé Gacha ×10",
        value:
          "Bảo đảm ít nhất **một vật phẩm SSR** và tăng gấp đôi tỷ lệ ra **UR**. Vé được dùng tự động khi quay 10 lượt bằng `/vatpham quay`; vé không thể trao đổi.",
      },
    );

  const daily = new EmbedBuilder().setColor(0x3498db).addFields(
    {
      name: "📅 Mỗi ngày chỉ cần vài lệnh",
      value: [
        "• `/nhiemvu diemdanh` — điểm danh, giữ chuỗi 7 ngày để nhận thêm thưởng",
        "• `/nhiemvu kiemtra` — menu xem **mình còn thưởng gì chưa nhận** (nhiệm vụ ngày/tuần, thành tựu, thưởng vai trò) và nhận ngay trong menu",
        "• `/nhiemvu nhan` — nhận tất cả phần thưởng đã hoàn thành, hoặc chọn riêng nhiệm vụ, thành tựu, thưởng vai trò",
      ].join("\n"),
    },
    {
      name: "🎮 Trò chơi",
      value:
        "`/choi` có **10 game**: Bầu cua · Tài xỉu · Chinchiro · Oẳn tù tì · Xì dách · Poker · Đua ngựa · Dò mìn · Sinh tồn · Vua tiếng Việt\n\nMỗi ván bạn nhận **EXP** để lên cấp và có cơ hội rơi thêm **xu, kim cương hoặc lượt Gacha**. Lên cấp còn có quà.",
    },
    {
      name: "🎰 Gacha và vật phẩm",
      value: [
        "• `/vatpham quay` — quay bằng vé hoặc kim cương (**100** cho 1 lượt, **900** cho 10 lượt), có bảo hiểm ra vật phẩm hiếm. Xem lại bằng `/gacha lichsu`.",
        "• `/vatpham cuahang` — cửa hàng · `/vatpham tui` — túi đồ · `/vatpham sudung` — dùng vật phẩm · `/vatpham tang` — tặng vật phẩm",
        "• Độ hiếm nhìn theo màu: 🔵 **R** · 🟣 **SR** · 🟠 **SSR** · 🔴 **UR**",
        "• Mỗi game có vật phẩm hỗ trợ riêng: soi kết quả, bảo hiểm khi thua, hồi sinh, gợi ý đáp án…",
      ].join("\n"),
    },
  );

  const footer = new EmbedBuilder()
    .setColor(0x95a5a6)
    .addFields(
      {
        name: "📈 Theo dõi tiến độ",
        value:
          "• `/hoso` — thẻ hồ sơ, cấp độ, thống kê từng game\n• `/xephang` — bảng xếp hạng tài sản và thành tích\n• `/trogiup` — xem toàn bộ lệnh theo nhóm",
      },
      {
        name: "⚠️ Lưu ý",
        value: [
          "• Xu, kim cương, vật phẩm và hồ sơ là **riêng cho từng server**.",
          "• Gói chào mừng và quà tân thủ **chỉ nhận một lần** cho mỗi người.",
          "• Mỗi game có channel riêng do admin thiết lập, hãy chơi đúng channel.",
          "• Đặt cược vừa sức khi mới làm quen. Xem 10 ván gần nhất bằng `/xu vanchoi`.",
        ].join("\n"),
      },
    )
    .setFooter({
      text: "Chúc mọi người chơi vui và may mắn! 🍀 · Cần trợ giúp? Dùng /trogiup",
    });

  return [welcome, daily, footer];
}

module.exports = { launchEmbeds };
