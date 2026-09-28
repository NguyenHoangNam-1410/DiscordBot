const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, MessageFlags,
} = require('discord.js');

const TABS = Object.freeze([
  { id: 'tongquan', label: 'Tổng quan', emoji: '🏠', description: 'Bắt đầu và tìm lệnh' },
  { id: 'trochoi', label: 'Trò chơi', emoji: '🎮', description: 'Các game và luật chơi' },
  { id: 'vatpham', label: 'Vật phẩm', emoji: '🎒', description: 'Cửa hàng, túi đồ và Gacha' },
  { id: 'nhiemvu', label: 'Nhiệm vụ', emoji: '📜', description: 'Điểm danh và phần thưởng' },
  { id: 'taikhoan', label: 'Tài khoản', emoji: '💰', description: 'Hồ sơ, xu và xếp hạng' },
  { id: 'quantri', label: 'Quản trị', emoji: '⚙️', description: 'Lệnh dành cho quản trị viên' },
]);

const PAGES = Object.freeze({
  tongquan: {
    title: '🏠 TRỢ GIÚP · TỔNG QUAN',
    description: 'Chọn một mục ở menu bên dưới để xem các lệnh. Discord sẽ gợi ý tùy chọn khi bạn gõ `/`.',
    fields: [
      ['👋 Bắt đầu', '`/batdau` — nhận gói chào mừng một lần và xem cách chơi nhanh.'],
      ['🎮 Chơi game', '`/choi` — chọn game; `/luat trochoi:<game>` — xem luật ngắn.'],
      ['🎒 Nhận và dùng vật phẩm', '`/nhiemvu diemdanh` — điểm danh; `/vatpham cuahang` — mở cửa hàng.'],
      ['📊 Theo dõi', '`/hoso` — xem hồ sơ; `/xephang` — chọn bảng xếp hạng bằng menu.'],
      ['📖 Hướng dẫn cũ', '`/huongdan` và `/trochoi` vẫn dùng được; `/trogiup` là bảng tra cứu theo từng mục.'],
    ],
  },
  trochoi: {
    title: '🎮 TRỢ GIÚP · TRÒ CHƠI',
    description: 'Mọi game đều nằm dưới `/choi`. Chọn game trong danh sách Discord hiện ra.',
    fields: [
      ['🎲 Game cược', '`/choi baucua` · `/choi taixiu` · `/choi chinchiro` · `/choi ott` · `/choi xidach` · `/choi poker`'],
      ['🏇 Thử thách khác', '`/choi duangua` · `/choi domin`'],
      ['⚔️ Sinh tồn', '`/choi sinhton batdau` — bắt đầu; `hoso` — thành tích; `xephang` — top tầng; `tyle` — tỷ lệ sự kiện.'],
      ['🔤 Vua tiếng Việt', '`/choi vtv` — bắt đầu; dùng nút trên bàn để bỏ qua câu hoặc kết thúc phiên (admin).'],
      ['📖 Xem luật', '`/luat trochoi:<game>` — xem tóm tắt luật của một game.'],
    ],
  },
  vatpham: {
    title: '🎒 TRỢ GIÚP · VẬT PHẨM',
    description: 'Cửa hàng và túi đồ được gom dưới `/vatpham`.',
    fields: [
      ['🛒 Mua sắm', '`/vatpham cuahang` — xem các tab cửa hàng; `/vatpham mua` — mua vật phẩm.'],
      ['🎒 Túi đồ', '`/vatpham tui` — xem vật phẩm; `/vatpham sudung` — chọn vật phẩm để dùng.'],
      ['🎁 Tặng và quay', '`/vatpham tang` — tặng vật phẩm; `/vatpham quay` — quay Gacha bằng kim cương.'],
    ],
  },
  nhiemvu: {
    title: '📜 TRỢ GIÚP · NHIỆM VỤ',
    description: 'Theo dõi và nhận thưởng hoạt động bằng `/nhiemvu`.',
    fields: [
      ['📅 Hằng ngày và hằng tuần', '`/nhiemvu diemdanh` — điểm danh; `/nhiemvu xem` — xem tiến độ; `/nhiemvu nhan` — nhận thưởng hoàn thành.'],
      ['🏅 Thành tựu', '`/nhiemvu thanhtuu` — xem; `/nhiemvu nhanthanhtuu` — nhận thưởng.'],
      ['🎁 Vai trò', '`/nhiemvu thuongvaitro` — tự nhận xu theo vai trò mỗi tuần nếu server đã thiết lập.'],
    ],
  },
  taikhoan: {
    title: '💰 TRỢ GIÚP · TÀI KHOẢN',
    description: 'Hồ sơ, số dư và các bảng xếp hạng là riêng cho từng server.',
    fields: [
      ['👤 Hồ sơ và xếp hạng', '`/hoso` — xem hồ sơ và thống kê từng game; `/xephang` — chọn tài sản hoặc game bằng menu.'],
      ['💰 Xu', '`/xu sodu` — xem số dư; `/xu lichsu` — giao dịch; `/xu vanchoi` — 10 ván gần nhất; `/xu chuyen` — chuyển xu.'],
      ['🪙 Hỗ trợ', '`/anxin` — xin xu khi đủ điều kiện; tối đa 5 lần mỗi ngày.'],
      ['🎁 Drop sau ván', 'Mỗi ván có thể rơi xu, gem và lượt quay Gacha theo cấu hình của server.'],
    ],
  },
  quantri: {
    title: '⚙️ TRỢ GIÚP · QUẢN TRỊ',
    description: 'Các mục dưới `/quantri` chỉ dành cho người có quyền quản trị phù hợp.',
    fields: [
      ['🎮 Kênh và phần thưởng', '`datkenh` · `xemkenh` · `datthuong` · `xemthuong`'],
      ['💰 Kinh tế và giới hạn cược', '`datgioihan` · `xemgioihan` · `kinhte` · `trangthai`'],
      ['🛠️ Cấu hình game', '`xemcauhinh` — xem và chỉnh bằng menu · `khoiphuc` — đặt lại về mặc định'],
      ['🎰 Gacha', '`themgacha` · `dattylegacha` · `xemgacha`'],
      ['🎁 Drop sau ván', '`xemcauhinh` — chỉnh tỷ lệ và khoảng min–max của xu, kim cương, lượt quay bằng menu.'],
      ['🎊 Buff sự kiện', '`datbuff` — nhân lượng drop hoặc tăng may mắn Gacha; `xembuff` — xem thời gian còn lại.'],
      ['🎁 Thưởng vai trò', '`datthuongvaitro` · `xoathuongvaitro` · `xemthuongvaitro`'],
      ['🧹 Dữ liệu người chơi', '`xoadulieu` — xóa xu, kim cương, EXP/cấp hoặc cả ba của người chơi được chọn.'],
      ['🛒 Cửa hàng', '`themvatpham` · `suavatpham` · `xoavatpham` · `xoaycuahang` · `tonkho` · `giamgia`'],
      ['⌨️ Lệnh prefix', '`!addgem` — cộng kim cương cho người chơi (nếu server bật lệnh prefix).'],
    ],
  },
});

