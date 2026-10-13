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
const boosted = (s) => Boolean(data(s).mimic && data(s).ancientMimic);
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
  if (m.vulnerable || m.vitalBlessing || s.hp <= 1)
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
        "Chống Tax Collector. Đến hết run: không gặp lại Tax Collector; Boss/Final Boss gây thêm 20% DMG lên bạn. Không cộng dồn, không bị giải nguyền UR/xóa Rift gỡ bỏ.",
    });
  if (m.underworld)
    r.push({
      name: eventIcon("potion_thief") + " Underworld Lead",
      value:
        "Hạ The Thief. Đến hết run: Diamond Merchant và Rift Merchant miễn phí; giữ tối đa 1 món/lần gặp và Diamond Merchant tối đa 2 lần gặp/run. Không gặp lại The Thief; Elite gây thêm 30% DMG lên bạn. Không hoàn các khoản mua trước đó; không cộng dồn.",
    });
  if (m.vulnerable)
    r.push({
      name: eventIcon("healer") + " Vulnerable",
      value:
        "Hiến máu cho Healer. Checkpoint không hồi HP ở tầng " +
        m.vulnerable.from +
        "–" +
        m.vulnerable.due +
        "; vẫn nhận bình và chọn thuộc tính. Sau khi vượt tầng " +
        m.vulnerable.due +
        ", Healer trở lại ở tình huống hợp lệ kế tiếp để hồi đầy HP/MP và trao Vital Benediction.",
    });
  if (m.vitalBlessing)
    r.push({
      name: eventIcon("healer") + " Vital Benediction",
      value:
        "Đã hoàn thành Hiến máu: LUCK +40; STR, DEX, VIT, ENE mỗi chỉ số +10 đến hết run. Chỉ một lần/run; đã tính trong chỉ số nhân vật.",
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
