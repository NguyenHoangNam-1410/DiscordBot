"use strict";
const { E } = require("../shared/icons");
const mech = require("./mechanicsV2"),
  { CATALOG, config } = require("./catalogV2");
const labels = ["◇", "△", "○"],
  colors = ["Lửa", "Lạnh", "Sét"],
  actNames = {
    attack: "Tấn công",
    skill: "Skill",
    defend: "Phòng thủ",
    potion: "Bình",
    empty: "Trống",
  };
const RULES = {
  butcher:
    "Theo dõi khoảng cách 0–2. Sau mỗi lượt, boss tiến gần bạn một ô; mỗi {CYCLE} lượt sẽ kéo bạn về 0.\nỞ khoảng cách 0, DMG của bạn +15%; mỗi lượt ở đây thêm một điểm Cuồng nộ cho boss (tối đa {CAP}), mỗi điểm tăng {POWER}% DMG boss.\nLùi một ô để giãn khoảng cách. Chặt xích tốn 5% HP hiện tại, ngăn một lần kéo sắp tới; bạn phải còn ít nhất 1 HP.\nLùi và Chặt xích đều tốn 1 lượt, boss vẫn có thể phản công.",
  machine:
    "Mỗi hit Tấn công/Skill gây DMG tăng {AMOUNT} nhiệt. Giữ nhiệt 70–99 để DMG của bạn lên boss +30%.\nĐạt 100 nhiệt: cuối lượt bạn nhận DMG chuẩn bằng {HARM}% Max HP, boss mất 6% Max HP; nhiệt và lá chắn boss về 0.\nXả nhiệt giảm 35 nhiệt, nhưng hồi boss tối đa 3% Max HP và thêm một lá chắn (tối đa 2). Khi có lá chắn, boss nhận ít hơn 15% DMG từ bạn.\nQuá tải tăng 35 nhiệt. Cả hai lựa chọn tốn 1 lượt và boss vẫn phản công.",
  assur:
    "Boss chưa thể bị kết liễu khi ấn bảo hộ còn hoạt động. Chọn Sigil có màu được báo trên bảng để tích điểm thanh tẩy.\nĐúng màu: +1 điểm (tối đa 3). Sai màu: bạn nhận DMG chuẩn bằng {HARM}% Max HP; vẫn chuyển sang màu kế tiếp.\nĐủ 3 điểm, dùng Purify: tiêu thụ cả 3 điểm, boss không phản công lượt đó; ấn tắt trong {AMOUNT} lượt kế tiếp.\nTấn công/Skill trong lúc ấn tắt để kết liễu. Chạm màu và Purify đều tốn 1 lượt.",
  control:
    "Lá chắn giữ boss sống với ít nhất 1 HP. Gây DMG bằng Tấn công/Skill để lấy manh mối loại trừ Alpha, Beta hoặc Gamma.\nHai manh mối loại trừ xác định tần số đúng. Chọn tần số còn lại để tắt lá chắn trong 2 lượt kế tiếp; boss không phản công lượt nhập đúng.\nNhập sai: bạn nhận DMG chuẩn bằng {HARM}% Max HP, thêm một manh mối và boss vẫn phản công.\nNhập tần số tốn 1 lượt. Khi lá chắn tắt, dùng Tấn công/Skill để kết liễu.",
  necrobot:
    "Chọn một bộ phận trong menu rồi dùng Tấn công/Skill để phá. Đổi mục tiêu không tốn lượt, không tự gây DMG.\nPlating (Giáp) tăng DEF boss; Barrier (Khiên phép) tăng RES boss; Weapon (Vũ khí) tăng DMG phản công boss.\nPhá ít nhất 2 trong 3 bộ phận để mở mục tiêu Boss (Core). Sau đó chọn Boss và đánh để kết liễu.\nMỗi bộ phận bị phá làm các bộ phận còn sống mạnh hơn. HP bộ phận nằm trong tổng HP boss; không có thưởng riêng.",
  quov: "Xem nguyên tố của đòn kế tiếp rồi chọn Ward Lửa, Lạnh hoặc Sét tương ứng. Đổi Ward miễn phí, không tốn lượt hoặc MP.\nWard khớp nguyên tố giảm {POWER}% DMG phản công và ghi nhận nguyên tố đã hấp thụ.\nHấp thụ đủ 3 nguyên tố khác nhau: RES boss giảm {AMOUNT} điểm % đến hết trận.\nỞ tầng 700 trở đi, một số đòn có hai nguyên tố; Ward khớp một nguyên tố vẫn bảo vệ bạn.",
  lucion:
    "Đọc biểu tượng mệnh lệnh trên bảng: ◇ chọn Chống lệnh, △ chọn Giả vờ, ○ chọn Phản bội.\nChọn đúng: tăng 1 Ý chí và chặn phản công lượt đó. Đủ 3 Ý chí, lớp vảy boss mở trong 2 lượt kế tiếp để bạn gây DMG đầy đủ và kết liễu.\nKhi lớp vảy chưa mở, boss chỉ nhận 30% DMG từ bạn và luôn còn ít nhất 1 HP.\nChọn sai: bạn nhận DMG chuẩn bằng {HARM}% Max HP, boss hồi tối đa 3% Max HP và vẫn phản công. Mỗi đáp án tốn 1 lượt.",
  bul_kathos:
    "Đọc thế đánh trên bảng rồi chọn đáp án tương ứng: High Cleave → Đỡ cao; Low Sweep → Đỡ thấp; Feint → Không mắc lừa.\nĐáp án đúng làm boss choáng, không phản công lượt chọn và trong 2 lượt kế tiếp.\nMột trong hai đáp án còn lại là hòa: boss mất 2% Max HP; bạn nhận DMG chuẩn bằng {TWO_HARM}% Max HP của bạn. Boss vẫn phản công. Đáp án thua khiến phản công boss chắc chắn CRIT.\nMỗi đáp án tốn 1 lượt. Không có phạt chỉ vì bạn dùng Tấn công/Skill liên tiếp.",
  giyua:
    "Mỗi Tổ đang còn tăng {POWER}% DMG boss, tối đa {CAP} Tổ. Boss sinh thêm một Tổ mỗi {CYCLE} lượt nếu không bị phong ấn.\nPhá Nest xóa một Tổ. Phong ấn Nest xóa một Tổ và ngăn sinh Tổ trong {CYCLE} lượt.\nKhai thác Nest hồi tối đa 4% Max HP và +1 MP cho bạn; lượt kế tiếp phải gây DMG bằng Tấn công/Skill, nếu không boss thêm một Tổ.\nXử lý Tổ tốn 1 lượt và boss vẫn phản công. Tấn công/Skill thường luôn đánh boss.",
  riftwalker:
    "Mỗi Tấn công, Skill, Phòng thủ hoặc dùng bình để lại một Dư âm, kích hoạt sau 3 lượt.\nDư âm Tấn công/Skill: boss mất HP bằng 15% DMG của đòn cũ, tối đa {POWER}% Max HP của bạn. Bạn nhận DMG chuẩn bằng {ECHO_RATE}% DMG đòn cũ, tối đa {HARM}% Max HP của bạn. Dư âm bình hồi boss tối đa 3% Max HP; Dư âm Phòng thủ giúp boss nhận ít hơn 20% DMG từ bạn trong 2 lượt.\nBẻ Echo xóa đúng Dư âm đã chọn, tốn {COST}% Max HP và 1 lượt; phải còn ít nhất 1 HP, boss vẫn phản công.\nĐọc loại Dư âm và số lượt còn lại trên bảng trước khi chọn.",
  gharbad:
    "Bảng ghi rõ đầu hàng thật hay giả. Khi thật, chọn Chấp nhận hoặc Khám xét; khi giả, chọn Tấn công lời đầu hàng.\nChấp nhận đúng hồi tối đa 5% Max HP và +1 MP cho bạn. Khám xét đúng chặn phản công. Tấn công lời đầu hàng giả làm boss mất 4% Max HP và chặn phản công.\nChọn sai: bạn nhận DMG chuẩn bằng {HARM}% Max HP và boss vẫn phản công; Chấp nhận sai còn hồi boss tối đa 3% Max HP.\nMỗi lựa chọn tốn 1 lượt. Dấu hiệu đổi sau khi bạn xử lý lời đầu hàng.",
  phoboss:
    "Mỗi điểm Mộng tăng {POWER}% DMG Tấn công/Skill của bạn và DMG boss. Mộng tăng một điểm mỗi {CYCLE} lượt, tối đa 5.\nThức tỉnh giảm 2 điểm Mộng, tốn {COST}% HP hiện tại và 1 lượt; phải còn ít nhất 1 HP, boss vẫn phản công.\nKhi Mộng từ 4 trở lên, Skill bị khóa ở những lượt được cảnh báo trên bảng.\nSkill không tự giảm điểm Mộng.",
  anomaly:
    "Boss đổi dạng Matter (Vật chất), Energy (Năng lượng), Void (Hư không) sau mỗi lượt. Chọn Ổn định đúng dạng hiện tại trên bảng.\nĐúng dạng: nhận một mảnh của dạng đó nếu chưa có, chặn phản công lượt chọn. Sai dạng: bạn nhận DMG chuẩn bằng {HARM}% Max HP; boss đổi dạng lệch lịch và vẫn phản công.\nCó đủ 3 mảnh khác nhau, chọn Overload: tiêu thụ mảnh, boss không phản công lượt đó; DEF/RES boss về 0 trong 2 lượt kế tiếp.\nỔn định và Overload đều tốn 1 lượt. Mảnh chỉ dùng trong trận, không phải vật phẩm.",
  zakarum:
    "Boss có 3 Halo: Might tăng DMG boss; Sanctuary hồi boss; Haste tăng DEF boss vào các lượt của nó.\nChọn Cướp Halo để xóa hiệu ứng đó của boss. Những Halo còn lại mạnh hơn trong 2 lượt sau khi cướp.\nMảnh cướp giữ đến hết trận: Might tăng 10% DMG của bạn; Sanctuary tăng 5 điểm % RES của bạn và giảm 10 điểm % RES boss; Haste tăng 3 điểm % CRIT của bạn, chịu trần CRIT.\nMỗi lần cướp tốn 1 lượt và boss vẫn phản công.",
  justicar:
    "Trước mỗi nhóm 3 lượt chiến đấu, phải chọn Steel, Arcane hoặc Silence trong menu. Chọn không tốn lượt.\nSteel tăng {POWER}% DMG vật lý và giảm 15% DMG phép của cả bạn và boss. Arcane tăng {POWER}% DMG phép và giảm 15% DMG vật lý của cả hai.\nSilence khóa Skill của bạn, đổi lại giảm 35% DMG boss trong 3 lượt.\nĐọc lịch loại đòn boss được báo trên bảng trước khi chọn.",
  uldyssian:
    "Boss nhớ từng nhóm 4 hành động Tấn công, Skill, Phòng thủ hoặc bình của bạn. Loại xuất hiện nhiều nhất quyết định Bản sao; nếu hòa, loại xuất hiện trước được ưu tiên.\nBản sao Tấn công tăng {POWER}% DMG boss; Skill khiến boss đánh phép và hút 1 MP của bạn mỗi lượt; Phòng thủ giảm 20% DMG bạn gây lên boss; bình hồi boss tối đa 2% Max HP mỗi lượt.\nXóa ký ức thay một hành động đã ghi bằng ô trống, tốn 1 MP và 1 lượt; boss vẫn phản công.\nCác lựa chọn riêng của boss không được thêm vào nhóm 4 hành động.",
  lazarus:
    "Chọn Restoration, Tremor, Drain hoặc Boss trong menu rồi dùng Tấn công/Skill. Đổi mục tiêu không tốn lượt.\nRestoration hồi boss tối đa {POWER}% Max HP mỗi lượt. Mỗi {CYCLE} lượt, Tremor gây DMG chuẩn bằng {HARM}% Max HP lên bạn và Drain hút 1 MP của bạn nếu chúng còn sống.\nMỗi {CYCLE} lượt, boss có thể hồi sinh Totem vừa bị phá gần nhất nếu còn lượng hồi phục cho phép.\nBạn được đánh Boss bất cứ lúc nào; phá Totem nguy hiểm trước để giảm áp lực.",
  xazax:
    "Boss thêm một Portal mỗi {CYCLE} lượt, tối đa {CAP}. Mỗi Portal tăng {POWER}% DMG boss.\nĐóng Portal xóa một cổng, không có chi phí riêng. Chiếm Portal xóa một cổng và làm boss mất 4% Max HP, bỏ qua RES.\nBước vào Portal xóa một cổng và chặn phản công lượt đó; RES của bạn giảm 10 điểm % trong 2 lượt kế tiếp.\nMỗi lựa chọn tốn 1 lượt; Đóng/Chiếm vẫn có phản công. Skill không tự đóng cổng.",
  samael:
    "Boss thêm một điểm sáng mỗi {CYCLE} lượt, tối đa 5. Đủ 5 điểm: đòn boss mạnh hơn, bạn nhận thêm DMG chuẩn bằng {HARM}% Max HP cuối lượt, rồi điểm sáng về 0.\nDập ấn xóa một điểm, tốn 1 MP. Cướp ấn xóa một điểm nhưng bạn nhận DMG chuẩn bằng {FIVE_HARM}% Max HP.\nMỗi điểm đã cướp tăng 5% DMG của bạn đến hết trận, tối đa 5 điểm.\nDập/Cướp đều tốn 1 lượt và boss vẫn phản công. Xử lý trước khi đủ 5 điểm.",
  death_projector:
    "Xem vùng A/B/C đang bị tia quét. Đứng ở vùng khác để không nhận tia; tại vùng an toàn có thể Tấn công/Skill.\nChọn Sang A/B/C tốn 1 lượt. Không có phản công thường khi di chuyển, nhưng bạn vẫn nhận tia nếu đến vùng đang bị quét.\nVùng bị quét được ghi trên bảng trước khi bạn hành động. Run cũ đổi hướng theo chu kỳ A→B→C; ở độ khó III tiến hai vùng mỗi lần.",
  akarat:
    "Phải hạ cả 3 Apostle mới mở mục tiêu Boss. Chọn mục tiêu trong menu miễn lượt, rồi dùng Tấn công/Skill để đánh.\nMercy hồi boss tối đa 2% Max HP mỗi {CYCLE} lượt; Wrath tăng {POWER}% DMG boss; Faith tăng 10 điểm % RES boss và giảm 10% DMG bạn gây lên boss.\nHiệu ứng của Apostle bị hạ cuối cùng sẽ còn đến hết trận. Chọn thứ tự hạ để quyết định hiệu ứng phải chịu khi đánh Boss.\nHP các Apostle nằm trong tổng HP; hạ từng Apostle không nhận thưởng riêng.",
  buyard:
    "Giữ nhiệt trong khoảng 40–70: DMG của bạn lên boss +20%. Dưới 40, DMG của bạn giảm 40%.\nTrên 70: cuối mỗi lượt bạn nhận DMG chuẩn bằng {HARM}% Max HP, boss mất 2% Max HP.\nThu hẹp vòng tăng {AMOUNT} nhiệt; Mở rộng vòng giảm {AMOUNT} nhiệt. Mỗi lựa chọn tốn 1 lượt và boss vẫn phản công.\nBoss tự tăng 10 nhiệt mỗi {CYCLE} lượt; nhiệt giới hạn 0–100.",
  bartuc:
    "Khi liên kết còn nối, 35% DMG bạn gây ra được giữ ở Golem thay vì trừ HP boss. Mỗi lượt Golem tăng một mức, tối đa {CAP}; mỗi mức tăng {POWER}% DMG boss.\nCắt liên kết tốn {COST}% HP hiện tại và 1 lượt; bạn phải còn ít nhất 1 HP, boss vẫn phản công.\nKhi cắt, toàn bộ DMG đã giữ được trừ vào HP boss; DMG của bạn lên boss tăng 20% trong 2 lượt kế tiếp.\nGolem không cho vật phẩm hoặc payout riêng.",
  jitan:
    "Bảng báo Cổng ◇, △ hoặc ○ đang đúng. Chọn cổng tương ứng để mở đường đánh boss trong {AMOUNT} lượt kế tiếp; boss không phản công lượt mở đúng.\nKhi cổng chưa mở, boss nhận 0 DMG từ Tấn công/Skill của bạn.\nChọn sai: thêm một Tháp canh (tối đa 3), bạn nhận DMG chuẩn bằng {HARM}% Max HP và boss vẫn phản công. Mỗi Tháp canh tăng {POWER}% DMG boss.\nChọn cổng tốn 1 lượt, không tốn MP; dấu hiệu đổi mỗi {CYCLE} lượt.",
  greater_riftwalker:
    "Bão xanh: Gần an toàn. Bão đỏ: Xa an toàn. Xem màu bão và số lượt còn lại trên bảng.\nChọn Đổi vị trí để chuyển Gần/Xa, tốn 1 lượt; boss không đánh thường khi di chuyển.\nBão đến mỗi {CYCLE} lượt và đổi màu cho đợt sau. Đứng sai vị trí lúc bão đến vẫn nhận sát thương bão, kể cả vừa di chuyển.\nPhòng thủ không thay thế việc đứng đúng vị trí.",
  athulua:
    "Xem vùng Trái/Giữa/Phải đang bị ngắm trước khi hành động. Đứng đúng vùng bị ngắm khiến đòn boss mạnh hơn; vùng ngắm dịch sau mỗi đòn bạn gây DMG.\nỞ Giữa, DMG boss lên bạn tăng thêm 15%. Chọn vùng khác để giảm nguy hiểm.\nSang Trái/Giữa/Phải tốn 1 lượt; di chuyển vẫn xử lý đòn mũi tên tại vùng bạn đến.\nTừ tầng 700, Sky Siege khóa một vùng trong 2 lượt theo lịch công bố; không thể chọn vùng đang bị khóa.",
  lilith:
    "Hiến 5%, 10% hoặc 20% Max HP để tăng DMG của bạn trong 1, 2 hoặc 3 lượt kế tiếp.\nHP đã hiến không thể hồi lại khi hiệu ứng còn; phải còn ít nhất 1 HP sau chi phí. Hiến máu tốn 1 lượt và boss vẫn phản công.\nCó thể đánh bình thường nếu không muốn hiến.",
  nemesis:
    "Tránh lặp cùng một cặp hành động: ví dụ Tấn công → Skill → Tấn công → Skill.\nKhi lặp cặp, phản công boss dùng DMG bạn vừa gây lên boss (có trần theo sức mạnh boss); hành động đầu của cặp bị khóa trong 2 lượt kế tiếp.\nĐổi một hành động trong cặp để tránh bị sao chép. Xem hành động đang khóa và số lượt còn lại trên bảng.",
  azmodan:
    "Ấn máu nổ sau 3 lượt. Phản ấn tốn 1 MP: lần nổ sắp tới làm boss mất 5% Max HP thay vì gây hại cho bạn.\nDập lửa dùng đúng 1 bình để đặt lại thời gian nổ về 3 lượt, không hồi HP.\nBỏ mặc: bạn nhận DMG chuẩn bằng {HARM}% Max HP khi ấn nổ. Phản ấn và Dập lửa đều tốn 1 lượt, boss vẫn phản công.",
  dark_star_dragon:
    "Xem số lượt còn lại trước tia lớn. Đến lượt bắn, chọn Nấp trụ còn độ bền để chặn tia.\nNấp tốn 1 lượt; trụ chặn tia mất 1 độ bền. Trụ hết độ bền không thể chọn; phải nấp lại ở lần bắn sau.\nTia lớn đến mỗi {CYCLE} lượt. Ngoài lượt bắn tia, boss vẫn phản công thường.",
  juris_khan:
    "Vị trí 0–3: càng tiến gần boss, DMG của cả bạn và boss càng tăng. Mỗi mức vị trí tăng {POWER}% DMG của mỗi bên.\nTiến/Lùi thay đổi đúng một mức và tốn 1 lượt; boss vẫn phản công.\nĐứng yên 3 lượt liên tiếp tăng thêm {POWER}% DMG boss. Di chuyển đặt lại số lượt đứng yên.",
  manoruk:
    "Chọn Commander, Ritualist hoặc Vanguard trong menu rồi dùng Tấn công/Skill; đổi mục tiêu không tốn lượt.\nCommander tăng DMG boss; Ritualist có thể hồi sinh một lính bị hạ trong mỗi đợt; Vanguard tăng DEF boss.\nPhải hạ hết lính trong cả 2 đợt mới chọn được Boss (Core). Hết đợt đầu, đợt sau tự xuất hiện.\nHP cả hai đợt nằm trong tổng HP boss; hạ lính hoặc qua đợt không nhận thưởng riêng.",
  baal: "Boss luân phiên Defile, Inferno, Visions mỗi {CYCLE} lượt. Defile thêm điểm Ô nhiễm, mỗi điểm tăng {POWER}% DMG boss, tối đa {CAP} điểm.\nInferno lấy tối đa {DRAIN} MP của bạn. Visions có thể giảm 30% DEF của bạn, giảm 15 điểm % RES, hoặc đưa CRIT của bạn về 0 đồng thời giảm 15% DMG phép của bạn.\nChọn Thanh tẩy đúng hiệu ứng để gỡ nó: tốn 1 điểm Thanh tẩy và 1 lượt; boss vẫn phản công. Thanh tẩy Inferno hoàn phần MP đã bị lấy.\nBắt đầu có 1 điểm Thanh tẩy, tối đa 3. Gây DMG tích lũy bằng 15% Max HP boss để hồi một điểm.",
  belial:
    "Xem số và biểu tượng của bóng thật trên bảng: bóng 1 ◇, bóng 2 △, bóng 3 ○. Chọn Đánh bóng tương ứng.\nChọn đúng: boss không phản công lượt đó và lộ diện trong 2 lượt kế tiếp. Dùng Tấn công/Skill khi boss đang lộ để kết liễu.\nChọn sai: bạn nhận DMG chuẩn bằng {HARM}% Max HP, thêm một điểm Lừa dối (tối đa 5); mỗi điểm tăng {POWER}% DMG boss. Boss vẫn phản công.\nMỗi lựa chọn tốn 1 lượt; khi chưa lộ, boss luôn còn ít nhất 1 HP.",
  astrogha:
    "Chọn Totem hoặc Boss trong menu miễn lượt, rồi dùng Tấn công/Skill. Venom tăng DMG boss; Web khóa việc di chuyển; Brood hồi boss.\nPhá Totem không xóa hiệu ứng ngay: hiệu ứng chuyển sang boss trong 2 lượt. Venom vẫn tăng DMG; Web vẫn khóa vị trí; Brood giúp boss hồi 10% DMG thực gây lên bạn.\nỞ Giữa, DMG của bạn +10%. Ở Trái/Phải, DMG của bạn và boss đều giảm 10%.\nHP Totem nằm trong tổng HP boss; không có thưởng riêng khi phá.",
  atanna:
    "Bảng báo thứ tự 3 giấc: Đòn mạnh, Hút MP hoặc Hồi boss. Mỗi lượt xử lý giấc đang được đánh dấu kế tiếp.\nĐòn mạnh tăng {DOUBLE_POWER}% DMG boss. Hút MP lấy 1 MP của bạn. Hồi boss hồi tối đa 3% Max HP boss, vẫn có phản công thường.\nTrong mỗi nhóm 3 lượt, được Xóa giấc một lần. Xóa tốn 1 lượt; giấc đến trong lượt chọn vẫn xảy ra nếu bạn xóa một giấc khác.\nGiấc đã xóa không có phản công hoặc hiệu ứng ở lượt của nó; chuỗi mới sẽ bổ sung giấc sau 3 lượt.",
  inarius:
    "Chọn Kéo Inarius vào Ritual để đưa Inarius và Lilith vào vòng và mở lá chắn boss trong 2 lượt kế tiếp. Kéo tốn 1 lượt; boss vẫn phản công.\nChe chở hồi Lilith 15 HP và bảo vệ cô ấy trong lượt chọn cùng 2 lượt kế tiếp; tốn 1 lượt, boss vẫn phản công.\nLilith có thanh HP riêng 0–100; khi không được bảo vệ, mất {POWER} HP mỗi lượt. Lilith về 0 HP khiến bạn thua run dù nhân vật còn sống.\nVòng Ritual và Inarius dịch vị trí mỗi {CYCLE} lượt. Quan sát vị trí và HP Lilith trước khi đánh.",
  sescheron:
    "Mã gồm 3 biểu tượng ◇/△/○. Mỗi hit Tấn công/Skill gây DMG mở thêm một ô manh mối; cần biết đủ 3 ô rồi nhập theo đúng thứ tự.\nMỗi lần nhập một biểu tượng tốn 1 lượt. Đúng đủ 3 ô: boss không phản công lượt hoàn thành, không phản công trong 2 lượt kế tiếp và điểm Cuồng nộ về 0.\nNhập sai bộ 3: bạn nhận DMG chuẩn bằng {HARM}% Max HP, thêm một điểm Cuồng nộ (tối đa 5); mỗi điểm tăng {POWER}% DMG boss.\nSau mỗi bộ 3 đã nhập, mã đổi thứ tự và manh mối được xóa; gây DMG để đọc mã mới.",
  nithogur:
    "Neo thời gian lưu HP/MP hiện tại của bạn và HP hiện tại boss. Tua thời gian khôi phục cả ba giá trị đó, vì vậy boss cũng có thể hồi HP.\nMỗi trận chỉ Neo một lần và Tua một lần. Mỗi lựa chọn tốn 1 lượt và boss vẫn phản công.\nTua không hoàn bình/vật phẩm đã dùng, không lùi số lượt hoặc mức Cuồng nộ.\nMỗi lượt tăng một mức Cuồng nộ, tối đa {CAP}; mỗi mức tăng {POWER}% DMG boss.",
  kabraxis:
    "Vào trận tầng 666 sẽ khóa Rút thưởng. Boss có một thanh HP: Phase 1 trên 66,7%; Phase 2 từ 33,3% đến 66,7%; Phase 3 ở 33,3% trở xuống.\nTích Điểm cộng hưởng theo ấn đã chọn ở tầng 333: War gây DMG +1, CRIT thêm +1 (tối đa 2/lượt); Protection sống qua phản công +1, giảm/chặn ít nhất 40% DMG dự báo thêm +1; Arcane có tiêu hoặc hồi MP +1/lượt.\nBoss tạo Ấn nguyền mỗi 3 lượt ở Phase 1 hoặc mỗi 2 lượt ở Phase 2, tối đa 5. Thanh tẩy một Ấn tốn 3 Điểm cộng hưởng; Phá ấn không tốn điểm. Cả hai tốn 1 lượt và chặn phản công lượt đó. Có thể tiếp tục đánh khi có Ấn chờ.\nPhase 3 khóa kết quả: mỗi Ấn đã thanh tẩy tăng 5% DMG của bạn; mỗi Ấn đã phá tăng 5% DMG boss. Ấn chưa xử lý bị tính là đã phá.\nHậu quả Ấn đã phá theo lựa chọn: War thêm 3 điểm % CRIT boss/ấn; Protection giảm 5 điểm % RES của bạn/ấn; Arcane giảm 1 Max MP hiệu dụng của bạn/ấn (ít nhất 2).\nỞ Phase 2, mỗi 2 lượt: War có phản công chắc chắn CRIT; Protection đánh phép và giảm 10 điểm % RES của bạn; Arcane lấy 1 MP của bạn.",
  deimoss:
    "Boss có 3 thanh HP nối tiếp, tương ứng 30%/30%/40% tổng HP. DMG dư không chuyển sang mục tiêu hoặc thanh kế; đổi phase không có phản công.\nPhase 1: chọn trụ miễn lượt rồi dùng Tấn công/Skill. Ruin tăng 15% DMG vật lý boss; Silence thêm 1 MP vào chi phí Skill của bạn ở lượt tác động (không vượt Max MP); Hunger hồi boss 12% DMG thực gây lên bạn. Phá trụ để gỡ hiệu ứng.\nPhase 2: khi HP boss xuống 75%, 50%, 25%, phải xử lý một Lõi thịt trước khi đánh tiếp. Thiêu tốn 1 MP; Cấy nhận +8 STR/ENE/VIT đã ghi cùng lời nguyền; Bỏ mặc hồi boss tối đa 2,5% Max HP mỗi lượt trong 2 lượt. Chọn xử lý không tốn lượt.\nLời nguyền do Cấy có thể là DMG bạn nhận +5%, Skill của bạn trả thêm 1% Max HP hoặc hồi HP của bạn giảm 15%; từng lõi báo rõ trước khi chọn.\nPhase 3: chọn không gian miễn lượt, giữ 3 lượt chiến đấu. Material: DMG vật lý của cả bạn và boss +25%, phép −25%; Arcane ngược lại.\nVoid: DMG của bạn +15%; DEF của bạn và boss giảm 25%, RES của cả hai giảm 20 điểm %; bạn không được hồi HP. Hạ hết thanh Phase 3 mới nhận thưởng.",
};

