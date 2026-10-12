"use strict";
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
    "Khoảng cách 0–2; cuối lượt Butcher tiến 1 ô, mỗi chu kỳ Meat Hook kéo về 0 trừ khi đã chặt xích. Ở 0: bạn +15% DMG và boss tăng Bloodlust (có trần). Lùi mất lượt; chặt xích trả 5% HP hiện tại, phải còn 1 HP, chặn đúng lần kéo kế.",
  machine:
    "Mỗi hit Tấn công/Skill tăng nhiệt. Nhiệt 70–99: boss nhận +30% DMG; đạt 100 cuối lượt: bạn mất một phần Max HP, boss mất 6% Max HP rồi nhiệt/reset Shield về 0. Xả −35 nhiệt tạo 1 Shield cho boss (trần 2, boss nhận ít hơn 15% DMG) và hồi boss 3%; Quá tải +35. Heal boss dùng ngân sách hữu hạn.",
  assur:
    "Ba Sigil ứng với ba màu theo thứ tự được công bố. Chạm màu kế trong vòng nhận 1 Purify Charge, tối đa 3; sai mất HP theo Depth và vẫn tiến manh mối, không mất charge. Đủ 3 dùng Purify: tắt rune, không phản công lượt đó, mở cửa sổ DMG rồi rune trở lại. Rune giữ ít nhất 1 HP boss; vật lý/phép đều xử lý được.",
  control:
    "Shield giữ ít nhất 1 HP boss. Mỗi hành động gây hit cho một manh mối loại trừ Alpha/Beta/Gamma (hai manh mối đủ xác định). Nhập đúng làm Shield sập 2 lượt combat, không phản công khi nhập; sai gây minefield DMG chuẩn và thêm manh mối. Tần số mới theo vòng đã khóa; không roll khi mở bảng.",
  necrobot:
    "Plating tăng DEF, Barrier tăng RES, Weapon tăng phản công; phá mỗi module tăng hai module còn sống. Menu chọn module không tốn lượt. Đã phá hai module có thể chọn Core/Boss; không cần đổi sang loại DMG khác. HP module nằm trong tổng HP boss, không cấp phần thưởng/drop riêng.",
  quov: "Chọn một Ward không tốn lượt. Đúng nguyên tố kế tiếp giảm mạnh phản công và ghi Absorb của nguyên tố đó. Đủ ba Absorb khác nhau giảm RES boss đến hết trận. Depth III có đòn hai nguyên tố; Ward khớp một nguyên tố vẫn bảo vệ. Không cần MP để đổi Ward.",
  lucion:
    "Mệnh lệnh có manh mối ba biểu tượng theo vòng. Chọn đáp án ứng với biểu tượng báo trước: tăng Will; đủ 3 Will phá Scales cho 2 lượt, phản công của lựa chọn đúng bị chặn. Sai gây Flame/HP chuẩn và hồi boss 3%. Ngoài cửa sổ Scales, boss nhận 30% DMG; không khóa cứng build.",
  bul_kathos:
    "Thế boss được báo theo vòng. Chọn Đỡ cao/Đỡ thấp/Không mắc lừa khớp biểu tượng: stagger 2 lượt và không phản công khi xử lý đúng. Lựa chọn kế trong vòng là hòa: hai phía mất 2% HP boss/bạn; lựa chọn còn lại thua, boss CRIT (Phòng thủ vẫn miễn Crit theo luật chung). Không roll thêm sau khi công bố thế; không phạt lặp Attack/Skill.",
  giyua:
    "Phá Nest giảm số tổ; phong ấn giảm tổ và chặn sinh tổ trong một chu kỳ; khai thác hồi 4% Max HP +1 MP nhưng nếu lượt kế không gây DMG thì tổ tiến hóa/thêm một. Tổ tăng DMG boss và có trần. Attack/Skill luôn đánh boss, không tự mất lượt vào tổ.",
  riftwalker:
    "Mỗi hành động combat chung tạo Echo đến sau ba lượt. Attack/Skill: shockwave cả hai, giới hạn theo Max HP bạn; Bình: hồi boss 3%; Phòng thủ: boss được Shield 2 lượt. Bẻ đúng một Echo tốn phần Max HP theo Depth và một lượt; không tua RNG. Timeline khóa trong state.",
  gharbad:
    "Quy luật thật–giả được công bố và giữ suốt trận, dấu hiệu đổi theo vòng. Chấp nhận thật hồi 5% HP +1 MP; khám xét thật mở buff; tấn công khi giả mở buff và ngắt phản công. Chọn sai mất HP, chấp nhận sai còn hồi boss. Không roll lại kết quả khi chọn.",
  phoboss:
    "Dream Depth 0–5 tăng DMG hai phía theo Depth. Thức tỉnh tốn một phần HP hiện tại và một lượt, hạ Dream 2 bậc. Dream ≥4: mỗi lượt lẻ khóa Skill, hiển thị trước. Skill không xóa stack tự động.",
  anomaly:
    "Matter/Energy/Void luân phiên mỗi lượt; ổn định đúng dạng lấy một shard, chọn sai mất HP và boss nhảy dạng. Đủ ba shard mở Overload: DEF/RES boss về 0 trong hai lượt. Shard không drop vật phẩm hoặc tăng payout.",
  zakarum:
    "Halo Might tăng DMG, Sanctuary hồi boss định kỳ, Haste tăng tốc Shield. Cướp một mảnh mất một lượt, tắt buff đó; hai mảnh còn lại tăng công suất trong hai lượt, bạn nhận mảnh yếu đến hết trận. Menu ghi rõ phần đang còn.",
  justicar:
    "Trước mỗi ba lượt combat chọn phán quyết không tốn lượt: Steel tăng vật lý hai phía, giảm phép; Arcane tăng phép hai phía, giảm vật lý; Silence khóa Skill và giảm DMG boss 35%. Không được dùng hành động thường khi chưa chọn. Ý định ba lượt được báo trước.",
  uldyssian:
    "Bốn hành động chung gần nhất tạo Clone theo loại xuất hiện nhiều nhất, hòa ưu tiên lần xuất hiện đầu. Clone Attack tăng DMG; Skill hút MP/đổi phép; Defend giảm DMG nhận; Potion hồi boss. Viết lại một ô thành Trống tốn 1 MP và một lượt; nút boss không tự thêm ô combat.",
  lazarus:
    "Chọn Restoration/Tremor/Drain/Boss không mất lượt. Restoration hồi boss, Tremor DMG chuẩn theo chu kỳ, Drain hút MP. Boss hồi sinh Totem bị phá gần nhất mỗi chu kỳ nếu còn ngân sách hồi hữu hạn; không hồi sinh bằng render/resume. Có thể đánh boss bất cứ lúc nào.",
  xazax:
    "Portal sinh theo chu kỳ và tăng DMG boss, có trần. Đóng xóa an toàn; Chiếm xóa và gây 4% Max HP boss xuyên RES; Bước vào xóa, bỏ phản công lượt đó nhưng RES của bạn −10 trong hai lượt. Mỗi lựa chọn mất một lượt. Skill không tự đóng Portal.",
  samael:
    "Pentagram có 5 điểm, thêm theo chu kỳ. Dập một điểm tốn 1 MP; cướp điểm mất 5% Max HP để nhận +5% DMG đến hết trận. Đủ 5: phản công mạnh và burst HP chuẩn được cảnh báo, rồi reset. Không yêu cầu Phòng thủ theo chu kỳ cố định.",
  death_projector:
    "Tia bắn mỗi lượt, đổi hướng theo chu kỳ A→B→C (Depth III tiến hai khu). Có thể Attack khi khu an toàn; chuyển vùng tốn lượt, không phản công thường nhưng vẫn chịu tia nếu ở vùng bị quét. UI báo khu và lượt bắn; không cần đoán.",
  akarat:
    "Mercy/Wrath/Faith là ba Apostle có HP riêng trong tổng HP. Mercy hồi boss, Wrath tăng DMG, Faith tạo Shield. Phải hạ cả ba mới chọn boss. Thứ tự chết được lưu; mảnh cuối để lại buff tương ứng. Không có phần thưởng/drop khi giết Apostle.",
  buyard:
    "Nhiệt 0–100: dưới 40 Shield giảm DMG bạn 40%; 40–70 boss nhận thêm 20%; trên 70 cả hai bị thiêu. Thu hẹp tăng nhiệt, mở rộng giảm nhiệt theo lượng Depth, mỗi lựa chọn mất lượt. Boss cũng tăng nhiệt định kỳ; mọi mức nhiệt có trần.",
  bartuc:
    "Tether chuyển 35% DMG đã gây sang Golem để ghi nợ. Golem mạnh dần có trần. Cắt liên kết tốn HP hiện tại, trả toàn bộ DMG đã chuyển lên boss và mở giáp 2 lượt (+20% DMG nhận). Không cấp drop/payout cho Golem; không thể cắt nếu HP không đủ.",
  jitan:
    "Ba cổng ◇/△/○; quy luật và cổng kỳ tới được công bố từ trước. Chọn đúng mở cửa sổ gây DMG; sai sinh Guard Tower tối đa 3 và gây HP chuẩn. Ngoài cửa sổ boss nhận 0 DMG. Vật lý/phép đều mở được bằng nút cổng, không yêu cầu MP.",
  greater_riftwalker:
    "Bão xanh an toàn Gần, bão đỏ an toàn Xa; đổi theo chu kỳ Depth, màu và đợt kế được báo trước. Đổi vị trí tốn lượt, không phản công thường nhưng đứng sai vẫn nhận bão. Không thể tự động tránh chỉ bằng Phòng thủ.",
  athulua:
    "Đánh dấu một vùng Trái/Giữa/Phải, dịch theo mũi tên sau mỗi đòn gây DMG của bạn. Đứng vùng bị khóa tăng DMG Guided Arrow; ở Giữa gần boss nhận thêm 15%. Depth III Sky Siege khóa một vùng 1–2 lượt theo lịch công bố. Di chuyển mất lượt và vẫn xử lý Arrow.",
  lilith:
    "Hiến 5/10/20% Max HP (cần còn 1) mở 1/2/3 lượt tăng DMG theo Depth. Máu đã hiến bị khóa khỏi hồi cho tới khi Bargain hết hiệu lực; bình/skill không vượt mức đó. Không hiến vẫn có thể đánh. Mỗi hiến là một lượt có phản công.",
  nemesis:
    "Timeline hai ô. Lặp đúng cùng chuỗi hai hành động: boss sao chép DMG có giới hạn và khóa hành động đầu trong hai lượt. Đổi combo để tránh. UI hiện timeline và khóa còn lại; không thêm nút hay roll sau lựa chọn.",
  azmodan:
    "Ấn nổ sau 3 lượt: phản ấn tốn 1 MP, khi nổ boss mất 5% Max HP; dập dùng đúng 1 bình, reset ấn an toàn, không hồi HP; bỏ mặc mất HP theo Depth. Cả hai nút là một lượt; ấn không reset do xem bảng.",
  dark_star_dragon:
    "Trước Beam xuất hiện ba trụ che, độ bền hữu hạn theo Depth. Nấp mất một lượt; che đúng lúc Beam chặn tia và mất 1 bền. Hết bền không thể chọn trụ. Beam có lịch công khai; các lượt khác phản công thường.",
  juris_khan:
    "Vị trí 0–3: mỗi bước gần tăng damage hai phía theo Depth. Tiến/lùi mỗi lượt chỉ 1 ô. Đứng yên 3 lượt linh hồn tăng áp lực; UI báo số lượt đứng yên. Build nào cũng dùng nút di chuyển được.",
  manoruk:
    "Hai wave Commander/Ritualist/Vanguard; HP cả hai wave nằm trong tổng HP. Commander tăng DMG, Ritualist hồi sinh một lính đã chết trong mỗi wave bằng ngân sách hữu hạn, Vanguard che Core. Chọn mục tiêu miễn lượt; hết một wave tự mở wave sau, không thưởng sớm.",
  baal: "Defile tăng Corruption/DMG có trần; Inferno đốt MP; Visions luân phiên giảm DEF/RES/CRIT. Purity ban đầu 1, tối đa 3; gây đủ 15% Max HP boss hồi 1. Chọn thanh tẩy đúng một hậu quả mất một lượt và 1 Purity; không được xóa tất cả cùng lúc.",
  belial:
    "Ba bóng với ba rune; manh mối đúng được khóa và công bố theo round. Chọn đúng lộ boss 2 lượt, không phản công lượt chọn; sai tăng Deception tối đa 5 và nhận HP chuẩn. Ngoài cửa sổ vẫn đánh nhưng không kết liễu được; Skill không xóa clone.",
  astrogha:
    "Venom tăng DMG độc, Web khóa vị trí, Brood hồi boss. Vị trí Giữa: DMG bạn +10%; Trái/Phải: DMG hai phía −10%. Có thể chọn Totem/Boss miễn lượt. Phá Totem chuyển hiệu ứng sang boss đúng hai lượt: Venom tăng DMG, Web tiếp tục khóa vị trí, Brood hút máu; sau đó mất. Không trao drop cho Totem.",
  atanna:
    "Ba giấc trong queue công khai: Đòn mạnh/Hút MP/Hồi boss. Mỗi chu kỳ chỉ xóa đúng một giấc, tốn một lượt và vẫn xử lý giấc đang đến nếu nó chưa bị xóa; chịu hai giấc còn lại. Queue và cờ xóa lưu qua restart.",
  inarius:
    "Shield chỉ mở khi Inarius và Lilith cùng trong vòng Ritual. Kéo mất một lượt đưa hai đơn vị vào vòng; Che chở hồi Lilith và bảo vệ hai lượt. Ritual di chuyển theo lịch; Lilith có HP riêng, chết thì run thất bại. Cảnh báo HP NPC luôn nằm trên bảng chính.",
  sescheron:
    "Mã gồm ba rune trong state; hit combat lần lượt mở manh mối cho từng ô. Ba nút nhập rune, mỗi lần nhập là một lượt. Đúng đủ ba: Engine quá tải 2 lượt; sai tăng Rage tối đa 5 và mất HP chuẩn. Không phải đoán mò: có thể đọc toàn mã sau 3 hit.",
  nithogur:
    "Một Neo và một Tua/trận. Neo lưu HP/MP bạn và HP boss; Tua khôi phục đúng ba giá trị, không hồi RNG, vật phẩm, phần thưởng, số lượt hoặc Enrage. Cả hai là một lượt có phản công. Enrage tăng theo lượt với trần riêng từng Depth.",
  kabraxis:
    "Giữ cửa rút tầng 666; bước vào khóa rút. Một HP bar, ba ngưỡng >66%, 33–66%, <33%. Resonance bắt đầu 0 khi vào: War gây DMG +1, Crit thêm +1 (tối đa 2/lượt); Protection sống phản công +1, giảm/chặn ≥40% dự báo thêm +1; Arcane có tiêu/hồi MP +1/lượt. Seal mỗi 3 vòng Phase 1, mỗi 2 vòng Phase 2, tối đa 5; pending không sinh thêm. Thanh tẩy −3 Resonance; phá miễn phí; có thể tiếp tục combat và bỏ qua. Pending sang Phase 3 tính Broken. Phase 3: mỗi Purified +5% DMG bạn, Broken +5% DMG boss và War +3 điểm % Crit/Protection −5 RES/Arcane −1 Max MP hiệu dụng (ít nhất 2). Kết quả khóa, không tạo Seal mới. Phase 2 mỗi hai lượt: War ép CRIT, Protection đánh phép và −10 RES bạn, Arcane hút 1 MP.",
  deimoss:
    "Ba HP bar 30/30/40%; dư DMG không xuyên Spire/bar, chuyển phase không phản công. P1: Ruin tăng vật lý boss, Silence tăng 1 MP Skill mỗi chu kỳ (không vượt Max MP), Hunger hồi 12% DMG thực nhận; menu chọn Spire miễn lượt. P2: Core ở 75/50/25%, khóa stat +8 và curse trước chọn; thiêu −1 MP, cấy nhận STR/ENE/VIT kèm curse +5% DMG nhận/+1% Max HP chi phí Skill/−15% hồi, bỏ mặc hồi boss 2,5% bar trong hai lượt. Chọn Core không mất lượt. P3: chọn Plane miễn lượt cho 3 combat; Material vật lý hai phía +25%/phép −25%, Arcane ngược lại; Void bạn +15% DMG, DEF ×0,75 và RES −20 hai phía, không hồi HP. Ý định 3 đòn kế công khai. Chỉ P3 chết mới nhận thưởng.",
};
function status(s) {
  const x = mech.current(s),
    { b, m, c } = x;
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
      text =
        "Charge " +
        m.charges +
        "/3 · " +
        (active ? "Rune tắt" : "Rune bất tử") +
        " · Vòng Sigil " +
        pattern.map((n) => colors[n]).join(" → ") +
        "; bước " +
        ((m.cursor % 3) + 1) +
        ". Chạm đúng màu tiếp.";
      break;
    case "control":
      text =
        "Shield " +
        (active ? "tắt" : "bật") +
        " · Manh mối: " +
        (m.hints
          ? pattern
              .filter((n) => n !== pattern[m.cursor % 3])
              .slice(0, m.hints)
              .map((n) => names[n])
              .join(", ") + " bị loại"
          : "đánh trúng để lấy manh mối") +
        ". Nhập tần số còn lại.";
      break;
    case "necrobot":
      text =
        "Plating tăng DEF · Barrier tăng RES · Weapon tăng phản công. Core mở khi đã phá hai module; chọn mục tiêu trước đánh.";
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
        "Restoration hồi boss · Tremor gây DMG chuẩn · Drain hút MP. Totem vừa phá hồi sinh sau " +
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
        " · Absorb " +
        m.absorbs.length +
        "/3. Đổi Ward trước đánh.";
      break;
    case "lucion":
      text =
        "Will " +
        m.will +
        "/3 · Lệnh " +
        labels[pattern[b.round % 3]] +
        "; " +
        labels
          .map((l, i) => l + "=" + ["Chống", "Giả vờ", "Phản bội"][i])
          .join(", ") +
        ". " +
        (active ? "Scales đã vỡ." : "Chọn đáp án ứng với rune.");
      break;
    case "bul_kathos":
      text =
        "Thế " +
        ["High Cleave", "Low Sweep", "Feint"][pattern[b.round % 3]] +
        " → " +
        ["Đỡ cao", "Đỡ thấp", "Không mắc lừa"][pattern[b.round % 3]] +
        ". " +
        (m.staggerUntil > b.round ? "Boss stagger." : "⚠ Sai Clash: CRIT.");
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
        ". Bẻ Echo nguy hiểm.";
      break;
    case "gharbad":
      text =
        "Quy luật: dấu " +
        labels[m.surrenderRule] +
        " là thật. Hiện " +
        labels[m.sign] +
        ". Thật: chấp nhận/khám xét; giả: tấn công.";
      break;
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
      text =
        "Dạng " +
        ["Matter", "Energy", "Void"][b.phase - 1] +
        " · Shard " +
        m.shards.map((n) => labels[n]).join(" ") +
        " (" +
        m.shards.length +
        "/3). " +
        (active ? "Overload: DEF/RES 0." : "Ổn định đúng dạng.");
      break;
    case "zakarum":
      text =
        "Halo còn: " +
        m.halos.join(", ") +
        " · đã cướp " +
        (m.stolenHalos.join(", ") || "chưa có") +
        ". Cướp mảnh hợp build; hai mảnh còn lại mạnh trong 2 lượt.";
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
        ". Giữ 40–70.";
      break;
    case "bartuc":
      text =
        "Tether " +
        (m.tether ? "đang nối" : "đã cắt") +
        " · Golem " +
        m.golem +
        "/" +
        c.cap +
        " · DMG giữ " +
        m.golemDamage +
        ". Cắt khi đủ HP.";
      break;
    case "jitan":
      text =
        "Chuỗi cổng " +
        pattern.map((n) => labels[n]).join(" → ") +
        " · cổng kỳ này " +
        labels[pattern[Math.floor(b.round / c.cycle) % 3]] +
        "; kỳ tới " +
        labels[pattern[(Math.floor(b.round / c.cycle) + 1) % 3]] +
        " · Tower " +
        m.towers +
        "/3. Chọn cổng yếu.";
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
        "Bargain " +
        Math.max(0, m.bargain) +
        "/3 lượt · HP chưa hồi được " +
        m.healDebt +
        ". Hiến nhiều tăng cửa sổ, phải đủ HP sống.";
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
        "⚠ Fireblood nổ sau " +
        m.mark +
        " lượt · " +
        (m.reflected ? "đã phản sang boss" : "chưa xử lý") +
        ". Phản −1 MP hoặc dập −1 bình.";
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
        "Manh mối: bóng thật có rune " +
        labels[pattern[Math.floor(b.round / c.cycle) % 3]] +
        "; bóng 1/2/3 mang ◇/△/○. Deception " +
        m.deception +
        "/5 · " +
        (active ? "Boss đã lộ" : "chọn đúng bóng");
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
      text =
        "Inarius " +
        m.inarius +
        " · Lilith " +
        m.lilith +
        " · Ritual " +
        m.ritual +
        " · ⚠ HP Lilith " +
        Math.round(m.lilithHp) +
        "/100. Kéo vào vòng; che chở trước Lilith tử trận.";
      break;
    case "sescheron":
      text =
        "Mã " +
        m.code.map((n, i) => (i < m.hints ? labels[n] : "?")).join(" ") +
        " · đã nhập " +
        m.input.map((n) => labels[n]).join(" ") +
        " · Rage " +
        m.rage +
        "/5. Đánh trúng để đọc mã.";
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
        ". Tua cả hai HP, không lùi lượt/Enrage.";
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
        " Phase 3 khóa kết quả." +
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
      (m.wave ? " · Wave " + m.wave + "/" + m.waves : "");
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
  if (active) text += " · Cửa sổ " + (m.openUntil - b.round) + " lượt.";
  return (
    CATALOG[b.id].mechanic +
    (b.depth ? " · Depth " + ["", "I", "II", "III"][b.depth] : "") +
    "\n" +
    text
  );
}
function details(s) {
  const x = mech.current(s);
  return (
    (x.b.id === "death_projector" && mech.randomBeam(x)
      ? "Tia bắn mỗi lượt, giữ một vùng trong 2 lượt rồi chọn ngẫu nhiên một trong hai vùng còn lại. UI báo chính xác vùng đang bị bắn và số lượt còn lại; hướng đã chọn được lưu khi mở lại. Attack ở vùng an toàn; chuyển vùng tốn lượt và vẫn chịu tia nếu đến vùng đang bị quét."
      : RULES[x.b.id]) +
    "\n\n" +
    status(s) +
    "\n\nChu kỳ " +
    (x.b.id === "death_projector" ? mech.beamCycle(x) : x.c.cycle) +
    "; trần " +
    x.c.cap +
    "; DMG Tấn công/Skill của bạn khi đánh boss ×" +
    (x.b.playerDamageScale || 1).toFixed(2) +
    "; ngân sách hồi boss còn " +
    x.b.healBudget +
    " HP. Đổi mục tiêu/Ward/Plane không tốn lượt. Mỗi hành động riêng của boss tốn một lượt."
  );
}
module.exports = { RULES, status, details };
