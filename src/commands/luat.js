const {
  paginateRuleEmbed,
  splitRuleFields,
} = require("../hardcore/ui/rulePages");
const {
  RNGESUS_CYCLE_RULES,
  rngesusChaosRules,
} = require("../services/hardcoreRngesus");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const RULES = {
  baucua: [
    "Bầu cua",
    "**Cách chơi**\n- Đặt cược vào linh vật trước khi bàn khóa cược. Bot tung 3 mặt; đếm số lần linh vật bạn chọn xuất hiện.\n\n**Kết quả**\n- Không xuất hiện: mất khoản cược cửa đó.\n- Xuất hiện 1 / 2 / 3 lần: tổng tiền nhận lần lượt bằng **2 / 3 / 4 lần cược**, đã gồm tiền cược ban đầu.\n\n**Vật phẩm và thưởng phụ**\n- Vật phẩm không tác động ván nhiều người.\n- Cược dưới 1.000 xu không nhận EXP, tiến độ nhiệm vụ hoặc thưởng phụ; thưởng phụ của game này chỉ là xu.",
  ],
  taixiu: [
    "Tài xỉu",
    "**Cách chơi**\n- Bot tung 3 xúc xắc. Mỗi người chọn **một cửa mỗi ván**; được cộng cược vào cùng cửa trước khi khóa.\n\n**Các cửa**\n- **Tài:** tổng 11–17. **Xỉu:** tổng 4–10.\n- **Chẵn / Lẻ:** xét tổng điểm. Nếu cả 3 viên giống nhau, **Tài, Xỉu, Chẵn và Lẻ đều thua**.\n- **Bộ ba bất kỳ:** thắng khi cả 3 viên giống nhau; tổng nhận **35 lần cược**.\n- **Tổng cụ thể:** chọn tổng 4–17, phải trúng đúng tổng; bộ ba vẫn được tính cho cửa này. Hệ số tổng nhận: 4/17 → ×70; 5/16 → ×35; 6/15 → ×21; 7/14 → ×14; 8/13 → ×10; 9/10/11/12 → ×8.\n\n**Trả thưởng**\n- Tài/Xỉu/Chẵn/Lẻ thắng mặc định nhận **2 lần cược**; admin có thể đổi hệ số, khóa theo lúc mở bàn. Thua mất cược. Các hệ số đều đã gồm vốn.\n- Vật phẩm không tác động ván nhiều người. Cược dưới 1.000 xu không nhận EXP, tiến độ nhiệm vụ hoặc thưởng phụ; thưởng phụ chỉ là xu.",
  ],
  chinchiro: [
    "Chinchiro",
    "**Bắt đầu**\n- Bot giữ **2 lần cược**: một phần để chơi, một phần ký quỹ cho phạt Hifumi. Ký quỹ được hoàn nếu không bị phạt.\n- Nhà cái lắc trước; mỗi lượt tối đa 3 lần để ra bộ hợp lệ. Hai viên giống nhau thì viên còn lại là điểm.\n\n**Nhà cái quyết định ngay**\n- Hifumi 1-2-3, vô tướng hoặc điểm 1: bạn thắng thường.\n- Shigoro 4-5-6, ba viên giống nhau hoặc điểm 6: bạn thua. Các điểm 2–5 mới cho bạn lắc để so.\n\n**Khi bạn lắc**\n- Điểm cao hơn thắng, bằng hòa, thấp hơn thua. Vô tướng hoặc rớt xúc xắc thua.\n- Shigoro: lãi **1 lần cược**; Bão 2-2-2 đến 6-6-6: lãi **2 lần**; Pin-Zoro 1-1-1: lãi **3 lần**.\n- Hifumi: mất cược **và** mất thêm khoản ký quỹ bằng cược.\n\n**Thắng thường / hòa**\n- Thắng thường: tổng nhận mặc định **1,8 lần cược** (lãi 80%); admin có thể đổi hệ số trước ván. Hòa: hoàn cược. Các mức trên là luật cơ bản; vật phẩm có thể thay đổi kết quả theo công dụng của nó.",
  ],
  blackjack: [
    "Xì dách",
    "**Điểm bài**\n- Lá 2–10 tính theo số; J/Q/K = 10; A = 11 hoặc 1 để tránh quắc. Tổng trên 21 là **quắc**. Chỉ được **Dừng từ 16 điểm**; nhà cái rút đến ít nhất 15.\n- **Ngũ linh** (5 lá, không quắc) mạnh hơn **Xì dách** (2 lá, tổng 21), rồi đến điểm thường. Cùng Ngũ linh: tổng nhỏ hơn thắng. Cùng điểm thường hoặc cùng Xì dách: hòa. Cả hai quắc: hòa.\n\n**Chơi với bot**\n- Rút hoặc Dừng để so với nhà cái. Hai lá đầu cùng hạng được **Tách** một lần: trả thêm khoản bằng cược để chơi hai tay riêng. Tách A chỉ nhận thêm một lá mỗi tay.\n- Thắng thường: tổng nhận mặc định **2 lần cược**; Xì dách tự nhiên thắng nhận **2,5 lần**. Admin có thể chỉnh hệ số thường; Xì dách tự nhiên cộng thêm 0,5. Hòa hoàn cược; thua mất cược.\n\n**Bàn người chơi**\n- Người mở làm nhà cái, chọn ante không quá 25% số dư; tối đa 3 người vào trong 30 giây. Mỗi người đấu riêng với nhà cái.\n- Bài giữ kín đến kết thúc; dùng **Xem bài của tôi** để rút/dừng. Thắng nhận **2 lần ante**, hòa hoàn ante, thua mất ante. Người tham gia phải kết thúc bàn trước khi cược game khác.",
  ],
  poker: [
    "Poker",
    "**Bắt đầu và hành động**\n- Chọn biến thể, đấu hai bot hoặc mời một người. Mỗi bên đóng **ante** (cược bắt buộc ban đầu).\n- **Theo:** trả phần còn thiếu để bằng mức cược hiện tại. **Tố:** nâng mức cược và trả thêm xu. **Bỏ:** mất quyền tranh pot, tiền đã cược không được hoàn theo luật cơ bản.\n- Xem bài tẩy bằng nút riêng tư. Còn một người chưa bỏ thì người đó thắng; nếu còn nhiều người ở cuối ván, so bộ bài.\n\n**Biến thể**\n- **Texas:** 2 lá tẩy, chọn 5 lá tốt nhất từ bài tẩy và bài chung.\n- **6+:** bài 6–A; Thùng mạnh hơn Cù lũ; A-6-7-8-9 được tính sảnh.\n- **Crazy Pineapple:** 3 lá tẩy, bỏ 1 lá sau vòng cược Flop.\n- **Omaha 5 lá:** bắt buộc dùng đúng 2 lá tẩy và 3 lá chung.\n\n**Xếp hạng thông thường, mạnh → yếu**\nThùng phá sảnh → Tứ quý → Cù lũ → Thùng → Sảnh → Bộ ba → Hai đôi → Một đôi → Mậu thầu. Cùng loại so các lá quyết định; bằng nhau chia pot.\n\n**Tiền thưởng**\n- Nhận phần pot thắng được, không có hệ số ×2 cố định. Khi all-in, Main Pot/Side Pot chia riêng; bạn chỉ tranh pot tương ứng khoản mình góp.",
  ],
  duangua: [
    "Đua ngựa",
    "**Cách chơi**\n- Chọn ngựa trong danh sách 6 ngựa của bàn và cược trước khi khóa. Hệ số trả thưởng của từng ngựa được khóa khi mở bàn.\n- Sau khi khóa cược mới công bố sự cố/debuff. Sự cố có thể đổi khả năng thắng của ngựa; không đổi hệ số đã khóa.\n\n**Kết quả**\n- Ngựa về nhất: tổng nhận = **cược vào ngựa đó × hệ số của nó**, đã gồm vốn. Các khoản cược vào ngựa khác bị mất.\n- Không có ngựa chắc thắng; hệ số cao không đồng nghĩa cơ hội thắng cao.",
  ],
  mines: [
    "Mines",
    "**Bắt đầu**\n- Bàn có **20 ô**, chọn **2–7 mìn** và đặt cược. Vị trí mìn và ô sao được giữ cố định trong ván.\n\n**Mở ô / rút thưởng**\n- Mở ô an toàn để tăng hệ số. Sau ít nhất một ô đã mở, bấm **Rút thưởng** để nhận số xu đang hiển thị.\n- Trúng mìn: mất cược và kết thúc. Mở hết ô còn an toàn: tự chốt thưởng. Bỏ ván: mất cược.\n- Ô sao nằm ở ô an toàn, nhân thêm **1,5** vào hệ số; hệ số trên bảng đã tính bonus này.\n\n**Giáp Chống Nổ**\n- Nếu có hiệu ứng đang hoạt động, vô hiệu hóa **một quả mìn trong ván** rồi hết tác dụng. Các quả mìn khác vẫn gây thua.",
  ],
  coquay: [
    "Cò quay Nga",
    "**Mục tiêu và cược**\n- Bạn đấu Bot, mỗi bên **3 HP**; bạn cầm súng trước. Cược một lần khi bắt đầu. Hạ Bot: tổng nhận **2 lần cược**. Hết HP, bỏ cuộc hoặc không thao tác 10 phút: mất cược.\n\n**Lượt bắn**\n- **Tự bắn + đạn lép:** không mất HP, giữ lượt.\n- **Tự bắn + đạn thật:** mất 1 HP, chuyển súng sang Bot.\n- **Bắn Bot:** đạn thật gây 1 sát thương; đạn lép không gây sát thương. Sau phát bắn, luôn chuyển súng sang Bot.\n\n**Nạp đạn**\n- Công khai số đạn thật/lép, giấu thứ tự; luôn có ít nhất một viên mỗi loại. Đợt 1 có 2–3 viên, đợt 2 có 4–5, đợt 3 trở đi có 6–8. Hết đạn thì nạp mới; người đang cầm súng giữ lượt. Bot chỉ biết số đạn như bạn.\n\n**Vật phẩm Gacha: mỗi loại tối đa 1 lần/ván, dùng trong lượt bạn**\n- **Kính Lúp (SR):** xem riêng viên kế tiếp.\n- **Bia Đỡ Đạn (SR):** đỡ 1 sát thương khi Bot bắn vào bạn.\n- **Cưa (SSR):** nếu viên kế tiếp là thật, gây 2 sát thương, kể cả tự bắn.\n- **Còng (UR):** lần tiếp theo súng sang Bot, Bot mất lượt và trả súng cho bạn.",
  ],
  hardcore: [
    "Sinh tồn",
    "Chọn class, vượt tầng và rút thưởng trước khi chết. Xem các trang tiếp theo để đọc luật đầy đủ.",
  ],
  vuatiengviet: [
    "Vua tiếng Việt",
    "**Cách chơi**\n- Admin mở bằng `/vtv batdau`. Sắp xếp chữ thành từ/cụm từ và gửi đáp án trực tiếp trong kênh game.\n- Đáp án phải đúng dấu tiếng Việt; không phân biệt chữ hoa/thường. Người trả lời đúng trước nhận thưởng, rồi chuyển câu mới.\n\n**Câu thường**\n- Không giới hạn thời gian; thưởng xu theo cấu hình server. Có thể bấm Bỏ qua: giới hạn lượt/ngày theo server (tối đa 5), mỗi người hồi chiêu 5 phút.\n\n**Câu khó**\n- Phải trả lời trong thời gian trên bảng; không được bỏ qua. Trả lời đúng nhận **10 lần thưởng xu cơ bản và 10 kim cương**.",
  ],
};

