"use strict";
const { E } = require("../shared/icons");
const { LILITH_MAX_HP } = require("./runtimeV2");
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
  "butcher": "- **Cơ chế chính:** Bạn và Butcher đứng ở khoảng cách từ 0 đến 2. Cuối mỗi lượt, Butcher tiến lại gần 1 ô.\n- **Khi ở khoảng cách 0:** Bạn gây thêm sát thương, nhưng Butcher cũng tích Cuồng nộ (tối đa {CAP}), mỗi điểm tăng {POWER}% DMG boss.\n- **Meat Hook:** Mỗi {CYCLE} lượt, Butcher kéo bạn về khoảng cách 0.\n- **Cách xử lý:** Dùng **Lùi lại** để tạo khoảng cách, hoặc **Chặt xích** trước lần kéo kế tiếp. Chặt xích tốn 5% HP hiện tại nhưng chặn đúng một lần Meat Hook.\n- **Cần nhớ:** Không nên đứng sát boss quá lâu vì Bloodlust có thể khiến phản công rất nguy hiểm.",
  "machine": "- **Cơ chế chính:** Mỗi đòn Tấn công hoặc Skill gây DMG tăng {AMOUNT} Nhiệt.\n- **Nhiệt 70–99:** Đây là vùng thuận lợi; DMG bạn gây lên boss +30%.\n- **Nhiệt đạt 100:** Lò phản ứng phát nổ. Bạn nhận DMG chuẩn bằng {HARM}% Max HP, boss mất 6% Max HP, sau đó Nhiệt và Shield được đặt lại.\n- **Xả nhiệt:** Giảm 35 Nhiệt, hồi boss tối đa 3% Max HP và thêm một lá chắn (tối đa 2); lá chắn giảm 15% DMG bạn gây lên boss.\n- **Quá tải:** Tăng 35 Nhiệt để tiến gần vùng sát thương cao hoặc kích nổ lò.\n- **Cách xử lý:** Giữ Nhiệt trong vùng 70–99 để dồn sát thương; chỉ để đạt 100 khi bạn chịu được sát thương chuẩn theo Max HP.",
  "assur": "- **Cơ chế chính:** Ba Sigil có màu theo một thứ tự được công bố.\n- **Chạm đúng màu kế tiếp:** Nhận 1 Purify Charge, tối đa 3.\n- **Chạm sai:** Bạn nhận DMG chuẩn bằng {HARM}% Max HP nhưng vẫn nhận thêm thông tin về thứ tự; số charge đã có không bị mất.\n- **Đủ 3 charge:** Dùng **Purify** để tắt rune, chặn phản công của lượt đó và cho phép kết liễu boss trong {AMOUNT} lượt kế tiếp.\n- **Cần nhớ:** Khi rune còn hoạt động, Assur luôn giữ lại ít nhất 1 HP nên không thể bị kết liễu. Purify mở thời gian kết liễu trong {AMOUNT} lượt kế tiếp.",
  "control": "- **Cơ chế chính:** Shield giữ boss ở tối thiểu 1 HP. Bạn phải tìm đúng tần số Alpha, Beta hoặc Gamma để làm Shield sập.\n- **Thu thập manh mối:** Mỗi hành động gây hit sẽ loại trừ một tần số sai. Hai manh mối là đủ để xác định đáp án.\n- **Nhập đúng:** Shield sập trong 2 lượt chiến đấu và boss không phản công ở lượt nhập.\n- **Nhập sai:** Bạn nhận DMG chuẩn bằng {HARM}% Max HP, nhưng được thêm một manh mối.\n- **Cách xử lý:** Đánh để lấy manh mối rồi chọn tần số chắc chắn đúng; không cần đoán mò.",
  "necrobot": "- **Cơ chế chính:** Boss có ba bộ phận phụ và một Core.\n  - **Plating:** Tăng DEF của boss.\n  - **Barrier:** Tăng RES của boss.\n  - **Weapon:** Tăng sát thương phản công của boss.\n- **Cách mở Core:** Phá ít nhất 2 trong 3 bộ phận.\n- **Đổi mục tiêu:** Miễn lượt và không gây sát thương; sau khi chọn, Tấn công/Skill sẽ đánh bộ phận đó.\n- **Cần nhớ:** Mỗi bộ phận bị phá làm các bộ phận còn sống mạnh hơn. HP của chúng đã nằm trong tổng HP boss và không cho phần thưởng riêng.",
  "quov": "- **Cơ chế chính:** Đòn kế tiếp của boss mang một nguyên tố. Bạn chọn Ward phù hợp để hấp thụ nó.\n- **Chọn đúng Ward:** Giảm {POWER}% sát thương phản công và ghi nhận Absorb của nguyên tố đó.\n- **Đủ ba Absorb khác nhau:** RES của boss giảm {AMOUNT} điểm % đến hết trận.\n- **Depth III:** Một đòn có thể mang hai nguyên tố; Ward khớp một trong hai vẫn bảo vệ bạn.\n- **Cần nhớ:** Đổi Ward không tốn lượt và không cần MP.",
  "lucion": "- **Cơ chế chính:** Mỗi vòng có một biểu tượng báo trước đáp án đúng.\n- **Chọn đúng:** Tăng Will và chặn phản công của lựa chọn đó.\n- **Đủ 3 Will:** Scales bị phá trong 2 lượt, tạo thời điểm tốt để dồn sát thương.\n- **Chọn sai:** Bạn nhận DMG chuẩn bằng {HARM}% Max HP và boss hồi một phần HP.\n- **Cần nhớ:** Ngoài thời gian Scales bị phá, boss vẫn nhận một phần sát thương; trận đấu không khóa hoàn toàn Tấn công hoặc Skill.",
  "bul_kathos": "- **Cơ chế chính:** Thế đánh của boss được báo trước bằng biểu tượng. Bạn chọn **Đỡ cao**, **Đỡ thấp** hoặc **Không mắc lừa**.\n- **Khắc chế đúng:** Boss bị stagger trong 2 lượt và không phản công ở lượt xử lý.\n- **Lựa chọn hòa:** Cả bạn và boss cùng mất HP theo phần trăm.\n- **Lựa chọn thua:** Boss gây CRIT; Phòng thủ vẫn miễn CRIT theo luật chung.\n- **Cách xử lý:** Đọc biểu tượng rồi chọn đúng thế khắc chế, không cần đoán.",
  "giyua": "- **Cơ chế chính:** Các Spirit Nest làm boss đánh mạnh hơn và có giới hạn số lượng.\n- **Phá Nest:** Giảm số tổ đang tồn tại.\n- **Phong ấn:** Giảm số tổ và ngăn tổ mới xuất hiện trong một chu kỳ.\n- **Khai thác:** Hồi tối đa 4% Max HP và 1 MP, nhưng nếu lượt kế tiếp bạn không gây sát thương thì boss thêm một Tổ.\n- **Cần nhớ:** Tấn công/Skill luôn đánh boss, không tự chuyển sang đánh tổ.",
  "riftwalker": "- **Cơ chế chính:** Mỗi Tấn công, Skill, Phòng thủ hoặc dùng bình tạo một Echo và Echo sẽ kích hoạt sau 3 lượt.\n  - Echo từ **Tấn công/Skill:** Gây shockwave lên cả bạn và boss.\n  - Echo từ **Bình:** Hồi HP cho boss.\n  - Echo từ **Phòng thủ:** Tạo Shield cho boss trong 2 lượt.\n- **Bẻ Echo:** Xóa đúng một Echo nhưng tốn {COST}% Max HP và 1 lượt.\n- **Cách xử lý:** Theo dõi timeline ba lượt tới; ưu tiên bẻ Echo có hậu quả nguy hiểm nhất.",
  "gharbad": "- **Cơ chế chính:** Gharbad luân phiên đưa ra đầu hàng thật hoặc giả. Quy luật phân biệt thật–giả được công bố và giữ nguyên suốt trận.\n- **Chấp nhận đầu hàng thật:** Hồi HP và MP.\n- **Khám xét khi đầu hàng thật:** Chặn phản công lượt chọn; không cộng chỉ số.\n- **Tấn công khi đầu hàng giả:** Boss mất 4% Max HP và không phản công lượt chọn.\n- **Chọn sai:** Bạn mất HP; nếu chấp nhận đầu hàng giả, boss còn được hồi HP.\n- **Cách xử lý:** Dựa vào dấu hiệu và quy luật đã công bố, không chọn theo cảm tính.",
  "phoboss": "- **Cơ chế chính:** Dream Depth từ 0 đến 5; càng sâu thì cả bạn và boss càng gây nhiều sát thương.\n- **Thức tỉnh:** Tốn {COST}% HP hiện tại và 1 lượt để giảm Dream Depth xuống 2 bậc.\n- **Dream Depth từ 4 trở lên:** Skill bị khóa ở các lượt lẻ; bảng chiến đấu sẽ báo trước.\n- **Cách xử lý:** Có thể tận dụng Depth cao để dồn sát thương, nhưng nên Thức tỉnh nếu không đủ HP để chịu phản công.",
  "anomaly": "- **Cơ chế chính:** Core luân phiên giữa Matter, Energy và Void mỗi lượt.\n- **Ổn định đúng dạng:** Nhận 1 shard của dạng đó.\n- **Chọn sai:** Bạn mất HP và boss chuyển ngay sang dạng khác.\n- **Đủ ba shard khác nhau:** Kích hoạt Overload, đưa DEF và RES của boss về 0 trong 2 lượt.\n- **Cần nhớ:** Shard chỉ phục vụ cơ chế, không cho vật phẩm hoặc tăng phần thưởng.",
  "zakarum": "- **Cơ chế chính:** Boss có ba mảnh Halo.\n  - **Might:** Tăng sát thương boss.\n  - **Sanctuary:** Hồi HP định kỳ cho boss.\n  - **Haste:** Tăng DEF của boss ở lượt kích hoạt.\n- **Cướp một mảnh:** Tốn 1 lượt, tắt hiệu ứng của mảnh đó và cho bạn một phiên bản buff yếu hơn đến hết trận.\n- **Đánh đổi:** Hai mảnh còn lại được tăng sức mạnh trong 2 lượt.\n- **Cách xử lý:** Cướp mảnh gây bất lợi nhất cho build của bạn, sau đó chịu đựng hai lượt tăng cường của các mảnh còn lại.",
  "justicar": "- **Cơ chế chính:** Trước mỗi chuỗi ba lượt, bạn phải chọn một phán quyết. Việc chọn không tốn lượt.\n  - **Steel:** Tăng sát thương vật lý của cả hai phía, giảm sát thương phép.\n  - **Arcane:** Tăng sát thương phép của cả hai phía, giảm sát thương vật lý.\n  - **Silence:** Khóa Skill nhưng giảm mạnh sát thương boss.\n- **Cần nhớ:** Bạn không thể dùng hành động thường khi chưa chọn phán quyết. Ba ý định kế tiếp của boss luôn được báo trước.",
  "uldyssian": "- **Cơ chế chính:** Boss đọc từng nhóm bốn hành động Tấn công, Skill, Phòng thủ hoặc dùng bình của bạn và tạo Clone theo loại được dùng nhiều nhất. Nếu hòa, loại xuất hiện sớm hơn được chọn.\n  - Clone **Attack:** Tăng sát thương boss.\n  - Clone **Skill:** Hút MP và thay đổi sát thương phép.\n  - Clone **Defend:** Giảm sát thương boss nhận.\n  - Clone **Potion:** Hồi HP cho boss.\n- **Viết lại ký ức:** Tốn 1 MP và 1 lượt để biến một ô lịch sử thành Trống.\n- **Cách xử lý:** Đa dạng hành động hoặc xóa ký ức trước khi một loại bất lợi chiếm đa số.",
  "lazarus": "- **Cơ chế chính:** Có ba Totem hỗ trợ boss.\n  - **Restoration:** Hồi HP cho boss.\n  - **Tremor:** Gây sát thương chuẩn theo chu kỳ.\n  - **Drain:** Hút MP của bạn.\n- **Chọn mục tiêu:** Miễn lượt; bạn có thể chọn Totem hoặc boss bất cứ lúc nào.\n- **Hồi sinh Totem:** Theo chu kỳ, Lazarus hồi sinh Totem bị phá gần nhất nếu ngân sách hồi sinh chưa hết.\n- **Cách xử lý:** Phá Totem gây nguy hiểm nhất cho build, nhưng đừng tốn quá nhiều lượt nếu có thể kết liễu boss trực tiếp.",
  "xazax": "- **Cơ chế chính:** Portal xuất hiện theo chu kỳ và mỗi Portal làm boss gây thêm sát thương.\n- **Đóng Portal:** Xóa Portal an toàn.\n- **Chiếm Portal:** Xóa Portal và gây sát thương xuyên RES bằng 4% Max HP boss.\n- **Bước vào Portal:** Xóa Portal và bỏ phản công của lượt đó, nhưng RES của bạn giảm 10 điểm % trong 2 lượt.\n- **Cần nhớ:** Mỗi lựa chọn đều tốn 1 lượt. Skill không tự động đóng Portal.",
  "samael": "- **Cơ chế chính:** Pentagram có 5 điểm và được thêm điểm theo chu kỳ.\n- **Dập điểm:** Tốn 1 MP để xóa một điểm.\n- **Cướp điểm:** Nhận DMG chuẩn bằng {FIVE_HARM}% Max HP nhưng nhận thêm sát thương đến hết trận.\n- **Đủ 5 điểm:** Boss tung phản công mạnh kèm sát thương chuẩn đã được cảnh báo, rồi Pentagram đặt lại.\n- **Cách xử lý:** Không để Pentagram đầy khi HP thấp; nếu đủ sức chịu chi phí, cướp điểm để tăng sát thương lâu dài.",
  "death_projector": "- **Cơ chế chính:** Tia chết quét một vùng mỗi lượt; run cũ đổi vùng theo chu kỳ A→B→C đã hiển thị.\n- **Tấn công:** An toàn khi bạn đang ở vùng không bị tia quét.\n- **Chuyển vùng:** Tốn 1 lượt và không có phản công thường, nhưng vẫn trúng tia nếu chuyển vào đúng vùng đang bị quét.\n- **Depth III:** Tia có thể tiến qua hai vùng mỗi lần đổi hướng.\n- **Cách xử lý:** Luôn xem vùng hiện tại và vùng sắp bị bắn trước khi hành động.",
  "akarat": "- **Cơ chế chính:** Ba Apostle có HP riêng nhưng HP của chúng đã nằm trong tổng HP trận đấu.\n  - **Mercy:** Hồi HP cho boss.\n  - **Wrath:** Tăng sát thương boss.\n  - **Faith:** Tăng 10 điểm % RES boss và giảm 10% sát thương bạn gây lên boss.\n- **Mở boss:** Phải hạ cả ba Apostle trước khi có thể chọn Akarat.\n- **Di sản:** Apostle bị hạ cuối cùng để lại buff tương ứng cho boss.\n- **Cách xử lý:** Chọn thứ tự hạ sao cho buff còn lại cuối cùng ít nguy hiểm nhất với build của bạn.",
  "buyard": "- **Cơ chế chính:** Nhiệt nằm trong khoảng 0–100.\n  - **Dưới 40:** Shield giảm mạnh sát thương bạn gây ra.\n  - **Từ 40 đến 70:** Boss nhận thêm sát thương.\n  - **Trên 70:** Cả bạn và boss đều bị thiêu.\n- **Thu hẹp vòng:** Tăng Nhiệt.\n- **Mở rộng vòng:** Giảm Nhiệt.\n- **Cần nhớ:** Mỗi điều chỉnh tốn 1 lượt và boss cũng tự tăng Nhiệt theo chu kỳ. Cố giữ Nhiệt trong vùng 40–70.",
  "bartuc": "- **Cơ chế chính:** 35% sát thương bạn gây ra bị chuyển sang Golem và được ghi thành nợ sát thương. Golem tăng một mức mỗi lượt khi còn liên kết (tối đa {CAP}); mỗi mức tăng {POWER}% DMG boss.\n- **Cắt liên kết:** Tốn {COST}% HP hiện tại, trả toàn bộ sát thương đã chuyển lên Bartuc và mở giáp boss trong 2 lượt; khi đó boss nhận thêm sát thương.\n- **Giới hạn:** Không thể cắt nếu chi phí khiến bạn không đủ HP.\n- **Cần nhớ:** Golem không cho vật phẩm hoặc phần thưởng riêng; mục tiêu là tích nợ vừa đủ rồi cắt ở thời điểm an toàn.",
  "jitan": "- **Cơ chế chính:** Ba cổng ◇, △ và ○ tuân theo một quy luật được công bố; cổng đúng của kỳ tới cũng được báo trước.\n- **Chọn đúng cổng:** Mở đường gây sát thương lên boss trong {AMOUNT} lượt kế tiếp; boss không phản công lượt mở đúng.\n- **Chọn sai:** Sinh Guard Tower, tối đa 3, và gây sát thương chuẩn lên bạn.\n- **Cần nhớ:** Ngoài thời gian mở, boss nhận 0 sát thương. Không cần MP và cả build vật lý lẫn phép đều dùng được nút cổng.",
  "greater_riftwalker": "- **Cơ chế chính:** Màu bão quyết định vị trí an toàn.\n  - **Bão xanh:** Gần boss là an toàn.\n  - **Bão đỏ:** Xa boss là an toàn.\n- **Đổi vị trí:** Tốn 1 lượt và không có phản công thường, nhưng vẫn chịu sát thương bão nếu đứng sai.\n- **Cách xử lý:** Xem màu hiện tại và đợt kế tiếp, rồi đổi vị trí trước khi bão đánh.",
  "athulua": "- **Cơ chế chính:** Một trong ba vùng Trái/Giữa/Phải bị đánh dấu. Sau mỗi đòn gây sát thương của bạn, dấu ấn dịch theo mũi tên hiển thị.\n- **Đứng trong vùng bị đánh dấu:** Guided Arrow gây nhiều sát thương hơn.\n- **Đứng ở Giữa:** Bạn ở gần boss nên nhận thêm sát thương.\n- **Sky Siege ở Depth III:** Khóa một vùng trong 1–2 lượt theo lịch công bố.\n- **Cần nhớ:** Di chuyển tốn 1 lượt và Guided Arrow vẫn được xử lý trong lượt di chuyển.",
  "lilith": "- **Cơ chế chính:** Bạn có thể hiến 5%, 10% hoặc 20% Max HP để nhận tăng sát thương tương ứng trong 1, 2 hoặc 3 lượt.\n- **Điều kiện:** Sau khi hiến phải còn ít nhất 1 HP. Mỗi lần hiến tốn 1 lượt và boss vẫn phản công.\n- **Khóa hồi máu:** Phần HP đã hiến không thể hồi bằng Bình hoặc Skill cho đến khi hiệu ứng kết thúc.\n- **Cần nhớ:** Không bắt buộc hiến. Chỉ hiến khi lượng sát thương tăng thêm giúp rút ngắn trận đấu đủ nhiều.",
  "nemesis": "- **Cơ chế chính:** Boss theo dõi hai hành động gần nhất của bạn.\n- **Kích hoạt phản chiếu:** Nếu bạn lặp lại đúng cùng một chuỗi hai hành động, Nemesis sao chép sát thương và khóa hành động đầu tiên của chuỗi trong 2 lượt.\n- **Cách xử lý:** Luân phiên combo, tránh dùng lại cùng một cặp hành động liên tiếp.\n- **Cần nhớ:** Timeline và hành động đang bị khóa được hiển thị; mở lại bảng không làm thay đổi kết quả.",
  "azmodan": "- **Cơ chế chính:** Ấn máu tự phát nổ sau 3 lượt.\n- **Bỏ mặc:** Khi nổ, bạn nhận sát thương chuẩn theo phần trăm Max HP.\n- **Phản ấn:** Tốn 1 MP, không đặt lại thời gian đếm. Khi ấn nổ, boss mất 5% Max HP và bạn không nhận sát thương từ ấn.\n- **Dập lửa:** Tốn 1 bình, không hồi HP; hủy ấn hiện tại và tạo ấn mới với bộ đếm 3 lượt.\n- **Cần nhớ:** Phản ấn và Dập lửa đều tốn 1 lượt, boss vẫn phản công thường.",
  "dark_star_dragon": "- **Cơ chế chính:** Trước khi Death Beam bắn, ba trụ che sẽ xuất hiện. Mỗi trụ có độ bền hữu hạn.\n- **Nấp sau trụ:** Tốn 1 lượt. Nếu đúng thời điểm Beam bắn, trụ chặn tia và mất 1 độ bền.\n- **Trụ hết bền:** Không thể tiếp tục chọn trụ đó.\n- **Cần nhớ:** Lịch Beam được công bố. Các lượt không có Beam vẫn có phản công thường, vì vậy không nên nấp quá sớm.",
  "juris_khan": "- **Cơ chế chính:** Vị trí từ 0 đến 3 biểu thị khoảng cách với boss. Mỗi mức tiến gần tăng {POWER}% DMG của cả bạn và boss.\n- **Tiến/Lùi:** Mỗi lượt chỉ di chuyển được 1 ô và việc di chuyển tốn lượt.\n- **Đứng yên quá lâu:** Sau 3 lượt không đổi vị trí, linh hồn tăng áp lực và khiến trận đấu nguy hiểm hơn.\n- **Cách xử lý:** Chọn khoảng cách phù hợp khả năng chịu đòn và thỉnh thoảng di chuyển để không tích áp lực.",
  "manoruk": "- **Cơ chế chính:** Trận có hai đợt quân, mỗi đợt gồm Commander, Ritualist và Vanguard.\n  - **Commander:** Tăng sát thương đội quân.\n  - **Ritualist:** Có thể hồi sinh một lính đã chết trong mỗi đợt, với giới hạn hồi sinh.\n  - **Vanguard:** Tăng DEF boss; Core chỉ mở sau khi bạn hạ hết cả hai đợt lính.\n- **Chọn mục tiêu:** Miễn lượt.\n- **Cần nhớ:** HP của cả hai đợt đã nằm trong tổng HP. Chỉ khi dọn xong một đợt thì đợt sau mới mở; không có thưởng sớm khi hạ từng lính.",
  "baal": "- **Cơ chế chính:** Ba hiệu ứng xấu luân phiên tích tụ.\n  - **Defile:** Tăng Corruption và sát thương.\n  - **Inferno:** Đốt MP.\n  - **Visions:** Luân phiên giảm DEF, RES hoặc CRIT.\n- **Purity:** Bắt đầu với 1 điểm, tối đa 3. Gây đủ sát thương theo phần trăm Max HP boss sẽ hồi 1 Purity.\n- **Thanh tẩy:** Tốn 1 lượt và 1 Purity để xóa đúng một hiệu ứng xấu.\n- **Cách xử lý:** Chỉ thanh tẩy hiệu ứng đang gây nguy hiểm nhất; không thể xóa cả ba cùng lúc.",
  "belial": "- **Cơ chế chính:** Belial ẩn trong ba cái bóng, mỗi bóng gắn với một rune. Manh mối đúng được công bố và giữ lại qua từng vòng.\n- **Chọn đúng bóng:** Boss lộ diện trong 2 lượt và không phản công ở lượt chọn.\n- **Chọn sai:** Deception tăng, tối đa 5, và bạn nhận sát thương DMG chuẩn.\n- **Ngoài thời gian lộ diện:** Bạn vẫn có thể gây sát thương nhưng không thể kết liễu boss.\n- **Cần nhớ:** Skill không tự xóa bóng; dùng manh mối để chọn đúng.",
  "astrogha": "- **Cơ chế chính:** Ba Totem tạo hiệu ứng khác nhau.\n  - **Venom:** Tăng DMG boss.\n  - **Web:** Khóa vị trí.\n  - **Brood:** Hồi HP cho boss.\n- **Vị trí:** Ở Giữa, bạn gây thêm sát thương; ở Trái/Phải, sát thương của cả bạn và boss đều giảm.\n- **Phá Totem:** Hiệu ứng của Totem chuyển sang boss trong đúng 2 lượt rồi biến mất. Venom tăng sát thương, Web tiếp tục khóa vị trí, Brood khiến boss hút máu.\n- **Cần nhớ:** Chọn Totem hoặc boss không tốn lượt; Totem không cho phần thưởng riêng.",
  "atanna": "- **Cơ chế chính:** Hàng chờ có ba giấc mơ: Đòn mạnh, Hút MP và Hồi boss. Giấc sắp kích hoạt được đánh dấu.\n- **Quyền xóa:** Mỗi chu kỳ chỉ được xóa đúng một giấc mơ và thao tác này tốn 1 lượt.\n- **Quan trọng:** Nếu giấc hiện tại chưa bị xóa, nó vẫn được xử lý trong lượt bạn chọn xóa một giấc khác.\n- **Cách xử lý:** Đọc cả ba ô, xóa hậu quả nguy hiểm nhất và chuẩn bị chịu hai giấc còn lại.",
  "inarius": "- **Mục tiêu:** Giữ Lilith sống và hạ Inarius.\n- **Kết giới:** Inarius vẫn nhận sát thương nhưng luôn còn ít nhất 1 HP khi chưa mở thời gian kết liễu.\n- **Kéo cả hai vào Ritual:** Tốn 1 lượt, đưa Inarius và Lilith vào vị trí của vòng Ritual và vô hiệu hóa Kết giới trong 2 lượt tiếp theo. Boss vẫn phản công.\n- **Che chở Lilith:** Tốn 1 lượt, hồi 15 HP cho Lilith và ngăn Lilith mất HP trong 2 lượt tiếp theo. Boss vẫn phản công người chơi.\n- **Theo chu kỳ:** Inarius và vòng Ritual cùng chuyển sang vị trí kế tiếp, còn Lilith không tự di chuyển.\n- **Thất bại:** Khi không được che chở, Lilith mất HP mỗi lượt theo độ khó. Lilith về 0 HP thì run kết thúc ngay.\n- **Cần phân biệt:** Kết giới ngăn kết liễu; nó không phải Lá chắn đá có thanh HP từ Rift.",
  "sescheron": "- **Cơ chế chính:** Mã khóa gồm ba rune. Mỗi hit trong chiến đấu mở một manh mối cho một ô mã.\n- **Nhập rune:** Mỗi lần nhập một rune tốn 1 lượt.\n- **Nhập đúng đủ ba:** Engine quá tải trong 2 lượt, tạo cơ hội dồn sát thương.\n- **Nhập sai:** Rage tăng, tối đa 5, và bạn nhận DMG chuẩn bằng {HARM}% Max HP.\n- **Cách xử lý:** Sau 3 hit, toàn bộ mã sẽ được lộ; nên thu thập đủ thông tin thay vì đoán mò.",
  "nithogur": "- **Cơ chế chính:** Bạn được dùng một lần Neo thời gian và một lần Tua lại trong mỗi trận.\n- **Neo thời gian:** Lưu đúng ba giá trị tại thời điểm đặt Neo: HP của bạn, MP của bạn và HP boss.\n- **Tua lại:** Khôi phục ba giá trị đã lưu.\n- **Không được khôi phục:** RNG, vật phẩm, phần thưởng, số lượt và Enrage.\n- **Cần nhớ:** Cả Neo và Tua lại đều tốn 1 lượt và boss vẫn phản công. Enrage tăng theo thời gian nên tua lại không thể xóa rủi ro kéo dài trận.",
  "kabraxis": "- **Mục tiêu phụ:** Bạn có thể giữ cửa rút ở tầng 666; một khi bước vào trận, cửa rút bị khóa.\n- **Ba giai đoạn HP:** Trên 66%, từ 33–66%, và dưới 33%.\n- **Resonance:**\n  - **War:** Gây sát thương tăng Resonance; CRIT tăng thêm điểm.\n  - **Protection:** Sống qua phản công tăng Resonance; giảm/chặn đủ nhiều sát thương được cộng thêm.\n  - **Arcane:** Tiêu hoặc hồi MP tăng Resonance, tối đa một lần mỗi lượt.\n- **Seal:** Xuất hiện định kỳ ở giai đoạn 1 và nhanh hơn ở giai đoạn 2. Seal đang chờ phải được xử lý trước khi Seal mới xuất hiện.\n- **Thanh tẩy Seal:** Tốn 3 Điểm cộng hưởng. **Phá Seal:** Không tốn điểm nhưng để lại hậu quả xấu về sau. Cả hai tốn 1 lượt và chặn phản công lượt đó. Bạn cũng có thể tiếp tục đánh và bỏ qua Seal.\n- **Giai đoạn 3:** Seal đã thanh tẩy tăng sát thương của bạn; Seal bị phá hoặc bỏ dở tăng sức mạnh boss và gây hình phạt theo loại War/Protection/Arcane. Kết quả Seal được khóa và không sinh Seal mới.\n- **Cần nhớ:** Ở giai đoạn 2, từng loại Seal còn có hiệu ứng định kỳ riêng: War ép CRIT, Protection gây đòn phép và giảm RES, Arcane hút MP.",
  "deimoss": "- **Cấu trúc trận:** Ba thanh HP tương ứng ba giai đoạn 30% / 30% / 40%. Sát thương dư không xuyên sang thanh kế tiếp và lượt chuyển giai đoạn không có phản công.\n- **Giai đoạn 1 — Spires:**\n  - **Ruin:** Tăng sát thương vật lý boss.\n  - **Silence:** Tăng chi phí MP của Skill theo chu kỳ nhưng không vượt Max MP.\n  - **Hunger:** Hồi HP boss theo sát thương thực nhận.\n  - Chọn Spire không tốn lượt; phá Spire để gỡ hiệu ứng tương ứng.\n- **Giai đoạn 2 — Flesh Core:** Core xuất hiện tại các mốc HP. Bạn chọn một trong ba cách xử lý:\n  - **Thiêu:** Mất MP.\n  - **Cấy ghép:** Nhận STR/ENE/VIT nhưng kèm một lời nguyền như tăng sát thương nhận, Skill tốn HP hoặc giảm hồi máu.\n  - **Bỏ mặc:** Boss hồi một phần thanh HP trong 2 lượt.\n  - Chọn Core không tốn lượt.\n- **Giai đoạn 3 — Planes:** Chọn một Plane có hiệu lực trong 3 lượt chiến đấu.\n  - **Material:** Tăng sát thương vật lý và giảm sát thương phép của cả hai phía.\n  - **Arcane:** Tăng sát thương phép và giảm sát thương vật lý của cả hai phía.\n  - **Void:** DMG của bạn +15%; DEF của cả bạn và boss giảm 25%, RES cả hai giảm 20 điểm %; bạn không thể hồi HP.\n- **Cần nhớ:** Ba đòn kế tiếp của boss được công bố. Chỉ khi hạ Deimoss ở giai đoạn 3 bạn mới nhận chiến thắng và phần thưởng."
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
    .map((line) => "- " + statText(plainStatus(line.replace(/^\s*-\s*/, ""))))
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
        `${E.hp} Lilith: **${Number(m.lilithHp.toFixed(1))}/${LILITH_MAX_HP} HP**${m.protectUntil > b.round ? ` · Được che chở **${m.protectUntil - b.round} lượt**` : ` · Mất **${Number((c.power * 100).toFixed(1))} HP/lượt** nếu không che chở`}`,
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
      `- **Che chở Lilith:** tốn **1 lượt**, hồi ${E.hp} **15 HP** cho Lilith (tối đa ${LILITH_MAX_HP}); ngăn cô ấy mất HP trong lượt chọn và **2 lượt kế tiếp**. Boss vẫn phản công người chơi.`,
      `- **Không được che chở:** Lilith mất ${E.hp} **${Number((x.c.power * 100).toFixed(1))} HP mỗi lượt**.`,
      `- **Di chuyển:** cứ mỗi **${x.c.cycle} lượt**, vòng Ritual và Inarius sang ô kế tiếp trong vòng 1 → 2 → 3 → 1. Lilith không tự di chuyển.`,
      `- **Thất bại:** Lilith về ${E.hp} **0 HP** khiến bạn thất bại ngay, dù nhân vật còn HP.`,
      "- **Cần phân biệt:** kết giới ngăn kết liễu; nó không phải Lá chắn đá có thanh HP từ Rift.",
      "",
      "**Hiện tại**",
      status(s),
    ].join("\n");
  }
  if (x.b.id === "belial") {
    return (
      "- **Cơ chế chính:** Belial ẩn trong ba bóng.\n- **Manh mối:** Ba nút tương ứng: bóng 1 ◇, bóng 2 △, bóng 3 ○. Bảng chơi chỉ rõ bóng thật; dấu hiệu đổi mỗi " +
      x.c.cycle +
      " lượt.\n- **Chọn đúng bóng:** tốn 1 lượt, boss không phản công lượt đó và lộ diện trong 2 lượt kế tiếp. Dùng Tấn công/Skill khi boss đang lộ để kết liễu.\n- **Chọn sai:** tốn 1 lượt, bạn nhận " +
      E.attack +
      " DMG chuẩn bằng " +
      harmRate(x) +
      "% " +
      E.hp +
      " Max HP và boss vẫn phản công. Mỗi lần sai tăng 1 Lừa dối (tối đa 5), mỗi điểm tăng " +
      Math.round(x.c.power * 100) +
      "% DMG boss.\n- **Ngoài thời gian lộ diện:** bạn vẫn gây DMG nhưng không thể hạ boss; Skill không thay thế việc chọn bóng thật.\n\n**Hiện tại**\n" +
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
      "- **Cơ chế chính:** Ấn máu tự nổ sau **3 lượt**.\n" +
      "- **Bỏ mặc:** bạn nhận " +
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
      "- **Cần nhớ:** Mỗi lựa chọn tốn **1 lượt**; boss vẫn phản công thường. Sau khi nổ, một ấn mới bắt đầu đếm 3 lượt.\n\n**Hiện tại**\n" +
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
      "- **Cơ chế chính:** Hiến máu để tăng " +
      E.attack +
      " **DMG Tấn công/Skill của bạn**:\n" +
      offers +
      "\n- **Điều kiện:** Mỗi lần hiến tốn **1 lượt**, boss vẫn phản công; bạn phải còn ít nhất **1 HP** sau khi hiến. Không bắt buộc hiến." +
      "\n- **Khóa hồi máu:** Phần " +
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
      ? "- **Cơ chế chính:** mỗi lượt bắn vào vùng A/B/C đang báo trên bảng. Tia giữ một vùng trong 2 lượt rồi chuyển ngẫu nhiên sang một trong hai vùng khác.\n- **Tấn công:** đứng ngoài vùng tia để Tấn công/Skill an toàn.\n- **Sang A/B/C:** tốn **1 lượt**, không có phản công thường; bạn vẫn nhận tia nếu đến vùng đang bị bắn.\n- **Cách xử lý:** xem vùng tia hiện tại trước khi chọn hành động."
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
