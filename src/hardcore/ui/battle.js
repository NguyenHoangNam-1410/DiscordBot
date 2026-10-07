"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    EmbedBuilder,
    stats,
    core,
    world,
    runDiamondReward,
    emoji,
    resultBlock,
    icon,
    E,
    money,
    addTextFields,
    STAT_SEPARATOR,
  } = dependencies;
  const statLine = (...args) => dependencies.statLine(...args);
  const battleStats = (...args) => dependencies.battleStats(...args);
  const encounterSummary = (...args) => dependencies.encounterSummary(...args);
  const turnText = (...args) => dependencies.turnText(...args);

  function embed(state, userId, result = null, sessionId = null) {
    const c = stats.CLASSES[state.classKey];
    const e = new EmbedBuilder()
      .setColor(
        result
          ? result.outcome === "win"
            ? 0x2ecc71
            : 0xe74c3c
          : state.hp <= state.maxHp * 0.3
            ? 0xe74c3c
            : state.encounter.type !== "combat"
              ? 0x3498db
              : state.floor > 100
                ? 0x9b59b6
                : 0xe67e22,
      )
      .setTitle(
        `${c.emoji} SINH TỒN v${state.releaseVersion} · TẦNG ${state.floor}${state.floor > 100 ? " · OVERRUN" : ""}`,
      )
      .setDescription(
        `${icon("bust_in_silhouette", "👤")} <@${userId}> · **${world.regionForFloor(state.floor).name}**`,
      )
      .addFields({
        name: `${c.emoji} ${c.name}`,
        value: (state.phase === "encounter" && state.encounter.type === "combat"
          ? battleStats(state)
          : statLine(state, false, state.phase !== "upgrade")
        ).slice(0, 1024),
      });
    const protections = [
      ...(state.prayerBoost
        ? [`${E.prayerTicket} **Vé cầu nguyện ×1** · RNGesus **60%**`]
        : []),
      ...(state.reviveTickets
        ? [
            `${E.reviveTicket} **Vé hồi sinh ×${state.reviveTickets}** · ${E.hp} **HP 50%**`,
          ]
        : []),
    ];
    if (protections.length)
      e.addFields({ name: "Vé", value: protections.join("\n") });
    addTextFields(
      e,
      state.encounter.type === "combat"
        ? `${E.attack} Đối thủ`
        : "⚠️ Tình huống",
      encounterSummary(state),
    );
    e.addFields({
      name: `${icon("moneybag", "💰")} Rút thưởng`,
      value: result
        ? `Đã nhận **${money(result.payout)} ${icon("coin", "🪙")}** ${STAT_SEPARATOR} **${money(result.diamonds || 0)} ${icon("gem", "💎")}**`
        : state.cleared
          ? `Thực nhận: **${money(core.payout(state))} ${E.coin}**${STAT_SEPARATOR}**${money(runDiamondReward(state))} ${icon("gem", "💎")}**`
          : "Chưa thể rút",
      inline: false,
    });
    addTextFields(e, `${icon("scroll", "📜")} Lượt vừa rồi`, turnText(state));
    if (result) {
      const won = ["cashout", "summit"].includes(result.reason);
      e.addFields({
        name: `${icon("checkered_flag", "🏁")} KẾT QUẢ`,
        value: resultBlock({
          userId,
          outcome: result.outcome,
          stake: state.stake,
          payout: result.payout,
          result,
          reason: won
            ? `rút thưởng tầng ${state.floor}`
            : result.reason === "forfeit"
              ? "bỏ run"
              : `tử trận tầng ${state.floor}`,
        }).slice(0, 1024),
      });
      if ((won ? result.diamonds : result.diamondsLost) > 0)
        e.addFields({
          name: `${icon("gem", "💎")} Kim cương Sinh tồn`,
          value: won
            ? `Đã cộng **${money(result.diamonds || 0)}** kim cương vào tài khoản.`
            : `Mất **${money(result.diamondsLost || 0)}** kim cương tạm giữ.`,
        });
    }
    if (result?.achievements?.length)
      e.addFields({
        name: "Thành tựu mới",
        value: result.achievements
          .map((x) => x.name)
          .join(" · ")
          .slice(0, 1024),
      });
    return e.setFooter({
      text: `${sessionId ? `Mã ván: ${sessionId} • ` : ""}Lượt ${state.turn} • Cược ${money(state.stake)} xu`,
    });
  }
  return { embed };
};
