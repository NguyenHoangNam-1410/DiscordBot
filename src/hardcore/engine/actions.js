"use strict";
const purifier = require("../events/purifier");
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    world,
    covenant,
    bosses,
    gilded,
    paradox,
    E,
    RIFT_ICONS,
    eventIcon,
    sealIcon,
    monsterIcon,
    echoes,
    recompute,
    mainStat,
    statSnapshot,
  } = dependencies;
  const addSource = (...args) => dependencies.addSource(...args);
  const rngesusFleeChance = (...args) =>
    dependencies.rngesusFleeChance(...args);
  const rngesusPrayerChance = (...args) =>
    dependencies.rngesusPrayerChance(...args);
  const payout = (...args) => dependencies.payout(...args);
  const taxCost = (...args) => dependencies.taxCost(...args);
  const payoutSnapshot = (...args) => dependencies.payoutSnapshot(...args);
  const penalty = (...args) => dependencies.penalty(...args);
  const healEvent = (...args) => dependencies.healEvent(...args);
  const hurt = (...args) => dependencies.hurt(...args);
  const mechanicHurt = (s, amount, hostile = true, nonlethal = false) =>
    hurt(s, amount, hostile, nonlethal, !require("../innate").enabled(s));
  const receiveItem = (...args) => dependencies.receiveItem(...args);
  const receiveSnapshot = (...args) => dependencies.receiveSnapshot(...args);
  const remember = (...args) => dependencies.remember(...args);
  const alive = (...args) => dependencies.alive(...args);
  const nextMilestone = (...args) => dependencies.nextMilestone(...args);
  const finishEventResult = (...args) =>
    dependencies.finishEventResult(...args);
  const completeFloor = (...args) => dependencies.completeFloor(...args);
  const openChest = (...args) => dependencies.openChest(...args);
  const generateEncounter = (...args) =>
    dependencies.generateEncounter(...args);
  const upgradeTreasureShrine = (...args) =>
    dependencies.upgradeTreasureShrine(...args);
  const prepareParadoxCombat = (...args) =>
    dependencies.prepareParadoxCombat(...args);
  const enemyTurn = (...args) => dependencies.enemyTurn(...args);
  const playerAttack = (...args) => dependencies.playerAttack(...args);
  const prepareItemCombat = (...args) =>
    dependencies.prepareItemCombat(...args);
  const passiveTrapDamage = (...args) =>
    dependencies.passiveTrapDamage(...args);
  const actions = (...args) => dependencies.actions(...args);
  const actSurprise = (...args) => dependencies.actSurprise(...args);
  const noteEvent = (...args) => dependencies.noteEvent(...args);
  const defeatEnemy = (...args) => dependencies.defeatEnemy(...args);
  const resolveMemory = (...args) => dependencies.resolveMemory(...args);

  function act(state, session, action, rng) {
    const beta = require("../beta");
    if (action === "beta_end") {
      if (!beta.is(state)) throw Error("INVALID_ACTION");
      return "beta_end";
    }
    if (beta.is(state) && state.beta.awaitingRevive) {
      if (action !== "beta_revive") throw Error("INVALID_ACTION");
      beta.revive(state, session, rng, {
        recompute,
        completeFloor,
        defeatEnemy,
      });
      return null;
    }
    if (action === "beta_revive") throw Error("INVALID_ACTION");
    const previousEncounter = state.encounter;
    if (action === "retreat") {
      if (
        state.encounter.type === "rngesus" ||
        state.phase === "boss_chest" ||
        state.encounter.forge?.stage === "boon" ||
        (state.encounter.type === "surprise" &&
          state.encounter.kind === "gambler") ||
        bosses.retreatLocked(state)
      )
        throw new Error("CANNOT_RETREAT");
      require("../innate").finish(
        state,
        state.encounter,
        dependencies.heal,
        bosses.effectiveMaxMana(state),
      );
      return state.phase === "summit"
        ? "summit"
        : state.cleared
          ? "cashout"
          : "forfeit";
    }
    if (
      !actions(state).some(
        (option) => option.action === action && !option.disabled,
      )
    )
      throw new Error("INVALID_ACTION");
    if (
      state.encounter.type === "surprise" &&
      state.encounter.kind === "purifier"
    ) {
      if (action.startsWith("purifier_select_")) {
        state.encounter.targetId = action.slice("purifier_select_".length);
        state.encounter.purifierPage = Math.floor(
          purifier
            .items(state)
            .findIndex(
              (item) => item.definition.id === state.encounter.targetId,
            ) / purifier.PAGE_SIZE,
        );
        return null;
      }
      if (action.startsWith("purifier_page_")) {
        state.encounter.purifierPage = Number(
          action.slice("purifier_page_".length),
        );
        return null;
      }
    }
    if (
      state.encounter.type === "surprise" &&
      state.encounter.kind === "horadric" &&
      state.encounter.forge?.version === 2
    ) {
      if (action.startsWith("forge_select_")) {
        const id = action.slice("forge_select_".length);
        state.encounter.forge.targetId = id;
        state.encounter.targetId = id;
        state.encounter.forgePage = Math.floor(
          state.items.findIndex((item) => item.definition.id === id) /
            require("../equipment/forge").PAGE_SIZE,
        );
        return null;
      }
      if (action.startsWith("forge_page_")) {
        state.encounter.forgePage = Number(action.slice("forge_page_".length));
        return null;
      }
    }
    if (bosses.isFree(state, action)) {
      const decision = bosses.actComponent(state, action, {
        hurt,
        heal: dependencies.heal,
        addSource,
      });
      if (action.includes("__core_"))
        state.lastLog += (state.lastLog ? "\n" : "") + decision.log;
      state.bossSelectorRevisions = (state.bossSelectorRevisions || 0) + 1;
      bosses.refresh(state);
      return null;
    }
    const before = statSnapshot(state);
    state.passiveCounterUsed = 0;
    delete state.passiveImmunityThisTurn;
    state.lastLog = "";
    delete state.lastDeathCause;
    state.lastReceivedItems = [];
    delete state.lastUpgrade;
    delete state.lastPurifiedItem;
    delete state.lastEventResult;
    delete state.pendingEventResult;
    if (
      (state.phase === "encounter" && state.encounter.type !== "combat") ||
      state.phase === "boss_chest"
    )
      state.pendingEventResult = {
        name: state.encounter.name,
        type: state.encounter.type,
        kind: state.encounter.kind,
        before,
        payoutBefore: payoutSnapshot(state),
        directKeys: [],
      };
    state.discardedTicketsThisTurn = 0;
    if (
      state.encounter.type === "prophecy" &&
      action === "prophecy_skip" &&
      !dependencies.memories.canQueue(state)
    ) {
      state.lastLog = "Đầy ký ức: bỏ qua Threefold Prophecy.";
      completeFloor(state, session, rng, 0);
      return null;
    }
    if (state.encounter.type === "prophecy") {
      const kind = action.slice(9);
      if (state.prophecy || !dependencies.memories.canQueue(state))
        throw new Error("INVALID_ACTION");
      const effects =
        kind === "war"
          ? { [mainStat(state)]: 12, bossDamage: 0.08 }
          : kind === "protection"
            ? { vit: 12, resistance: 5 }
            : { ene: 10, maxMana: 1 };
      state.prophecy = { kind, floor: 333, awakened: false };
      addSource(state, effects, "prophecy");
      state.lastLog =
        sealIcon(kind) +
        " Đã ghi nhớ ấn bạn chọn: quyết định cơ chế Kabraxis ở tầng 666. Xem Rift để biết phần thưởng thức tỉnh.";
      completeFloor(state, session, rng, 0);
    } else if (state.encounter.type === "boss_gate") {
      state.encounter = state.encounter.enemy;
      state.lastLog =
        monsterIcon(state.encounter) +
        " Kabraxis đã phong tỏa đường rút. Chỉ có thể thắng hoặc tử trận.";
      prepareParadoxCombat(state, rng);
    } else if (
      ["covenant_blessing", "royal_blessing"].includes(state.encounter.type) &&
      ["covenant_continue", "royal_continue"].includes(action)
    ) {
      state.lastLog =
        state.encounter.type === "royal_blessing"
          ? eventIcon("royal_invitation") +
            " Tiếp tục khám phá sau phước lành Hoàng Gia."
          : eventIcon("covenant") +
            " Tiếp tục khám phá sau phước lành Chinh Phạt.";
      finishEventResult(state);
      nextMilestone(state, session, rng);
    } else if (
      state.encounter.type === "god_rngesus" &&
      action === "god_continue"
    ) {
      state.lastLog =
        eventIcon("god_rngesus") +
        " Tiếp tục tầng " +
        state.floor +
        " sau phước lành của God of RNGesus.";
      state.encounter = generateEncounter(state, session, rng);
    } else if (state.phase === "boss_chest") {
      if (state.encounter.offers && /^boss_pick_[0-2]$/.test(action)) {
        receiveItem(state, state.encounter.offers[Number(action.slice(-1))]);
        state.lastLog = "🎁 Đã chọn một vật phẩm từ rương boss.";
      } else if (action === "boss_open") {
        receiveItem(state, state.encounter.item);
        state.lastLog = `${eventIcon("boss_chest")} Đã mở rương boss tầng ${state.encounter.bossFloor}.`;
      } else {
        const amount = state.stake;
        state.bonus += amount;
        state.lastLog = `${eventIcon("boss_chest")} Bán rương boss: bonus +100% cược (${amount.toLocaleString("vi-VN")} xu), cộng vào thưởng của run.`;
      }
      finishEventResult(state);
      nextMilestone(state, session, rng);
    } else if (state.phase === "upgrade") {
      const key = action.slice(8);
      addSource(state, { [key]: 5 }, "checkpoint");
      state.lastUpgrade = {
        key,
        before,
        after: Object.fromEntries(
          Object.keys(before).map((name) => [name, state[name]]),
        ),
      };
      state.lastLog = "Đã phân bổ điểm checkpoint.";
      nextMilestone(state, session, rng);
    } else if (state.phase === "paradox" && state.encounter.version === 2) {
      paradox.choose(state, action.slice(8));
      state.lastLog = `${eventIcon("paradox")} Đã chọn **${paradox.CATALOG[state.activeParadox.id].name}** · tầng ${state.activeParadox.startFloor}–${state.activeParadox.endFloor}. Xem hiệu ứng trong **Rift**.`;
      nextMilestone(state, session, rng);
    } else if (state.phase === "paradox") {
      state.paradoxMilestonesClaimed ||= [];
      const milestone = state.floor - 1;
      if (state.paradoxMilestonesClaimed.includes(milestone))
        throw new Error("STALE_ACTION");
      state.paradoxMilestonesClaimed.push(milestone);
      state.paradox = {
        kind: action.slice(8),
        from: state.floor,
        until: state.floor + 4,
        bloodFactor: 0,
      };
      state.lastLog = `${eventIcon("paradox")} Đã chọn **${state.paradox.kind === "blood" ? "Máu là tiền" : "Ngược đời"}** · tầng ${state.paradox.from}–${state.paradox.until}. Xem hiệu ứng trong **Rift**.`;
      nextMilestone(state, session, rng);
    } else if (state.phase === "severance") {
      const key = action.slice(6);
      const removed = state.modifiers[key] || 0;
      const aftercare = state.encounter.thiefAftercare;
      if (aftercare)
        require("../events/explorationMarks").finishAftercare(
          state,
          action !== "sever_none",
        );
      if (action !== "sever_none") {
        if (require("../rift").enabled(state))
          require("../rift").sever(state, key);
        else delete state.modifiers[key];
      }
      state.lastLog = `${eventIcon("severance")} Rift Severance: ${action === "sever_none" ? "không có modifier phù hợp để xóa" : `đã xóa ${RIFT_ICONS[key] || E.rift} ×${removed}, hiệu ứng của loại Rift này không còn áp dụng`}.`;
      if (aftercare)
        state.lastLog = `${eventIcon("potion_thief")} Trùm băng đảng · Dịch vụ hậu mãi: ${action === "sever_none" ? "không có Rift phù hợp để xóa" : `đã xóa toàn bộ ${RIFT_ICONS[key] || E.rift} ×${removed}; đã dùng lượt miễn phí`}.`;
      nextMilestone(state, session, rng);
    } else {
      const e = state.encounter;
      if (e.type === "combat") {
        if (e.echoId && !echoes.owns(session, e.echoId)) {
          e.echoId = null;
          e.echoItem = null;
          e.echo = null;
          state.lastLog =
            "Mộ đã hết thời gian claim; trận đấu tiếp tục, không còn loot từ mộ.\n";
        } else if (e.echoId) echoes.renew(session, e.echoId);
        prepareItemCombat(state, rng);
        delete e.awakeningShadowGranted;
        require("../rift").beginAction(state, action);
        const beforeEnemyHp = e.hp;
        require("../characters/venance").begin(state, action);
        if (action.startsWith("boss_"))
          require("../characters/rhakor").offAction(state);
        const acted =
          action === "ritual_claim"
            ? { log: "", dealt: 0, critical: false }
            : action.startsWith("boss_") && state.encounter.boss?.version === 2
              ? (() => {
                  require("../innate").begin(state, action);
                  bosses.beginAction(state, action);
                  const v = bosses.actComponent(state, action, {
                    hurt,
                    heal: dependencies.heal,
                    addSource,
                  });
                  const acted = { ...v, dealt: v.dealt || 0, critical: false };
                  bosses.afterPlayer(state, action, acted);
                  return acted;
                })()
              : playerAttack(state, action, rng);
        require("../rift").thresholds(state, beforeEnemyHp, e.hp);
        require("../rift").endAction(state, acted.dealt || 0);
        const innateFrame = require("../innate").combat(state);
        if (
          innateFrame &&
          !require("../innate").rebalanced(state) &&
          state.classKey === "sorceress"
        )
          innateFrame.counterSkillCost = dependencies.skillManaCost(state);
        if (action !== "ritual_claim") paradox.afterAction(state, action);
        state.lastLog += acted.log;
        state.lastLog += bosses.beforeResolution(state, { hurt: mechanicHurt });
        const ritual = gilded.afterAction(state, action, acted, mechanicHurt);
        state.lastLog += ritual.log;
        if (
          state.contract &&
          state.floor >= state.contract.from &&
          state.floor <= state.contract.until &&
          state.contract.kind === action
        ) {
          state.contract = null;
          state.lastLog += "\n📜 Vi phạm hợp đồng: hủy phần thưởng.";
        }
        if (e.hp <= 0 && alive(state)) {
          defeatEnemy(state, session, rng, e);
        } else if (alive(state) && !ritual.skipCounter) {
          const doubleCounter =
            paradox.is(state, "time_debt") &&
            state.activeParadox.combatActionCount === 3;
          if (
            bosses.on(e) &&
            e.boss.version === 1 &&
            e.boss.id === "kabraxis" &&
            e.boss.seal === "war" &&
            action === "skill"
          )
            state.lastLog +=
              "\n" +
              sealIcon("war") +
              " Blood Revenge: " +
              enemyTurn(
                state,
                rng,
                acted.defend,
                acted.dodge,
                action === "defend",
                true,
              );
          if (alive(state) && e.hp > 0)
            state.lastLog += `\n${enemyTurn(state, rng, acted.defend, acted.dodge, action === "defend")}`;
          if (doubleCounter && alive(state) && e.hp > 0)
            state.lastLog += `\n⏳ Phản công lần hai: ${enemyTurn(state, rng, acted.defend, acted.dodge, action === "defend")}`;
          if (e.hp <= 0 && alive(state)) defeatEnemy(state, session, rng, e);
        }
        if (state.encounter === e && e.hp > 0 && alive(state))
          bosses.endAction(state, rng, {
            hurt,
            heal: dependencies.heal,
            addSource,
          });
        if (state.encounter === e)
          require("../rift").thresholds(state, beforeEnemyHp, e.hp);
        state.lastLog += require("../characters/venance").end(state, action, e);
      } else if (e.type === "surprise") {
        actSurprise(state, session, action, rng);
        if (action !== "event_skip" && !e.taxRelief)
          noteEvent(state, e.kind, state.encounter?.type === "combat");
      } else if (e.type === "chest") {
        if (action === "inspect") {
          e.inspected = true;
          e.revealed =
            ["mimic", "ancient_mimic"].includes(e.kind) && e.detectionSuccess;
          state.lastLog = e.revealed
            ? "👁️ Phát hiện Mimic!"
            : "🔍 Không phát hiện dấu hiệu bất thường.";
        } else if (action === "sell") {
          state.bonus += Math.floor(state.stake * 0.15);
          state.lastLog = "Bán hòm: bonus +15% cược.";
          completeFloor(state, session, rng, 0);
        } else if (action === "leave") {
          state.lastLog = "Tránh Mimic.";
          completeFloor(state, session, rng, 0);
        } else openChest(state, session, e, rng);
      } else if (
        e.type === "shrine" &&
        e.kind === "ritual" &&
        action === "ritual_summon"
      ) {
        gilded.summon(state, rng);
        noteEvent(state, "adventurer_ritual", true);
        prepareParadoxCombat(state, rng);
      } else if (e.type === "shrine") {
        upgradeTreasureShrine(state);
        if (action === "touch") {
          const recovery =
            e.kind === "healing" ? healEvent(state, state.maxHp) : null;
          if (e.kind === "armor") addSource(state, { [e.armorStat]: 5 });
          if (e.kind === "treasure") receiveItem(state, e.item);
          if (e.kind === "experience")
            state.bonus += Math.floor(state.stake * 0.25);
          if (e.kind === "corrupted")
            addSource(state, { [e.powerStat || mainStat(state)]: 12, vit: -8 });
          if (e.kind === "fake") {
            hurt(
              state,
              passiveTrapDamage(state, Math.max(10, state.maxHp * 0.3)),
              true,
              true,
            );
          }
          const outcomes = {
            healing: "Healing: hồi phục HP/MP",
            armor: `Armor: tăng ${E[e.armorStat]} ${e.armorStat?.toUpperCase()}`,
            treasure: "Treasure: đã nhận vật phẩm",
            experience: `Experience: bonus +25% cược (${Math.floor(state.stake * 0.25).toLocaleString("vi-VN")} xu), cộng vào thưởng của run`,
            corrupted: `Corrupted: tăng ${E[e.powerStat || mainStat(state)]} ${(e.powerStat || mainStat(state)).toUpperCase()}, giảm ${E.vit} VIT`,
            fake: `Fake: bẫy gây mất ${E.hp} HP, luôn chừa ít nhất **1 HP**`,
          };
          state.lastLog =
            `${E.shrine} Shrine ${outcomes[e.kind]}.` +
            (recovery ? "\n" + recovery.log : "");
          if (state.pendingEventResult)
            state.pendingEventResult.name = `Shrine ${e.kind[0].toUpperCase()}${e.kind.slice(1)}`;
        } else state.lastLog = `Bỏ qua ${E.shrine} Shrine.`;
        if (alive(state)) completeFloor(state, session, rng, 0);
      } else if (e.type === "trap") {
        if (
          e.kind === "portal" &&
          action !== "skip" &&
          action !== "covenant_basement"
        )
          noteEvent(state, "wrong_portal", !e.good);
        if (action === "covenant_basement") {
          covenant.beginTrial(state, rng);
          noteEvent(state, "covenant_basement", true);
          prepareItemCombat(state, rng);
        } else if (e.kind === "portal" && action === "skip") {
          state.lastLog =
            "Bỏ qua Wrong Portal: không nhận thưởng hoặc chịu hiệu ứng của portal.";
          completeFloor(state, session, rng, 0);
        } else if (e.kind === "bounty_hunter") {
          const marks = require("../events/explorationMarks");
          const m = marks.ensure(state);
          if (action === "bounty_surrender") {
            if (!(state.escapeTokens > 0)) throw new Error("INVALID_ACTION");
            state.escapeTokens -= 1;
            const maxBefore = state.maxHp;
            addSource(state, { vit: marks.BOUNTY_VIT });
            state.hp = Math.min(state.maxHp, state.hp + (state.maxHp - maxBefore));
            noteEvent(state, "bounty_hunter", false);
            state.bountyGive = (state.bountyGive || 0) + 1;
            state.lastLog = `${eventIcon("bounty_hunter")} Giao nộp Bounty Hunter: mất ${E.ticket} **1 Vé thoát**, nhận ${E.vit} **VIT +${marks.BOUNTY_VIT}** cộng thẳng vào chỉ số (Max ${E.hp} HP ${maxBefore} → ${state.maxHp}). Bạn có thể gặp lại Bounty Hunter nếu còn vé.`;
          } else if (action === "bounty_resist") {
            m.bountyResisted = true;
            m.bountyCurse = { bribes: 0 };
            noteEvent(state, "bounty_hunter", false);
            state.bountyResist = (state.bountyResist || 0) + 1;
            state.lastLog = `${eventIcon("bounty_hunter")} Chống trả Bounty Hunter: giữ lại ${E.ticket} Vé thoát, thợ săn không xuất hiện lại. Nhưng bạn bị Bounty Curse: Hối lộ RNGesus tốn thêm 5% payout sau mỗi lần hối lộ (lần đầu ${Math.round(marks.bribeRate(state) * 100)}%). Xem Rift.`;
          } else throw new Error("INVALID_ACTION");
          completeFloor(state, session, rng, 0);
        } else if (e.kind === "tax" && action === "tax_resist") {
          if (!dependencies.memories.canQueue(state))
            throw new Error("INVALID_ACTION");
          require("../events/explorationMarks").oppose(state, "tax");
          require("../events/explorationMarks").ensure(state).outlaw = true;
          state.lastLog =
            eventIcon("tax") +
            " Chống trả Tax Collector: nhận Royal Outlaw đến hết run. Không còn gặp Tax Collector; Boss gây thêm 20% DMG. Xem Rift.";
          completeFloor(state, session, rng, 0);
        } else if (e.kind === "potion_thief" && action === "thief_fight") {
          if (!dependencies.memories.canQueue(state))
            throw new Error("INVALID_ACTION");
          require("../events/explorationMarks").oppose(state, "potion_thief");
          state.encounter = world.makeEnemy(state, "elite", "The Thief", rng);
          state.encounter.thiefTrial = true;
          state.lastLog =
            "The Thief · Tinh anh: hạ để nhận bonus 20% cược và Underworld Lead. Bạn hành động trước.";
          finishEventResult(state);
          prepareItemCombat(state, rng);
        } else if (e.kind !== "portal") {
          const cooperationStarted = require("../events/explorationMarks").accept(
            state,
            e.kind,
          );
          if (e.lucky) state.lastLog = `${E.luck} Lucky Break: tránh bẫy.`;
          else if (e.kind === "tax") {
            const cost = taxCost(state);
            state.payoutSpent = (state.payoutSpent || 0) + cost;
            state.payoutTaxSpent = (state.payoutTaxSpent || 0) + cost;
            state.lastLog = cost
              ? `${eventIcon("tax")} Tax Collector: đã thu một lần 15% payout hiện tại.`
              : `${eventIcon("tax")} Tax Collector: không có payout để thu thuế.`;
          } else if (require("../events/explorationMarks").enabled(state)) {
            if (e.good) {
              penalty(state, 0.1);
              state.lastLog = "The Thief: mất 10% payout hiện tại.";
            } else {
              const stolen = Math.ceil(state.potions / 2);
              state.potions -= stolen;
              state.lastLog =
                "The Thief: mất " +
                stolen +
                " bình máu" +
                (stolen ? " (một nửa, làm tròn lên)." : ": túi đã hết bình.");
            }
          } else {
            const stolen = Math.min(1, state.potions);
            state.potions -= stolen;
            state.lastLog = stolen
              ? "Potion Thief đã cướp bình máu."
              : `Potion Thief không cướp được gì vì bạn có 0 ${E.potion} bình máu.`;
          }
          if (cooperationStarted)
            state.lastLog += e.kind === "tax"
              ? `\n${eventIcon("tax")} Đã ghi nhận hợp tác: sau boss 950 nhận 1 lượt giải nguyền miễn phí cho 1 trang bị; chống trả sẽ hủy quyền lợi đang chờ.`
              : `\n${eventIcon("potion_thief")} Đã ghi nhận hợp tác: sau tầng 998 gặp trùm băng đảng để xóa 1 loại Rift có hại; đánh đuổi sẽ hủy quyền lợi.`;
          completeFloor(state, session, rng, 0);
        } else if (e.good) {
          let recovery;
          if (e.effect === "healing") {
            addSource(state, { maxHp: 10 });
            recovery = healEvent(state, state.maxHp);
            state.potions = Math.min(state.maxPotions, state.potions + 1);
          }
          if (e.effect === "treasure")
            state.bonus += Math.floor(state.stake * 0.5);
          if (e.effect === "blessing")
            addSource(state, { str: 6, ene: 6, luck: 1 });
          state.lastLog =
            `Wrong Portal: ${{ healing: "hồi phục HP/MP và tiếp tế", treasure: "bonus +50% cược", blessing: "nhận phúc tăng thuộc tính" }[e.effect]}.` +
            (recovery ? "\n" + recovery.log : "");
          completeFloor(state, session, rng, 0);
        } else {
          if (e.badEffect === "blood")
            hurt(
              state,
              passiveTrapDamage(state, state.maxHp * 0.15),
              true,
              true,
            );
          if (e.badEffect === "mana") state.mana = 0;
          if (e.badEffect === "supply")
            state.potions = Math.max(0, state.potions - 2);
          if (e.badEffect === "payout") penalty(state, 0.1);
          if (e.badEffect === "curse") addSource(state, { str: -5, ene: -5 });
          state.encounter = e.enemy;
          state.lastLog = `Wrong Portal: ${{ blood: "bẫy gây mất HP (giữ ≥1)", mana: "bị rút cạn MP", supply: "bị cướp bình máu", payout: "trừ một lần 10% payout hiện tại", curse: "lời nguyền giảm thuộc tính" }[e.badEffect]}. Elite đánh phủ đầu.`;
          prepareItemCombat(state, rng);
          state.lastLog += `\n${enemyTurn(state, rng)}`;
        }
      } else if (e.type === "rngesus") {
        const die = (cause) => {
          state.lastDeathCause = cause;
          state.lastLog = `☠️ Tử trận: ${cause}`;
          delete state.pendingEventResult;
          return "rngesus";
        };
        if (action === "fight")
          return die("Bạn chọn đánh RNGesus, đối thủ không thể đánh bại.");
        if (action === "flee") {
          const chance = e.fleeChance ?? rngesusFleeChance(state);
          state.rngesusFleeCount = (state.rngesusFleeCount || 0) + 1;
          const nextChance = Math.round(rngesusFleeChance(state) * 100);
          const failureChance = Math.round((1 - chance) * 100);
          if (chance < 1 && !e.fleeSuccess) {
            if (state.escapeTokens) {
              state.escapeTokens--;
              state.lastLog = `RNGesus: bỏ chạy thất bại (nhánh ${failureChance}%); tự dùng ${E.ticket} **Vé thoát** để sống sót. Tỷ lệ chạy lần sau: **${nextChance}%**.`;
            } else
              return die(
                `Bỏ chạy khỏi RNGesus thất bại (nhánh ${failureChance}%) và không có vé thoát để cứu.`,
              );
          } else
            state.lastLog = `RNGesus: bỏ chạy thành công (tỷ lệ ${Math.round(chance * 100)}%), thoát an toàn. Tỷ lệ chạy lần sau: **${nextChance}%**.`;
        }
        if (action === "bribe") {
          const marks = require("../events/explorationMarks");
          const rate = marks.bribeRate(state);
          penalty(state, rate);
          marks.noteBribe(state);
          state.lastLog = `Hối lộ: trừ một lần ${Math.round(rate * 100)}% payout hiện tại${rate > 0.4 ? " (đã gồm Bounty Curse)" : ""}.`;
        }
        if (action === "pray") {
          if (!e.prayerSuccess)
            return die(
              `Cầu nguyện RNGesus thất bại (nhánh ${Math.round((1 - (e.prayerChance ?? rngesusPrayerChance(state))) * 100)}%).`,
            );
          e.prayerItem ||= dependencies.randomItem(
            "cursed",
            rng,
            state,
            "rngesus_prayer",
          );
          receiveItem(state, e.prayerItem);
          state.lastLog = `${eventIcon("rngesus")} RNGesus: cầu nguyện thành công, đã nhận **${e.prayerItem.name} [UR]**${e.prayerItem.curse ? " kèm lời nguyền" : ""}.`;
          remember(state, "pray_rngesus", rng);
        }
        completeFloor(state, session, rng, 0);
      } else if (e.type === "echo") {
        if (!echoes.owns(session, e.echo.id)) {
          state.lastLog = "Mộ đã hết thời gian claim.";
          completeFloor(state, session, rng, 0);
        } else if (action === "echo_pray" || action === "echo_skip") {
          const recovery =
            action === "echo_pray"
              ? healEvent(state, state.maxHp * 0.15)
              : null;
          echoes.release(session, e.echo.id);
          state.lastLog =
            "Để mộ yên nghỉ." + (recovery ? "\n" + recovery.log : "");
          completeFloor(state, session, rng, 0);
        } else if (action === "echo_challenge") {
          state.encounter = e.challenger;
          state.lastLog = "Khiêu chiến Grave Echo mạnh hơn 25%.";
        } else {
          if (e.item) receiveSnapshot(state, e.item);
          // Claim the grave's loot once now; the later spirit has no live grave lease.
          echoes.consume(session, e.echo.id);
          state.lastLog = e.awakens
            ? "Cướp mộ: người chết đã ghi nhớ."
            : "Cướp mộ an toàn.";
          if (e.awakens)
            remember(state, "echo_rob", rng, {
              enemy: e.enemy,
              coins: Math.floor(state.stake * (0.25 + 0.1 * e.echo.kills)),
            });
          completeFloor(state, session, rng, 0);
        }
      } else if (e.type === "memory") {
        resolveMemory(state, session, action, rng);
      } else {
        state.lastLog = "Phòng trống, đi tiếp.";
        completeFloor(state, session, rng, 0);
      }
    }
    if (
      state.encounter?.type === "combat" &&
      state.encounter.hp <= 0 &&
      alive(state)
    )
      defeatEnemy(state, session, rng, state.encounter);
    if (require("../rift").encounter(state) && state.encounter.boss)
      require("../rift").nextCounter(state, rng, bosses.counter(state));
    delete state.encounter?.awakeningGroundThisAction;
    if (
      previousEncounter !== state.encounter &&
      previousEncounter.type === "combat"
    )
      require("../innate").finish(
        state,
        previousEncounter,
        dependencies.heal,
        state.maxMana,
      );
    require("../innate").endAction(state);
    recompute(state);
    state.mana = Math.min(state.mana, bosses.effectiveMaxMana(state));
    prepareParadoxCombat(state, rng);
    finishEventResult(state);
    if (state.discardedTicketsThisTurn)
      state.lastLog += `\n${E.ticket} Vé thoát: bỏ ${state.discardedTicketsThisTurn} vé dư (tối đa 1).`;
    delete state.discardedTicketsThisTurn;
    delete state.passiveCounterUsed;
    delete state.passiveImmunityThisTurn;
    if (!alive(state))
      state.lastLog += `\n☠️ Tử trận: ${state.lastDeathCause || "HP về 0 sau hiệu ứng của lượt này."}`;
    state.lastStatChanges = Object.fromEntries(
      Object.entries(before)
        .map(([key, value]) => [key, +(state[key] - value).toFixed(8)])
        .filter(([, value]) => value),
    );
    return alive(state) ? null : "death";
  }
  return { act };
};
