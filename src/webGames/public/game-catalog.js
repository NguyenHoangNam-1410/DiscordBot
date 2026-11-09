"use strict";

// Shared player guide: Discord catalog and browser rules use the same wording.
((root) => {
  const games = [
    {
      id: "cothu",
      name: "Cờ thú",
      summary: "Dẫn 8 loài thú qua sông, vượt bẫy và chiếm hang địch.",
      setup: [
        "Bàn 7×9, mỗi bên 8 quân ở vị trí cố định, không có lượt bố trí. Người được chọn cầm Đỏ và đi trước.",
        "Đồng hồ Đỏ bắt đầu ngay khi đối thủ tham gia. Mỗi người mặc định 30 phút, không cộng giờ.",
      ],
      play: [
        "Chọn quân của mình → ô đích hợp lệ để xem trước → Xác nhận. Hủy/Escape chỉ bỏ xem trước.",
        "Đi một ô ngang/dọc, không chéo, không bỏ lượt; không vào hang nhà hay ô quân mình. Mạnh ăn yếu hoặc bằng.",
        "Voi 8 > Sư tử 7 > Hổ 6 > Báo 5 > Chó 4 > Sói 3 > Mèo 2 > Chuột 1. Số trên quân mắc bẫy địch là bậc hiệu dụng 0.",
        "Nút Xoay bàn chỉ đổi góc nhìn; tọa độ a1–g9 không đổi. Lịch sử ghi ô đi/đến, nhảy và quân bị ăn.",
      ],
      special: [
        "Chuột trên đất ăn Voi; Voi không ăn Chuột thường. Chuột vẫn thua Mèo.",
        "Chỉ Chuột bơi; hai Chuột trong nước được ăn nhau. Không bắt quân qua bờ nước/đất theo cả hai chiều.",
        "Sư tử/Hổ nhảy qua toàn dải sông ngang/dọc đến ô đất đầu tiên. Mọi Chuột đúng đường nhảy đều chặn, kể cả cùng bên.",
        "Bẫy chỉ làm yếu quân địch về 0. Quân mắc bẫy không bắt được quân, chỉ ra ô trống; ra ngoài phục hồi bậc gốc.",
        "Quân có sức mạnh >0 bắt được mọi thú mắc bẫy của mình, kể cả Voi bắt Chuột. Sức mạnh quân đánh được xét tại ô xuất phát.",
      ],
      win: [
        "Vào hang địch.",
        "Ăn hết quân địch, hoặc đối thủ không có nước đi hợp lệ.",
      ],
      lose: [
        "Đối thủ chiếm hang, ăn hết quân của bạn hoặc bạn bí mọi nước đi.",
      ],
      draw: [
        "Cùng thế cờ và cùng bên đến lượt xuất hiện lần thứ ba, tính cả thế ban đầu.",
        "100 lượt đơn liên tiếp không ăn quân; bắt quân đặt lại bộ đếm. Thắng ưu tiên hơn hòa trong cùng nước đi.",
      ],
    },
    {
      id: "caro",
      name: "Caro",
      summary: "Luân phiên đặt X/O và nối thành hàng.",
      setup: ["Không có bước bố trí. X đi trước khi đủ hai người."],
      play: [
        "Chọn một giao điểm trống để đặt quân. Mỗi lượt đặt một quân rồi đổi lượt.",
        "Nối ngang, dọc hoặc chéo; đọc badge cấu hình để biết số quân cần nối, luật chặn hai đầu và luật đúng số quân.",
      ],
      win: ["Tạo hàng quân hợp lệ theo cấu hình bàn trước đối thủ."],
      lose: ["Đối thủ tạo được hàng quân thắng trước bạn."],
      draw: ["Bàn đầy mà chưa ai tạo được hàng quân thắng."],
    },
    {
      id: "walls",
      name: "Walls / Wall Go",
      summary: "Về hàng đối diện, dùng tường cản đối thủ.",
      setup: [
        "Hai quân xuất phát ở giữa hai hàng ngoài cùng đối diện trên bàn 9×9. Quân xanh đi trước.",
        "Số tường mỗi người và độ dài tường (1 hoặc 2 ô) do chủ phòng chọn.",
      ],
      play: [
        "Mỗi lượt chọn một việc: đi một ô ngang/dọc, hoặc đặt một đoạn tường.",
        "Khi đứng cạnh đối thủ và không bị tường ngăn, có thể nhảy qua. Nếu phía sau đối thủ bị tường hoặc mép bàn chặn, được đi chéo vòng sang bên hợp lệ.",
        "Tường không được chồng/cắt nhau hoặc chặn hết đường về đích của bất kỳ người nào.",
        "Chọn vị trí → Xác nhận. R xoay tường; WASD/phím mũi tên di chuyển.",
      ],
      win: ["Đưa quân tới bất kỳ ô nào của hàng ngoài cùng đối diện trước."],
      lose: ["Đối thủ tới hàng đích trước bạn."],
      draw: [],
    },
    {
      id: "battleship",
      name: "Battleship / Bắn tàu",
      summary: "Giấu hạm đội và bắn chìm toàn bộ tàu địch.",
      setup: [
        "Nhỏ: 8×8, 5 tàu dài 2–4 ô; Vừa: 10×10, 7 tàu dài 2–5; Lớn: 12×12, 10 tàu dài 2–5. Hai bên có cùng danh sách tàu, mỗi độ dài xuất hiện ít nhất một lần.",
        "Kéo thả tàu, hoặc chọn tàu rồi chạm ô để đặt. R/chuột phải khi kéo hoặc nút Xoay đổi hướng. Tàu phải nằm trong biển, không chồng và không sát cạnh tàu khác; được chạm chéo.",
        "Chỉ hiện biển của bạn; trên PC khay tàu nằm bên cạnh. Có 100/140/200 giây tương ứng Nhỏ/Vừa/Lớn để bố trí và nhấn Xác nhận. Cả hai xác nhận mới bắt đầu chiến đấu; hạm đội xanh bắn trước.",
      ],
      play: [
        "Tới lượt, chọn một ô chưa bắn trên biển đối thủ. Mỗi lượt bắn một ô rồi đổi lượt, kể cả bắn trúng.",
        "Trong ván chỉ ô đã bắn mới lộ. Tàu chìm khi toàn bộ ô của nó bị bắn trúng. Khi ván kết thúc, cả hai hạm đội được mở cho người chơi và khán giả.",
        "Dùng nút đổi biển trên điện thoại. Biểu tượng thông tin ở góc biển cho biết các loại tàu chưa chìm.",
      ],
      win: [
        "Đánh chìm toàn bộ tàu đối thủ.",
        "Bạn đã xác nhận bố trí, đối thủ chưa xác nhận khi hết giờ chuẩn bị.",
      ],
      lose: [
        "Toàn bộ tàu của bạn bị đánh chìm.",
        "Bạn chưa xác nhận bố trí khi hết giờ, trong khi đối thủ đã xác nhận.",
      ],
      draw: [
        "Cả hai chưa xác nhận khi hết giờ bố trí: phòng đóng, không có người thắng.",
      ],
    },
    {
      id: "dots",
      name: "Dots & Boxes / Nối ô",
      summary: "Nối cạnh, khép ô để ghi điểm và giữ lượt.",
      setup: [
        "Không có bước bố trí. Bàn có 3×3, 5×5 hoặc 7×7 ô theo cấu hình; người xanh đi trước.",
      ],
      play: [
        "Chọn một cạnh ngang/dọc còn trống giữa hai chấm kề nhau.",
        "Khép một ô được 1 điểm và đi tiếp. Một cạnh khép hai ô được 2 điểm và đi tiếp; nếu không khép ô thì đổi lượt.",
        "Kết thúc khi mọi ô đã có chủ.",
      ],
      win: ["Có nhiều ô hơn đối thủ khi bàn được khép kín."],
      lose: ["Có ít ô hơn đối thủ khi bàn được khép kín."],
      draw: ["Hai bên có số ô bằng nhau khi kết thúc."],
    },
    {
      id: "blokus",
      name: "Blokus Duo",
      summary: "Xếp 21 khối, chạm góc và giữ chỗ trên bàn.",
      setup: [
        "Mỗi người có 21 khối (89 ô) trên bàn 14×14. Quân xanh đi trước.",
        "Khối đầu phải phủ một trong hai dấu sao E5/J10. Đối thủ dùng dấu sao còn lại.",
      ],
      play: [
        "Chọn hoặc kéo khối lên bàn → xoay/lật để xem trước → Xác nhận.",
        "Từ khối thứ hai, phải chạm góc ít nhất một khối cùng màu, không được chạm cạnh cùng màu. Được chạm cạnh đối phương; không chồng hoặc ra ngoài bàn.",
        "Không còn nước hợp lệ thì tự bỏ lượt. Khi cả hai hết nước, tính điểm: mỗi ô còn lại trừ 1; đặt hết khối được +15, hoặc +20 nếu khối cuối là khối 1 ô.",
        "R xoay, F lật, WASD/phím mũi tên dịch vị trí; Enter xác nhận, Esc hủy xem trước.",
      ],
      win: ["Có điểm cao hơn đối thủ khi cả hai hết nước đi."],
      lose: ["Có điểm thấp hơn đối thủ khi cả hai hết nước đi."],
      draw: ["Hai bên bằng điểm."],
    },
    {
      id: "mecung",
      name: "Mê cung",
      summary: "Dựng mê cung kín và tìm lối thoát của đối thủ.",
      setup: [
        "Mỗi người chọn hai ô đầu–đích khác nhau, rồi đặt tường cho đối thủ giải. Luôn phải còn ít nhất một đường từ đầu tới đích; không bắt buộc dùng hết tường.",
        "Trong 5 phút, hoàn tất và nhấn Khóa mê cung. Đã khóa thì không sửa. Cả hai khóa mới bắt đầu; quân xanh đi trước.",
      ],
      play: [
        "Bạn đi trong mê cung do đối thủ dựng. Chọn hướng bằng WASD/phím mũi tên hoặc nút hướng.",
        "Mỗi lần đi một ô ngang/dọc. Không gặp tường thì đi tiếp trong cùng lượt; chạm tường thì đứng nguyên, lộ đoạn tường và đổi lượt.",
        "Ô đã tới được đánh dấu khám phá. Không lộ tường chưa chạm; không đi ra ngoài bàn.",
        "Luật Đến đích trước kết thúc ngay khi có người tới đích. Luật Ít lượt hơn cho đối thủ đi đủ lượt tương ứng để gỡ hòa; chạm tường trong lượt gỡ hòa thì thua. Không so số bước.",
      ],
      win: [
        "Đến đích trước theo luật đua, hoặc đến đích bằng ít lượt hơn theo luật đếm lượt.",
        "Bạn đã khóa mê cung nhưng đối thủ chưa khóa khi hết 5 phút.",
      ],
      lose: [
        "Đối thủ thắng theo luật phòng đã chọn.",
        "Chưa khóa mê cung khi hết giờ chuẩn bị trong khi đối thủ đã khóa.",
      ],
      draw: [
        "Cùng số lượt tới đích theo luật Ít lượt hơn.",
        "Cả hai chưa khóa khi hết giờ chuẩn bị: phòng đóng, không có người thắng.",
      ],
    },
    {
      id: "coquay",
      name: "Cò quay Nga",
      summary: "Đọc đạn, dùng đạo cụ và sống sót sau mỗi phát bắn.",
      setup: [
        "Bàn 2 người, bộ 9 đạo cụ 1v1 + Double or Nothing của Buckshot Roulette. Mặc định 5 HP và 4 đạo cụ chưa dùng/người; chủ phòng có thể đổi cấu hình.",
        "Mỗi hiệp nạp đạn thật và đạn lép theo thứ tự kín. Mở hộp để nhận 1–2 đạo cụ; đồ vượt sức chứa bị bỏ.",
      ],
      play: [
        "Chọn bắn đối thủ hoặc tự bắn. Đạn thật gây 1 sát thương; tự bắn đạn lép giữ lượt, các phát khác đổi lượt trừ khi đối thủ bị còng.",
        "Chọn đạo cụ để đọc công dụng rồi Sử dụng; dùng đạo cụ không mất lượt. Thuốc lá hồi 1 HP, cưa tăng sát thương viên bắn tiếp theo lên 2.",
        "Hết đạn thì nạp hiệp mới và phát hộp đồ. Giữ HP và đạo cụ còn lại; không tự hồi máu.",
        "Nút xoay bàn 180° chỉ đổi góc nhìn. Đạo cụ chỉ tồn tại trong ván, không chuyển vào túi Discord.",
      ],
      special: [
        "Adrenaline cướp và dùng ngay một món bạn chọn của đối thủ; không cướp Adrenaline.",
        "Điện thoại dùng một lần cho riêng bạn biết một viên ngẫu nhiên phía sau viên hiện tại; chỉ còn 1 viên thì không dự đoán được nhưng vẫn tiêu món.",
        "Thuốc hết hạn: 50% hồi 2 HP, 50% mất 1 HP và có thể chết. Thuốc lá là món khác: hồi 1 HP.",
        "Kính lúp/điện thoại chỉ bạn biết; vị trí dự đoán dịch theo các viên đã bắn/loại và cập nhật theo lần đảo đạn.",
        "Mỗi lượt liên tục chỉ dùng một còng. Cưa hết hiệu ứng khi viên đó được bắn hoặc bị bia loại.",
      ],
      win: ["Đưa HP đối thủ về 0."],
      lose: ["HP của bạn về 0, kể cả do tự bắn hoặc dùng Thuốc hết hạn."],
      draw: [],
    },
    {
      id: "santorini",
      name: "Santorini",
      summary: "Đi rồi xây, đưa thợ từ tầng 2 lên tầng 3.",
      setup: [
        "Luật cơ bản, không Thần lực. Bàn 5×5, mỗi người có 2 thợ.",
        "Người đi trước đặt cả hai thợ vào ô trống rồi Xác nhận. Đối thủ đặt hai thợ của mình; sau đó bắt đầu đi và xây. Đồng hồ của bạn chạy cả khi tới lượt đặt thợ.",
      ],
      play: [
        "Chọn một thợ → chọn ô đi → chọn ô xây cạnh thợ vừa đi → Xác nhận.",
        "Đi một ô trong 8 hướng, kể cả chéo. Chỉ leo tối đa 1 tầng; đi ngang hoặc xuống không giới hạn. Không đi vào thợ hay mái vòm.",
        "Xây lần lượt tầng 1 → 2 → 3 → mái vòm tại ô trống cạnh thợ. Có thể xây ô vừa rời; độ cao chỗ xây không phụ thuộc thợ, số khối không giới hạn.",
        "Đi từ tầng 2 lên tầng 3 thắng ngay, không cần xây. Đi ngang giữa hai tầng 3 không tính thắng. Hủy/Esc chỉ bỏ xem trước.",
      ],
      win: [
        "Một thợ của bạn đi từ tầng 2 lên tầng 3.",
        "Đối thủ không còn lượt đi và xây hợp lệ.",
      ],
      lose: [
        "Đối thủ đi từ tầng 2 lên tầng 3 trước bạn.",
        "Bạn không có lượt đi và xây hợp lệ; không được bỏ lượt.",
      ],
      draw: [],
    },
  ];
  const guide = Object.freeze({
    games,
    commonWin: "Đối thủ hết thời gian hoặc đầu hàng trong ván đang đấu.",
    commonLoss: "Hết thời gian của mình hoặc đầu hàng trong ván đang đấu.",
    clock:
      "Mỗi người có đồng hồ riêng (mặc định 30 phút, theo cấu hình bàn). Chỉ giảm khi tới lượt, không cộng giờ; mất kết nối đồng hồ vẫn chạy.",
    access: [
      "Dùng /<game> choi trong Discord để mở phòng; người còn lại bấm Tham gia.",
      "Mở bàn web. Nếu chưa kết nối, sao chép mã xác nhận và nhập tại nút Kết nối tài khoản trong tin phòng Discord.",
      "Khán giả có thể mở bàn để xem trực tiếp, không cần xác nhận tài khoản. Các game này không cược xu.",
    ],
  });
  if (typeof module === "object" && module.exports) module.exports = guide;
  else root.WebGameCatalog = guide;
})(globalThis);
