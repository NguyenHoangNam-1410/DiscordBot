const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const RULES = {
  baucua: ['Bầu cua', 'Chọn linh vật trước khi khóa cược. Xuất hiện 1/2/3 lần trả tổng cộng x2/x3/x4.'],
  taixiu: ['Tài xỉu', 'Tài 11–17, Xỉu 4–10; bộ ba làm Tài/Xỉu và Chẵn/Lẻ thua.'],
  chinchiro: ['Chinchiro', 'Nhà cái lắc trước. So điểm khi cả hai có tướng; Shigoro lãi x2, Bão x3, Pin-Zoro x5. Hifumi 1-2-3 bị phạt thêm x1 tiền cược.'],
  oantuti: ['Oẳn tù tì', 'Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa. Thắng nhận x2, hòa hoàn cược.'],
  blackjack: ['Xì dách', 'Một người mở bàn làm nhà cái; tối đa 3 người chơi có 30 giây để vào. Nhà cái chọn ante, không quá 25% số dư của mình. Người chơi lần lượt rút hoặc dừng; nhà cái rút đến ít nhất 17. Ngũ linh (đủ 5 lá, không quắc) mạnh hơn Xì dách; nếu cả hai cùng Ngũ linh thì tay có tổng điểm nhỏ hơn thắng. Người quắc thua kể cả khi nhà cái cũng quắc. Thắng nhận lại 2× ante, hòa nhận lại ante. Người tham gia bị khóa khỏi cược game khác đến khi ván kết thúc.'],
  poker: ['Poker', 'Chọn đấu với hai bot hoặc mời một người chơi. Theo, tố hoặc bỏ; xem bài tẩy bằng nút riêng tư. Main Pot và Side Pot được chia tự động.'],
  duangua: ['Đua ngựa', 'Chọn một trong sáu ngựa. Hệ số khóa khi mở bàn; debuff chỉ lộ sau khi khóa cược.'],
  mines: ['Mines', 'Mở ô an toàn để tăng hệ số rồi rút. Trúng mìn mất cược; ô sao tăng thêm x1,5.'],
  hardcore: ['Sinh tồn', 'Vượt tầng và quyết định lúc rút. Chết mất payout tạm giữ; tầng 100 là mốc hoàn thành.'],
  vuatiengviet: ['Vua tiếng Việt', 'Sắp xếp chữ thành từ đúng và trả lời trực tiếp trong kênh game.'],
};

