"use strict";
const { itemIcon } = require("../shared/icons");
const purifier = require("../events/purifier");
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

  function stakeText(stake) {
    return stake.type === "payout"
      ? `${stake.amount.toLocaleString("vi-VN")} xu payout`
      : `10% mọi chỉ số (${Object.entries(stake.deduct)
          .map(([key, loss]) => `${key.toUpperCase()} −${loss}`)
          .join(", ")})`;
  }

  function actSurprise(state, session, action, rng) {
    const e = state.encounter,
      k = e.kind;
    const done = (log) => {
      state.lastLog = log;
      if (e.taxRelief) {
        dependencies.finishEventResult(state);
        dependencies.nextMilestone(state, session, rng);
      } else completeFloor(state, session, rng, 0);
    };
    const combat = (enemy, log) => {
      state.encounter = enemy;
      state.lastLog = log;
    };
    const itemById = (id) =>
      state.items.find((item) => item.definition.id === id);
    if (k === "horadric" && e.forge) {
      const f = e.forge;
      if (f.version === 2) {
        if (action === "event_skip") {
          done(
            `${eventIcon("horadric")} Bỏ qua Horadric Forge, giữ nguyên trang bị.`,
          );
          return;
        }
        if (action !== "forge_lend") throw Error("STALE_ACTION");
        const target = itemById(f.targetId);
        if (!target) throw Error("NO_FORGE_ITEM");
        const forge = require("../equipment/forge");
        const result = forge.lend(state, target, receiveItem, recompute);
        done(
          result.instant
            ? `${eventIcon("horadric")} Horadric Forge: nâng cấp ngay ${itemIcon(target)} **${target.name}** [${result.label}] Lv.${result.from} → **${result.to}**.`
            : `${eventIcon("horadric")} Horadric Forge: mượn ${itemIcon(result.loan)} **${result.loan.name}** [${result.label}] Lv.${result.loan.level}. Món biến mất hoàn toàn (kể cả chỉ số, nội tại và nguyền) đến tầng **${result.loan.due}**, khi trả lại sẽ **+${forge.LEVELS} level** (Lv.${result.loan.level + forge.LEVELS}); nếu nhặt được món cùng loại trong lúc đó, level sẽ gộp lại. Bạn không bị mất vĩnh viễn.`,
        );
        return;
      }
      if (f.version !== 1) throw Error("INVALID_FORGE_VERSION");
      if (action === "forge_grind" && f.stage === "grind") {
        const target = itemById(f.targetId);
        if (!target) throw Error("NO_FORGE_ITEM");
        f.removed = {
          id: target.definition.id,
          name: target.name,
          level: target.level,
        };
        grind(state, target);
        f.stage = "boon";
        state.lastLog =
          "🔨 Đã nghiền **" +
          target.name +
          "** · 1 cấp. Buff của cấp này đã bị gỡ. Chọn một phần thưởng chỉ số trong menu để tiếp tục; không tốn vé.";
        return;
      }
      if (
        /^forge_boon_[0-2]$/.test(action) &&
        f.stage === "boon" &&
        !f.claimed
      ) {
        const boon = f.boons[Number(action.slice(-1))];
        f.claimed = true;
        addSource(state, { [boon.key]: boon.amount }, "forgeBoon");
        done(
          "🔨 Horadric Forge: nhận " +
            require("../equipment/forge").rewardIcon(boon) +
            " **" +
            require("../equipment/forge").rewardLabel(boon) +
            "** cho run.",
        );
        return;
      }
      if (f.stage === "boon" || action !== "event_skip")
        throw Error("STALE_ACTION");
    }
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
      done(
        e.taxRelief
          ? state.cleared >= 998
            ? `${eventIcon("tax")} Đã bỏ qua lần mời giải nguyền miễn phí cuối cùng trước boss 999.`
            : `${eventIcon("tax")} Đã để dành lượt giải nguyền miễn phí; có thể dùng tại Purifier hoặc cuộc gặp trước tầng 999, trong run này.`
          : `Bỏ qua ${e.name}.`,
      );
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
      } else if (require("../events/explorationMarks").freeMerchant(state, k)) {
        offer.price = 0;
        paymentLog = "Underworld Lead: mua miễn phí.\n";
      } else if (k === "diamond_shop" && require("../beta").is(state))
        require("../beta").spendDiamonds(state, offer.price);
      else if (k === "diamond_shop")
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
          `${paymentLog}${itemIcon(item)} Nhận ${item.name}${item.consumable ? "" : ` Lv.${item.level}`}.`,
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
      // Old active events counted draws; keep only decisive games in their progress.
      e.round = e.history.filter(
        (h) => h.result === "win" || h.result === "loss",
      ).length;
      if (action === "duel_stat" || action === "duel_items") {
        e.mode = action === "duel_stat" ? "stat" : "items";
        state.lastLog = `Rift Duelist · ${e.mode === "stat" ? "Một ván phân thắng/thua thuộc tính" : "Thắng 3 trong tối đa 5 ván thắng/thua; hòa đánh lại"}.`;
        return;
      }
      const hand = Number(action.slice(5));
      if (!/^hand_[012]$/.test(action) || !e.mode)
        throw new Error("INVALID_ACTION");
      const attempt = e.history.length;
      if (!Number.isInteger(e.hands[attempt]))
        e.hands[attempt] = Math.min(2, Math.floor(rng() * 3));
      const opponent = e.hands[attempt],
        won = (hand + 1) % 3 === opponent,
        tie = hand === opponent;
      e.history.push({
        hand,
        opponent,
        result: won ? "win" : tie ? "draw" : "loss",
      });
      if (!tie) e.round++;
      if (won) e.wins++;
      state.lastLog = `${["Búa", "Kéo", "Bao"][hand]} vs ${["Búa", "Kéo", "Bao"][opponent]}: ${won ? "Thắng" : tie ? "Hòa" : "Thua"}.`;
      if (tie) {
        state.lastLog +=
          " Hòa không tính ván, không thưởng/phạt; chọn lại để tiếp tục.";
        return;
      }
      if (e.mode === "stat") {
        if (won) addSource(state, { [["str", "dex", "ene"][hand]]: 6 });
        else
          for (const key of e.penalty)
            if (state[key] > 1) addSource(state, { [key]: -1 });
        completeFloor(state, session, rng, 0);
      } else if (e.wins >= 3 || e.round >= 5) {
        if (e.wins >= 3) {
          e.reward ||= randomItem(e.rewardRarity, rng, state, "duelist");
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
    if (k === "seal_altar") {
      const marks = require("../events/explorationMarks");
      if (action !== "event_seal_claim" || !marks.sealAltarDue(state))
        throw Error("INVALID_ACTION");
      marks.ensure(state).sealsClaimed = true;
      state.reviveTickets = 1;
      state.sealAltars = (state.sealAltars || 0) + 1;
      done(
        eventIcon("seal_altar") +
          " Đàn Tứ Ấn: bốn ấn **" +
          marks.SEALS.map((seal) => seal.name).join(" · ") +
          "** hội tụ. Nhận " +
          E.reviveTicket +
          " **1 Vé hồi sinh** (dùng trong run này, hồi 50% Max HP khi tử trận). Các ấn vẫn giữ nguyên.",
      );
      return;
    }
    if (k === "healer" && e.healerReturn) {
      const marks = require("../events/explorationMarks"),
        m = marks.ensure(state);
      if (!marks.healerDue(state)) throw Error("INVALID_ACTION");
      const hpBefore = state.hp,
        mpBefore = state.mana;
      delete m.vulnerable;
      m.vitalBlessing = true;
      addSource(
        state,
        { str: 10, dex: 10, vit: 10, ene: 10, luck: 40 },
        "vitalBenediction",
      );
      state.hp = state.maxHp;
      state.mana = state.maxMana;
      markDirect(state, ["hp", "mana"]);
      done(
        eventIcon("healer") +
          " Healer trở lại: " +
          E.hp +
          " HP " +
          hpBefore +
          " → " +
          state.hp +
          "; " +
          E.mana +
          " MP " +
          mpBefore +
          " → " +
          state.mana +
          ". Vulnerable chuyển thành Vital Benediction: LUCK +40; STR/DEX/VIT/ENE +10 đến hết run.",
      );
    } else if (k === "healer" && action === "event_healer_blood") {
      const lost = require("../events/explorationMarks").blood(state);
      markDirect(state, ["hp"]);
      done(
        eventIcon("healer") +
          " Hiến " +
          lost +
          " HP. Nhận Vulnerable: checkpoint không hồi HP trong 10 tầng tiếp theo; xem Tower Remembers trong Rift.",
      );
    } else if (k === "healer") {
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
        e.goblinItem ||= randomItem(
          goblinRewardRarity(e.roll2 ?? rng()),
          rng,
          state,
          "goblin",
        );
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
      const target = purifier.selected(state);
      if (!target) throw new Error("NO_CURSE");
      const freeTaxRelief =
        require("../events/explorationMarks").taxReliefAvailable(state);
      if (e.taxRelief && !freeTaxRelief) throw Error("INVALID_ACTION");
      if (!freeTaxRelief) charge(state, purifierCost(state));
      const purified = {
        name: target.name,
        rarity: target.rarity,
        level: target.level,
        curseLevels: Math.max(0, target.level - (target.cleansedLevels || 0)),
        cleansedLevels: target.cleansedLevels || 0,
        curseEffects: structuredClone(target.definition.curse?.effects || {}),
        defenseLoss:
          target.curseEffects?.defense != null
            ? -target.curseEffects.defense
            : null,
        maxPotionsBefore: state.maxPotions,
        freeTaxRelief,
      };
      cleanse(state, target);
      if (freeTaxRelief)
        require("../events/explorationMarks").useTaxRelief(state);
      state.lastPurifiedItem = {
        ...purified,
        maxPotionsAfter: state.maxPotions,
      };
      done(
        freeTaxRelief
          ? `${eventIcon("tax")} Đã dùng lượt giải nguyền miễn phí của Tax Collector; không trừ payout.`
          : `✨ ${target.name}: giải toàn bộ lời nguyền; giữ UR, level, buff và nội tại.`,
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
      const gambler = require("../events/gambler");
      let intro = "";
      if (!e.gamble) {
        const pick = /^gamble_(blackjack|coquay)_(payout|stats)$/.exec(action);
        if (!pick) throw new Error("INVALID_ACTION");
        const [, game, wager] = pick;
        if (wager === "payout") {
          const amount = serviceCost(state, gambler.WAGERS.payout.fraction);
          charge(state, amount);
          e.stake = { type: "payout", amount };
        } else {
          const deduct = {};
          for (const key of ["str", "dex", "vit", "ene"]) {
            const loss = Math.min(
              Math.max(
                1,
                Math.floor(state[key] * gambler.WAGERS.stats.fraction),
              ),
              Math.max(0, state[key] - 1),
            );
            if (loss) deduct[key] = loss;
          }
          addSource(
            state,
            Object.fromEntries(
              Object.entries(deduct).map(([key, loss]) => [key, -loss]),
            ),
          );
          e.stake = { type: "stats", deduct };
        }
        e.gamble = gambler.newGame(game, rng);
        intro = `${eventIcon("gambler")} Đã đặt cược ${stakeText(e.stake)} vào ${gambler.GAMES[game].name}. `;
      } else gambler.act(e.gamble, action, rng);
      if (gambler.finished(e.gamble)) {
        const win = gambler.won(e.gamble);
        let result;
        if (e.stake.type === "payout") {
          if (win) state.bonus += e.stake.amount * 2;
          result = win
            ? `nhận bonus ${(e.stake.amount * 2).toLocaleString("vi-VN")} xu trước lời nguyền`
            : "không nhận lại khoản cược";
        } else {
          if (win)
            addSource(
              state,
              Object.fromEntries(
                Object.entries(e.stake.deduct).map(([key, loss]) => [
                  key,
                  loss * 2,
                ]),
              ),
            );
          result = win
            ? `nhận lại gấp đôi chỉ số đã cược (${Object.entries(e.stake.deduct)
                .map(([key, loss]) => `${key.toUpperCase()} +${loss * 2}`)
                .join(", ")})`
            : "không nhận lại chỉ số đã cược";
        }
        done(
          `${eventIcon("gambler")} ${gambler.GAMES[e.gamble.game].name}: **${win ? "THẮNG" : "THUA"}**. Đã cược ${stakeText(e.stake)}; ${result}.\n${gambler.text(e.gamble, { reveal: true })}`,
        );
      } else state.lastLog = intro || "Cược đang diễn ra.";
    } else if (k === "adventurer") {
      if (action === "event_rescue") {
        if (state.potions < 1) throw new Error("NO_RESCUE_POTIONS");
        if (
          !state.adventurerRescue &&
          !require("../towerMemories").canQueue(state)
        )
          throw new Error("INVALID_ACTION");
        state.potions--;
        receiveItem(state, e.rescueItem);
        const region = world.regionForFloor(state.floor);
        state.adventurerRescue = { from: region.start, until: region.end };
        state.lastLog = `${memoryIcon("rescue")} Cứu người: nhận ${e.rescueItem.name}.\nÂn nghĩa đã ghi nhận. Xem bảo hộ trong Rift.`;
      } else {
        const memories = require("../towerMemories");
        if (!memories.canQueue(state, memories.robberySlots(state)))
          throw new Error("INVALID_ACTION");
        receiveItem(state, e.robItem);
        state.lastLog = `🗡️ Cướp: nhận ${e.robItem.name}.`;
        remember(state, action, rng);
        gilded.mark(state);
      }
      completeFloor(state, session, rng, 0);
    } else if (k === "fountain") {
      if (e.roll < (e.healThreshold ?? 0.6)) {
        const recovery = healEvent(state, state.maxHp);
        done(
          `🩸 Blood Fountain đã hồi phục ${E.hp}/${E.mana}.\n` + recovery.log,
        );
      } else if (e.roll < (e.goodThreshold ?? 0.85)) {
        addSource(state, { vit: 10 });
        done(`🩸 Blood Fountain: nhận +10 ${E.vit} VIT trong run.`);
      } else combat(e.enemy, "Blood Mimic xuất hiện!");
    } else if (k === "horadric") {
      const target = itemById(e.targetId);
      const previousLevel = target.level;
      const removedCurse =
        target.definition.curse && previousLevel > (target.cleansedLevels || 0);
      const fixedDefenseLoss = target.curseEffects?.defense;
      grind(state, target);
      const curseRemoval = !removedCurse
        ? ""
        : Number.isFinite(fixedDefenseLoss)
          ? target.level > (target.cleansedLevels || 0)
            ? "; gỡ 1 cấp nguyền, khoản DEF đã trừ giữ nguyên vì còn nguyền"
            : "; gỡ cấp nguyền cuối, hoàn trả khoản DEF đã trừ"
          : "; gỡ lời nguyền của level đó";
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
        `${eventIcon("horadric")} Horadric Forge: chuyển hóa ${itemIcon(target)} **${target.name}** ${previousLevel === 1 ? "(đã hết level, rời trang bị)" : `Lv.${previousLevel}→**${target.level}**`}. Giữ hiệu ứng có lợi của level đã dùng trong run${curseRemoval}.\nPhần thưởng đã chọn: ${E[rewardKey]} **${rewardKey === "ticket" ? "Vé thoát" : rewardKey.toUpperCase()}**.`,
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
        venance: `${SKILL_ICONS.venance} một Astral Armament miễn ${E.mana} MP, tiêu hao khi dùng`,
        rha_kor: `${SKILL_ICONS.rha_kor} Cổ Luật từ Khai Bia Cổ Luật tồn tại thêm 1 action`,
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
        if (door === "dark") {
          e.item ||= randomItem("legendary", rng, state, "doors");
          receiveItem(state, e.item);
        }
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
