"use strict";
const { E } = require("./shared/icons");
const NAMES = {
  amazon: "Bloodlust",
  assassin: "AVOID",
  barbarian: "Titan’s Fortitude",
  druid: "Mark of the Wild",
  necromancer: "Bend the Shadows",
  paladin: "Vindicate",
  sorceress: "Mana Shield",
};
function enabled(s) {
  return (
    s.gameplayVersion === 3 &&
    s.classInnateVersion === 1 &&
    !s.mode?.startsWith("tower") &&
    !s.towerChallengeId
  );
}
function rebalanced(s) {
  return enabled(s) && s.classInnateRevision === 2;
}
function prepare(s) {
  if (!enabled(s) || s.encounter?.type !== "combat") return null;
  return (s.encounter.innateCombat ||= {
    version: rebalanced(s) ? 2 : 1,
    anchorProgress: 0,
    manaShieldCharges: 2,
    manaShieldPhase: s.encounter.boss?.phase || 1,
    actions: 0,
    bloodlust: false,
    wild: false,
    wildMpReady: 0,
    anchor: false,
    anchorReady: 0,
    vindicate: false,
    manaShieldUsed: false,
    titan: false,
    actionBuff: 1,
    wildAction: false,
    anchorDodge: false,
    vindicateAction: false,
    killEligible: false,
  });
}
function combat(s) {
  return enabled(s) ? s.encounter?.innateCombat || null : null;
}
function begin(s, action) {
  const c = prepare(s);
  if (!c) return;
  c.actions++;
  c.actionBuff = 1;
  c.wildAction = false;
  c.anchorDodge = false;
  c.vindicateAction = false;
  c.killEligible = false;
  c.titan = s.classKey === "barbarian" && action === "skill";
  if (!["attack", "skill"].includes(action)) return;
  if (s.classKey === "amazon" && c.bloodlust) {
    c.actionBuff = 1.15;
    c.bloodlust = false;
  }
  if (s.classKey === "druid" && c.wild) {
    c.actionBuff = rebalanced(s) ? 1.2 : 1.15;
    c.wildAction = true;
    c.wild = false;
  }
  if (s.classKey === "paladin" && c.vindicate) {
    c.actionBuff = rebalanced(s) ? 1.15 : 1.1;
    c.vindicateAction = true;
    c.vindicate = false;
  }
  if (s.classKey === "necromancer" && action === "attack" && c.anchor) {
    c.anchor = false;
    c.anchorDodge = true;
    if (rebalanced(s)) c.actionBuff = 1.15;
  }
}
function multiplier(s, action) {
  const c = combat(s);
  if (!c) return 1;
  if (action != null) {
    if (!["attack", "skill"].includes(action)) return 1;
    if (s.classKey === "amazon" && c.bloodlust) return 1.15;
    if (s.classKey === "druid" && c.wild) return rebalanced(s) ? 1.2 : 1.15;
    if (s.classKey === "paladin" && c.vindicate)
      return rebalanced(s) ? 1.15 : 1.1;
    if (
      rebalanced(s) &&
      s.classKey === "necromancer" &&
      action === "attack" &&
      c.anchor
    )
      return 1.15;
    return 1;
  }
  return c.actionBuff || 1;
}
function avoidChance(s) {
  return enabled(s) && s.classKey === "assassin"
    ? Math.min(0.55, Math.max(0, 0.05 + 0.0005 * s.dex))
    : 0;
}
function defenseFactor(s) {
  return combat(s)?.titan ? 1.25 : 1;
}
function counterEnd(s) {
  const c = combat(s);
  if (c) c.titan = false;
}
function manaShieldAmount(s, amount, skillCost, defend = false) {
  const c = combat(s);
  if (rebalanced(s))
    return c &&
      s.classKey === "sorceress" &&
      !defend &&
      (c.manaShieldPhase !== (s.encounter.boss?.phase || 1)
        ? 2
        : c.manaShieldCharges) > 0 &&
      amount > 0
      ? Math.floor(Math.min(amount, s.maxHp * 0.2))
      : 0;
  return c &&
    s.classKey === "sorceress" &&
    !c.manaShieldUsed &&
    s.mana > skillCost &&
    amount > 0
    ? Math.floor(Math.min(amount * 0.25, s.maxHp * 0.06))
    : 0;
}
function absorb(s, amount, skillCost, defend = false) {
  const c = combat(s),
    used = manaShieldAmount(s, amount, skillCost, defend);
  if (!used) return { remaining: amount, log: "" };
  if (rebalanced(s)) {
    const phase = s.encounter.boss?.phase || 1;
    if (c.manaShieldPhase !== phase) {
      c.manaShieldPhase = phase;
      c.manaShieldCharges = 2;
    }
    c.manaShieldCharges--;
    return {
      remaining: amount - used,
      log:
        "\n" +
        E.defense +
        " Mana Shield: hấp thụ " +
        used +
        " DMG; còn " +
        c.manaShieldCharges +
        "/2 lần.",
    };
  }
  s.mana--;
  c.manaShieldUsed = true;
  if (s.encounter.boss) s.encounter.boss.mpChanged = true;
  return {
    remaining: amount - used,
    log: `\n${E.mana} Mana Shield: tiêu 1 MP, hấp thụ ${used} DMG.`,
  };
}
function afterPlayer(
  s,
  action,
  { landed, critical, mainDealt, heal, maxMana },
) {
  const c = combat(s);
  if (!c) return "";
  let log = "";
  const mana = (name) => {
    const before = s.mana;
    s.mana = Math.min(maxMana, s.mana + 1);
    if (s.mana > before) {
      if (s.encounter.boss) s.encounter.boss.mpChanged = true;
      log += `\n${E.mana} ${name}: hồi 1 MP cho bạn.`;
    }
    return s.mana > before;
  };
  const healing = (name, rate) => {
    const gained = heal(s, s.maxHp * rate);
    if (gained) log += `\n${E.hp} ${name}: hồi ${gained} HP cho bạn.`;
  };
  if (s.classKey === "amazon" && action === "attack" && landed)
    c.bloodlust = true;
  if (s.classKey === "assassin" && critical && landed > 0)
    healing("AVOID", rebalanced(s) ? 0.02 : 0.03);
  if (s.classKey === "druid") {
    if (
      action === "attack" &&
      landed &&
      c.wildAction &&
      c.actions >= c.wildMpReady
    ) {
      if (mana("Mark of the Wild")) c.wildMpReady = c.actions + 2;
    }
    if (action === "skill") c.wild = true;
  }
  if (s.classKey === "necromancer") {
    if (action === "attack" && landed && c.anchorDodge)
      mana("Bend the Shadows");
    if (rebalanced(s) && action === "skill") {
      c.anchorProgress++;
      if (c.anchorProgress >= 3) {
        c.anchorProgress = 0;
        c.anchor = true;
      }
    } else if (action === "skill" && c.actions >= c.anchorReady) {
      c.anchor = true;
      c.anchorReady = c.actions + 3;
    }
  }
  if (s.classKey === "paladin") {
    c.killEligible = c.vindicateAction && mainDealt > 0 && s.encounter.hp <= 0;
    if (action === "skill") {
      healing("Divine Shield", 0.03);
      c.vindicate = true;
    }
  }
  return log;
}
function finish(s, e, heal, maxMana) {
  const c = enabled(s) ? e.innateCombat : null;
  if (!c) return "";
  let log = "";
  if (
    s.classKey === "paladin" &&
    c.killEligible &&
    e.defeatSettled &&
    s.hp > 0
  ) {
    const gained = heal(s, s.maxHp * (rebalanced(s) ? 0.2 : 0.15)),
      before = s.mana;
    s.mana = Math.min(maxMana, s.mana + 1);
    log = `\n${E.hp} Vindicate: hồi ${gained} HP và ${s.mana - before} ${E.mana} MP khi kết thúc combat.`;
  }
  if (s.classAwakening) s.classAwakening.bark = 0;
  delete e.innateCombat;
  return log;
}
function endAction(s) {
  const frame = combat(s);
  if (frame) delete frame.counterSkillCost;
  const c = combat(s);
  if (c) {
    c.titan = false;
    c.actionBuff = 1;
    c.anchorDodge = false;
    c.vindicateAction = false;
    c.wildAction = false;
    c.killEligible = false;
  }
}
function validate(s) {
  if (s.mode?.startsWith("tower") || s.towerChallengeId) return;
  if (s.classInnateVersion == null) {
    if (s.releaseVersion === "3.1.0") throw Error("MISSING_CLASS_INNATE");
    return;
  }
  if (
    !enabled(s) ||
    s.releaseVersion !== "3.1.0" ||
    s.balanceVersion !== "3.1.0"
  )
    throw Error("UNSUPPORTED_CLASS_INNATE");
  if (s.classInnateRevision != null && ![1, 2].includes(s.classInnateRevision))
    throw Error("UNSUPPORTED_CLASS_INNATE");
  const c = s.encounter?.innateCombat;
  if (!c) return;
  if (
    rebalanced(s) &&
    (![0, 1, 2].includes(c.anchorProgress) ||
      ![0, 1, 2].includes(c.manaShieldCharges) ||
      !Number.isSafeInteger(c.manaShieldPhase) ||
      c.manaShieldPhase < 1)
  )
    throw Error("INVALID_CLASS_INNATE");
  if (
    c.version !== (rebalanced(s) ? 2 : 1) ||
    ![1, 1.1, 1.15, 1.2].includes(c.actionBuff)
  )
    throw Error("INVALID_CLASS_INNATE");
  for (const k of ["actions", "wildMpReady", "anchorReady"])
    if (!Number.isSafeInteger(c[k]) || c[k] < 0)
      throw Error("INVALID_CLASS_INNATE");
  for (const k of [
    "bloodlust",
    "wild",
    "anchor",
    "vindicate",
    "manaShieldUsed",
    "titan",
    "wildAction",
    "anchorDodge",
    "vindicateAction",
    "killEligible",
  ])
    if (typeof c[k] !== "boolean") throw Error("INVALID_CLASS_INNATE");
}
function description(s) {
  if (!enabled(s)) return "";
  const c = combat(s);
  const revised = rebalanced(s);
  const text = {
    amazon: `${E.attack} Tấn công thường trúng tạo Bloodlust: action Tấn công/Skill kế +15% toàn bộ DMG. Một lần, không cộng dồn; đánh thường có thể dùng rồi tạo lại.`,
    assassin: `${E.evasion} AVOID: ${(Math.round(avoidChance(s) * 1000) / 10).toLocaleString("vi-VN")}% = 5% + tổng DEX ×0,05 điểm %, trần 55%. Vật lý kiểm tra EVA trước, rồi AVOID; phép kiểm tra AVOID. ${E.crit} Crit hồi ${revised ? 2 : 3}% Max HP. Né tự nhiên tạo Shadow/Shadow Mark; Shadow Step không tạo từ lần né chắc chắn.`,
    barbarian: `${E.defense} Iron Will tăng 25% DEF hiệu lực và miễn Crit cho phản công ngay sau đó. Không giảm DMG chuẩn, không giữ sang lượt sau.`,
    druid: `${E.attack} Sau Wild Regeneration, action Tấn công/Skill kế +${revised ? 20 : 15}% toàn bộ DMG. Nếu là đánh thường trúng, hồi thêm 1 ${E.mana} MP, cooldown 2 combat action. Skill làm mới dấu, không cộng dồn.`,
    necromancer: `${E.mana} ${revised ? "Mỗi Totem Ward tích 1 tiến trình; đủ 3 tạo Shadow Anchor. Đánh thường dùng Anchor tăng 15% DMG." : "Totem Ward tạo Shadow Anchor tối đa một lần mỗi 3 combat action."} Đánh thường kế tiêu Anchor và né phản công; trúng hồi thêm 1 MP. Trượt vẫn tiêu Anchor và né, nhưng không hồi thêm MP.`,
    paladin: `${E.attack} Divine Shield hồi 3% Max HP và đặt Vindicate: action gây DMG kế +${revised ? 15 : 10}% toàn bộ DMG. Nếu action được cường hóa hạ mục tiêu chính, kết thúc combat: hồi ${revised ? 20 : 15}% Max HP và 1 ${E.mana} MP. Hạ mục tiêu phụ/chuyển phase không nhận thưởng này.`,
    sorceress: revised
      ? `${E.defense} Mana Shield: tối đa 2 lần/combat, nạp lại đủ 2 lần mỗi phase boss. Phản công thường trúng còn DMG sau Barrier: hấp thụ tối đa 20% Max HP, không tiêu MP. Không dùng khi Phòng thủ hoặc cho cơ chế boss. Hiện còn ${c && c.manaShieldPhase === (s.encounter.boss?.phase || 1) ? c.manaShieldCharges : 2}/2 lần.`
      : `${E.mana} Mana Shield: một lần/combat, khi phản công trúng còn DMG sau Barrier và MP dư hơn chi phí Skill, tiêu 1 MP để hấp thụ min(25% DMG còn lại, 6% Max HP). Luôn giữ đủ MP cho một Skill.`,
  }[s.classKey];
  const ready =
    c &&
    {
      amazon: c.bloodlust,
      druid: c.wild,
      necromancer: c.anchor,
      paladin: c.vindicate,
    }[s.classKey];
  return `**${NAMES[s.classKey]}** · có từ tầng 1\n${text}\n${c && ["amazon", "druid", "necromancer", "paladin"].includes(s.classKey) ? `**Hiện tại:** dấu ${ready ? "đang sẵn sàng" : "chưa có"}.\n` : ""}Buff combat giữ qua phase và hết khi combat kết thúc. Né/chặn/Mana Shield không ngăn DMG chuẩn, HP cost, bẫy hoặc phản phệ.`;
}
module.exports = {
  enabled,
  rebalanced,
  prepare,
  combat,
  begin,
  multiplier,
  avoidChance,
  defenseFactor,
  counterEnd,
  manaShieldAmount,
  absorb,
  afterPlayer,
  finish,
  endAction,
  validate,
  description,
};
