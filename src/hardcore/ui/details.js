"use strict";
const { itemIcon } = require("../shared/icons");
const bosses = require("../bosses/mechanics");
const statsV3 = require("../shared/statsV3");
const { statNumber } = require("../shared/ui");
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

  const SUBS = Object.freeze({
    stats: [
      ["overview", "Tổng quan"],
      ["character", "Nhân vật"],
      ["equipment", "Trang bị"],
      ["actions", "Hành động"],
    ],
    items: [
      ["supplies", "Vật tư"],
      ["equipment", "Trang bị"],
      ["sets", "Set & Di vật"],
    ],
    effects: [
      ["rift", "Rift"],
      ["effects", "Hiệu ứng"],
      ["memories", "Ký ức"],
    ],
  });
  // Tab con và trang được gói vào một số: (sub+1) × 100 + trang. Số < 100 là tab con đầu tiên,
  // để nút tab chính (view_x_0) không trùng custom_id với nút tab con đầu tiên.
  const decodePage = (tab, value) => {
    const n = Number.isSafeInteger(value) && value >= 0 ? value : 0;
    const count = SUBS[tab]?.length || 1;
    if (n < 100) return { sub: 0, page: n };
    return { sub: Math.min(count - 1, Math.floor(n / 100) - 1), page: n % 100 };
  };
  const encodePage = (sub, page) => (sub + 1) * 100 + page;

  // Các mốc tầng sắp tới: tập hợp thông tin đang nằm rải rác ở nhiều nơi.
  function upcoming(state) {
    const floor = state.floor,
      lines = [];
    for (const loan of state.forgeLoans || [])
      lines.push(
        `🔨 **${loan.name}** về từ Horadric Forge ở tầng **${loan.due}** (còn ${Math.max(0, loan.due - floor)} tầng, +2 level).`,
      );
    lines.push(
      `${E.checkpoint} Checkpoint kế tiếp: tầng **${Math.ceil(floor / 5) * 5}**.`,
    );
    const bossFloor = [
      Math.ceil(floor / 50) * 50,
      ...[333, 666, 999].filter((x) => x >= floor),
    ].reduce((a, b) => Math.min(a, b));
    lines.push(`${eventIcon("boss")} Boss kế tiếp: tầng **${Math.min(999, bossFloor)}**.`);
    if (require("../rift").enabled(state) && floor <= 960)
      lines.push(
        `${E.rift} Rift mới: tầng **${Math.ceil(floor / 10) * 10}** (mỗi 10 tầng, từ 10 đến 960).`,
      );
    if (state.paradox?.until)
      lines.push(`Paradox hết hiệu lực sau tầng **${state.paradox.until}**.`);
    if (state.contract?.until)
      lines.push(`Rift Contract kết thúc sau tầng **${state.contract.until}**.`);
    if (state.classShrine?.until && !state.classShrine.consumed)
      lines.push(`${E.shrine} Class Shrine hết sau tầng **${state.classShrine.until}**.`);
    for (const debt of state.debts || [])
      if (Number.isSafeInteger(debt.due))
        lines.push(`Khoản nợ ký ức đến hạn ở tầng **${debt.due}**.`);
    if (require("../events/explorationMarks").sealAltarDue(state))
      lines.push(
        "🔱 Đủ bốn ấn: Đàn Tứ Ấn sẽ xuất hiện ở tình huống hợp lệ kế tiếp.",
      );
    return lines.join("\n");
  }

  // Chỉ số cộng dồn theo nguồn; phần còn lại (Rift/Paradox/khác) gom vào một khoản để tổng luôn khớp.
  function statLedger(state) {
    const base = stats.CLASSES[state.classKey],
      equipment = require("../equipment/rules").enabled(state),
      totals = stats.sumEffects(state).totals;
    const sourceTotal = (key) =>
      Object.entries(state.sources || {}).reduce(
        (n, [name, source]) =>
          n + (name === "absorbed" && equipment ? 0 : source?.[key] || 0),
        0,
      );
    return stats.ATTRIBUTES.map((key) => {
      const checkpoint = state.sources?.checkpoint?.[key] || 0,
        sources = sourceTotal(key),
        items = (totals[key] || 0) - sources,
        event = sources - checkpoint,
        other = state[key] - base[key] - checkpoint - event - items;
      const parts = [
        [base[key], "gốc"],
        [checkpoint, "checkpoint"],
        [event, "sự kiện"],
        [items, "trang bị"],
        [other, "Rift/khác"],
      ]
        .filter(([n], i) => i === 0 || Math.abs(n) >= 0.05)
        .map(([n, label], i) => (i && n > 0 ? "+" : "") + statNumber(n) + " " + label);
      return `${E[key]} **${key.toUpperCase()} ${statNumber(state[key])}** = ${parts.join(" ")}`;
    }).join("\n");
  }

  function buildStats(state, e, sub) {
    const equipmentRules = require("../equipment/rules");
    if (sub === 0) {
      addTextFields(
        e,
        "Chỉ số nhân vật",
        statLine(state, false, false, {
          includeSupplies: false,
          effective: true,
        }),
      );
      addTextFields(e, "Nguồn chỉ số", statLedger(state));
      if (state.gameplayVersion === 3 && state.damageBreakdown) {
        const b = state.damageBreakdown;
        const line = (name, x) =>
          name +
          ": class **" +
          Number(x.base.toFixed(1)).toLocaleString("vi-VN") +
          "** · điểm phân bổ **" +
          Number(x.attributes.toFixed(1)).toLocaleString("vi-VN") +
          "** · item/hấp thụ **" +
          Number(x.equipment.toFixed(1)).toLocaleString("vi-VN") +
          "** → **" +
          x.total +
          " DMG**.";
        addTextFields(
          e,
          "Nguồn sát thương",
          line(E.attack + " Vật lý", b.physical) +
            "\n" +
            line(E.magic + " Phép", b.spell) +
            "\nTrước hệ số Skill, nội tại/Rift và giảm trừ của quái.",
        );
      }
      const deductions = coinPayoutDetails(state).trim();
      if (deductions) addTextFields(e, `${E.coin} Thống kê xu`, deductions);
      addTextFields(
        e,
        `${E.rift} Buff/Debuff ảnh hưởng chỉ số`,
        riftStatSummary(state),
      );
      if (state.encounter.boss?.version === 2) {
        const b = state.encounter.boss,
          m = b.mechanicState;
        const lines = [
          "Vật lý ×" +
            bosses.playerFactor(state, false).toFixed(1) +
            " · Phép ×" +
            bosses.playerFactor(state, true).toFixed(1) +
            " (cơ chế boss, trước giảm trừ).",
        ];
        if (bosses.healingLimit(state) < state.maxHp)
          lines.push(
            "Hồi HP không vượt " +
              bosses.healingLimit(state) +
              "/" +
              state.maxHp +
              " trong hiệu ứng hiện tại.",
          );
        if (m.curses?.length)
          lines.push(
            "Flesh Curse: " +
              m.curses
                .map(
                  (v) =>
                    ({
                      damageTaken: "+5% DMG nhận",
                      skillHpCost: "Skill trả thêm 1% Max HP",
                      healingReduction: "−15% hồi HP",
                    })[v.type],
                )
                .join(" · "),
          );
        addTextFields(e, "⚔️ Ảnh hưởng từ boss lên bạn", lines.join("\n"));
      }
      addTextFields(e, "⏳ Sắp tới", upcoming(state));
    } else if (sub === 1) {
      const soulText = require("../characters/souls").summary(state);
      if (soulText) addTextFields(e, "✨ Tinh hồn nhân vật", soulText);
      const innateText = require("../innate").description(state);
      if (innateText) addTextFields(e, "✨ Class Innate · tầng 1", innateText);
      if (equipmentRules.enabled(state))
        addTextFields(
          e,
          "✨ Affinity trang bị",
          require("../equipment/affinityEffects").summary(state),
        );
      const awakeningText = require("../awakening").description(state);
      if (awakeningText) addTextFields(e, "✨ Class Awakening", awakeningText);
      if (state.gameplayVersion === 3)
        addTextFields(e, "✨ Mastery của class", statsV3.description(state, E));
      const kit = [
        require("../characters/venance"),
        require("../characters/rhakor"),
      ]
        .filter((k) => k.enabled(state))
        .map((k) => k.status(state))
        .filter(Boolean)
        .join("\n");
      if (kit) addTextFields(e, "Trạng thái kit hiện tại", kit);
    } else if (sub === 2) {
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
      const activeRelic = core.RELIC_ITEMS[state.activeRelic];
      if (activeRelic)
        addTextFields(
          e,
          passiveIcon(activeRelic.relicPassive.kind) +
            " Nội tại LR · " +
            activeRelic.name,
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
    } else {
      const inCombat =
        state.phase === "encounter" && state.encounter?.type === "combat";
      const preview = (action) => {
        if (!inCombat) return "";
        try {
          const p =
            action === "skill"
              ? core.skillDamagePreview(state)
              : core.attackDamagePreview(state);
          return p.preparation
            ? "\n**Dự kiến:** không gây DMG (chuẩn bị)."
            : `\n**Dự kiến vs quái hiện tại:** ${p.low}–${p.high} DMG.`;
        } catch {
          return "";
        }
      };
      e.addFields(
        {
          name: `${SKILL_ICONS[state.classKey]} ${stats.CLASSES[state.classKey].skill}${inCombat ? ` (${core.skillManaCost(state)} MP)` : ""}`,
          value: (SKILLS[state.classKey] + preview("skill")).slice(0, 1024),
        },
        {
          name: `${E.attack} Tấn công`,
          value: (
            (state.classKey === "venance"
              ? require("./index").setupPreview("venance").attack
              : `- ${E.attack} **Vật lý**: 1 đòn, có thể trượt hoặc ${E.crit} **CRIT ×${Number(royal.critMultiplier(state).toFixed(1)).toLocaleString("vi-VN")}**.\n- ${E.mana} **MP +${core.attackManaGain(state)}**, kể cả trượt (tối đa Max MP).\nQuái còn sống sẽ đánh trả.`) +
            preview("attack")
          ).slice(0, 1024),
        },
        {
          name: `${E.defense} Phòng thủ`,
          value:
            state.classKey === "venance"
              ? require("./index").setupPreview("venance").defend
              : defenseDescription(),
        },
      );
      if (classShrineActive(state))
        addTextFields(
          e,
          `${E.shrine} Class Shrine · Bạn`,
          `${SHRINES[state.classKey]} Hết tầng ${state.classShrine.until}.`,
        );
    }
  }

  function buildItems(state, e, sub, page) {
    if (sub === 0) {
      e.addFields({
        name: "Vật tư & vé",
        value: `${E.potion} **Bình: ${state.potions}/${state.maxPotions}**${STAT_SEPARATOR}${E.ticket} **Vé thoát: ${state.escapeTokens}**${STAT_SEPARATOR}${E.prayerTicket} **Vé cầu nguyện: ${state.prayerBoost ? 1 : 0}**${STAT_SEPARATOR}${E.reviveTicket} **Vé hồi sinh: ${state.reviveTickets || 0}**`,
      });
      if (
        covenant.enabled(state) &&
        (covenant.fragmentCount(state) > 0 ||
          covenant.progress(state).completed)
      )
        e.addFields({
          name: `${eventIcon("covenant")} Mảnh Chinh Phạt (${covenant.progress(state).completed ? 4 : covenant.fragmentCount(state)}/4)`,
          value: covenant.progress(state).completed
            ? relicIcon("conquerors_covenant") +
              " Đã hợp nhất thành **Conqueror’s Covenant [LR]**."
            : Object.entries(covenant.FRAGMENTS)
                .map(([key, name]) =>
                  covenant.progress(state).fragments?.[key] != null
                    ? fragmentIcon(key) + " **" + name + "** · Đã có"
                    : fragmentIcon(key) + " " + name + " · Chưa có",
                )
                .join("\n"),
        });
    } else if (sub === 1) {
      if (page === 0 && state.forgeLoans?.length) {
        // Một field duy nhất để nhiều khoản gửi cùng lúc không làm tràn giới hạn embed.
        const lines = state.forgeLoans.map(
          (loan) =>
            `• **${loan.name}** Lv.${loan.level} → **Lv.${loan.level + 2}** · về tầng **${loan.due}** (còn ${Math.max(0, loan.due - state.floor)})`,
        );
        let value = "";
        lines.forEach((line, i) => {
          if ((value + "\n" + line).length > 840 && value) return;
          value += (value ? "\n" : "") + line;
        });
        const shown = value.split("\n").length;
        if (shown < lines.length) value += `\n…và ${lines.length - shown} món nữa.`;
        e.addFields({
          name: `🔨 Đang gửi Horadric Forge (${lines.length})`,
          value:
            value +
            "\nTrong lúc gửi, món không cho chỉ số hay nội tại; khi về được +2 level.",
        });
      }
      for (const item of state.items.slice(page * 5, page * 5 + 5))
        e.addFields({
          name: `${itemIcon(item)} ${item.name} Lv.${item.level} [${rarityLabel(item.rarity)}]`,
          value: dependencies.ownedItemText(state, item).slice(0, 1024),
        });
      if (!state.items.length)
        e.addFields({ name: `${E.backpack} Trang bị`, value: "Chưa có." });
    } else {
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
              passiveIcon(definition.relicPassive.kind) +
              " " +
              formatStatText(definition.text),
          });
      }
      if (!e.data.fields?.length)
        e.addFields({ name: "Set & Di vật", value: "Chưa có set hoặc di vật." });
    }
  }

  function buildEffects(state, e, sub) {
    if (sub === 0) {
      for (const [key, n] of Object.entries(state.modifiers).filter(
        ([, n]) => n > 0,
      ))
        e.addFields({
          name: `${RIFT_ICONS[key] || E.rift} ${world.RIFT_MODIFIERS[key].name} ×${n}${require("../rift").enabled(state) ? " · Bậc " + ["", "I", "II", "III"][require("../rift").tier(n)] : ""}`,
          value: riftModifierText(key, n, state),
        });
      if (!Object.values(state.modifiers).some((count) => count > 0))
        e.addFields({
          name: `${E.rift} Rift modifier`,
          value: "Chưa có Rift modifier.",
        });
    } else if (sub === 1) {
      const specialEffects = [
        paradoxEffectText(state),
        contractEffectText(state),
      ].filter(Boolean);
      if (specialEffects.length)
        addTextFields(e, "Paradox & Khế ước", specialEffects.join("\n"));
      if (classShrineActive(state))
        addTextFields(
          e,
          `${E.shrine} Class Shrine`,
          `${SHRINES[state.classKey]} Hết tầng ${state.classShrine.until}.`,
        );
      for (const field of gilded.fields(state))
        addTextFields(e, field.name, field.value);
      if (!e.data.fields?.length)
        e.addFields({
          name: "Hiệu ứng tạm thời",
          value: "Không có Paradox, Rift Contract, Class Shrine hay ân huệ nào đang hoạt động.",
        });
    } else {
      for (const field of memories.fields(state))
        addTextFields(e, field.name, field.value);
      if (!e.data.fields?.length)
        e.addFields({ name: "Ký ức & dấu ấn", value: "Chưa có ký ức hay dấu ấn nào." });
    }
  }

  function privatePayload(
    state,
    sessionId,
    sourceMessageId,
    tab = "items",
    pageValue = 0,
  ) {
    const subs = SUBS[tab] || null;
    const decoded = decodePage(tab, pageValue);
    const sub = decoded.sub;
    let page = decoded.page;
    const equipmentPaged = tab === "items" && sub === 1;
    let pages = equipmentPaged
      ? Math.max(1, Math.ceil(state.items.length / 5))
      : 1;
    if (equipmentPaged) page = clampPage(page, pages);
    const e = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(
        `SINH TỒN v${state.releaseVersion} · ${{ stats: "CHỈ SỐ", items: "TÚI ĐỒ", effects: "RIFT & HIỆU ỨNG", encounter: "CHI TIẾT" }[tab] || "CHI TIẾT"}`,
      );
    e.setDescription(
      `${stats.CLASSES[state.classKey].emoji} ${stats.CLASSES[state.classKey].name} · Tầng ${state.floor}${subs ? " · " + subs[sub][1] : ""}`,
    );
    if (tab === "stats") buildStats(state, e, sub);
    else if (tab === "items") buildItems(state, e, sub, page);
    else if (tab === "effects") buildEffects(state, e, sub);
    else {
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
    if (!equipmentPaged) {
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
    const topRow = viewTabs(state).map((t) =>
      button(
        prefix + `view_${t}_0:${sourceMessageId}`,
        viewLabel(t, state),
        t === tab ? ButtonStyle.Primary : ButtonStyle.Secondary,
      ),
    );
    const rows = chunkRows(topRow);
    if (subs)
      rows.push(
        ...chunkRows(
          subs.map(([, label], i) =>
            button(
              prefix + `view_${tab}_${encodePage(i, 0)}:${sourceMessageId}`,
              label,
              i === sub ? ButtonStyle.Success : ButtonStyle.Secondary,
            ),
          ),
        ),
      );
    if (pages > 1)
      rows.push(
        ...chunkRows([
          button(
            prefix +
              `page_${tab}_${encodePage(sub, Math.max(0, page - 1))}:${sourceMessageId}`,
            "Trước",
            ButtonStyle.Secondary,
            page === 0,
          ),
          button(
            prefix +
              `page_${tab}_${encodePage(sub, Math.min(pages - 1, page + 1))}:${sourceMessageId}`,
            "Sau",
            ButtonStyle.Secondary,
            page === pages - 1,
          ),
        ]),
      );
    return {
      content: "",
      embeds: [e],
      components: rows,
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
