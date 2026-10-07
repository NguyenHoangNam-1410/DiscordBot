// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    E,
    formatCoins,
    db,
    hardcoreRepository,
    rarityLabel,
    effectText,
    potentialPayout,
    forgeTarget,
    curseTarget,
    taxCost,
    SURPRISE_EVENTS,
    ITEMS,
    hardcoreV2,
    isV2,
    MAX_FLOOR,
    LUCKY_BREAK_LOG,
    fairStateContext,
    noteEvent,
    getSession,
    saveState,
  } = dependencies;
  const randomFloat = (...args) => dependencies.randomFloat(...args);
  const makeEnemy = (...args) => dependencies.makeEnemy(...args);
  const grantEscapeTickets = (...args) =>
    dependencies.grantEscapeTickets(...args);
  const applyItem = (...args) => dependencies.applyItem(...args);
  const cleanseItem = (...args) => dependencies.cleanseItem(...args);
  const updatePity = (...args) => dependencies.updatePity(...args);
  const setNextEncounter = (...args) => dependencies.setNextEncounter(...args);
  const completeFloor = (...args) => dependencies.completeFloor(...args);
  const parseState = (...args) => dependencies.parseState(...args);
  const finishRun = (...args) => dependencies.finishRun(...args);
  const enemyTurn = (...args) => dependencies.enemyTurn(...args);
  const playerAttack = (...args) => dependencies.playerAttack(...args);
  const applyShrine = (...args) => dependencies.applyShrine(...args);
  const statSnapshot = (...args) => dependencies.statSnapshot(...args);
  const statChanges = (...args) => dependencies.statChanges(...args);
  const payRunService = (...args) => dependencies.payRunService(...args);
  const chargeCurrentPayout = (...args) =>
    dependencies.chargeCurrentPayout(...args);
  const luckyBreak = (...args) => dependencies.luckyBreak(...args);
  const resolveWrongPortal = (...args) =>
    dependencies.resolveWrongPortal(...args);
  const resolveSurprise = (...args) => dependencies.resolveSurprise(...args);

  const actionTx = db.transaction(
    ({ sessionId, userId, expectedTurn, action }) => {
      const session = getSession(sessionId);
      if (!session || session.user_id !== String(userId))
        throw new Error("INVALID_SESSION");
      const state = parseState(session);
      return fairStateContext.run(state, () => {
        if (state.turn !== expectedTurn) throw new Error("STALE_ACTION");
        if (isV2(state)) {
          state.turn += 1;
          let reason = hardcoreV2.act(state, session, action, randomFloat);
          if (
            ["death", "rngesus"].includes(reason) &&
            hardcoreV2.reviveAfterDeath(state, session, randomFloat, reason)
          )
            reason = null;
          if (reason) {
            if (reason === "rngesus") state.hp = 0;
            return {
              settled: true,
              state,
              result: finishRun(session, state, reason),
            };
          }
          if (state.cleared > 0)
            hardcoreRepository.upsertRecord(session.guild_id, session.user_id, {
              bestFloor: state.cleared,
              runs: 0,
              deaths: 0,
              escapes: 0,
              completions: 0,
            });
          saveState(session, state);
          return { settled: false, state, result: null };
        }
        if (action === "retreat" && state.encounter.type === "rngesus")
          throw new Error("CANNOT_RETREAT");
        const before = statSnapshot(state);
        state.lastDiscardedEscapeTokens = 0;
        state.lastStatChanges = null;
        state.turn += 1;
        if (action === "retreat")
          return {
            settled: true,
            state,
            result: finishRun(
              session,
              state,
              state.phase === "summit"
                ? "summit"
                : state.cleared > 0
                  ? "cashout"
                  : "forfeit",
            ),
          };
        if (state.phase === "summit") throw new Error("INVALID_ACTION");

        if (state.phase === "upgrade") {
          if (action === "upgrade_attack") {
            state.damageMin += 5;
            state.damageMax += 5;
            state.lastLog = "⚔️ +5 ATK.";
          } else if (action === "upgrade_hp") {
            state.maxHp += 30;
            state.hp = Math.min(state.maxHp, state.hp + 30);
            state.lastLog = "❤️ +30 HP tối đa và hiện tại.";
          } else if (action === "upgrade_defense") {
            state.defense += 6;
            state.lastLog = "🛡️ +6 DEF.";
          } else if (action === "upgrade_luck") {
            state.luck += 2;
            state.lastLog = "🍀 +2 LUCK.";
          } else throw new Error("INVALID_ACTION");
          setNextEncounter(
            state,
            `${state.lastLog}\nBạn tiến vào tầng ${state.floor}.`,
          );
        } else if (state.encounter.type === "combat") {
          if (!["attack", "defend", "skill", "potion"].includes(action))
            throw new Error("INVALID_ACTION");
          const acted = playerAttack(state, action);
          let log = acted.log;
          if (
            state.contract &&
            state.floor >= state.contract.from &&
            state.floor <= state.contract.until &&
            state.contract.kind === action
          ) {
            state.contract = null;
            log = `📜 Vi phạm Rift Contract: hủy thưởng hợp đồng.\n${log}`;
          }
          if (state.encounter.hp <= 0) {
            const enemy = state.encounter;
            state.kills = (state.kills || 0) + 1;
            if (["boss", "final_boss"].includes(enemy.rank)) {
              state.bossKills = (state.bossKills || 0) + 1;
              state.bossTally = {
                ...(state.bossTally || {}),
                [enemy.name]: (state.bossTally?.[enemy.name] || 0) + 1,
              };
            }
            if (
              state.floor === MAX_FLOOR &&
              enemy.rank === "final_boss" &&
              enemy.mechanic === "deimoss"
            )
              state.finalBossDefeated = true;
            completeFloor(
              state,
              `${log}\n🏆 Đã hạ **${enemy.name}**.`,
              enemy.rewardMultiplier,
            );
          } else {
            log += `\n${enemyTurn(state, acted.defend, acted.dodge)}`;
            state.lastLog = log;
            if (state.hp <= 0)
              return {
                settled: true,
                state,
                result: finishRun(session, state, "death"),
              };
          }
        } else if (state.encounter.type === "chest") {
          const chest = state.encounter;
          if (action === "inspect") {
            if (chest.inspected) throw new Error("ALREADY_INSPECTED");
            chest.inspected = true;
            if (
              ["mimic", "ancient_mimic"].includes(chest.kind) &&
              chest.detectionSuccess
            ) {
              chest.revealed = true;
              state.lastLog =
                "👁️ Bạn phát hiện chiếc hòm đang thở. Đây là Mimic!";
            } else state.lastLog = "🔍 Không phát hiện điều gì bất thường.";
          } else if (action === "leave") {
            if (!chest.revealed) throw new Error("INVALID_ACTION");
            completeFloor(state, "🚪 Bạn tránh được Mimic và đi tiếp.", 0);
          } else if (action === "sell") {
            state.bonus += Math.floor(state.stake * 0.15);
            completeFloor(
              state,
              "💰 Bán hòm, cộng 15% tiền cược vào payout.",
              0.5,
            );
          } else if (action === "open") {
            if (["mimic", "ancient_mimic"].includes(chest.kind)) {
              updatePity(state, "empty");
              state.encounter = makeEnemy(
                state.floor,
                chest.kind,
                null,
                state.modifiers,
              );
              state.lastLog = `😈 Chiếc hòm hóa thành **${state.encounter.name}**!`;
            } else if (chest.kind === "empty") {
              updatePity(state, "empty");
              completeFloor(state, "📦 Hòm hoàn toàn trống.", 0);
            } else if (chest.kind === "fake_legendary") {
              updatePity(state, "empty");
              completeFloor(
                state,
                "🟠 Ánh sáng SSR bùng lên rồi tắt; đây là đồ giả không có chỉ số.",
                0,
              );
            } else {
              const equipment = applyItem(state, chest.item, chest.rarity);
              updatePity(state, chest.rarity);
              completeFloor(
                state,
                `🎁 ${equipment.level > 1 ? "Nâng cấp" : "Nhận"} **${chest.item.name} Lv.${equipment.level}** (${rarityLabel(chest.rarity)}): ${chest.item.text}.`,
                chest.rarity === "legendary" ? 2 : 1,
              );
            }
          } else throw new Error("INVALID_ACTION");
        } else if (state.encounter.type === "shrine") {
          if (action === "ignore")
            completeFloor(state, "🚶 Bạn bỏ qua Shrine.", 0);
          else if (action === "touch") {
            const log = applyShrine(state, state.encounter.kind);
            if (state.hp <= 0)
              return {
                settled: true,
                state,
                result: finishRun(session, state, "death"),
              };
            completeFloor(state, log, 0.5);
          } else throw new Error("INVALID_ACTION");
        } else if (["blacksmith", "cleanse"].includes(state.encounter.type)) {
          const service = state.encounter.type;
          if (action === "ignore")
            completeFloor(state, "🚶 Bạn bỏ qua dịch vụ và đi tiếp.", 0);
          else if (service === "blacksmith" && action === "forge") {
            const target = forgeTarget(state);
            if (!target) throw new Error("NO_FORGE_ITEM");
            const cost = payRunService(state, service);
            const upgraded = applyItem(state, target.definition, target.rarity);
            completeFloor(
              state,
              `🔨 Thợ rèn nâng **${upgraded.name} lên Lv.${upgraded.level}**: ${effectText(upgraded.definition, 1)}.\n💰 Đã dùng **${cost} xu** từ payout của run.`,
              0,
            );
          } else if (service === "cleanse" && action === "cleanse") {
            const target = curseTarget(state);
            if (!target) throw new Error("NO_CURSE");
            const cost = payRunService(state, service);
            cleanseItem(state, target);
            completeFloor(
              state,
              `✨ Gỡ một lớp curse của **${target.name}**; giữ buff trang bị.\n💰 Đã dùng **${cost} xu** từ payout của run.`,
              0,
            );
          } else throw new Error("INVALID_ACTION");
        } else if (state.encounter.type === "surprise") {
          if (action === "ignore")
            completeFloor(
              state,
              state.encounter.kind === "adventurer"
                ? "🚶 Bỏ mặc Lost Adventurer. Không có gì xảy ra."
                : "🚶 Bạn tránh lối đi bí ẩn và đi tiếp an toàn.",
              0,
            );
          else if (SURPRISE_EVENTS[state.encounter.kind]) {
            const kind = state.encounter.kind;
            resolveSurprise(state, action);
            noteEvent(state, kind, state.encounter?.type === "combat");
          } else if (action === "explore") {
            const event = state.encounter;
            if (event.kind === "ambush") {
              noteEvent(state, "ambush", true);
              state.encounter = event.enemy;
              state.lastLog = `⚠️ **${state.encounter.name}** phục kích và ra đòn trước!\n${enemyTurn(state)}`;
              if (state.hp <= 0)
                return {
                  settled: true,
                  state,
                  result: finishRun(session, state, "death"),
                };
            } else if (event.kind === "healing") {
              const healed = Math.min(
                state.maxHp - state.hp,
                Math.max(20, Math.floor(state.maxHp * 0.35)),
              );
              state.hp += healed;
              state.potions += 1;
              completeFloor(
                state,
                `💚 Gặp người cứu trợ: hồi **${healed} HP**, nhận **1 bình máu**.`,
                0,
              );
            } else if (event.kind === "escape_ticket") {
              grantEscapeTickets(state, 1);
              completeFloor(
                state,
                `${E.ticket} Người lữ hành trao **1 Vé thoát**. Vé tự dùng nếu chạy khỏi RNGesus thất bại.`,
                0,
              );
            } else if (event.kind === "cache") {
              const found = Math.floor(state.stake * 0.5);
              state.bonus += found;
              completeFloor(
                state,
                `💰 Phát hiện kho xu: cộng **${found} xu** vào bonus của run (trước hệ số phạt payout).`,
                0,
              );
            } else throw new Error("INVALID_ACTION");
          } else throw new Error("INVALID_ACTION");
        } else if (state.encounter.type === "empty") {
          if (action !== "continue") throw new Error("INVALID_ACTION");
          completeFloor(
            state,
            "🕳️ Căn phòng không có gì. Đúng nghĩa không có gì.",
            0,
          );
        } else if (state.encounter.type === "trap") {
          if (action !== "continue") throw new Error("INVALID_ACTION");
          const event = state.encounter;
          const kind = event.kind;
          if (kind === "tax_collector") {
            if (luckyBreak(state, event))
              completeFloor(state, LUCKY_BREAK_LOG, 0);
            else {
              const before = potentialPayout(state);
              const cost = taxCost(state);
              state.payoutSpent = (state.payoutSpent || 0) + cost;
              state.payoutTaxSpent = (state.payoutTaxSpent || 0) + cost;
              completeFloor(
                state,
                cost
                  ? `🧾 Tax Collector: thu một lần 15% payout hiện tại. Thưởng xu: ${formatCoins(before)} → **${formatCoins(potentialPayout(state))}** (−${formatCoins(cost)} xu).`
                  : "🧾 Tax Collector: không có payout để thu thuế.",
                0,
              );
            }
          } else if (kind === "potion_thief") {
            const avoided = state.potions > 0 && luckyBreak(state, event);
            const stolen = state.potions > 0 && !avoided ? 1 : 0;
            state.potions = Math.max(0, state.potions - stolen);
            completeFloor(
              state,
              avoided
                ? LUCKY_BREAK_LOG
                : stolen
                  ? "🦹 Kẻ trộm lấy mất 1 bình máu rồi biến mất."
                  : "🦹 Kẻ trộm kiểm tra túi đồ rỗng và tỏ vẻ thất vọng.",
              0,
            );
          } else if (kind === "wrong_portal") {
            resolveWrongPortal(state);
            noteEvent(
              state,
              "wrong_portal",
              state.encounter?.type === "combat",
            );
            if (state.hp <= 0)
              return {
                settled: true,
                state,
                result: finishRun(session, state, "death"),
              };
          } else throw new Error("INVALID_ACTION");
        } else if (state.encounter.type === "rngesus") {
          const event = state.encounter;
          if (action === "fight")
            return {
              settled: true,
              state,
              result: finishRun(session, state, "rngesus"),
            };
          if (action === "flee") {
            const escaped =
              typeof event.fleeRoll === "number"
                ? event.fleeRoll < 0.75
                : event.fleeSuccess;
            if (!escaped) {
              if (state.escapeTokens <= 0)
                return {
                  settled: true,
                  state,
                  result: finishRun(session, state, "rngesus"),
                };
              state.escapeTokens -= 1;
              completeFloor(
                state,
                `${E.ticket} Chạy thất bại! Tự dùng **1 Vé thoát** để cứu bạn khỏi RNGesus và đi tiếp.`,
                0,
              );
            } else
              completeFloor(
                state,
                "🏃 Bạn thoát khỏi RNGesus với đôi chân run rẩy; giữ lại Vé thoát.",
                0,
              );
          } else if (action === "bribe") {
            const cost = chargeCurrentPayout(state, 0.4);
            completeFloor(
              state,
              `💸 Hối lộ RNGesus: hệ số payout ×0,6, giảm **${cost} xu** hiện tại để đi tiếp.`,
              0,
            );
          } else if (action === "pray") {
            if (!event.prayerSuccess)
              return {
                settled: true,
                state,
                result: finishRun(session, state, "rngesus"),
              };
            const rarity = event.prayerRarity || "legendary";
            const pool = ITEMS[rarity];
            const item =
              pool[
                Math.min(
                  pool.length - 1,
                  Math.floor(event.prayerItemRoll * pool.length),
                )
              ];
            const equipment = applyItem(state, item, rarity);
            completeFloor(
              state,
              `🙏 RNGesus cười và trao **${item.name} Lv.${equipment.level}** (${rarityLabel(rarity)}).`,
              2,
            );
          } else if (action === "ticket") {
            if (state.escapeTokens <= 0) throw new Error("NO_TICKET");
            state.escapeTokens -= 1;
            completeFloor(
              state,
              `${E.ticket} Dùng một Vé thoát, vượt tầng an toàn.`,
              0,
            );
          } else throw new Error("INVALID_ACTION");
        } else throw new Error("INVALID_ACTION");

        if (state.hp <= 0)
          return {
            settled: true,
            state,
            result: finishRun(session, state, "death"),
          };

        if (state.lastDiscardedEscapeTokens)
          state.lastLog += `\n${E.ticket} Chỉ giữ tối đa 1 Vé thoát; bỏ ${state.lastDiscardedEscapeTokens} vé nhận thêm.`;
        delete state.lastDiscardedEscapeTokens;
        state.lastStatChanges = statChanges(state, before);
        // Persist cleared floors immediately; deaths and session cleanup must not erase milestones.
        if (state.cleared > 0)
          hardcoreRepository.upsertRecord(session.guild_id, session.user_id, {
            bestFloor: state.cleared,
            runs: 0,
            deaths: 0,
            escapes: 0,
            completions: 0,
          });
        saveState(session, state);
        return { settled: false, state, result: null };
      });
    },
  );

  function playHardcore(args) {
    return actionTx(args);
  }
  return { actionTx, playHardcore };
};
