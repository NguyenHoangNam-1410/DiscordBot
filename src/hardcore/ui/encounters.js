"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    covenant,
    gilded,
    monsterLoot,
    memories,
    formatGodChance,
    stats,
    core,
    paradox,
    world,
    icon,
    E,
    eventIcon,
    memoryIcon,
    passiveIcon,
    rarityLabel,
    percent,
    money,
    healthBar,
    SKILLS,
    SHRINES,
  } = dependencies;
  const effectText = (...args) => dependencies.effectText(...args);
  const itemText = (...args) => dependencies.itemText(...args);
  const blacksmithText = (...args) => dependencies.blacksmithText(...args);
  const purifierText = (...args) => dependencies.purifierText(...args);
  const merchantOffer = (...args) => dependencies.merchantOffer(...args);
  const shopPrice = (...args) => dependencies.shopPrice(...args);
  const chestPityText = (...args) => dependencies.chestPityText(...args);
  const rngesusLabel = (...args) => dependencies.rngesusLabel(...args);
  const randomEventText = (...args) => dependencies.randomEventText(...args);

  function encounterText(s) {
    if (s.phase === "boss_chest")
      return `${eventIcon("boss_chest")} **RƯƠNG BOSS · TẦNG ${s.encounter.bossFloor}**\nPhần thưởng sau boss cuối khu vực. Chọn **mở hoặc bán** để tiếp tục.\n\n**Mở rương**\n- **70%:** nhận trang bị **SSR**.\n- **30%:** nhận **UR**: trang bị có nguyền hoặc Vé thoát.\nĐồ trùng tên tăng level. Tỷ lệ cố định, không bị Luck/pity thay đổi.\n\n**Bán rương**\n- Cộng **100% cược ban đầu (${money(s.stake)} xu)** vào thưởng của run.\nPhải xử lý rương trước khi rút thưởng hoặc đi tiếp.`;
    if (s.phase === "upgrade")
      return `${E.checkpoint} **CHECKPOINT** · Đã hồi đầy ${E.hp} HP và nhận thêm 2 ${E.potion} bình máu.\nChọn **+5 STR, DEX, VIT hoặc ENE**; dự báo thay đổi ở ngay bên dưới.`;
    if (s.phase === "paradox" && s.encounter.version === 2)
      return paradox.choicesText(s.encounter);
    if (s.phase === "paradox")
      return `${eventIcon("paradox")} **RIFT PARADOX**\nChọn **một** quy luật đặc biệt cho tầng **${s.floor}–${s.floor + 4}**. Hết hạn, cơ chế trở lại bình thường.\n\n**Máu là tiền · đổi HP lấy thưởng xu**\n- Mất HP do quái/bẫy: tăng hệ số thưởng xu; hồi HP từ bình/skill/event: giảm hệ số. Mỗi 10% Max HP tương ứng 10 điểm %.\n- Hệ số giới hạn từ **−50% đến +50%**, chỉ áp dụng khi hiệu ứng còn hoạt động. Không tác động kim cương.\n- Hồi đầy ${E.hp} HP tại ${E.checkpoint} checkpoint **không giảm hệ số thưởng**. HP dùng để mua đồ/hiến tế không tăng thưởng.\n\n**Ngược đời · ATK chuyển thành DEF và ngược lại**\n- ${E.attack} ATK: **${s.damageMin}–${s.damageMax} → ${Math.max(1, s.defense - 2)}–${Math.max(1, s.defense + 3)}** (paradox). \n- ${E.defense} DEF: **${s.defense} → ${(s.damageMin + s.damageMax) / 2}** (paradox).`;
    if (s.phase === "severance")
      return `${eventIcon("severance")} Xóa **toàn bộ stack** của một Rift có hại. Unstable Rift được giữ.\nChọn icon của Rift muốn xóa. Xem nút **Rift** để đọc hiệu ứng từng loại.`;
    if (s.phase === "summit")
      return `${eventIcon("boss")} Đã hạ Deimoss tầng 999. Bấm **Rút thưởng** để chốt chiến thắng và phần thưởng.`;
    const e = s.encounter;
    if (e.type === "covenant_blessing") {
      const b = e.blessing;
      return (
        "✨ **PHƯỚC LÀNH CHINH PHẠT**\n" +
        E.hp +
        " **HP " +
        b.hpBefore +
        " → " +
        b.hpAfter +
        "** · " +
        E.mana +
        " **MP " +
        b.manaBefore +
        " → " +
        b.manaAfter +
        "**\nĐã giải **" +
        b.cleansedLevels +
        "** lớp nguyền UR và xóa **" +
        b.removedRiftStacks +
        "** ấn Rift. Giữ UR, level, Paradox và Contract.\n💠 **Conqueror’s Covenant [LR]** · " +
        (covenant.active(s)
          ? "Đang hoạt động: mỗi quái hạ từ bây giờ tăng 0,2 điểm % thưởng xu, tối đa +100%."
          : "Đã nhận; chưa kích hoạt vì đã có nội tại LR khác hoạt động.") +
        "\nĐã tiêu thụ bốn mảnh và vượt tầng thử thách. Bấm Tiếp tục để xử lý checkpoint hoặc tầng kế tiếp."
      );
    }
    if (e.type === "god_rngesus") {
      const b = e.blessing;
      return (
        eventIcon("god_rngesus") +
        " **God of RNGesus (" +
        formatGodChance(e.encounterChance) +
        ")**\n" +
        E.hp +
        " **HP " +
        b.hpBefore +
        " → " +
        b.hpAfter +
        "** · " +
        E.mana +
        " **MP " +
        b.manaBefore +
        " → " +
        b.manaAfter +
        "**\n" +
        "Đã giải **" +
        b.cleansedLevels +
        "** lớp nguyền UR và xóa **" +
        b.removedRiftStacks +
        "** ấn Rift. Giữ UR, level, Paradox và Contract.\n" +
        "💠 **Fatebreaker Seal [LR]** · " +
        (s.activeRelic === "fatebreaker_seal"
          ? "Đang hoạt động: không gặp RNGesus trong phần còn lại của run."
          : "Đã nhận; đang có nội tại LR khác hoạt động.") +
        "\nTỷ lệ God đã reset về **0,0001%**. Thành tích đã được lưu.\nTiếp tục khám phá để xử lý tầng hiện tại; không bỏ qua boss."
      );
    }
    const formatted = randomEventText(s);
    if (formatted) return formatted;
    if (e.type === "combat") {
      const p = core.incomingPreview(s);
      const mechanisms = {
        butcher: "Mỗi đòn tăng 8% DMG, tối đa 5 stack.",
        riftwalker: "Miễn đòn đầu mỗi chu kỳ 3 lượt.",
        assur: "EVA cao và Crit nguy hiểm.",
        lucion: "Hồi 35% sát thương thực sự gây ra.",
        deimoss: "Abyssal Spires giảm 25% sát thương nhận.",
      };
      return (
        `**${e.name}** · ${e.rank}\n${E.hp} ${e.hp}/${e.maxHp} · ${E.attack} ${e.damageMin}–${e.damageMax} · ${E.defense} ${e.defense} · ${E.res} RES ${e.resistance}%\n` +
        `Đòn quái kế tiếp: **${e.nextDamageType === "magic" ? "Phép" : "Vật lý"}** · Dự báo nhận **${p.low}–${p.high} HP** · Quái đánh trúng bạn **${percent(p.chance)}** *(chưa Crit/chưa Thủ)*\n` +
        `Bạn đánh vật lý trúng quái **${percent(world.hitChance(s.accuracy, e.evasion))}**; trượt gây 0 DMG nhưng vẫn hồi MP khi đánh thường. Skill phép luôn trúng.\n` +
        (gilded.isBoss(e)
          ? gilded.details(s) + "\n"
          : e.mechanic
            ? `Cơ chế: ${mechanisms[e.mechanic]}\n`
            : "") +
        `**Tấn công:** vật lý, hồi ${core.attackManaGain(s)} MP (tối đa Max MP). **Thủ:** DEF ×2 hoặc +15 RES, giảm thêm 15% DMG, miễn Crit, +1 MP.\n**${stats.CLASSES[s.classKey].skill} (${core.skillManaCost(s)} MP${core.skillHpCost(s) ? `, −${core.skillHpCost(s)} HP` : ""}):** ${SKILLS[s.classKey]} **Bình:** hồi tối đa ${core.healingAmount(s, Math.max(20, s.maxHp * paradox.potionRate(s)))} HP cho bạn; quái còn sống phản công.`
      );
    }
    if (e.type === "memory") {
      const family = memories.family(e.debt);
      return `${memoryIcon(family)} **${memories.CATALOG[family].name}**\nChọn cách xử lý bằng nút bên dưới. Xem **Rift** để đọc nguyên nhân và hậu quả.`;
    }
    if (e.type === "empty")
      return `${eventIcon("empty")} Phòng trống. Đi tiếp hoặc rút thưởng.`;
    const k = e.kind;
    if (k === "blacksmith") return blacksmithText(s, true);
    if (k === "purifier") return purifierText(s, true);
    if (k.endsWith("_shop"))
      return `${eventIcon(e.kind)} **${e.name}** · mua tối đa **một món**. Giá và offer đã khóa.\n${e.offers.map((offer, i) => `**${i + 1}. ${offer.item.name} [${rarityLabel(offer.item.rarity)}] · ${shopPrice(k, offer)}**\n${itemText(offer.item)}`).join("\n")}\n${k === "blood_shop" ? "Giảm Max HP trong suốt run; phải còn ít nhất 1 Max HP sau trả giá. HP hiện tại chỉ hạ xuống nếu vượt Max HP mới." : k === "diamond_shop" ? "Kim cương bị trừ ngay khi mua, kể cả run sau đó tử trận." : "Giá chốt theo payout hiện tại lúc gặp; bao gồm Paradox và các khoản đã chi."}`;
    if (k === "merchant")
      return `${eventIcon(k)} **${e.name}**\nMua tối đa **một món** bằng xu payout:\n${e.offers.map((o) => `- **${merchantOffer(o).name}** · **${money(o.price)} ${icon("coin", "🪙")}**`).join("\n")}\nXem **Chi tiết** để đọc công dụng và điều kiện mua.`;
    const target = s.items.find((x) => x.definition.id === e.targetId);
    if (k === "horadric" && target) {
      const retained = Object.fromEntries(
        Object.entries(target.definition.effects).filter(
          ([key]) =>
            ![
              "heal",
              "potions",
              "escapeTokens",
              "bonusPenalty",
              "defenseSet",
            ].includes(key),
        ),
      );
      const main = stats.mainStat(s);
      const guard = e.forgeStat || "str";
      const hasCurse =
        target.level > (target.cleansedLevels || 0) && target.definition.curse;
      return `${eventIcon(k)} **HORADRIC FORGE · LÒ CHUYỂN HÓA**\nTiêu hao **1 level trang bị** để giữ hiệu ứng có lợi trong run và chọn thêm một phần thưởng. Không tốn xu.\n\n**${E.backpack} Trang bị dùng để chuyển hóa**\n${E.backpack} **${target.name} [${rarityLabel(target.rarity)}] · Lv.${target.level}**\n- Sau khi dùng: ${target.level === 1 ? "món này biến mất khỏi trang bị" : `level **${target.level}→${target.level - 1}**`}.\n- **Giữ nguyên hiệu ứng của level đã tiêu hao:** ${effectText(retained)}. Đây là hiệu ứng được giữ lại, không cộng thêm lần nữa.\n${hasCurse ? `- **Xóa lời nguyền của 1 level:** ${effectText(target.definition.curse.effects)}.\n` : ""}- Không nhận lại ${E.potion} bình máu, ${E.ticket} Vé thoát hoặc ${E.hp} HP hồi khi nhặt đồ.\n\n**Chọn một phần thưởng thêm**\n- ${E[main]} **${main.toUpperCase()} +6**.\n- ${E[guard]} **${guard.toUpperCase()} +7**.\n- ${E.vit} **VIT +4**.${["legendary", "cursed"].includes(target.rarity) ? `\n- ${E.ticket} **Nhận 1 vé thoát** (giữ tối đa 1).` : ""}\n\n**Bỏ qua:** giữ nguyên trang bị, không nhận phần thưởng.`;
    }
    const descriptions = {
      healer: `**Hồi phục:** hồi ${E.hp} HP bằng 30% Max HP, ít nhất 20; +1 ${E.potion} bình máu (theo giới hạn bình của bạn). Miễn phí.`,
      sacrifice: `**Hiến HP:** mất tối đa 20% Max ${E.hp} HP (giữ ≥1) → +6 ${E[stats.mainStat(s)]} ${stats.mainStat(s).toUpperCase()}.\n**Hiến payout:** trả 10% payout hiện tại → +6 ${E.vit} VIT. Hiến HP không cộng bonus Blood Paradox.`,
      contract: `Trong 3 tầng, chọn một điều kiện:\n- **Không dùng ${E.potion} bình:** nhận đồ [SSR].\n- **Không dùng skill:** bonus +50% cược.\n- **Không phòng thủ:** +10 ${E[stats.mainStat(s)]} ${stats.mainStat(s).toUpperCase()}.\nVi phạm chỉ hủy thưởng.`,
      class_shrine: `Hiệu lực ba tầng tiếp theo: ${SHRINES[s.classKey]}`,
    };
    return `${eventIcon(e.kind)} **${e.name}**\n${descriptions[k] || "Chọn một hành động."}`;
  }

  function encounterSummary(s) {
    if (s.phase === "upgrade")
      return `${E.checkpoint} **CHECKPOINT**\nChọn +5 STR, DEX, VIT hoặc ENE. Xem **Chi tiết** để đọc dự báo chỉ số.`;
    if (s.phase === "boss_chest")
      return `${eventIcon("boss_chest")} **RƯƠNG BOSS · TẦNG ${s.encounter.bossFloor}**\nChọn mở hoặc bán rương trước khi đi tiếp hay rút thưởng.\nXem **Chi tiết** để đọc phần thưởng.`;
    if (s.phase === "paradox")
      return `${eventIcon("paradox")} **RIFT PARADOX · HIỆU LỰC 5 TẦNG**\nTầng ${s.encounter.version === 2 ? s.encounter.milestone + 1 : s.floor}–${s.encounter.version === 2 ? s.encounter.milestone + 5 : s.floor + 4}. Chọn một luật bằng nút bên dưới.\nXem **Chi tiết** để đọc công dụng từng lựa chọn.`;
    if (s.phase !== "encounter") return encounterText(s);
    const e = s.encounter;
    if (["memory", "god_rngesus", "covenant_blessing"].includes(e.type))
      return encounterText(s);
    if (e.type === "combat") {
      const rank =
        {
          normal: "Thường",
          elite: "Tinh anh",
          boss: "Trùm",
          final_boss: "Trùm cuối",
          mimic: "Mimic",
          ancient_mimic: "Ancient Mimic",
        }[world.mimicKind(e) ? "elite" : e.rank] || e.rank;
      const preview = core.incomingPreview(s);
      return `${e.memoryFamily ? memoryIcon(e.memoryFamily) : ["boss", "final_boss"].includes(e.rank) ? eventIcon("boss") : "👹"} **${e.name}** · ${rank}\n${healthBar(e.hp, e.maxHp)}\n${E.attack} ${money(e.damageMin)}–${money(e.damageMax)} DMG · ${E.defense} DEF ${money(e.defense)} · ${E.res} RES ${e.resistance}%\n${E.accuracy} Tỷ lệ vật lý trúng: **${percent(world.hitChance(s.accuracy, e.evasion))}**${e.mechanic === "riftwalker" && e.combatTurn % 3 === 0 ? " · 🛡️ Quái miễn sát thương lượt này" : ""}\n🎯 **Đòn kế tiếp:** ${e.nextDamageType === "magic" ? `${E.magic} Phép` : `${E.attack} Vật lý`}\n📉 **${gilded.isBoss(e) ? "Dự báo đòn thường" : "Dự báo nhận"}:** **${preview.low}–${preview.high} DMG** · ${E.evasion} **${percent(preview.chance)}** trúng bạn *(chưa Crit/DEF${gilded.isBoss(e) ? "/phản phệ" : ""})*`;
    }

    if (e.type === "empty")
      return `${eventIcon("empty")} **PHÒNG TRỐNG**\nĐi tiếp để vượt tầng hoặc rút thưởng.`;
    if (e.type === "surprise" && e.kind.endsWith("_shop"))
      return `${eventIcon(e.kind)} **${e.name}** · mua một món\n${e.offers.map((o, i) => `${i + 1}. **${E.backpack} ${o.item.name} [${rarityLabel(o.item.rarity)}]** · ${shopPrice(e.kind, o)}`).join("\n")}\nXem Chi tiết để đọc công dụng và điều kiện mua.`;
    if (e.type === "surprise" && e.kind === "merchant") return encounterText(s);
    if (e.type === "surprise" && e.kind === "blacksmith")
      return blacksmithText(s);
    if (e.type === "surprise" && e.kind === "purifier") return purifierText(s);
    if (hasEncounterDetails(s)) {
      const notices = {
        chest: e.revealed
          ? "Đã phát hiện Mimic. Chọn mở hòm để chiến đấu hoặc tránh Mimic."
          : "Chọn mở, kiểm tra hoặc bán hòm.",
        shrine:
          e.kind === "ritual"
            ? "Nghi lễ Oán Hận: triệu hồi boss hoặc bỏ qua. Xem Chi tiết; dấu ấn trong Rift."
            : "Chọn chạm Shrine hoặc bỏ qua.",
        rngesus:
          "Không thể đánh bại hoặc rút thưởng tại đây. Chọn cách đối phó.",
        trap:
          e.kind === "portal"
            ? covenant.canEnter(s)
              ? "Đủ bốn mảnh: cửa tầng hầm đã mở. Chọn vào portal, bỏ qua hoặc thử thách tầng hầm."
              : "Chọn vào portal hoặc bỏ qua để vượt tầng."
            : "Đi tiếp để xử lý tình huống.",
        echo: "Chọn cách tương tác với mộ.",
        surprise: "Chọn một hành động bằng nút bên dưới.",
      };
      const target = s.items.find((item) => item.definition.id === e.targetId);
      const context =
        e.kind === "duelist" && e.mode
          ? `\nVán ${Math.min(5, e.round + 1)}/5 · đã thắng ${e.wins}.`
          : e.kind === "treasure_room"
            ? "\nPhải chọn một rương; không được soi hoặc bỏ qua."
            : target
              ? `\n${E.backpack} ${target.name} [${rarityLabel(target.rarity)}] · Lv.${target.level}`
              : "";
      return `${eventIcon(["surprise", "trap"].includes(e.type) ? e.kind : e.type)} **${e.type === "rngesus" ? rngesusLabel(s) : e.name || e.type}**\n${notices[e.type] || "Chọn một hành động."}${context}\nXem **Chi tiết** để đọc tỷ lệ, kết quả và điều kiện.`;
    }
    return encounterText(s);
  }

  function hasEncounterDetails(s) {
    if (["upgrade", "boss_chest", "paradox"].includes(s.phase)) return true;
    if (s.phase !== "encounter") return false;
    const e = s.encounter;
    return (
      [
        "chest",
        "shrine",
        "rngesus",
        "god_rngesus",
        "covenant_blessing",
        "trap",
        "echo",
        "surprise",
      ].includes(e.type) || e.type === "combat"
    );
  }

  function viewTabs(s) {
    return [
      "stats",
      "items",
      "effects",
      ...(hasEncounterDetails(s) ? ["encounter"] : []),
    ];
  }

  function viewLabel(tab, s) {
    return {
      stats: "Chỉ số",
      items: `Túi (${s.items.length + (s.relics?.length || 0) + covenant.fragmentCount(s)})`,
      effects: `Rift (${Object.values(s.modifiers || {}).filter((stacks) => stacks > 0).length})`,
      encounter: "Chi tiết",
    }[tab];
  }

  function encounterDetails(s) {
    const detail = rawEncounterDetails(s);
    const forecasts = s.encounter.passiveForecast || [];
    const choices = core.actions(s);
    const forecast = forecasts
      .map(
        (f) =>
          "- **" +
          (choices.find((a) => a.action === f.action)?.label || f.action) +
          "**: " +
          (f.safe ? "✓ An toàn" : "⚠ Nguy hiểm"),
      )
      .join("\n");
    const offers = s.encounter.offers || [];
    const discount = offers.some((o) => o.discount > 0)
      ? "\n\n" +
        passiveIcon("shopDiscount") +
        " **Thương lượng:** giá xu đã giảm " +
        percent(offers[0].discount) +
        ", khóa khi gặp.\n" +
        offers
          .map((o) => money(o.basePrice) + " → **" + money(o.price) + " xu**")
          .join("\n")
      : "";
    return (
      detail +
      (forecast
        ? "\n\n" +
          passiveIcon("foresight") +
          " **Tiên tri** · nhánh lựa chọn đã khóa\n" +
          forecast +
          "\nKhông tiết lộ thời điểm kích hoạt ký ức; không áp dụng RNGesus."
        : "") +
      discount
    );
  }

  function monsterLootDetails(state) {
    const info = monsterLoot.odds(state);
    if (!info) return "";
    if (info.regionChest)
      return `${E.backpack} **Rơi trang bị:** không roll thêm đồ; hạ boss cuối khu vực nhận rương boss.`;
    const pool = info.rarities
      .map((rarity, i) => `**${rarityLabel(rarity)} ${i === 0 ? 60 : 40}%**`)
      .join(" · ");
    const mimic = world.mimicKind(state.encounter);
    const reward =
      mimic === "ancient_mimic"
        ? "SR 50% · SSR 30% · UR 20%"
        : mimic === "blood_mimic"
          ? "SR 60% · SSR 40%"
          : "";
    return `${E.backpack} **Rơi trang bị khi hạ quái:** **${percent(info.chance)}** · ${E.luck} **LUCK ${info.luck}** (chốt khi vào combat).\n**Khi có drop:** ${pool}. Tự nhặt 1 món vào run; trang bị trùng tăng 1 level, Vé thoát UR giữ tối đa 1 vé.\nTỷ lệ = 1% + LUCK × 0,5 điểm %, tối đa **20%**. Không chịu pity hòm hay hiệu ứng tìm SSR.${reward ? `\n**Thưởng riêng chắc chắn:** 1 món (${reward}), cộng thêm roll drop ở trên.` : ""}`;
  }

  function rawEncounterDetails(s) {
    if (s.phase !== "encounter") return encounterText(s);
    const e = s.encounter;
    if (e.type === "combat") {
      const mechanism =
        {
          butcher: `Frenzy: mỗi lần phản công tăng 8% sát thương, tối đa 5 stack. Hiện **${e.frenzy}/5**; phản công kế dùng **${Math.min(5, e.frenzy + 1)}/5** stack.`,
          riftwalker: `Miễn sát thương ở nhịp đầu mỗi chu kỳ 3 lần bạn tấn công/dùng skill. Nhịp kế **${(e.combatTurn % 3) + 1}/3**: **${e.combatTurn % 3 === 0 ? "miễn sát thương" : "có thể gây sát thương"}**. Phòng thủ/uống bình không đẩy nhịp này.`,
          assur: `${E.evasion} EVA **${e.evasion}**, ${E.crit} CRIT **${percent(e.critChance)}**. Phòng thủ miễn Crit của lần phản công đó.`,
          lucion:
            "Hồi HP bằng **35% sát thương thực tế gây lên bạn** sau mỗi phản công, tối đa Max HP. Né/chặn phản công ngăn hồi HP.",
          deimoss:
            "Abyssal Spires giảm **25% sát thương bạn gây ra**, áp dụng mọi đòn. Dự báo skill trên bảng chính đã tính giảm trừ này.",
        }[e.mechanic] || "Quái này không có chu kỳ kích hoạt riêng.";
      return `${eventIcon("boss")} **${e.name} · Chi tiết chiến đấu**\n${gilded.isBoss(e) ? gilded.details(s) : mechanism}\n\n${monsterLootDetails(s)}${covenant.combatDetails(s)}${e.drainCharges > 0 ? `\nSoul Drain: **quái** còn **${e.drainCharges} lần hút**; mỗi phản công trúng rút **1** ${E.mana} **MP** của **bạn**.` : ""}`;
    }
    if (e.type === "chest")
      return encounterText(s).replace(
        chestPityText(s, e),
        chestPityText(s, e, true),
      );
    if (e.type === "surprise" && e.kind.endsWith("_shop"))
      return `${eventIcon(e.kind)} **Công dụng các món đang bán**\n${e.offers.map((offer, i) => `${i + 1}. **${E.backpack} ${offer.item.name} [${rarityLabel(offer.item.rarity)}]**\n${itemText(offer.item)}`).join("\n\n")}\n\nMua tối đa **một món** trong lần gặp. ${e.kind === "blood_shop" ? "Trả bằng cách giảm Max HP trong suốt run, phải còn ít nhất 1 Max HP trước khi cộng vật phẩm. HP hiện tại chỉ hạ xuống nếu vượt Max HP mới." : e.kind === "diamond_shop" ? "Kim cương trừ ngay khi mua, không hoàn lại khi run kết thúc." : "Trả từ payout hiện tại; giá chốt lúc gặp, bao gồm Paradox và các khoản đã chi."}`;
    if (e.type === "surprise" && e.kind === "merchant")
      return `${eventIcon("merchant")} **Công dụng hàng hóa**\n${e.offers.map((o) => `**${merchantOffer(o).name}**\n${merchantOffer(o).detail}`).join("\n\n")}\nChỉ mua một món; giá chốt theo payout hiện tại lúc gặp, gồm Paradox và các khoản đã chi. Cần đủ payout hiện tại để mua.`;
    return encounterText(s);
  }
  return {
    encounterText,
    encounterSummary,
    hasEncounterDetails,
    viewTabs,
    viewLabel,
    encounterDetails,
    monsterLootDetails,
    rawEncounterDetails,
  };
};
