"use strict";
const { timeMinutes } = require("../webGames/clock");
const SIZE = 14;
const STARTS = Object.freeze([4 * SIZE + 4, 9 * SIZE + 9]);
function normalizeRules(input = {}) {
  return Object.freeze({ timeMinutes: timeMinutes(input.timeMinutes) });
}
function rulesText(input) {
  const rules = normalizeRules(input);
  return `Duo · 14×14 · 21 quân/người · Chỉ chạm góc cùng màu · ${rules.timeMinutes} phút/người, không cộng giờ`;
}
const RULES_TEXT =
  "`/blokus choi` mở Blokus Duo cho 2 người, bàn 14×14; mỗi người 21 quân (89 ô). Quân xanh đi trước, quân đầu phải phủ một trong hai dấu ★ E5/J10; quân cam dùng dấu còn lại. Được xoay/lật quân. Từ quân thứ hai, phải chạm ít nhất một góc quân cùng màu, không chạm cạnh; được chạm cạnh đối phương, không chồng quân hoặc ra ngoài bàn. Hết nước hợp lệ sẽ tự bỏ lượt; đối thủ vẫn tiếp tục. Khi cả hai hết nước, mỗi ô chưa đặt bị trừ 1 điểm. Đặt hết 21 quân được +15 điểm, hoặc +20 nếu quân cuối là quân 1 ô. Điểm cao hơn thắng, bằng điểm thì hòa. Chọn quân → chạm bàn để xem trước → Xác nhận; R xoay, F lật, WASD/phím mũi tên dịch vị trí, Enter đặt, Esc hủy. `/blokus phong` xem/chơi trực tiếp; `/blokus cauhinh phongtoida` giới hạn 1–20 phòng/kênh (mặc định 5). Mỗi người tối đa 1 phòng Blokus/server. Người chơi nhập mã trên web tại nút Kết nối tài khoản trong Discord; khán giả chỉ xem. `thoigian` 1–180 phút, mặc định 30 phút/người; chỉ giảm khi tới lượt, không cộng giờ; hết giờ hoặc đầu hàng thì thua. Phòng chờ đóng sau 10 phút. Không cược, không thưởng xu.";
module.exports = { SIZE, STARTS, normalizeRules, rulesText, RULES_TEXT };
