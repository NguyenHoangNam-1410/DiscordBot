const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require("discord.js");

const TABS = Object.freeze([
  {
    id: "tongquan",
    label: "Tổng quan",
    emoji: "🏠",
    description: "Bắt đầu và tìm lệnh",
  },
  {
    id: "trochoi",
    label: "Trò chơi",
    emoji: "🎮",
    description: "Các game và luật chơi",
  },
  {
    id: "vatpham",
    label: "Vật phẩm",
    emoji: "🎒",
    description: "Cửa hàng, túi đồ và Gacha",
  },
  {
    id: "nhiemvu",
    label: "Nhiệm vụ",
    emoji: "📜",
    description: "Điểm danh và phần thưởng",
  },
  {
    id: "taikhoan",
    label: "Tài khoản",
    emoji: "💰",
    description: "Hồ sơ, xu và xếp hạng",
  },
  {
    id: "quantri",
    label: "Quản trị",
    emoji: "⚙️",
    description: "Lệnh dành cho quản trị viên",
  },
]);

const PAGES = Object.freeze({
  tongquan: {
    title: "🏠 TRỢ GIÚP · TỔNG QUAN",
    description:
      "Chọn một mục ở menu bên dưới để xem các lệnh. Discord sẽ gợi ý tùy chọn khi bạn gõ `/`.",
    fields: [
      [
        "👋 Bắt đầu",
        "`/batdau` — nhận gói chào mừng một lần và xem cách chơi nhanh.",
      ],
      [
        "🎮 Chơi game",
        "`/huongdan` — xem danh sách game; `/webgame` — các game web và hướng dẫn từng bước; `/luat trochoi:<game>` — luật các game chơi trong Discord.",
      ],
      [
        "🎒 Nhận và dùng vật phẩm",
        "`/nhiemvu diemdanh` — điểm danh; `/vatpham cuahang` — mở cửa hàng.",
      ],
      [
        "📊 Theo dõi",
        "`/hoso` — xem hồ sơ; `/xephang` — chọn bảng xếp hạng bằng menu.",
      ],
      [
        "🤖 Chatbot AI",
        "Hỏi bằng `/chatbot hoi` (hoặc `!hoi <câu hỏi>`; admin dạy bot về server bằng `/chatbot nho`) ở bất kỳ kênh nào (admin có thể giới hạn một kênh bằng `/chatbot kenh`); xem số lượt còn lại bằng `/chatbot luot`.",
      ],
      [
        "📋 Cập nhật",
        "`/changelog` — xem cập nhật mới nhất, chuyển trang hoặc lọc theo loại thay đổi và trò chơi.",
      ],
      [
        "📖 Hướng dẫn cũ",
        "`/huongdan` và `/trochoi` vẫn dùng được; `/trogiup` là bảng tra cứu theo từng mục.",
      ],
    ],
  },
  trochoi: {
    title: "🎮 TRỢ GIÚP · TRÒ CHƠI",
    description:
      "Mỗi game có một lệnh riêng. Gõ tên game để chọn trong danh sách Discord.",
    fields: [
      [
        "🎲 Game cược",
        "`/baucua` · `/taixiu` · `/chinchiro` · `/xidach` · `/poker` — mở bàn hoặc chơi theo lựa chọn của từng game",
      ],
      ["🏇 Thử thách khác", "`/duangua` · `/domin`"],
      [
        "◉ Cò quay Nga",
        "`/coquay choi [mau] [vatpham] [thoigian]` — đấu hai người trên web, mặc định 5 HP và 4 đạo cụ. Mở hộp mỗi hiệp nạp đạn, có khán giả, xoay bàn 180°, âm thanh và hiệu ứng. `/coquay phong` xem phòng; `/webgame` xem luật. Không cược xu, không thành tựu.",
      ],
      [
        "◉ Ô ăn quan",
        "`/oanquan choi [nguoitruoc] [thoigian]` — hai người trên web, rải từng viên và đập ô ăn quân. 1 quan = 10 điểm, cho ăn quan non; tự rải lại và tính nợ dân. `/oanquan phong` xem phòng, `/webgame` xem luật. Có khán giả và UI PC/mobile; không cược xu.",
      ],
      [
        "🐾 Cờ thú",
        "`/cothu choi` — hai người, bàn 7×9, 8 thú/bên. Chọn `nguoitruoc`, `thoigian`; Đỏ đi trước, đồng hồ chạy khi đối thủ tham gia. `/cothu phong` xem phòng; `/webgame` đọc ngoại lệ Chuột/Voi, sông, bẫy và luật hòa. Có khán giả, lịch sử và UI PC/mobile; không cược hay thưởng tài nguyên.",
      ],
      [
        "◒ Santorini",
        "`/santorini choi` — hai người, bàn 5×5, 2 thợ/người, không Thần lực. Mỗi lượt đi rồi xây; đi từ tầng 2 lên tầng 3 thắng ngay. Chọn `nguoitruoc` và `thoigian`; `/santorini phong` xem phòng, `/webgame` xem luật. Có khán giả và giao diện mobile, không cần đặt kênh cũ.",
      ],
      [
        "⚓ Battleship / Bắn tàu",
        "`/battleship choi` — chọn `kichthuoc`: Nhỏ (8×8/5 thuyền), Vừa (10×10/7) hoặc Lớn (12×12/10). Hai bên bố trí và xác nhận hạm đội kín rồi luân phiên bắn. `/battleship phong` xem hoặc mở phòng; `/webgame` xem luật. Hỗ trợ điện thoại, khán giả và tiền tố `!`; không cược xu.",
      ],
      [
        "🧩 Mê cung",
        "`/mecung choi` — mỗi người dựng mê cung kín cho đối thủ; đi được thì tiếp tục, chạm tường thì lộ tường và đổi lượt. Chọn `luat` đến đích trước hoặc ít lượt hơn. `/mecung phong` xem phòng, `/webgame` xem luật. Có khán giả, không cược xu.",
      ],
      [
        "▦ Blokus Duo",
        "`/blokus choi` — xếp 21 quân trên bàn 14×14, chạm góc cùng màu, không chạm cạnh. Xoay/lật và xác nhận trên web. `/blokus phong` — chơi/xem trực tiếp; `/webgame` — luật và tính điểm. Đồng hồ riêng, không cược xu.",
      ],
      [
        "▥ Walls / Wall Go",
        "`/walls choi` — đối kháng trên bàn 9×9, đi tới hàng đối diện hoặc đặt tường chặn đối thủ. Tùy chọn `daituong:1|2`, `sotuong:0–20` (mặc định 10/người). `/walls phong` mở/xem phòng trực tiếp; `/webgame` xem luật nhảy Quoridor. Không cược xu.",
      ],
      [
        "⚔️ Sinh tồn",
        "`/sinhton batdau` — mở UI chọn nhân vật, xem chỉ số/kỹ năng, nhập cược → Tiếp → chọn đồ/vé → xem chỉ số → Bắt đầu. `cuahang` — mua vé và 5 món đổi lúc 00:00 Việt Nam; `tuido` — lọc vé/độ hiếm. Trong run dùng nút để đánh, dùng vật phẩm, xử lý sự kiện hoặc rút thưởng. `/luat trochoi: Sinh tồn` giải thích từng hành động; `hoso` — thành tích; `xephang` — top tầng; `tyle` — tỷ lệ sự kiện. `/choi sinhton thap` (hoặc `/sinhton thap`) mở/tiếp tục Tháp Định Mệnh 15 tầng độc lập, không cược; thưởng tuần nhận một lần.",
      ],
      [
        "🔤 Vua tiếng Việt",
        "`/vtv batdau` — admin mở UI Vua Tiếng Việt; người chơi dùng nút bỏ qua (mặc định 5 lượt/ngày, hồi chiêu 5 phút) hoặc nút vật phẩm để mở bảng dùng nhanh riêng tư. Admin kết thúc bằng `/vtv ketthuc`.",
      ],
      [
        "♟️ Cờ vua",
        "`/covua choi` — puzzle chiếu hết ngẫu nhiên 1–5 nước. Gửi toàn bộ nước UCI/SAN của bên cần giải trong một tin nhắn. `/covua xem` xem riêng bàn/kết quả; `/covua huongdan` xem cách nhập. Admin dùng `boqua` để thay bàn và `cauhinh` để đặt kênh, thưởng.",
      ],
      [
        "🀄 Cờ tướng",
        "`/cotuong choi [nguoitruoc] [thoigian]` — đấu Đỏ–Đen trên web, kéo thả hoặc chạm quân rồi ô đích để đi ngay, không cần xác nhận. `/cotuong phong` xem phòng; `/cotuong cauhinh` chỉnh giới hạn phòng; `/webgame` xem luật. Có khán giả, không cược hay thưởng giải thế.",
      ],
      [
        "📖 Xem luật",
        "`/luat trochoi:<game>` — luật các game chơi trong Discord; `/webgame` — luật game web.",
      ],
    ],
  },
  vatpham: {
    title: "🎒 TRỢ GIÚP · VẬT PHẨM",
    description: "Cửa hàng và túi đồ được gom dưới `/vatpham`.",
    fields: [
      [
        "🛒 Mua sắm",
        "`/vatpham cuahang` — xem các tab cửa hàng; `/vatpham mua` — mua vật phẩm.",
      ],
      [
        "🎒 Túi đồ",
        "`/vatpham tui` — xem vật phẩm; `/vatpham sudung` — chọn vật phẩm để dùng.",
      ],
      [
        "📚 Catalog vật phẩm",
        "`/vatpham chitiet` — lọc item theo game, xem mô tả và số lượng sở hữu; không hiện giá.",
      ],
      [
        "🎁 Tặng và quay",
        "`/vatpham tang` — tặng vật phẩm; `/vatpham quay` hoặc `/vatpham quay` — ưu tiên vé trước kim cương; `/gacha lichsu` — lịch sử quay.",
      ],
    ],
  },
  nhiemvu: {
    title: "📜 TRỢ GIÚP · NHIỆM VỤ",
    description: "Theo dõi và nhận thưởng hoạt động bằng `/nhiemvu`.",
    fields: [
      [
        "🔎 Kiểm tra nhanh",
        "`/nhiemvu kiemtra` — menu xem và nhận nhiệm vụ ngày/tuần, thành tựu, điểm danh, thưởng vai trò và thưởng tân thủ.",
      ],
      [
        "🎁 Nhận thưởng",
        "`/nhiemvu nhan` — nhận tất cả hoặc chọn loại (Nhiệm vụ, Thành tựu, Thưởng vai trò); `/nhiemvu diemdanh` — điểm danh; `/nhiemvu tanthu` — 1 vé Gacha ×10 + 3000 :gem: (một lần).",
      ],
      [
        "🎖️ Vai trò",
        "Thưởng vai trò tuần nhận bằng `/nhiemvu nhan` loại Thưởng vai trò nếu server đã thiết lập.",
      ],
    ],
  },
  taikhoan: {
    title: "💰 TRỢ GIÚP · TÀI KHOẢN",
    description: "Hồ sơ, số dư và các bảng xếp hạng là riêng cho từng server.",
    fields: [
      [
        "👤 Hồ sơ và xếp hạng",
        "`/hoso` — xem hồ sơ và thống kê từng game; `/xephang` — chọn tài sản hoặc game bằng menu.",
      ],
      [
        "💰 Xu",
        "`/hoso` — xem số dư; `/xu lichsu` — giao dịch; `/xu vanchoi` — 10 ván gần nhất; `/xu chuyen` — chuyển xu.",
      ],
      [
        "🪙 Hỗ trợ",
        "`/anxin` — xin xu khi đủ điều kiện; tối đa 5 lần mỗi ngày.",
      ],
      [
        "🎁 Drop sau ván",
        "Mỗi ván có thể rơi xu, gem và vé Gacha ×1 theo cấu hình của server.",
      ],
    ],
  },
  quantri: {
    title: "⚙️ TRỢ GIÚP · QUẢN TRỊ",
    description:
      "Các mục dưới `/quantri` chỉ dành cho người có quyền quản trị phù hợp.",
    fields: [
      [
        "🎮 Kênh và phần thưởng",
        "`datkenh` · `xemkenh` · `baotri` · `xemthuong`",
      ],
      [
        "💰 Kinh tế và giới hạn cược",
        "`datgioihan` · `xemgioihan` · `kinhte` · `trangthai`",
      ],
      [
        "🛠️ Cấu hình game",
        "`xemcauhinh` — xem và chỉnh bằng menu · `khoiphuc` — đặt lại về mặc định",
      ],
      ["🎰 Gacha", "`themgacha` · `batgacha` · `xemgacha`"],
      [
        "🎁 Drop sau ván",
        "`xemcauhinh` — chỉnh tỷ lệ và khoảng min–max của xu, kim cương, lượt quay bằng menu.",
      ],
      [
        "🎊 Buff sự kiện",
        "`datbuff` — bật/tắt nhân lượng drop hoặc tăng may mắn Gacha; chọn hành động `Xem buff đang chạy` để xem thời gian còn lại.",
      ],
      [
        "🎁 Thưởng vai trò",
        "`xemthuongvaitro` — mở bảng thưởng vai trò hàng tuần; dùng các nút để thêm/sửa hoặc xóa mức thưởng của từng vai trò.",
      ],
      [
        "🎯 Hệ số thắng cược 1-1",
        "`hesothang` — mở bảng hệ số thắng của Xì dách (bot), Chinchiro, Cò quay Nga và Tài xỉu (Tài/Xỉu/Chẵn/Lẻ); chọn game rồi nhập hệ số mới (x1,1–x3), kèm RTP ước tính.",
      ],
      [
        "🛑 Kết thúc ván",
        "`ketthucvan` — nhập mã ván để buộc kết thúc và hoàn cược mọi loại ván có mã: Xì dách, Poker, Dò mìn, Cò quay Nga, Chinchiro, Sinh tồn, Bầu cua, Tài xỉu, Đua ngựa.",
      ],
      [
        "🧹 Dữ liệu người chơi",
        "`xoadulieu` — chọn người chơi để xóa riêng; bỏ trống người chơi để xem trước và xác nhận xóa toàn server. Chọn `RESET SERVER` để xóa mọi dữ liệu người chơi nhưng giữ cấu hình hệ thống.",
      ],
      [
        "🛒 Cửa hàng",
        "`themvatpham` · `suavatpham` · `xoavatpham` · `xoaycuahang` · `tonkho` · `giamgia`",
      ],
      [
        "⌨️ Lệnh prefix",
        "Mọi lệnh slash có bản prefix khi server bật lệnh tin nhắn, ví dụ `!quantri baotri`, `!quantri datkenh sinhton #kenh`. Tham số có thể ghi `ten=giá_trị`; chuỗi nhiều từ đặt trong dấu ngoặc kép. Prefix trả lời trong kênh. `!addgem @user <số>` vẫn dùng để cộng kim cương.",
      ],
    ],
  },
});

