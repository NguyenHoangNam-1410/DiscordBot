"use strict";
const world = require("../services/hardcoreWorld");
const { E, memoryIcon, eventIcon, sealIcon } = require("../services/hardcoreIcons");

const { mainStat } = require("./engine/stats");

const LIMIT = 8;
const DEFINITION =
  "Tháp ghi nhớ lựa chọn của bạn để tạo phước lành, thử thách hoặc hậu quả về sau. Mỗi ký ức có nguồn gốc và điều kiện kích hoạt riêng.";
const CATALOG = Object.freeze({
  rescue: {
    name: "Ân nghĩa · Lost Adventurer",
    source: "Cứu Lost Adventurer",
    get detail() {
      return `Bảo hộ một lần trong cùng khu vực: hồi sinh với 50% HP. Chết bởi RNGesus → sang tầng kế; chết khi đánh quái → ở lại đánh tiếp. Dùng trước ${E.reviveTicket} Vé hồi sinh; hết hiệu lực khi dùng hoặc rời khu vực.`;
    },
  },
  bounty: {
    name: "Truy nã · Bounty Hunter",
    source: "Cướp Lost Adventurer",
    detail:
      "50% bị thu một lần 10% payout hiện tại để bồi thường; 50% gặp Bounty Hunter tinh anh. Khi gặp thợ săn, chọn chiến đấu hoặc trả một lần 20% payout hiện tại để tránh trận đánh. Không giảm hệ số thưởng.",
  },
  blood: {
    name: "Hiến tế máu · Blood Blessing",
    source: "Hiến HP tại Altar of Sacrifice",
    detail:
      "Khi đến hạn, hồi 20% Max HP và 20% Max MP (MP làm tròn lên) cho bạn, thêm 1 bình máu, trong giới hạn bình hiện tại. Không tạo truy nã hoặc trừ payout.",
  },
  wealth: {
    name: "Hiến tế tài sản · Offering Vault",
    source: "Hiến payout tại Altar of Sacrifice",
    detail:
      "Một kho báu xuất hiện: có thể bỏ qua hoặc đánh Vault Guardian tinh anh. Hạ quái nhận bonus xu bằng 150% tiền cược ban đầu của run. Không tự động hoàn tiền; thất bại không nhận bonus.",
  },
  mirror: {
    name: "Dư âm gương · Shattered Reflection",
    source: "Đập Mirror of Fate",
    detail:
      "Mirror Clone tinh anh xuất hiện sau vài tầng, giữ bản sao chỉ số lúc đập gương. Thay thế trận Clone tức thì; không bắt đánh hai lần.",
  },
  divine: {
    name: "Thử thách thần linh · Trial of Faith",
    source: "Cầu nguyện RNGesus thành công",
    detail:
      "Chọn hiến 1 bình máu hoặc hạ Herald of Fate tinh anh để gỡ 1 level nguyền của một món UR, giữ UR/level/buff/nội tại. Nếu không còn món bị nguyền, hồi 20% Max HP và 20% Max MP (MP làm tròn lên). Có thể từ chối, không bị phạt. Đây là sứ giả có thể đánh bại, không phải RNGesus.",
  },
  vengeance: {
    name: "Oán niệm · Restless Spirit",
    source: "Cướp Grave Echo",
    detail:
      "Nhánh 50% thức tỉnh chuyển thành oán niệm truy đuổi sau vài tầng. Chỉ đánh một lần; không rơi lại món đã cướp. Giữ bonus hạ Echo cũ và roll drop quái theo LUCK.",
  },
  legacy: {
    name: "Ký ức từ run cũ",
    source: "Hành động trước khi nâng cấp",
    detail:
      "Giữ nguyên kết quả đã khóa trong run cũ: hồi HP/MP theo cùng tỷ lệ (MP làm tròn lên)/bonus, giảm payout hoặc Bounty Hunter. Không roll lại và không tạo thêm ký ức thông thường mới.",
  },
});

const LEGACY_SOURCES = Object.freeze({
  skip_event: "Bỏ qua sự kiện",
  sacrifice: "Hiến tế ở Altar",
  mirror_break: "Đập Mirror of Fate",
  sell_chest: "Bán hòm",
  bribe_rngesus: "Hối lộ RNGesus",
  pray_rngesus: "Cầu nguyện RNGesus thành công",
  event_rob: "Cướp Lost Adventurer",
  event_rescue: "Cứu Lost Adventurer",
});
const ACTIONS = Object.freeze({
  event_rob: "bounty",
  event_sacrifice_hp: "blood",
  event_sacrifice_payout: "wealth",
  mirror_break: "mirror",
  pray_rngesus: "divine",
  echo_rob: "vengeance",
});

