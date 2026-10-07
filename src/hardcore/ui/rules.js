"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    memories,
    RNGESUS_CYCLE_RULES,
    GOD_RNGESUS_RULES,
    rngesusChaosRules,
    stats,
    core,
    icon,
    E,
    SKILL_ICONS,
    eventIcon,
    treasureChestIcon,
    memoryIcon,
    percent,
    SKILLS,
  } = dependencies;
  const defenseDescription = (...args) =>
    dependencies.defenseDescription(...args);

  function ratesFields(category) {
    const fields = {
      combat: [
        {
          name: `${E.attack} Tấn công và sát thương`,
          value: `**${E.attack} Đánh thường:** Gây **vật lý**: có thể trượt (0 DMG) hoặc Crit ×1,75; ${E.defense} của quái giảm sát thương.\n- **Sát thương phép** luôn trúng, không Crit; chịu giảm trừ từ RES.\n- Dải DMG trên bảng giao tranh đã tính ${E.defense} của quái hiện tại, chưa tính Crit và giả định đòn vật lý trúng. Chỉ số đầy đủ hiển thị sức mạnh trước giảm trừ.\n- Đánh thường hồi MP ngay cả khi trượt: Sorceress/Necromancer hồi 70% Max MP, class khác 40%; làm tròn xuống, ít nhất 1, không vượt Max MP.\n- Quái còn sống sẽ phản công sau hành động, trừ khi skill chặn/né đòn đó.`,
        },
        {
          name: `${E.defense} Phòng thủ và ${E.potion} bình máu`,
          value: `${defenseDescription()}\n\n**Bình máu:** tiêu thụ 1 bình để hồi HP theo tỷ lệ ghi trên bảng, ít nhất 20 HP, không vượt Max HP. Hiệu lực tăng theo VIT/trang bị, giới hạn 10–75% Max HP. Quái còn sống vẫn phản công. Không dùng bình khi HP đã đầy.`,
        },
        {
          name: "Kỹ năng vật lý · 2 MP mỗi lần dùng",
          value:
            ["amazon", "barbarian", "assassin", "druid", "paladin"]
              .map(
                (key) =>
                  `${SKILL_ICONS[key]} **${stats.CLASSES[key].name} — ${stats.CLASSES[key].skill}:** ${SKILLS[key]}`,
              )
              .join("\n") +
            "\nMỗi phát tính trúng/Crit riêng, chịu DEF của quái. Skill không hồi MP như đánh thường; các hệ số áp dụng trước phòng thủ của quái.",
        },
        {
          name: "Kỹ năng phép · 2 MP mỗi lần dùng",
          value:
            ["sorceress", "necromancer"]
              .map(
                (key) =>
                  `${SKILL_ICONS[key]} **${stats.CLASSES[key].name} — ${stats.CLASSES[key].skill}:** ${SKILLS[key]}`,
              )
              .join("\n") +
            "\nSkill không hồi MP như đánh thường. Class Shrine của Sorceress cho một lần dùng miễn phí. Quái có cơ chế miễn sát thương vẫn có thể nhận 0 DMG dù phép luôn trúng.",
        },
        {
          name: `${eventIcon("boss")} Cơ chế boss`,
          value:
            "- **The Butcher:** mỗi lần ra đòn tăng 8% DMG, tối đa 5 stack.\n- **Ascendant Riftwalker:** miễn sát thương ở lượt đầu của mỗi chu kỳ 3 lượt giao tranh.\n- **Assur:** EVA và Crit cao.\n- **Lucion:** hồi HP bằng 35% sát thương thực sự gây ra.\n- **Deimoss:** Abyssal Spires giảm 25% sát thương nhận; tầng 999 là phiên bản boss cuối.\nNút **Chi tiết** cho biết cơ chế và trạng thái của boss đang gặp.",
        },
        {
          name: `${E.checkpoint} Checkpoint và ${E.rift} Rift`,
          value:
            "- Sau mỗi **5 tầng:** hồi đầy HP, +2 bình (cơ bản 5, nội tại tăng tối đa 10), chọn **+5 STR/DEX/VIT/ENE**. Bảng hiển thị chỉ số hiện tại và dự báo từng lựa chọn.\n- Sau mỗi **10 tầng:** thêm 1 stack Rift; nhận đủ 8 loại trước khi lặp. Icon ×N là số stack của từng loại; nút Rift giải thích hiệu ứng.\n- Sau mỗi **25 tầng:** chọn Paradox có hiệu lực 5 tầng. Paradox v2 chọn đều một trong **4 cặp cố định**, hiệu lực từ tầng mốc +1 đến hết +5, sau nâng thuộc tính. Không đổi payout hoặc stat gốc; mở UI không roll lại.\n- Sau tầng **199/399/699/899:** xóa toàn bộ stack một Rift có hại, trừ Unstable Rift.",
        },
      ],
      loot: [
        {
          name: "🧩 Chuỗi bốn mảnh · Conqueror’s Covenant [LR]",
          value:
            "Mimic, Ancient Mimic, Blood Mimic và Clone từ ký ức sau khi phá Mirror of Fate: mỗi nguồn cho 100% một mảnh ở lần hạ hợp lệ đầu tiên trong run, độc lập LUCK; giữ thưởng cũ. Đủ 4 mảnh: Wrong Portal tiếp theo bảo đảm có cửa tầng hầm, vẫn giữ nút vào/bỏ qua. Thắng Covenant Guardian (Tinh anh HP ×1,25, DMG ×1,10 cùng tầng/Rift) mới tiêu thụ mảnh và nhận LR; bạn hành động trước, có thể hồi sinh để đánh tiếp. Nhận di vật kèm animation, hồi đầy HP/MP, giải mọi nguyền UR, xóa ấn Rift; giữ Paradox/Contract. Mỗi quái hạ sau kích hoạt cộng 0,2 điểm % thưởng xu, tối đa +100%; nhân một lần trước trần 10 triệu và chi phí/phạt, không tăng kim cương. Chỉ 1 LR hoạt động/run, không đổi giữa run. Mảnh/di vật mất khi run kết thúc; không gacha, shop hay roll drop LR.",
        },
        {
          name: `${E.chest} Hòm thường: mở, kiểm tra hoặc bán`,
          value:
            "- **Kiểm tra:** thử phát hiện Mimic một lần; tỷ lệ tăng theo Luck/trang bị. Phát hiện được mới có nút tránh Mimic. Kiểm tra không đổi nội dung hòm.\n- **Mở:** có thể nhận đồ, gặp hòm rỗng/giả hoặc phải đánh Mimic. Tỷ lệ cơ bản: Ancient Mimic 3%, Mimic thường 12%.\n- **Nếu không phải Mimic:** SSR 10%, UR 3%, SR 22%, R 40%, rỗng 20%, giả 5%. Đây là tỷ lệ trong nhánh an toàn, không phải tỷ lệ tổng của mọi hòm. Luck/Rift/trang bị/pity có thể đổi tỷ lệ; xem **Chi tiết** để biết tỷ lệ của hòm hiện tại.\n- **Bán:** cộng bonus bằng 15% cược, không mở hòm. Kho báu có bảng tỷ lệ riêng.",
        },
        {
          name: `${E.backpack} Rơi trang bị từ quái`,
          value:
            "Khi hạ quái: tỷ lệ drop = 1% + LUCK × 0,5 điểm %, tối đa 20%; chốt LUCK khi vào combat. Mỗi lần thành công nhận 1 món. Quái thường/Mimic thường: R 60% · SR 40%; Tinh anh: SR 60% · SSR 40%; Boss: SSR 60% · UR 40%. Boss cuối khu vực có rương không roll thêm đồ. Ancient/Blood Mimic giữ thưởng riêng chắc chắn và roll thêm drop theo LUCK. Không đổi pity hòm, không chịu hiệu ứng tìm SSR. Xem tỷ lệ trận hiện tại ở Chi tiết; đồ nhận ghi ở Lượt vừa rồi.",
        },
        {
          name: `${E.backpack} Trang bị và bảo hiểm hòm`,
          value:
            "- Catalog có **63 trang bị:** R 10, SR 13, SSR 24, UR 16; pool UR có thêm Vé thoát loại vật phẩm. Mỗi món R/SR chuyên một chỉ số hoặc tác dụng, không trùng vai trò trong cùng độ hiếm; SR cho mức cộng cao hơn R. Đồ chỉ tồn tại trong run; trùng tên tăng level và cộng hiệu ứng. **Trang bị UR có cả buff và lời nguyền**. Lời nguyền rút HP cuối tầng luôn chừa ít nhất **1 HP**.\n- Sau **5 hòm đã mở không nhận SR trở lên**, hòm kế bảo đảm SR+ và không có Mimic.\n- Sau **10 hòm không nhận SSR**, tỷ lệ SSR được cộng 2 điểm % mỗi lần tiếp theo; nhận SSR thì đặt lại bộ đếm. Luck cũng tăng tỷ lệ SSR, tổng tối đa 35% ở hòm thường.\n- Mốc 10 là lúc bắt đầu tăng xác suất, không phải bảo đảm SSR. Đồ rơi từ quái, Ancient Mimic/Blood Mimic, rương boss, shop hoặc event khác không đặt lại bộ đếm hòm thường/kho báu; rương thường mua ở Rift Merchant vẫn tính.",
        },
        {
          name: `${E.ticket} Vật phẩm UR / LR`,
          value: `- ${E.ticket} **Vé thoát [UR]** nằm trong pool vật phẩm của run. Nhặt vé vào ô vé, tối đa 1; không tăng level, không có nguyền và không chiếm chỗ trang bị. Vé dư bị bỏ.\n- ${E.reviveTicket} **Vé hồi sinh [LR]**: hiện LR chỉ có loại vật phẩm, chưa có trang bị. Không xuất hiện trong Gacha hay pool rơi đồ ngẫu nhiên; nguồn sự kiện đặc biệt sẽ có spec sau.\n- Cửa hàng Sinh tồn vẫn bán cả ba vé: thoát 100, cầu nguyện 100, hồi sinh 300 kim cương. Vé đã sở hữu vẫn dùng được.`,
        },
        {
          name: `${E.hp} Lời nguyền rút HP`,
          value:
            "Trang bị có lời nguyền rút HP áp dụng **sau khi vượt tầng**, dựa trên Max HP và số level chưa giải nguyền. Tổng lượng rút luôn chừa ít nhất **1 HP**; đang có 1 HP thì không mất thêm.\nĐiều này chỉ bảo vệ trước hiệu ứng rút HP của trang bị và Shrine Fake. Quái hoặc các event có nhánh tử trận vẫn có thể giết bạn. Giải nguyền hoặc chuyển hóa level bị nguyền có thể gỡ hiệu ứng theo công dụng dịch vụ.",
        },
        {
          name: `${E.chest} Phần thưởng Ancient Mimic`,
          value:
            "Ancient Mimic là **quái Tinh anh**, hưởng bonus sát thương lên Tinh anh. Hạ quái nhận ngay **1 vật phẩm**: **50% SR · 30% SSR · 20% UR**. UR có thể là trang bị có nguyền hoặc Vé thoát; trang bị trùng tăng level. Vật phẩm được nhận ngay trong run và hiển thị ở **Lượt vừa rồi**. Tỷ lệ cố định, không chịu Luck/pity; phần thưởng này không làm thay đổi bộ đếm bảo hiểm hòm. Mimic thường không có phần thưởng này.",
        },
        {
          name: `${E.chest} Phần thưởng Blood Mimic`,
          value:
            "Blood Mimic từ event Blood Fountain là **quái Tinh anh**, hưởng bonus sát thương lên Tinh anh. Hạ quái nhận ngay **1 trang bị**: **60% SR · 40% SSR**. Đồ trùng tăng level và áp dụng hiệu ứng ngay trong run. Tỷ lệ cố định, không chịu Luck/pity và không làm đổi bộ đếm bảo hiểm hòm. Vẫn nhận bonus xu khi vượt tầng; Mimic thường từ hòm không có phần thưởng trang bị này.",
        },
        {
          name: `${eventIcon("boss_chest")} Rương boss cuối khu vực`,
          value:
            "- Hạ boss tầng **100/200/300/400/500/700/900**: lập tức nhận một rương boss bắt buộc xử lý. Boss 50 tầng khác và boss 999 không cho rương này.\n- **Mở:** 70% nhận SSR, 30% nhận UR (trang bị có nguyền hoặc Vé thoát). Tỷ lệ cố định, không chịu Luck hoặc pity. Đồ trùng tăng level.\n- **Bán:** cộng bonus bằng **100% cược ban đầu**; số xu cụ thể ghi trên bảng.\n- Không được bỏ qua hoặc rút thưởng khi rương chưa xử lý. Mở/bán không tính thêm một tầng.",
        },
      ],
      encounters: [
        {
          name: "Các tình huống có thể gặp",
          value:
            "- Pool thường: quái thường 53%, Elite 12%, hòm 10%, Shrine 8%, kho báu 5%, bẫy 6%, sự kiện đặc biệt 4%, phòng trống 2%. Đây là tỷ lệ gốc; điều kiện tầng/Rift có thể thay đổi lựa chọn hợp lệ.\n- Boss mỗi 50 tầng và boss cuối 999 được ưu tiên; tiếp theo là RNGesus, Tower Remembers và Grave Echo trước khi chọn pool thường. Sự kiện đặc biệt cách nhau ít nhất 2 tầng.\n- Mỗi event ghi tên, lựa chọn, tỷ lệ và hậu quả trên bảng; kết quả thực tế nằm ở **Lượt vừa rồi**. Event trả tiền hoặc thu thuế không xuất hiện ở tầng 1.",
        },
        {
          name:
            eventIcon("royal_invitation") +
            " Royal Invitation · quy đổi set LR",
          value:
            "Chỉ vào pool event đặc biệt khi đủ một set 5 món khác nhau và mọi level UR trong set đã giải hết nguyền. Trọng số Royal **10**, Purifier **3**, event thường **1**; giữ ưu tiên Boss/RNGesus và khoảng cách event cũ.\n**Diệt Vương → Kingslayer’s Testament:** Oathbreaker, Berserker Chains, Deimoss Scar, Predator’s Instinct, Warden’s Bulwark.\n**Tinh Tú → Astral Singularity:** Blood Pact, Hollow Crown, Seraphic Aegis, Phoenix Blood, Sevenfold Sigil.\n**Nhận lời:** tiêu hao toàn bộ 5 món của set đã chọn, gồm mọi level, buff/nội tại; nhận LR, hồi đầy HP/MP theo chỉ số còn lại, giải mọi nguyền UR và xóa ấn Rift. Giữ Paradox/Contract. Nếu đã có LR hoạt động, LR mới chỉ được sở hữu.\n**Bỏ đi:** giữ đồ, vượt tầng bình thường, khóa Royal Invitation trong cả run kể cả khi đủ set khác. Mỗi run chỉ quy đổi một set. Có thành tựu và thành tích lưu ngay khi nhận LR; xem Chi tiết trước khi giao nộp.",
        },
        {
          name: `${E.shrine} Shrine · chọn Chạm hoặc Bỏ qua`,
          value: `**6 loại ngang nhau (mỗi loại ≈16,7%)**; nếu Dấu ấn oán hận đến hạn, thêm Nghi lễ thành **7 nhánh ngang nhau (mỗi nhánh 1/7)**; kết quả được giữ cố định khi mở lại bảng.\n- **Healing:** hồi đầy ${E.hp} HP.\n- **Armor:** +5 vào một thuộc tính ${E.str} STR / ${E.dex} DEX / ${E.vit} VIT / ${E.ene} ENE; trong nhánh Armor, mỗi chỉ số 25%.\n- ${E.backpack} **Treasure:** 1 vật phẩm ngẫu nhiên, **R 50% / SR 30% / SSR 15% / UR 5%**. Không chịu LUCK/pity; UR có thể là trang bị hoặc Vé thoát.\n- **Corrupted:** +12 thuộc tính sát thương phù hợp class, −8 ${E.vit} VIT.\n- **Experience:** bonus bằng 25% tiền cược.\n- **Fake:** rút 30% Max ${E.hp} HP, mức bẫy tối thiểu 10; chỉ trừ đến khi còn **1 HP**.\n**Bỏ qua** giữ nguyên chỉ số và đi tiếp.`,
        },
        {
          name: `${E.shrine} Thuộc tính nhận từ Corrupted`,
          value: `${E.dex} **DEX:** Amazon, Assassin.\n${E.ene} **ENE:** Sorceress, Necromancer.\n${E.str} **STR:** Barbarian, Druid, Paladin.\nCorrupted tăng +12 thuộc tính phù hợp class và giảm 8 ${E.vit} VIT.`,
        },
        {
          name: `${E.luck} Bẫy và Lucky Break`,
          value: `- **Thu thuế:** trừ một lần 15% số xu có thể rút tại lúc xử lý event (làm tròn lên 1 xu); không đổi hệ số payout và không đánh thuế phần thưởng tăng thêm sau đó. **Trộm bình:** lấy 1 ${E.potion} bình nếu còn. Lucky Break có thể tránh hai hậu quả này: mỗi Luck cho 1,5 điểm %, tối đa 30%.\n- **Wrong Portal:** cơ bản 50% tốt / 50% xấu; LUCK không tác động, nội tại may mắn sự kiện có thể tăng nhánh tốt. Chọn **Vào portal** để nhận kết quả; nhánh xấu gọi Elite đánh phủ đầu, phải hạ Elite mới vượt tầng. **Bỏ qua** để vượt tầng mà không nhận thưởng, chịu hiệu ứng portal hoặc gặp Elite. Tiên tri (nếu có) đánh dấu nút vào portal.\n- Phòng trống cho phép đi tiếp hoặc rút thưởng.`,
        },
        {
          name: `${eventIcon("goblin")} Treasure Goblin`,
          value: `Tỷ lệ bắt = **60% + LUCK ×1 điểm % + buff bắt Goblin**, tối đa **90%**.\n- **Bắt được:** bonus bằng **25% tiền cược** và **1 ${E.backpack} vật phẩm**. Độ hiếm khi bắt thành công: **60% SR / 35% SSR / 5% UR** (trang bị có nguyền hoặc Vé thoát). Buff bắt chỉ tăng cơ hội bắt; tỷ lệ độ hiếm giữ nguyên, không dùng pity của hòm. Đồ trùng tăng 1 level.\n- **Goblin thoát:** trừ một lần **5% payout hiển thị hiện tại**, làm tròn lên 1 xu. Khoản này không giảm hệ số payout hoặc thưởng tăng thêm về sau.\n- Phần thưởng được khóa khi event xuất hiện; mở lại bảng không roll lại. Item và thay đổi chỉ số hiển thị ở **Lượt vừa rồi**.`,
        },
        {
          name: "Các sự kiện đặc biệt",
          value:
            "Healer · Treasure Goblin · Blacksmith · Purifier · Sacrificial Altar · Cursed Gambler · Lost Adventurer · Fountain · Horadric Forge · Rift Merchant · Mirror · Treasure Room · Contract · Class Shrine · Strange Doors · Duelist · Payout Shop · Blood Shop · Diamond Shop.\n\nChỉ những event đủ điều kiện mới được chọn. Các lựa chọn có thể đổi HP, thuộc tính, trang bị, payout hoặc tạo hiệu ứng tạm thời. Không phải event nào cũng miễn phí hoặc an toàn; đọc giá, tỷ lệ và điều kiện trên bảng trước khi xác nhận.",
        },
        {
          name: `${eventIcon("treasure_room")} Treasure Room`,
          value: `Chọn mở **một** rương, không soi hoặc bỏ qua. Đúng một trong ba rương là Mimic: mỗi màu có **1/3** gặp Mimic, **2/3** nhận thưởng.\n- ${treasureChestIcon("red")} **Đỏ:** ${E.attack} Vật lý +5 • ${E.magic} Phép +5.\n- ${treasureChestIcon("blue")} **Xanh:** ${E.defense} DEF +6 • ${E.res} RES +5%.\n- ${treasureChestIcon("gold")} **Vàng:** bonus +50% cược • ${E.luck} LUCK +1.\nNếu chọn trúng Mimic, phải chiến đấu thay vì nhận thưởng của màu đó.`,
        },
        {
          name: `${eventIcon("memory")} The Tower Remembers`,
          value:
            Object.entries(memories.CATALOG)
              .map(
                ([family, entry]) =>
                  `- ${memoryIcon(family)} **${entry.name.split(" · ")[0]}**`,
              )
              .join("\n") +
            "\nXem nguồn gốc, hiệu lực, tầng đến hạn và lựa chọn trong nút **Rift**.\n- Hậu quả hẹn sau **10–30 tầng**, tối đa **8** đang chờ; boss/RNGesus được ưu tiên. Đầy hàng chờ thì không thể cướp, hiến tế hoặc đập gương; cầu nguyện RNGesus vẫn dùng được nhưng không thêm thử thách.\n- Bỏ qua event, bán hòm và hối lộ không tạo ký ức mới. Run cũ giữ nguyên các hậu quả đã khóa, không roll lại.",
        },
        {
          name: `${eventIcon("adventurer")} Lost Adventurer · cứu / cướp`,
          value: `- **Cứu:** trả một bình, nhận R 70% / SR 30% và một lần bảo hộ trong cùng khu vực. Chết bởi RNGesus → hồi sinh 50% HP, sang tầng kế; chết khi đánh quái → hồi sinh 50% HP, ở lại đánh tiếp. Ưu tiên trước ${E.reviveTicket} **Vé hồi sinh**, hết hiệu lực khi dùng hoặc sang khu vực khác; không tạo hậu quả hẹn.\n- **Cướp:** nhận **SSR 75% / UR 25%** (trang bị có nguyền hoặc Vé thoát). Sau **10–30 tầng**: **50% mất 10% payout**, **50% gặp Bounty Hunter (Elite)**, có thể bồi thường 20% payout để tránh đánh. Không có nhánh hồi máu/bonus. Tối đa 8 hậu quả đang chờ; kết quả khóa khi ghi nhận.`,
        },
        {
          name: "🕯️ Nghi lễ Oán Hận · Gilded Soul [LR]",
          value:
            "Cướp Lost Adventurer vẫn giữ hậu quả 50% mất 10% payout / 50% Bounty Hunter, đồng thời thêm dấu ấn riêng trong Rift. Từ tầng cướp +10, Shrine có 7 nhánh ngang nhau: nghi lễ 1/7. Cướp thêm không lùi mốc; bỏ qua giữ dấu ấn.\nTriệu hồi Avarice Revenant (Boss), bạn hành động trước. Dưới 40% Max HP không dùng bình. Đòn Tấn công/Skill gây phản phệ 10% DMG thực tế (làm tròn xuống), không né/chặn/Crit, kể cả đòn kết liễu. Không tấn công một lượt: boss chờ; hai lượt liên tiếp trở đi: boss đánh. CRIT gián đoạn đòn thường nhưng vẫn chịu phản phệ.\nHạ boss và sống sót: nhận Gilded Soul, không ban phước hồi HP/MP/giải nguyền. DMG Tấn công/Skill +10/20/30/40/50% khi xu có thể rút trong run đạt 2/5/10/20/40 lần cược; chốt mỗi combat, tối đa +50%. Chỉ một nội tại LR hoạt động/run. Ghi nhận thành tích và thành tựu.",
        },
        {
          name: `${eventIcon("echo")} Grave Echo`,
          value:
            "- Từ tầng 101, có 1% cơ hội ở tình huống hợp lệ; tối đa một lần trong mỗi dải 100 tầng, không gặp mộ của chính mình.\n- Có thể cầu nguyện hồi HP, bỏ đi, cướp hoặc khiêu chiến. Cướp: 50% an toàn, 50% tạo Oán niệm sau 10–30 tầng, thay trận thức tỉnh tức thì; món đã cướp không nhận lại. Khiêu chiến vẫn đánh ngay với đối thủ mạnh hơn. Đọc tỷ lệ và phần thưởng trên bảng trước khi chọn.",
        },
      ],
      rngesus: [
        {
          name: `${eventIcon("god_rngesus")} God of RNGesus`,
          value: GOD_RNGESUS_RULES,
        },
        {
          name: "📊 Chu kỳ gặp RNGesus",
          value: RNGESUS_CYCLE_RULES,
        },
        {
          name: "🎲 Cách tính Chaos",
          value: rngesusChaosRules(),
        },
        {
          name: `${eventIcon("rngesus")} RNGesus · không được rút thưởng`,
          value: `Chaos là tỷ lệ gặp RNGesus. Không thể đánh bại hoặc rút thưởng tại đây.\n- **Đánh:** tử trận ngay. Khi tử trận, Lost Adventurer hoặc ${E.reviveTicket} **Vé hồi sinh** có thể cứu nếu còn; hết bảo hộ/vé thì mất cược và thưởng tạm giữ.\n- **Hối lộ:** cần payout hiển thị **≥1.000 xu**, đúng 1.000 vẫn được. Thoát an toàn, trừ một lần **40% payout hiện tại**, làm tròn lên; không giảm hệ số thưởng hoặc phạt tiền kiếm thêm về sau.\n- **Cầu nguyện:** **30%** thành công và nhận chắc chắn **1 vật phẩm UR** (trang bị có nguyền hoặc Vé thoát); **70%** thất bại và tử trận. Mang ${E.prayerTicket} **Vé cầu nguyện** từ túi Sinh tồn: **60%** thành công, **40%** thất bại, áp dụng toàn run. \nCầu nguyện thành công có thể tạo Thử thách thần linh; hối lộ không tạo ký ức mới. Xem trong Rift.`,
        },
        {
          name: `${E.ticket} Bỏ chạy và Vé thoát`,
          value: `- Trong cùng ván: **100% → 95% → 90% → 85% → 80% → 75%**, các lần sau giữ **75%**.\n- Mỗi lần chọn **Bỏ chạy** giảm 5 điểm % cho lần sau, kể cả được vé cứu. Hối lộ/cầu nguyện giữ nguyên. **Ván mới: 100%.** Mở lại UI/restart bot giữ tỷ lệ đã lưu.\n- Chạy thất bại: tự dùng ${E.ticket} **Vé thoát ×1**; hết vé thì tử trận, kiểm tra Lost Adventurer hoặc ${E.reviveTicket} **Vé hồi sinh**.\n- ${E.ticket} **Vé thoát**: tối đa **1**, chỉ cứu bỏ chạy thất bại. Chạy thành công giữ vé. Không có nút dùng riêng tại RNGesus.`,
        },
      ],
      rewards: [
        {
          name: "✨ Nội tại trang bị",
          value:
            "Mỗi món có một nội tại, không tăng theo level. Các món khác nhau cùng loại cộng rồi áp trần: cuồng chiến 40%, hút MP 35%, phản thủ 40%, gai 20%, phản khi né 50%, giá xu −20%, event tốt +10 điểm % (nhánh tốt ≤95%), thêm tối đa 5 bình (tổng 10), trần CRIT 75% và né vật lý 60%, khởi động MP 75%, nghỉ chân 5% Max HP, giữ bình 25%, chống bẫy 25%. Phản sát thương chung mỗi lượt ≤50% sát thương cơ bản trung bình của class, chịu DEF/miễn giảm quái; không crit/kích hoạt nội tại. Tiên tri tối đa 2 lựa chọn/event, khóa khi tạo, chỉ báo an toàn/nguy hiểm tức thời, không áp dụng RNGesus. Giải nguyền giữ nội tại; chuyển hóa level cuối làm mất nội tại, phần chỉ số giữ lại không mang nội tại.",
        },
        {
          name: "Cửa hàng & túi Sinh tồn",
          value: `Dùng /sinhton cuahang và /sinhton tuido. Giá vé: ${E.ticket} **Vé thoát** 100 💎; ${E.prayerTicket} **Vé cầu nguyện** 100 💎; ${E.reviveTicket} **Vé hồi sinh** 300 💎. Năm trang bị chọn đều từ toàn bộ pool, đổi mỗi ngày lúc 00:00 Việt Nam: R 10.000 / SR 50.000 / SSR 100.000 / UR 200.000 xu. Mua không giới hạn lượt. Trước run chọn tối đa 5 món khác nhau (Lv.1), mỗi loại vé một chiếc; xem chỉ số rồi Bắt đầu. Không hoàn đồ/vé khi chết, rút, bỏ hoặc hết hạn run. ${E.reviveTicket} **Vé hồi sinh** tự cứu một lần với 50% HP; ở lại đánh tiếp nếu chết khi đánh quái, sang tầng kế nếu chết bởi RNGesus.`,
        },
        {
          name: "Dịch vụ: giá và điều kiện",
          value:
            "- **Rèn:** trả 12% payout hiện tại, tăng một level gồm buff và curse còn lại. **Giải nguyền:** trả 10% payout hiện tại, gỡ toàn bộ curse, giữ nguyên UR, buff, level và nội tại.\n- **Horadric Forge:** tiêu hao 1 level trang bị, giữ nguyên hiệu ứng có lợi của level đó trong run và xóa lời nguyền tương ứng; chọn thêm một phần thưởng. Không nhận lại bình/vé/HP hồi khi nhặt đồ.\n- **Payout Shop:** R/SR/SSR giá 5%/12%/25% payout hiện tại, tối đa 5 lần gặp/run. **Blood Shop:** giảm 12%/25%/40% Max HP để mua SR/SSR/UR, tối đa 3 lần gặp/run. Giá chốt lúc gặp, làm tròn lên; giảm Max HP trong suốt run, phải còn ít nhất 1 Max HP trước khi nhận vật phẩm. HP hiện tại chỉ hạ xuống nếu vượt Max HP mới.\n- **Diamond Shop:** từ tầng 101, giá SR 100 / SSR 300 / UR 480 kim cương, tối đa 2 lần gặp/run; trừ ngay từ tài khoản, không hoàn khi chết.\n- Mỗi loại shop cách nhau ít nhất 50 tầng; mỗi lần gặp mua tối đa một món. Giá cụ thể và công dụng ghi trên bảng/Chi tiết.",
        },
        {
          name: `${eventIcon("merchant")} Rift Merchant · giá theo payout hiện tại`,
          value: `Mỗi lần gặp có **3 loại hàng khác nhau**, chọn từ 6 loại; mua tối đa **1 món**. Giá được khóa khi gặp, làm tròn lên, tối thiểu 1 xu.\n- ${E.potion} +1 bình (giới hạn cơ bản 5, nội tại tăng tối đa 10): **2,5%** payout hiện tại.\n- ${E.hp} Hồi đầy HP: **4%**.\n- ${E.luck} +1 LUCK trong run: **5%**.\n- ${E.backpack} 1 trang bị SR: **7,5%**.\n- ${E.ticket} Vé thoát (tối đa 1): **12,5%**.\n- ${E.chest} Rương thường: **7,5%**, **mở ngay khi mua**; tỷ lệ và pity như hòm thường, có thể gặp Mimic hoặc rỗng/giả. Chi tiết liệt kê tỷ lệ của rương đang bán.\nGiá chốt theo payout hiện tại lúc gặp, sau lời nguyền, Paradox và các khoản đã chi; nội tại giảm giá xu vẫn áp dụng.`,
        },
        {
          name: `${eventIcon("purifier")} Purifier · giải lời nguyền`,
          value: `Chỉ xuất hiện khi có trang bị còn lời nguyền; không xuất hiện ở tầng 1. Trong nhóm event đặc biệt đủ điều kiện, Purifier có trọng số **gấp ${core.PURIFIER_EVENT_WEIGHT}** mỗi event thường (trọng số 1); Royal Invitation có trọng số 10 khi đủ điều kiện. Đây không phải tỷ lệ cố định trên mỗi tầng.\nBấm **Giải toàn bộ**: trả **${percent(core.PURIFIER_COST_RATE)} payout hiện tại**, làm tròn lên và tối thiểu 1 xu; gỡ mọi level lời nguyền của món được chỉ định, giữ nguyên UR, buff, level và nội tại.`,
        },
        {
          name: `${eventIcon("diamond_shop")} Diamond Merchant`,
          value: `Từ tầng **101**; tối đa **2 lần gặp/run**, cách ít nhất 50 tầng. Bỏ qua vẫn tính một lần gặp.\nMỗi lần có **3 món ngẫu nhiên**, độ hiếm của từng món độc lập: **40% SR / 40% SSR / 20% UR**.\nGiá: **SR 100 / SSR 300 / UR 480** ${icon("gem", "💎")}. Mua tối đa **1 món/lần gặp**. Kim cương trừ từ tài khoản ngay khi mua, không hoàn khi chết. UR có thể là trang bị có nguyền hoặc Vé thoát; vật phẩm chỉ dùng trong run.`,
        },
        {
          name: `${eventIcon("horadric")} Horadric Forge · chuyển hóa trang bị`,
          value: `Không tốn xu. Tiêu hao **1 level** của món chỉ định: level 1 thì món rời trang bị. **Giữ nguyên** hiệu ứng có lợi của level đã dùng trong run, không cộng lại lần nữa; xóa lời nguyền tương ứng. Không nhận lại ${E.potion} bình, ${E.ticket} Vé thoát hoặc ${E.hp} HP hồi khi nhặt món đó.\nChọn **một** phần thưởng thêm: +6 thuộc tính sát thương phù hợp class; hoặc +7 STR/VIT đã ghi trên nút; hoặc +4 ${E.vit} VIT. Món SSR/UR còn có lựa chọn nhận ${E.ticket} **Vé thoát +1** (giữ tối đa 1). Bỏ qua thì giữ trang bị và không nhận phần thưởng.`,
        },
        {
          name: "Rút thưởng và mất thưởng",
          value:
            "- Sau khi vượt ít nhất một tầng, **Rút thưởng** kết thúc run và nhận thưởng theo bảng. Rút trước tầng đầu là bỏ run, mất cược. RNGesus và rương boss chưa xử lý không cho rút.\n- Payout là **tổng thưởng xu**, không phải tiền lãi. Hệ số từ vượt tầng dừng tăng sau 100. Bonus event tính theo cược ban đầu; event cược thưởng theo khoản đã đặt. Phạt event trừ một lần theo payout hiện tại, không giảm hệ số thưởng. Giới hạn 10 triệu xu. Các khoản mua đồ/dịch vụ trong run làm giảm payout theo giá đã xác nhận.\n- Chết, bỏ run hoặc hết hạn: mất cược và toàn bộ xu/kim cương tạm giữ. Trang bị trong run cũng không chuyển vào túi Gacha.\n- Run mới dùng v2.0.1; run cũ tiếp tục theo phiên bản đã lưu.",
        },
        {
          name: "Kim cương theo mốc",
          value:
            "**Tổng kim cương tạm giữ**, không cộng dồn từng mốc:\n100 → **100**; 200 → **200**; 300 → **400**; 400 → **800**; 500 → **1.600**; 600 → **3.200**; 700 → **6.400**; 800 → **12.800**; 900 → **25.600**; hạ boss 999 → **51.200**.\nChỉ rút thưởng mới nhận vào tài khoản. Ví dụ vượt tầng 300 rồi rút: nhận 400 kim cương, không phải 100 + 200 + 400.",
        },
      ],
    };
    return category
      ? fields[category] || fields.combat
      : Object.values(fields).flat();
  }
  return { ratesFields };
};