const GOALS = {
  "butcher": "Giãn khoảng cách để hạn chế Cuồng nộ rồi hạ Butcher.",
  "machine": "Kiểm soát nhiệt để tăng sát thương và tránh quá tải.",
  "assur": "Thanh tẩy ấn bảo hộ rồi kết liễu Assur khi ấn tắt.",
  "control": "Tìm đúng tần số để tắt lá chắn và kết liễu boss.",
  "necrobot": "Phá ít nhất hai bộ phận, chọn lõi rồi hạ boss.",
  "quov": "Dùng Ward đúng nguyên tố để giảm sát thương nhận và hạ boss.",
  "lucion": "Trả lời đúng mệnh lệnh để mở lớp vảy và kết liễu boss.",
  "bul_kathos": "Đỡ đúng thế đánh để làm boss choáng rồi tấn công.",
  "giyua": "Kiểm soát số Tổ để hạn chế sức mạnh boss.",
  "riftwalker": "Theo dõi Dư âm, xử lý những Dư âm nguy hiểm rồi hạ boss.",
  "gharbad": "Nhận biết đầu hàng thật/giả và chọn đúng cách xử lý.",
  "phoboss": "Cân bằng lợi thế sát thương và nguy hiểm từ Mộng.",
  "anomaly": "Thu thập ba mảnh, dùng Overload rồi tận dụng lúc boss mất phòng thủ.",
  "zakarum": "Cướp Halo để gỡ sức mạnh boss và nhận hiệu ứng có lợi.",
  "justicar": "Chọn phán quyết phù hợp cho mỗi nhóm ba lượt rồi hạ boss.",
  "uldyssian": "Đổi nhịp hành động để kiểm soát Bản sao boss tạo ra.",
  "lazarus": "Phá Totem nguy hiểm hoặc đánh thẳng boss để kết liễu.",
  "xazax": "Xử lý Portal để hạn chế sức mạnh boss.",
  "samael": "Xử lý điểm sáng trước khi tích đủ năm điểm.",
  "death_projector": "Đứng ngoài vùng tia bắn và hạ boss.",
  "akarat": "Hạ cả ba Apostle rồi kết liễu boss.",
  "buyard": "Giữ nhiệt trong khoảng 40–70 để đánh boss hiệu quả.",
  "bartuc": "Cắt liên kết để giải phóng sát thương bị giữ ở Golem.",
  "jitan": "Chọn đúng cổng để mở đường gây sát thương và kết liễu boss.",
  "greater_riftwalker": "Đứng đúng vị trí khi bão đến rồi hạ boss.",
  "athulua": "Tránh vùng bị ngắm để giảm sát thương nhận.",
  "lilith": "Hạ Lilith; có thể hiến máu để đổi lấy sát thương.",
  "nemesis": "Tránh lặp cặp hành động để không bị boss sao chép.",
  "azmodan": "Xử lý ấn máu trước khi nổ rồi hạ Azmodan.",
  "dark_star_dragon": "Nấp sau trụ khi tia lớn đến rồi tiếp tục đánh boss.",
  "juris_khan": "Chọn vị trí phù hợp để điều chỉnh sát thương hai bên.",
  "manoruk": "Hạ hai đợt lính rồi kết liễu boss.",
  "baal": "Thanh tẩy đúng hiệu ứng đang gây hại rồi hạ Baal.",
  "belial": "Chọn bóng thật, tận dụng lúc Belial lộ diện để kết liễu.",
  "astrogha": "Chọn mục tiêu và vị trí phù hợp để kiểm soát Totem.",
  "atanna": "Đọc chuỗi giấc, xóa giấc nguy hiểm rồi hạ boss.",
  "inarius": "Giữ Lilith sống và hạ Inarius.",
  "sescheron": "Đọc đủ ba biểu tượng, nhập đúng mã để tạo cơ hội tấn công.",
  "nithogur": "Dùng Neo/Tua đúng lúc để sống sót và hạ boss trước khi Cuồng nộ quá cao.",
  "kabraxis": "Tích Điểm cộng hưởng, xử lý Ấn nguyền và hạ Kabraxis qua ba phase.",
  "deimoss": "Phá trụ, xử lý Lõi thịt và hạ cả ba thanh HP."
};
const RULE_LABELS = {
  "butcher": [
    "Khoảng cách",
    "Áp sát",
    "Lùi / Chặt xích",
    "Chi phí lượt"
  ],
  "machine": [
    "Tăng nhiệt",
    "Quá tải",
    "Xả nhiệt",
    "Quá tải chủ động"
  ],
  "assur": [
    "Ấn bảo hộ",
    "Chọn màu",
    "Purify",
    "Kết liễu"
  ],
  "control": [
    "Lá chắn",
    "Tần số đúng",
    "Nhập sai",
    "Kết liễu"
  ],
  "necrobot": [
    "Chọn mục tiêu",
    "Ba bộ phận",
    "Mở lõi",
    "Sau khi phá"
  ],
  "quov": [
    "Đổi Ward",
    "Ward đúng",
    "Đủ ba nguyên tố",
    "Đòn hai nguyên tố"
  ],
  "lucion": [
    "Chọn đáp án",
    "Đáp án đúng",
    "Lớp vảy",
    "Đáp án sai"
  ],
  "bul_kathos": [
    "Thế đánh",
    "Đỡ đúng",
    "Hòa / thua",
    "Chi phí lượt"
  ],
  "giyua": [
    "Tổ quái",
    "Phá / Phong ấn Nest",
    "Khai thác Nest",
    "Chi phí lượt"
  ],
  "riftwalker": [
    "Dư âm",
    "Khi Dư âm kích hoạt",
    "Bẻ Echo",
    "Theo dõi"
  ],
  "gharbad": [
    "Dấu hiệu",
    "Chọn đúng",
    "Chọn sai",
    "Chi phí lượt"
  ],
  "phoboss": [
    "Điểm Mộng",
    "Thức tỉnh",
    "Khóa Skill",
    "Lưu ý"
  ],
  "anomaly": [
    "Đổi dạng",
    "Ổn định",
    "Overload",
    "Chi phí lượt"
  ],
  "zakarum": [
    "Ba Halo",
    "Cướp Halo",
    "Phần thưởng",
    "Chi phí lượt"
  ],
  "justicar": [
    "Chọn phán quyết",
    "Steel / Arcane",
    "Silence",
    "Lịch đòn"
  ],
  "uldyssian": [
    "Ghi nhớ hành động",
    "Bản sao",
    "Xóa ký ức",
    "Lưu ý"
  ],
  "lazarus": [
    "Chọn mục tiêu",
    "Totem còn sống",
    "Hồi sinh Totem",
    "Đánh boss"
  ],
  "xazax": [
    "Sinh Portal",
    "Đóng / Chiếm Portal",
    "Bước vào Portal",
    "Chi phí lượt"
  ],
  "samael": [
    "Điểm sáng",
    "Dập / Cướp ấn",
    "Hiệu ứng cướp",
    "Chi phí lượt"
  ],
  "death_projector": [
    "Vùng tia bắn",
    "Di chuyển",
    "Lịch tia"
  ],
  "akarat": [
    "Mở mục tiêu boss",
    "Ba Apostle",
    "Thứ tự hạ",
    "Phần thưởng"
  ],
  "buyard": [
    "Vùng nhiệt có lợi",
    "Nhiệt quá cao",
    "Điều chỉnh nhiệt",
    "Nhiệt tự tăng"
  ],
  "bartuc": [
    "Liên kết Golem",
    "Cắt liên kết",
    "Giải phóng sát thương",
    "Phần thưởng"
  ],
  "jitan": [
    "Chọn cổng",
    "Khi cổng đóng",
    "Chọn sai",
    "Chi phí lượt"
  ],
  "greater_riftwalker": [
    "Màu bão",
    "Đổi vị trí",
    "Bão đến",
    "Phòng thủ"
  ],
  "athulua": [
    "Vùng bị ngắm",
    "Vị trí Giữa",
    "Di chuyển",
    "Khóa vùng"
  ],
  "nemesis": [
    "Cặp hành động",
    "Khi lặp cặp",
    "Cách tránh"
  ],
  "dark_star_dragon": [
    "Tia lớn",
    "Nấp trụ",
    "Khi không nấp",
    "Phòng thủ"
  ],
  "juris_khan": [
    "Vị trí",
    "Tiến / Lùi",
    "Đứng yên"
  ],
  "manoruk": [
    "Chọn mục tiêu",
    "Ba loại lính",
    "Mở lõi boss",
    "Phần thưởng"
  ],
  "baal": [
    "Chu kỳ",
    "Hiệu ứng",
    "Thanh tẩy",
    "Hồi điểm"
  ],
  "astrogha": [
    "Chọn mục tiêu",
    "Phá Totem",
    "Vị trí",
    "Phần thưởng"
  ],
  "atanna": [
    "Chuỗi giấc",
    "Hiệu ứng giấc",
    "Xóa giấc",
    "Chuỗi mới"
  ],
  "sescheron": [
    "Đọc mã",
    "Nhập đúng",
    "Nhập sai",
    "Mã mới"
  ],
  "nithogur": [
    "Neo / Tua",
    "Giới hạn",
    "Không hoàn lại",
    "Cuồng nộ"
  ],
  "kabraxis": [
    "Ba phase",
    "Điểm cộng hưởng",
    "Xử lý Ấn",
    "Phase 3",
    "Hậu quả Ấn phá",
    "Phase 2"
  ],
  "deimoss": [
    "Ba thanh HP",
    "Phase 1",
    "Phase 2",
    "Nguyền từ lõi",
    "Phase 3",
    "Void"
  ]
};
const MECHANIC_TITLES = {
  butcher: "Khoảng cách và Cuồng nộ",
  machine: "Nhiệt và lá chắn",
  assur: "Chọn màu để gỡ ấn bảo hộ",
  control: "Tần số phá lá chắn",
  necrobot: "Phá bộ phận để mở lõi",
  quov: "Chọn khiên đúng nguyên tố",
  lucion: "Giải mệnh lệnh để phá lớp vảy",
  bul_kathos: "Đỡ đúng thế đánh",
  giyua: "Tổ quái tăng sức mạnh boss",
  riftwalker: "Dư âm hành động",
  gharbad: "Nhận biết đầu hàng thật",
  phoboss: "Mộng tăng sát thương",
  anomaly: "Ổn định ba dạng",
  zakarum: "Cướp hào quang",
  justicar: "Chọn phán quyết cho ba lượt",
  uldyssian: "Bản sao từ hành động của bạn",
  lazarus: "Phá Totem nguy hiểm",
  xazax: "Xử lý cổng triệu hồi",
  samael: "Ngăn tích đủ năm điểm sáng",
  death_projector: "Tránh vùng tia bắn",
  akarat: "Hạ ba Apostle để mở boss",
  buyard: "Giữ nhiệt ở vùng có lợi",
  bartuc: "Cắt liên kết với Golem",
  jitan: "Mở cổng để gây sát thương",
  greater_riftwalker: "Đứng đúng vị trí tránh bão",
  athulua: "Tránh vùng mũi tên ngắm",
  lilith: "Hiến máu để tăng sát thương",
  nemesis: "Tránh lặp cặp hành động",
  azmodan: "Xử lý ấn máu trước khi nổ",
  dark_star_dragon: "Nấp trụ để chặn tia lớn",
  juris_khan: "Di chuyển để điều chỉnh sát thương",
  manoruk: "Hạ hai đợt lính để mở boss",
  baal: "Thanh tẩy hiệu ứng đang gây hại",
  belial: "Chọn bóng thật để kết liễu",
  astrogha: "Phá Totem và chọn vị trí",
  atanna: "Chọn một giấc để xóa",
  inarius: "Giữ Lilith sống và mở kết giới",
  sescheron: "Đọc và nhập đúng ba biểu tượng",
  nithogur: "Neo và tua HP/MP",
  kabraxis: "Tích điểm và xử lý ấn nguyền",
  deimoss: "Ba giai đoạn và ba thanh HP",
};
const STATUS_WORDS = {
  Charge: "Điểm thanh tẩy",
  Sigil: "Sigil (ấn màu)",
  Will: "Ý chí",
  Scales: "Lớp vảy",
  stagger: "choáng",
  Nest: "Tổ",
  Echo: "Dư âm",
  Dream: "Mộng",
  Shard: "Mảnh ổn định",
  Overload: "Quá tải",
  Halo: "Hào quang",
  Timeline: "Lịch hành động",
  Clone: "Bản sao",
  Queue: "Chuỗi giấc",
  Rage: "Cuồng nộ",
  Enrage: "Cuồng nộ",
  Resonance: "Điểm cộng hưởng",
  Purified: "Ấn đã thanh tẩy",
  Broken: "Ấn đã phá",
  "Flesh Core": "Lõi thịt",
  "Flesh Curse": "Nguyền từ lõi thịt",
  curse: "nguyền",
  Plane: "Không gian",
  Shield: "Lá chắn",
  Absorb: "Nguyên tố đã hấp thụ",
  Arrow: "Mũi tên",
  Beam: "Tia",
  Core: "Lõi",
  Spire: "Trụ",
  Hook: "kéo xích",
  Tether: "Liên kết",
  Tower: "Tháp canh",
};
function plainStatus(text) {
  const names = Object.keys(STATUS_WORDS).sort((a, b) => b.length - a.length);
  return text.replace(
    new RegExp("\\b(" + names.join("|") + ")\\b", "g"),
    (word) => STATUS_WORDS[word],
  );
}
function harmRate(x) {
  return Number(
    (
      x.c.power *
      require("../events/explorationMarks").incoming(x.s, x.e) *
      100
    ).toFixed(1),
  );
}
function renderRule(text, x) {
  const percent = (n) => Number((n * 100).toFixed(1));
  const incoming = require("../events/explorationMarks").incoming(x.s, x.e);
  const values = {
    CYCLE: x.c.cycle,
    CAP: x.c.cap,
    POWER: percent(x.c.power),
    DOUBLE_POWER: percent(x.c.power * 2),
    AMOUNT: x.c.amount,
    COST: percent(x.c.amount),
    HARM: percent(x.c.power * incoming),
    TWO_HARM: percent(0.02 * incoming),
    FIVE_HARM: percent(0.05 * incoming),
    ECHO_RATE: percent(0.15 * incoming),
    DRAIN: 1 + (x.b.depth % 2),
  };
  return text.replace(/\{([A-Z_]+)\}/g, (_, key) => String(values[key]));
}

