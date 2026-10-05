"use strict";
const DIRECT = {
  attack: [
    "Giáp nứt chỉ nhận đòn vật lý.",
    "Ấn hữu hình vô hiệu phép thuật.",
    "Lõi lộ thiên phản xạ phép; đòn thường phá lõi.",
  ],
  skill: [
    "Thân thể linh hồn không nhận đòn thường.",
    "Lõi Arcane chỉ nhận damage từ kỹ năng.",
    "Cổng phép đóng trước mọi đòn vật lý.",
  ],
  defend: [
    "Dấu hành quyết phản lại mọi damage; hãy che chắn lượt này.",
    "Đòn phản chiếu đang tích năng lượng; đánh vào sẽ gãy chuỗi.",
    "Quái chuẩn bị đòn chí tử, lớp phòng thủ là lối sống duy nhất.",
  ],
};
const RESOURCE = {
  attack: [
    "Cần phá ấn mà vẫn tích MP cho bước kế; phép tiêu MP vào bẫy.",
    "Cửa vật lý nạp MP khi đánh; đứng yên không giải được khóa.",
    "Lõi yếu đang hở, phải giữ phần MP dành cho pha phép sau.",
  ],
  skill: [
    "MP đã đủ cho lõi phép; tích thêm khiến khóa tài nguyên đóng.",
    "Đòn thường không phá được ấn; nguồn MP hiện tại dành cho phép này.",
    "Cửa phép yêu cầu dùng đúng lượng MP đang dự trữ trước khi khóa.",
  ],
  defend: [
    "Đòn kế cần MP và khiên; không được tiêu tài nguyên vào lõi phản xạ.",
    "Tạm ngừng gây damage để tích MP; ấn sẽ tự đổi pha sau che chắn.",
    "Nguồn MP của lớp chắn phải được giữ cho bước kế; hai đòn đánh kích bẫy.",
  ],
};
const DELAYED = {
  attack: [
    "Khoản nợ từ lựa chọn trước chỉ nhận thanh toán vật lý.",
    "Khế ước đầu run đổi màu: bóng là phép, thân là đòn thường.",
    "Dấu đã giữ trước đó mở lõi hữu hình; phá lõi trước khi thu nợ.",
  ],
  skill: [
    "Khế ước đã chọn chuyển khoản nợ sang lõi phép.",
    "Hiệu lực trì hoãn mở ấn linh hồn; đòn thường sẽ vi phạm lời hứa.",
    "Dấu đã giữ làm giáp vật lý bất biến trong nhịp này.",
  ],
  defend: [
    "Lãi nợ đến hạn: giữ khiên, không trả bằng damage.",
    "Khế ước buộc giữ tài nguyên qua nhịp thu nợ; đánh là phá cam kết.",
    "Dấu cũ phản lại cả vật lý và phép trong một lượt.",
  ],
};
function makeClue(category, action, variant, context) {
  const template = category + "_" + action + "_" + variant;
  if (category === "memory")
    return {
      template,
      text:
        "Gương hồi âm: thực hiện nhịp " +
        context.memoryIndex +
        " của chuỗi tầng " +
        context.memoryFloor +
        " theo thứ tự đảo ngược. Nhịp đã ghi không đổi.",
    };
  if (category === "class") {
    const p = context.profile,
      band = context.hpRange || [0, 0];
    const suffix = {
      reflection:
        action === "skill"
          ? "Mặt gương phép đang mở."
          : action === "attack"
            ? "Mặt gương phản xạ phép, lõi vật lý đang mở."
            : "Gương phản lại cả hai đòn đánh trong nhịp này.",
      regeneration:
        "Cửa sinh lực yêu cầu HP trước hành động trong khoảng " +
        band[0] +
        "–" +
        band[1] +
        ". " +
        (action === "skill"
          ? "Nhịp rễ cần Wildfire và hồi phục."
          : action === "attack"
            ? "Rễ hữu hình phải bị cắt, không dùng hồi phục."
            : "Rễ phản xạ đang siết; giữ thế thủ."),
      ward:
        action === "skill"
          ? "Đặt Soul Ward cho phản công kế tiếp; đòn thường không xuyên ấn."
          : action === "attack"
            ? "Lõi vật lý lộ ra; kiểm tra Ward trước phản công."
            : "Không chạm vào lõi phản xạ; giữ Ward nếu còn.",
      shield:
        action === "skill"
          ? "Ý định phép xuyên giáp thường; Divine Shield chặn đòn hiện tại."
          : action === "attack"
            ? "Giáp phép đóng, điểm yếu vật lý mở."
            : "Ý định vật lý dồn lực; phòng thủ giảm damage và nạp MP.",
      barrage:
        action === "skill"
          ? "Hai charge chắn, ba hit Barrage để xuyên lớp cuối."
          : action === "attack"
            ? "Lõi không có charge; chỉ một hit vật lý được chấp nhận."
            : "Các hit bị phản lại lượt này; chờ lớp chắn đổi pha.",
      rage:
        action === "skill"
          ? "Giáp ở breakpoint của Armor Break; đòn thường không đủ xuyên."
          : action === "attack"
            ? "Lõi vật lý mở; Rage chỉ hoạt động khi HP ≤35%."
            : "Giữ HP trong ngưỡng sinh tồn; hai đòn đánh kích phản xạ.",
      dodge:
        action === "skill"
          ? "Phản công khóa mục tiêu: Shadow Step né đòn này, phản kích cố định."
          : action === "attack"
            ? "Bóng địch mất dấu, điểm yếu vật lý mở."
            : "Bẫy bóng phản lại cả hai đòn; che chắn nhịp này.",
    }[p.mechanic];
    return {
      template: template + "_" + p.mechanic,
      text:
        [
          "Ấn class đang mở: ",
          "Trụ class kiểm tra nhịp: ",
          "Cổng class đổi pha: ",
        ][variant] + suffix,
    };
  }
  const pool =
    category === "resource"
      ? RESOURCE
      : category === "delayed"
        ? DELAYED
        : DIRECT;
  return { template, text: pool[action][variant] };
}
function eventChoices(kind, nonce) {
  const a = kind + "_" + nonce + "_keep",
    b = kind + "_" + nonce + "_spend";
  const choices = {
    hp_fork: [
      { action: a, label: "Giữ khế ước: chịu 3 HP, giữ dấu nợ đến tầng 12" },
      { action: b, label: "Hồi đầy HP, xóa khế ước" },
    ],
    paradox: [
      {
        action: a,
        label:
          "Mana Fracture: chi phí skill giảm 1 MP (tối thiểu 1); đòn thường +0 MP",
      },
      { action: b, label: "Blood Pact: tăng damage ngay, trả HP mỗi skill" },
    ],
    mana_fork: [
      { action: a, label: "Giữ MP và nhịp đã ghi cho Gương tầng 14" },
      { action: b, label: "Hồi đầy MP, đổi nhịp Gương" },
    ],
    purification: [
      { action: a, label: "Giữ dấu nợ, chỉ thanh tẩy bẫy hiện tại" },
      { action: b, label: "Xóa toàn bộ dấu nợ và hiệu ứng" },
    ],
  }[kind];
  return choices;
}
module.exports = { makeClue, eventChoices };
