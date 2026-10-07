// Composed once by ../runtime/index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    resetRngesusEncounter,
    runDiamondReward,
    RIFT_MODIFIERS,
    checkpointGrowth,
    classShrineActive,
    MAX_FLOOR,
    COMPLETION_FLOOR,
  } = dependencies;
  const pick = (...args) => dependencies.pick(...args);
  const generateEncounter = (...args) =>
    dependencies.generateEncounter(...args);
  const applyItem = (...args) => dependencies.applyItem(...args);

  function setNextEncounter(state, log) {
    if (state.floor >= MAX_FLOOR && state.cleared >= MAX_FLOOR) {
      state.phase = "summit";
      state.encounter = { type: "summit" };
      state.lastLog = log;
      return;
    }
    state.phase = "encounter";
    state.encounter = generateEncounter(state);
    state.lastLog = log;
  }

  function completeFloor(state, log, rewardMultiplier = 1) {
    const clearedFloor = state.floor;
    if (clearedFloor === MAX_FLOOR && !state.finalBossDefeated)
      throw new Error("FINAL_BOSS_REQUIRED");
    if (state.encounter?.type === "rngesus") resetRngesusEncounter(state);
    state.cleared = Math.max(state.cleared, clearedFloor);
    const previousDiamonds = state.runDiamonds || 0;
    state.runDiamonds = runDiamondReward(state);
    if (state.runDiamonds > previousDiamonds)
      log += `\n💎 Kim cương tạm giữ: **${state.runDiamonds.toLocaleString("vi-VN")}**. Rút thưởng mới nhận; tử trận mất toàn bộ.`;
    const frame = { 333: "Bạc", 666: "Vàng", 999: "Kim cương" }[clearedFloor];
    if (frame) log += `\n🏅 Đạt mốc khung hồ sơ **${frame}** (giữ vĩnh viễn).`;
    state.bonus += Math.floor(state.stake * 0.01 * rewardMultiplier);
    state.energy = Math.min(state.maxEnergy, state.energy + 1);
    if (["boss", "final_boss"].includes(state.encounter.rank)) {
      state.bosses += 1;
    }
    if (classShrineActive(state) && state.classKey === "druid") {
      const healed = Math.min(
        state.maxHp - state.hp,
        Math.floor(state.maxHp * 0.05),
      );
      state.hp += healed;
      log += `\n🌿 Class Shrine hồi ${healed} HP.`;
    }
    if (
      state.contract &&
      clearedFloor >= state.contract.from &&
      clearedFloor <= state.contract.until
    ) {
      state.contract.remaining -= 1;
      if (state.contract.remaining <= 0) {
        if (state.contract.kind === "potion") {
          const equipment = applyItem(state, state.contract.item, "legendary");
          log += `\n📜 Hoàn thành hợp đồng: nhận **${equipment.name}** [SSR].`;
        } else if (state.contract.kind === "skill") {
          state.bonus += Math.floor(state.stake * 0.5);
          log += "\n📜 Hoàn thành hợp đồng: bonus +50% cược.";
        } else {
          state.damageMin += 5;
          state.damageMax += 5;
          log += "\n📜 Hoàn thành hợp đồng: +5 ATK.";
        }
        state.contract = null;
      }
    }
    if (clearedFloor % 5 === 0) {
      const growth = checkpointGrowth(clearedFloor);
      state.maxHp += growth.hp;
      state.damageMin += growth.attack;
      state.damageMax += growth.attack;
      state.hp = state.maxHp;
      const previousPotions = state.potions;
      state.potions = Math.min(5, state.potions + 2);
      log += `\n🏕️ Checkpoint: ❤️ MAX HP +${growth.hp}, ⚔️ ATK +${growth.attack}, hồi đầy HP; 🧪 POT ${previousPotions} → ${state.potions} (tối đa 5).`;
    }
    if (
      clearedFloor % 10 === 0 &&
      clearedFloor > (state.lastModifierFloor || 0)
    ) {
      state.modifiers ||= {};
      const all = Object.keys(RIFT_MODIFIERS);
      const missing = all.filter((key) => !state.modifiers[key]);
      const key = pick(missing.length ? missing : all);
      state.modifiers[key] = (state.modifiers[key] || 0) + 1;
      state.lastModifierFloor = clearedFloor;
      log += `\n🌀 Rift: **${RIFT_MODIFIERS[key].name} ×${state.modifiers[key]}**.`;
    }
    if (clearedFloor >= COMPLETION_FLOOR) state.completed = true;
    if (state.floorHpLoss > 0) {
      const lost = Math.max(1, Math.floor(state.maxHp * state.floorHpLoss));
      state.hp = Math.max(0, state.hp - lost);
      log += `\n🩸 Lời nguyền mất ${lost} HP sau tầng.`;
      if (state.hp <= 0) {
        state.lastLog = log;
        return;
      }
    }
    if (state.classShrine && clearedFloor >= state.classShrine.until)
      state.classShrine = null;
    if (clearedFloor >= MAX_FLOOR) {
      state.floor = MAX_FLOOR;
      state.phase = "summit";
      state.encounter = { type: "summit" };
      state.lastLog = log;
      return;
    }
    state.floor = clearedFloor + 1;
    if (clearedFloor % 5 === 0 || clearedFloor === COMPLETION_FLOOR) {
      state.phase = "upgrade";
      state.encounter = { type: "upgrade", milestone: clearedFloor };
      state.lastLog = `${log}\n🎁 Chọn một nâng cấp trước tầng ${state.floor}.`;
      return;
    }
    setNextEncounter(state, log);
  }
  return { setNextEncounter, completeFloor };
};
