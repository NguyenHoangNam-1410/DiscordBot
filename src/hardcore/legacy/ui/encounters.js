// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
const { monsterIcon } = require("../../shared/icons");
module.exports = function createModule(dependencies) {
  const {
    formatCoins,
    enemyDamageType,
    serviceCost,
    forgeTarget,
    curseTarget,
    luckyBreakChance,
    itemEffects,
    itemCurse,
    payoutReductionCost,
    SURPRISE_EVENTS,
    CLASS_SHRINE_TEXT,
    trapOdds,
    rarityLabel,
    effectText,
    STAT_EMOJI,
    icon,
    percentText,
    CLASS_PROFILES,
  } = dependencies;
  const healthBar = (...args) => dependencies.healthBar(...args);
  const chestChanceLines = (...args) => dependencies.chestChanceLines(...args);
  const surpriseChanceLines = (...args) =>
    dependencies.surpriseChanceLines(...args);
  const shrineChanceLines = (...args) =>
    dependencies.shrineChanceLines(...args);
  const rankLabel = (...args) => dependencies.rankLabel(...args);

  function equipmentServicePreview(state) {
    const event = state.encounter;
    const kind =
      event.type === "surprise"
        ? event.kind
        : event.type === "cleanse"
          ? "purifier"
          : event.type;
    if (kind === "blacksmith") {
      const target = forgeTarget(state);
      if (!target)
        return "🔨 **THỢ RÈN**\nChưa có trang bị phù hợp để nâng cấp.";
      const definition = target.definition;
      const buff = { ...itemEffects(definition) };
      if (target.rarity === "cursed" && !definition.effects)
        for (const key of Object.keys(itemCurse(definition))) delete buff[key];
      const curse = target.rarity === "cursed" ? itemCurse(definition) : {};
      return `🔨 **THỢ RÈN** · **${target.name} Lv.${target.level} → ${target.level + 1}**\n**Mất:** ${formatCoins(serviceCost(state, "blacksmith"))} xu từ payout hiện tại (12%, làm tròn lên).\n**Giữ:** trang bị, toàn bộ level và buff đã có.\n**Nhận thêm:** ${effectText(buff, 1)}; các giới hạn chỉ số/vật tư vẫn áp dụng.${Object.keys(curse).length ? `\n**Thêm 1 lớp nguyền:** ${effectText(curse, 1)}. Lớp đã giải trước đó vẫn được giữ trạng thái đã giải.` : ""}\nBot chọn UR → SSR → SR → R, rồi level thấp nhất. Bỏ qua để giữ nguyên tài nguyên.`;
    }
    if (kind === "purifier") {
      const target = curseTarget(state);
      if (!target)
        return "✨ **PURIFIER · GIẢI NGUYỀN**\nChưa có lời nguyền UR cần gỡ.";
      const layers = target.level - (target.cleansedLevels || 0);
      return `✨ **PURIFIER · GIẢI NGUYỀN** · **${target.name} Lv.${target.level}**\n**Mất:** ${formatCoins(serviceCost(state, "cleanse"))} xu từ payout hiện tại (20%, làm tròn lên).\n**Gỡ:** 1 lớp nguyền — ${effectText(itemCurse(target.definition), 1)}.\n**Giữ:** món, level và toàn bộ buff của trang bị.\n**Nhận lại:** phần chỉ số/hệ số payout thực tế bị lớp này trừ, theo giới hạn hiện tại; không nhận item mới.\nSau khi gỡ còn **${layers - 1} lớp nguyền** trên món này. Thuế, hối lộ, Rift và lời nguyền từ món khác vẫn áp dụng.`;
    }
    if (kind === "horadric") {
      const target = (state.items || []).find(
        (item) =>
          item.name === event.targetName &&
          item.rarity === event.targetRarity &&
          (item.definition?.base || "") === event.targetBase,
      );
      if (!target)
        return "⚒️ **HORADRIC FORGE**\nKhông tìm thấy trang bị đã chọn để nghiền.";
      const level = target.level;
      const ticket = ["legendary", "cursed"].includes(target.rarity);
      const buff = { ...itemEffects(target.definition) };
      if (target.rarity === "cursed" && !target.definition.effects)
        for (const key of Object.keys(itemCurse(target.definition)))
          delete buff[key];
      for (const key of [
        "heal",
        "potions",
        "escapeTokens",
        "bonusPenalty",
        "defenseSet",
        "text",
      ])
        delete buff[key];
      const removed = effectText(buff, 1).replace(
        "Không rõ tác dụng",
        "không có buff chỉ số lâu dài",
      );
      return `⚒️ **HORADRIC FORGE** · **${target.name} Lv.${level}** [${rarityLabel(target.rarity)}]\n**Mất:** 1 level. ${level === 1 ? "Món này sẽ bị xóa." : `Món còn Lv.${level - 1}.`} Không tốn xu.\n**Hiệu ứng level bị gỡ:** ${removed} (theo phần đã áp dụng và giới hạn hiện tại).\n**Giữ:** các món khác, level còn lại và vật tư đã nhận khi nhặt. HP/ENE hiện tại có thể giảm nếu chỉ số tối đa giảm.\n**Lời nguyền:** nếu level bị nghiền còn nguyền, gỡ lớp đó và hoàn phần phạt; các lớp khác giữ nguyên.\n**Chọn đúng 1 bonus:** +3 ATK; +4 DEF; +10 MAX HP và hồi tối đa 10 HP${ticket ? "; hoặc +1 Vé thoát" : ". Vé chỉ đổi được từ SSR/UR"}.\nVé giữ tối đa 1; đang có vé thì vé mới bị bỏ. Bỏ qua để giữ nguyên món.`;
    }
    return null;
  }

  function encounterText(state) {
    const encounter = state.encounter;
    if (state.phase === "upgrade")
      return `${icon("gift")} **NÂNG CẤP SAU MỐC TẦNG ${encounter.milestone}**\nChọn đúng một nút để nhận nâng cấp trong phần còn lại của run. +HP tăng giới hạn tối đa và hồi 30 HP; Rút thưởng chốt payout.`;
    if (state.phase === "summit")
      return `${icon("trophy")} **ĐÃ CHINH PHỤC TẦNG 999**\nĐây là giới hạn Sinh tồn. Bấm **Rút thưởng** để nhận payout hiện tại.`;
    const servicePreview = equipmentServicePreview(state);
    if (servicePreview) return servicePreview;
    if (encounter.type === "combat") {
      const skillHint = CLASS_PROFILES[state.classKey].effect;
      const mechanic = {
        butcher: "Blood Frenzy: mỗi lần ra đòn +8% ATK, tối đa 5 cộng dồn.",
        riftwalker: "Miễn nhiễm đòn đầu trong mỗi chu kỳ 3 lần bạn tấn công.",
        assur: "+18 EVA và +12 điểm % CRIT.",
        lucion: "Hồi HP bằng 35% sát thương gây ra.",
        deimoss: "Abyssal Spires: giảm 25% sát thương nhận vào.",
      }[encounter.mechanic];
      const damageType = {
        physical: "Vật lý cố định",
        magic: "Phép cố định",
        mixed: "Vật lý / phép",
      }[enemyDamageType(encounter)];
      return `${icon("crossed_swords")} **${encounter.name}** · ${rankLabel(encounter.rank)}\n${healthBar(encounter.hp, encounter.maxHp)}\n${STAT_EMOJI.attack} ATK ${formatCoins(encounter.damageMin)}–${formatCoins(encounter.damageMax)} · ${STAT_EMOJI.defense} DEF ${formatCoins(encounter.defense)}\n**Loại DMG:** ${damageType}\n**Đòn kế tiếp:** ${encounter.nextDamageType === "magic" ? "Phép" : "Vật lý"}${mechanic ? `\n**Cơ chế boss:** ${mechanic}` : ""}\n**Tấn công:** đánh và hồi 1 ENE. **Phòng thủ:** DEF ×2, miễn chí mạng và giảm thêm 40% DMG vật lý/phép sau giảm trừ, hồi 1 ENE. **Kỹ năng:** 2 ENE — ${skillHint}\n**Bình máu:** hồi ${Math.round(Math.max(0.1, Math.min(0.75, 0.35 + (state.potionPower || 0))) * 100)}% MAX HP, ít nhất 20; quái vẫn phản công.`;
    }
    if (encounter.type === "chest")
      return `${icon("package")} **${encounter.treasure ? "HÒM KHO BÁU" : "HÒM BÍ ẨN"}**\n${chestChanceLines(encounter)}${encounter.inspected ? "Đã kiểm tra một lần; kết quả có thể không phát hiện được Mimic." : "Kiểm tra một lần để thử phát hiện Mimic; Mở để nhận đồ hoặc có thể phải đánh Mimic; Bán để lấy thêm 15% tiền cược vào payout."}${encounter.revealed ? `\n${icon("warning")} Mimic đã bị phát hiện: **Tránh Mimic** để đi tiếp an toàn.` : ""}`;
    if (encounter.type === "shrine")
      return `${icon("moyai")} **SHRINE KHÔNG RÕ NGUỒN GỐC**\n**Chạm Shrine** để nhận một hiệu ứng ngẫu nhiên, hoặc **Bỏ qua** để đi tiếp. Loại hiệu ứng được chọn đồng đều:\n${shrineChanceLines(state)}`;
    if (encounter.type === "rngesus")
      return `${icon("skull")} **RNGesus · HP ∞ · KHÔNG THỂ BỊ ĐÁNH BẠI**\nChiến đấu là chết. Bỏ chạy: **75%**; thất bại tự dùng 1 vé nếu còn, hết vé thì chết. Chạy thành công giữ vé. Có thể dùng vé để vượt an toàn. Hối lộ: payout ×0,6 (giảm ${formatCoins(payoutReductionCost(state, 0.4))} xu hiện tại). Cầu nguyện: **${Math.round((encounter.prayerChance ?? 0.3) * 100)}%**, nhận 85% SSR / 15% UR; trượt sẽ chết.`;
    if (encounter.type === "surprise")
      return SURPRISE_EVENTS[encounter.kind]
        ? `❓ **${SURPRISE_EVENTS[encounter.kind].name}**\n${SURPRISE_EVENTS[encounter.kind].text}${encounter.kind === "class_shrine" ? `\n${CLASS_SHRINE_TEXT[state.classKey]}` : ""}${encounter.kind === "horadric" ? `\nMón sẽ nghiền: **${encounter.targetName}** [${rarityLabel(encounter.targetRarity)}].` : ""}${surpriseChanceLines(state, encounter)}\nCó thể bỏ qua hoặc rút thưởng. Kết quả ẩn đã lưu; mở UI không roll lại.`
        : "❓ **Lối đi bí ẩn từ run cũ** · Khám phá hoặc bỏ qua; giữ nguyên kết quả đã lưu.";
    if (encounter.type === "trap") {
      const names = {
        tax_collector: "🧾 TAX COLLECTOR",
        potion_thief: "🦹 KẺ TRỘM BÌNH MÁU",
        wrong_portal: `${icon("cyclone")} WRONG PORTAL`,
      };
      const mark = { good: "🟢", mixed: "🟡", bad: "🔴" };
      const outcomes = (trapOdds(state, encounter) || [])
        .map(
          (item) =>
            `${mark[item.tone]} **${percentText(item.chance)}** · ${item.text}`,
        )
        .join("\n");
      const note =
        encounter.kind === "wrong_portal"
          ? "LUCK không đổi Portal. Đích đến đã lưu; có thể rút trước khi chấp nhận."
          : `🍀 Lucky Break hiện tại: **${percentText(luckyBreakChance(state))}** (theo LUCK).`;
      return `**${names[encounter.kind]}**\nChọn **Chấp nhận số phận**, kết quả có thể là:\n${outcomes}\n${note}`;
    }
    return "🕳️ **PHÒNG TRỐNG**\nBấm **Đi tiếp** để vượt tầng. Có thể rút thưởng thay vì tiếp tục.";
  }

  function encounterSummary(state) {
    const e = state.encounter;
    if (state.phase === "upgrade")
      return `🎁 **Chọn nâng cấp** · Đã vượt tầng ${e.milestone}`;
    if (state.phase === "summit")
      return "🏆 **Đã chinh phục tầng 999** · Rút thưởng để hoàn tất.";
    const servicePreview = equipmentServicePreview(state);
    if (servicePreview) return servicePreview;
    if (e.type === "combat")
      return `${monsterIcon(e)} **${e.name}** · ${rankLabel(e.rank)}\n${healthBar(e.hp, e.maxHp)}\n${STAT_EMOJI.attack} ATK ${formatCoins(e.damageMin)}–${formatCoins(e.damageMax)} · ${enemyDamageType(e) === "magic" ? "Phép" : enemyDamageType(e) === "physical" ? "Vật lý" : "Hỗn hợp"} · ${STAT_EMOJI.defense} DEF ${formatCoins(e.defense)}\nĐòn kế tiếp: **${e.nextDamageType === "magic" ? "Phép" : "Vật lý"}**`;
    if (e.type === "chest")
      return `📦 **Hòm bí ẩn** · ${e.revealed ? "😈 Đã phát hiện Mimic" : e.inspected ? "Đã kiểm tra" : "Chưa kiểm tra"}`;
    if (e.type === "rngesus")
      return "☠️ **RNGesus** · Không thể thắng hoặc rút thưởng.\nChạy thất bại tự dùng vé nếu còn; hết vé sẽ chết.";
    if (e.type === "shrine")
      return "🗿 **Shrine** · Chạm để nhận hiệu ứng ngẫu nhiên: 50% có lợi, 33% đánh đổi, 17% gây hại.";
    if (e.type === "surprise")
      return SURPRISE_EVENTS[e.kind]
        ? `❓ **${SURPRISE_EVENTS[e.kind].name}**\n${SURPRISE_EVENTS[e.kind].text}`
        : "❓ **Lối đi bí ẩn từ run cũ** · Khám phá hoặc bỏ qua.";
    if (e.type === "trap")
      return (
        {
          tax_collector:
            "🧾 **Tax Collector** · Có thể bị thu một lần 15% payout hiện tại (làm tròn lên 1 xu).",
          potion_thief: "🦹 **Kẻ trộm** · Có thể mất 1 🧪.",
          wrong_portal: `${icon("cyclone")} **Wrong Portal** · ${Math.round((e.portal?.goodChance ?? 0.5) * 100)}% tốt / ${Math.round((1 - (e.portal?.goodChance ?? 0.5)) * 100)}% xấu + Elite đánh phủ đầu.`,
        }[e.kind] || "⚠️ **Bẫy**"
      );
    return "🕳️ **Phòng trống** · Đi tiếp hoặc rút thưởng.";
  }
  return { equipmentServicePreview, encounterText, encounterSummary };
};