function survivalRules() {
  const overview = new EmbedBuilder().setColor(0x9B59B6).setTitle('📖 SINH TỒN · CÁCH CHƠI')
    .setDescription('Đánh bại quái và vượt từng tầng để làm payout tạm thời tăng lên. Sau mỗi tình huống, đọc diễn biến rồi chọn một nút. **Rút thưởng** chốt payout hiện tại; nếu chết trước khi rút, payout tạm giữ mất hết.')
    .addFields(
      { name: '🚪 Bắt đầu', value: '`/choi sinhton batdau xu:<tiền cược> nhanvat:<Barbarian|Assassin|Sorceress>`\nCược từ **10–100.000 xu** (còn theo giới hạn cược của server). Tiền cược được giữ ngay khi bắt đầu. Mỗi người chỉ có một run đang diễn ra trong server; cần chơi ở kênh Sinh tồn đã cấu hình.', inline: false },
      { name: '🧙 Chọn nhân vật', value: '**Barbarian** — nhiều HP và phòng thủ; Iron Will gây 1,65× sát thương đánh thường.\n**Assassin** — né đòn và chí mạng tốt; Shadow Step gây 1,3× sát thương rồi né phản công.\n**Sorceress** — sát thương và kháng phép cao, nhưng ít HP và phòng thủ; Arcane Burst gây 2,1× sát thương phép.', inline: false },
      { name: '🔁 Vòng chơi và rút thưởng', value: 'Xử lý sự kiện tầng hiện tại để đi tiếp. Mỗi tầng đã vượt làm payout tăng; số xu trong ô **Payout nếu rút** là số nhận được nếu rút ngay. Sau khi vượt ít nhất một tầng, có thể rút ở hầu hết tình huống (RNGesus không có nút rút). Rút trước tầng đầu tiên là **Bỏ run** và làm mất tiền cược.', inline: false },
      { name: '📈 Mốc tiến trình', value: 'Boss xuất hiện mỗi 5 tầng. Sau boss và tầng 100, chọn 1 nâng cấp: **+3 sát thương**, **+20 HP tối đa và hồi tối đa 20 HP**, **+4 phòng thủ**, hoặc **+2 may mắn**. Mỗi tầng vượt hồi 1 năng lượng; hai boss đầu (tầng 5 và 10) còn hồi tối đa 30% HP và cho thêm 1 bình. Tầng 100 là mốc hoàn thành; có thể tiếp tục đến tầng 999. Payout tối đa 10.000.000 xu.', inline: false },
    );

  const combat = new EmbedBuilder().setColor(0xE67E22).setTitle('⚔️ SINH TỒN · CÁC NÚT HÀNH ĐỘNG')
    .setDescription('Các nút chỉ áp dụng cho tình huống đang hiển thị. Trong giao tranh, quái phản công sau hành động của bạn, trừ khi bạn hạ nó ngay hoặc né được đòn.')
    .addFields(
      { name: '👹 Khi gặp quái', value: '**Tấn công** — đánh thường; hồi 1 năng lượng, nhưng quái phản công nếu còn sống.\n**Phòng thủ** — hồi 1 năng lượng và giảm sát thương đòn kế tiếp; phép của quái cũng bị giảm.\n**Kỹ năng** — tốn 2 năng lượng, mạnh hơn đòn thường. Shadow Step của Assassin còn né đòn phản công.\n**Bình máu** — hồi 35% HP tối đa (ít nhất 20 HP, không vượt tối đa); quái vẫn phản công nếu còn sống.\n**Rút thưởng** — kết thúc run và nhận payout đang hiển thị.', inline: false },
      { name: '📦 Khi gặp hòm', value: '**Kiểm tra** — thử phát hiện Mimic, chỉ dùng được một lần; có thể không nhận ra.\n**Mở hòm** — nhận vật phẩm/buff, gặp hòm rỗng hoặc biến Mimic thành quái để đánh.\n**Bán hòm** — bỏ cơ hội mở; cộng thêm 15% tiền cược vào payout, phần thưởng cộng thêm của tầng còn một nửa.\n**Tránh Mimic** — chỉ sáng khi đã phát hiện Mimic; bỏ qua hòm và đi tiếp an toàn.', inline: false },
      { name: '🗿 Shrine và phòng sự kiện', value: '**Chạm Shrine** — hiệu ứng ngẫu nhiên: hồi đầy máu, +3 phòng thủ, −15 HP đổi +4 sát thương, +25% tiền cược vào payout, +7 sát thương đổi −4 phòng thủ, hoặc Shrine giả gây sát thương.\n**Bỏ qua** — không nhận hiệu ứng Shrine, đi tiếp.\n**Đi tiếp / Chấp nhận số phận** — xử lý phòng trống hoặc bẫy: Thu thuế giảm payout 15%; kẻ trộm lấy 1 bình máu; Cổng sai giữ nguyên tầng và tạo sự kiện mới.', inline: false },
      { name: '☠️ Khi gặp RNGesus', value: 'RNGesus không thể bị đánh bại; **Chiến đấu** làm run kết thúc. **Bỏ chạy** có 65% thành công, thất bại là chết. **Hối lộ** để đi tiếp nhưng giảm payout 40%. **Cầu nguyện** có 10% thành công: nhận vật phẩm Legendary và đi tiếp; thất bại là chết. **Vé** tiêu thụ một Vé Thoát Hiểm để sống sót và đi tiếp. Ở tình huống này không có nút rút thưởng.', inline: false },
      { name: '🧭 Tra cứu thêm', value: '`/choi sinhton tyle` xem xác suất sự kiện và hòm; `hoso` xem thành tích; `xephang` xem top tầng. Chỉ số và hiệu ứng của nút được ghi trong phần **Diễn biến** sau mỗi lựa chọn.', inline: false },
    );

  return [overview, combat];
}

module.exports = { RULES, data: new SlashCommandBuilder().setName('luat').setDescription('Xem luật ngắn của từng game').addStringOption(option => option.setName('trochoi').setDescription('Trò chơi').setRequired(true).addChoices(...Object.entries(RULES).map(([value, [name]]) => ({ name, value })))), async execute(interaction) {
  const key = interaction.options.getString('trochoi', true);
  if (key === 'hardcore') return interaction.reply({ embeds: survivalRules(), flags: MessageFlags.Ephemeral });
  const [name, text] = RULES[key];
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📖 ${name}`).setDescription(text).setFooter({ text: 'Dùng /huongdan để xem hệ thống lệnh' })], flags: MessageFlags.Ephemeral });
} };
