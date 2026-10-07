"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    stats,
    core,
    E,
    eventIcon,
    passiveIcon,
    ticketIcon,
    rarityLabel,
    percent,
    money,
    STAT_SEPARATOR,
  } = dependencies;
  const statTransitions = (...args) => dependencies.statTransitions(...args);
  const effectText = (...args) => dependencies.effectText(...args);
  const itemEffectChanges = (...args) =>
    dependencies.itemEffectChanges(...args);

  function turnText(state) {
    const details = [];
    const purified = state.lastPurifiedItem;
    if (purified) {
      details.push(
        eventIcon("purifier") +
          " **Đã giải nguyền:** " +
          E.backpack +
          " **" +
          purified.name +
          " [" +
          rarityLabel(purified.rarity) +
          "] · Lv." +
          purified.level +
          "**\n" +
          itemEffectChanges(purified.curseEffects, purified.curseLevels, 0),
      );
      if (purified.maxPotionsBefore !== purified.maxPotionsAfter)
        details.push(
          passiveIcon("potionCapacity") +
            " **Sức chứa bình**: " +
            purified.maxPotionsBefore +
            " → **" +
            purified.maxPotionsAfter +
            "**",
        );
    }
    const received = state.lastReceivedItems || [];
    const receivedTitles = received.map(
      (item) =>
        `${item.upgradedFromLevel != null ? eventIcon("blacksmith") + " **Rèn:** " : ""}${item.consumable ? ticketIcon(item.definition.id) : E.backpack} **${item.name} [${rarityLabel(item.rarity)}]**${item.consumable ? " · Vật phẩm" : ` · ${item.upgradedFromLevel != null ? `Lv.${item.upgradedFromLevel} → **Lv.${item.level}**` : `**Lv.${item.level}**`}`}`,
    );
    if (state.lastUpgrade)
      details.push(
        `${E.checkpoint} **Tăng điểm checkpoint:**\n- ${statTransitions(state.lastUpgrade.before, state.lastUpgrade.after).split(STAT_SEPARATOR).join("\n- ")}`,
      );
    const receipt = state.lastEventResult;
    const itemDirectKeys = [
      ...new Set(
        received
          .filter((item) => item.inEventResult !== false)
          .flatMap(
            (item) =>
              item.directKeys ||
              core.effectStatKeys({
                ...item.definition.effects,
                ...(item.curseLevels ? item.definition.curse?.effects : {}),
              }),
          ),
      ),
    ];
    const directKeys = receipt?.directKeys || [
      ...stats.ATTRIBUTES,
      "hp",
      "mana",
      "potions",
      "escapeTokens",
      "luck",
    ];
    const eventDirect = receipt
      ? statTransitions(receipt.before, receipt.after, true, {
          only: directKeys,
          exclude: itemDirectKeys,
          empty: true,
        })
      : "";
    if (receipt) {
      const sourceIcon = eventIcon(
        ["surprise", "trap"].includes(receipt.type)
          ? receipt.kind ||
              Object.keys(core.EVENT_NAMES).find(
                (key) => core.EVENT_NAMES[key] === receipt.name,
              ) ||
              receipt.type
          : receipt.type,
      );
      if (eventDirect)
        details.push(
          `${sourceIcon} **${receipt.name || "Sự kiện"}:** ${eventDirect}`,
        );
    }
    received.forEach((item, index) => {
      if (item.consumable) {
        details.push(
          `${receivedTitles[index]}: nhận **${item.quantity} vé**${item.discarded ? `; bỏ **${item.discarded} vé dư** (tối đa 1)` : ""}. Không tăng level, không chiếm chỗ trang bị.`,
        );
        return;
      }
      if (!item.before || !item.after) {
        details.push(
          `${receivedTitles[index]}: ${effectText(item.definition.effects, item.levels)}${item.definition.curse && item.curseLevels ? `\n☣️ Lời nguyền: ${effectText(item.definition.curse.effects, item.curseLevels)}` : ""}`,
        );
        return;
      }
      const keys =
        item.directKeys || core.effectStatKeys(item.definition.effects);
      const direct = statTransitions(item.before, item.after, true, {
        only: keys,
        empty: true,
      });
      const extraEffects = Object.fromEntries(
        Object.entries(item.definition.effects).filter(
          ([key]) => !core.effectStatKeys({ [key]: 1 }).length,
        ),
      );
      const extraCurse = Object.fromEntries(
        Object.entries(item.definition.curse?.effects || {}).filter(
          ([key]) => !core.effectStatKeys({ [key]: 1 }).length,
        ),
      );
      details.push(
        `${receivedTitles[index]}${direct ? `: ${direct}` : ""}${Object.keys(extraEffects).length ? `\n${effectText(extraEffects, item.levels)}` : ""}${item.curseLevels && Object.keys(extraCurse).length ? `\n☣️ Lời nguyền: ${effectText(extraCurse, item.curseLevels)}` : ""}`,
      );
      if (!receipt || item.inEventResult === false) {
        const secondary = statTransitions(item.before, item.after, true, {
          exclude: keys,
          empty: true,
        });
        if (secondary)
          details.push(
            `**Do ${item.sourceName || item.name}:**\n- ${secondary.split(STAT_SEPARATOR).join("\n- ")}`,
          );
      }
    });
    if (receipt) {
      const secondary = statTransitions(receipt.before, receipt.after, true, {
        exclude: [...directKeys, ...itemDirectKeys],
        empty: true,
      });
      if (secondary)
        details.push(
          `${eventIcon(receipt.kind || receipt.type)} **Do ${receipt.name || "sự kiện"}:**\n- ${secondary.split(STAT_SEPARATOR).join("\n- ")}`,
        );
    }
    const lines = (state.lastLog || "Run bắt đầu.")
      .split("\n")
      .filter((line) => {
        if (
          purified &&
          line.startsWith("✨ " + purified.name + ": giải toàn bộ lời nguyền;")
        )
          return false;
        // Older sessions still carry the simple item receipt in lastLog.
        const plain = line
          .replace(/<a?:\w+:\d+>/g, "")
          .trim()
          .replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "");
        return !received.some((item) =>
          [
            `${item.name} Lv.${item.level}.`,
            `Nhận ${item.name} Lv.${item.level}.`,
          ].includes(plain),
        );
      });
    if (
      eventDirect &&
      receipt?.type === "shrine" &&
      lines.length &&
      !state.lastDeathCause &&
      !received.length
    )
      lines.shift();
    // Old sessions can still contain the numeric summaries written before this UI change.
    for (let i = 0; i < lines.length; i++)
      if (lines[i].endsWith("Shrine experience."))
        lines[i] =
          `${E.shrine} Shrine Experience: bonus +25% cược (${money(Math.floor(state.stake * 0.25))} xu), cộng vào thưởng của run.`;
    // Repair payout logs saved before the shared coin icon existed.
    for (let i = 0; i < lines.length; i++)
      lines[i] = lines[i].replace(/^undefined(?= \*\*Thưởng xu · )/, E.coin);
    if (state.lastUpgrade) lines[0] = "Đã phân bổ điểm checkpoint.";

    const milestone = lines.findIndex(
      (line) => line.includes("Đạt tầng ") || line.startsWith("🩸 Lời nguyền"),
    );
    if (details.length)
      lines.splice(
        milestone < 0 ? lines.length : milestone,
        0,
        details.join("\n"),
      );
    return lines.join("\n");
  }

  function coinPayoutDetails(state) {
    const lines = [];
    const factor = Math.max(0, Math.min(1, state.payoutFactor ?? 1));
    if (factor < 1) lines.push("**" + percent(1 - factor) + " xu** (nguyền)");
    const taxSpent = Math.min(
      state.payoutSpent || 0,
      state.payoutTaxSpent || 0,
    );
    const goblinSpent = Math.min(
      (state.payoutSpent || 0) - taxSpent,
      state.payoutGoblinSpent || 0,
    );
    const eventSpent = Math.min(
      (state.payoutSpent || 0) - taxSpent - goblinSpent,
      state.payoutEventSpent || 0,
    );
    const otherSpent =
      (state.payoutSpent || 0) - taxSpent - goblinSpent - eventSpent;
    if (taxSpent > 0)
      lines.push("**" + money(taxSpent) + " " + E.coin + "** thuế");
    if (goblinSpent > 0)
      lines.push("**" + money(goblinSpent) + " " + E.coin + "** do Goblin");
    if (eventSpent > 0)
      lines.push("**" + money(eventSpent) + " " + E.coin + "** do event");
    if (otherSpent > 0)
      lines.push("**" + money(otherSpent) + " " + E.coin + "** đã chi");
    return lines.length ? "\nĐã trừ: " + lines.join(STAT_SEPARATOR) : "";
  }
  return { turnText, coinPayoutDetails };
};
