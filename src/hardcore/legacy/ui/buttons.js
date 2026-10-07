// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    formatCoins,
    potentialPayout,
    serviceCost,
    forgeTarget,
    curseTarget,
    classShrineActive,
    payoutReductionCost,
    taxCost,
    surpriseOptions,
    normalizeEquipment,
    icon,
  } = dependencies;
  const detailButtons = (...args) => dependencies.detailButtons(...args);

  function button(
    sessionId,
    turn,
    action,
    label,
    emoji,
    style,
    disabled = false,
  ) {
    return new ButtonBuilder()
      .setCustomId(`hardcore:${sessionId}:${turn}:${action}`)
      .setLabel(label)
      .setEmoji(icon(emoji))
      .setStyle(style)
      .setDisabled(disabled);
  }

  function hardcoreActionRows(sessionId, state, disabled, classes) {
    if (disabled)
      return [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`replay:hardcore:${state.stake}:${state.classKey}`)
            .setLabel("Chơi lại")
            .setEmoji(icon("repeat"))
            .setStyle(ButtonStyle.Success),
        ),
      ];
    const turn = state.turn;
    const retreat = button(
      sessionId,
      turn,
      "retreat",
      state.cleared ? "Rút thưởng" : "Bỏ run",
      state.cleared ? "moneybag" : "waving_white_flag",
      ButtonStyle.Danger,
    );
    if (state.phase === "summit")
      return [new ActionRowBuilder().addComponents(retreat)];
    if (state.phase === "upgrade")
      return [
        new ActionRowBuilder().addComponents(
          button(
            sessionId,
            turn,
            "upgrade_attack",
            "ATK +5",
            "crossed_swords",
            ButtonStyle.Primary,
          ),
          button(
            sessionId,
            turn,
            "upgrade_hp",
            "MAX HP +30",
            "heart",
            ButtonStyle.Success,
          ),
          button(
            sessionId,
            turn,
            "upgrade_defense",
            "DEF +6",
            "shield",
            ButtonStyle.Secondary,
          ),
          button(
            sessionId,
            turn,
            "upgrade_luck",
            "LUCK +2",
            "four_leaf_clover",
            ButtonStyle.Secondary,
          ),
          retreat,
        ),
      ];
    const type = state.encounter.type;
    if (type === "combat")
      return [
        new ActionRowBuilder().addComponents(
          button(
            sessionId,
            turn,
            "attack",
            "Tấn công",
            "crossed_swords",
            ButtonStyle.Primary,
          ),
          button(
            sessionId,
            turn,
            "defend",
            "Phòng thủ",
            "shield",
            ButtonStyle.Secondary,
          ),
          button(
            sessionId,
            turn,
            "skill",
            classes[state.classKey].skill,
            "sparkles",
            ButtonStyle.Success,
            state.energy < 2 &&
              !(state.classKey === "sorceress" && classShrineActive(state)),
          ),
          button(
            sessionId,
            turn,
            "potion",
            `Bình máu (${state.potions})`,
            "test_tube",
            ButtonStyle.Secondary,
            state.potions <= 0 || state.hp >= state.maxHp,
          ),
          retreat,
        ),
      ];
    if (type === "chest")
      return [
        new ActionRowBuilder().addComponents(
          button(
            sessionId,
            turn,
            "open",
            "Mở hòm",
            "unlock",
            ButtonStyle.Primary,
          ),
          button(
            sessionId,
            turn,
            "inspect",
            "Kiểm tra",
            "eye",
            ButtonStyle.Secondary,
            state.encounter.inspected,
          ),
          button(
            sessionId,
            turn,
            "sell",
            "Bán hòm",
            "dollar",
            ButtonStyle.Success,
          ),
          button(
            sessionId,
            turn,
            "leave",
            "Tránh Mimic",
            "door",
            ButtonStyle.Secondary,
            !state.encounter.revealed,
          ),
          retreat,
        ),
      ];
    if (type === "shrine")
      return [
        new ActionRowBuilder().addComponents(
          button(
            sessionId,
            turn,
            "touch",
            "Chạm Shrine",
            "moyai",
            ButtonStyle.Primary,
          ),
          button(
            sessionId,
            turn,
            "ignore",
            "Bỏ qua",
            "walking",
            ButtonStyle.Secondary,
          ),
          retreat,
        ),
      ];
    if (type === "rngesus")
      return [
        new ActionRowBuilder().addComponents(
          button(
            sessionId,
            turn,
            "fight",
            "Chiến đấu",
            "crossed_swords",
            ButtonStyle.Danger,
          ),
          button(
            sessionId,
            turn,
            "flee",
            "Bỏ chạy 75%",
            "running",
            ButtonStyle.Primary,
          ),
          button(
            sessionId,
            turn,
            "bribe",
            `Hối lộ · ${formatCoins(payoutReductionCost(state, 0.4))} xu`,
            "money_with_wings",
            ButtonStyle.Secondary,
          ),
          button(
            sessionId,
            turn,
            "pray",
            `Cầu nguyện ${Math.round((state.encounter.prayerChance ?? 0.3) * 100)}%`,
            "pray",
            ButtonStyle.Success,
          ),
          button(
            sessionId,
            turn,
            "ticket",
            "Dùng vé",
            "ticket",
            ButtonStyle.Secondary,
            state.escapeTokens <= 0,
          ),
        ),
      ];
    if (type === "surprise") {
      const actions = surpriseOptions(state).map((choice) =>
        button(
          sessionId,
          turn,
          choice.action,
          choice.label,
          "sparkles",
          ButtonStyle.Primary,
          choice.disabled,
        ),
      );
      actions.push(
        button(
          sessionId,
          turn,
          "ignore",
          state.encounter.kind === "adventurer" ? "Bỏ mặc" : "Bỏ qua",
          "walking",
          ButtonStyle.Secondary,
        ),
        retreat,
      );
      const rows = [];
      for (let offset = 0; offset < actions.length; offset += 5)
        rows.push(
          new ActionRowBuilder().addComponents(
            actions.slice(offset, offset + 5),
          ),
        );
      return rows;
    }
    if (type === "blacksmith" || type === "cleanse") {
      const cost = serviceCost(state, type);
      const eligible =
        type === "blacksmith" ? forgeTarget(state) : curseTarget(state);
      return [
        new ActionRowBuilder().addComponents(
          button(
            sessionId,
            turn,
            type === "blacksmith" ? "forge" : "cleanse",
            `${type === "blacksmith" ? "Rèn" : "Giải nguyền"} · ${formatCoins(cost)} xu`,
            type === "blacksmith" ? "hammer" : "sparkles",
            ButtonStyle.Success,
            !eligible ||
              potentialPayout(state) <= 0 ||
              potentialPayout(state) < cost,
          ),
          button(
            sessionId,
            turn,
            "ignore",
            "Bỏ qua",
            "walking",
            ButtonStyle.Secondary,
          ),
          retreat,
        ),
      ];
    }
    return [
      new ActionRowBuilder().addComponents(
        button(
          sessionId,
          turn,
          "continue",
          type === "trap"
            ? state.encounter.kind === "tax_collector"
              ? `Thuế · ${formatCoins(taxCost(state))} xu`
              : "Chấp nhận số phận"
            : "Đi tiếp",
          "arrow_right",
          ButtonStyle.Primary,
        ),
        retreat,
      ),
    ];
  }

  function hardcoreRows(sessionId, state, disabled, classes) {
    const rows = hardcoreActionRows(sessionId, state, disabled, classes);
    if (!disabled)
      rows.push(
        detailButtons(
          sessionId,
          state.turn,
          null,
          null,
          normalizeEquipment(state.items).length,
        ),
      );
    return rows;
  }
  return { button, hardcoreActionRows, hardcoreRows };
};
