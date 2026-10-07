"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    covenant,
    gilded,
    paradox,
    E,
    RIFT_ICONS,
    eventIcon,
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
  const heal = (...args) => dependencies.heal(...args);
  const hurt = (...args) => dependencies.hurt(...args);
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
    if (action === "retreat") {
      if (state.encounter.type === "rngesus" || state.phase === "boss_chest")
        throw new Error("CANNOT_RETREAT");
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
      state.encounter.type === "covenant_blessing" &&
      action === "covenant_continue"
    ) {
      state.lastLog = "💠 Tiếp tục khám phá sau phước lành Chinh Phạt.";
      finishEventResult(state);
      nextMilestone(state, session, rng);
    } else if (
      state.encounter.type === "god_rngesus" &&
      action === "god_continue"
    ) {
      state.lastLog =
        "✨ Tiếp tục tầng " +
        state.floor +
        " sau phước lành của God of RNGesus.";
      state.encounter = generateEncounter(state, session, rng);
    } else if (state.phase === "boss_chest") {
      if (action === "boss_open") {
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
      if (action !== "sever_none") delete state.modifiers[key];
      state.lastLog = `${eventIcon("severance")} Rift Severance: ${action === "sever_none" ? "không có modifier phù hợp để xóa" : `đã xóa ${RIFT_ICONS[key] || E.rift} ×${removed}, hiệu ứng của loại Rift này không còn áp dụng`}.`;
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
        const acted =
          action === "ritual_claim"
            ? { log: "", dealt: 0, critical: false }
            : playerAttack(state, action, rng);
        if (action !== "ritual_claim") paradox.afterAction(state, action);
        state.lastLog += acted.log;
        const ritual = gilded.afterAction(state, action, acted, hurt);
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
          state.lastLog += `\n${enemyTurn(state, rng, acted.defend, acted.dodge, action === "defend")}`;
          if (doubleCounter && alive(state) && e.hp > 0)
            state.lastLog += `\n⏳ Phản công lần hai: ${enemyTurn(state, rng, acted.defend, acted.dodge, action === "defend")}`;
          if (e.hp <= 0 && alive(state)) defeatEnemy(state, session, rng, e);
        }
      } else if (e.type === "surprise") {
        actSurprise(state, session, action, rng);
        if (action !== "event_skip")
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
          if (e.kind === "healing") heal(state, state.maxHp);
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
            healing: "Healing: hồi phục HP",
            armor: `Armor: tăng ${E[e.armorStat]} ${e.armorStat?.toUpperCase()}`,
            treasure: "Treasure: đã nhận vật phẩm",
            experience: `Experience: bonus +25% cược (${Math.floor(state.stake * 0.25).toLocaleString("vi-VN")} xu), cộng vào thưởng của run`,
            corrupted: `Corrupted: tăng ${E[e.powerStat || mainStat(state)]} ${(e.powerStat || mainStat(state)).toUpperCase()}, giảm ${E.vit} VIT`,
            fake: `Fake: bẫy gây mất ${E.hp} HP, luôn chừa ít nhất **1 HP**`,
          };
          state.lastLog = `${E.shrine} Shrine ${outcomes[e.kind]}.`;
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
        } else if (e.kind !== "portal") {
          if (e.lucky) state.lastLog = `${E.luck} Lucky Break: tránh bẫy.`;
          else if (e.kind === "tax") {
            const cost = taxCost(state);
            state.payoutSpent = (state.payoutSpent || 0) + cost;
            state.payoutTaxSpent = (state.payoutTaxSpent || 0) + cost;
            state.lastLog = cost
              ? `${eventIcon("tax")} Tax Collector: đã thu một lần 15% payout hiện tại.`
              : `${eventIcon("tax")} Tax Collector: không có payout để thu thuế.`;
          } else {
            const stolen = Math.min(1, state.potions);
            state.potions -= stolen;
            state.lastLog = stolen
              ? "Potion Thief đã cướp bình máu."
              : `Potion Thief không cướp được gì vì bạn có 0 ${E.potion} bình máu.`;
          }
          completeFloor(state, session, rng, 0);
        } else if (e.good) {
          if (e.effect === "healing") {
            addSource(state, { maxHp: 10 });
            heal(state, state.maxHp);
            state.potions = Math.min(state.maxPotions, state.potions + 1);
          }
          if (e.effect === "treasure")
            state.bonus += Math.floor(state.stake * 0.5);
          if (e.effect === "blessing")
            addSource(state, { str: 6, ene: 6, luck: 1 });
          state.lastLog = `Wrong Portal: ${{ healing: "nhận hồi phục và tiếp tế", treasure: "bonus +50% cược", blessing: "nhận phúc tăng thuộc tính" }[e.effect]}.`;
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
          penalty(state, 0.4);
          state.lastLog = "Hối lộ: trừ một lần 40% payout hiện tại.";
        }
        if (action === "pray") {
          if (!e.prayerSuccess)
            return die(
              `Cầu nguyện RNGesus thất bại (nhánh ${Math.round((1 - (e.prayerChance ?? rngesusPrayerChance(state))) * 100)}%).`,
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
          if (action === "echo_pray") heal(state, state.maxHp * 0.15);
          echoes.release(session, e.echo.id);
          state.lastLog = "Để mộ yên nghỉ.";
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
    recompute(state);
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
