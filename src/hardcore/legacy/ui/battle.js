// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    EmbedBuilder,
    formatCoins,
    potentialPayout,
    runDiamondReward,
    classShrineActive,
    regionForFloor,
    RIFT_MODIFIERS,
    resultBlock,
    icon,
  } = dependencies;
  const chaosLabel = (...args) => dependencies.chaosLabel(...args);
  const encounterSummary = (...args) => dependencies.encounterSummary(...args);
  const statLine = (...args) => dependencies.statLine(...args);
  const equipmentSummary = (...args) => dependencies.equipmentSummary(...args);
  const briefLog = (...args) => dependencies.briefLog(...args);

  function hardcoreEmbed(
    state,
    userId,
    result,
    classes,
    sessionId = null,
    itemCatalog = {},
  ) {
    const classInfo = classes[state.classKey];
    const payout = potentialPayout(state);
    const classIcon =
      {
        barbarian: icon("axe"),
        assassin: icon("dagger_knife"),
        sorceress: icon("crystal_ball"),
      }[state.classKey] || classInfo.emoji;
    const embed = new EmbedBuilder()
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
        `${classIcon} SINH TỒN legacy · TẦNG ${state.floor}${state.floor > 100 ? " · OVERRUN" : ""}`,
      )
      .setDescription(
        `${icon("bust_in_silhouette")} <@${userId}> · **${regionForFloor(state.floor).name}**`,
      )
      .addFields(
        {
          name: classInfo.name,
          value: statLine(state, false),
          inline: false,
        },
        {
          name: state.encounter.type === "combat" ? "Đối thủ" : "Tình huống",
          value: encounterSummary(state),
          inline: false,
        },
        {
          name: `${icon("compass")} Tiến trình`,
          value: `Đã vượt ${state.cleared} · Boss ${state.bosses} · Modifier ${Object.values(state.modifiers || {}).reduce((total, count) => total + count, 0)}\n${chaosLabel(state)}`,
          inline: false,
        },
        {
          name: `${icon("cyclone")} Rift modifier`,
          value:
            Object.entries(state.modifiers || {})
              .filter(([, stacks]) => stacks > 0)
              .map(
                ([key, stacks]) =>
                  `${RIFT_MODIFIERS[key]?.name || key} ×${stacks}`,
              )
              .join(" · ") || "Chưa có · Nhận lần đầu sau tầng 10.",
          inline: false,
        },
        {
          name: `${icon("moneybag")} Rút thưởng`,
          value: result
            ? `Đã nhận **${formatCoins(result.payout)} ${icon("coin")}** - **${formatCoins(result.diamonds || 0)} ${icon("gem")}**`
            : state.cleared
              ? `**${formatCoins(payout)} ${icon("coin")}** - **${formatCoins(runDiamondReward(state))} ${icon("gem")}**`
              : "Chưa thể rút",
          inline: true,
        },
        {
          name: "🎒 Trang bị",
          value: `${equipmentSummary(state, itemCatalog).slice(0, 400)}${state.payoutFactor < 1 ? `\nPayout sau phạt ×${Number(state.payoutFactor).toFixed(3)}` : ""}${state.contract ? `\nHợp đồng: không ${{ potion: "bình", skill: "skill", defend: "thủ" }[state.contract.kind]} · ${state.contract.remaining} tầng` : ""}${classShrineActive(state) ? `\nClass Shrine · hết sau tầng ${state.classShrine.until}` : ""}`,
          inline: false,
        },
        {
          name: `${icon("scroll")} Lượt vừa rồi`,
          value: briefLog(state),
          inline: false,
        },
      );
    if (result) {
      const won = result.reason === "cashout" || result.reason === "summit";
      const reason = won
        ? `rút thưởng tầng ${state.floor}`
        : result.reason === "forfeit"
          ? "bỏ run"
          : `${icon("skull")} tử trận tầng ${state.floor}`;
      embed.addFields({
        name: `${icon("checkered_flag")} KẾT QUẢ`,
        value: resultBlock({
          userId,
          outcome: result.outcome,
          stake: state.stake,
          payout: result.payout,
          result,
          reason,
        }),
      });
      if ((won ? result.diamonds : result.diamondsLost) > 0)
        embed.addFields({
          name: `${icon("gem")} Kim cương Sinh tồn`,
          value: won
            ? `Đã cộng **${formatCoins(result.diamonds || 0)}** kim cương vào tài khoản.`
            : `Mất **${formatCoins(result.diamondsLost || 0)}** kim cương tạm giữ.`,
        });
      if (result.achievements?.length)
        embed.addFields({
          name: `${icon("sports_medal")} Thành tựu mới`,
          value: result.achievements
            .map((item) => `**${item.name}**`)
            .join("\n"),
        });
    } else
      embed.setFooter({
        text: `${sessionId ? `Mã ván: ${sessionId} • ` : ""}Lượt ${state.turn} • Cược ${formatCoins(state.stake)} xu • /sinhton tieptuc`,
      });
    return embed;
  }
  return { hardcoreEmbed };
};
