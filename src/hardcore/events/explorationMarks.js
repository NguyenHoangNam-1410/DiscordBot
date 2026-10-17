"use strict";
const { E, eventIcon } = require("../shared/icons");
function enabled(s) {
  return (
    s?.gameplayVersion === 3 &&
    !s.mode?.startsWith("tower") &&
    !s.towerChallengeId
  );
}
function data(s) {
  return enabled(s) ? s.explorationMarks || {} : {};
}
function ensure(s) {
  if (!enabled(s)) throw Error("INVALID_EXPLORATION_MARK");
  return (s.explorationMarks ||= { version: 1 });
}
function normalize(s) {
  if (!enabled(s) || !s.explorationMarks) return;
  const m = s.explorationMarks;
  if (m.version !== 1) throw Error("INVALID_EXPLORATION_MARK");
  for (const k of [
    "outlaw",
    "underworld",
    "vitalBlessing",
    "mimic",
    "ancientMimic",
    "mimicBoost",
    "taxCompliant",
    "thiefAccepted",
    "thiefChallenged",
  ])
    if (m[k] != null && typeof m[k] !== "boolean")
      throw Error("INVALID_EXPLORATION_MARK");
  if (
    (m.taxRelief != null && !["ready", "used"].includes(m.taxRelief)) ||
    (m.thiefAftercare != null &&
      !["ready", "used", "unavailable"].includes(m.thiefAftercare))
  )
    throw Error("INVALID_EXPLORATION_MARK");
  if (
    m.vulnerable &&
    (!Number.isSafeInteger(m.vulnerable.from) ||
      !Number.isSafeInteger(m.vulnerable.due) ||
      m.vulnerable.due !== m.vulnerable.from + 10 ||
      m.vitalBlessing)
  )
    throw Error("INVALID_EXPLORATION_MARK");
}
const boosted = (s) =>
  Boolean(
    data(s).mimicBoost ||
    (data(s).mimic && data(s).ancientMimic && data(s).mimicBoost !== false),
  );
const incoming = (s, e = s.encounter) =>
  e?.rank === "elite" && data(s).underworld
    ? 1.3
    : ["boss", "final_boss"].includes(e?.rank) && data(s).outlaw
      ? 1.2
      : 1;
const freeMerchant = (s, kind) =>
  Boolean(data(s).underworld && ["merchant", "diamond_shop"].includes(kind));
function freeOffers(s, e) {
  if (freeMerchant(s, e?.kind))
    for (const offer of e.offers || []) offer.price = 0;
}
const vulnerable = (s) =>
  Boolean(
    data(s).vulnerable &&
    s.floor >= data(s).vulnerable.from &&
    s.floor <= data(s).vulnerable.due,
  );
const healerDue = (s) =>
  Boolean(data(s).vulnerable && s.cleared >= data(s).vulnerable.due);
function blood(s) {
  const m = ensure(s);
  if (
    !require("../towerMemories").canQueue(s) ||
    m.vulnerable ||
    m.vitalBlessing ||
    s.hp <= 1
  )
    throw Error("INVALID_ACTION");
  const before = s.hp;
  s.hp = Math.max(1, s.hp - Math.ceil(s.hp * 0.7));
  m.vulnerable = { from: s.floor, due: s.floor + 10 };
  return before - s.hp;
}
function accept(s, kind) {
  if (!enabled(s)) return false;
  const m = ensure(s);
  if (kind === "tax" && !m.outlaw) {
    const first = !m.taxCompliant;
    m.taxCompliant = true;
    return first;
  }
  if (kind === "potion_thief" && !m.thiefChallenged && !m.underworld) {
    const first = !m.thiefAccepted;
    m.thiefAccepted = true;
    return first;
  }
  return false;
}
function oppose(s, kind) {
  const m = ensure(s);
  if (kind === "tax") {
    m.taxCompliant = false;
    delete m.taxRelief;
  } else {
    m.thiefAccepted = false;
    m.thiefChallenged = true;
    delete m.thiefAftercare;
  }
}
const taxReliefAvailable = (s) =>
  Boolean(data(s).taxCompliant && !data(s).outlaw && data(s).taxRelief === "ready");
