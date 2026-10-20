"use strict";
const { itemIcon } = require("../shared/icons");
const purifier = require("../events/purifier");
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

  function horadricText(state, detailed = false) {
    const f = state.encounter.forge,
      forge = require("../equipment/forge");
    if (f.version === 2) {
      const item = state.items.find((i) => i.definition.id === f.targetId);
      const title = eventIcon("horadric") + " **Horadric Forge · mượn và nâng cấp trang bị**";
      if (!item)
        return (
          title +
          "\nChọn **bất kỳ trang bị nào trong túi** ở menu bên dưới để xem trước, rồi bấm nút xác nhận. " +
          "Bấm **Bỏ qua** nếu không muốn dùng Forge; không tốn xu."
        );
      const wait = forge.delay(item);
      const label = forge.RARITY_LABEL[item.definition.rarity] || "";
      return (
        title +
        "\n" +
        itemIcon(item) +
        " **" +
        item.name +
        " [" +
        label +
        "] · Lv." +
        item.level +
        "**\n" +
        (wait === 0
          ? "- Hạng R: nâng cấp ngay, nhận lại tức thì với **Lv." + (item.level + forge.LEVELS) + "** (+" + forge.LEVELS + ")."
          : "- Trang bị bị lấy đi **hoàn toàn**: mất mọi chỉ số, nội tại và cả lời nguyền ở mọi cấp trong thời gian mượn.\n- Trả lại sau **" +
            wait +
            " tầng**, ở tầng hợp lệ kế tiếp (tầng " +
            forge.dueFloor(state, item) +
            "), với **Lv." +
            (item.level + forge.LEVELS) +
            "** (+" +
            forge.LEVELS +
            ").") +
        (item.definition.curse
          ? "\n- Trang bị có nguyền: level thêm không tăng cấp nguyền, cấp nguyền hiện tại được giữ nguyên."
          : "") +
        (wait === 0
          ? ""
          : "\n- Nếu nhặt được món cùng loại trong lúc đó, khi trả lại level sẽ được gộp.") +
        "\n**Bỏ qua:** giữ nguyên trang bị. Không tốn xu."
      );
    }
    const title =
      eventIcon("horadric") + " **Horadric Forge · đổi trang bị lấy chỉ số**";
    const rewards = f.boons
      .map((b) => forge.rewardIcon(b) + " **" + forge.rewardLabel(b) + "**")
      .join(" / ");
    if (f.stage === "boon") {
      const definition = Object.values(core.ITEMS)
        .flat()
        .find((i) => i.id === f.removed?.id);
      const name = f.removed?.name || definition?.name || "trang bị";
      return (
        title +
        "\nĐã nghiền **" +
        name +
        "**" +
        (f.removed?.level
          ? " · Lv." + f.removed.level + " → " + (f.removed.level - 1)
          : " · 1 cấp") +
        ".\n**Chọn một phần thưởng:** " +
        rewards +
        "\nChỉ số thưởng chưa được cộng. Không dùng hoặc nhận vé, không tốn thêm xu." +
        "\n**Đã nghiền nên không thể hoàn tác/bỏ qua.** Chọn một thưởng trong menu để tiếp tục."
      );
    }
    const target = state.items.find((i) => i.definition.id === f.targetId);
    if (!target)
      return (
        title + "\nTrang bị không còn trong túi. Chọn **Bỏ qua** để đi tiếp."
      );
    const preview = structuredClone(state);
    core.grind(
      preview,
      preview.items.find((i) => i.definition.id === f.targetId),
    );
    const changes = statTransitions(state, preview, true, {
      empty: true,
      ...(detailed
        ? {}
        : {
            only: [
              "luck",
              ...core.effectStatKeys({
                ...target.definition.effects,
                ...target.definition.curse?.effects,
              }),
            ],
          }),
    });
    const lines = [
      title,
      itemIcon(target) +
        " **Nghiền " +
        target.name +
        " · Lv." +
        target.level +
        " → " +
        (target.level - 1) +
        "**",
      "**Thay đổi khi nghiền:**" +
        (changes
          ? detailed
            ? "\n- " + changes.split(STAT_SEPARATOR).join("\n- ")
            : " " + changes
          : " Không đổi chỉ số nền; vẫn gỡ hiệu ứng của cấp bị nghiền."),
      "**Đổi lại, chọn đúng một:** " + rewards,
    ];
    if (detailed) {
      const rules = require("../equipment/rules"),
        copy = preview.items.find((i) => i.definition.id === f.targetId);
      const lost =
        rules.itemScale(state, target) -
        (copy ? rules.itemScale(preview, copy) : 0);
      const buffs = Object.fromEntries(
        Object.entries(target.definition.effects).filter(
          ([k]) => !["heal", "potions", "escapeTokens"].includes(k),
        ),
      );
      if (Object.keys(buffs).length)
        lines.push("**Buff bị gỡ:** " + effectText(buffs, lost));
      const curse =
        rules.curseScale(state, target) -
        (copy ? rules.curseScale(preview, copy) : 0);
      if (target.definition.curse) {
        const itemCurses = require("../itemCurses"),
          effects = { ...target.definition.curse.effects };
        if (
          itemCurses.defenseReduction(target) &&
          target.level > (target.cleansedLevels || 0)
        ) {
          delete effects.defenseReduction;
          delete effects.defenseSet;
          const stillCursed = copy && copy.level > (copy.cleansedLevels || 0);
          lines.push(
            stillCursed
              ? "**Nguyền DEF còn hiệu lực:** khoản DEF đã trừ giữ nguyên; chỉ hoàn trả khi hết cấp nguyền."
              : "**Gỡ cấp nguyền cuối:** hoàn trả " +
                  E.defense +
                  " **" +
                  (itemCurses.defenseLoss(target) || 0) +
                  " DEF** đã trừ.",
          );
        }
        if (curse > 0 && Object.keys(effects).length)
          lines.push(
            "**Nguyền được gỡ theo cấp:** " + effectText(effects, curse),
          );
      }
      if (target.level === 1)
        lines.push(
          "Món về Lv.0 sẽ rời túi; mất cả nội tại và affinity của món đó.",
        );
    }
    lines.push(
      "Thưởng +1 là cố định, không bù số chỉ số đã mất. Không tốn xu/vé." +
        (preview.luck < state.luck
          ? " LUCK giảm do mất hiệu ứng trang bị, không phải phí riêng."
          : ""),
    );
    lines.push(
      "Chọn **Bỏ qua** để giữ nguyên trang bị, hoặc **Xác nhận nghiền 1 cấp**. Sau khi nghiền phải chọn một thưởng để đi tiếp.",
    );
    return lines.join("\n");
  }

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
      Object.entries(effects).filter(
        ([key]) =>
          instantKeys.includes(key) &&
          (!require("../equipment/rules").enabled(state) ||
            target.definition.receipt?.onDuplicate),
      ),
    );
    const curseLevels = Math.max(
      0,
      target.level - (target.cleansedLevels || 0),
    );
    const lines = [
      eventIcon("blacksmith") +
        " **Blacksmith** · Rèn thêm **1 cấp** cho trang bị.",
      itemIcon(target) +
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
          itemEffectChanges(buffs, target.level, target.level + 1, state)
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
                require("../equipment/rules").enabled(state)
                  ? target.level
                  : curseLevels,
                require("../equipment/rules").enabled(state)
                  ? target.level + 1
                  : curseLevels + 1,
                state,
                target.cleansedLevels || 0,
                {
                  curse: true,
                  defenseLoss:
                    target.curseEffects?.defense != null
                      ? -target.curseEffects.defense
                      : null,
                },
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
    const target = purifier.selected(state);
    const free = require("../events/explorationMarks").taxReliefAvailable(state);
    const heading = state.encounter.taxRelief
      ? `${eventIcon("tax")} **TAX COLLECTOR · QUYỀN LỢI NỘP THUẾ**`
      : `${eventIcon("purifier")} **Purifier**`;
    const price = free
      ? "**Miễn phí:** dùng 1 lượt của Tax Collector để gỡ toàn bộ nguyền của 1 trang bị; giữ nguyên độ hiếm, level, buff và nội tại."
      : `**Giá:** ${E.coin} **${money(core.purifierCost(state))} xu** (${percent(core.PURIFIER_COST_RATE)} payout hiện tại).`;
    const confirmation = free
      ? "Chỉ tiêu lượt miễn phí khi bấm **Giải nguyền món này**. " +
        (state.encounter.taxRelief && state.cleared >= 998
          ? "**Đây là lần mời cuối trước boss 999**; bỏ qua sẽ tiếp tục vào trận cuối."
          : "Bỏ qua giữ lượt; quyền lợi hết khi kết thúc run.")
      : "Chỉ trả phí khi bấm **Giải nguyền món này**.";
    if (!target && purifier.items(state).length)
      return (
        heading +
        " · Giải nguyền **1 món mỗi lần gặp**.\nChọn món còn nguyền trong menu để xem lời nguyền được gỡ và chỉ số trước → sau.\n" +
        price + "\n" + confirmation
      );
    const curseLevels = target
      ? Math.max(0, target.level - (target.cleansedLevels || 0))
      : 0;
    if (!target?.definition.curse || !curseLevels)
      return (
        heading + "\nTrang bị không còn lời nguyền cần giải. Chọn **Bỏ qua** để đi tiếp." +
        (free ? " Lượt miễn phí được giữ lại trong run này." : "")
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
      heading + " · Giải nguyền **1 món mỗi lần gặp**.",
      itemIcon(target) +
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
        itemEffectChanges(
          target.definition.curse.effects,
          require("../equipment/rules").enabled(state)
            ? target.level
            : curseLevels,
          0,
          state,
          target.cleansedLevels || 0,
          {
            curse: true,
            defenseLoss:
              target.curseEffects?.defense != null
                ? -target.curseEffects.defense
                : null,
          },
        ),
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
      price,
      confirmation,
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
        "Không nhận lại HP hồi, bình máu hoặc vé khi nhặt đồ. Nguyền của trang bị khác vẫn còn hiệu lực." +
          (free
            ? state.encounter.taxRelief && state.cleared >= 998
              ? " **Bỏ qua:** tiếp tục tới trận cuối, không giải nguyền."
              : " **Bỏ qua:** giữ lượt miễn phí."
            : " Cần đủ payout hiện tại để trả phí. **Bỏ qua:** giữ nguyên trang bị và payout."),
      );
    } else {
      lines.push(
        "Đổi món trong menu để xem trước; bấm **Giải nguyền món này** để xác nhận. Xem **Chi tiết** để đọc buff và nội tại.",
      );
    }
    return lines.join("\n");
  }

  function merchantOffer(offer) {
    if (offer.item)
      return {
        name: `${itemIcon(offer.item)} ${offer.item.name} [${rarityLabel(offer.item.rarity)}]`,
        detail: itemText(offer.item),
        button: offer.item.name,
        icon: itemIcon(offer.item),
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
          name: `${E.hp} Hồi đầy HP/MP`,
          detail: `Hồi đầy ${E.hp} HP/${E.mana} MP.`,
          button: "Hồi đầy HP/MP",
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
    horadricText,
    blacksmithText,
    purifierText,
    merchantOffer,
    shopCurrency,
    shopPrice,
    chestPityText,
  };
};
