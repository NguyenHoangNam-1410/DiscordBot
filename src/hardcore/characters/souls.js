"use strict";
const catalog = require("./index");
const tuning = require("./soulTuning.json");
const { E, soulIcon } = require("../shared/icons");
function enabled(s) {
  return (
    s.gameplayVersion === 3 &&
    s.classInnateRevision === 2 &&
    !s.mode?.startsWith("tower") &&
    !s.towerChallengeId
  );
}
function level(s) {
  return enabled(s) ? s.characterSoul?.soulLevel || 0 : 0;
}
const has = (s, n) => level(s) >= n;
function parameters(n) {
  return {
    bloodlust: n >= 1 ? 1.18 : 1.15,
    wild: n >= 1 ? 1.25 : 1.2,
    vindicate: n >= 1 ? 1.18 : 1.15,
    anchor: n >= 1 ? 1.2 : 1.15,
    furyRate: n >= 3 ? 0.18 : 0.15,
    focusRate: n >= 3 ? 0.8 : 0.7,
    avoidBase: n >= 1 ? 0.07 : 0.05,
    titanDefense: n >= 1 ? 1.35 : 1.25,
    shieldRate: n >= 1 ? 0.22 : 0.2,
    critHeal: n >= 2 ? 0.025 : 0.02,
    paladinHeal: n >= 2 ? 0.04 : 0.03,
    killHeal: n >= 5 ? 0.25 : 0.2,
    holyScale: n >= 3 ? 0.23 : 0.2,
    shadowCrit: n >= 3 ? 0.25 : 0.2,
    shadowMultiplier: n >= 6 ? 0.35 : 0.25,
    furyBarrier: n >= 4 ? 0.06 : 0.05,
    echo: n >= 3 ? 0.9 : 0.8,
    echoShield: n >= 4 ? 0.18 : 0.15,
    echoExtra: n >= 5 ? 0.25 : 0.2,
    barkBase: n >= 3 ? 0.05 : 0.04,
    barkCap: n >= 4 ? 0.22 : 0.18,
    healRate: n >= 5 ? 0.11 : 0.1,
    nova: n >= 3 ? 0.75 : 0.65,
  };
}
const value = (s, key) =>
  (s.characterSoul?.parameters || parameters(level(s)))[key];
