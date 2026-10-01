const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const RULES = {
  baucua: [
    "Bầu cua",
    "Chọn linh vật trước khi khóa cược. Xuất hiện 1/2/3 lần trả tổng cộng x2/x3/x4. Vật phẩm không có tác dụng trong ván nhiều người. Cược dưới 1.000 xu không nhận EXP, nhiệm vụ hay thưởng phụ; thưởng phụ chỉ rơi xu.",
  ],
  taixiu: [
    "Tài xỉu",
    "Tài 11–17, Xỉu 4–10; bộ ba làm Tài/Xỉu và Chẵn/Lẻ thua. Mỗi người chỉ chọn một cửa trong một ván, có thể cộng thêm cược cùng cửa. Vật phẩm không có tác dụng trong ván nhiều người. Cược dưới 1.000 xu không nhận EXP, nhiệm vụ hay thưởng phụ; thưởng phụ chỉ rơi xu.",
  ],
  chinchiro: [
    "Chinchiro",
    "Nhà cái lắc trước. Khi thắng bằng điểm thường, lãi 80% cược; Shigoro lãi x1, Bão x2, Pin-Zoro x3. Hifumi 1-2-3 mất cược và bị phạt thêm x1. Bot giữ trước một khoản ký quỹ bằng tiền cược để bảo đảm phạt Hifumi, rồi hoàn lại khi không bị phạt. Mỗi ván mới cách nhau 30 giây, kể cả bấm Chơi lại.",
  ],
  oantuti: [
    "Oẳn tù tì",
    "Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa. Thắng nhận x2, hòa hoàn cược.",
  ],
  blackjack: [
    "Xì dách",
    "Chọn `chedochoi`: **nhà cái bot** (chơi một mình, có gấp đôi và tách bài; thắng thường nhận 2× cược) hoặc **người chơi khác**. **Mọi chế độ:** chỉ được **Dừng khi có ít nhất 16 điểm** (nút Dừng bị khóa nếu dưới 16); khi quắc mọi nút bị khóa; **cả hai cùng quắc thì hòa** và hoàn cược; Gấp đôi chốt tay sau 1 lá nên không bị ràng buộc 16 điểm. Ở chế độ người chơi: Một người mở bàn làm nhà cái; tối đa 3 người chơi có 30 giây để vào. Nhà cái chọn ante, không quá 25% số dư của mình. Người chơi lần lượt rút hoặc dừng; bài của mỗi người được giữ kín, dùng nút **Xem bài của tôi** để xem và thao tác trong bảng riêng, bài chỉ lộ khi kết thúc; nhà cái rút đến khi có ít nhất 15 điểm. Ngũ linh (đủ 5 lá, không quắc) mạnh hơn Xì dách; nếu cả hai cùng Ngũ linh thì tay có tổng điểm nhỏ hơn thắng. Người quắc thua, nhưng nếu nhà cái cũng quắc thì **hòa** và hoàn ante. Thắng nhận lại 2× ante, hòa nhận lại ante. Người tham gia bị khóa khỏi cược game khác đến khi ván kết thúc.",
  ],
  poker: [
    "Poker",
    "Chọn đấu với hai bot hoặc mời một người chơi. Theo, tố hoặc bỏ; xem bài tẩy bằng nút riêng tư. Main Pot và Side Pot được chia tự động.",
  ],
  duangua: [
    "Đua ngựa",
    "Chọn một trong sáu ngựa. Hệ số khóa khi mở bàn; debuff chỉ lộ sau khi khóa cược.",
  ],
  mines: [
    "Mines",
    "Chọn 2–7 mìn trên bàn 20 ô, mở ô an toàn để tăng hệ số rồi rút. Trúng mìn mất cược; ô sao tăng thêm x1,5. Giáp Chống Nổ chỉ vô hiệu hóa một quả mìn duy nhất trên mỗi bản đồ.",
  ],
  coquay: [
    "Cò quay Nga",
    "Đấu súng với Bot, mỗi bên **3 ❤️**. Cược một lần từ đầu (`/choi coquay cuoc:<xu>`); thắng nhận **x2** tiền cược, gục hoặc bỏ cuộc mất cược. Bạn cầm súng trước.\n\n**🔫 Lượt bắn**\n• **Tự bắn** đạn lép: an toàn và **giữ lượt** (loại bớt đạn lép, tăng cơ hội bắn trúng Bot ở phát sau).\n• **Tự bắn** đạn thật: mất 1 ❤️, súng sang tay Bot.\n• **Bắn Bot**: thật hay lép, bắn xong súng luôn sang tay đối phương.\n\n**🔄 Nạp đạn** — số đạn thật 🔴/lép ⚪ của mỗi đợt được công khai, thứ tự bị xáo trộn; mỗi đợt luôn có ít nhất 1 thật và 1 lép. Hết đạn thì nạp đợt mới, người đang cầm súng giữ lượt.\n• Đợt 1 (Khởi động): 2–3 viên\n• Đợt 2 (Căng thẳng): 4–5 viên\n• Đợt 3 trở đi (Khô máu): 6–8 viên\n\n**🤖 Bot** chỉ biết số đạn còn lại như bạn, không nhìn trộm nòng, tính nước tối ưu và chiến đến giọt máu cuối.\n\n**🧰 Vật phẩm** (từ Gacha, bấm nút trong ván, mỗi loại tối đa 1 lần/ván, chỉ dùng trong lượt của bạn)\n• 🔍 **Kính Lúp Soi Nòng** (SR): lén xem viên đang lên nòng là thật hay lép.\n• 🪖 **Bia Đỡ Đạn** (SR): đỡ 1 sát thương khi Bot bắn đạn thật vào bạn.\n• 🪚 **Cưa Cầm Tay** (SSR): viên kế tiếp nếu là đạn thật gây 2 sát thương (kể cả khi tự bắn).\n• ⛓️ **Còng Số 8** (UR): lần tới súng chuyển sang Bot, Bot mất lượt và súng quay lại tay bạn.\n\nBỏ ván quá 10 phút không thao tác sẽ bị xử thua.",
  ],
  hardcore: [
    "Sinh tồn",
    "Vượt tầng và quyết định lúc rút. Chết mất payout tạm giữ; tầng 100 là mốc hoàn thành.",
  ],
  vuatiengviet: [
    "Vua tiếng Việt",
    "Sắp xếp chữ thành từ đúng và trả lời trực tiếp trong kênh game.",
  ],
};