function statText(text) {
  const keys = {
    "Max HP": "hp",
    HP: "hp",
    "Max MP": "mana",
    MP: "mana",
    "DEF/RES": "defres",
    DEF: "defense",
    RES: "res",
    CRIT: "crit",
    DMG: "attack",
    STR: "str",
    DEX: "dex",
    VIT: "vit",
    ENE: "ene",
  };
  return text
    .replace(
      /\b(Max HP|HP|Max MP|MP|DEF\/RES|DEF|RES|CRIT|DMG|STR|DEX|VIT|ENE)\b/gi,
      (label) => {
        const normalized = label.toUpperCase().replace("MAX", "Max");
        return E[keys[normalized]] + " **" + normalized + "**";
      },
    )
    .replaceAll("hai phía", "bạn và boss")
    .replaceAll("Cửa sổ ", "Hiệu ứng kéo dài ");
}
function readableRules(text, x) {
  return renderRule(text, x)
    .split(/\n+/)
    .filter(Boolean)
    .map((line, i) => "- " + (RULE_LABELS[x.b.id]?.[i] ? "**" + RULE_LABELS[x.b.id][i] + ":** " : "") + statText(line))
    .join("\n");
}

function status(s) {
  const x = mech.current(s),
    { b, m, c, e } = x;
  const names = ["Alpha", "Beta", "Gamma"],
    active = mech.isOpen(x),
    pattern = m.pattern;
  let text = "";
  switch (b.id) {
    case "butcher":
      text =
        "Khoảng cách " +
        m.distance +
        "/2 · Bloodlust " +
        m.stack +
        "/" +
        c.cap +
        " · Hook sau " +
        (c.cycle - (b.round % c.cycle)) +
        " lượt. Lùi hoặc chặt xích trước Hook.";
      break;
    case "machine":
      text =
        "Nhiệt " +
        m.heat +
        "/100 · Shield " +
        m.shield +
        "/2 · ⚠ 100 nhiệt: bạn −" +
        Math.round(c.power * 100) +
        "% Max HP. Giữ 70–99 hoặc Xả.";
      break;
    case "assur":
      text = active
        ? "Ấn đã tắt: dùng Tấn công/Skill để kết liễu."
        : "Điểm thanh tẩy " +
          m.charges +
          "/3. " +
          (m.charges >= 3
            ? "Chọn Purify để gỡ ấn."
            : "Chọn **Sigil " +
              (pattern[m.cursor % 3] + 1) +
              " · " +
              colors[pattern[m.cursor % 3]] +
              "** theo màu kế tiếp.") +
          "\nBoss chưa thể bị kết liễu khi ấn còn bật.";
      break;
    case "control":
      text = active
        ? "Lá chắn đã tắt: dùng Tấn công/Skill để kết liễu."
        : m.hints >= 2
          ? "Tần số đúng: **" +
            names[pattern[m.cursor % 3]] +
            "**. Chọn tần số này để tắt lá chắn."
          : "Lá chắn còn bật: boss luôn còn ít nhất 1 HP.\n" +
            (m.hints
              ? "Đã loại **" +
                pattern
                  .filter((n) => n !== pattern[m.cursor % 3])
                  .slice(0, m.hints)
                  .map((n) => names[n])
                  .join(", ") +
                "**; gây DMG để lấy manh mối còn lại."
              : "Gây DMG bằng Tấn công/Skill để lấy manh mối loại trừ tần số.");
      break;
    case "necrobot":
      text =
        "Mục tiêu: **" +
        (m.target === "boss" ? "Boss (Core)" : m.target) +
        "** · đã phá **" +
        (3 - mech.aliveUnits(x).length) +
        "/3** bộ phận.\n" +
        "Plating: DEF boss ↑ · Barrier: RES boss ↑ · Weapon: DMG phản công boss ↑.\n" +
        (mech.aliveUnits(x).length <= 1
          ? "Core đã mở: có thể chọn Boss để kết liễu."
          : "Phá 2 bộ phận để mở Core; chọn mục tiêu không tốn lượt.");
      break;
    case "akarat":
      text =
        "Boss bất tử tới khi hạ cả ba Apostle. Buff cuối theo Apostle hạ cuối: " +
        (m.killOrder.at(-1) || "chưa có") +
        ". Chọn thứ tự giảm heal/DMG/Shield.";
      break;
    case "manoruk":
      text =
        "Commander tăng DMG · Ritualist hồi sinh 1 lính/wave · Vanguard che chắn. Chọn mục tiêu; hết wave mới mở Core.";
      break;
    case "lazarus":
      text =
        "Restoration hồi boss · Tremor gây DMG chuẩn · Drain hút MP. Totem vừa phá có thể hồi sinh sau " +
        (c.cycle - (b.round % c.cycle)) +
        " lượt; chọn Totem nguy hiểm.";
      break;
    case "astrogha":
      text =
        "Vị trí " +
        ["Trái", "Giữa", "Phải"][m.zone] +
        " · " +
        (m.targets.Web.hp > 0
          ? "Web giữ vị trí; phá Web để di chuyển."
          : m.transfers.Web > b.round
            ? "Web còn khóa " + (m.transfers.Web - b.round) + " lượt."
            : "Có thể di chuyển: Giữa tăng DMG; hai bên an toàn hơn.") +
        " Brood hồi boss, Venom tăng độc.";
      break;
    case "quov":
      text =
        "Đòn kế " +
        mech
          .elementPlan(x)
          .map((n) => colors[n])
          .join(" + ") +
        " · Ward " +
        (m.ward == null ? "chưa chọn" : colors[m.ward]) +
        " · Đã hấp thụ " +
        m.absorbs.length +
        "/3. Đổi Ward trước đánh.";
      break;
    case "lucion":
      text = active
        ? "Lớp vảy đã mở: Tấn công/Skill gây DMG đầy đủ và có thể kết liễu."
        : "Ý chí " +
          m.will +
          "/3. Biểu tượng **" +
          labels[pattern[b.round % 3]] +
          "** → chọn **" +
          ["Chống lệnh", "Giả vờ", "Phản bội"][pattern[b.round % 3]] +
          "**.\nChọn đúng chặn phản công; đủ 3 Ý chí mở lớp vảy.";
      break;
    case "bul_kathos":
      text =
        "Thế đánh: **" +
        ["Chém cao", "Quét thấp", "Đòn nhử"][pattern[b.round % 3]] +
        "** → chọn **" +
        ["Đỡ cao", "Đỡ thấp", "Không mắc lừa"][pattern[b.round % 3]] +
        "**.\n" +
        (m.staggerUntil > b.round
          ? "Boss đang choáng, không phản công."
          : "Chọn đúng làm boss choáng 2 lượt; đáp án thua khiến boss CRIT.");
      break;
    case "giyua":
      text =
        "Nest " +
        m.nests +
        "/" +
        c.cap +
        " · Sinh tổ sau " +
        (c.cycle - (b.round % c.cycle)) +
        " lượt. Phá/phong ấn giảm nguy hiểm; khai thác phải gây DMG lượt sau.";
      break;
    case "riftwalker":
      text =
        "Echo: " +
        (m.echoes
          .map(
            (v) =>
              (actNames[v.action] || v.action) +
              " trong " +
              (v.due - b.round) +
              " lượt",
          )
          .join(" · ") || "trống") +
        ". Bẻ Echo để xóa hiệu ứng sắp đến (tốn HP và 1 lượt).";
      break;
    case "gharbad": {
      const signs = ["🔷 Hình thoi (◇)", "🔺 Tam giác (△)", "⚪ Hình tròn (○)"];
      const genuine = m.sign === m.surrenderRule;
      text =
        "**Dấu hiện tại: " +
        signs[m.sign] +
        " — " +
        (genuine ? "✅ Đầu hàng thật" : "❌ Đầu hàng giả") +
        "**\n" +
        (genuine
          ? "Chọn **Chấp nhận** hoặc **Khám xét**."
          : "Chọn **Tấn công lời đầu hàng**.") +
        "\nDấu thật suốt trận: **" +
        signs[m.surrenderRule] +
        "**.";
      break;
    }
    case "phoboss":
      text =
        "Dream " +
        m.dream +
        "/5 · DMG hai phía +" +
        Math.round(m.dream * c.power * 100) +
        "%" +
        (m.dream >= 4 && b.round % 2 ? " · Skill khóa lượt này" : "") +
        ". Thức tỉnh giảm 2.";
      break;
    case "anomaly":
      text = active
        ? "Boss đang Quá tải: DEF/RES về 0. Dùng Tấn công/Skill."
        : "Dạng hiện tại: **" +
          ["Matter", "Energy", "Void"][b.phase - 1] +
          "** → chọn **Ổn định " +
          ["Matter", "Energy", "Void"][b.phase - 1] +
          "**.\nMảnh đã có: " +
          m.shards.length +
          "/3" +
          (m.shards.length === 3
            ? " · Chọn Overload để đưa DEF/RES boss về 0 trong 2 lượt."
            : " · Thu đủ cả ba dạng để mở Overload.");
      break;
    case "zakarum":
      text =
        "Halo còn: " +
        m.halos.join(", ") +
        " · đã cướp " +
        (m.stolenHalos.join(", ") || "chưa có") +
        ". Cướp một Halo để gỡ buff đó; Halo còn lại mạnh hơn 2 lượt.";
      break;
    case "justicar":
      text =
        "Phán quyết " +
        (m.verdictTurns > 0
          ? ["Steel", "Arcane", "Silence"][m.verdict] +
            " · " +
            m.verdictTurns +
            " lượt"
          : "bắt buộc chọn") +
        " · 3 đòn kế: " +
        [0, 1, 2]
          .map((i) => ((b.round + i) % 2 ? "Phép" : "Vật lý"))
          .join(" → ");
      break;
    case "uldyssian":
      text =
        "Ký ức: " +
        m.timeline.map((a) => actNames[a]).join(" → ") +
        " · Clone " +
        (actNames[m.clone] || "chưa có") +
        ". Viết lại ô để đổi loại Clone.";
      break;
    case "xazax":
      text =
        "Portal " +
        m.portals +
        "/" +
        c.cap +
        " · Đóng/chiếm/bước vào; curse khi bước vào: RES −10 hai lượt.";
      break;
    case "samael":
      text =
        "Điểm sáng " +
        m.lights +
        "/5 · Ấn cướp " +
        (m.stolen || 0) +
        " · " +
        (m.lights === 5
          ? "⚠ Pentagram lượt này: burst " +
            Math.round(c.power * 100) +
            "% Max HP."
          : "Điểm kế sau " + (c.cycle - (b.round % c.cycle)) + " lượt.") +
        " Dập/cướp trước đủ 5.";
      break;
    case "death_projector":
      text =
        "Ở " +
        ["A", "B", "C"][m.zone] +
        " · ⚠ Tia vào " +
        ["A", "B", "C"][mech.beamZone(x)] +
        " lượt này; đổi hướng sau " +
        (mech.beamCycle(x) - (b.round % mech.beamCycle(x))) +
        (mech.randomBeam(x)
          ? " lượt; hướng tiếp theo chọn ngẫu nhiên"
          : " lượt, kế " + ["A", "B", "C"][(mech.beamZone(x) + c.amount) % 3]) +
        ". Chuyển khỏi vùng bị quét.";
      break;
    case "buyard":
      text =
        "Nhiệt " +
        m.heat +
        "/100 · " +
        (m.heat < 40
          ? "Shield"
          : m.heat <= 70
            ? "Điểm yếu"
            : "⚠ Thiêu cả hai") +
        "; tăng/giảm " +
        c.amount +
        ". Giữ 40–70 để DMG của bạn +20%.";
      break;
    case "bartuc":
      text =
        "Tether " +
        (m.tether ? "đang nối" : "đã cắt") +
        " · Golem " +
        m.golem +
        "/" +
        c.cap +
        " · DMG sẽ trừ vào boss khi cắt: " +
        m.golemDamage +
        ". Cắt khi đủ HP.";
      break;
    case "jitan":
      text = active
        ? "Cổng đang mở: dùng Tấn công/Skill để gây DMG lên boss."
        : "Cổng đúng: **" +
          labels[pattern[Math.floor(b.round / c.cycle) % 3]] +
          "** → chọn cổng này để mở đường đánh.\nChưa mở cổng: boss nhận 0 DMG. Tháp canh " +
          m.towers +
          "/3 tăng DMG boss.";
      break;
    case "greater_riftwalker":
      text =
        "Đang " +
        (m.near ? "Gần" : "Xa") +
        " · ⚠ Bão " +
        (mech.stormNear(x) ? "xanh (Gần an toàn)" : "đỏ (Xa an toàn)") +
        " sau " +
        (c.cycle - (b.round % c.cycle)) +
        " lượt; kế đổi màu.";
      break;
    case "athulua":
      text =
        "Ở " +
        ["Trái", "Giữa", "Phải"][m.zone] +
        " · Arrow " +
        ["Trái", "Giữa", "Phải"][mech.arrowZone(x)] +
        " → " +
        ["Trái", "Giữa", "Phải"][(mech.arrowZone(x) + 1) % 3] +
        (mech.dec.blockedZone(x) != null
          ? " · ⚠ Sky Siege: " +
            ["Trái", "Giữa", "Phải"][mech.dec.blockedZone(x)]
          : "") +
        (b.depth === 3 && b.round % c.cycle === c.cycle - 1
          ? " · ⚠ Cuối lượt này Sky Siege khóa " +
            ["Trái", "Giữa", "Phải"][
              m.pattern[Math.floor(b.round / c.cycle) % 3]
            ] +
            " trong 2 lượt."
          : "") +
        ". Đổi vùng nếu bị khóa.";
      break;
    case "lilith":
      text =
        m.bargain > 0
          ? E.attack +
            " **DMG của bạn +" +
            Math.round(m.bargainBonus * 100) +
            "%** · còn **" +
            m.bargain +
            " lượt**.\n" +
            E.hp +
            " Chỉ hồi đến **" +
            Math.max(0, s.maxHp - m.healDebt) +
            "/" +
            s.maxHp +
            " HP**; " +
            m.healDebt +
            " HP đã hiến bị khóa hồi đến khi hiệu ứng hết."
          : "Chưa hiến máu. Có thể tấn công bình thường hoặc hiến để tăng " +
            E.attack +
            " **DMG của bạn**.";
      break;
    case "nemesis":
      text =
        "Timeline " +
        m.timeline.map((a) => actNames[a]).join(" → ") +
        " · Khóa " +
        (m.lockUntil > b.round
          ? actNames[m.lock] + " " + (m.lockUntil - b.round) + " lượt"
          : "không") +
        ". Đổi chuỗi hai hành động.";
      break;
    case "azmodan":
      text =
        "⚠ **Ấn máu nổ sau " +
        m.mark +
        " lượt**.\n" +
        (m.reflected
          ? "Đã phản ấn: boss mất " +
            E.hp +
            " **" +
            Math.floor(e.maxHp * 0.05) +
            " HP (5% Max HP)** khi nổ; ấn không gây DMG cho bạn."
          : "Chưa xử lý: ấn gây " +
            E.attack +
            " **" +
            Math.floor(
              s.maxHp *
                c.power *
                require("../events/explorationMarks").incoming(s, e),
            ) +
            " DMG chuẩn** cho bạn (" +
            E.hp +
            " **" +
            harmRate(x) +
            "% Max HP**).\n" +
            "Chọn **Phản ấn** (" +
            E.mana +
            " −1 MP) hoặc **Dập lửa** (" +
            E.potion +
            " −1 bình).");
      break;
    case "dark_star_dragon":
      text =
        "⚠ Beam sau " +
        (c.cycle - (b.round % c.cycle)) +
        " lượt · Trụ bền " +
        m.pillars.join("/") +
        ". Nấp khi Beam sạc; giữ bền cho cuối trận.";
      break;
    case "juris_khan":
      text =
        "Vị trí " +
        m.position +
        "/3 · Đứng yên " +
        m.still +
        "/3 · DMG hai phía +" +
        Math.round(m.position * c.power * 100) +
        "%. Tiến/lùi để đổi nhịp.";
      break;
    case "baal":
      text =
        "Purity " +
        m.purity +
        "/3 · Defile " +
        m.corruption +
        "/" +
        c.cap +
        " · Inferno " +
        m.inferno +
        " MP · Visions " +
        ["không", "DEF ×0,7", "RES −15", "CRIT 0"][m.vision] +
        " · kế " +
        ["Defile", "Inferno", "Visions"][Math.floor(b.round / c.cycle) % 3] +
        " sau " +
        (c.cycle - (b.round % c.cycle)) +
        " lượt.";
      break;
    case "belial":
      text =
        (active
          ? "Boss đã lộ: dùng Tấn công/Skill để kết liễu."
          : "Bóng thật: **" +
            (pattern[Math.floor(b.round / c.cycle) % 3] + 1) +
            " " +
            labels[pattern[Math.floor(b.round / c.cycle) % 3]] +
            "** → chọn nút **Đánh bóng " +
            (pattern[Math.floor(b.round / c.cycle) % 3] + 1) +
            "**.") +
        "\nLừa dối " +
        m.deception +
        "/5: " +
        E.attack +
        " DMG boss +" +
        Math.round(m.deception * c.power * 100) +
        "%.";
      break;
    case "atanna":
      text =
        "Queue " +
        m.dreams
          .map(
            (n, i) =>
              (n == null ? "Đã xóa" : ["Đòn mạnh", "Hút MP", "Hồi boss"][n]) +
              (i === b.round % 3 ? " ← kế" : ""),
          )
          .join(" → ") +
        " · " +
        (m.erased ? "đã dùng quyền xóa" : "xóa được một giấc");
      break;
    case "inarius":
      text = [
        `Vị trí: Inarius **ô ${m.inarius + 1}** · Lilith **ô ${m.lilith + 1}** · Ritual **ô ${m.ritual + 1}**`,
        `${E.hp} Lilith: **${Number(m.lilithHp.toFixed(1))}/100 HP**${m.protectUntil > b.round ? ` · Được che chở **${m.protectUntil - b.round} lượt**` : ` · Mất **${Number((c.power * 100).toFixed(1))} HP/lượt** nếu không che chở`}`,
        `${E.defense} Kết giới Inarius: ${active ? `**Đang tắt** · còn **${m.openUntil - b.round} lượt** để kết liễu.` : "**Đang bật** · vẫn nhận sát thương nhưng không thể bị kết liễu; chọn Kéo Inarius vào Ritual."}`,
      ].join("\n");
      break;
    case "sescheron":
      text =
        "Mã đã biết: **" +
        m.code.map((n, i) => (i < m.hints ? labels[n] : "?")).join(" ") +
        "**.\nĐã nhập: " +
        (m.input.map((n) => labels[n]).join(" ") || "chưa có") +
        " · cần nhập ô " +
        (m.input.length + 1) +
        ". " +
        (m.input.length < m.hints
          ? "Chọn **" + labels[m.code[m.input.length]] + "**."
          : "Gây DMG để biết biểu tượng của ô này.") +
        "\nCuồng nộ " +
        m.rage +
        "/5 tăng DMG boss.";
      break;
    case "nithogur":
      text =
        "Enrage " +
        Math.min(c.cap, b.round) +
        "/" +
        c.cap +
        " · " +
        (m.anchorUsed ? "Neo đã lưu" : "còn 1 Neo") +
        " · " +
        (m.rewound ? "đã Tua" : "còn 1 Tua") +
        ". Tua hồi lại HP/MP đã lưu của bạn và HP boss, không lùi lượt.";
      break;
    case "kabraxis":
      text =
        "Resonance " +
        m.resonance +
        "/30 · " +
        m.seals.filter((v) => v === "purified").length +
        " Purified/" +
        m.seals.filter((v) => v === "broken").length +
        " Broken · " +
        (m.pending
          ? "Seal chờ: thanh tẩy −3 hoặc phá."
          : "Seal tạo " + m.generated + "/5.") +
        " Sang Phase 3: ấn chờ tự tính là đã phá." +
        (b.phase === 2
          ? " · " +
            {
              war: "⚠ Mỗi 2 lượt: phản công CRIT.",
              protection: "⚠ Mỗi 2 lượt: đòn phép, bạn −10 RES.",
              arcane: "⚠ Mỗi 2 lượt: bạn mất 1 MP.",
            }[b.seal]
          : "");
      break;
    case "deimoss":
      text =
        b.phase === 1
          ? "Chọn Spire miễn lượt; hiệu ứng biến mất khi phá."
          : b.phase === 2
            ? m.cores.some((v) => v.choice == null)
              ? "⚠ Flesh Core: +8 " +
                m.cores.find((v) => v.choice == null).stat.toUpperCase() +
                " / curse " +
                {
                  damageTaken: "+5% DMG nhận",
                  skillHpCost: "Skill trả 1% Max HP",
                  healingReduction: "−15% hồi HP",
                }[m.cores.find((v) => v.choice == null).curse] +
                ". Chọn xử lý trước combat."
              : "Core đã khóa " +
                m.triggered.length +
                "/3. Mốc kế 75/50/25% HP."
            : (m.planeTurns > 0
                ? "Plane " +
                  ["Material", "Arcane", "Void"][m.plane] +
                  " · " +
                  m.planeTurns +
                  " lượt"
                : "Chọn Plane trước combat") +
              " · 3 đòn kế " +
              [0, 1, 2]
                .map((i) => ((b.round + i) % 2 ? "Phép" : "Vật lý"))
                .join(" → ") +
              (m.plane === 2 && m.planeTurns > 0 ? " · ⚠ Không hồi HP" : "");
      break;
  }
  if (m.targets)
    text +=
      "\n" +
      Object.entries(m.targets)
        .map(
          ([name, v]) =>
            (name === m.target ? "▶ " : "") + name + " " + v.hp + "/" + v.maxHp,
        )
        .join(" · ") +
      (m.waves > 1 ? " · Đợt " + m.wave + "/" + m.waves : "");
  if (m.curses?.length)
    text +=
      "\nFlesh Curse · " +
      m.curses
        .map(
          (v) =>
            ({
              damageTaken: "+5% DMG nhận",
              skillHpCost: "Skill trả 1% Max HP",
              healingReduction: "−15% hồi HP",
            })[v.type],
        )
        .join(" · ");
  if (active && b.id !== "inarius") text += " · Hiệu ứng còn " + (m.openUntil - b.round) + " lượt.";
  return (
    (MECHANIC_TITLES[b.id] || CATALOG[b.id].mechanic) +
    (b.depth ? " · Độ khó " + ["", "I", "II", "III"][b.depth] : "") +
    "\n" +
    (["lilith", "azmodan", "inarius"].includes(b.id) ? text : statText(plainStatus(text)))
  );
}
function details(s) {
  const x = mech.current(s);
  if (x.b.id === "inarius") {
    return [
      "- **Kết giới:** bạn vẫn gây sát thương, nhưng Inarius luôn còn ít nhất 1 HP khi chưa mở thời gian kết liễu.",
      "- **Kéo Inarius vào Ritual:** tốn **1 lượt**, đưa Inarius và Lilith vào vị trí vòng Ritual; cho phép kết liễu boss trong **2 lượt kế tiếp**, kể cả khi vòng đổi vị trí. Boss vẫn phản công.",
      `- **Che chở Lilith:** tốn **1 lượt**, hồi ${E.hp} **15 HP** cho Lilith (tối đa 100); ngăn cô ấy mất HP trong lượt chọn và **2 lượt kế tiếp**. Boss vẫn phản công người chơi.`,
      `- **Không được che chở:** Lilith mất ${E.hp} **${Number((x.c.power * 100).toFixed(1))} HP mỗi lượt**.`,
      `- **Di chuyển:** cứ mỗi **${x.c.cycle} lượt**, vòng Ritual và Inarius sang ô kế tiếp trong vòng 1 → 2 → 3 → 1. Lilith không tự di chuyển.`,
      `- **Thất bại:** Lilith về ${E.hp} **0 HP** khiến bạn thất bại ngay, dù nhân vật còn HP.`,
      "",
      "**Hiện tại**",
      status(s),
    ].join("\n");
  }
  if (x.b.id === "belial") {
    return (
      "**Tìm bóng thật để kết liễu Belial**\n- Ba nút tương ứng: bóng 1 ◇, bóng 2 △, bóng 3 ○. Bảng chơi chỉ rõ bóng thật; dấu hiệu đổi mỗi " +
      x.c.cycle +
      " lượt.\n- Chọn đúng: tốn 1 lượt, boss không phản công lượt đó và lộ diện trong 2 lượt kế tiếp. Dùng Tấn công/Skill khi boss đang lộ để kết liễu.\n- Chọn sai: tốn 1 lượt, bạn nhận " +
      E.attack +
      " DMG chuẩn bằng " +
      harmRate(x) +
      "% " +
      E.hp +
      " Max HP và boss vẫn phản công. Mỗi lần sai tăng 1 Lừa dối (tối đa 5), mỗi điểm tăng " +
      Math.round(x.c.power * 100) +
      "% DMG boss.\n- Khi chưa lộ, bạn vẫn gây DMG nhưng không thể hạ boss; Skill không thay thế việc chọn bóng thật.\n\n**Hiện tại**\n" +
      status(s) +
      "\n" +
      E.attack +
      " DMG Tấn công/Skill của bạn khi đánh boss ×" +
      (x.b.playerDamageScale || 1).toFixed(1) +
      "."
    );
  }
  if (x.b.id === "azmodan") {
    return (
      "**Ấn máu: tự nổ sau 3 lượt**\n" +
      "- Bỏ mặc: bạn nhận " +
      E.attack +
      " **DMG chuẩn bằng " +
      harmRate(x) +
      "%** " +
      E.hp +
      " **Max HP của bạn**.\n" +
      "- **Phản ấn:** tốn " +
      E.mana +
      " **1 MP**; giữ thời gian đếm. Khi nổ, boss mất " +
      E.hp +
      " **5% Max HP của boss**; bạn không nhận DMG từ ấn.\n" +
      "- **Dập lửa:** tốn " +
      E.potion +
      " **1 bình**, không hồi HP; hủy ấn hiện tại và đặt ấn mới với **3 lượt**.\n" +
      "Mỗi lựa chọn tốn **1 lượt**; boss vẫn phản công thường. Sau khi nổ, một ấn mới bắt đầu đếm 3 lượt.\n\n**Hiện tại**\n" +
      status(s) +
      "\n" +
      E.attack +
      " DMG Tấn công/Skill của bạn khi đánh boss **×" +
      (x.b.playerDamageScale || 1).toFixed(1).replace(".", ",") +
      "**."
    );
  }
  if (x.b.id === "lilith") {
    const offers = [0.05, 0.1, 0.2]
      .map(
        (rate, i) =>
          "- " +
          E.hp +
          " **" +
          Math.round(rate * 100) +
          "% Max HP** (" +
          Math.ceil(s.maxHp * rate) +
          " HP) → " +
          E.attack +
          " **DMG +" +
          Math.round(x.c.power * (i + 1) * 100) +
          "%**, **" +
          (i + 1) +
          " lượt kế tiếp**.",
      )
      .join("\n");
    return (
      "Hiến máu để tăng " +
      E.attack +
      " **DMG Tấn công/Skill của bạn**:\n" +
      offers +
      "\nMỗi lần hiến tốn **1 lượt**, boss vẫn phản công; bạn phải còn ít nhất **1 HP** sau khi hiến. Không bắt buộc hiến." +
      "\nPhần " +
      E.hp +
      " **HP đã hiến không thể hồi** bằng bình/Skill khi hiệu ứng còn; không thể hiến thêm trước khi hiệu ứng hết." +
      "\n\n**Hiện tại**\n" +
      status(s) +
      "\n" +
      E.attack +
      " Hệ số DMG của bạn khi đánh boss: **×" +
      (x.b.playerDamageScale || 1).toFixed(1).replace(".", ",") +
      "**."
    );
  }
  return (
    (x.b.id === "death_projector" && mech.randomBeam(x)
      ? "- **Tia bắn:** mỗi lượt bắn vào vùng A/B/C đang báo trên bảng. Tia giữ một vùng trong 2 lượt rồi chuyển ngẫu nhiên sang một trong hai vùng khác.\n- **Tấn công:** đứng ngoài vùng tia để Tấn công/Skill an toàn.\n- **Sang A/B/C:** tốn **1 lượt**, không có phản công thường; bạn vẫn nhận tia nếu đến vùng đang bị bắn."
      : readableRules(RULES[x.b.id], x)) +
    "\n\n**Hiện tại**\n" +
    status(s) +
    "\n\n" +
    E.attack +
    " DMG Tấn công/Skill của bạn khi đánh boss **×" +
    (x.b.playerDamageScale || 1).toFixed(1).replace(".", ",") +
    "**."
  );
}
function explainedDetails(s) {
  const x = mech.current(s);
  const text = "**Mục tiêu:** " + GOALS[x.b.id] + "\n\n**Cơ chế**\n" + details(s);
  return text.includes("DMG chuẩn")
    ? text +
        "\n\n" +
        statText(
          "DMG chuẩn: không thể né; DEF/RES của bạn không giảm được sát thương này.",
        )
    : text;
}
module.exports = { RULES, status, details: explainedDetails };
