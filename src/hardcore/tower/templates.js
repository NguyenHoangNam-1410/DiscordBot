"use strict";

// Dedicated deterministic monsters for Tower v4. Their tells are public and
// map to exactly one legal response; there are no combat rolls at runtime.
const FIXED_POTION_HEAL = 20;
const MONSTERS = Object.freeze(
  [
    ["gate_sentinel", "Gate Sentinel", "Một lõi, một nhát kết liễu."],
    ["executioner", "Iron Executioner", "Đỡ nhịp hành quyết rồi phản công."],
    ["mana_jailer", "Mana Jailer", "Giữ nhịp MP để mở khóa lõi phép."],
    ["phase_hound", "Phase Hound", "Thân xác và linh thể đổi chỗ theo dấu ấn."],
    [
      "mirror_knight",
      "Mirror Knight",
      "Không đánh vào lớp phản chiếu đang sáng.",
    ],
    [
      "blood_alchemist",
      "Blood Alchemist",
      "Khế ước máu chỉ mở đúng một cửa sổ hồi phục.",
    ],
    [
      "parity_golem",
      "Parity Golem",
      "Đọc lõi vật chất, linh hồn và dấu hành quyết.",
    ],
    [
      "mana_warden",
      "Mana Warden",
      "Không để MP thiếu khi ấn linh hồn xuất hiện.",
    ],
    [
      "twin_shell",
      "Twin-shell Behemoth",
      "Phá đúng lớp giáp đang lộ trước khi chạm lõi.",
    ],
    [
      "scar_collector",
      "Scar Collector",
      "Vết thương phải được chữa đúng nhịp khế ước.",
    ],
    [
      "echo_revenant",
      "Echo Revenant",
      "Mỗi dấu hiệu chỉ có một phản ứng an toàn.",
    ],
    [
      "three_seal_judge",
      "Three-seal Judge",
      "Ba ấn Vật chất, Linh hồn và Hành quyết đều bắt buộc xuất hiện.",
    ],
    [
      "vitality_debtor",
      "Vitality Debtor",
      "HP, MP và bình máu cùng bị kiểm toán.",
    ],
    [
      "memory_archon",
      "Memory Archon",
      "Đọc lại ngôn ngữ dấu ấn dưới chuỗi dài hơn.",
    ],
    [
      "fate_auditor",
      "Fate Auditor",
      "Bài kiểm tra cuối kết hợp mọi dấu ấn và cửa sổ tài nguyên.",
    ],
  ].map(([id, name, rule], index) =>
    Object.freeze({ id, name, rule, tier: index + 1 }),
  ),
);

const TELLS = Object.freeze({
  attack: Object.freeze([
    "Giáp linh hồn khép kín; lõi vật chất màu đỏ lộ ra.",
    "Ấn Vật chất hạ xuống, ma lực bị phản xạ khỏi mục tiêu.",
    "Bóng quái đứng yên trong thân xác; vết nứt đỏ mở trên giáp.",
  ]),
  skill: Object.freeze([
    "Thân xác hóa sương; ấn Linh hồn màu lam hiện rõ.",
    "Lõi vật chất biến mất, chỉ mạch Arcane màu lam còn dao động.",
    "Giáp đỏ đóng lại; linh thể màu lam tách khỏi thân xác.",
  ]),
  defend: Object.freeze([
    "Vương miện đen khóa mục tiêu; đòn Hành quyết đang tụ lực.",
    "Hai lõi cùng tắt và lưỡi chém chí tử đã giương lên.",
    "Ấn Hành quyết phủ kín chiến trường; gây damage lúc này sẽ bị phản sát.",
  ]),
  potion: Object.freeze([
    "Khế ước Máu mở trong một nhịp; cơ thể đang thiếu ít nhất 20 HP.",
    "Bình tế lễ phát sáng; cửa hồi phục cố định 20 HP đã mở.",
    "Ấn Sinh lực chuyển xanh: đây là nhịp duy nhất chấp nhận bình máu.",
  ]),
});

function tellFor(action, floor, floorStep, variant = 0) {
  const pool = TELLS[action];
  if (!pool) throw Error("UNKNOWN_TOWER_TELL");
  return pool[(floor + floorStep + variant) % pool.length];
}

module.exports = { FIXED_POTION_HEAL, MONSTERS, TELLS, tellFor };
