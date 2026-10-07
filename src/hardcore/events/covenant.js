"use strict";
const world = require("../engine/world");
const { RELIC_ITEMS } = require("../itemRelics");
const { restore } = require("./blessing");
const { E } = require("../shared/icons");
const records = require("../storage/relicRecords");
const RELIC_ID = "conquerors_covenant";
const FRAGMENTS = Object.freeze({
  mimic: "Mảnh Nanh Giả · Mimic",
  ancient_mimic: "Mảnh Cổ Ấn · Ancient Mimic",
  blood_mimic: "Mảnh Huyết Tâm · Blood Mimic",
  mirror_clone: "Mảnh Phản Chiếu · Mirror Clone",
});
function enabled(state) {
  return (
    state.gameplayVersion === 2 &&
    !state.mode?.startsWith("tower") &&
    !state.towerChallengeId
  );
}
function owns(state) {
  return (state.relics || []).some((item) => item.id === RELIC_ID);
}
function progress(state) {
  return state.covenant || { fragments: {}, kills: 0, completed: false };
}
function fragmentCount(state) {
  return Object.keys(FRAGMENTS).filter(
    (key) => progress(state).fragments?.[key] != null,
  ).length;
}
function canEnter(state) {
  return (
    enabled(state) &&
    !progress(state).completed &&
    !owns(state) &&
    fragmentCount(state) === 4
  );
}
function active(state) {
  return enabled(state) && state.activeRelic === RELIC_ID && owns(state);
}
function bonus(state) {
  const rules = RELIC_ITEMS[RELIC_ID].relicPassive;
  const kills = Number.isSafeInteger(progress(state).kills)
    ? Math.max(0, progress(state).kills)
    : 0;
  return active(state)
    ? Math.min(rules.maxBonus, kills * rules.bonusPerKill)
    : 0;
}
function source(enemy) {
  const kind = world.mimicKind(enemy);
  if (kind) return kind;
  if (enemy.rank === "mimic") return "mimic";
  if (
    enemy.memoryFamily === "mirror" &&
    enemy.memoryDebt?.action === "mirror_break"
  )
    return "mirror_clone";
  return null;
}
function recordKill(state, enemy) {
  if (
    !enabled(state) ||
    enemy.type !== "combat" ||
    enemy.hp > 0 ||
    state.hp <= 0 ||
    enemy.covenantKillRecorded
  )
    return false;
  enemy.covenantKillRecorded = true;
  const quest = (state.covenant ||= {
    fragments: {},
    kills: 0,
    completed: false,
  });
  if (active(state)) {
    const previous = bonus(state);
    quest.kills = Math.min(500, Math.max(0, quest.kills || 0) + 1);
    const current = bonus(state);
    if (current > previous)
      state.lastLog +=
        "\n💠 Conqueror’s Covenant: thưởng xu +" +
        (previous * 100).toFixed(1) +
        "% → **+" +
        (current * 100).toFixed(1) +
        "%**.";
  }
  const key = source(enemy);
  if (!key || quest.completed || owns(state) || quest.fragments[key] != null)
    return false;
  quest.fragments[key] = state.floor;
  state.lastLog +=
    "\n🧩 Nhận **" + FRAGMENTS[key] + "** (" + fragmentCount(state) + "/4).";
  if (canEnter(state))
    state.lastLog += " Wrong Portal tiếp theo mở cửa tầng hầm; xem Túi.";
  return true;
}
function beginTrial(state, rng) {
  if (
    state.encounter?.type !== "trap" ||
    state.encounter.kind !== "portal" ||
    !canEnter(state)
  )
    throw new Error("INVALID_ACTION");
  const enemy = world.makeEnemy(state, "elite", "Covenant Guardian", rng);
  enemy.hp = enemy.maxHp = Math.round(enemy.maxHp * 1.25);
  enemy.damageMin = Math.max(1, Math.round(enemy.damageMin * 1.1));
  enemy.damageMax = Math.max(
    enemy.damageMin,
    Math.round(enemy.damageMax * 1.1),
  );
  enemy.covenantTrial = { floor: state.floor };
  state.covenant.stage = "trial";
  state.encounter = enemy;
  state.lastLog =
    "🗝️ Xuống tầng hầm: **Covenant Guardian** chặn đường. Bốn mảnh vẫn được giữ cho đến khi bạn thắng.";
}
function grant(state, enemy, session) {
  if (
    !enemy.covenantTrial ||
    enemy.type !== "combat" ||
    enemy.hp > 0 ||
    state.hp <= 0 ||
    state.cleared !== enemy.covenantTrial.floor ||
    state.covenant?.stage !== "trial" ||
    !canEnter(state)
  )
    throw new Error("INVALID_COVENANT_TRIAL");
  const acquiredFloor = enemy.covenantTrial.floor;
  records.record(session, state, RELIC_ID, acquiredFloor);
  state.covenant.fragments = {};
  state.covenant.completed = true;
  state.covenant.stage = "completed";
  state.covenant.kills = 0;
  (state.relics ||= []).push({
    id: RELIC_ID,
    acquiredFloor,
    source: "mimic_fragments",
  });
  if (!state.activeRelic) state.activeRelic = RELIC_ID;
  const blessing = restore(state);
  state.evCount = (state.evCount || 0) + 1;
  state.evKinds = Array.from(
    new Set([...(state.evKinds || []), "conquerors_covenant"]),
  );
  state.lastLog +=
    "\n✨ **Phước lành Chinh Phạt:** " +
    E.hp +
    " **HP " +
    blessing.hpBefore +
    " → " +
    blessing.hpAfter +
    "** · " +
    E.mana +
    " **MP " +
    blessing.manaBefore +
    " → " +
    blessing.manaAfter +
    "**; giải mọi nguyền UR, xóa mọi ấn Rift.\n💠 Hợp nhất bốn mảnh, nhận **Conqueror’s Covenant [LR]**" +
    (active(state)
      ? ": mỗi quái hạ từ bây giờ tăng 0,2 điểm % thưởng xu, tối đa +100%."
      : ": chưa kích hoạt vì đã có nội tại LR khác hoạt động.");
  state.phase = "encounter";
  state.encounter = {
    type: "covenant_blessing",
    name: "Phước lành Chinh Phạt",
    sourceFloor: acquiredFloor,
    blessing,
    revealedAt: null,
  };
}
function bagText(state) {
  const quest = progress(state);
  if (quest.completed)
    return "Đã hợp nhất bốn mảnh thành **Conqueror’s Covenant [LR]**.";
  return (
    Object.entries(FRAGMENTS)
      .map(([key, name]) =>
        quest.fragments?.[key] != null
          ? "✅ **" + name + "** · tầng " + quest.fragments[key]
          : "▫️ " + name,
      )
      .join("\n") +
    "\n**" +
    fragmentCount(state) +
    "/4 mảnh** · " +
    (quest.stage === "trial"
      ? "Đang đánh Covenant Guardian ở tầng hầm; thắng mới tiêu thụ bốn mảnh."
      : canEnter(state)
        ? "Wrong Portal tiếp theo bảo đảm mở cửa tầng hầm. Thắng thử thách cuối để hợp nhất."
        : "Mỗi nguồn cho 100% một mảnh ở lần hạ đầu tiên trong run, độc lập với LUCK.") +
    "\nMảnh chỉ tồn tại trong run; xem Chi tiết của portal để đọc thử thách."
  );
}
function combatDetails(state) {
  const enemy = state.encounter;
  if (!enabled(state)) return "";
  if (enemy.covenantTrial)
    return "\n🗝️ **Thử thách tầng hầm:** một Tinh anh có HP ×1,25 và DMG ×1,10 so với Tinh anh cùng tầng/Rift. Hạ quái bảo đảm tiêu thụ bốn mảnh, nhận Conqueror’s Covenant [LR], hồi đầy HP/MP, giải mọi nguyền UR và xóa ấn Rift; giữ Paradox/Contract. Không có roll thưởng thêm. Hồi sinh vẫn ở lại đánh; rút thưởng hoặc tử trận kết thúc chuỗi của run.";
  const key = source(enemy);
  return key &&
    !progress(state).completed &&
    !owns(state) &&
    progress(state).fragments?.[key] == null
    ? "\n🧩 **Mảnh LR:** hạ quái này bảo đảm nhận " +
        FRAGMENTS[key] +
        " (lần đầu trong run), độc lập với drop LUCK; thưởng cũ giữ nguyên."
    : "";
}
module.exports = {
  RELIC_ID,
  FRAGMENTS,
  enabled,
  progress,
  fragmentCount,
  canEnter,
  active,
  bonus,
  source,
  recordKill,
  beginTrial,
  grant,
  bagText,
  combatDetails,
};
