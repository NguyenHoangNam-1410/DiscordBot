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
  ])
    if (m[k] != null && typeof m[k] !== "boolean")
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
const boosted = (s) => Boolean(data(s).mimicBoost || (data(s).mimic && data(s).ancientMimic && data(s).mimicBoost !== false));
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
  if (!require("../towerMemories").canQueue(s) || m.vulnerable || m.vitalBlessing || s.hp <= 1)
    throw Error("INVALID_ACTION");
  const before = s.hp;
  s.hp = Math.max(1, s.hp - Math.ceil(s.hp * 0.7));
  m.vulnerable = { from: s.floor, due: s.floor + 10 };
  return before - s.hp;
}
function fields(s) {
  const m = data(s),
    r = [];
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
        "Checkpoint không hồi HP đến hết tầng " + m.vulnerable.due + "; sau đó Healer trở lại hồi đầy HP/MP và đổi thành Vital Benediction.",
    });
  if (m.vitalBlessing)
    r.push({
      name: eventIcon("healer") + " Vital Benediction",
      value:
        "Đến hết run: LUCK +40; STR/DEX/VIT/ENE +10 (đã tính vào chỉ số).",
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
  fields,
};
