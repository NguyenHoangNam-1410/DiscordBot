"use strict";
const world = require("../engine/world");
const { RELIC_ITEMS } = require("../itemRelics");
const records = require("../storage/relicRecords");
const {
  E,
  memoryIcon,
  eventIcon,
  relicIcon,
  monsterIcon,
  passiveIcon,
} = require("../shared/icons");
const RELIC_ID = "gilded_soul";
const BOSS_MECHANIC = "avarice_revenant";
const BOSS_NAME = "Avarice Revenant";
const DELAY = 10;
function enabled(state) {
  return (
    state.gameplayVersion === 2 &&
    !state.mode?.startsWith("tower") &&
    !state.towerChallengeId
  );
}
function owns(state) {
  return (state.relics || []).some((r) => r.id === RELIC_ID);
}
function active(state) {
  return enabled(state) && state.activeRelic === RELIC_ID && owns(state);
}
function mark(state) {
  if (!enabled(state) || owns(state) || state.grudge?.stage === "completed")
    return false;
  if (state.grudge) return false; // Repeat robbery keeps the first due floor.
  state.grudge = {
    from: state.floor,
    readyFloor: state.floor + DELAY,
    stage: "waiting",
  };
  state.lastLog +=
    "\n" +
    memoryIcon("grudge") +
    " **Dấu ấn oán hận**: nghi lễ Shrine có thể xuất hiện từ tầng **" +
    state.grudge.readyFloor +
    "**. Xem Rift.";
  return true;
}
function ready(state) {
  return (
    enabled(state) &&
    !owns(state) &&
    state.grudge &&
    state.grudge.stage !== "completed" &&
    state.floor >= state.grudge.readyFloor
  );
}
function isBoss(enemy) {
  return (
    enemy?.type === "combat" &&
    enemy.mechanic === BOSS_MECHANIC &&
    Boolean(enemy.gildedTrial)
  );
}
function potionLocked(state) {
  return isBoss(state.encounter) && state.hp < state.maxHp * 0.4;
}
function summon(state, rng) {
  if (
    state.encounter?.type !== "shrine" ||
    state.encounter.kind !== "ritual" ||
    !ready(state)
  )
    throw new Error("INVALID_ACTION");
  const enemy = world.makeEnemy(state, "boss", BOSS_NAME, rng);
  Object.assign(enemy, {
    mechanic: BOSS_MECHANIC,
    damageType: "mixed",
    critChance: 0.06,
    idleTurns: 0,
    gildedTrial: { from: state.grudge.from, floor: state.floor },
  });
  state.grudge.stage = "trial";
  state.encounter = enemy;
  state.lastLog =
    eventIcon("ritual") +
    " **Nghi lễ Oán Hận** đã triệu hồi " + monsterIcon(enemy) + " **" +
    BOSS_NAME +
    "**. Bạn hành động trước; xem Chi tiết.";
}
function afterAction(state, action, acted, hurt) {
  const enemy = state.encounter;
  if (!isBoss(enemy)) return { skipCounter: false, log: "", recoil: 0 };
  if (action === "ritual_claim")
    return { skipCounter: true, log: "", recoil: 0 };
  const attacking = ["attack", "skill"].includes(action);
  if (!attacking) {
    enemy.idleTurns = (enemy.idleTurns || 0) + 1;
    return {
      skipCounter: enemy.idleTurns === 1,
      recoil: 0,
      log:
        enemy.idleTurns === 1
          ? "\n⏳ Boss chờ một lượt vì bạn không tấn công."
          : "\n⚠️ Bạn không tấn công từ hai lượt liên tiếp: boss chủ động đánh.",
    };
  }
  enemy.idleTurns = 0;
  const recoil = Math.max(0, Math.floor((acted.dealt || 0) * 0.1));
  const before = state.hp;
  if (hurt) hurt(state, recoil, true);
  else state.hp = Math.max(0, state.hp - recoil);
  if (!state.hp)
    state.lastDeathCause =
      BOSS_NAME + " phản phệ 10% DMG bạn thực sự gây ra, khiến HP về 0.";
  return {
    skipCounter: Boolean(acted.critical),
    recoil: before - state.hp,
    log:
      (recoil
        ? "\n" +
          E.hp +
          " **Phản phệ:** " +
          before +
          " → **" +
          state.hp +
          "** (−" +
          (before - state.hp) +
          " HP; 10% DMG thực tế, không Crit/né)."
        : "") +
      (acted.critical && enemy.hp > 0
        ? "\n" +
          E.crit +
          " **CRIT gián đoạn** đòn đánh của boss; vẫn chịu phản phệ."
        : ""),
  };
}
function grant(state, enemy, session) {
  if (
    !enabled(state) ||
    !isBoss(enemy) ||
    enemy.hp > 0 ||
    enemy.gildedTrial.floor !== state.floor ||
    enemy.gildedTrial.from !== state.grudge?.from ||
    state.hp <= 0 ||
    state.grudge?.stage !== "trial" ||
    owns(state)
  )
    throw new Error("INVALID_GILDED_TRIAL");
  records.record(session, state, RELIC_ID, state.floor);
  state.grudge.stage = "completed";
  state.grudge.completedFloor = state.floor;
  (state.relics ||= []).push({
    id: RELIC_ID,
    acquiredFloor: state.floor,
    source: "adventurer_ritual",
  });
  if (!state.activeRelic) state.activeRelic = RELIC_ID;
  state.evCount = (state.evCount || 0) + 1;
  state.evKinds = Array.from(new Set([...(state.evKinds || []), RELIC_ID]));
  state.lastLog +=
    "\n" + relicIcon(RELIC_ID) + " Nhận **Gilded Soul [LR]**" +
    (active(state)
      ? ": tăng DMG Tấn công/Skill theo xu có thể rút trong run, chốt khi vào mỗi combat."
      : ": chưa kích hoạt vì đã có nội tại LR khác hoạt động.") +
    " Dấu ấn oán hận đã kết thúc.";
}
function wealthBonus(coins, stake) {
  if (!Number.isFinite(coins) || !Number.isFinite(stake) || stake <= 0)
    return 0;
  const rules = RELIC_ITEMS[RELIC_ID].relicPassive;
  let result = 0;
  for (const tier of rules.thresholds)
    if (coins >= stake * tier.stakeMultiple) result = tier.damageBonus;
  return Math.min(rules.maxDamageBonus, result);
}
function prepareCombat(state, coins) {
  const enemy = state.encounter;
  if (!active(state) || enemy?.type !== "combat" || enemy.gildedSoulSnapshot)
    return;
  enemy.gildedSoulSnapshot = {
    coins,
    stake: state.stake,
    bonus: wealthBonus(coins, state.stake),
  };
}
function damageBonus(state) {
  return active(state) ? state.encounter?.gildedSoulSnapshot?.bonus || 0 : 0;
}
function fields(state) {
  const mark = state.grudge;
  if (!enabled(state) || !mark || mark.stage === "completed") return [];
  return [
    {
      name: memoryIcon("grudge") + " The Tower Remembers · Dấu ấn oán hận",
      value:
        "**Nguồn:** cướp Lost Adventurer tại tầng **" +
        mark.from +
        "**.\n**Đến hạn:** tầng **" +
        mark.readyFloor +
        "**; từ đó Shrine có **7 nhánh ngang nhau**, nghi lễ **1/7**. Không ép Shrine xuất hiện, không đổi kết quả Shrine đã khóa. Cướp lại không đẩy lùi mốc; hậu quả payout/Bounty Hunter cũ vẫn áp dụng.\n" +
        (mark.stage === "trial"
          ? "**Đang đánh Avarice Revenant.** Hồi sinh giữ nguyên trận và dấu ấn."
          : ready(state)
            ? "**Đã đến hạn:** chờ gặp Shrine nghi lễ. Bỏ qua vẫn giữ dấu ấn."
            : "Chưa đến hạn; sáu nhánh Shrine giữ tỷ lệ cũ.") +
        "\nThắng boss mới nhận **Gilded Soul [LR]** và kết thúc dấu ấn. Không có phước lành hồi HP/MP hoặc giải nguyền; xem Chi tiết khi gặp nghi lễ.",
    },
  ];
}
const BOSS_RULES =
  "Dưới **40% Max HP**: không dùng bình máu; đúng 40% vẫn dùng được. Tấn công/Skill gây phản phệ bằng **10% DMG thực tế** gây lên boss (làm tròn xuống), kể cả đòn kết liễu; không Crit, không né/chặn, không giảm bởi DEF/RES, không kích hoạt phản đòn của trang bị. Phản phệ có thể giết bạn.\nKhông tấn công một lượt: boss chờ; từ lượt thứ hai liên tiếp: boss chủ động đánh. Tấn công/Skill, kể cả trượt, đặt lại bộ đếm. CRIT gây DMG gián đoạn đòn đánh thường của boss trong lượt đó, nhưng vẫn chịu phản phệ. Skill chặn/né và Phòng thủ vẫn áp dụng cho đòn đánh thường.";
