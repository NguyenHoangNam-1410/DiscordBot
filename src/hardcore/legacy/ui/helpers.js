// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    formatCoins,
    shrineOutcomes,
    surpriseOdds,
    FIXED_SURPRISES,
    rarityLabel,
    STAT_EMOJI,
    icon,
    percentText,
  } = dependencies;

  function healthBar(hp, maxHp) {
    const maximum = Math.max(0, Number(maxHp) || 0);
    const current = Math.max(0, Math.min(maximum, Number(hp) || 0));
    const ratio = maximum > 0 ? current / maximum : 0;
    const segments = 10;
    const filled =
      ratio >= 1
        ? segments
        : ratio > 0
          ? Math.max(1, Math.min(segments - 1, Math.round(ratio * segments)))
          : 0;
    return `${STAT_EMOJI.hp} HP \`${"█".repeat(filled)}${"░".repeat(segments - filled)}\` **${formatCoins(current)}/${formatCoins(maximum)}**`;
  }

  // Tỷ lệ loại hòm được lưu lúc tạo (hòm của run cũ không có thì bỏ qua).
  function chestChanceLines(chest) {
    const odds = chest.odds;
    if (!odds) return "";
    const mimic = (odds.mimic || 0) + (odds.ancient_mimic || 0);
    const rows = [
      ["🟢", `Đồ ${rarityLabel("legendary")}`, odds.legendary],
      ["🟢", `Đồ ${rarityLabel("rare")}`, odds.rare],
      ["🟢", `Đồ ${rarityLabel("common")}`, odds.common],
      [
        "🟡",
        `Đồ ${rarityLabel("cursed")} (mạnh nhưng kèm nguyền rủa)`,
        odds.cursed,
      ],
      [
        "🔴",
        `Mimic — phải chiến đấu${odds.ancient_mimic > 0 ? ` (gồm Mimic cổ đại ${percentText(odds.ancient_mimic)})` : ""}`,
        mimic,
      ],
      ["🔴", "Hòm trống", odds.empty],
      ["🔴", "Đồ SSR giả (không có chỉ số)", odds.fake_legendary],
    ].filter(([, , chance]) => chance > 0.0005);
    const share = (marks) =>
      rows
        .filter(([mark]) => marks.includes(mark))
        .reduce((sum, [, , chance]) => sum + chance, 0);
    return `Tỷ lệ khi **Mở**:\n${rows
      .map(
        ([mark, label, chance]) =>
          `${mark} **${percentText(chance)}** · ${label}`,
      )
      .join(
        "\n",
      )}\n**Tổng:** 🟢 có lợi ${percentText(share("🟢"))} · 🟡 đánh đổi ${percentText(share("🟡"))} · 🔴 bất lợi ${percentText(share("🔴"))}\n🔍 Kiểm tra: phát hiện Mimic (nếu có) **${percentText(odds.detect)}**.\n`;
  }

  // Tỷ lệ kết quả của sự kiện bí ẩn: loại có may rủi liệt kê từng lựa chọn, loại còn lại ghi rõ là cố định.
  function surpriseChanceLines(state, event) {
    const sections = surpriseOdds(state, event);
    if (!sections)
      return FIXED_SURPRISES.includes(event.kind)
        ? "\n🎯 **Không có may rủi:** kết quả cố định như mô tả."
        : "";
    const mark = { good: "🟢", mixed: "🟡", bad: "🔴" };
    return `\n🎲 **Tỷ lệ kết quả**\n${sections
      .map(
        (section) =>
          `**${section.title}**\n${section.outcomes
            .map(
              (item) =>
                `${mark[item.tone]} **${percentText(item.chance)}** · ${item.text}`,
            )
            .join("\n")}`,
      )
      .join("\n")}`;
  }

  function shrineChanceLines(state) {
    const outcomes = shrineOutcomes(state);
    const share = (tone) =>
      Math.round(
        outcomes
          .filter((item) => item.tone === tone)
          .reduce((sum, item) => sum + item.chance, 0) * 100,
      );
    const mark = { good: "🟢", mixed: "🟡", bad: "🔴" };
    const percent = (value) => `${(value * 100).toFixed(1).replace(".", ",")}%`;
    return `${outcomes
      .map(
        (item) =>
          `${mark[item.tone]} **${percent(item.chance)}** · ${item.text}`,
      )
      .join(
        "\n",
      )}\n**Tổng:** 🟢 có lợi ${share("good")}% · 🟡 đánh đổi ${share("mixed")}% · 🔴 gây hại ${share("bad")}%.`;
  }

  function rankLabel(rank) {
    return (
      {
        normal: "Thường",
        champion: "Champion",
        elite: "Elite",
        boss: "BOSS",
        final_boss: "BOSS CUỐI",
        mimic: "Mimic",
        ancient_mimic: "Ancient Mimic",
      }[rank] || rank
    );
  }

  function chaosLabel(state) {
    const chance = state.lastChaosChance || 0;
    if (!chance) return `${icon("large_green_circle")} Chaos: Yên`;
    if (chance < 0.01) return `${icon("large_green_circle")} Chaos: Thấp`;
    if (chance < 0.03) return `${icon("large_yellow_circle")} Chaos: Bất ổn`;
    return `${icon("red_circle")} Chaos: NGUY HIỂM`;
  }

  function signed(value, percent = false) {
    const amount = percent ? Math.round(value * 100) : value;
    return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${formatCoins(Math.abs(amount))}${percent ? "%" : ""}`;
  }

  function change(state, key, percent = false) {
    const amount = state.lastStatChanges?.[key] || 0;
    return amount ? ` (${signed(amount, percent)})` : "";
  }
  return {
    healthBar,
    chestChanceLines,
    surpriseChanceLines,
    shrineChanceLines,
    rankLabel,
    chaosLabel,
    signed,
    change,
  };
};