function snapshot(id, soulLevel = 0) {
  const c = catalog.get(id);
  if (!c || !Number.isSafeInteger(soulLevel) || soulLevel < 0 || soulLevel > 6)
    throw Error("INVALID_CHARACTER_SOUL");
  return {
    version: 1,
    characterId: id,
    profileKey: c.profileKey,
    soulLevel,
    parameters: parameters(soulLevel),
    tuningVersion: tuning.version,
    bossMultiplier: soulLevel === 6 ? tuning.bossMultipliers[c.profileKey] : 1,
  };
}
function attach(s, id, soulLevel = 0) {
  const value = snapshot(id, soulLevel);
  if (
    !enabled(s) ||
    value.profileKey !== s.classKey ||
    s.turn > 0 ||
    s.cleared > 0
  )
    throw Error("INVALID_CHARACTER_SOUL");
  s.characterSoul = value;
  if (s.classKey === "venance") require("./venance").attach(s);
  if (s.encounter?.innateCombat?.actions === 0) delete s.encounter.innateCombat;
  return value;
}
function validate(s) {
  const v = s.characterSoul;
  if (v == null) return;
  if ((s.mode?.startsWith("tower") || s.towerChallengeId) && v.soulLevel === 0)
    return;
  if (
    (!enabled(s) && v.soulLevel !== 0) ||
    v.version !== 1 ||
    v.tuningVersion !== 1 ||
    catalog.get(v.characterId)?.profileKey !== s.classKey ||
    v.profileKey !== s.classKey ||
    !Number.isSafeInteger(v.soulLevel) ||
    v.soulLevel < 0 ||
    v.soulLevel > 6 ||
    !Number.isFinite(v.bossMultiplier) ||
    v.bossMultiplier < 1 ||
    v.bossMultiplier > 5 ||
    (v.soulLevel < 6 && v.bossMultiplier !== 1)
  )
    throw Error("INVALID_CHARACTER_SOUL");
  if (
    v.parameters &&
    (Object.keys(v.parameters).sort().join() !==
      Object.keys(parameters(0)).sort().join() ||
      Object.values(v.parameters).some(
        (n) => !Number.isFinite(n) || n < 0 || n > 5,
      ))
  )
    throw Error("INVALID_CHARACTER_SOUL_PARAMETERS");
  const f = s.encounter?.soulCombat;
  if (
    f &&
    (f.version !== 1 ||
      !Number.isSafeInteger(f.novaHits) ||
      f.novaHits < 0 ||
      !Number.isFinite(f.guardBarrier) ||
      f.guardBarrier < 0)
  )
    throw Error("INVALID_CHARACTER_SOUL_FRAME");
}
function frame(s) {
  return has(s, 1) ? s.encounter?.soulCombat || null : null;
}
function prepare(s) {
  if (!has(s, 1) || s.encounter?.type !== "combat") return null;
  if (s.encounter.soulCombat) return s.encounter.soulCombat;
  const f = (s.encounter.soulCombat = {
    version: 1,
    basicAttempt: false,
    basicMana: false,
    critMana: false,
    wildMana: false,
    guardUsed: false,
    guardBarrier: 0,
    shieldMana: false,
    barkRescue: false,
    barkBroken: false,
    firstEcho: false,
    echoAction: false,
    firstHoly: false,
    holyAction: false,
    novaHits: 0,
    furyMana: false,
    basicAccuracy: false,
  });
  const a = s.classAwakening;
  if (a && has(s, 4) && s.classKey === "amazon") a.focus = Math.max(1, a.focus);
  if (a && has(s, 4) && s.classKey === "assassin")
    a.shadow = Math.max(1, a.shadow);
  if (has(s, 2) && s.classKey === "necromancer" && s.encounter.innateCombat)
    s.encounter.innateCombat.anchorProgress = 1;
  return f;
}
function begin(s, action) {
  const f = prepare(s);
  if (!f) return;
  f.basicAccuracy =
    s.classKey === "amazon" &&
    has(s, 2) &&
    action === "attack" &&
    !f.basicAttempt;
  if (action === "attack") f.basicAttempt = true;
  f.echoAction =
    s.classKey === "sorceress" &&
    has(s, 6) &&
    action === "skill" &&
    s.classAwakening?.echo > 0 &&
    !f.firstEcho;
  if (f.echoAction) f.firstEcho = true;
  f.holyAction =
    s.classKey === "paladin" &&
    has(s, 6) &&
    ["attack", "skill"].includes(action) &&
    s.encounter.innateCombat?.vindicateAction &&
    !f.firstHoly;
  if (f.holyAction) f.firstHoly = true;
}
const bloodlust = (s) => value(s, "bloodlust");
const wild = (s) => value(s, "wild");
const vindicate = (s) => value(s, "vindicate");
const anchor = (s) => value(s, "anchor");
const furyRate = (s) => value(s, "furyRate");
const focusRate = (s) => value(s, "focusRate");
const furyFinisher = (s, n) => (has(s, 6) && n === 3 ? 1.1 : 1);
const focusMain = (s, full) => (has(s, 6) && full ? 1.1 : 1);
function echoMain(s, preview = false) {
  return has(s, 6) &&
    (preview
      ? frame(s)?.echoAction || (s.classAwakening?.echo && !frame(s)?.firstEcho)
      : frame(s)?.echoAction)
    ? 1.1
    : 1;
}
function holyFactor(s, preview = false) {
  return has(s, 6) &&
    (preview
      ? frame(s)?.holyAction ||
        (s.encounter?.innateCombat?.vindicate && !frame(s)?.firstHoly)
      : frame(s)?.holyAction)
    ? 1.2
    : 1;
}
const novaFactor = (s) => (has(s, 6) && frame(s)?.novaHits === 1 ? 1.15 : 1);
const bossFactor = (s) =>
  has(s, 6) && ["boss", "final_boss"].includes(s.encounter?.rank)
    ? s.characterSoul.bossMultiplier
    : 1;