function family(debt) {
  return debt?.version === 2 && CATALOG[debt.family] ? debt.family : "legacy";
}
function title(debt) {
  const key = typeof debt === "string" ? debt : family(debt);
  return memoryIcon(key) + " " + CATALOG[key].name;
}
function canQueue(state) {
  return (state.debts || []).length < LIMIT;
}
function queue(state, action, rng, data = {}) {
  const key = ACTIONS[action];
  if (!key || !canQueue(state)) return null;
  if (key === "wealth" && (!Number.isSafeInteger(data.paid) || data.paid < 1))
    throw new Error("MEMORY_REQUIRES_PAYMENT");
  if (["mirror", "vengeance"].includes(key) && data.enemy?.type !== "combat")
    throw new Error("MEMORY_REQUIRES_ENEMY");
  const debt = {
    version: 2,
    family: key,
    action,
    from: state.floor,
    due: state.floor + 10 + Math.floor(rng() * 21),
    good: ["blood", "wealth", "divine"].includes(key),
    kind: key,
  };
  if (key === "bounty") {
    // Retain the locked 50/50 robbery branches and the old RNG consumption.
    rng();
    debt.kind = rng() < 0.5 ? "tax" : "hunter";
    rng();
    rng();
  }
  if (key === "wealth") debt.coins = Math.floor(state.stake * 1.5);
  if (["mirror", "vengeance"].includes(key)) {
    debt.enemy = structuredClone(data.enemy);
    if (!debt.enemy) throw new Error("MEMORY_REQUIRES_ENEMY");
    delete debt.enemy.echoId;
    delete debt.enemy.echoItem;
    delete debt.enemy.echo;
    delete debt.enemy.itemDrop;
    if (key === "vengeance")
      debt.coins = Math.max(0, Math.floor(data.coins || 0));
  }
  (state.debts ||= []).push(debt);
  state.lastLog += "\n" + title(debt) + ": tháp đã ghi nhận. Xem Rift.";
  return debt;
}

function makeEncounter(state, debt, rng) {
  const key = family(debt);
  let enemy = null;
  if (key === "legacy") {
    if (debt.kind === "hunter")
      enemy = world.makeEnemy(state, "elite", "Bounty Hunter", rng);
  } else if (key === "bounty" && debt.kind === "hunter") {
    enemy = world.makeEnemy(state, "elite", "Bounty Hunter", rng);
  } else if (key === "wealth" || key === "divine") {
    enemy = world.makeEnemy(
      state,
      "elite",
      key === "wealth" ? "Vault Guardian" : "Herald of Fate",
      rng,
    );
  } else if (key === "mirror" || key === "vengeance") {
    enemy = structuredClone(debt.enemy);
  }
  if (enemy) {
    enemy.memoryFamily = key;
    enemy.memoryDebt = { ...debt };
    delete enemy.memoryDebt.enemy;
    if (["wealth", "divine", "vengeance"].includes(key))
      enemy.memoryReward = {
        family: key,
        coins:
          key === "wealth" ? Math.floor(state.stake * 1.5) : debt.coins || 0,
      };
  }
  return { type: "memory", name: CATALOG[key].name, debt, enemy };
}

function actions(state, payout) {
  const debt = state.encounter.debt;
  const key = family(debt);
  if (key === "bounty" && debt.kind === "hunter")
    return [
      { action: "next", label: "Đối mặt thợ săn" },
      {
        action: "memory_settle",
        label: "Bồi thường · 20% payout",
        disabled: payout < 1,
      },
    ];
  if (key === "bounty")
    return [{ action: "next", label: "Bồi thường · 10% payout" }];
  if (key === "wealth")
    return [
      { action: "next", label: "Thử thách kho báu" },
      { action: "memory_decline", label: "Bỏ qua" },
    ];
  if (key === "divine")
    return [
      {
        action: "memory_offering",
        label: "Hiến · 1 bình",
        disabled: state.potions < 1,
      },
      { action: "next", label: "Thử thách sứ giả" },
      { action: "memory_decline", label: "Từ chối" },
    ];
  if (key === "mirror" || key === "vengeance")
    return [{ action: "next", label: "Đối mặt ký ức" }];
  return [
    { action: "next", label: key === "blood" ? "Nhận phúc lành" : "Đi tiếp" },
  ];
}

