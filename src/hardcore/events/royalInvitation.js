"use strict";
const world = require("../engine/world");
const stats = require("../engine/stats");
const { RELIC_ITEMS } = require("../itemRelics");
const { restore } = require("./blessing");
const records = require("../storage/relicRecords");
const { E, eventIcon } = require("../shared/icons");
const WEIGHT = 10;
const { SETS } = require("./royalSets");
function enabled(s) {
  return (
    s.gameplayVersion === 2 &&
    !s.mode?.startsWith("tower") &&
    !s.towerChallengeId
  );
}
function active(s, id) {
  return (
    enabled(s) &&
    s.activeRelic === id &&
    (s.relics || []).some((r) => r.id === id)
  );
}
function ended(s) {
  return ["accepted", "declined"].includes(s.royalInvitation?.status);
}
function members(s, id) {
  const set = SETS[id];
  if (!set) return null;
  const found = set.ids.map((key) =>
    s.items.find((i) => i.definition.id === key),
  );
  return found.every(
    (i) =>
      i &&
      Number.isSafeInteger(i.level) &&
      i.level > 0 &&
      (!i.definition.curse || (i.cleansedLevels || 0) >= i.level),
  )
    ? found
    : null;
}
function eligible(s) {
  if (!enabled(s) || ended(s) || s.hp <= 0) return [];
  return Object.keys(SETS).filter(
    (id) => !(s.relics || []).some((r) => r.id === id) && members(s, id),
  );
}
function encounter(s) {
  const ids = eligible(s);
  if (!ids.length) throw Error("INVALID_ROYAL_INVITATION");
  return {
    type: "surprise",
    kind: "royal_invitation",
    name: "Royal Invitation",
    offers: ids.map((id) => ({
      setId: id,
      items: members(s, id).map((i) => ({
        id: i.definition.id,
        name: i.name,
        level: i.level,
        typeCode: i.definition.typeCode,
      })),
    })),
  };
}
function choices(s) {
  return (s.encounter.offers || []).map((o) => ({
    action: "royal_" + o.setId,
    label: "Giao nộp · " + (SETS[o.setId]?.name || "Set"),
    disabled: !eligible(s).includes(o.setId),
  }));
}
function decline(s) {
  if (!enabled(s) || ended(s) || s.encounter?.kind !== "royal_invitation")
    throw Error("INVALID_ACTION");
  s.royalInvitation = { status: "declined", sourceFloor: s.floor };
  s.lastLog =
    eventIcon("royal_invitation") +
    " **Royal Invitation:** bạn đã từ chối. Giữ nguyên trang bị; thư mời không xuất hiện lại trong run này.";
}
function accept(s, session, id, complete) {
  const e = s.encounter,
    offer = e?.offers?.find((o) => o.setId === id),
    items = members(s, id);
  if (
    e?.type !== "surprise" ||
    e.kind !== "royal_invitation" ||
    !eligible(s).includes(id) ||
    !offer ||
    !items ||
    offer.items.length !== 5 ||
    offer.items.some(
      (i, n) => i.id !== SETS[id].ids[n] || i.level !== items[n].level,
    )
  )
    throw Error("INVALID_ROYAL_INVITATION");
  const floor = s.floor;
  const surrendered = items.map((i) => ({
    id: i.definition.id,
    name: i.name,
    level: i.level,
  }));
  const removed = new Set(items);
  s.items = s.items.filter((i) => !removed.has(i));
  s.royalInvitation = {
    status: "accepted",
    setId: id,
    sourceFloor: floor,
    bossKills: 0,
    surrendered,
  };
  s.lastLog =
    eventIcon("royal_invitation") +
    " Giao nộp **toàn bộ set " +
    SETS[id].name +
    "**, gồm tất cả level: " +
    surrendered.map((i) => i.name + " Lv." + i.level).join(" · ") +
    ". Buff/nội tại của các món này đã rời trang bị.";
  stats.recompute(s);
  complete(); // Resolve this floor's checkpoint/Rift before restoring all HP/MP and removing Rift seals.
  records.record(session, s, id, floor);
  (s.relics ||= []).push({
    id,
    acquiredFloor: floor,
    source: "royal_invitation",
  });
  if (!s.activeRelic) s.activeRelic = id;
  const blessing = restore(s);
  s.evKinds = Array.from(new Set([...(s.evKinds || []), id]));
  s.lastLog +=
    "\n✨ **Phước lành Hoàng Gia:** " +
    E.hp +
    " HP " +
    blessing.hpBefore +
    " → **" +
    blessing.hpAfter +
    "** · " +
    E.mana +
    " MP " +
    blessing.manaBefore +
    " → **" +
    blessing.manaAfter +
    "**; giải mọi nguyền UR còn lại, xóa mọi ấn Rift.\n💠 Nhận **" +
    RELIC_ITEMS[id].name +
    " [LR]**" +
    (active(s, id)
      ? " · Đang hoạt động."
      : " · Chưa kích hoạt vì đã có nội tại LR khác hoạt động.");
  s.phase = "encounter";
  s.encounter = {
    type: "royal_blessing",
    name: "Phước lành Hoàng Gia",
    relicId: id,
    sourceFloor: floor,
    blessing,
    revealedAt: null,
  };
}
function critMultiplier(s) {
  if (!active(s, "kingslayers_testament")) return 1.75;
  const p = RELIC_ITEMS.kingslayers_testament.relicPassive;
  return Math.min(
    p.maxCritMultiplier,
    +(
      p.initialCritMultiplier +
      Math.max(0, s.royalInvitation?.bossKills || 0) * p.multiplierPerBoss
    ).toFixed(8),
  );
}
function recordBoss(s, e) {
  if (
    !active(s, "kingslayers_testament") ||
    e.type !== "combat" ||
    e.hp > 0 ||
    s.hp <= 0 ||
    e.royalBossRecorded ||
    !(
      e.boss?.version === 1 ||
      world.BOSSES.some((b) => b.name === e.name && b.mechanic === e.mechanic)
    ) ||
    e.echoId ||
    e.memoryDebt ||
    e.memoryFamily ||
    e.covenantTrial ||
    e.gildedTrial ||
    !(
      ((s.floor % 50 === 0 || (s.floor === 666 && e.boss?.id === "kabraxis")) &&
        e.rank === "boss") ||
      (s.floor === 999 && e.rank === "final_boss" && e.mechanic === "deimoss")
    )
  )
    return false;
  e.royalBossRecorded = true;
  const before = critMultiplier(s);
  s.royalInvitation ||= { status: "accepted", setId: "kingslayers_testament" };
  s.royalInvitation.bossKills = Math.min(
    10,
    (s.royalInvitation.bossKills || 0) + 1,
  );
  const after = critMultiplier(s);
  if (after > before)
    s.lastLog +=
      "\n" +
      E.crit +
      " **Kingslayer’s Testament:** Crit vật lý ×" +
      before.toLocaleString("vi-VN") +
      " → **×" +
      after.toLocaleString("vi-VN") +
      "**.";
  return true;
}
function freeMagic(s) {
  return (
    active(s, "astral_singularity") &&
    ["sorceress", "necromancer"].includes(s.classKey)
  );
}
function limitGuard(s, action, guard) {
  if (!freeMagic(s) || s.encounter?.type !== "combat") return guard;
  const allowed = Boolean(
    action === "skill" && guard && !s.encounter.astralGuardLastAction,
  );
  s.encounter.astralGuardLastAction = allowed;
  return allowed;
}
function status(s) {
  if (active(s, "kingslayers_testament"))
    return (
      "\n**Hiện tại:** " +
      E.crit +
      " Crit vật lý **×" +
      critMultiplier(s).toLocaleString("vi-VN") +
      "** · " +
      (s.royalInvitation?.bossKills || 0) +
      " Boss định kỳ hạ sau kích hoạt (tối đa 10)."
    );
  if (active(s, "astral_singularity"))
    return freeMagic(s)
      ? "\n**Skill phép:** " +
          E.mana +
          " **0 MP**, kể cả khi có chi phí MP từ nguyền/Paradox; vẫn trả HP. " +
          (s.classKey === "necromancer"
            ? "Skill kế tiếp " +
              (s.encounter?.astralGuardLastAction
                ? "**không chặn**"
                : "**có thể chặn**") +
              " phản công; không chặn hai lượt liên tiếp."
            : "")
      : "\nClass hiện tại dùng Skill vật lý, nên không được miễn MP.";
  return "";
}
function details(s) {
  const e = s.encounter;
  if (e.type === "royal_blessing") {
    const b = e.blessing,
      definition = RELIC_ITEMS[e.relicId];
    return (
      eventIcon("royal_invitation") +
      " **PHƯỚC LÀNH HOÀNG GIA**\n" +
      E.hp +
      " HP " +
      b.hpBefore +
      " → **" +
      b.hpAfter +
      "** · " +
      E.mana +
      " MP " +
      b.manaBefore +
      " → **" +
      b.manaAfter +
      "**\nĐã giải **" +
      b.cleansedLevels +
      "** lớp nguyền UR và xóa **" +
      b.removedRiftStacks +
      "** ấn Rift; giữ Paradox/Contract còn hiệu lực.\n💠 **" +
      definition.name +
      " [LR]** · " +
      (active(s, e.relicId)
        ? "Đang hoạt động"
        : "Chưa kích hoạt vì đã có nội tại LR khác") +
      "\n" +
      definition.text +
      status(s) +
      "\nĐã giao nộp toàn bộ năm món và mọi level. Tiếp tục để xử lý checkpoint hoặc tầng kế tiếp."
    );
  }
  if (e.type !== "surprise" || e.kind !== "royal_invitation") return "";
  return (
    eventIcon("royal_invitation") +
    " **ROYAL INVITATION**\nHoàng gia mời bạn giao nộp một set trọn vẹn. Các món UR trong set phải giải hết nguyền ở tất cả level.\n\n" +
    (e.offers || [])
      .map(
        (o) =>
          "**Set " +
          SETS[o.setId].name +
          " → " +
          RELIC_ITEMS[o.setId].name +
          " [LR]**\n" +
          o.items
            .map(
              (i) =>
                "- " +
                i.name +
                " [" +
                i.typeCode +
                "] · **Lv." +
                i.level +
                "**",
            )
            .join("\n") +
          "\n" +
          RELIC_ITEMS[o.setId].text,
      )
      .join("\n\n") +
    "\n\n**Đồng ý:** mất **toàn bộ 5 món**, gồm tất cả level, buff và nội tại trang bị; không giữ hiệu ứng như Horadric Forge, không hoàn trả. Nếu đủ hai set, chỉ giao nộp set được chọn. Nhận LR, hồi đầy HP/MP theo chỉ số sau giao nộp, giải mọi nguyền UR còn lại và xóa ấn Rift; giữ Paradox/Contract. " +
    (s.activeRelic
      ? "**Đã có LR đang hoạt động:** di vật mới sẽ chưa kích hoạt; phước lành vẫn được nhận. "
      : "Chỉ một nội tại LR hoạt động trong run. ") +
    "\n**Bỏ đi:** giữ trang bị, vượt tầng bình thường; Royal Invitation mất trọng số và không xuất hiện lại trong run này, kể cả khi đủ set khác. Trọng số Royal 10, Purifier 3, event thường 1 trong pool event đặc biệt đủ điều kiện; không phải tỷ lệ trên mọi tầng."
  );
}
module.exports = {
  WEIGHT,
  SETS,
  enabled,
  active,
  ended,
  members,
  eligible,
  encounter,
  choices,
  decline,
  accept,
  critMultiplier,
  recordBoss,
  freeMagic,
  limitGuard,
  status,
  details,
};
