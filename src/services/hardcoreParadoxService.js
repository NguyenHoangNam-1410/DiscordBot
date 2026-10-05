"use strict";
const { E, eventIcon } = require("./hardcoreIcons");
const CATALOG = Object.freeze({
  blood_pact: {
    name: "🩸 Huyết Ước",
    text: `**Bạn** gây ${E.attack} **DMG** **×1,30**. Mỗi Skill trừ ${E.hp} **HP** của **bạn** bằng **5%** ${E.hp} **Max HP**, làm tròn xuống và tối thiểu **1 HP**; cần còn ít nhất **1 HP** sau chi phí.`,
  },
  mana_fracture: {
    name: "🔷 Mana Vỡ Vụn",
    text: `Skill của **bạn** tốn ${E.mana} **MP** **1**; Class Shrine miễn phí vẫn tốn **0 MP**. Tấn công hồi ${E.mana} **MP** **+0**; Phòng thủ hồi ${E.mana} **MP** **+1** cho **bạn**.`,
  },
  inverted_armor: {
    name: "🛡️ Giáp Nghịch Đảo",
    text: `**Bạn** nhận ${E.attack} **DMG vật lý** **×0,75** sau ${E.defense} **DEF**. ${E.res} **RES** hiệu dụng của **bạn** giảm **20 điểm phần trăm**, giới hạn **−50% đến 75%**.`,
  },
  inverted_magic: {
    name: "🔮 Ma Pháp Nghịch Đảo",
    text: `${E.res} **RES** hiệu dụng của **bạn** tăng **20 điểm phần trăm**, tối đa **75%**. **Bạn** nhận ${E.attack} **DMG vật lý** **×1,35** sau ${E.defense} **DEF**.`,
  },
  hunger: {
    name: "🍖 Cơn Đói",
    text: `Khi hạ quái, **bạn** hồi ${E.hp} **HP** bằng **12%** ${E.hp} **Max HP**, làm tròn xuống và tối thiểu **1 HP**. Hiệu lực ${E.potion} **bình của bạn** giảm còn **×0,50**; tỷ lệ hồi cuối cùng giới hạn **10%–75%** ${E.hp} **Max HP**.`,
  },
  time_debt: {
    name: "⏳ Nợ Thời Gian",
    text: `Hai lần Tấn công/Skill đầu mỗi trận của **bạn** gây ${E.attack} **DMG** **×1,25**. Đúng hành động thứ **3** của bạn, tính cả Phòng thủ/Bình: **quái** còn sống sẽ phản công **2 lần**.`,
  },
  blood_mirror: {
    name: "🪞 Gương Máu",
    text: `Khi **bạn** còn ${E.hp} **HP** **≤40%** ${E.hp} **Max HP**: ${E.attack} **DMG** của bạn **×1,40** và được dùng bình. Khi HP của **bạn** **>40%** ${E.hp} **Max HP**: không dùng được ${E.potion} **bình**.`,
  },
  unstable_soul: {
    name: "👻 Linh Hồn Bất Ổn",
    text: `Mỗi lượt, Skill của **bạn** có **25%** cơ hội tốn ${E.mana} **MP** **0**; **15%** tốn thêm **1 MP**; **60%** dùng chi phí bình thường. Class Shrine miễn phí vẫn tốn ${E.mana} **MP** **0**. Chi phí được chốt cho lượt hiện tại; mở lại UI không đổi kết quả.`,
  },
});
const PAIRS = Object.freeze({
  resource: ["blood_pact", "mana_fracture"],
  defense: ["inverted_armor", "inverted_magic"],
  pressure: ["hunger", "time_debt"],
  volatility: ["blood_mirror", "unstable_soul"],
});
function active(s) {
  const p = s.activeParadox;
  return p?.version === 2 && s.floor >= p.startFloor && s.floor <= p.endFloor
    ? p
    : null;
}
function is(s, id) {
  return active(s)?.id === id;
}
function encounter(milestone, rng) {
  const ids = Object.keys(PAIRS);
  const pairId = ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))];
  return {
    type: "paradox",
    version: 2,
    milestone,
    pairId,
    choices: [...PAIRS[pairId]],
  };
}
function choose(s, id) {
  const e = s.encounter;
  s.paradoxMilestonesClaimed ||= [];
  if (s.paradoxMilestonesClaimed.includes(e.milestone))
    throw new Error("STALE_ACTION");
  if (
    e.version !== 2 ||
    !e.choices.includes(id) ||
    !PAIRS[e.pairId]?.includes(id)
  )
    throw new Error("INVALID_ACTION");
  s.paradoxMilestonesClaimed.push(e.milestone);
  s.activeParadox = {
    version: 2,
    id,
    pairId: e.pairId,
    milestone: e.milestone,
    startFloor: e.milestone + 1,
    endFloor: e.milestone + 5,
    combatActionCount: 0,
    attackActionCount: 0,
    lockedSkillCost: null,
  };
}
function expire(s, floor) {
  if (s.activeParadox && floor >= s.activeParadox.endFloor)
    delete s.activeParadox;
}
function hpCost(s) {
  return is(s, "blood_pact") ? Math.max(1, Math.floor(s.maxHp * 0.05)) : 0;
}
function manaCost(s, free = false) {
  if (free) return 0;
  if (is(s, "unstable_soul")) {
    if (!Number.isInteger(active(s).lockedSkillCost))
      throw new Error("UNLOCKED_SKILL_COST");
    return active(s).lockedSkillCost;
  }
  return is(s, "mana_fracture") ? 1 : 2;
}
function prepareCombat(s, rng, free = false) {
  const p = active(s),
    e = s.encounter;
  if (!p || e?.type !== "combat") return;
  const key = p.id + ":" + p.milestone;
  if (e.paradoxPrepared !== key) {
    e.paradoxPrepared = key;
    p.combatActionCount = 0;
    p.attackActionCount = 0;
    p.lockedSkillCost = null;
  }
  if (p.id === "unstable_soul" && p.lockedSkillCost === null) {
    const r = rng();
    p.lockedSkillCost = free ? 0 : r < 0.25 ? 0 : r < 0.4 ? 3 : 2;
  }
}
function afterAction(s, action) {
  const p = active(s);
  if (!p) return;
  p.combatActionCount++;
  if (["attack", "skill"].includes(action)) p.attackActionCount++;
  p.lockedSkillCost = null;
}
function outgoing(s) {
  const p = active(s);
  if (!p) return 1;
  if (p.id === "blood_pact") return 1.3;
  if (p.id === "time_debt" && (p.attackActionCount || 0) < 2) return 1.25;
  if (p.id === "blood_mirror" && s.hp <= s.maxHp * 0.4) return 1.4;
  return 1;
}
function effectiveRes(s, res) {
  return Math.max(
    -50,
    Math.min(
      75,
      res + (is(s, "inverted_armor") ? -20 : is(s, "inverted_magic") ? 20 : 0),
    ),
  );
}
function incoming(s, magic) {
  return magic
    ? 1
    : is(s, "inverted_armor")
      ? 0.75
      : is(s, "inverted_magic")
        ? 1.35
        : 1;
}
function potionRate(s) {
  return Math.max(
    0.1,
    Math.min(0.75, s.potionRate * (is(s, "hunger") ? 0.5 : 1)),
  );
}
function potionLocked(s) {
  return is(s, "blood_mirror") && s.hp > s.maxHp * 0.4;
}
function describe(s) {
  const p = active(s);
  return p
    ? eventIcon("paradox") +
        " **Rift Paradox** · " +
        CATALOG[p.id].name +
        " · còn " +
        (p.endFloor - s.floor + 1) +
        " tầng (" +
        p.startFloor +
        "–" +
        p.endFloor +
        ")\n" +
        CATALOG[p.id].text +
        (p.id === "unstable_soul" && p.lockedSkillCost !== null
          ? "\nSkill của bạn lượt này: " +
            E.mana +
            " **MP** **" +
            p.lockedSkillCost +
            "**."
          : "")
    : "";
}
function choicesText(e) {
  return (
    eventIcon("paradox") +
    " **RIFT PARADOX — HIỆU LỰC 5 TẦNG**\nTầng " +
    (e.milestone + 1) +
    "–" +
    (e.milestone + 5) +
    ". Chọn một luật; không đổi payout.\n\n" +
    e.choices
      .map((id) => "**" + CATALOG[id].name + "**\n" + CATALOG[id].text)
      .join("\n\n")
  );
}
module.exports = {
  CATALOG,
  PAIRS,
  active,
  is,
  encounter,
  choose,
  expire,
  hpCost,
  manaCost,
  prepareCombat,
  afterAction,
  outgoing,
  effectiveRes,
  incoming,
  potionRate,
  potionLocked,
  describe,
  choicesText,
};
