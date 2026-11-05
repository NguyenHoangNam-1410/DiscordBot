"use strict";
const { timeMinutes } = require("../webGames/clock");
const RULES_ID = "cothu-vn-v1",
  WIDTH = 7,
  HEIGHT = 9;
const ANIMALS = Object.freeze({
  elephant: { name: "Voi", rank: 8 },
  lion: { name: "Sư tử", rank: 7 },
  tiger: { name: "Hổ", rank: 6 },
  leopard: { name: "Báo", rank: 5 },
  dog: { name: "Chó", rank: 4 },
  wolf: { name: "Sói", rank: 3 },
  cat: { name: "Mèo", rank: 2 },
  rat: { name: "Chuột", rank: 1 },
});
const validCell = (n) => Number.isInteger(n) && n >= 0 && n < WIDTH * HEIGHT;
function coord(n) {
  return validCell(n)
    ? String.fromCharCode(97 + (n % WIDTH)) + (HEIGHT - Math.floor(n / WIDTH))
    : null;
}
function index(s) {
  return typeof s === "string" && /^[a-g][1-9]$/.test(s)
    ? (HEIGHT - Number(s[1])) * WIDTH + s.charCodeAt(0) - 97
    : null;
}
const TERRAIN = Object.freeze(
  Array.from({ length: 63 }, (_, cell) => {
    const at = coord(cell);
    if (at === "d1" || at === "d9")
      return Object.freeze({
        kind: "den",
        owner: at === "d1" ? "red" : "blue",
      });
    if (["c1", "e1", "d2", "c9", "e9", "d8"].includes(at))
      return Object.freeze({
        kind: "trap",
        owner: Number(at[1]) < 5 ? "red" : "blue",
      });
    return Object.freeze({
      kind: /^[bcef][456]$/.test(at) ? "water" : "land",
      owner: null,
    });
  }),
);
function normalizeRules(input = {}) {
  const first = input.first ?? "host";
  if (
    !["host", "guest", "random"].includes(first) ||
    (input.rulesId && input.rulesId !== RULES_ID)
  )
    throw Object.assign(
      new Error(
        "Chọn người đi trước: chủ phòng, khách hoặc ngẫu nhiên; bộ luật cố định cothu-vn-v1.",
      ),
      { code: "INVALID_RULES" },
    );
  return Object.freeze({
    first,
    timeMinutes: timeMinutes(input.timeMinutes),
    rulesId: RULES_ID,
  });
}
function rulesText(input) {
  const r = normalizeRules(input);
  return `7×9 · 8 thú/người · Đỏ đi trước · ${r.timeMinutes} phút/người · ${RULES_ID}`;
}
const RULES_TEXT =
  "Cờ thú · cothu-vn-v1: /cothu choi mở bàn 7×9 cho 2 người, mỗi bên 8 thú. Đỏ đi trước; chọn nguoitruoc:host|guest|random và thoigian:1–180 (mặc định 30 phút/người, không cộng giờ). Đồng hồ bắt đầu ngay khi đối thủ tham gia. Mỗi lượt chọn quân → ô đích → Xác nhận; đi ngang/dọc một ô, không chéo, không bỏ lượt, không vào hang nhà. Bậc Voi 8 > Sư tử 7 > Hổ 6 > Báo 5 > Chó 4 > Sói 3 > Mèo 2 > Chuột 1; mạnh ăn yếu hoặc bằng. Chuột đất ăn Voi; Voi không ăn Chuột bình thường. Chỉ Chuột xuống nước; hai Chuột trong nước ăn nhau, không được bắt qua ranh giới nước/đất. Sư tử/Hổ nhảy qua toàn dải sông ngang/dọc; bất kỳ Chuột nào đúng đường nhảy đều chặn. Bẫy địch làm bậc hiệu dụng về 0: không bắt quân, chỉ thoát ra ô trống; ra ngoài phục hồi. Quân có bậc >0 ăn được mọi thú mắc bẫy của mình, kể cả Voi ăn Chuột mắc bẫy. Vào hang địch, ăn hết quân hoặc làm đối thủ bí mọi nước thì thắng. Lặp cùng thế 3 lần (cùng bên đến lượt) hoặc 100 lượt đơn không ăn quân thì hòa; thắng ưu tiên hơn hòa. Hết giờ/đầu hàng thì thua, mất mạng không dừng giờ. /cothu phong xem phòng, /cothu cauhinh phongtoida cho quản trị đặt 1–20 (mặc định 5). Có khán giả, lịch sử nước đi, xem lại kết quả và xoay bàn. Không cược hay thưởng tài nguyên.";
module.exports = {
  RULES_ID,
  WIDTH,
  HEIGHT,
  ANIMALS,
  TERRAIN,
  validCell,
  coord,
  index,
  normalizeRules,
  rulesText,
  RULES_TEXT,
};
