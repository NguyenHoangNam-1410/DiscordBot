"use strict";
const { itemIcon } = require("../shared/icons");
const purifier = require("../events/purifier");
const { StringSelectMenuBuilder } = require("discord.js");
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
      royal_kingslayers_testament: ["relic_kingslayers_testament", "👑"],
      royal_astral_singularity: ["relic_astral_singularity", "🌌"],
      prophecy_war: ["seal_war", "🔺"],
      prophecy_protection: ["seal_protection", "🔺"],
      prophecy_arcane: ["seal_arcane", "🔺"],
      enter_kabraxis: ["event_boss_gate", "🚪"],
      royal_continue: ["arrow_right", "➡️"],
      god_continue: ["event_god_rngesus", "🌟"],
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

  function eventMenuActions(state, actions = core.actions(state)) {
    if (
      actions.filter(
        (a) => a.action !== "retreat" && !a.action.startsWith("view_"),
      ).length <= 4 ||
      state.gameplayVersion !== 3 ||
      state.phase === "upgrade" ||
      state.mode?.startsWith("tower") ||
      state.towerChallengeId ||
      ["combat", "rngesus"].includes(state.encounter.type) ||
      state.encounter.kind === "purifier"
    )
      return [];
    const separate = new Set([
      "event_skip",
      "skip",
      "leave",
      "boss_sell",
      "retreat",
      "sever_none",
    ]);
    const candidates = actions.filter(
      (a) =>
        !a.menu && !separate.has(a.action) && !a.action.startsWith("purifier_"),
    );
    return candidates.length >= 3 ||
      (candidates.length >= 2 &&
        (actions.length >= 3 ||
          state.phase === "severance" ||
          state.encounter.kind?.endsWith("_shop") ||
          state.encounter.kind === "merchant"))
      ? candidates
      : [];
  }
  function menuEmoji(value) {
    const match = value.match(/^<(a?):(\w+):(\d+)>$/);
    return match
      ? { name: match[2], id: match[3], animated: Boolean(match[1]) }
      : { name: value };
  }

  function actionItem(state, action) {
    if (state.phase === "boss_chest" && /^boss_pick_\d+$/.test(action))
      return state.encounter.offers?.[Number(action.slice(10))];
    if (/^buy_\d+$/.test(action))
      return state.encounter.offers?.[Number(action.slice(4))]?.item;
    return null;
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
    const eventChoices = eventMenuActions(state, actions);
    const menuIds = new Set(eventChoices.map((a) => a.action));
    const buttonActions = actions.filter(
      (a) =>
        !a.action.startsWith("purifier_select_") &&
        !a.menu &&
        !menuIds.has(a.action),
    );
    const buttons = buttonActions.map((a) =>
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
        actionItem(state, a.action)
          ? itemIcon(actionItem(state, a.action))
          : state.phase === "severance" && a.action !== "sever_none"
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
      state.encounter.forge?.stage !== "boon" &&
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
    if (eventChoices.length) {
      const available = eventChoices.filter((a) => !a.disabled);
      const choices = available.length ? available : eventChoices;
      const placeholder = !available.length
        ? "Không đủ điều kiện cho các lựa chọn này"
        : state.phase === "severance"
          ? "Chọn Rift muốn xóa"
          : state.phase === "upgrade"
            ? "Chọn thuộc tính muốn tăng"
            : state.phase === "boss_chest"
              ? "Chọn một trang bị từ rương boss"
              : state.encounter.kind === "horadric"
                ? "Chọn phúc lành của Forge"
                : state.encounter.kind?.endsWith("_shop") ||
                    state.encounter.kind === "merchant"
                  ? "Chọn món muốn mua"
                  : "Chọn cách xử lý tình huống";
      result.unshift(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(prefix + "event_select")
            .setPlaceholder(placeholder)
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(!available.length)
            .addOptions(
              choices.map((a) => ({
                label: (
                  (itemPassives.forecastLabel(state.encounter, a.action)
                    ? itemPassives.forecastLabel(state.encounter, a.action) +
                      " · "
                    : "") + a.label
                ).slice(0, 100),
                value: a.action,
                emoji: menuEmoji(
                  actionItem(state, a.action)
                    ? itemIcon(actionItem(state, a.action))
                    : state.phase === "severance"
                      ? RIFT_ICONS[a.action.slice(6)] || E.rift
                      : a.action.startsWith("upgrade_")
                        ? E[a.action.slice(8)]
                        : a.action.startsWith("forge_boon_")
                          ? E[
                              {
                                accuracy: "accuracy",
                                resistance: "res",
                                defense: "defense",
                              }[
                                state.encounter.forge.boons[
                                  Number(a.action.slice(-1))
                                ].key
                              ] ||
                                state.encounter.forge.boons[
                                  Number(a.action.slice(-1))
                                ].key
                            ] || E.shrine
                          : a.action.startsWith("buy_")
                            ? icon("shopping_cart", "🛒")
                            : eventIcon(
                                state.encounter.kind || state.encounter.type,
                              ),
                ),
              })),
            ),
        ),
      );
    }
    const menuKinds = [
      ...new Set(
        actions.filter((a) => a.menu && !a.disabled).map((a) => a.menu),
      ),
    ];
    for (const menu of menuKinds) {
      const bossMenu = actions.filter((a) => a.menu === menu && !a.disabled);
      if (bossMenu.length)
        result.unshift(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(prefix + "boss_select_" + menu)
              .setPlaceholder(
                bossMenu.every((a) => a.kind === "selector")
                  ? "Chọn mục tiêu / Ward — không tốn lượt"
                  : "Hành động boss — tốn 1 lượt",
              )
              .addOptions(
                bossMenu.map((a) => ({
                  label: a.label.slice(0, 100),
                  value: a.action,
                  default: Boolean(a.selected),
                })),
              ),
          ),
        );
    }
    if (
      state.phase === "encounter" &&
      state.encounter.type === "surprise" &&
      state.encounter.kind === "purifier" &&
      purifier.items(state).length
    ) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(prefix + "purifier_select")
        .setPlaceholder(
          "Chọn món cần giải nguyền · " +
            (purifier.page(state) + 1) +
            "/" +
            purifier.pages(state),
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          purifier.pageItems(state).map((item) => ({
            label: (item.name + " · Lv." + item.level).slice(0, 100),
            value: item.definition.id,
            description:
              "Còn " +
              (item.level - (item.cleansedLevels || 0)) +
              " cấp nguyền",
            default: item.definition.id === state.encounter.targetId,
            emoji: menuEmoji(itemIcon(item)),
          })),
        );
      result.unshift(new ActionRowBuilder().addComponents(menu));
    }

    result.push(
      new ActionRowBuilder().addComponents(
        viewTabs(state).map((tab) =>
          button(prefix + `view_${tab}_0`, viewLabel(tab, state)),
        ),
      ),
    );
    return result;
  }
  return { button, chunkRows, rows, eventMenuActions };
};
