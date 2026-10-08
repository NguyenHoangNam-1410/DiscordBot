"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    covenant,
    bosses,
    gilded,
    royal,
    monsterLoot,
    memories,
    paradox,
    E,
    eventIcon,
    memoryIcon,
    world,
    echoes,
    recompute,
    randomItem,
  } = dependencies;
  const addSource = (...args) => dependencies.addSource(...args);
  const effectStatKeys = (...args) => dependencies.effectStatKeys(...args);
  const markDirect = (...args) => dependencies.markDirect(...args);
  const payoutSnapshot = (...args) => dependencies.payoutSnapshot(...args);
  const payoutChanged = (...args) => dependencies.payoutChanged(...args);
  const logPayoutChange = (...args) => dependencies.logPayoutChange(...args);
  const penalty = (...args) => dependencies.penalty(...args);
  const heal = (...args) => dependencies.heal(...args);
  const receiveItem = (...args) => dependencies.receiveItem(...args);
  const receiveSnapshot = (...args) => dependencies.receiveSnapshot(...args);
  const completeFloor = (...args) => dependencies.completeFloor(...args);

  // Ghi nhận sự kiện đặc biệt/chuỗi kích hoạt của ván để tính thành tựu và thống kê khi ván kết thúc.
  function noteEvent(state, kind, chained) {
    state.evCount = (state.evCount || 0) + 1;
    state.evKinds = Array.from(new Set([...(state.evKinds || []), kind]));
    if (chained) state.chainCount = (state.chainCount || 0) + 1;
  }

  function noteKill(state, enemy) {
    state.kills = (state.kills || 0) + 1;
    if (["boss", "final_boss"].includes(enemy.rank)) {
      state.bossKills = (state.bossKills || 0) + 1;
      state.bossTally = {
        ...(state.bossTally || {}),
        [enemy.name]: (state.bossTally?.[enemy.name] || 0) + 1,
      };
    }
  }

  function defeatEnemy(state, session, rng, e) {
    if (e.hp > 0 || state.hp <= 0 || e.defeatSettled) return;
    if (bosses.advancePhase(state, e)) return;
    e.defeatSettled = true;
    monsterLoot.prepare(state, e);
    noteKill(state, e);
    if (e.rank === "final_boss" && e.mechanic === "deimoss")
      state.finalBossDefeated = true;
    if (e.echoId) {
      if (e.echoItem) receiveSnapshot(state, e.echoItem);
      state.bonus += Math.floor(state.stake * (0.25 + 0.1 * e.echo.kills));
      echoes.consume(session, e.echoId);
    }
    state.lastLog += `\n🏆 Hạ ${e.name}.`;
    covenant.recordKill(state, e);
    royal.recordBoss(state, e);
    if (paradox.is(state, "hunger"))
      state.lastLog += `\n🍖 Cơn Đói hồi ${heal(state, Math.max(1, Math.floor(state.maxHp * 0.12)))} HP.`;
    if (world.mimicKind(e) === "ancient_mimic") {
      const roll = rng();
      const rarity = roll < 0.5 ? "rare" : roll < 0.8 ? "legendary" : "cursed";
      receiveItem(state, randomItem(rarity, rng));
      state.lastLog += `\n${E.chest} Phần thưởng hạ Ancient Mimic: đã nhận vật phẩm.`;
    } else if (world.mimicKind(e) === "blood_mimic") {
      const rarity = rng() < 0.6 ? "rare" : "legendary";
      receiveItem(state, randomItem(rarity, rng));
      state.lastLog += `\n${E.chest} Phần thưởng hạ Blood Mimic: đã nhận trang bị.`;
    }
    if (e.memoryReward) {
      const beforePayout = payoutSnapshot(state);
      const reward = e.memoryReward;
      delete e.memoryReward;
      applyMemoryReward(state, reward);
      if (payoutChanged(beforePayout, payoutSnapshot(state)))
        logPayoutChange(
          state,
          beforePayout,
          payoutSnapshot(state),
          memories.title(reward.family),
        );
    }
    if (bosses.on(e) && e.boss.id === "kabraxis" && !e.boss.rewardClaimed) {
      e.boss.rewardClaimed = true;
      receiveItem(state, e.boss.rewardItem);
      state.bonus += Math.floor(state.stake * 0.666);
      const kind = e.boss.seal;
      const effects =
        kind === "war"
          ? { [dependencies.mainStat(state)]: 8 }
          : kind === "protection"
            ? { vit: 8, resistance: 3 }
            : { ene: 8, maxMana: 1 };
      addSource(state, effects, "prophecyAwakening");
      state.prophecy ||= { kind, floor: 333, legacy: true };
      state.prophecy.awakened = true;
      state.lastLog +=
        "\n🔺 Ấn " +
        kind +
        " thức tỉnh; nhận trang bị đã khóa và bonus 66,6% cược.";
    }
    const dropRarity = monsterLoot.roll(state, e, rng);
    if (dropRarity) {
      const dropped = randomItem(dropRarity, rng);
      receiveItem(state, dropped);
      state.lastLog += `\n${E.backpack} Nhặt được ${dropped.category === "consumable" ? "vật phẩm" : "trang bị"} từ ${e.name}.`;
    }
    if (monsterLoot.hasRegionBossChest(state, e)) {
      const chestItem =
        e.boss?.chestItem ||
        randomItem(rng() < 0.7 ? "legendary" : "cursed", rng);
      state.pendingBossChest = {
        type: "boss_chest",
        name: "Rương boss",
        bossFloor: state.floor,
        item: chestItem,
      };
      state.lastLog += `\n${eventIcon("boss_chest")} Nhận rương boss: mở hoặc bán để tiếp tục.`;
    }
    if (gilded.isBoss(e) && gilded.enabled(state))
      gilded.grant(state, e, session);
    if (e.covenantTrial && covenant.enabled(state)) {
      completeFloor(state, session, rng, e.rewardMultiplier, {
        deferEncounter: true,
      });
      covenant.grant(state, e, session);
    } else completeFloor(state, session, rng, e.rewardMultiplier);
  }

  function applyMemoryReward(state, reward) {
    if (reward.family === "divine") {
      const target = state.items.find(
        (item) =>
          item.definition.curse && item.level > (item.cleansedLevels || 0),
      );
      if (target) {
        markDirect(state, effectStatKeys(target.definition.curse.effects));
        target.cleansedLevels = (target.cleansedLevels || 0) + 1;
        target.rarity = target.definition.rarity;
        recompute(state);
        state.lastLog +=
          "\n" +
          memoryIcon("divine") +
          " Ân huệ: gỡ 1 level nguyền của " +
          target.name +
          "; giữ UR, level và nội tại.";
      } else {
        const restored = heal(state, state.maxHp * 0.2);
        state.lastLog +=
          "\n" +
          memoryIcon("divine") +
          " Không còn nguyền: hồi " +
          restored +
          " " +
          E.hp +
          " HP cho bạn.";
      }
    } else if (reward.coins > 0 || reward.family === "wealth") {
      const coins =
        reward.family === "wealth"
          ? Math.floor(state.stake * 1.5)
          : reward.coins;
      state.bonus += coins;
      state.lastLog +=
        "\n" +
        memoryIcon(reward.family) +
        " Bonus +" +
        coins.toLocaleString("vi-VN") +
        " " +
        E.coin +
        ".";
    }
  }

  function resolveMemory(state, session, action, rng) {
    const e = state.encounter,
      debt = e.debt,
      key = memories.family(debt);
    const done = (log) => {
      state.lastLog = log;
      completeFloor(state, session, rng, 0);
    };
    const startFight = () => {
      state.encounter = e.enemy;
      state.lastLog =
        memories.title(debt) + ": " + e.enemy.name + " xuất hiện!";
    };
    if (key === "legacy") {
      if (debt.good && debt.action !== "event_rob") {
        const restored = heal(state, state.maxHp * debt.healRate);
        state.bonus += Math.floor(state.stake * debt.bonusRate);
        done(
          memoryIcon("legacy") +
            " Ký ức cũ: hồi " +
            restored +
            " " +
            E.hp +
            " HP; bonus +" +
            Math.floor(state.stake * debt.bonusRate).toLocaleString("vi-VN") +
            " xu.",
        );
      } else if (debt.kind === "tax") {
        penalty(state, 0.1);
        done(
          memoryIcon("legacy") + " Ký ức cũ: trừ một lần 10% payout hiện tại.",
        );
      } else startFight();
    } else if (key === "bounty") {
      if (debt.kind === "tax" || action === "memory_settle") {
        const rate = debt.kind === "tax" ? 0.1 : 0.2;
        penalty(state, rate);
        done(
          memoryIcon("bounty") +
            " Đã bồi thường " +
            Math.round(rate * 100) +
            "% payout; kết thúc truy nã.",
        );
      } else startFight();
    } else if (key === "blood") {
      const restored = heal(state, state.maxHp * 0.2);
      const previous = state.potions;
      state.potions = Math.min(state.maxPotions, state.potions + 1);
      done(
        memoryIcon("blood") +
          " Phúc lành hiến tế: hồi " +
          restored +
          " " +
          E.hp +
          " HP cho bạn; " +
          E.potion +
          " bình " +
          previous +
          " → " +
          state.potions +
          ".",
      );
    } else if (action === "memory_decline") {
      done(
        memories.title(debt) + ": đã từ chối, không nhận thưởng hoặc bị phạt.",
      );
    } else if (key === "divine" && action === "memory_offering") {
      state.potions--;
      state.lastLog =
        memoryIcon("divine") + " Đã hiến 1 " + E.potion + " bình máu.";
      applyMemoryReward(state, { family: "divine" });
      completeFloor(state, session, rng, 0);
    } else startFight();
  }
  return { noteEvent, noteKill, defeatEnemy, applyMemoryReward, resolveMemory };
};
