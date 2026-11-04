"use strict";
const { timeMinutes } = require("../webGames/clock");
const SIZE = 5;
function normalizeRules(input = {}) {
  const first = input.first ?? "host";
  if (!["host", "guest", "random"].includes(first))
    throw Object.assign(
      new Error("Chọn người đi trước: chủ phòng, khách hoặc ngẫu nhiên."),
      { code: "INVALID_RULES" },
    );
  return Object.freeze({ timeMinutes: timeMinutes(input.timeMinutes), first });
}
function rulesText(input) {
  const r = normalizeRules(input);
  return `Cơ bản · 5×5 · 2 thợ/người · Không Thần lực · ${r.timeMinutes} phút/người`;
}
const RULES_TEXT =
  "`/santorini choi` mở phòng web cho 2 người, luật cơ bản không Thần lực. Bàn 5×5, mỗi người 2 thợ. Người đi trước đặt cả hai thợ vào ô trống, rồi đối thủ đặt hai thợ của mình. Mỗi lượt chọn một thợ, đi sang một trong 8 ô cạnh (kể cả chéo), rồi xây bằng chính thợ đó ở một ô trống bên cạnh. Có thể đi ngang, xuống bao nhiêu tầng cũng được, chỉ lên tối đa 1 tầng. Không đi vào thợ hoặc mái vòm. Xây lần lượt tầng 1 → 2 → 3 → mái vòm; chiều cao chỗ xây không phụ thuộc chiều cao của thợ. Có thể xây lại ô vừa rời. Đi từ tầng 2 lên tầng 3 thắng ngay, không cần xây; đi ngang giữa hai tầng 3 không tính thắng. Không có lượt đi và xây hợp lệ thì thua, không được bỏ lượt. Số khối xây không giới hạn. UI chọn thợ → ô đi → ô xây → Xác nhận; Hủy/Esc chỉ xóa xem trước. `nguoitruoc` chọn chủ phòng/khách/ngẫu nhiên (thay quy tắc người trẻ nhất vì bot không hỏi tuổi). `thoigian` 1–180 phút/người, mặc định 30, dùng cả khi đặt thợ, chỉ giảm khi tới lượt và không cộng giờ. Hết giờ hoặc đầu hàng thì thua; chờ đối thủ tối đa 10 phút. `/santorini phong` xem phòng/khán giả; `/santorini cauhinh phongtoida` cho quản trị đặt 1–20 phòng/kênh (mặc định 5). Không cần /quantri datkenh, không cược xu hoặc thưởng thành tựu. Hỗ trợ !santorini và mã kết nối tài khoản như các game web khác.";
module.exports = { SIZE, normalizeRules, rulesText, RULES_TEXT };
