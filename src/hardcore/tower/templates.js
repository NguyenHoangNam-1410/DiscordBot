"use strict";

// Dedicated deterministic monsters for Tower v4. Their tells are public and
// map to exactly one legal response; there are no combat rolls at runtime.
const FIXED_POTION_HEAL = 20;
const MONSTERS = Object.freeze(
  [
    ["gate_sentinel", "Lính Gác Cổng", "Làm quen với sát thương cố định."],
    ["executioner", "Đao Phủ Sắt", "Có đòn chí tử bắt buộc phải đỡ."],
    ["mana_jailer", "Cai Ngục Mana", "Phải quản lý MP để dùng kỹ năng."],
    [
      "phase_hound",
      "Chó Săn Chuyển Pha",
      "Luân phiên kháng vật lý và kháng phép.",
    ],
    [
      "mirror_knight",
      "Hiệp Sĩ Gương",
      "Đổi trạng thái phòng thủ sau mỗi bước.",
    ],
    [
      "blood_alchemist",
      "Nhà Giả Kim Máu",
      "Có đúng một thời điểm an toàn để hồi máu.",
    ],
    [
      "parity_golem",
      "Golem Đổi Giáp",
      "Kết hợp kháng vật lý, kháng phép và đòn chí tử.",
    ],
    [
      "mana_warden",
      "Giám Ngục Mana",
      "Ép người chơi tích MP trước bước cần kỹ năng.",
    ],
    [
      "twin_shell",
      "Cự Thú Song Giáp",
      "Hai loại giáp thay nhau vô hiệu hóa sát thương.",
    ],
    [
      "scar_collector",
      "Kẻ Thu Thập Vết Thương",
      "Buộc dùng bình máu đúng thời điểm.",
    ],
    [
      "echo_revenant",
      "Oán Linh Vọng Âm",
      "Chuỗi trạng thái dài hơn, mỗi bước chỉ có một cách xử lý.",
    ],
    [
      "three_seal_judge",
      "Quan Tòa Ba Thế",
      "Bắt buộc dùng đòn thường, kỹ năng và phòng thủ.",
    ],
    [
      "vitality_debtor",
      "Chủ Nợ Sinh Mệnh",
      "Kiểm tra đồng thời HP, MP và bình máu.",
    ],
    [
      "memory_archon",
      "Đại Pháp Sư Ký Ức",
      "Lặp lại các trạng thái trong một chuỗi dài.",
    ],
    [
      "fate_auditor",
      "Kẻ Phán Xét Số Mệnh",
      "Kết hợp toàn bộ cơ chế chiến đấu và tài nguyên.",
    ],
  ].map(([id, name, rule], index) =>
    Object.freeze({ id, name, rule, tier: index + 1 }),
  ),
);

const TELLS = Object.freeze({
  attack: Object.freeze([
    "Quái đang KHÁNG PHÉP: kỹ năng không gây sát thương trong bước này.",
    "Lớp chống phép đang bật: chỉ sát thương vật lý có hiệu lực.",
    "Quái vô hiệu hóa kỹ năng ở bước này; giáp vật lý đang mở.",
  ]),
  skill: Object.freeze([
    "Quái đang KHÁNG VẬT LÝ: tấn công thường không gây sát thương.",
    "Giáp vật lý đang đóng; chỉ kỹ năng mới gây sát thương.",
    "Đòn đánh thường bị vô hiệu hóa trong bước này.",
  ]),
  defend: Object.freeze([
    "Quái chuẩn bị ĐÒN CHÍ TỬ: không Phòng thủ sẽ bị hạ gục.",
    "Đòn kế tiếp gây sát thương lớn hơn Max HP; chỉ Phòng thủ mới chặn được.",
    "Quái đang lấy đà kết liễu người chơi; không thể dùng đòn tấn công ở bước này.",
  ]),
  potion: Object.freeze([
    "Quái tạm ngừng tấn công: đây là thời điểm dùng bình hồi đúng 20 HP.",
    "Không đòn đánh nào có hiệu lực ở bước này; có thể hồi đúng 20 HP.",
    "Cửa sổ hồi máu đang mở và sẽ đóng sau bước này.",
  ]),
});

function tellFor(action, floor, floorStep, variant = 0) {
  const pool = TELLS[action];
  if (!pool) throw Error("UNKNOWN_TOWER_TELL");
  return pool[(floor + floorStep + variant) % pool.length];
}

module.exports = { FIXED_POTION_HEAL, MONSTERS, TELLS, tellFor };
