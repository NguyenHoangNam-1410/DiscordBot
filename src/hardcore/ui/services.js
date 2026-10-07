"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    stats,
    core,
    icon,
    E,
    eventIcon,
    passiveIcon,
    rarityLabel,
    percent,
    money,
    STAT_SEPARATOR,
  } = dependencies;
  const statTransitions = (...args) => dependencies.statTransitions(...args);
  const effectText = (...args) => dependencies.effectText(...args);
  const passiveText = (...args) => dependencies.passiveText(...args);
  const itemText = (...args) => dependencies.itemText(...args);
  const itemEffectChanges = (...args) =>
    dependencies.itemEffectChanges(...args);
  const button = (...args) => dependencies.button(...args);

  function blacksmithText(state, detailed = false) {
    const target = state.items.find(
      (item) => item.definition.id === state.encounter.targetId,
    );
    if (!target)
      return (
        eventIcon("blacksmith") +
        " **Blacksmith**\nKhông còn trang bị để rèn. Chọn **Bỏ qua** để đi tiếp."
      );
    const cost = core.serviceCost(state, 0.12);
    const effects = target.definition.effects;
    const instantKeys = ["heal", "potions", "escapeTokens"];
    const buffs = Object.fromEntries(
      Object.entries(effects).filter(([key]) => !instantKeys.includes(key)),
    );
    const instant = Object.fromEntries(
      Object.entries(effects).filter(([key]) => instantKeys.includes(key)),
    );
    const curseLevels = Math.max(
      0,
      target.level - (target.cleansedLevels || 0),
    );
    const lines = [
      eventIcon("blacksmith") +
        " **Blacksmith** · Rèn thêm **1 cấp** cho trang bị.",
      E.backpack +
        " **" +
        target.name +
        " [" +
        rarityLabel(target.rarity) +
        "]** · Lv." +
        target.level +
        " → **Lv." +
        (target.level + 1) +
        "**",
      Object.keys(buffs).length
        ? "**Buff trang bị:**\n" +
          itemEffectChanges(buffs, target.level, target.level + 1)
        : "",
    ].filter(Boolean);
    if (Object.keys(instant).length)
      lines.push(
        "**Nhận khi rèn:** " +
          effectText(instant) +
          ". Áp dụng giới hạn và hiệu ứng hồi phục hiện tại.",
      );
    if (target.definition.curse)
      lines.push(
        curseLevels
          ? "☣️ **Lời nguyền:**\n" +
              itemEffectChanges(
                target.definition.curse.effects,
                curseLevels,
                curseLevels + 1,
              )
          : "☣️ **Đã giải toàn bộ nguyền:** rèn không thêm lời nguyền.",
      );
    lines.push(
      "**Giá:** " +
        E.coin +
        " **" +
        money(cost) +
        " xu** (12% payout hiện tại).",
    );
    if (detailed) {
      const passive = passiveText(target.definition).trim();
      if (passive) lines.push("**Nội tại giữ nguyên:**\n" + passive);
      lines.push(
        "Cần đủ payout hiện tại để trả phí. **Bỏ qua:** giữ nguyên trang bị và payout.",
      );
    } else {
      lines.push("Xem **Chi tiết** để đọc nội tại và điều kiện rèn.");
    }
    return lines.join("\n");
  }

  function purifierText(state, detailed = false) {
    const target = state.items.find(
      (item) => item.definition.id === state.encounter.targetId,
    );
    const curseLevels = target
      ? Math.max(0, target.level - (target.cleansedLevels || 0))
      : 0;
    if (!target?.definition.curse || !curseLevels)
      return (
        eventIcon("purifier") +
        " **Purifier**\nTrang bị không còn lời nguyền cần giải. Chọn **Bỏ qua** để đi tiếp."
      );
    const preview = structuredClone(state);
    preview.items.find(
      (item) => item.definition.id === target.definition.id,
    ).cleansedLevels = target.level;
    stats.recompute(preview);
    const changes = statTransitions(state, preview, true, { empty: true });
    const capacity =
      state.maxPotions !== preview.maxPotions
        ? passiveIcon("potionCapacity") +
          " **Sức chứa bình**: " +
          state.maxPotions +
          " → **" +
          preview.maxPotions +
          "**"
        : "";
    const lines = [
      eventIcon("purifier") +
        " **Purifier** · Giải toàn bộ lời nguyền của **1 trang bị**.",
      E.backpack +
        " **" +
        target.name +
        " [" +
        rarityLabel(target.rarity) +
        "] · Lv." +
        target.level +
        "**",
      "**Lời nguyền sẽ gỡ · " +
        curseLevels +
        " cấp chưa giải:**\n" +
        itemEffectChanges(target.definition.curse.effects, curseLevels, 0),
    ];
    const statChanges = [changes, capacity]
      .filter(Boolean)
      .join(STAT_SEPARATOR);
    if (statChanges)
      lines.push(
        "**Chỉ số của bạn sau giải nguyền:**\n- " +
          statChanges.split(STAT_SEPARATOR).join("\n- "),
      );
    lines.push(
      "**Giữ nguyên:** độ hiếm " +
        rarityLabel(target.rarity) +
        ", Lv." +
        target.level +
        ", buff và nội tại.",
      "**Giá:** " +
        E.coin +
        " **" +
        money(core.purifierCost(state)) +
        " xu** (" +
        percent(core.PURIFIER_COST_RATE) +
        " payout hiện tại).",
    );
    if (detailed) {
      const buffs = Object.fromEntries(
        Object.entries(target.definition.effects).filter(
          ([key]) => !["heal", "potions", "escapeTokens"].includes(key),
        ),
      );
      if (Object.keys(buffs).length)
        lines.push("**Buff giữ nguyên:** " + effectText(buffs, target.level));
      const passive = passiveText(target.definition).trim();
      if (passive) lines.push("**Nội tại giữ nguyên:**\n" + passive);
      lines.push(
        "Không nhận lại HP hồi, bình máu hoặc vé khi nhặt đồ. Nguyền của trang bị khác vẫn còn hiệu lực. Cần đủ payout hiện tại để trả phí. **Bỏ qua:** giữ nguyên trang bị và payout.",
      );
    } else {
      lines.push(
        "Xem **Chi tiết** để đọc buff, nội tại và điều kiện giải nguyền.",
      );
    }
    return lines.join("\n");
  }

  function merchantOffer(offer) {
    if (offer.item)
      return {
        name: `${E.backpack} ${offer.item.name} [${rarityLabel(offer.item.rarity)}]`,
        detail: itemText(offer.item),
        button: offer.item.name,
        icon: E.backpack,
      };
    return (
      {
        potion: {
          name: `${E.potion} Bình máu`,
          detail: `+1 ${E.potion} bình máu (theo giới hạn bình của bạn).`,
          button: "Bình máu",
          icon: E.potion,
        },
        heal: {
          name: `${E.hp} Hồi đầy HP`,
          detail: `Hồi đầy ${E.hp} HP.`,
          button: "Hồi đầy HP",
          icon: E.hp,
        },
        luck: {
          name: `${E.luck} LUCK +1`,
          detail: `${E.luck} **LUCK** +1.`,
          button: "+1 LUCK",
          icon: E.luck,
        },
        ticket: {
          name: `${E.ticket} Vé thoát`,
          detail: `${E.ticket} **Vé thoát +1** (tối đa 1); tự dùng khi bỏ chạy RNGesus thất bại.`,
          button: "Vé thoát",
          icon: E.ticket,
        },
        chest: {
          name: `${E.chest} Rương thường`,
          detail: `Mua sẽ mở ngay. Tỷ lệ và bảo hiểm như hòm thường; có thể rỗng, giả hoặc gặp Mimic.\n${Object.entries(
            offer.chest?.odds || {},
          )
            .filter(([, chance]) => chance > 0)
            .map(
              ([key, chance]) =>
                `- **${percent(chance)}:** ${{ ancient_mimic: "Ancient Mimic", mimic: "Mimic", legendary: "SSR", cursed: "UR: trang bị có nguyền hoặc Vé thoát", rare: "SR", common: "R", empty: "Rỗng", fake: "Đồ giả" }[key]}`,
            )
            .join("\n")}`,
          button: "Rương · mở ngay",
          icon: E.chest,
        },
      }[offer.key] || {
        name: `${E.backpack} Vật phẩm`,
        detail: "",
        button: "Vật phẩm",
        icon: E.backpack,
      }
    );
  }

  function shopCurrency(kind) {
    return kind === "blood_shop"
      ? `${E.hp} Max HP`
      : kind === "diamond_shop"
        ? `${icon("gem", "💎")} kim cương`
        : `${icon("coin", "🪙")} xu payout`;
  }

  function shopPrice(kind, offer) {
    return kind === "blood_shop"
      ? percent(core.BLOOD_PRICES[offer.item.rarity]) +
          " " +
          E.hp +
          " Max HP (−" +
          money(offer.price) +
          ")"
      : money(offer.price) + " " + shopCurrency(kind);
  }

  function chestPityText(state, chest, detailed = false) {
    const guaranteed = chest.guaranteed;
    const rare = guaranteed
      ? "**Hòm này bảo đảm SR trở lên, không có Mimic.**"
      : `Đã mở **${state.pityRare || 0} hòm** liên tiếp chưa nhận SR trở lên; sau 5 lần trượt, **hòm kế tiếp** bảo đảm SR+.`;
    if (!detailed) return `**Bảo hiểm hòm:** ${rare}`;
    const ssr =
      chest.name === "Treasure Chest"
        ? "Kho báu dùng tỷ lệ SSR riêng, không nhận bonus tăng tỷ lệ SSR từ pity."
        : `Đã mở **${state.pityLegendary || 0} hòm** liên tiếp chưa nhận SSR. Từ 10 lần trượt, tỷ lệ SSR tăng dần, **không bảo đảm ra SSR ở hòm thứ 10**; xem tỷ lệ hiện tại ở trên.`;
    return `**Bảo hiểm SR+:** ${rare}\n**SSR:** ${ssr}\nBộ đếm tính kết quả mở hòm; đồ từ quái/event khác không đặt lại bộ đếm này.`;
  }
  return {
    blacksmithText,
    purifierText,
    merchantOffer,
    shopCurrency,
    shopPrice,
    chestPityText,
  };
};