function helpEmbed(tab = "tongquan") {
  const page = PAGES[tab];
  if (!page) return null;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(page.title)
    .setDescription(page.description)
    .addFields(page.fields.map(([name, value]) => ({ name, value })))
    .setFooter({ text: "Chọn mục khác bằng menu bên dưới" });
}

function helpRow(ownerId, selected = "tongquan") {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`trogiup:${ownerId}`)
    .setPlaceholder("Chọn mục trợ giúp…")
    .addOptions(
      TABS.map((tab) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(tab.label)
          .setValue(tab.id)
          .setEmoji(tab.emoji)
          .setDescription(tab.description)
          .setDefault(tab.id === selected),
      ),
    );
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  TABS,
  PAGES,
  helpEmbed,
  helpRow,
  data: new SlashCommandBuilder()
    .setName("trogiup")
    .setDescription("Xem các lệnh của bot theo từng mục"),
  async execute(interaction) {
    return interaction.reply({
      embeds: [helpEmbed()],
      components: [helpRow(interaction.user.id)],
      flags: MessageFlags.Ephemeral,
    });
  },
  async handleSelect(interaction) {
    const [, ownerId] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId)
      return interaction.reply({
        content: "Chỉ người mở bảng trợ giúp này mới có thể đổi mục.",
        flags: MessageFlags.Ephemeral,
      });
    const selected = interaction.values[0];
    const embed = helpEmbed(selected);
    if (!embed)
      return interaction.reply({
        content: "Mục trợ giúp không hợp lệ.",
        flags: MessageFlags.Ephemeral,
      });
    return interaction.update({
      embeds: [embed],
      components: [helpRow(ownerId, selected)],
    });
  },
};
