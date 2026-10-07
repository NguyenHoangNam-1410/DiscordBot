// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    ActionRowBuilder,
    ButtonStyle,
    EmbedBuilder,
    formatCoins,
    baseMultiplier,
    potentialPayout,
    runDiamondReward,
    luckyBreakChance,
    itemEffects,
    itemCurse,
    classShrineActive,
    CLASS_SHRINE_TEXT,
    RIFT_MODIFIERS,
    rarityLabel,
    effectText,
    STAT_EMOJI,
    icon,
    CLASS_PROFILES,
    DETAIL_TABS,
  } = dependencies;
  const change = (...args) => dependencies.change(...args);
  const encounterText = (...args) => dependencies.encounterText(...args);
  const statLine = (...args) => dependencies.statLine(...args);
  const ownedEquipment = (...args) => dependencies.ownedEquipment(...args);
  const equipmentSummary = (...args) => dependencies.equipmentSummary(...args);
  const riftSummary = (...args) => dependencies.riftSummary(...args);
  const button = (...args) => dependencies.button(...args);

  function detailButtons(
    sessionId,
    turn,
    originMessageId = null,
    selected = null,
    itemCount = 0,
  ) {
    return new ActionRowBuilder().addComponents(
      DETAIL_TABS.map(([tab, label, emoji]) =>
        button(
          sessionId,
          turn,
          `view_${tab}_0${originMessageId ? `:${originMessageId}` : ""}`,
          tab === "items" ? `${label} (${itemCount})` : label,
          emoji,
          tab === selected ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
      ),
    );
  }

  function hardcorePrivatePayload(
    state,
    classes,
    itemCatalog,
    sessionId,
    originMessageId,
    tab,
    requestedPage = 0,
  ) {
    const owned = ownedEquipment(state, itemCatalog);
    const pageSize = 5;
    const modifiers = Object.entries(state.modifiers || {}).filter(
      ([, stacks]) => stacks > 0,
    );
    const effectsPageSize = 4;
    const pages =
      tab === "items"
        ? Math.max(1, Math.ceil(owned.length / pageSize))
        : tab === "effects"
          ? Math.ceil(
              (5 +
                Math.max(1, modifiers.length) +
                (state.contract ? 1 : 0) +
                (classShrineActive(state) ? 1 : 0)) /
                effectsPageSize,
            )
          : 1;
    const page = Math.max(0, Math.min(pages - 1, requestedPage));
    const title = DETAIL_TABS.find(([key]) => key === tab)?.[1] || "Chi tiết";
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`SINH TỒN · ${title.toUpperCase()}`)
      .setDescription(
        `${classes[state.classKey].emoji} **${classes[state.classKey].name}** · Tầng ${state.floor}`,
      )
      .setFooter({
        text: `Mã ván: ${sessionId} • Lượt ${state.turn} • Trang ${page + 1}/${pages}`,
      });
    if (tab === "items") {
      embed.addFields({
        name: "🎒 Vật tư còn lại",
        value: `${STAT_EMOJI.potions} **Bình máu ×${state.potions || 0}** · Hồi ${Math.round(Math.max(0.1, Math.min(0.75, 0.35 + (state.potionPower || 0))) * 100)}% MAX HP, tối thiểu 20 HP; quái còn sống phản công.\n${STAT_EMOJI.tickets} **Vé thoát ×${state.escapeTokens || 0}** · Tối đa 1, nhận thêm bị bỏ. Dùng để vượt RNGesus hoặc tự dùng khi chạy thất bại; chạy thành công giữ vé.`,
      });
      embed.addFields({
        name: "🎒 Tổng hiệu ứng trang bị",
        value: equipmentSummary(state, itemCatalog),
      });
      if (!owned.length)
        embed.addFields({
          name: "Vật phẩm",
          value: "Chưa có trang bị trong run.",
        });
      for (const item of owned.slice(
        page * pageSize,
        page * pageSize + pageSize,
      )) {
        const d = item.definition;
        const curses = Math.max(0, item.level - (item.cleansedLevels || 0));
        const buff = { ...itemEffects(d) };
        if (item.rarity === "cursed" && !d?.effects)
          for (const key of Object.keys(itemCurse(d))) delete buff[key];
        const effects = d
          ? effectText(buff, item.level)
          : item.text || "Không rõ tác dụng";
        const curse =
          item.rarity === "cursed" && Object.keys(itemCurse(d)).length
            ? `\n☣️ ${curses ? `${effectText(itemCurse(d), curses)} · ${curses} lớp curse` : "Đã giải hết lời nguyền"}`
            : "";
        embed.addFields({
          name: `${item.name} · Lv.${item.level} [${rarityLabel(item.rarity)}]`.slice(
            0,
            180,
          ),
          value:
            `${d?.base ? `*${String(d.base).slice(0, 100)}*\n` : ""}${effects}${curse}`.slice(
              0,
              650,
            ),
        });
      }
      embed.addFields({
        name: "ℹ️ Cách đọc",
        value:
          "Tổng các lần cộng chỉ số từ trang bị. Giới hạn chí mạng/kháng phép, hiệu ứng đặt lại 🛡️ và sự kiện khác có thể thay đổi chỉ số hiện tại. 🧪/🎫/hồi ❤️ đã nhận khi nhặt; không phải thưởng mỗi lượt. Trang bị chỉ tồn tại trong run.",
      });
    } else if (tab === "stats") {
      embed.addFields(
        {
          name: "📊 Chỉ số hiện tại · thay đổi lượt vừa rồi",
          value: statLine(state),
        },
        {
          name: "🎒 Vật tư",
          value: `${STAT_EMOJI.potions} POT ${state.potions}${change(state, "potions")} · ${STAT_EMOJI.tickets} ${state.escapeTokens}${change(state, "escapeTokens")} · ${STAT_EMOJI.crit} CRIT DMG ×${state.critDamage || 1.75}`,
        },
        {
          name: "📖 Ký hiệu",
          value:
            "❤️ HP: máu · ⚔️ ATK: sức tấn công\n🛡️ DEF: phòng thủ · 🔮 RES: kháng phép\n🎯 ACC: chính xác · 💨 EVA: né tránh\n💥 CRIT: tỷ lệ chí mạng · CRIT DMG: hệ số chí mạng\n✨ ENE: năng lượng · 🍀 LUCK: may mắn\n🧪 POT: bình máu · DMG: sát thương thực tế sau giảm trừ",
        },
        {
          name: `✨ ${classes[state.classKey].skill} · tốn 2 ✨`,
          value: CLASS_PROFILES[state.classKey].effect,
        },
        {
          name: "⚔️ Giao tranh",
          value:
            "Tấn công/thủ hồi 1 ENE. Thủ: DEF ×2, miễn chí mạng, giảm thêm 40% phản công. Bình hồi 35% MAX HP + Potion Power (10–75%), ít nhất 20; quái còn sống phản công. Giảm vật lý tối đa 75%; RES −50..75%; trúng 20..95%.",
        },
        {
          name: "🎒 Hiệu ứng item hiệu dụng",
          value: effectText(
            Object.fromEntries(
              [
                "potionPower",
                "bossDamage",
                "eliteDamage",
                "mimicDetection",
                "goblinChance",
                "legendaryFind",
                "floorHpLoss",
                "mimicChance",
                "damageTaken",
              ]
                .filter((key) => state[key])
                .map((key) => [key, state[key]]),
            ),
            1,
          ).replace("Không rõ tác dụng", "Chưa có hiệu ứng bổ sung."),
        },
      );
    } else if (tab === "effects") {
      const effectFields = [];
      effectFields.push({
        name: "🎒 Trang bị",
        value: equipmentSummary(state, itemCatalog),
      });
      effectFields.push({
        name: `${icon("cyclone")} Tổng hiệu ứng Rift`,
        value: riftSummary(state),
      });
      effectFields.push({
        name: "ℹ️ Áp dụng",
        value:
          "Nhận một cộng dồn sau mỗi 10 tầng đã vượt; đủ tám loại trước khi lặp. HP/DEF/ATK/ACC/EVA được tính vào quái khi xuất hiện. Bloodlust, Soul Drain và Cursed Ground xử lý theo đòn đánh; Unstable Rift tác động lần roll hòm/encounter. Chỉ số làm tròn xuống và các giới hạn vẫn áp dụng; mở bảng này không roll lại.",
      });
      for (const [key, stacks] of modifiers)
        effectFields.push({
          name: `${icon("cyclone")} ${RIFT_MODIFIERS[key]?.name || key} ×${stacks}`.slice(
            0,
            256,
          ),
          value: RIFT_MODIFIERS[key]?.text || "Không rõ tác dụng",
        });
      if (!modifiers.length)
        effectFields.push({
          name: `${icon("cyclone")} Rift`,
          value:
            "Chưa có modifier. Nhận thêm mỗi 10 tầng; đủ tám loại trước khi lặp.",
        });
      const curseFactor = owned.reduce(
        (factor, item) =>
          factor *
          (1 - (itemCurse(item.definition).bonusPenalty || 0)) **
            Math.max(0, item.level - (item.cleansedLevels || 0)),
        1,
      );
      effectFields.push(
        {
          name: "💰 Payout",
          value: `Có thể rút: **${formatCoins(potentialPayout(state))} xu**\n💎 Tạm giữ: **${formatCoins(runDiamondReward(state))}** kim cương. Vượt 100: 100; mỗi 100 tầng tiếp theo nhân đôi; hạ boss 999: 51.200. Rút thưởng mới nhận; chết mất hết.\nHệ số tầng/checkpoint ×${baseMultiplier(state).toFixed(2)} · hệ số phạt ×${Number(state.payoutFactor).toFixed(3)}\nUR còn nguyền: −${Math.round((1 - curseFactor) * 100)}% · Wrong Portal: −${Math.round((1 - (state.portalPayoutFactor || 1)) * 100)}%\nĐã trừ từ payout: ${formatCoins(state.payoutSpent || 0)} xu, gồm ${formatCoins(state.payoutTaxSpent || 0)} xu thuế. Thuế/Goblin trừ một lần vào số xu hiện tại; hối lộ nhân hệ số payout.\nMốc 5/50/100: ×1,45/×5,50/×12,00; hệ số dừng sau 100, bonus tiếp tục tăng. Trần 10.000.000 xu.`,
        },
        {
          name: "🍀 Lucky Break",
          value: `${Math.round(luckyBreakChance(state) * 1000) / 10}% = min(30%, LUCK ×1,5%). Tránh Tax Collector hoặc Potion Thief; không tác động Wrong Portal.`,
        },
      );
      if (state.contract)
        effectFields.push({
          name: "📜 Rift Contract",
          value: `Không dùng **${{ potion: "bình", skill: "skill", defend: "phòng thủ" }[state.contract.kind]}** · còn ${state.contract.remaining} tầng. Vi phạm chỉ hủy thưởng.`,
        });
      if (classShrineActive(state))
        effectFields.push({
          name: "✨ Class Shrine",
          value: `${CLASS_SHRINE_TEXT[state.classKey]} Hết hiệu lực sau tầng ${state.classShrine.until}.`,
        });
      embed.addFields(
        effectFields.slice(
          page * effectsPageSize,
          (page + 1) * effectsPageSize,
        ),
      );
    } else {
      embed.setDescription(
        `${embed.data.description}\n\n${encounterText(state)}`.slice(0, 4096),
      );
      embed.addFields({
        name: "📜 Diễn biến đầy đủ",
        value: String(state.lastLog || "—").slice(0, 1024),
      });
      if (state.encounter.kind === "wrong_portal")
        embed.addFields({
          name: `${icon("cyclone")} Đích đến có thể gặp`,
          value: `${Math.round((state.encounter.portal?.goodChance ?? 0.5) * 100)}% tốt, chọn đều: +10 MAX HP, hồi đầy, +1 bình (tối đa 5); bonus +50% cược; hoặc +4 DEF/+5 RES/+1 LUCK.\nCòn lại là nhánh xấu: mất tối đa 15% MAX HP nhưng giữ ít nhất 1; ENE về 0; mất tối đa 2 bình; payout ×0,9; hoặc −5 DEF/RES. Sau đó Elite đánh phủ đầu; hạ nó mới qua tầng. LUCK không tác động Portal; kết quả giấu trước khi chấp nhận.`,
        });
    }
    const components = [
      detailButtons(sessionId, state.turn, originMessageId, tab, owned.length),
    ];
    if (pages > 1)
      components.push(
        new ActionRowBuilder().addComponents(
          button(
            sessionId,
            state.turn,
            `page_${tab}_${Math.max(0, page - 1)}:${originMessageId}`,
            "Trước",
            "arrow_left",
            ButtonStyle.Secondary,
            page === 0,
          ),
          button(
            sessionId,
            state.turn,
            `page_${tab}_${page + 1}:${originMessageId}`,
            "Sau",
            "arrow_right",
            ButtonStyle.Secondary,
            page === pages - 1,
          ),
        ),
      );
    return {
      content: "",
      embeds: [embed],
      components,
      allowedMentions: { parse: [] },
    };
  }
  return { detailButtons, hardcorePrivatePayload };
};
