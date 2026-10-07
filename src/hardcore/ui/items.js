"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    itemCurses,
    itemPassives,
    royal,
    core,
    E,
    effectStatLabel,
    passiveIcon,
    ticketIcon,
    percent,
    highlightStat,
    formatStatText,
    STAT_SEPARATOR,
  } = dependencies;

  function effectText(effects, level = 1, { compactCurses = false } = {}) {
    const percentages = [
      "critChance",
      "potionPower",
      "bossDamage",
      "eliteDamage",
      "mimicDetection",
      "goblinChance",
      "legendaryFind",
      "floorHpLoss",
      "mimicChance",
      "damageTaken",
    ];
    return (
      Object.entries(effects)
        .map(([key, value]) => {
          const curseText = itemCurses.describeEffect(
            key,
            value,
            level,
            compactCurses,
          );
          if (curseText) return formatPassiveText(curseText);
          if (key === "defenseSet") return `${E.defense} **DEF** = 0`;
          if (key === "bonusPenalty")
            return `${highlightStat(effectStatLabel(key))} ×${(1 - value).toFixed(2)} mỗi cấp chưa giải`;
          if (key === "potions")
            return `${E.potion} **Bình máu** +${value} khi nhận mỗi cấp`;
          if (key === "escapeTokens")
            return `${E.ticket} **Vé thoát** +${value} khi nhận mỗi cấp (giữ tối đa 1)`;
          if (key === "heal")
            return `${E.hp} **HP** +${value} (hồi khi nhận mỗi cấp)`;
          const n = value * level;
          if (key === "floorHpLoss")
            return `${E.floorHpLoss} **HP mất/tầng:** cuối tầng giảm HP hiện tại một lượng bằng ${percent(n)} Max HP (luôn còn ít nhất 1 HP)`;
          return `${highlightStat(effectStatLabel(key))} ${n > 0 ? "+" : ""}${percentages.includes(key) ? percent(n) : Math.round(n * 100) / 100}`;
        })
        .join(STAT_SEPARATOR) || "Không có"
    );
  }

  function formatPassiveText(text) {
    const names = {
      "Cuồng chiến": "berserk",
      "Hút MP": "mpLeech",
      "Phản đòn": "guardReflect",
      "Phản thủ": "guardReflect",
      Gai: "thorns",
      "Thương lượng": "shopDiscount",
      "May mắn sự kiện": "eventLuck",
      "May mắn event": "eventLuck",
      "Túi bình": "potionCapacity",
      "Trần chí mạng": "critCap",
      "Trần CRIT": "critCap",
      "Trần né": "evasionCap",
      "Né phản kích": "dodgeCounter",
      "Khởi động MP": "startMana",
      "Nghỉ chân": "campHeal",
      "Tiết kiệm bình": "potionSave",
      "Chống bẫy": "trapResistance",
      "Tiên tri": "foresight",
    };
    return text
      .split("\n")
      .map((line) => {
        const name = Object.keys(names).find(
          (name) =>
            line.startsWith(name) && /^[ :·]/.test(line.slice(name.length)),
        );
        return name
          ? `${passiveIcon(names[name])} **${name}**${formatStatText(line.slice(name.length))}`
          : formatStatText(line);
      })
      .join("\n");
  }

  function passiveText(item) {
    const text = itemPassives.describe(itemPassives.forItem(item));
    return text ? "\n" + formatPassiveText(text) : "";
  }

  function itemText(item, level = 1) {
    if (item.category === "consumable")
      return `${ticketIcon(item.id)} **Vật phẩm:** ${item.text}`;
    return `${effectText(item.effects, level)}${passiveText(item)}${item.curse ? `\n☣️ Curse: ${effectText(item.curse.effects, level)}` : ""}`;
  }

  function itemEffectChanges(effects, beforeLevel, afterLevel) {
    return Object.entries(effects)
      .map(([key, value]) => {
        const label = highlightStat(effectStatLabel(key));
        const describe = (level) =>
          key === "bonusPenalty"
            ? label + " ×" + Math.pow(1 - value, level).toFixed(3)
            : effectText({ [key]: value }, level, { compactCurses: true });
        const before = describe(beforeLevel);
        if (afterLevel === 0) return "- " + before + " → **Đã gỡ**";
        const after = describe(afterLevel);
        if (before === after) return "- " + after + " (không đổi)";
        const prefix = label + " ";
        return before.startsWith(prefix) && after.startsWith(prefix)
          ? "- " +
              label +
              ": " +
              before.slice(prefix.length) +
              " → **" +
              after.slice(prefix.length) +
              "**"
          : "- " + before + " → **" + after.replace(/\*\*/g, "") + "**";
      })
      .join("\n");
  }

  function setProgressFields(state) {
    if (!royal.enabled(state)) return [];
    const definitions = Object.values(core.ITEMS).flat();
    return Object.entries(royal.SETS).map(([id, set]) => {
      const members = set.ids.map((key) =>
        state.items.find((i) => i.definition.id === key && i.level > 0),
      );
      const count = members.filter(Boolean).length;
      const cursed = members.some(
        (i) => i?.definition.curse && i.level > (i.cleansedLevels || 0),
      );
      const exchanged = (state.relics || []).some((r) => r.id === id);
      const status = exchanged
        ? "💠 Đã quy đổi."
        : royal.ended(state)
          ? state.royalInvitation.status === "declined"
            ? "Thư mời đã từ chối."
            : "Đã dùng lượt quy đổi trong run."
          : cursed
            ? "☣️ UR còn nguyền; cần giải trước khi quy đổi."
            : royal.eligible(state).includes(id)
              ? "✅ Đủ set, sẵn sàng nhận thư mời."
              : "";
      return {
        name:
          (id === "kingslayers_testament" ? "👑" : "✨") +
          " Set " +
          set.name +
          " (" +
          count +
          "/5)",
        value:
          "→ **" +
          core.RELIC_ITEMS[id].name +
          " [LR]**\n" +
          set.ids
            .map((key, n) => {
              const item = members[n];
              const name =
                item?.name ||
                definitions.find((d) => d.id === key)?.name ||
                key;
              return (
                (item ? "✅ " : "▫️ ") +
                name +
                (item?.definition.curse &&
                item.level > (item.cleansedLevels || 0)
                  ? " ☣️"
                  : "")
              );
            })
            .join(STAT_SEPARATOR) +
          (status ? "\n" + status : ""),
      };
    });
  }

  function equipmentSummary(state) {
    if (!state.items.length) return "Chưa có trang bị.";
    const totals = {};
    const add = (effects, levels) => {
      if (levels <= 0) return;
      for (const [key, value] of Object.entries(effects || {})) {
        if (["heal", "potions", "escapeTokens", "bonusPenalty"].includes(key))
          continue;
        if (key === "defenseSet") {
          if (levels > 0) totals[key] = value;
        } else totals[key] = (totals[key] || 0) + value * levels;
      }
    };
    for (const item of state.items) {
      add(item.definition.effects, item.level);
      add(
        item.definition.curse?.effects,
        Math.max(0, item.level - (item.cleansedLevels || 0)),
      );
    }
    const active = Object.fromEntries(
      Object.entries(totals).filter(
        ([key, value]) => key === "defenseSet" || value !== 0,
      ),
    );
    return Object.keys(active).length
      ? effectText(active, 1, { compactCurses: true })
      : "Không có chỉ số cộng thêm.";
  }
  return {
    effectText,
    formatPassiveText,
    passiveText,
    itemText,
    itemEffectChanges,
    equipmentSummary,
    setProgressFields,
  };
};
