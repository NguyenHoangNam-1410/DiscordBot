// Composed once by ../runtime/index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    E,
    eventIcon,
    formatCoins,
    rarityLabel,
    effectText,
    clamp,
    potentialPayout,
    serviceCost,
    forgeTarget,
    curseTarget,
    luckyBreakChance,
    goblinCatchChance,
    GOBLIN_REWARDS,
    goblinRewardRarity,
    goblinEscapeCost,
    itemEffects,
    itemCurse,
    payoutReductionCost,
    SHRINE_EFFECTS,
    shrineFakeDamage,
    MERCHANT_OFFERS,
    ITEMS,
    CLASSES,
    DISPLAY_STATS,
  } = dependencies;
  const randomFloat = (...args) => dependencies.randomFloat(...args);
  const pick = (...args) => dependencies.pick(...args);
  const grantEscapeTickets = (...args) =>
    dependencies.grantEscapeTickets(...args);
  const applyItem = (...args) => dependencies.applyItem(...args);
  const applyEquipmentEffects = (...args) =>
    dependencies.applyEquipmentEffects(...args);
  const cleanseItem = (...args) => dependencies.cleanseItem(...args);
  const grindItem = (...args) => dependencies.grindItem(...args);
  const completeFloor = (...args) => dependencies.completeFloor(...args);
  const enemyTurn = (...args) => dependencies.enemyTurn(...args);

  function applyShrine(state, kind) {
    const effects = SHRINE_EFFECTS;
    if (kind === "healing") {
      const heal = state.maxHp - state.hp;
      state.hp = state.maxHp;
      return `💚 Healing Shrine hồi ${heal} HP.`;
    }
    if (kind === "armor") {
      state.defense += effects.armorDefense;
      return `🛡️ Armor Shrine: +${effects.armorDefense} DEF.`;
    }
    if (kind === "blood") {
      state.hp = Math.max(1, state.hp - effects.bloodHp);
      state.damageMin += effects.bloodAttack;
      state.damageMax += effects.bloodAttack;
      return `🩸 Mất ${effects.bloodHp} HP, +${effects.bloodAttack} ATK.`;
    }
    if (kind === "experience") {
      state.bonus += Math.floor(state.stake * effects.experiencePercent);
      return "✨ Payout tạm thời tăng thêm 25% tiền cược.";
    }
    if (kind === "corrupted") {
      state.damageMin += effects.corruptedAttack;
      state.damageMax += effects.corruptedAttack;
      state.defense = Math.max(0, state.defense - effects.corruptedDefense);
      return `☣️ +${effects.corruptedAttack} ATK, −${effects.corruptedDefense} DEF.`;
    }
    const damage = shrineFakeDamage(state);
    state.hp = Math.max(0, state.hp - damage);
    return `🤡 Shrine giả gây ${damage} DMG.`;
  }

  function statSnapshot(state) {
    return Object.fromEntries(
      DISPLAY_STATS.map((key) => [key, Number(state[key]) || 0]),
    );
  }

  function statChanges(state, before) {
    return Object.fromEntries(
      DISPLAY_STATS.map((key) => [
        key,
        +Number((Number(state[key]) || 0) - before[key]).toFixed(4),
      ]).filter(([, change]) => change),
    );
  }

  function payRunService(state, service) {
    const cost = serviceCost(state, service);
    if (cost <= 0 || potentialPayout(state) < cost)
      throw new Error("INSUFFICIENT_RUN_PAYOUT");
    state.payoutSpent = (state.payoutSpent || 0) + cost;
    state.payoutServiceSpent = (state.payoutServiceSpent || 0) + cost;
    return cost;
  }

  function chargeCurrentPayout(state, rate) {
    const cost = payoutReductionCost(state, rate);
    state.payoutFactor *= 1 - rate;
    state.payoutTaxLoss = (state.payoutTaxLoss || 0) + cost;
    return cost;
  }

  function luckyBreak(state, event) {
    return (
      typeof event.luckyBreakRoll === "number" &&
      event.luckyBreakRoll < luckyBreakChance(state)
    );
  }

  function resolveWrongPortal(state) {
    const event = state.encounter;
    let log;
    if (event.portal.good) {
      if (event.portal.effect === "healing_sanctuary") {
        state.maxHp += 10;
        state.hp = state.maxHp;
        state.potions = Math.min(5, state.potions + 1);
        log =
          "💚 Healing Sanctuary: +10 HP tối đa, hồi đầy HP và thêm 1 bình máu (tối đa 5).";
      } else if (event.portal.effect === "treasure_vault") {
        const found = Math.floor(state.stake * 0.5);
        state.bonus += found;
        log = `💰 Treasure Vault: cộng **${found} xu** vào bonus payout (50% tiền cược).`;
      } else if (event.portal.effect === "rift_blessing") {
        state.defense += 4;
        state.resistance = clamp(state.resistance + 5, -50, 75);
        state.luck += 1;
        log = "✨ Rift Blessing: +4 DEF, +5 RES và +1 LUCK.";
      } else throw new Error("INVALID_ACTION");
      completeFloor(state, `🌀 Portal tốt! ${log}`, 0);
      return;
    }
    if (event.portal.effect === "blood_rift") {
      const damage = Math.min(
        Math.max(0, state.hp - 1),
        Math.floor(state.maxHp * 0.15),
      );
      state.hp -= damage;
      log = `🩸 Blood Rift gây **${damage} DMG** (tối đa 15% MAX HP; giữ ít nhất 1 HP).`;
    } else if (event.portal.effect === "mana_void") {
      state.energy = 0;
      log = "🕳️ Mana Void: ENE về 0.";
    } else if (event.portal.effect === "shattered_supplies") {
      const lost = Math.min(2, state.potions);
      state.potions -= lost;
      log = `📦 Shattered Supplies: mất **${lost} bình máu**.`;
    } else if (event.portal.effect === "payout_corruption") {
      const cost = chargeCurrentPayout(state, 0.1);
      state.portalPayoutFactor = (state.portalPayoutFactor || 1) * 0.9;
      log = `☣️ Payout Corruption: payout ×0,9, giảm **${cost} xu** hiện tại; áp dụng cả thưởng về sau.`;
    } else if (event.portal.effect === "dimensional_curse") {
      const previousDefense = state.defense;
      const previousResistance = state.resistance;
      state.defense = Math.max(0, state.defense - 5);
      state.resistance = clamp(state.resistance - 5, -50, 75);
      log = `💀 Dimensional Curse: −${previousDefense - state.defense} DEF, −${previousResistance - state.resistance}% RES.`;
    } else throw new Error("INVALID_ACTION");
    state.encounter = event.enemy;
    state.lastLog = `🌀 Portal xấu! ${log}\n⚠️ **Rift Ambusher** cấp Elite đánh phủ đầu!\n${enemyTurn(state)}`;
  }

  function payEventCost(state, rate) {
    const cost = Math.ceil(potentialPayout(state) * rate);
    if (cost <= 0 || potentialPayout(state) < cost)
      throw new Error("INSUFFICIENT_RUN_PAYOUT");
    state.payoutSpent = (state.payoutSpent || 0) + cost;
    state.payoutServiceSpent = (state.payoutServiceSpent || 0) + cost;
    return cost;
  }

  function resolveSurprise(state, action) {
    const event = state.encounter;
    const done = (log) => completeFloor(state, log, 0);
    const addAttack = (amount) => {
      state.damageMin = Math.max(1, state.damageMin + amount);
      state.damageMax = Math.max(state.damageMin, state.damageMax + amount);
    };
    const receive = (item) => {
      const owned = applyItem(state, item, item.rarity);
      return `Nhận **${owned.name} Lv.${owned.level}** [${rarityLabel(owned.rarity)}]: ${item.text}${item.curse ? `; curse: ${item.curse.text}` : ""}.`;
    };
    const combat = (enemy, log) => {
      state.encounter = enemy;
      state.lastLog = log;
    };
    if (event.kind === "healer" && action === "event_accept") {
      const healed = Math.min(
        state.maxHp - state.hp,
        Math.max(20, Math.floor(state.maxHp * 0.3)),
      );
      state.hp += healed;
      state.potions = Math.min(5, state.potions + 1);
      return done(
        `💚 Wandering Healer: hồi **${healed} HP**, +1 bình (tối đa 5).`,
      );
    }
    if (event.kind === "goblin" && action === "event_catch") {
      if (event.successRoll < goblinCatchChance(state)) {
        const bonus = Math.floor(state.stake * GOBLIN_REWARDS.bonusRate);
        state.bonus += bonus;
        event.goblinItem ||= pick(ITEMS[goblinRewardRarity(randomFloat())]);
        const item = event.goblinItem;
        const owned = applyItem(state, item, item.rarity);
        return done(
          `${eventIcon("goblin")} Bắt được Treasure Goblin: bonus **+${formatCoins(bonus)} ${E.coin}** (25% cược).\n${E.backpack} **${owned.name} [${rarityLabel(owned.rarity)}] · Lv.${owned.level}**: ${effectText(itemEffects(item))}${item.curse ? `\n☣️ Lời nguyền: ${effectText(itemCurse(item))}` : ""}`,
        );
      }
      const before = potentialPayout(state);
      const lost = goblinEscapeCost(state);
      state.payoutSpent = (state.payoutSpent || 0) + lost;
      state.payoutGoblinSpent = (state.payoutGoblinSpent || 0) + lost;
      return done(
        lost
          ? `${eventIcon("goblin")} Treasure Goblin thoát: trừ một lần 5% payout hiện tại.\n${E.coin} Thưởng xu: ${formatCoins(before)} → **${formatCoins(potentialPayout(state))}** (−${formatCoins(lost)} xu).`
          : `${eventIcon("goblin")} Treasure Goblin thoát: không có payout để trừ.`,
      );
    }
    if (event.kind === "blacksmith" && action === "event_forge") {
      const target = forgeTarget(state);
      if (!target) throw new Error("NO_FORGE_ITEM");
      const cost = payEventCost(state, 0.12);
      const log = receive(target.definition);
      return done(`🔨 Rèn: ${log}\nDùng **${cost} xu** từ payout.`);
    }
    if (event.kind === "purifier" && action === "event_cleanse") {
      const target = curseTarget(state);
      if (!target) throw new Error("NO_CURSE");
      const cost = payEventCost(state, 0.2);
      cleanseItem(state, target);
      return done(
        `✨ Giải một lớp curse của **${target.name}**; giữ buff. Dùng **${cost} xu** từ payout.`,
      );
    }
    if (event.kind === "sacrifice") {
      if (action === "event_blood") {
        const lost = Math.max(1, Math.floor(state.maxHp * 0.2));
        if (state.hp <= lost) throw new Error("INSUFFICIENT_HP");
        state.hp -= lost;
        addAttack(3);
        return done(`🩸 Hiến **${lost} HP**, +3 ATK.`);
      }
      if (action === "event_gold") {
        const cost = payEventCost(state, 0.1);
        state.defense += 3;
        return done(`🛡️ +3 DEF, dùng **${cost} xu** từ payout.`);
      }
    }
    if (
      event.kind === "gambler" &&
      ["event_bet10", "event_bet25"].includes(action)
    ) {
      const cost = payEventCost(state, action === "event_bet10" ? 0.1 : 0.25);
      if (event.win) {
        // Return the stake, then credit the profit through bonus (subject to the payout cap).
        state.payoutSpent -= cost;
        state.payoutServiceSpent -= cost;
        state.bonus += Math.ceil(cost / state.payoutFactor);
        return done(
          `🎲 Cursed Gambler: thắng cược **${cost} xu**, nhận lại **${cost * 2} xu** trước trần payout.`,
        );
      }
      return done(`🎲 Cursed Gambler: thua **${cost} xu** từ payout.`);
    }
    if (
      event.kind === "adventurer" &&
      ["event_rescue", "event_rob"].includes(action)
    ) {
      if (action === "event_rescue") {
        if (state.potions < 2) throw new Error("NO_RESCUE_POTIONS");
        state.potions -= 2;
        return done(
          `🧭 Cứu Lost Adventurer bằng 2 bình máu. ${receive(event.rescueItem)}`,
        );
      }
      return done(
        event.robItem
          ? `🗡️ Cướp đồ Lost Adventurer. ${receive(event.robItem)}`
          : "🗡️ Cướp đồ Lost Adventurer. Không có gì xảy ra.",
      );
    }
    if (event.kind === "fountain" && action === "event_drink") {
      if (event.outcome === "mimic")
        return combat(event.enemy, "🩸 Blood Fountain hóa thành Blood Mimic!");
      if (event.outcome === "heal") {
        state.hp = state.maxHp;
        return done("🩸 Blood Fountain: hồi đầy HP.");
      }
      state.maxHp += 15;
      return done("🩸 Blood Fountain: +15 HP tối đa.");
    }
    if (
      event.kind === "horadric" &&
      [
        "event_grind_attack",
        "event_grind_defense",
        "event_grind_hp",
        "event_grind_ticket",
      ].includes(action)
    ) {
      const target = state.items.find(
        (item) =>
          item.name === event.targetName &&
          item.rarity === event.targetRarity &&
          (item.definition?.base || "") === event.targetBase,
      );
      if (
        !target ||
        (action === "event_grind_ticket" &&
          !["legendary", "cursed"].includes(target.rarity))
      )
        throw new Error("NO_FORGE_ITEM");
      grindItem(state, target);
      const rewards = {
        event_grind_attack: { attack: 3 },
        event_grind_defense: { defense: 4 },
        event_grind_hp: { maxHp: 10, heal: 10 },
        event_grind_ticket: { escapeTokens: 1 },
      };
      applyEquipmentEffects(state, rewards[action]);
      return done(
        `⚒️ Nghiền một level **${target.name}**: ${effectText(rewards[action], 1)}.`,
      );
    }
    if (event.kind === "merchant" && action.startsWith("event_buy_")) {
      const key = action.slice("event_buy_".length);
      if (!event.offers.includes(key)) throw new Error("INVALID_ACTION");
      const cost = payEventCost(state, MERCHANT_OFFERS[key].rate);
      let log = MERCHANT_OFFERS[key].label;
      if (key === "potion") state.potions = Math.min(5, state.potions + 1);
      if (key === "heal") state.hp = state.maxHp;
      if (key === "luck") state.luck += 1;
      if (key === "ticket") grantEscapeTickets(state, 1);
      if (key === "item") log = receive(event.item);
      return done(`🛒 Rift Merchant: ${log}; dùng **${cost} xu** từ payout.`);
    }
    if (event.kind === "mirror") {
      if (action === "event_mirror_damage") {
        const lost = Math.max(1, Math.floor(state.maxHp * 0.1));
        if (state.hp <= lost) throw new Error("INSUFFICIENT_HP");
        state.hp -= lost;
        state.damageMin = Math.floor(state.damageMin * 1.1);
        state.damageMax = Math.floor(state.damageMax * 1.1);
        return done(`🪞 Mất **${lost} HP**, +10% ATK.`);
      }
      if (action === "event_mirror_guard") {
        state.defense += 8;
        addAttack(-2);
        return done("🪞 +8 DEF, −2 ATK.");
      }
      if (action === "event_break") {
        if (event.lucky) {
          state.luck += 2;
          return done("🪞 Đập gương: +2 LUCK.");
        }
        return combat(
          event.enemy,
          "🪞 Mirror Clone xuất hiện; hạ clone để qua tầng.",
        );
      }
    }
    if (
      event.kind === "treasure_room" &&
      ["event_chest_red", "event_chest_blue", "event_chest_gold"].includes(
        action,
      )
    ) {
      const key = action.slice("event_chest_".length);
      if (key === event.mimicChest)
        return combat(event.enemy, "📦 Hòm hóa thành Mimic!");
      if (key === "red") {
        addAttack(5);
        return done("📦 Hòm đỏ: +5 ATK.");
      }
      if (key === "blue") {
        state.defense += 6;
        state.resistance = clamp(state.resistance + 5, -50, 75);
        return done("📦 Hòm xanh: +6 DEF, +5 RES.");
      }
      state.bonus += Math.floor(state.stake * 0.5);
      state.luck += 1;
      return done("📦 Hòm vàng: bonus +50% cược, +1 LUCK.");
    }
    if (
      event.kind === "contract" &&
      [
        "event_contract_potion",
        "event_contract_skill",
        "event_contract_defend",
      ].includes(action)
    ) {
      if (state.contract) throw new Error("INVALID_ACTION");
      state.contract = {
        kind: action.slice("event_contract_".length),
        from: state.floor + 1,
        until: state.floor + 3,
        remaining: 3,
        item: event.item,
      };
      return done(
        "📜 Nhận Rift Contract cho 3 tầng kế tiếp. Vi phạm chỉ hủy phần thưởng.",
      );
    }
    if (event.kind === "class_shrine" && action === "event_bless") {
      state.classShrine = {
        from: state.floor + 1,
        until: state.floor + 3,
        consumed: false,
      };
      return done(
        `✨ Class Shrine chúc phúc **${CLASSES[state.classKey].name}** trong tối đa 3 tầng kế tiếp.`,
      );
    }
    if (
      event.kind === "doors" &&
      ["event_door_light", "event_door_gold", "event_door_dark"].includes(
        action,
      )
    ) {
      const key = action.slice("event_door_".length);
      if (key === "light") {
        if (event.doors.light) {
          state.hp = state.maxHp;
          state.potions = Math.min(5, state.potions + 1);
          return done("🚪 Cửa sáng: hồi đầy HP, +1 bình.");
        }
        const lost = Math.min(state.hp - 1, Math.floor(state.maxHp * 0.2));
        state.hp -= lost;
        return done(`🚪 Cửa sáng: mất **${lost} HP**, giữ ít nhất 1 HP.`);
      }
      if (key === "gold") {
        if (!event.doors.gold)
          return combat(event.mimic, "🚪 Golden Door Mimic chặn đường!");
        state.bonus += Math.floor(state.stake * 0.5);
        return done("🚪 Cửa vàng: bonus +50% cược.");
      }
      if (!event.doors.dark)
        return combat(event.boss, "🚪 Premature Rift Boss xuất hiện!");
      return done(`🚪 Cửa đen: ${receive(event.item)}`);
    }
    throw new Error("INVALID_ACTION");
  }
  return {
    applyShrine,
    statSnapshot,
    statChanges,
    payRunService,
    chargeCurrentPayout,
    luckyBreak,
    resolveWrongPortal,
    payEventCost,
    resolveSurprise,
  };
};