function survivalRules() {
  if (require("../services/hardcoreVersion").useV2()) {
    const view = require("../services/hardcoreV2View");
    const { E } = require("../services/hardcoreIcons");
    const sections = {
      combat: "CHIẾN ĐẤU",
      loot: "TRANG BỊ & PHẦN THƯỞNG",
      encounters: "SHRINE & SỰ KIỆN",
      rngesus: "RNGESUS",
      rewards: "DỊCH VỤ & RÚT THƯỞNG",
    };
    const pages = [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("📖 SINH TỒN v2.0.1 · CÁCH CHƠI")
        .setDescription(
          "Chọn nhân vật, đặt cược rồi xử lý từng tầng. Mục tiêu là sống sót và quyết định lúc **Rút thưởng**. Xu và kim cương trên bảng là **thưởng tạm giữ**; chỉ được cộng vào tài khoản khi rút. Chết, bỏ run hoặc hết hạn mất cược và toàn bộ thưởng tạm giữ.",
        )
        .addFields(
          {
            name: "Bắt đầu và tiếp tục",
            value:
              "- `/sinhton batdau` → chọn một trong 7 class → nhập **10–100.000 xu**, trong giới hạn server → **Tiếp** → chọn tối đa 5 món khác nhau và mỗi loại vé một chiếc → xem chỉ số → **Bắt đầu**. Cược và đồ/vé được trừ cùng lúc khi xác nhận; không hoàn khi chết hoặc rút. Mua tại `/sinhton cuahang`, xem túi qua `/sinhton tuido`; bảng chuẩn bị hết hạn sau 5 phút.\n- Mỗi người một run/server. `/sinhton tieptuc` mở lại bảng của run đã lưu; không đổi kết quả ngẫu nhiên đã khóa.\n- Không thao tác **7 ngày**: run hết hạn và mất cược/thưởng.\n- Vượt tầng 100 là mốc hoàn thành; vẫn có thể chơi tiếp đến 999. Phải hạ boss tầng 999 để công nhận mốc cuối.",
          },
          {
            name: "Tháp Định Mệnh · mode riêng",
            value:
              "`/choi sinhton thap` hoặc `/sinhton thap` mở/tiếp tục tháp puzzle 15 tầng. Tầng N có đúng N bước; mọi hành động đều tiêu hao bước. Lỗi thường được giữ kín tới cuối tầng, nhưng bỏ qua Phòng thủ trước đòn chí tử sẽ kết thúc attempt ngay. Nếu hết bước mà chưa hạ quái, người chơi nhận một gợi ý trừu tượng rồi thử lại từ đầu tầng chưa vượt. HP/MP/bình giữ xuyên tầng; tiến độ tầng đã vượt được lưu. Damage, hồi máu và tín hiệu đều cố định, không Miss/Crit/RNG. Class, chỉ số và bộ đồ mẫu được chụp từ dữ liệu Sinh Tồn hiện tại nhưng mode, túi đồ và phần thưởng hoàn toàn độc lập. Snapshot đã kiểm chứng được khóa cả tuần; thay đổi Sinh Tồn chỉ áp dụng từ rotation kế tiếp. Tháp mới mở lúc 00:00 thứ Hai (UTC+7), xoay đủ 7 class trước khi lặp. Hoàn thành lần đầu nhận 500.000 xu + 250 kim cương; nút chơi lại không trao thưởng lần nữa.",
          },
          {
            name: "Bốn thuộc tính",
            value: `${E.str} **STR:** tăng vật lý và DEF.\n${E.dex} **DEX:** tăng ACC/EVA/CRIT; hướng sát thương chính của Amazon/Assassin.\n${E.vit} **VIT:** tăng Max HP và hiệu lực bình.\n${E.ene} **ENE:** tăng phép, RES và Max MP.\n${E.mana} **MP** dùng skill, không phải ENE. ${E.luck} **LUCK** đến từ trang bị/event.\nƯu tiên DEX cho Amazon/Assassin, ENE cho Sorceress/Necromancer, STR cho Barbarian/Druid/Paladin; thêm VIT để tăng chống chịu.`,
          },
          {
            name: "Đọc kết quả trên bảng chơi",
            value:
              "- **Lượt vừa rồi:** thay đổi trực tiếp ghi cạnh tên event hoặc **Item [độ hiếm] · Lv.** theo dạng `trước → sau`; kết quả sau được in đậm.\n- **Do <event>:** các thay đổi kéo theo từ công thức, như DEX làm tăng ACC/EVA. Đây là phần giải thích cùng một lần nhận hiệu ứng, không phải được tăng thêm lần nữa.\n- Đồ trùng tên tăng level; hiệu ứng áp dụng ngay trong run. Nút **Chỉ số** xem đầy đủ, **Trang bị** xem công dụng đồ, **Rift** xem hiệu ứng đang có.",
          },
        ),
      ...["combat", "loot", "encounters", "rngesus", "rewards"].map(
        (category) =>
          new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle(`📖 SINH TỒN v2.0.1 · ${sections[category]}`)
            .addFields(splitRuleFields(view.ratesFields(category))),
      ),
    ];
    return pages.flatMap((page) => paginateRuleEmbed(page));
  }
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
          "`/sinhton batdau`\nChọn nhân vật trên UI để xem chỉ số và kỹ năng, bấm **Nhập xu**, rồi **Bắt đầu**. Cược **10–100.000 xu**, theo giới hạn server và số dư; chỉ trừ xu khi xác nhận. Bảng chuẩn bị hết hạn sau 5 phút không thao tác. Mỗi người một run/server. `/sinhton tieptuc` đăng UI mới, khóa UI cũ. Run không hoạt động 7 ngày sẽ mất cược.",
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
        name: "💎 Kim cương và khung hồ sơ",
        value:
          "**Tổng kim cương tạm giữ**, không cộng dồn từng mốc: vượt tầng 100 → 100; 200 → 200; 300 → 400; 400 → 800; 500 → 1.600; 600 → 3.200; 700 → 6.400; 800 → 12.800; 900 → 25.600; hạ boss 999 → **51.200**. Chỉ rút thưởng mới cộng vào tài khoản; chết, bỏ run hoặc hết hạn mất toàn bộ. Phí dịch vụ chỉ trừ xu. Vượt 333/666/999 mở khung **Bạc/Vàng/Kim cương** vĩnh viễn; /hoso hiển thị tầng cao nhất đã vượt và tự dùng khung cao nhất.",
        inline: false,
      },
      {
        name: "📈 Checkpoint và hoàn thành",
        value:
          "Mỗi **5 tầng** hồi đầy HP, nhận 2 bình (tối đa 5) và chọn +5 sát thương / +30 HP / +6 Defense / +2 Luck. Tự tăng HP/sát thương: dưới 100 **+6/+1**, 100–399 **+10/+2**, 400–699 **+14/+3**, 700–999 **+30/+6**. Mỗi tầng vượt hồi 1 Energy. Tầng 100 hoàn thành chính thức; tiếp tục Overrun đến 999. **Phải hạ Deimoss để công nhận tầng 999**. Hệ số gồm checkpoint mỗi 5 tầng; mốc 5/50/100 là ×1,45/×5,50/×12,00. Hệ số dừng sau 100, bonus vẫn cộng; payout tối đa 10.000.000 xu.",
        inline: false,
      },
      {
        name: "🗺️ Tám khu vực",
        value:
          "1–99 Sanctuary · 100–199 Duncraig · 200–299 Fauztinville · 300–399 Teganze · 400–499 Scosglen · 500–699 Dimensional Labyrinth · 700–899 Heroic Rift · 900–999 Dimensional Plane. Quái scale theo tầng: HP/damage tăng 6,5%/4% mỗi tầng đến 100, rồi 8%/3,8% mỗi tầng Overrun.",
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
          "**Tấn công** — đánh thường; hồi 1 năng lượng, nhưng quái phản công nếu còn sống.\n**Phòng thủ** — hồi 1 năng lượng, Defense ×2, miễn chí mạng và giảm thêm 40% sát thương vật lý/phép sau giảm trừ (tối thiểu 1).\n**Kỹ năng** — tốn 2 năng lượng, mạnh hơn đòn thường. Shadow Step của Assassin còn né đòn phản công.\n**Bình máu** — hồi 35% HP tối đa + Potion Power (giới hạn 10–75%, ít nhất 20 HP); quái vẫn phản công nếu còn sống.\n**Rút thưởng** — kết thúc run và nhận payout đang hiển thị.",
        inline: false,
      },
      {
        name: "📦 Khi gặp hòm",
        value:
          "**Kiểm tra** — thử phát hiện Mimic một lần.\n**Mở hòm** — catalog Sinh tồn riêng 100 món: R 32, SR 28, SSR 24, UR 16. Buff/curse UR tách riêng; chỉ Goblin’s Debt và Crown of Ruin giảm payout. Item chỉ tồn tại trong run, nhặt lại tăng level và cộng hiệu ứng. 5 hòm mở không có SR+ thì hòm sau bảo đảm SR+. Sau 10 hòm không SSR+, mỗi hòm thêm 2% cơ hội SSR.\n**Bán hòm** — cộng 15% tiền cược vào payout.\n**Tránh Mimic** — đi tiếp an toàn nếu đã phát hiện.",
        inline: false,
      },
      {
        name: "🌀 Rift Modifier",
        value:
          "Mỗi 10 tầng nhận một cộng dồn; đủ 8 loại trước khi lặp. **Stone Skin**: quái +10% Defense; **Elemental Dominion**: +4% damage và phép; **Bloodlust**: HP ≤50% +8% damage; **Unstable Rift**: thêm hòm tốt/Mimic; **Fortified**: +10% HP; **Swift Horror**: +3 Accuracy/+1 Evasion; **Soul Drain**: đòn trúng rút 1 Energy, từ stack 5 rút 2; **Cursed Ground**: −4 Resistance hiệu dụng/stack khi nhận phép, không giảm vĩnh viễn.",
        inline: false,
      },
      {
        name: "👑 Boss mỗi 50 tầng",
        value:
          "**The Butcher (vật lý)**: mỗi lần ra đòn +8% damage, tối đa 5 lần. **Ascendant Riftwalker (phép)**: miễn nhiễm đòn đầu mỗi 3 lần bạn tấn công. **Assur (vật lý)**: né/chí mạng cao. **Lucion (phép)**: hồi 35% sát thương gây ra. **Deimoss (vật lý)**: Abyssal Spires giảm 25% sát thương nhận. Loại sát thương boss cố định, kể cả khi có Rift. Chu kỳ lặp theo thứ tự; Deimoss tầng 999 là boss cuối mạnh hơn.",
        inline: false,
      },
      {
        name: "🗿 Shrine và phòng sự kiện",
        value:
          "**Chạm Shrine** — hiệu ứng ngẫu nhiên: hồi đầy máu, +3 phòng thủ, −15 HP đổi +4 sát thương, +25% tiền cược vào payout, +7 sát thương đổi −4 phòng thủ, hoặc Shrine giả gây sát thương.\n**Bỏ qua** — không nhận hiệu ứng Shrine, đi tiếp.\n**Chấp nhận số phận** — Thu thuế lấy 15% payout hiện tại; kẻ trộm lấy 1 bình máu. **Wrong Portal**: 50% tốt (hồi phục/kho xu/chúc phúc), 50% xấu (mất HP/Energy/bình, phạt payout hoặc giảm Defense/Resistance) và Elite đánh phủ đầu. Portal tốt qua tầng; portal xấu phải hạ Elite mới qua. Đích đến lưu sẵn, có thể rút trước khi chấp nhận.",
        inline: false,
      },
      {
        name: "🍀 Lucky Break",
        value:
          "Luck × 1,5% cơ hội tránh hậu quả, tối đa 30%: Tax Collector hoặc Potion Thief. Không tác động Wrong Portal. Khi kích hoạt: **🍀 Lucky Break! Bạn tránh được hậu quả.**",
        inline: false,
      },
      {
        name: "❓ Bất ngờ và dịch vụ",
        value:
          "15 surprise event, chọn đều trong pool hợp lệ: Healer, Goblin, Blacksmith, Purifier, Altar, Gambler, Adventurer, Fountain, Horadric Forge, Merchant, Mirror, Treasure Room, Contract, Class Shrine và Strange Doors.\n**Thợ rèn**: 12% payout tăng 1 level, gồm buff/curse. **Giải nguyền**: 20% payout gỡ 1 lớp curse, giữ buff. Merchant bán 3 offer bằng payout. Contract và Class Shrine hiệu lực tối đa 3 tầng. Xem **Tình huống** và **Rift & hiệu ứng** để đọc chi tiết; có thể bỏ qua.",
        inline: false,
      },
      {
        name: "📊 Chu kỳ gặp RNGesus",
        value: RNGESUS_CYCLE_RULES,
        inline: false,
      },
      {
        name: "🎲 Cách tính Chaos",
        value: rngesusChaosRules(true),
        inline: false,
      },
      {
        name: "☠️ Khi gặp RNGesus",
        value:
          "RNGesus không thể bị đánh bại; **Chiến đấu** làm run kết thúc. **Bỏ chạy** có 75% thành công, giữ vé; thất bại tự dùng 1 Vé Thoát Hiểm nếu còn, hết vé thì chết. **Dùng vé** tiêu 1 Vé Thoát Hiểm để vượt tầng an toàn (giữ tối đa 1 vé). **Hối lộ** nhân payout ×0,6. **Cầu nguyện**: 30% thành công, nhận 85% SSR/15% UR; thất bại là chết. Không có nút rút thưởng.",
        inline: false,
      },
      {
        name: "🧭 Tra cứu thêm",
        value:
          "`/sinhton tyle` xem xác suất sự kiện và hòm; `hoso` xem thành tích; `xephang` xem top tầng. Chỉ số và hiệu ứng của nút được ghi trong phần **Diễn biến** sau mỗi lựa chọn.",
        inline: false,
      },
    );

  // Discord counts the text of every embed in the same message together.
  // Keep one bounded page per message, with room for emoji expansion.
  const pages = [];
  for (const section of [overview, combat]) {
    const { fields = [], ...base } = section.toJSON();
    const baseLength =
      (base.title || "").length + (base.description || "").length;
    let page = new EmbedBuilder(base);
    let length = baseLength;
    let count = 0;
    for (const field of fields) {
      const fieldLength = field.name.length + field.value.length;
      if (count && (length + fieldLength > 3400 || count >= 20)) {
        pages.push(page);
        page = new EmbedBuilder(base);
        length = baseLength;
        count = 0;
      }
      page.addFields(field);
      length += fieldLength;
      count += 1;
    }
    pages.push(page);
  }
  return pages;
}