function helpEmbed(tab = 'tongquan') {
  const page = PAGES[tab];
  if (!page) return null;
  return new EmbedBuilder().setColor(0x5865F2).setTitle(page.title).setDescription(page.description)
    .addFields(page.fields.map(([name, value]) => ({ name, value })))
    .setFooter({ text: 'Chọn mục khác bằng menu bên dưới' });
}

function helpRow(ownerId, selected = 'tongquan') {
  const menu = new StringSelectMenuBuilder().setCustomId(`trogiup:${ownerId}`).setPlaceholder('Chọn mục trợ giúp…')
    .addOptions(TABS.map(tab => new StringSelectMenuOptionBuilder()
      .setLabel(tab.label).setValue(tab.id).setEmoji(tab.emoji).setDescription(tab.description).setDefault(tab.id === selected)));
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  TABS, PAGES, helpEmbed, helpRow,
  data: new SlashCommandBuilder().setName('trogiup').setDescription('Xem các lệnh của bot theo từng mục'),
  async execute(interaction) {
    return interaction.reply({ embeds: [helpEmbed()], components: [helpRow(interaction.user.id)], flags: MessageFlags.Ephemeral });
  },
  async handleSelect(interaction) {
    const [, ownerId] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) return interaction.reply({ content: 'Chỉ người mở bảng trợ giúp này mới có thể đổi mục.', flags: MessageFlags.Ephemeral });
    const selected = interaction.values[0];
    const embed = helpEmbed(selected);
    if (!embed) return interaction.reply({ content: 'Mục trợ giúp không hợp lệ.', flags: MessageFlags.Ephemeral });
    return interaction.update({ embeds: [embed], components: [helpRow(ownerId, selected)] });
  },
};