function fields(state) {
  const output = [
    {
      name: "The Tower Remembers",
      value:
        DEFINITION +
        "\n\n" +
        "Hậu quả đang chờ: **" +
        (state.debts || []).length +
        "/" +
        LIMIT +
        "**. Hậu quả thường đến sau 10–30 tầng, xử lý một lần; boss/RNGesus được ưu tiên. Ân nghĩa bảo hộ theo khu vực; lời tiên tri kích hoạt ở tầng 666." +
        (!canQueue(state)
          ? "\nĐã đầy ký ức: cần xử lý bớt trước khi cướp/hiến tế/đập gương. Cầu nguyện RNGesus vẫn dùng được nhưng không thêm thử thách."
          : ""),
    },
  ];
  if (
    state.prophecy &&
    !state.mode?.startsWith("tower") &&
    !state.towerChallengeId
  ) {
    const kind = state.prophecy.kind;
    const seal =
      { war: "War", protection: "Protection", arcane: "Arcane" }[kind] || kind;
    const stat = mainStat(state);
    const bonus = {
      war: "+8 " + E[stat] + " " + stat.toUpperCase() + " cho bạn",
      protection: "+8 " + E.vit + " VIT, +3 điểm % " + E.res + " RES cho bạn",
      arcane: "+8 " + E.ene + " ENE, +1 " + E.mana + " Max MP cho bạn",
    }[kind];
    output.push({
      name: eventIcon("prophecy") + " The Tower Remembers · Threefold Prophecy",
      value:
        "**Nguồn:** chọn ấn " + sealIcon(kind) + " **" +
        seal +
        "** tại tầng **333**.\n**Tầng 666:** ấn quyết định cơ chế của Kabraxis; xem **Chi tiết** khi gặp boss.\n" +
        (state.prophecy.awakened
          ? "**Đã thức tỉnh:** hạ Kabraxis, nhận thêm " + bonus + "."
          : "**Đang chờ:** hạ Kabraxis để thức tỉnh ấn và nhận thêm " +
            bonus +
            "."),
    });
  }
  const encounter = state.encounter || {};
  const possibilities =
    encounter.type === "rngesus"
      ? ["divine"]
      : encounter.type === "echo"
        ? ["vengeance"]
        : encounter.type === "surprise"
          ? {
              adventurer: ["rescue", "bounty"],
              sacrifice: ["blood", "wealth"],
              mirror: ["mirror"],
            }[encounter.kind] || []
          : [];
  for (const key of possibilities)
    output.push({
      name: title(key) + " · Có thể tạo",
      value:
        "**Nguồn:** " +
        CATALOG[key].source +
        "\n" +
        CATALOG[key].detail +
        (key === "mirror"
          ? "\nĐập gương: 20% +2 LUCK, không tạo ký ức; 80% tạo Dư âm gương."
          : "") +
        (key === "vengeance"
          ? "\nCướp mộ: 50% an toàn; 50% ghi nhận Oán niệm."
          : ""),
    });
  if (state.adventurerRescue)
    output.push({
      name: title("rescue"),
      value:
        CATALOG.rescue.detail +
        "\nHiệu lực đến hết tầng **" +
        state.adventurerRescue.until +
        "**.",
    });
  const current =
    state.encounter?.type === "memory"
      ? state.encounter.debt
      : state.encounter?.memoryDebt;
  const debts = [...(current ? [current] : []), ...(state.debts || [])];
  for (const debt of debts) {
    const key = family(debt);
    let detail = CATALOG[key].detail;
    if (key === "wealth")
      detail +=
        "\nBonus nếu thắng: **" +
        Math.floor(state.stake * 1.5).toLocaleString("vi-VN") +
        "** " +
        E.coin +
        ".";
    if (current === debt && key === "bounty")
      detail =
        debt.kind === "tax"
          ? "Chủ nhân yêu cầu bồi thường: đi tiếp để trừ một lần 10% payout hiện tại."
          : "Bounty Hunter đã tìm đến. Chiến đấu hoặc trả một lần 20% payout hiện tại.";
    if (key === "legacy" && debt.action === "event_rob")
      detail =
        "Hậu quả cướp: " +
        (debt.kind === "tax"
          ? "trừ một lần 10% payout hiện tại."
          : "Bounty Hunter tinh anh.") +
        " Giữ kết quả đã khóa.";
    output.push({
      name: title(debt) + (current === debt ? " · Đang xử lý" : " · Đang chờ"),
      value:
        "**Nguồn:** " +
        (key === "legacy"
          ? LEGACY_SOURCES[debt.action] || "Hành động ở run cũ"
          : CATALOG[key].source) +
        (debt.from ? " · tầng " + debt.from : "") +
        "\n" +
        detail +
        (current === debt
          ? ""
          : "\n**Đến hạn:** tầng " +
            debt.due +
            (state.floor >= debt.due ? " · chờ sau boss/RNGesus." : ".")),
    });
  }
  if (output.length === 1)
    output[0].value += "\nChưa có hậu quả hẹn hoặc bảo hộ đang chờ.";
  return output;
}

module.exports = {
  DEFINITION,
  LIMIT,
  CATALOG,
  family,
  title,
  canQueue,
  queue,
  makeEncounter,
  actions,
  fields,
};
