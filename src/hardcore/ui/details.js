"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    covenant,
    gilded,
    memories,
    EmbedBuilder,
    ButtonStyle,
    royal,
    stats,
    core,
    itemPassives,
    world,
    emoji,
    E,
    STAT_SEPARATOR,
    SKILL_ICONS,
    RIFT_ICONS,
    passiveIcon,
    relicIcon,
    fragmentIcon,
    eventIcon,
    formatStatText,
    rarityLabel,
    percent,
    addTextFields,
    SKILLS,
    SHRINES,
  } = dependencies;
  const statLine = (...args) => dependencies.statLine(...args);
  const coinPayoutDetails = (...args) =>
    dependencies.coinPayoutDetails(...args);
  const checkpointPreview = (...args) =>
    dependencies.checkpointPreview(...args);
  const riftStatSummary = (...args) => dependencies.riftStatSummary(...args);
  const defenseDescription = (...args) =>
    dependencies.defenseDescription(...args);
  const effectText = (...args) => dependencies.effectText(...args);
  const formatPassiveText = (...args) =>
    dependencies.formatPassiveText(...args);
  const passiveText = (...args) => dependencies.passiveText(...args);
  const equipmentSummary = (...args) => dependencies.equipmentSummary(...args);
  const setProgressFields = (...args) =>
    dependencies.setProgressFields(...args);
  const hasEncounterDetails = (...args) =>
    dependencies.hasEncounterDetails(...args);
  const viewTabs = (...args) => dependencies.viewTabs(...args);
  const viewLabel = (...args) => dependencies.viewLabel(...args);
  const encounterDetails = (...args) => dependencies.encounterDetails(...args);
  const button = (...args) => dependencies.button(...args);
  const chunkRows = (...args) => dependencies.chunkRows(...args);
  const riftModifierText = (...args) => dependencies.riftModifierText(...args);
  const contractEffectText = (...args) =>
    dependencies.contractEffectText(...args);
  const classShrineActive = (...args) =>
    dependencies.classShrineActive(...args);
  const paradoxEffectText = (...args) =>
    dependencies.paradoxEffectText(...args);

  function privatePayload(
    state,
    sessionId,
    sourceMessageId,
    tab = "items",
    page = 0,
  ) {
    let pages =
      tab === "items" ? Math.max(1, Math.ceil(state.items.length / 5)) : 1;
    if (tab === "items") page = clampPage(page, pages);
    const e = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(
        `SINH TỒN v${state.releaseVersion} · ${{ stats: "CHỈ SỐ", items: "TÚI ĐỒ", effects: "RIFT & HIỆU ỨNG", encounter: "CHI TIẾT" }[tab] || "CHI TIẾT"}`,
      );
    if (tab !== "items")
      e.setDescription(
        `${stats.CLASSES[state.classKey].emoji} ${stats.CLASSES[state.classKey].name} · Tầng ${state.floor}`,
      );
    if (["items"].includes(tab)) {
      e.addFields({
        name: "Vật tư & vé",
        value: `${E.potion} **Bình: ${state.potions}/${state.maxPotions}**${STAT_SEPARATOR}${E.ticket} **Vé thoát: ${state.escapeTokens}**${STAT_SEPARATOR}${E.prayerTicket} **Vé cầu nguyện: ${state.prayerBoost ? 1 : 0}**${STAT_SEPARATOR}${E.reviveTicket} **Vé hồi sinh: ${state.reviveTickets || 0}**`,
      });
    }
    if (tab === "items") {
      for (const item of state.items.slice(page * 5, page * 5 + 5))
        e.addFields({
          name: `${item.name} Lv.${item.level} [${rarityLabel(item.rarity)}]`,
          value:
            `${effectText(item.definition.effects, item.level)}${passiveText(item.definition)}${item.definition.curse ? `\n☣️ ${item.level > (item.cleansedLevels || 0) ? effectText(item.definition.curse.effects, item.level - (item.cleansedLevels || 0)) : "Đã giải toàn bộ curse"}` : ""}`.slice(
              0,
              1024,
            ),
        });
      if (!state.items.length)
        e.addFields({ name: `${E.backpack} Trang bị`, value: "Chưa có." });
      if (
        covenant.enabled(state) &&
        (covenant.fragmentCount(state) > 0 ||
          covenant.progress(state).completed)
      )
        e.addFields({
          name: `${eventIcon("covenant")} Mảnh Chinh Phạt (${covenant.progress(state).completed ? 4 : covenant.fragmentCount(state)}/4)`,
          value: covenant.progress(state).completed
            ? relicIcon("conquerors_covenant") + " Đã hợp nhất thành **Conqueror’s Covenant [LR]**."
            : Object.entries(covenant.FRAGMENTS)
                .map(([key, name]) =>
                  covenant.progress(state).fragments?.[key] != null
                    ? fragmentIcon(key) + " **" + name + "** · Đã có"
                    : fragmentIcon(key) + " " + name + " · Chưa có",
                )
                .join("\n"),
        });
      for (const field of setProgressFields(state)) e.addFields(field);
      for (const relic of state.relics || []) {
        const definition = core.RELIC_ITEMS[relic.id];
        if (definition)
          e.addFields({
            name: relicIcon(relic.id) + " " + definition.name + " [LR]",
            value:
              (state.activeRelic === relic.id
                ? "**Đang hoạt động**"
                : "Chưa kích hoạt") +
              " · Nhận tại tầng " +
              relic.acquiredFloor +
              "\n" +
              passiveIcon(definition.relicPassive.kind) + " " + formatStatText(definition.text),
          });
      }
    } else if (tab === "stats") {
      const activeRelic = core.RELIC_ITEMS[state.activeRelic];
      if (activeRelic)
        addTextFields(
          e,
          passiveIcon(activeRelic.relicPassive.kind) + " Nội tại LR · " + activeRelic.name,
          formatStatText(activeRelic.text) +
            gilded.status(state) +
            royal.status(state) +
            (covenant.active(state)
              ? "\n**Hiện tại:** +" +
                percent(covenant.bonus(state)) +
                " thưởng xu · " +
                covenant.progress(state).kills +
                " quái hạ sau kích hoạt (tối đa 500)."
              : ""),
        );
      addTextFields(
        e,
        "Chỉ số nhân vật",
        statLine(state, false, false, {
          includeSupplies: false,
          effective: true,
        }),
      );
      const deductions = coinPayoutDetails(state).trim();
      if (deductions) addTextFields(e, `${E.coin} Thống kê xu`, deductions);
      addTextFields(
        e,
        `${E.backpack} Tổng hợp trang bị (${state.items.length})`,
        equipmentSummary(state),
      );
      addTextFields(
        e,
        "✨ Nội tại trang bị",
        formatPassiveText(itemPassives.summary(state)) || "Chưa có nội tại.",
      );
      addTextFields(
        e,
        "Giới hạn của bạn",
        passiveIcon("potionCapacity") +
          " **Sức chứa bình:** " +
          state.maxPotions +
          " · " +
          passiveIcon("critCap") +
          " **Trần CRIT:** " +
          percent(state.critCap) +
          " · " +
          passiveIcon("evasionCap") +
          " **Trần né vật lý:** " +
          percent(state.evasionCap),
      );
      addTextFields(
        e,
        `${E.rift} Ảnh hưởng Rift/Paradox đến chỉ số`,
        riftStatSummary(state),
      );
      if (classShrineActive(state))
        addTextFields(
          e,
          `${E.shrine} Class Shrine · Bạn`,
          `${SHRINES[state.classKey]} Hết tầng ${state.classShrine.until}.`,
        );
      e.addFields(
        {
          name: `${SKILL_ICONS[state.classKey]} ${stats.CLASSES[state.classKey].skill}`,
          value: SKILLS[state.classKey],
        },
        {
          name: `${E.attack} Tấn công`,
          value: `- ${E.attack} **Vật lý**: 1 đòn, có thể trượt hoặc ${E.crit} **CRIT ×${royal.critMultiplier(state).toLocaleString("vi-VN")}**.\n- ${E.mana} **MP +${core.attackManaGain(state)}**, kể cả trượt (tối đa Max MP).\nQuái còn sống sẽ đánh trả.`,
        },
        {
          name: `${E.defense} Phòng thủ`,
          value: defenseDescription(),
        },
      );
    } else if (tab === "effects") {
      for (const [key, n] of Object.entries(state.modifiers).filter(
        ([, n]) => n > 0,
      ))
        e.addFields({
          name: `${RIFT_ICONS[key] || E.rift} ${world.RIFT_MODIFIERS[key].name} ×${n}`,
          value: riftModifierText(key, n, state),
        });
      if (!Object.values(state.modifiers).some((count) => count > 0))
        e.addFields({
          name: `${E.rift} Rift modifier`,
          value: "Chưa có Rift modifier.",
        });
      addTextFields(e, "Rift Paradox", paradoxEffectText(state));
      addTextFields(e, "Rift Contract", contractEffectText(state));
      for (const field of [...memories.fields(state), ...gilded.fields(state)])
        addTextFields(e, field.name, field.value);
    } else {
      const detail = hasEncounterDetails(state)
        ? encounterDetails(state)
        : "Không có thông tin bổ sung; xem bảng chơi chính.";
      const description = `${e.data.description}\n\n${detail}`;
      if (description.length <= 4096) e.setDescription(description);
      else addTextFields(e, "Chi tiết tình huống", detail);
      if (state.phase === "upgrade")
        for (const key of stats.ATTRIBUTES)
          addTextFields(
            e,
            `${E[key]} +5 ${key.toUpperCase()}`,
            checkpointPreview(state, key),
          );
    }
    if (tab !== "items") {
      // Keep every field accessible when a large build exceeds Discord's 6000-char limit.
      const fieldPages = [[]];
      let used = 0;
      const budget = Math.min(
        5200,
        5800 - (e.data.title?.length || 0) - (e.data.description?.length || 0),
      );
      for (const field of e.data.fields || []) {
        const size = field.name.length + field.value.length;
        if (used + size > budget || fieldPages.at(-1).length >= 25) {
          fieldPages.push([]);
          used = 0;
        }
        fieldPages.at(-1).push(field);
        used += size;
      }
      pages = fieldPages.length;
      page = clampPage(page, pages);
      e.data.fields = fieldPages[page];
    }
    e.setFooter({
      text: `v${state.releaseVersion} · Lượt ${state.turn} · Trang ${page + 1}/${pages}`,
    });
    const prefix = `hardcore:${sessionId}:${state.turn}:`;
    const buttons = viewTabs(state).map((t) =>
      button(
        prefix + `view_${t}_0:${sourceMessageId}`,
        viewLabel(t, state),
        t === tab ? ButtonStyle.Primary : ButtonStyle.Secondary,
      ),
    );
    if (pages > 1)
      buttons.push(
        button(
          prefix + `page_${tab}_${Math.max(0, page - 1)}:${sourceMessageId}`,
          "Trước",
          ButtonStyle.Secondary,
          page === 0,
        ),
        button(
          prefix +
            `page_${tab}_${Math.min(pages - 1, page + 1)}:${sourceMessageId}`,
          "Sau",
          ButtonStyle.Secondary,
          page === pages - 1,
        ),
      );
    return {
      content: "",
      embeds: [e],
      components: chunkRows(buttons),
      allowedMentions: { parse: [] },
    };
  }

  function clampPage(page, pages) {
    return Math.max(
      0,
      Math.min(pages - 1, Number.isSafeInteger(page) ? page : 0),
    );
  }
  return { privatePayload, clampPage };
};