function survivalRulesPayload(userId, requestedPage = 0) {
  const pages = survivalRules();
  const page = Math.max(0, Math.min(pages.length - 1, requestedPage));
  pages[page].setFooter({
    text: `Trang ${page + 1}/${pages.length} · Luật Sinh tồn`,
  });
  return {
    embeds: [pages[page]],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`luat:hardcore:${userId}:${Math.max(0, page - 1)}:prev`)
          .setLabel("Trước")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(
            `luat:hardcore:${userId}:${Math.min(pages.length - 1, page + 1)}:next`,
          )
          .setLabel("Sau")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === pages.length - 1),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  RULES,
  async handleButton(interaction) {
    const [, game, ownerId, pageText] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId)
      return interaction.reply({
        content: "Chỉ người mở luật mới có thể chuyển trang.",
        flags: MessageFlags.Ephemeral,
      });
    const page = Number(pageText);
    if (game !== "hardcore" || !Number.isSafeInteger(page) || page < 0)
      return interaction.reply({
        content: "Trang luật không hợp lệ. Hãy mở lại /luat.",
        flags: MessageFlags.Ephemeral,
      });
    return interaction.update(survivalRulesPayload(ownerId, page));
  },
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
        ...survivalRulesPayload(interaction.user.id),
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