function awakeningTuning(s, base) {
  if (!has(s, 1)) return base;
  const v = { ...base };
  if (s.classKey === "barbarian" && has(s, 4))
    v.furyBarrier = value(s, "furyBarrier");
  if (s.classKey === "sorceress") {
    if (has(s, 3)) v.echo = value(s, "echo");
    if (has(s, 4)) v.echoShield = value(s, "echoShield");
    if (has(s, 5)) v.echoExtra = value(s, "echoExtra");
  }
  if (s.classKey === "druid") {
    if (has(s, 3)) v.barkBase = value(s, "barkBase");
    if (has(s, 4)) v.barkCap = value(s, "barkCap");
    if (has(s, 5)) v.healRate = value(s, "healRate");
  }
  if (s.classKey === "necromancer" && has(s, 3)) v.nova = value(s, "nova");
  return v;
}
function mana(s, amount = 1) {
  const before = s.mana;
  s.mana = Math.min(
    require("../bosses/mechanics").effectiveMaxMana(s),
    s.mana + amount,
  );
  if (s.mana !== before && s.encounter?.boss) s.encounter.boss.mpChanged = true;
  return s.mana - before;
}
function defend(s) {
  const f = frame(s);
  if (
    f &&
    s.classKey === "barbarian" &&
    has(s, 2) &&
    !f.guardUsed &&
    s.hp <= s.maxHp * 0.5
  ) {
    f.guardUsed = true;
    f.guardBarrier = Math.floor(s.maxHp * 0.03);
    return (
      "\n" +
      soulIcon(s.characterSoul.characterId, 2) +
      " " +
      E.defense +
      " Tinh hồn S2: lá chắn " +
      f.guardBarrier +
      " HP."
    );
  }
  return "";
}
function absorb(s, amount) {
  const f = frame(s);
  if (!f) return amount;
  const n = Math.min(amount, f.guardBarrier);
  f.guardBarrier -= n;
  return amount - n;
}
function afterCounter(s, heal) {
  const f = frame(s);
  if (!f) return "";
  if (f.barkBroken && s.hp > 0 && !f.barkRescue) {
    f.barkBroken = false;
    f.barkRescue = true;
    return (
      "\n" +
      soulIcon(s.characterSoul.characterId, 6) +
      " " +
      E.hp +
      " Rễ bám sinh tồn: hồi " +
      heal(s, s.maxHp * 0.05) +
      " HP."
    );
  }
  f.barkBroken = false;
  return "";
}
function summary(s) {
  const v = s.characterSoul;
  if (!v) return "";
  const c = catalog.get(v.characterId);
  return (
    "**" +
    c.name +
    " · S" +
    v.soulLevel +
    "**" +
    (v.soulLevel
      ? "\n" +
        c.souls
          .filter((x) => x.level <= v.soulLevel)
          .map(
            (x) =>
              soulIcon(c, x.level) + " S" + x.level + " · " + x.description,
          )
          .join("\n")
      : " · Bộ kỹ năng khởi đầu.") +
    (has(s, 6) && v.bossMultiplier !== 1
      ? "\nDMG Tấn công/Skill lên boss từ S6 +" +
        Number(((v.bossMultiplier - 1) * 100).toFixed(1)).toLocaleString(
          "vi-VN",
        ) +
        "% (gồm hit phụ; trừ sát thương cố định của cơ chế boss)."
      : "")
  );
}
module.exports = {
  parameters,
  value,
  enabled,
  level,
  has,
  snapshot,
  attach,
  validate,
  frame,
  prepare,
  begin,
  bloodlust,
  wild,
  vindicate,
  anchor,
  furyRate,
  focusRate,
  furyFinisher,
  focusMain,
  echoMain,
  holyFactor,
  novaFactor,
  bossFactor,
  awakeningTuning,
  mana,
  defend,
  absorb,
  afterCounter,
  summary,
};