function details(state) {
  if (isBoss(state.encounter))
    return (
      monsterIcon(state.encounter) +
      " **Avarice Revenant · Cơ chế**\n" +
      BOSS_RULES +
      "\n\n**Thưởng chắc chắn:** Gilded Soul [LR] nếu hạ boss và sống sót. Không có phước lành; chỉ một nội tại LR hoạt động/run."
    );
  if (state.encounter?.type === "shrine" && state.encounter.kind === "ritual")
    return (
      eventIcon("ritual") +
      " **SHRINE · NGHI LỄ OÁN HẬN (1/7)**\nDấu ấn đã đến hạn. Chọn triệu hồi **Avarice Revenant (Boss)** hoặc bỏ qua để giữ dấu ấn cho Shrine sau. Bạn hành động trước.\n\n" +
      BOSS_RULES +
      "\n\nThắng và sống sót: nhận **Gilded Soul [LR]**. DMG Tấn công/Skill của bạn tăng 10/20/30/40/50% khi xu có thể rút trong run đạt 2/3/4/5/7 lần cược; chốt mỗi combat, không dùng xu trong ví. Không hồi HP/MP, không giải nguyền/ấn Rift."
    );
  return "";
}
function status(state) {
  if (!active(state)) return "";
  const snapshot = state.encounter?.gildedSoulSnapshot;
  return snapshot
    ? "\n" + passiveIcon("runWealthDamage") + " **Combat hiện tại:** +" +
        Math.round(snapshot.bonus * 100) +
        "% DMG cho bạn · chốt theo **" +
        Math.floor(snapshot.coins).toLocaleString("vi-VN") +
        " " +
        E.coin +
        "** của run khi vào trận."
    : "\nMức tăng được chốt khi bạn vào combat tiếp theo.";
}
module.exports = {
  RELIC_ID,
  BOSS_MECHANIC,
  BOSS_NAME,
  DELAY,
  enabled,
  owns,
  active,
  mark,
  ready,
  isBoss,
  potionLocked,
  summon,
  afterAction,
  grant,
  wealthBonus,
  prepareCombat,
  damageBonus,
  fields,
  BOSS_RULES,
  details,
  status,
};