function survivalRules() {
  const overview = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📖 SINH TỒN · CÁCH CHƠI")
    .setDescription(
      "Đánh bại quái và vượt từng tầng để làm payout tạm thời tăng lên. Sau mỗi tình huống, đọc diễn biến rồi chọn một nút. **Rút thưởng** chốt payout hiện tại; nếu chết trước khi rút, payout tạm giữ mất hết.",
    )
    .addFields(
      {
        name: "🚪 Bắt đầu",
        value:
          "`/choi sinhton batdau`\nChọn nhân vật trên UI để xem chỉ số và kỹ năng, bấm **Nhập xu**, rồi **Bắt đầu**. Cược **10–100.000 xu**, theo giới hạn server và số dư; chỉ trừ xu khi xác nhận. Bảng chuẩn bị hết hạn sau 5 phút không thao tác. Mỗi người một run/server. `/choi sinhton tieptuc` đăng UI mới, khóa UI cũ. Run không hoạt động 7 ngày sẽ mất cược.",
        inline: false,
      },
      {
        name: "🧙 Bảy nhân vật",
        value:
          "**Amazon** — Barrage: 2 phát ×85%.\n**Assassin** — Shadow Step: 130% vật lý, né phản công.\n**Barbarian** — Iron Will: 165% vật lý.\n**Druid** — Wild Regeneration: 135% vật lý, hồi 12% HP tối đa.\n**Necromancer** — Totem Ward: 155% phép, chặn phản công.\n**Paladin** — Divine Shield: 140% vật lý, thủ trước phản công.\n**Sorceress** — Arcane Burst: 210% phép. Mỗi kỹ năng tốn 2 Energy.",
        inline: false,
      },
      {
        name: "🔁 Vòng chơi và rút thưởng",
        value:
          "Xử lý sự kiện tầng hiện tại để đi tiếp. Mỗi tầng đã vượt làm payout tăng; số xu trong ô **Payout nếu rút** là số nhận được nếu rút ngay. Sau khi vượt ít nhất một tầng, có thể rút ở hầu hết tình huống (RNGesus không có nút rút). Rút trước tầng đầu tiên là **Bỏ run** và làm mất tiền cược.",
        inline: false,
      },
      {
        name: "📈 Checkpoint và hoàn thành",
        value:
          "Mỗi **5 tầng** hồi đầy HP, nhận 2 bình (tối đa 5) và chọn +5 sát thương / +30 HP / +6 Defense / +2 Luck. Tự tăng HP/sát thương: dưới 100 **+6/+1**, 100–399 **+10/+2**, 400–699 **+14/+3**, 700–999 **+30/+6**. Mỗi tầng vượt hồi 1 Energy. Tầng 100 hoàn thành chính thức; tiếp tục Overrun đến 999. **Phải hạ Deimoss để công nhận tầng 999**. Hệ số tầng dừng sau 100, bonus vẫn cộng; payout tối đa 10.000.000 xu.",
        inline: false,
      },
      {
        name: "🗺️ Tám khu vực",
        value:
          "1–99 Sanctuary · 100–199 Duncraig · 200–299 Fauztinville · 300–399 Teganze · 400–499 Scosglen · 500–699 Dimensional Labyrinth · 700–899 Heroic Rift · 900–999 Dimensional Plane. Quái tăng tuyến tính theo từng giai đoạn.",
        inline: false,
      },
    );

  const combat = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("⚔️ SINH TỒN · CÁC NÚT HÀNH ĐỘNG")
    .setDescription(
      "Các nút chỉ áp dụng cho tình huống đang hiển thị. Trong giao tranh, quái phản công sau hành động của bạn, trừ khi bạn hạ nó ngay hoặc né được đòn.",
    )
    .addFields(
      {
        name: "👹 Khi gặp quái",
        value:
          "**Tấn công** — đánh thường; hồi 1 năng lượng, nhưng quái phản công nếu còn sống.\n**Phòng thủ** — hồi 1 năng lượng, Defense ×2 và giảm thêm 50% sát thương vật lý/phép sau giảm trừ (tối thiểu 1).\n**Kỹ năng** — tốn 2 năng lượng, mạnh hơn đòn thường. Shadow Step của Assassin còn né đòn phản công.\n**Bình máu** — hồi 35% HP tối đa (ít nhất 20 HP, không vượt tối đa); quái vẫn phản công nếu còn sống.\n**Rút thưởng** — kết thúc run và nhận payout đang hiển thị.",
        inline: false,
      },
      {
        name: "📦 Khi gặp hòm",
        value:
          "**Kiểm tra** — thử phát hiện Mimic một lần.\n**Mở hòm** — trang bị Median XL: R = TU, SR = RW, SSR = SU/Set, UR = SU Nguyền (payout −15%); chỉ tồn tại trong run. Stat quy đổi sang chỉ số Sinh tồn; trùng item tăng Lv. và cộng lại hiệu ứng. 5 hòm mở không có SR+ thì hòm sau bảo đảm SR+. Sau 10 hòm không SSR+, mỗi hòm thêm 2% cơ hội SSR.\n**Bán hòm** — cộng 15% tiền cược vào payout.\n**Tránh Mimic** — đi tiếp an toàn nếu đã phát hiện.",
        inline: false,
      },
      {
        name: "🌀 Rift Modifier",
        value:
          "Mỗi 10 tầng nhận một cộng dồn; đủ 8 loại trước khi lặp. **Stone Skin**: quái +10% Defense; **Elemental Dominion**: +4% damage và phép; **Bloodlust**: dưới nửa HP +8% damage; **Unstable Rift**: thêm hòm tốt/Mimic; **Fortified**: +10% HP; **Swift Horror**: Accuracy/Evasion; **Soul Drain**: đòn trúng rút Energy; **Cursed Ground**: phép trúng giảm All Resistance.",
        inline: false,
      },
      {
        name: "👑 Boss mỗi 50 tầng",
        value:
          "**The Butcher (vật lý)**: mỗi lần ra đòn +8% damage, tối đa 5 lần. **Ascendant Riftwalker (phép)**: miễn nhiễm đòn đầu mỗi 3 lần bạn tấn công. **Assur (vật lý)**: né/chí mạng cao. **Lucion (phép)**: hồi 35% sát thương gây ra. **Deimoss (phép)**: Abyssal Spires giảm 25% sát thương nhận. Loại sát thương boss cố định, kể cả khi có Rift. Chu kỳ lặp theo thứ tự; Deimoss tầng 999 là boss cuối mạnh hơn.",
        inline: false,
      },
      {
        name: "🗿 Shrine và phòng sự kiện",
        value:
          "**Chạm Shrine** — hiệu ứng ngẫu nhiên: hồi đầy máu, +3 phòng thủ, −15 HP đổi +4 sát thương, +25% tiền cược vào payout, +7 sát thương đổi −4 phòng thủ, hoặc Shrine giả gây sát thương.\n**Bỏ qua** — không nhận hiệu ứng Shrine, đi tiếp.\n**Đi tiếp / Chấp nhận số phận** — xử lý phòng trống hoặc bẫy: Thu thuế giảm payout 15%; kẻ trộm lấy 1 bình máu; Cổng sai giữ nguyên tầng và tạo sự kiện mới.",
        inline: false,
      },
      {
        name: "❓ Bất ngờ và dịch vụ",
        value:
          "**Khám phá**: 25% cứu trợ (hồi 35% HP, 1 bình), 25% nhận Vé Thoát Hiểm, 25% kho xu (+50% cược vào bonus), 25% Champion phục kích ra đòn trước. Có thể bỏ qua.\n**Thợ rèn**: tăng 1 cấp trang bị, ưu tiên SSR → SR → R rồi cấp thấp nhất; đồ UR / cấp vật tư không thể rèn.\n**Giải nguyền**: gỡ 1 cộng dồn phạt payout đồ UR, giữ chỉ số. Mỗi lần gặp dùng dịch vụ một lần. Phí hiện trên nút, chỉ dùng payout đang có trong run; không đủ thì bỏ qua.",
        inline: false,
      },
      {
        name: "☠️ Khi gặp RNGesus",
        value:
          "RNGesus không thể bị đánh bại; **Chiến đấu** làm run kết thúc. **Bỏ chạy** có 75% thành công, giữ vé; thất bại tự dùng 1 Vé Thoát Hiểm nếu còn, hết vé thì chết. **Hối lộ** giảm hệ số payout 40%. **Cầu nguyện**: 10% nhận SSR và đi tiếp; thất bại là chết. Không có nút rút thưởng.",
        inline: false,
      },
      {
        name: "🧭 Tra cứu thêm",
        value:
          "`/choi sinhton tyle` xem xác suất sự kiện và hòm; `hoso` xem thành tích; `xephang` xem top tầng. Chỉ số và hiệu ứng của nút được ghi trong phần **Diễn biến** sau mỗi lựa chọn.",
        inline: false,
      },
    );

  return [overview, combat];
}

module.exports = {
  RULES,
  data: new SlashCommandBuilder()
    .setName("luat")
    .setDescription("Xem luật ngắn của từng game")
    .addStringOption((option) =>
      option
        .setName("trochoi")
        .setDescription("Trò chơi")
        .setRequired(true)
        .addChoices(
          ...Object.entries(RULES).map(([value, [name]]) => ({ name, value })),
        ),
    ),
  async execute(interaction) {
    const key = interaction.options.getString("trochoi", true);
    if (key === "hardcore")
      return interaction.reply({
        embeds: survivalRules(),
        flags: MessageFlags.Ephemeral,
      });
    const [name, text] = RULES[key];
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📖 ${name}`)
          .setDescription(text)
          .setFooter({ text: "Dùng /huongdan để xem hệ thống lệnh" }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