function useTaxRelief(s) {
  if (!taxReliefAvailable(s)) throw Error("INVALID_ACTION");
  ensure(s).taxRelief = "used";
}
function finishAftercare(s, used) {
  const m = data(s);
  if (
    !m.thiefAccepted || m.thiefChallenged || m.underworld ||
    m.thiefAftercare !== "ready"
  )
    throw Error("INVALID_ACTION");
  m.thiefAftercare = used ? "used" : "unavailable";
}
function awardMilestones(s, floor) {
  if (!enabled(s)) return;
  const m = data(s);
  const queue = (key) => {
    if (!s.pendingMilestones.includes(key)) s.pendingMilestones.push(key);
  };
  if (floor >= 950 && m.taxCompliant && !m.outlaw && !m.taxRelief) {
    m.taxRelief = "ready";
    queue("tax_relief");
    s.lastLog += `\n${eventIcon("tax")} Chấp hành thuế đầy đủ: nhận **1 lượt giải toàn bộ nguyền của 1 trang bị miễn phí**. Có thể để dành; hết hiệu lực khi kết thúc run.`;
  }
  if (floor === 998) {
    if (taxReliefAvailable(s)) queue("tax_relief");
    if (
      m.thiefAccepted && !m.thiefChallenged && !m.underworld &&
      !m.thiefAftercare
    ) {
      m.thiefAftercare = "ready";
      queue("thief_aftercare");
    }
  }
}
function fields(s) {
  const m = data(s),
    r = [];
  if (m.taxCompliant && !m.outlaw)
    r.push({
      name: eventIcon("tax") + " Chấp hành thuế đầy đủ",
      value: m.taxRelief === "used"
        ? "Đã dùng lượt giải nguyền miễn phí cho 1 trang bị. Tax Collector ngừng xuất hiện từ tầng 950."
        : m.taxRelief === "ready"
          ? s.encounter?.type === "combat" && s.floor === 999
            ? "Chưa dùng lượt giải nguyền miễn phí trước trận cuối; quyền lợi hết khi kết thúc run."
            : "Còn 1 lượt giải toàn bộ nguyền của 1 trang bị miễn phí. Dùng tại Purifier hoặc cuộc gặp trước tầng 999; chỉ dùng trong run này."
          : "Sau khi vượt boss 950: nhận 1 lượt giải toàn bộ nguyền của 1 trang bị miễn phí. Tax Collector ngừng xuất hiện từ tầng 950. Chống trả sẽ hủy quyền lợi đang chờ; Lucky Break vẫn tính là hợp tác.",
    });
  if (m.thiefAccepted && !m.thiefChallenged && !m.underworld)
    r.push({
      name: eventIcon("potion_thief") + " Dịch vụ hậu mãi",
      value: m.thiefAftercare === "used"
        ? "Đã dùng dịch vụ: xóa toàn bộ stack của 1 loại Rift có hại trước trận tầng 999."
        : m.thiefAftercare === "unavailable"
          ? "Đã gặp trùm băng đảng; không có Rift phù hợp để xóa."
          : "Sau khi vượt tầng 998: gặp trùm băng đảng, chọn xóa toàn bộ stack của 1 loại Rift có hại, trừ Unstable Rift. Không cần chiến đấu; chỉ 1 lần/run. Đánh đuổi sẽ hủy quyền lợi; Lucky Break vẫn tính là hợp tác.",
    });
  if (m.outlaw)
    r.push({
      name: eventIcon("tax") + " Royal Outlaw",
      value:
        "Đến hết run: không gặp Tax Collector; Boss/Final Boss gây thêm 20% DMG.",
    });
  if (m.underworld)
    r.push({
      name: eventIcon("potion_thief") + " Underworld Lead",
      value:
        "Đến hết run: miễn phí Diamond/Rift Merchant (1 món/lần; Diamond tối đa 2 lần/run); không gặp The Thief; Elite gây thêm 30% DMG.",
    });
  if (m.vulnerable)
    r.push({
      name: eventIcon("healer") + " Vulnerable",
      value:
        "Checkpoint không hồi HP đến hết tầng " +
        m.vulnerable.due +
        "; sau đó Healer trở lại hồi đầy HP/MP và đổi thành Vital Benediction.",
    });
  if (m.vitalBlessing)
    r.push({
      name: eventIcon("healer") + " Vital Benediction",
      value: "Đến hết run: LUCK +40; STR/DEX/VIT/ENE +10 (đã tính vào chỉ số).",
    });
  if (boosted(s))
    r.push({
      name: E.chest + " Dấu vết Mimic",
      value:
        "Đã hạ Mimic và Ancient Mimic. Đến hết run: trọng số Blood Fountain/Mirror of Fate ×2; nhánh Blood Mimic trong Blood Fountain ×2 (tối đa 100%). Không cộng dồn theo số lần hạ.",
    });
  return r;
}
module.exports = {
  enabled,
  data,
  ensure,
  normalize,
  boosted,
  incoming,
  freeMerchant,
  freeOffers,
  vulnerable,
  healerDue,
  blood,
  accept,
  oppose,
  taxReliefAvailable,
  useTaxRelief,
  finishAftercare,
  awardMilestones,
  fields,
};
