"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    stats,
    itemPassives,
    resetRngesusEncounter,
    paradox,
    E,
    RIFT_ICONS,
    eventIcon,
    passiveIcon,
    world,
    runDiamondReward,
    recompute,
    mainStat,
    pick,
  } = dependencies;
  const addSource = (...args) => dependencies.addSource(...args);
  const expireAdventurer = (...args) => dependencies.expireAdventurer(...args);
  const payoutSnapshot = (...args) => dependencies.payoutSnapshot(...args);
  const payoutChanged = (...args) => dependencies.payoutChanged(...args);
  const logPayoutChange = (...args) => dependencies.logPayoutChange(...args);
  const heal = (...args) => dependencies.heal(...args);
  const healEvent = (...args) => dependencies.healEvent(...args);
  const hurt = (...args) => dependencies.hurt(...args);
  const receiveItem = (...args) => dependencies.receiveItem(...args);
  const alive = (...args) => dependencies.alive(...args);
  const generateEncounter = (...args) =>
    dependencies.generateEncounter(...args);
  const prepareParadoxCombat = (...args) =>
    dependencies.prepareParadoxCombat(...args);

  function nextMilestone(state, session, rng) {
    const phase = state.pendingMilestones.shift();
    if (phase) {
      state.phase = phase;
      state.encounter =
        phase === "boss_chest"
          ? state.pendingBossChest
          : phase === "paradox"
            ? paradox.encounter(state.cleared, rng)
            : { type: phase };
      if (phase === "boss_chest") delete state.pendingBossChest;
      return;
    }
    if (state.finalBossDefeated && state.cleared === 999) {
      state.phase = "summit";
      state.encounter = { type: "summit" };
      return;
    }
    state.phase = "encounter";
    state.encounter = generateEncounter(state, session, rng);
    prepareParadoxCombat(state, rng);
  }

  function finishEventResult(state) {
    const pending = state.pendingEventResult;
    if (!pending) return;
    recompute(state);
    const after = Object.fromEntries(
      Object.keys(pending.before).map((key) => [key, state[key]]),
    );
    pending.directKeys = [
      ...new Set([
        ...(pending.directKeys || []),
        ...["potions", "escapeTokens", "mana"].filter(
          (key) => after[key] !== pending.before[key],
        ),
      ]),
    ];
    const payoutAfter = payoutSnapshot(state);
    const changedPayout =
      pending.payoutBefore && payoutChanged(pending.payoutBefore, payoutAfter);
    if (
      Object.keys(after).some((key) => after[key] !== pending.before[key]) ||
      changedPayout
    )
      state.lastEventResult = { ...pending, after, payoutAfter };
    if (changedPayout)
      logPayoutChange(
        state,
        pending.payoutBefore,
        payoutAfter,
        pending.name || "Sự kiện",
      );
    delete state.pendingEventResult;
  }

  function completeFloor(
    state,
    session,
    rng,
    reward = 1,
    { deferEncounter = false } = {},
  ) {
    const floor = state.floor;
    const peaceful =
      state.encounter?.type !== "combat" && state.passiveCombatFloor !== floor;
    if (floor === 999 && !state.finalBossDefeated)
      throw new Error("FINAL_BOSS_REQUIRED");
    if (state.encounter?.type === "rngesus") resetRngesusEncounter(state);
    // Record the event effect before floor regeneration and checkpoint rewards.
    finishEventResult(state);
    state.cleared = floor;
    state.bonus += Math.floor(state.stake * 0.01 * reward);
    if (
      state.encounter.type === "combat" &&
      ["boss", "final_boss"].includes(state.encounter.rank)
    )
      state.bosses++;
    if (
      state.contract &&
      floor >= state.contract.from &&
      floor <= state.contract.until
    ) {
      state.contract.remaining--;
      if (!state.contract.remaining) {
        const contract = state.contract;
        const payoutBefore = payoutSnapshot(state);
        state.contract = null;
        if (contract.kind === "potion") receiveItem(state, contract.item);
        else if (contract.kind === "skill")
          state.bonus += Math.floor(state.stake * 0.5);
        else addSource(state, { [mainStat(state)]: 10 });
        state.lastLog += `\n${eventIcon("contract")} Hoàn thành Rift Contract: ${contract.kind === "potion" ? "nhận trang bị SSR" : contract.kind === "skill" ? `bonus +50% cược (${Math.floor(state.stake * 0.5).toLocaleString("vi-VN")} xu)` : `+10 ${E[mainStat(state)]} ${mainStat(state).toUpperCase()}`}.`;
        const payoutAfter = payoutSnapshot(state);
        if (payoutChanged(payoutBefore, payoutAfter))
          logPayoutChange(
            state,
            payoutBefore,
            payoutAfter,
            "Hoàn thành Rift Contract",
          );
      }
    }
    if (
      state.classShrine?.classKey === "druid" &&
      floor >= state.classShrine.from &&
      floor <= state.classShrine.until
    ) {
      const hpBefore = state.hp,
        manaBefore = state.mana;
      const recovered = healEvent(state, state.maxHp * 0.05);
      const gained = recovered.hp;
      state.lastLog += `\n${E.shrine} Class Shrine · Druid: hồi ${E.hp} **${gained} HP** cho bạn: ${hpBefore} → **${state.hp}**.\n${E.mana} Class Shrine · Druid: MP ${manaBefore} → **${state.mana}** (+${recovered.mp}).`;
    }
    if (state.classShrine && floor >= state.classShrine.until)
      state.classShrine = null;
    if (state.floorHpLoss) {
      const hpBefore = state.hp;
      hurt(state, Math.max(1, state.maxHp * state.floorHpLoss), true, true);
      state.lastLog += `\n🩸 Lời nguyền trang bị: ${E.hp} **HP:** ${hpBefore} → **${state.hp}**, luôn chừa ít nhất **1 HP**.`;
    }
    if (peaceful && alive(state) && state.passiveRestFloor !== floor) {
      state.passiveRestFloor = floor;
      const rate = itemPassives.aggregate(state).campHeal;
      if (rate > 0) {
        const before = state.hp,
          gained = heal(state, Math.max(1, Math.floor(state.maxHp * rate)));
        state.lastLog +=
          "\n" +
          passiveIcon("campHeal") +
          " Nghỉ chân: hồi " +
          gained +
          " HP cho bạn · " +
          before +
          " → " +
          state.hp +
          ".";
      }
    }
    if (floor % 5 === 0) {
      const hpBefore = state.hp,
        potionsBefore = state.potions;
      heal(state, state.maxHp, { checkpoint: true });
      state.potions = Math.min(state.maxPotions, state.potions + 2);
      state.pendingMilestones.push("upgrade");
      state.lastLog += `\n${E.checkpoint} Đạt tầng ${floor} · Checkpoint: ${E.hp} **HP:** ${hpBefore} → **${state.hp}**  •  ${E.potion} **Bình máu:** ${potionsBefore} → **${state.potions}** (tối đa ${state.maxPotions}); chọn +5 thuộc tính.`;
    }
    if (floor % 10 === 0) {
      const keys = Object.keys(world.RIFT_MODIFIERS),
        missing = keys.filter((key) => !state.modifiers[key]);
      const key = pick(missing.length ? missing : keys, rng);
      const previous = state.modifiers[key] || 0;
      state.modifiers[key] = previous + 1;
      state.lastLog += `\nĐạt tầng ${floor}: **${RIFT_ICONS[key] || E.rift} ${previous ? `×${previous}→×${state.modifiers[key]}` : "+1"}** Rift modifier.`;
    }
    if (state.paradox && floor >= state.paradox.until) state.paradox = null;
    paradox.expire(state, floor);
    if (
      floor % 25 === 0 &&
      floor < 999 &&
      !(state.paradoxMilestonesClaimed || []).includes(floor)
    )
      state.pendingMilestones.push("paradox");
    if ([199, 399, 699, 899].includes(floor))
      state.pendingMilestones.push("severance");
    if (floor >= 100) state.completed = true;
    state.runDiamonds = runDiamondReward(state);
    state.floor = Math.min(999, floor + 1);
    expireAdventurer(state);
    if (state.pendingBossChest) state.pendingMilestones.unshift("boss_chest");
    if (!deferEncounter) nextMilestone(state, session, rng);
  }

  function initialize(classKey, stake, session, rng) {
    const state = stats.createState(classKey, stake);
    state.bossRosterVersion = 1;
    state.encounter = generateEncounter(state, session, rng);
    prepareParadoxCombat(state, rng);
    return state;
  }
  return { nextMilestone, finishEventResult, completeFloor, initialize };
};
