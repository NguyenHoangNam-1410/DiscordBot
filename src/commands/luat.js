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
  covua: [
    "Cờ vua",
    "Mỗi kênh có tối đa một puzzle Lichess chưa giải. `/covua choi` mở bàn mate ngẫu nhiên 1–5 nước. Gửi toàn bộ các nước của bên cần giải trong một tin nhắn, dùng UCI hoặc SAN; bot tự kiểm tra nước đáp trả. Người gửi lời giải đầy đủ đúng đầu tiên nhận thưởng cơ sở × N² xu. Đúng sẽ được thả ✅ và thông báo thắng nếu bot có quyền. Bàn đóng sau 1 giờ, không tự mở bàn tiếp. `/covua xem` xem riêng bàn/kết quả. Quản trị dùng `/covua boqua` để thay bàn, `/covua cauhinh` đặt kênh và thưởng.",
  ],
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
    "**Điểm bài**\n- Lá 2–10 tính theo số; J/Q/K = 10; A = 11 hoặc 1 để tránh quắc. Tổng trên 21 là **quắc**. Chỉ được **Dừng từ 16 điểm**; nhà cái rút đến ít nhất 15.\n- **Xì bàng** (đúng 2 lá A) mạnh nhất, thắng cả Ngũ linh và Xì dách; tự động dừng, không cần đủ 16 điểm. Cùng Xì bàng: hòa. Tiếp theo là **Ngũ linh** (5 lá, không quắc), **Xì dách** (2 lá, tổng 21), rồi đến điểm thường. Cùng Ngũ linh: tổng nhỏ hơn thắng. Cùng điểm thường hoặc cùng Xì dách: hòa. Cả hai quắc: hòa.\n\n**Chơi với bot**\n- Rút hoặc Dừng để so với nhà cái. Hai lá đầu cùng hạng được **Tách** một lần: trả thêm khoản bằng cược để chơi hai tay riêng. Tách A chỉ nhận thêm một lá mỗi tay.\n- Thắng thường: tổng nhận mặc định **2 lần cược**; Xì dách hoặc Xì bàng từ hai lá đầu thắng nhận **2,5 lần**. Admin có thể chỉnh hệ số thường; hai bộ tự nhiên này cộng thêm 0,5. Hòa hoàn cược; thua mất cược.\n\n**Bàn người chơi**\n- Người mở làm nhà cái, chọn ante không quá 25% số dư; tối đa 3 người vào trong 30 giây. Mỗi người đấu riêng với nhà cái.\n- Bài giữ kín đến kết thúc; dùng **Xem bài của tôi** để rút/dừng. Thắng nhận **2 lần ante**, hòa hoàn ante, thua mất ante. Người tham gia phải kết thúc bàn trước khi cược game khác.",
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
  2048: [
    "2048",
    "**Cách chơi**\n- Dùng nút mũi tên để dồn toàn bộ ô về một phía. Hai ô cùng số chạm nhau sẽ gộp thành ô gấp đôi và cộng điểm bằng giá trị ô mới. Sau mỗi nước đi hợp lệ xuất hiện thêm một ô 2 (hoặc 4).\n- Chạm ô **2048** vẫn chơi tiếp được. Ván tự chốt khi hết nước đi; bấm **Kết thúc** để chốt sớm.\n- `/2048 batdau` mở ván mới; `/2048 tieptuc` đăng lại bảng của ván đang chơi (bảng cũ bị khóa). Mỗi người một ván/server. Không thao tác **7 ngày** thì ván tự chốt theo điểm hiện có.\n\n**Thưởng (không có cược)**\n- Xu = điểm ÷ 30, tối đa 1.000; chạm ô 2048 được cộng thêm 150 xu.\n- EXP = điểm ÷ 250, tối đa 60.\n- Ô ≥ 1000 hiển thị gọn: 2🇰 = 2048.",
  ],
};

function survivalRules(guildId) {
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
      .setTitle(
        `📖 SINH TỒN v${require("../hardcore/shared/version").RELEASE.version} · CÁCH CHƠI`,
      )
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
            "`/choi sinhton thap` hoặc `/sinhton thap` mở/tiếp tục challenge 15 tầng. Quy luật combat duy nhất là hạ quái trước khi bị quái kết liễu; Tấn công và Skill luôn gây đúng damage hiển thị. Skill dùng một lần mỗi tầng và bị quái hấp thụ toàn bộ damage nếu chưa kết liễu; Phòng thủ giảm đòn nhận theo số dự báo. Tháp không công bố số hành động và mỗi tuần chỉ có một lời giải duy nhất. Tử trận sẽ thử lại từ đầu tầng hiện tại; các tầng đã vượt được giữ lại. Mỗi tầng là puzzle độc lập: sang tầng mới sẽ đặt lại HP, MP, Skill, Ward và hiệu ứng theo trạng thái đầu tầng. Xoay đủ 7 class trước khi lặp. Không cược, không dùng loadout, item, bình hoặc vé từ Sinh tồn 999. Damage cố định, không Miss/Crit/RNG. Snapshot đã kiểm chứng được khóa cả tuần; xem seed commitment trên bảng. Có thể giữ đồng thời một run mỗi mode. Challenge đổi lúc 00:00 thứ Hai (UTC+7); hết hạn có 24 giờ chỉ xem kết quả. Hoàn thành lần đầu nhận 500.000 xu + 250 kim cương; chơi lại không nhận thêm. Nút bảng xếp hạng nằm trên UI Tháp.",
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
    ...["combat", "loot", "encounters", "rngesus", "rewards"].map((category) =>
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(
          `📖 SINH TỒN v${require("../hardcore/shared/version").RELEASE.version} · ${sections[category]}`,
        )
        .addFields(splitRuleFields(view.ratesFields(category))),
    ),
  ];
  return pages.flatMap((page) => paginateRuleEmbed(page));
}

function survivalRulesPayload(userId, requestedPage = 0, guildId) {
  const pages = survivalRules(guildId);
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
    return interaction.update(
      survivalRulesPayload(ownerId, page, interaction.guildId),
    );
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
        ...survivalRulesPayload(interaction.user.id, 0, interaction.guildId),
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
