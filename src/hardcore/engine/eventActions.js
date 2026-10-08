"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    gilded,
    royal,
    E,
    SKILL_ICONS,
    eventIcon,
    memoryIcon,
    treasureChestIcon,
    world,
    GOBLIN_REWARDS,
    goblinRewardRarity,
    spendDiamonds,
    recompute,
    mainStat,
    randomItem,
  } = dependencies;
  const markDirect = (...args) => dependencies.markDirect(...args);
  const addSource = (...args) => dependencies.addSource(...args);
  const goblinCatchChance = (...args) =>
    dependencies.goblinCatchChance(...args);
  const goblinEscapeCost = (...args) => dependencies.goblinEscapeCost(...args);
  const penalty = (...args) => dependencies.penalty(...args);
  const charge = (...args) => dependencies.charge(...args);
  const healEvent = (...args) => dependencies.healEvent(...args);
  const hurt = (...args) => dependencies.hurt(...args);
  const receiveItem = (...args) => dependencies.receiveItem(...args);
  const cleanse = (...args) => dependencies.cleanse(...args);
  const grind = (...args) => dependencies.grind(...args);
  const remember = (...args) => dependencies.remember(...args);
  const completeFloor = (...args) => dependencies.completeFloor(...args);
  const openChest = (...args) => dependencies.openChest(...args);
  const purifierCost = (...args) => dependencies.purifierCost(...args);
  const serviceCost = (...args) => dependencies.serviceCost(...args);

  function actSurprise(state, session, action, rng) {
    const e = state.encounter,
      k = e.kind;
    const done = (log) => {
      state.lastLog = log;
      completeFloor(state, session, rng, 0);
    };
    const combat = (enemy, log) => {
      state.encounter = enemy;
      state.lastLog = log;
    };
    const itemById = (id) =>
      state.items.find((item) => item.definition.id === id);
    if (k === "royal_invitation") {
      if (action === "event_skip") {
        royal.decline(state);
        dependencies.noteEvent(state, k, false);
        completeFloor(state, session, rng, 0);
      } else {
        royal.accept(state, session, action.slice(6), () =>
          completeFloor(state, session, rng, 0, { deferEncounter: true }),
        );
      }
      return;
    }
    if (action === "event_skip") {
      state.lastLog = `Bỏ qua ${e.name}.`;
      completeFloor(state, session, rng, 0);
      return;
    }
    if (k.endsWith("_shop") || k === "merchant") {
      const offer = e.offers[Number(action.slice(4))];
      if (!offer || !/^buy_\d$/.test(action)) throw new Error("INVALID_ACTION");
      let paymentLog = "";
      if (k === "blood_shop") {
        if (state.maxHp <= offer.price) throw new Error("INSUFFICIENT_MAX_HP");
        const before = state.maxHp;
        const hpBefore = state.hp;
        addSource(state, { maxHp: -offer.price });
        if (state.hp !== hpBefore) markDirect(state, ["hp"]);
        paymentLog =
          E.hp +
          " **Max HP của bạn:** " +
          before +
          " → **" +
          state.maxHp +
          "** (−" +
          offer.price +
          "; giảm trong suốt run).\n";
      } else if (k === "diamond_shop")
        spendDiamonds(session.guild_id, session.user_id, offer.price, {
          reason: "hardcore:v2:item-shop",
          operationId: `hardcore-shop:${session.id}:${state.turn}`,
        });
      else charge(state, offer.price);
      if (k === "merchant" && offer.key === "chest") {
        openChest(
          state,
          session,
          offer.chest,
          rng,
          `${eventIcon("merchant")} Đã mua ${E.chest} rương giá **${offer.price.toLocaleString("vi-VN")} xu** và mở ngay.\n`,
        );
        return;
      }
      if (offer.item) {
        const item = receiveItem(state, offer.item);
        done(
          `${paymentLog}${E.backpack} Nhận ${item.name}${item.consumable ? "" : ` Lv.${item.level}`}.`,
        );
      } else {
        if (offer.key === "potion")
          state.potions = Math.min(state.maxPotions, state.potions + 1);
        const recovery =
          offer.key === "heal" ? healEvent(state, state.maxHp) : null;
        if (offer.key === "luck") addSource(state, { luck: 1 });
        if (offer.key === "ticket") state.escapeTokens = 1;
        done(
          `🛒 Đã mua ${{ potion: `${E.potion} bình máu`, heal: `hồi đầy ${E.hp} HP/${E.mana} MP`, luck: `+1 ${E.luck} Luck`, ticket: `${E.ticket} Vé thoát` }[offer.key] || offer.key}.` +
            (recovery ? "\n" + recovery.log : ""),
        );
      }
      return;
    }
    if (k === "duelist") {
      if (action === "duel_stat" || action === "duel_items") {
        e.mode = action === "duel_stat" ? "stat" : "items";
        state.lastLog = `Rift Duelist · ${e.mode === "stat" ? "Một ván thuộc tính" : "Thắng 3 trong tối đa 5 ván"}.`;
        return;
      }
      const hand = Number(action.slice(5));
      if (!/^hand_[012]$/.test(action) || !e.mode)
        throw new Error("INVALID_ACTION");
      const opponent = e.hands[e.round],
        won = (hand + 1) % 3 === opponent,
        tie = hand === opponent;
      e.history.push({
        hand,
        opponent,
        result: won ? "win" : tie ? "draw" : "loss",
      });
      e.round++;
      if (won) e.wins++;
      state.lastLog = `${["Búa", "Kéo", "Bao"][hand]} vs ${["Búa", "Kéo", "Bao"][opponent]}: ${won ? "Thắng" : tie ? "Hòa" : "Thua"}.`;
      if (e.mode === "stat") {
        if (won) addSource(state, { [["str", "dex", "ene"][hand]]: 6 });
        else
          for (const key of e.penalty)
            if (state[key] > 1) addSource(state, { [key]: -1 });
        completeFloor(state, session, rng, 0);
      } else if (e.wins >= 3 || e.round >= 5) {
        if (e.wins >= 3) {
          receiveItem(state, e.reward);
          state.lastLog += ` Nhận ${e.reward.name}.`;
        } else {
          const lost = itemById(e.lossItemId);
          if (lost && lost.rarity !== "cursed") {
            state.items = state.items.filter((x) => x !== lost);
            recompute(state);
            state.lastLog += ` Mất ${lost.name}.`;
          }
        }
        completeFloor(state, session, rng, 0);
      }
      return;
    }
    if (k === "healer") {
      const recovery = healEvent(state, Math.max(20, state.maxHp * 0.3), {
        manaRate: 0.3,
      });
      state.potions = Math.min(state.maxPotions, state.potions + 1);
      done(
        "Wandering Healer đã hồi phục HP/MP và tiếp tế cho bạn.\n" +
          recovery.log,
      );
    } else if (k === "goblin") {
      if (e.roll < goblinCatchChance(state)) {
        state.bonus += Math.floor(state.stake * GOBLIN_REWARDS.bonusRate);
        // Saved Goblins keep their catch roll and use the existing independent loot roll.
        e.goblinItem ||= randomItem(goblinRewardRarity(e.roll2 ?? rng()), rng);
        receiveItem(state, e.goblinItem);
        done(
          `${eventIcon("goblin")} Bắt được Treasure Goblin: bonus +25% cược và nhận trang bị.`,
        );
      } else {
        const cost = goblinEscapeCost(state);
        state.payoutSpent = (state.payoutSpent || 0) + cost;
        state.payoutGoblinSpent = (state.payoutGoblinSpent || 0) + cost;
        done(
          cost
            ? `${eventIcon("goblin")} Treasure Goblin thoát: trừ một lần 5% payout hiện tại.`
            : `${eventIcon("goblin")} Treasure Goblin thoát: không có payout để trừ.`,
        );
      }
    } else if (k === "blacksmith") {
      charge(state, serviceCost(state, 0.12));
      const target = itemById(e.targetId);
      if (!target) throw new Error("NO_FORGE_ITEM");
      const previousLevel = target.level;
      const item = receiveItem(
        state,
        target.definition,
        1,
        target.level === (target.cleansedLevels || 0) ? 1 : 0,
      );
      const receipt = state.lastReceivedItems?.at(-1);
      if (receipt) receipt.upgradedFromLevel = previousLevel;
      done(`🔨 ${item.name} Lv.${item.level}.`);
    } else if (k === "purifier") {
      const target = itemById(e.targetId);
      if (!target) throw new Error("NO_CURSE");
      charge(state, purifierCost(state));
      const purified = {
        name: target.name,
        rarity: target.rarity,
        level: target.level,
        curseLevels: Math.max(0, target.level - (target.cleansedLevels || 0)),
        curseEffects: structuredClone(target.definition.curse?.effects || {}),
        maxPotionsBefore: state.maxPotions,
      };
      cleanse(state, target);
      state.lastPurifiedItem = {
        ...purified,
        maxPotionsAfter: state.maxPotions,
      };
      done(
        `✨ ${target.name}: giải toàn bộ lời nguyền; giữ UR, level, buff và nội tại.`,
      );
    } else if (k === "sacrifice") {
      let paid = 0;
      if (action === "event_sacrifice_hp") {
        if (state.hp <= 1) throw new Error("INSUFFICIENT_HP");
        hurt(state, state.maxHp * 0.2, false, true);
        addSource(state, { [mainStat(state)]: 6 });
      } else {
        paid = serviceCost(state, 0.1);
        charge(state, paid);
        addSource(state, { vit: 6 });
      }
      state.lastLog = "🩸 Hoàn thành hiến tế.";
      remember(state, action, rng, { paid });
      completeFloor(state, session, rng, 0);
    } else if (k === "gambler") {
      const amount = serviceCost(
        state,
        action === "event_gamble_10" ? 0.1 : 0.25,
      );
      charge(state, amount);
      if (e.roll < 0.5) state.bonus += amount * 2;
      done(
        `${eventIcon("gambler")} ${e.roll < 0.5 ? "Thắng" : "Thua"}: đã trả ${amount.toLocaleString("vi-VN")} xu payout; ${e.roll < 0.5 ? `nhận bonus ${(amount * 2).toLocaleString("vi-VN")} xu trước lời nguyền` : "không nhận bonus"}.`,
      );
    } else if (k === "adventurer") {
      if (action === "event_rescue") {
        if (state.potions < 1) throw new Error("NO_RESCUE_POTIONS");
        state.potions--;
        receiveItem(state, e.rescueItem);
        const region = world.regionForFloor(state.floor);
        state.adventurerRescue = { from: region.start, until: region.end };
        state.lastLog = `${memoryIcon("rescue")} Cứu người: nhận ${e.rescueItem.name}.\nÂn nghĩa đã ghi nhận. Xem bảo hộ trong Rift.`;
      } else {
        receiveItem(state, e.robItem);
        state.lastLog = `🗡️ Cướp: nhận ${e.robItem.name}.`;
        remember(state, action, rng);
        gilded.mark(state);
      }
      completeFloor(state, session, rng, 0);
    } else if (k === "fountain") {
      if (e.roll < (e.healThreshold ?? 0.6)) {
        const recovery = healEvent(state, state.maxHp);
        done("🩸 Blood Fountain đã hồi phục HP/MP cho bạn.\n" + recovery.log);
      } else if (e.roll < (e.goodThreshold ?? 0.85)) {
        addSource(state, { maxHp: 15 });
        const recovery = healEvent(state, 15);
        done(
          "🩸 Blood Fountain đã tăng sinh lực và hồi HP/MP cho bạn.\n" +
            recovery.log,
        );
      } else combat(e.enemy, "Blood Mimic xuất hiện!");
    } else if (k === "horadric") {
      const target = itemById(e.targetId);
      const previousLevel = target.level;
      const removedCurse =
        target.definition.curse && previousLevel > (target.cleansedLevels || 0);
      grind(state, target);
      if (action === "forge_main") addSource(state, { [mainStat(state)]: 6 });
      else if (action === "forge_guard") addSource(state, { [e.forgeStat]: 7 });
      else if (action === "forge_vit") addSource(state, { vit: 4 });
      else state.escapeTokens = 1;
      const rewardKey =
        action === "forge_main"
          ? mainStat(state)
          : action === "forge_guard"
            ? e.forgeStat
            : action === "forge_vit"
              ? "vit"
              : "ticket";
      done(
        `${eventIcon("horadric")} Horadric Forge: chuyển hóa ${E.backpack} **${target.name}** ${previousLevel === 1 ? "(đã hết level, rời trang bị)" : `Lv.${previousLevel}→**${target.level}**`}. Giữ hiệu ứng có lợi của level đã dùng trong run${removedCurse ? "; gỡ lời nguyền của level đó" : ""}.\nPhần thưởng đã chọn: ${E[rewardKey]} **${rewardKey === "ticket" ? "Vé thoát" : rewardKey.toUpperCase()}**.`,
      );
    } else if (k === "mirror") {
      if (action === "event_mirror_power") {
        addSource(state, { [mainStat(state)]: 10 });
        done("🪞 Mirror of Fate: đã chọn sức mạnh.");
      } else if (action === "event_mirror_guard") {
        addSource(state, { vit: 8, [e.defenseStat]: 5 });
        done("🪞 Mirror of Fate: đã chọn phòng thủ.");
      } else {
        state.lastLog = "🪞 Đập gương.";
        if (e.roll < 0.2) {
          addSource(state, { luck: 2 });
          completeFloor(state, session, rng, 0);
        } else {
          remember(state, "mirror_break", rng, { enemy: e.enemy });
          completeFloor(state, session, rng, 0);
        }
      }
    } else if (k === "treasure_room") {
      const color = action.split("_").at(-1);
      const chestName = `rương ${{ red: "đỏ", blue: "xanh", gold: "vàng" }[color]}`;
      if (color === e.mimicColor)
        combat(
          e.enemy,
          `${treasureChestIcon(color)} Mở ${chestName}: Mimic xuất hiện!`,
        );
      else {
        if (color === "red") addSource(state, { physical: 5, spell: 5 });
        if (color === "blue") addSource(state, { defense: 6, resistance: 5 });
        if (color === "gold") {
          state.bonus += Math.floor(state.stake * 0.5);
          addSource(state, { luck: 1 });
        }
        done(
          `${treasureChestIcon(color)} Nhận thưởng ${chestName}${color === "gold" ? `: bonus +50% cược (${Math.floor(state.stake * 0.5).toLocaleString("vi-VN")} xu)` : ""}.`,
        );
      }
    } else if (k === "contract") {
      state.contract = {
        kind: action.slice(9),
        from: state.floor + 1,
        until: state.floor + 3,
        remaining: 3,
        item: e.item,
      };
      done(
        `${eventIcon("contract")} Đã nhận Rift Contract · tầng ${state.contract.from}–${state.contract.until}. Xem điều kiện và phần thưởng trong **Rift**.`,
      );
    } else if (k === "class_shrine") {
      state.classShrine = {
        classKey: state.classKey,
        from: state.floor + 1,
        until: state.floor + 3,
        consumed: false,
      };
      const effects = {
        amazon: `${SKILL_ICONS.amazon} Barrage: 20% thêm phát thứ ba`,
        barbarian: `${E.defense} DEF +8 khi ${E.hp} HP ≤30%`,
        assassin: `${E.evasion} chặn một phản công, tiêu hao khi kích hoạt`,
        sorceress: `${SKILL_ICONS.sorceress} một skill miễn phí ${E.mana} MP, tiêu hao khi dùng`,
        druid: `${E.hp} hồi 5% Max HP và ${E.mana} 5% Max MP mỗi tầng (MP làm tròn lên)`,
        necromancer: `${E.evasion} chặn một phản công, tiêu hao khi kích hoạt`,
        paladin: `${E.res} RES +10 khi nhận phép`,
      };
      done(
        `${E.shrine} Class Shrine · tầng ${state.classShrine.from}–${state.classShrine.until}: ${effects[state.classKey]}.`,
      );
    } else if (k === "doors") {
      const door = action.slice(5);
      if (e.doors[door]) {
        let recovery;
        if (door === "light") {
          recovery = healEvent(state, state.maxHp);
          state.potions = Math.min(state.maxPotions, state.potions + 1);
        }
        if (door === "gold") state.bonus += Math.floor(state.stake * 0.5);
        if (door === "dark") receiveItem(state, e.item);
        done(
          `${eventIcon("doors")} Cửa ${{ light: "sáng", gold: "vàng", dark: "tối" }[door]}: ${door === "light" ? `hồi đầy ${E.hp} HP/${E.mana} MP và tiếp tế ${E.potion} bình máu` : door === "gold" ? `bonus +50% cược (${Math.floor(state.stake * 0.5).toLocaleString("vi-VN")} xu)` : "nhận trang bị SSR"}.` +
            (recovery ? "\n" + recovery.log : ""),
        );
      } else if (door === "light") {
        hurt(state, state.maxHp * 0.2, true, true);
        done("🚪 Cửa sáng: gặp bẫy gây mất HP, giữ ít nhất 1.");
      } else
        combat(
          door === "gold" ? e.mimic : e.boss,
          `🚪 ${door === "gold" ? "Mimic" : "Premature Rift Boss"} xuất hiện!`,
        );
    } else throw new Error("INVALID_ACTION");
  }
  return { actSurprise };
};
