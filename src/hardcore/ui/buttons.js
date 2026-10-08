"use strict";
const bosses = require("../bosses/mechanics");
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    memories,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    stats,
    core,
    itemPassives,
    icon,
    E,
    SKILL_ICONS,
    RIFT_ICONS,
    eventIcon,
    treasureChestIcon,
    paradoxIcon,
    memoryIcon,
    money,
  } = dependencies;
  const merchantOffer = (...args) => dependencies.merchantOffer(...args);
  const viewTabs = (...args) => dependencies.viewTabs(...args);
  const viewLabel = (...args) => dependencies.viewLabel(...args);

  function button(
    id,
    label,
    style = ButtonStyle.Secondary,
    disabled = false,
    emojiOverride = null,
  ) {
    const action = id.split(":")[3] || "";
    const symbols = {
      attack: ["PHYS", "⚔️"],
      defend: ["DEF", "🛡️"],
      skill: ["sparkles", "✨"],
      potion: ["potion", "🧪"],
      retreat: ["moneybag", "💰"],
      open: ["event_chest", "📦"],
      inspect: ["mag", "🔍"],
      sell: ["moneybag", "💰"],
      leave: ["walking", "🚶"],
      skip: ["walking", "🚶"],
      event_skip: ["walking", "🚶"],
      touch: ["event_shrine", "🗿"],
      next: ["arrow_right", "➡️"],
      royal_kingslayers_testament: ["event_royal_invitation", "🏰"],
      royal_astral_singularity: ["event_royal_invitation", "🏰"],
      royal_continue: ["arrow_right", "➡️"],
      ritual_summon: ["event_ritual", "🕯️"],
      ritual_claim: ["relic_gilded_soul", "💠"],
      covenant_basement: ["event_covenant", "🗝️"],
      covenant_continue: ["arrow_right", "➡️"],
      fight: ["PHYS", "⚔️"],
      flee: ["runner", "🏃"],
      bribe: ["moneybag", "💰"],
      pray: ["pray", "🙏"],
      ticket: ["ticket_rngesus", "🎫"],
      event_smith: ["hammer", "🔨"],
      event_cleanse: ["sparkles", "✨"],
      event_heal: ["HP", "❤️"],
    };
    let symbol = id.startsWith("replay:") ? ["repeat", "🔁"] : symbols[action];
    if (action.startsWith("view_"))
      symbol = {
        stats: ["bar_chart", "📊"],
        items: ["backpack", "🎒"],
        effects: ["rift", "🌀"],
        encounter: ["information_source", "ℹ️"],
      }[action.split("_")[1]];
    if (action.startsWith("page_"))
      symbol = label === "Trước" ? ["arrow_left", "⬅️"] : ["arrow_right", "➡️"];
    if (action.startsWith("upgrade_"))
      symbol = {
        str: ["STR", "💪"],
        dex: ["DEX", "🗡️"],
        vit: ["VIT", "❤️"],
        ene: ["ENE", "🔮"],
      }[action.slice(8)];
    if (action.startsWith("buy_")) symbol = ["shopping_cart", "🛒"];
    const b = new ButtonBuilder()
      .setCustomId(id)
      .setStyle(style)
      .setDisabled(Boolean(disabled));
    if (label) b.setLabel(label.slice(0, 80));
    if (emojiOverride) b.setEmoji(emojiOverride);
    else if (symbol) b.setEmoji(icon(...symbol));
    return b;
  }

  function chunkRows(buttons) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5)
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    return rows;
  }

  function rows(sessionId, state, disabled = false) {
    if (disabled)
      return chunkRows([
        button(
          `replay:hardcore:${state.stake}:${state.classKey}`,
          "Chơi lại",
          ButtonStyle.Success,
        ),
      ]);
    const prefix = `hardcore:${sessionId}:${state.turn}:`;
    const actions = core.actions(state);
    if (state.encounter.type === "chest")
      actions.sort(
        (a, b) =>
          ["open", "inspect", "sell", "leave"].indexOf(a.action) -
          ["open", "inspect", "sell", "leave"].indexOf(b.action),
      );
    const buttons = actions.map((a) =>
      button(
        prefix + a.action,
        state.phase === "severance" && a.action !== "sever_none"
          ? ""
          : (itemPassives.forecastLabel(state.encounter, a.action)
              ? itemPassives.forecastLabel(state.encounter, a.action) + " · "
              : "") +
              ({
                potion: `${state.potions}`,
                open: "Mở hòm",
                inspect: "Kiểm tra",
                sell: "Bán hòm",
                leave: "Tránh Mimic",
              }[a.action] ||
                (state.encounter.kind === "merchant" &&
                a.action.startsWith("buy_")
                  ? `${merchantOffer(state.encounter.offers[Number(a.action.slice(4))]).button} · ${money(state.encounter.offers[Number(a.action.slice(4))].price)} xu`
                  : a.label)),
        a.action === "fight"
          ? ButtonStyle.Danger
          : ["attack", "open", "next", "flee"].includes(a.action)
            ? ButtonStyle.Primary
            : ["skill", "bribe", "ticket"].includes(a.action)
              ? ButtonStyle.Success
              : ButtonStyle.Secondary,
        a.disabled,
        state.phase === "severance" && a.action !== "sever_none"
          ? RIFT_ICONS[a.action.slice(6)] || E.rift
          : state.encounter.type === "memory"
            ? memoryIcon(memories.family(state.encounter.debt))
            : a.action.startsWith("paradox_") && state.encounter.version === 2
              ? paradoxIcon(a.action.slice(8))
              : a.action.startsWith("chest_") &&
                  state.encounter.kind === "treasure_room"
                ? treasureChestIcon(a.action.slice(6))
                : a.action.startsWith("boss_")
                  ? eventIcon("boss_chest")
                  : a.action === "skill"
                    ? bosses.brainControl(state)
                      ? "🧠"
                      : SKILL_ICONS[state.classKey]
                    : a.action.startsWith("forge_")
                      ? E[
                          a.action === "forge_main"
                            ? stats.mainStat(state)
                            : a.action === "forge_guard"
                              ? state.encounter.forgeStat || "str"
                              : a.action === "forge_vit"
                                ? "vit"
                                : "ticket"
                        ]
                      : state.encounter.kind === "merchant" &&
                          a.action.startsWith("buy_")
                        ? merchantOffer(
                            state.encounter.offers[Number(a.action.slice(4))],
                          ).icon
                        : /^(event_|buy_|forge_|contract_|door_|duel_|hand_)/.test(
                              a.action,
                            )
                          ? eventIcon(
                              state.encounter.kind || state.encounter.type,
                            )
                          : null,
      ),
    );
    if (
      state.encounter.type !== "rngesus" &&
      state.phase !== "boss_chest" &&
      !bosses.retreatLocked(state)
    )
      buttons.push(
        button(
          prefix + "retreat",
          state.phase === "summit"
            ? "Rút thưởng"
            : state.cleared
              ? "Rút thưởng"
              : "Bỏ run",
          ButtonStyle.Danger,
        ),
      );
    const result = chunkRows(buttons);
    result.push(
      new ActionRowBuilder().addComponents(
        viewTabs(state).map((tab) =>
          button(prefix + `view_${tab}_0`, viewLabel(tab, state)),
        ),
      ),
    );
    return result;
  }
  return { button, chunkRows, rows };
};
