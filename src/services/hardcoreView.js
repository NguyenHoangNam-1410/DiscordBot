const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { formatCoins } = require("../utils/economy");
const {
  baseMultiplier,
  potentialPayout,
  runDiamondReward,
  enemyDamageType,
  serviceCost,
  forgeTarget,
  curseTarget,
  luckyBreakChance,
  itemEffects,
  itemCurse,
  classShrineActive,
  payoutReductionCost,
  SURPRISE_EVENTS,
  CLASS_SHRINE_TEXT,
  surpriseOptions,
  shrineOutcomes,
  surpriseOdds,
  FIXED_SURPRISES,
  trapOdds,
} = require("./hardcoreEngine");
const { regionForFloor, RIFT_MODIFIERS } = require("./hardcoreEngine");
const { resultBlock } = require("../utils/rewardText");
const emojiMap = require("../discordEmojiMap");
const {
  rarityLabel,
  normalizeEquipment,
  effectText,
  STAT_EMOJI,
} = require("./hardcoreEquipment");

const icon = (name, fallback = "•") => emojiMap[`:${name}:`] || fallback;
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
const percentText = (value) => `${(value * 100).toFixed(1).replace(".", ",")}%`;
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
      (item) => `${mark[item.tone]} **${percent(item.chance)}** · ${item.text}`,
    )
    .join(
      "\n",
    )}\n**Tổng:** 🟢 có lợi ${share("good")}% · 🟡 đánh đổi ${share("mixed")}% · 🔴 gây hại ${share("bad")}%.`;
}

const CLASS_PROFILES = Object.freeze({
  amazon: {
    role: "Bắn hai phát, ACC cao",
    effect:
      "Bắn hai phát vật lý, DMG mỗi phát bằng 85% ATK; mỗi phát tính trúng và chí mạng riêng.",
  },
  barbarian: {
    role: "HP cao, đánh vật lý mạnh",
    effect: "Gây DMG vật lý bằng 165% ATK.",
  },
  assassin: {
    role: "EVA và CRIT cao",
    effect: "Gây DMG vật lý bằng 130% ATK và né hoàn toàn đòn phản công.",
  },
  sorceress: {
    role: "Sát thương phép mạnh",
    effect:
      "Gây DMG phép bằng 210% ATK, luôn trúng; chịu ảnh hưởng kháng phép của quái.",
  },
  druid: {
    role: "ATK và hồi HP",
    effect:
      "Gây DMG vật lý bằng 135% ATK, hồi 12% HP tối đa (không vượt HP tối đa).",
  },
  necromancer: {
    role: "Nhiều ENE, chặn phản công",
    effect:
      "Gây DMG phép bằng 155% ATK, luôn trúng, chặn hoàn toàn đòn phản công.",
  },
  paladin: {
    role: "DEF và RES cao",
    effect:
      "Gây DMG vật lý bằng 140% ATK rồi thủ: DEF ×2, miễn chí mạng, giảm thêm 40% sát thương phản công sau giảm trừ (tối thiểu 1).",
  },
});

function hardcoreSetupPayload(draft, classes, context) {
  const character = classes[draft.classKey];
  const affordable = Math.min(context.balance, context.maxBet);
  const validStake =
    Number.isSafeInteger(draft.stake) &&
    draft.stake >= 10 &&
    draft.stake <= affordable;
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("⚔️ SINH TỒN · CHUẨN BỊ RUN")
    .setDescription(
      "**1. Chọn nhân vật** để xem chỉ số và kỹ năng.\n**2. Nhập xu** để đặt mức cược.\n**3. Bắt đầu** khi đã chọn xong; xu được giữ cho run lúc xác nhận.",
    )
    .addFields(
      {
        name: "🎲 Cược đã chọn",
        value:
          draft.stake == null
            ? "Chưa nhập"
            : `${formatCoins(draft.stake)} xu${validStake ? "" : " · Không hợp lệ"}`,
        inline: true,
      },
      {
        name: "📏 Giới hạn cược",
        value: `10–${formatCoins(context.maxBet)} xu. Xem số dư qua /hoso.`,
        inline: true,
      },
    );
  if (character) {
    embed.addFields(
      {
        name: `${context.gameplayVersion === 2 ? require("./hardcoreStats").CLASSES[draft.classKey].emoji : character.emoji} ${character.name}`,
        value: CLASS_PROFILES[draft.classKey].role,
      },
      {
        name: "📊 Chỉ số ban đầu",
        value: `${healthBar(character.hp, character.hp)}\n${STAT_EMOJI.attack} ATK ${character.damageMin}–${character.damageMax} · ${STAT_EMOJI.defense} DEF ${character.defense} · ${STAT_EMOJI.resistance} RES ${character.resistance}%\n${STAT_EMOJI.energy} ENE ${character.energy}/${character.energy} · ${STAT_EMOJI.potions} POT 3 · ${STAT_EMOJI.tickets} Vé 0\n${STAT_EMOJI.accuracy} ACC ${character.accuracy} · ${STAT_EMOJI.evasion} EVA ${character.evasion} · ${STAT_EMOJI.crit} CRIT ${Math.round(character.critChance * 100)}% · ${STAT_EMOJI.luck} LUCK 0`,
      },
      {
        name: `✨ ${character.skill} · 2 ENE`,
        value: CLASS_PROFILES[draft.classKey].effect,
      },
    );
    if (context.gameplayVersion === 2) {
      const preview = require("./hardcoreV2View").setupPreview(draft.classKey);
      const fields = embed.data.fields.filter(
        (field) =>
          !["📊 Chỉ số ban đầu", `✨ ${character.skill} · 2 ENE`].includes(
            field.name,
          ),
      );
      embed.setFields(fields).addFields(
        { name: "📊 Chỉ số ban đầu · v2.0.1", value: preview.stats },
        { name: `✨ ${character.skill} · 2 Mana`, value: preview.skill },
        {
          name: "Sở trường class",
          value: `Sức mạnh ×${preview.power}; đã tính vào dải sát thương ở trên.`,
        },
      );
    }
  } else
    embed.addFields({
      name: "🧙Chọn một trong 7 nhân vật",
      value: Object.values(classes)
        .map(
          (entry) =>
            `${entry.emoji} **${entry.name}** · ${STAT_EMOJI.hp} HP ${entry.hp} · ${STAT_EMOJI.attack} ATK ${entry.damageMin}–${entry.damageMax} · ${STAT_EMOJI.defense} DEF ${entry.defense}`,
        )
        .join("\n"),
    });
  if (!character && context.gameplayVersion === 2) {
    const fields = embed.data.fields.filter(
      (field) => field.name !== "🧙Chọn một trong 7 nhân vật",
    );
    const v2Classes = require("./hardcoreStats").CLASSES;
    embed.setFields(fields).addFields({
      name: "🧙Chọn một trong 7 nhân vật · v2",
      value: Object.values(v2Classes)
        .map(
          (c) =>
            `${c.emoji} **${c.name}** · STR ${c.str} / DEX ${c.dex} / VIT ${c.vit} / ENE ${c.ene}`,
        )
        .join("\n"),
    });
  }
  embed
    .addFields({
      name: "📖 Ký hiệu",
      value:
        context.gameplayVersion === 2
          ? "STR/DEX/VIT/ENE tạo chỉ số chiến đấu. ENE là thuộc tính, Mana là tài nguyên dùng skill. Rút thưởng mới nhận xu/gem; tử trận mất toàn bộ. Mỗi 5 tầng: hồi đầy HP, thêm 2 bình, chọn +5 thuộc tính."
          : "❤️ HP · ⚔️ ATK · 🛡️ DEF · 🎯 ACC · 💨 EVA · 💥 CRIT · 🔮 RES · ✨ ENE · 🍀 LUCK · 🧪 POT · 🎫 vé.\nRút thưởng để chốt xu và kim cương tạm giữ; tử trận mất toàn bộ. Mỗi 5 tầng có checkpoint hồi đầy HP.",
    })
    .setFooter({
      text: `Sinh tồn ${context.gameplayVersion === 2 ? "v2.0.1 · " : "legacy · "}Bảng chuẩn bị hết hạn sau 5 phút không thao tác.`,
    });
  const customId = (action) =>
    `hardcore-setup:${draft.id}:${draft.version}:${action}`;
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId("class"))
    .setPlaceholder("Chọn nhân vật và xem kỹ năng")
    .addOptions(
      Object.entries(classes).map(([value, entry]) => ({
        label: entry.name,
        value,
        emoji:
          context.gameplayVersion === 2
            ? require("./hardcoreStats").CLASSES[value].emoji
            : entry.emoji,
        description: CLASS_PROFILES[value].role,
        default: value === draft.classKey,
      })),
    );
  return {
    content: "",
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId("bet"))
          .setLabel(draft.stake == null ? "Nhập xu" : "Đổi mức cược")
          .setEmoji("💰")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(customId("start"))
          .setLabel("Bắt đầu")
          .setEmoji("⚔️")
          .setStyle(ButtonStyle.Success)
          .setDisabled(!character || !validStake),
        new ButtonBuilder()
          .setCustomId(customId("cancel"))
          .setLabel("Hủy")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

function hardcoreBetModal(draft, maxBet) {
  const amount = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel(`Số xu cược (10–${formatCoins(maxBet)})`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(6)
    .setPlaceholder("Ví dụ: 1000 (chỉ nhập chữ số)");
  if (draft.stake != null) amount.setValue(String(draft.stake));
  return new ModalBuilder()
    .setCustomId(`hardcore-setup-modal:${draft.id}:${draft.version}:bet`)
    .setTitle("Sinh tồn · Nhập số xu cược")
    .addComponents(new ActionRowBuilder().addComponents(amount));
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
    if (!target) return "🔨 **THỢ RÈN**\nChưa có trang bị phù hợp để nâng cấp.";
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
    return `⚒️ **HORADRIC FORGE** · **${target.name} Lv.${level}** [${rarityLabel(target.rarity)}]\n**Mất:** 1 level. ${level === 1 ? "Món này sẽ bị xóa." : `Món còn Lv.${level - 1}.`} Không tốn xu.\n**Hiệu ứng level bị gỡ:** ${removed} (theo phần đã áp dụng và giới hạn hiện tại).\n**Giữ:** các món khác, level còn lại và vật tư đã nhận khi nhặt. HP/ENE hiện tại có thể giảm nếu chỉ số tối đa giảm.\n**Lời nguyền:** nếu level bị nghiền còn nguyền, gỡ lớp đó và hoàn phần phạt; các lớp khác giữ nguyên.\n**Chọn đúng 1 bonus:** +3 ATK; +4 DEF; +10 MAX HP và hồi tối đa 10 HP${ticket ? "; hoặc +1 Vé Thoát Hiểm" : ". Vé chỉ đổi được từ SSR/UR"}.\nVé giữ tối đa 1; đang có vé thì vé mới bị bỏ. Bỏ qua để giữ nguyên món.`;
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
function chaosLabel(state) {
  const chance = state.lastChaosChance || 0;
  if (!chance) return `${icon("large_green_circle")} Chaos: Yên`;
  if (chance < 0.01) return `${icon("large_green_circle")} Chaos: Thấp`;
  if (chance < 0.03) return `${icon("large_yellow_circle")} Chaos: Bất ổn`;
  return `${icon("red_circle")} Chaos: NGUY HIỂM${state.lastChaosSpike ? " · SPIKE" : ""}`;
}
function signed(value, percent = false) {
  const amount = percent ? Math.round(value * 100) : value;
  return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${formatCoins(Math.abs(amount))}${percent ? "%" : ""}`;
}
function change(state, key, percent = false) {
  const amount = state.lastStatChanges?.[key] || 0;
  return amount ? ` (${signed(amount, percent)})` : "";
}
function statLine(state, showChanges = true) {
  const hpChange = state.lastStatChanges?.hp || 0;
  const maxHpChange = state.lastStatChanges?.maxHp || 0;
  const hpDelta =
    showChanges && (hpChange || maxHpChange)
      ? ` (${signed(hpChange)}/${signed(maxHpChange)})`
      : "";
  const minChange = state.lastStatChanges?.damageMin || 0;
  const maxChange = state.lastStatChanges?.damageMax || 0;
  const damageDelta =
    showChanges && (minChange || maxChange)
      ? ` (${minChange === maxChange ? signed(minChange) : `${signed(minChange)}/${signed(maxChange)}`})`
      : "";
  const delta = (key, percent = false) =>
    showChanges ? change(state, key, percent) : "";
  return [
    `${healthBar(state.hp, state.maxHp)}${hpDelta}`,
    `${STAT_EMOJI.energy} ENE **${state.energy}/${state.maxEnergy}**${delta("energy")} · ${STAT_EMOJI.potions} POT ${state.potions} · ${STAT_EMOJI.tickets} Vé ${state.escapeTokens}`,
    `${STAT_EMOJI.attack} ATK ${formatCoins(state.damageMin)}–${formatCoins(state.damageMax)}${damageDelta} · ${STAT_EMOJI.defense} DEF ${formatCoins(state.defense)}${delta("defense")} · ${STAT_EMOJI.resistance} RES ${state.resistance}%${delta("resistance")}`,
    ...(showChanges
      ? [
          `${STAT_EMOJI.accuracy} ACC ${state.accuracy} · ${STAT_EMOJI.evasion} EVA ${state.evasion}${delta("evasion")}\n${STAT_EMOJI.crit} CRIT ${Math.round(state.critChance * 100)}%${delta("critChance", true)} · ${STAT_EMOJI.luck} LUCK ${state.luck}${delta("luck")}`,
        ]
      : [`${STAT_EMOJI.luck} LUCK **${state.luck || 0}**`]),
  ].join("\n");
}
function ownedEquipment(state, itemCatalog) {
  return normalizeEquipment(state.items).map((item) => ({
    ...item,
    definition:
      item.definition ||
      (itemCatalog[item.rarity] || []).find(
        (entry) => entry.name === item.name,
      ),
  }));
}
function equipmentSummary(state, itemCatalog) {
  const items = ownedEquipment(state, itemCatalog);
  if (!items.length) return "Chưa có trang bị.";
  const totals = {};
  for (const item of items) {
    const buffs = { ...itemEffects(item.definition) };
    const curses = item.rarity === "cursed" ? itemCurse(item.definition) : {};
    if (!item.definition?.effects && item.rarity === "cursed")
      for (const key of Object.keys(curses)) delete buffs[key];
    for (const [key, value] of Object.entries(buffs))
      if (typeof value === "number")
        totals[key] = (totals[key] || 0) + value * item.level;
    for (const [key, value] of Object.entries(curses))
      totals[key] =
        (totals[key] || 0) +
        value * Math.max(0, item.level - (item.cleansedLevels || 0));
  }
  const effects = [
    ["attack", `${STAT_EMOJI.attack} ATK`],
    ["defense", `${STAT_EMOJI.defense} DEF`],
    ["maxHp", `${STAT_EMOJI.hp} MAX HP`],
    ["resistance", `${STAT_EMOJI.resistance} RES`],
    ["critChance", `${STAT_EMOJI.crit} CRIT`],
    ["luck", `${STAT_EMOJI.luck} LUCK`],
    ["accuracy", `${STAT_EMOJI.accuracy} ACC`],
    ["evasion", `${STAT_EMOJI.evasion} EVA`],
    ["maxEnergy", `${STAT_EMOJI.energy} MAX ENE`],
    ["potionPower", "Hồi bình"],
    ["bossDamage", `${STAT_EMOJI.attack} DMG lên Boss`],
    ["eliteDamage", `${STAT_EMOJI.attack} DMG lên Elite`],
    ["mimicDetection", "Phát hiện Mimic"],
    ["goblinChance", "Bắt Goblin"],
    ["legendaryFind", "SSR"],
    ["floorHpLoss", "HP mất/tầng"],
    ["mimicChance", "Mimic"],
    ["damageTaken", `${STAT_EMOJI.attack} DMG nhận`],
  ]
    .filter(([key]) => totals[key])
    .map(
      ([key, label]) =>
        `${label} ${signed(totals[key], ["critChance", "potionPower", "bossDamage", "eliteDamage", "mimicDetection", "goblinChance", "legendaryFind", "floorHpLoss", "mimicChance", "damageTaken"].includes(key))}${key === "resistance" ? "%" : ""}`,
    );
  if (
    items.some(
      (item) =>
        itemCurse(item.definition).defenseSet !== undefined &&
        item.level > (item.cleansedLevels || 0),
    )
  )
    effects.push(`${STAT_EMOJI.defense} DEF đặt lại khi nhặt`);
  if (items.some((item) => !item.definition))
    effects.push("có hiệu ứng chưa rõ");
  return `${items.length} món${effects.length ? ` · ${effects.join(" · ")}` : ""}`.slice(
    0,
    950,
  );
}
function riftSummary(state) {
  const m = state.modifiers || {};
  const effects = [];
  if (m.fortified)
    effects.push(`${STAT_EMOJI.hp} HP quái +${m.fortified * 10}%`);
  if (m.stone_skin)
    effects.push(
      `${STAT_EMOJI.defense} DEF quái ×${(1.1 ** m.stone_skin).toFixed(2)}`,
    );
  if (m.elemental_dominion)
    effects.push(
      `${STAT_EMOJI.attack} ATK quái +${m.elemental_dominion * 4}% · Phép +${m.elemental_dominion * 4} điểm % (trừ boss, tỷ lệ tối đa 75%)`,
    );
  if (m.bloodlust) effects.push(`ATK quái +${m.bloodlust * 8}% khi HP ≤50%`);
  if (m.swift_horror)
    effects.push(
      `${STAT_EMOJI.accuracy} ACC quái +${m.swift_horror * 3} · ${STAT_EMOJI.evasion} EVA quái +${m.swift_horror}`,
    );
  if (m.soul_drain)
    effects.push(
      `${STAT_EMOJI.energy} ENE −${m.soul_drain >= 5 ? 2 : 1}/đòn trúng`,
    );
  if (m.cursed_ground)
    effects.push(
      `${STAT_EMOJI.resistance} RES hiệu dụng −${m.cursed_ground * 4} khi nhận phép, thấp nhất −50%; chỉ số gốc giữ nguyên`,
    );
  if (m.unstable_rift)
    effects.push(
      `Hòm thường/kho báu mỗi loại +${Math.min(16, m.unstable_rift * 2) / 2} điểm % · SSR kho báu ${Math.min(70, 35 + m.unstable_rift * 5)}% · Mimic ${Math.min(30, 15 + m.unstable_rift * 3)}% (Ancient ${Math.min(8, 3 + m.unstable_rift)}%) trước item`,
    );
  return effects.length
    ? effects.join("\n")
    : "Chưa có hiệu ứng Rift · Nhận lần đầu sau tầng 10.";
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
    return `👹 **${e.name}** · ${rankLabel(e.rank)}\n${healthBar(e.hp, e.maxHp)}\n${STAT_EMOJI.attack} ATK ${formatCoins(e.damageMin)}–${formatCoins(e.damageMax)} · ${enemyDamageType(e) === "magic" ? "Phép" : enemyDamageType(e) === "physical" ? "Vật lý" : "Hỗn hợp"} · ${STAT_EMOJI.defense} DEF ${formatCoins(e.defense)}\nĐòn kế tiếp: **${e.nextDamageType === "magic" ? "Phép" : "Vật lý"}**`;
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
        tax_collector: "🧾 **Tax Collector** · Có thể mất 15% payout hiện tại.",
        potion_thief: "🦹 **Kẻ trộm** · Có thể mất 1 🧪.",
        wrong_portal: `${icon("cyclone")} **Wrong Portal** · ${Math.round((e.portal?.goodChance ?? 0.5) * 100)}% tốt / ${Math.round((1 - (e.portal?.goodChance ?? 0.5)) * 100)}% xấu + Elite đánh phủ đầu.`,
      }[e.kind] || "⚠️ **Bẫy**"
    );
  return "🕳️ **Phòng trống** · Đi tiếp hoặc rút thưởng.";
}
function briefLog(state) {
  const text = String(state.lastLog || "—")
    .split("\n")
    .slice(0, 3)
    .join("\n");
  return text.length > 360 ? `${text.slice(0, 357)}…` : text;
}

const DETAIL_TABS = Object.freeze([
  ["stats", "Chỉ số", "bar_chart"],
  ["items", "Vật phẩm", "school_satchel"],
  ["effects", "Rift & hiệu ứng", "cyclone"],
  ["encounter", "Tình huống", "information_source"],
]);
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
      value: `${STAT_EMOJI.potions} **Bình máu ×${state.potions || 0}** · Hồi ${Math.round(Math.max(0.1, Math.min(0.75, 0.35 + (state.potionPower || 0))) * 100)}% MAX HP, tối thiểu 20 HP; quái còn sống phản công.\n${STAT_EMOJI.tickets} **Vé Thoát Hiểm ×${state.escapeTokens || 0}** · Tối đa 1, nhận thêm bị bỏ. Dùng để vượt RNGesus hoặc tự dùng khi chạy thất bại; chạy thành công giữ vé.`,
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
        value: `Có thể rút: **${formatCoins(potentialPayout(state))} xu**\n💎 Tạm giữ: **${formatCoins(runDiamondReward(state))}** kim cương. Vượt 100: 100; mỗi 100 tầng tiếp theo nhân đôi; hạ boss 999: 51.200. Rút thưởng mới nhận; chết mất hết.\nHệ số tầng/checkpoint ×${baseMultiplier(state).toFixed(2)} · hệ số phạt ×${Number(state.payoutFactor).toFixed(3)}\nUR còn nguyền: −${Math.round((1 - curseFactor) * 100)}% · Wrong Portal: −${Math.round((1 - (state.portalPayoutFactor || 1)) * 100)}%\nĐã chi từ payout: ${formatCoins(state.payoutSpent || 0)} xu. Thuế/hối lộ/Goblin nhân hệ số payout.\nMốc 5/50/100: ×1,45/×5,50/×12,00; hệ số dừng sau 100, bonus tiếp tục tăng. Trần 10.000.000 xu.`,
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
      effectFields.slice(page * effectsPageSize, (page + 1) * effectsPageSize),
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
function hardcoreEmbed(
  state,
  userId,
  result,
  classes,
  sessionId = null,
  itemCatalog = {},
) {
  const classInfo = classes[state.classKey];
  const payout = potentialPayout(state);
  const classIcon =
    {
      barbarian: icon("axe"),
      assassin: icon("dagger_knife"),
      sorceress: icon("crystal_ball"),
    }[state.classKey] || classInfo.emoji;
  const embed = new EmbedBuilder()
    .setColor(
      result
        ? result.outcome === "win"
          ? 0x2ecc71
          : 0xe74c3c
        : state.hp <= state.maxHp * 0.3
          ? 0xe74c3c
          : state.encounter.type !== "combat"
            ? 0x3498db
            : state.floor > 100
              ? 0x9b59b6
              : 0xe67e22,
    )
    .setTitle(
      `${classIcon} SINH TỒN legacy · TẦNG ${state.floor}${state.floor > 100 ? " · OVERRUN" : ""}`,
    )
    .setDescription(
      `${icon("bust_in_silhouette")} <@${userId}> · **${regionForFloor(state.floor).name}**`,
    )
    .addFields(
      {
        name: classInfo.name,
        value: statLine(state, false),
        inline: false,
      },
      {
        name: state.encounter.type === "combat" ? "Đối thủ" : "Tình huống",
        value: encounterSummary(state),
        inline: false,
      },
      {
        name: `${icon("compass")} Tiến trình`,
        value: `Đã vượt ${state.cleared} · Boss ${state.bosses} · Modifier ${Object.values(state.modifiers || {}).reduce((total, count) => total + count, 0)}\n${chaosLabel(state)}`,
        inline: false,
      },
      {
        name: `${icon("cyclone")} Rift modifier`,
        value:
          Object.entries(state.modifiers || {})
            .filter(([, stacks]) => stacks > 0)
            .map(
              ([key, stacks]) =>
                `${RIFT_MODIFIERS[key]?.name || key} ×${stacks}`,
            )
            .join(" · ") || "Chưa có · Nhận lần đầu sau tầng 10.",
        inline: false,
      },
      {
        name: `${icon("moneybag")} Rút thưởng`,
        value: result
          ? `Đã nhận **${formatCoins(result.payout)} ${icon("coin")}** - **${formatCoins(result.diamonds || 0)} ${icon("gem")}**`
          : state.cleared
            ? `**${formatCoins(payout)} ${icon("coin")}** - **${formatCoins(runDiamondReward(state))} ${icon("gem")}**`
            : "Chưa thể rút",
        inline: true,
      },
      {
        name: "🎒 Trang bị",
        value: `${equipmentSummary(state, itemCatalog).slice(0, 400)}${state.payoutFactor < 1 ? `\nPayout sau phạt ×${Number(state.payoutFactor).toFixed(3)}` : ""}${state.contract ? `\nHợp đồng: không ${{ potion: "bình", skill: "skill", defend: "thủ" }[state.contract.kind]} · ${state.contract.remaining} tầng` : ""}${classShrineActive(state) ? `\nClass Shrine · hết sau tầng ${state.classShrine.until}` : ""}`,
        inline: false,
      },
      {
        name: `${icon("scroll")} Lượt vừa rồi`,
        value: briefLog(state),
        inline: false,
      },
    );
  if (result) {
    const won = result.reason === "cashout" || result.reason === "summit";
    const reason = won
      ? `rút thưởng tầng ${state.floor}`
      : result.reason === "forfeit"
        ? "bỏ run"
        : `${icon("skull")} tử trận tầng ${state.floor}`;
    embed.addFields({
      name: `${icon("checkered_flag")} KẾT QUẢ`,
      value: resultBlock({
        userId,
        outcome: result.outcome,
        stake: state.stake,
        payout: result.payout,
        result,
        reason,
      }),
    });
    embed.addFields({
      name: `${icon("gem")} Kim cương Sinh tồn`,
      value: won
        ? `Đã cộng **${formatCoins(result.diamonds || 0)}** kim cương vào tài khoản.`
        : `Mất **${formatCoins(result.diamondsLost || 0)}** kim cương tạm giữ.`,
    });
    if (result.achievements?.length)
      embed.addFields({
        name: `${icon("sports_medal")} Thành tựu mới`,
        value: result.achievements.map((item) => `**${item.name}**`).join("\n"),
      });
  } else
    embed.setFooter({
      text: `${sessionId ? `Mã ván: ${sessionId} • ` : ""}Lượt ${state.turn} • Cược ${formatCoins(state.stake)} xu • /sinhton tieptuc`,
    });
  return embed;
}
function button(
  sessionId,
  turn,
  action,
  label,
  emoji,
  style,
  disabled = false,
) {
  return new ButtonBuilder()
    .setCustomId(`hardcore:${sessionId}:${turn}:${action}`)
    .setLabel(label)
    .setEmoji(icon(emoji))
    .setStyle(style)
    .setDisabled(disabled);
}
function hardcoreActionRows(sessionId, state, disabled, classes) {
  if (disabled)
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`replay:hardcore:${state.stake}:${state.classKey}`)
          .setLabel("Chơi lại")
          .setEmoji(icon("repeat"))
          .setStyle(ButtonStyle.Success),
      ),
    ];
  const turn = state.turn;
  const retreat = button(
    sessionId,
    turn,
    "retreat",
    state.cleared ? "Rút thưởng" : "Bỏ run",
    state.cleared ? "moneybag" : "waving_white_flag",
    ButtonStyle.Danger,
  );
  if (state.phase === "summit")
    return [new ActionRowBuilder().addComponents(retreat)];
  if (state.phase === "upgrade")
    return [
      new ActionRowBuilder().addComponents(
        button(
          sessionId,
          turn,
          "upgrade_attack",
          "ATK +5",
          "crossed_swords",
          ButtonStyle.Primary,
        ),
        button(
          sessionId,
          turn,
          "upgrade_hp",
          "MAX HP +30",
          "heart",
          ButtonStyle.Success,
        ),
        button(
          sessionId,
          turn,
          "upgrade_defense",
          "DEF +6",
          "shield",
          ButtonStyle.Secondary,
        ),
        button(
          sessionId,
          turn,
          "upgrade_luck",
          "LUCK +2",
          "four_leaf_clover",
          ButtonStyle.Secondary,
        ),
        retreat,
      ),
    ];
  const type = state.encounter.type;
  if (type === "combat")
    return [
      new ActionRowBuilder().addComponents(
        button(
          sessionId,
          turn,
          "attack",
          "Tấn công",
          "crossed_swords",
          ButtonStyle.Primary,
        ),
        button(
          sessionId,
          turn,
          "defend",
          "Phòng thủ",
          "shield",
          ButtonStyle.Secondary,
        ),
        button(
          sessionId,
          turn,
          "skill",
          classes[state.classKey].skill,
          "sparkles",
          ButtonStyle.Success,
          state.energy < 2 &&
            !(state.classKey === "sorceress" && classShrineActive(state)),
        ),
        button(
          sessionId,
          turn,
          "potion",
          `Bình máu (${state.potions})`,
          "test_tube",
          ButtonStyle.Secondary,
          state.potions <= 0 || state.hp >= state.maxHp,
        ),
        retreat,
      ),
    ];
  if (type === "chest")
    return [
      new ActionRowBuilder().addComponents(
        button(
          sessionId,
          turn,
          "open",
          "Mở hòm",
          "unlock",
          ButtonStyle.Primary,
        ),
        button(
          sessionId,
          turn,
          "inspect",
          "Kiểm tra",
          "eye",
          ButtonStyle.Secondary,
          state.encounter.inspected,
        ),
        button(
          sessionId,
          turn,
          "sell",
          "Bán hòm",
          "dollar",
          ButtonStyle.Success,
        ),
        button(
          sessionId,
          turn,
          "leave",
          "Tránh Mimic",
          "door",
          ButtonStyle.Secondary,
          !state.encounter.revealed,
        ),
        retreat,
      ),
    ];
  if (type === "shrine")
    return [
      new ActionRowBuilder().addComponents(
        button(
          sessionId,
          turn,
          "touch",
          "Chạm Shrine",
          "moyai",
          ButtonStyle.Primary,
        ),
        button(
          sessionId,
          turn,
          "ignore",
          "Bỏ qua",
          "walking",
          ButtonStyle.Secondary,
        ),
        retreat,
      ),
    ];
  if (type === "rngesus")
    return [
      new ActionRowBuilder().addComponents(
        button(
          sessionId,
          turn,
          "fight",
          "Chiến đấu",
          "crossed_swords",
          ButtonStyle.Danger,
        ),
        button(
          sessionId,
          turn,
          "flee",
          "Bỏ chạy 75%",
          "running",
          ButtonStyle.Primary,
        ),
        button(
          sessionId,
          turn,
          "bribe",
          `Hối lộ · ${formatCoins(payoutReductionCost(state, 0.4))} xu`,
          "money_with_wings",
          ButtonStyle.Secondary,
        ),
        button(
          sessionId,
          turn,
          "pray",
          `Cầu nguyện ${Math.round((state.encounter.prayerChance ?? 0.3) * 100)}%`,
          "pray",
          ButtonStyle.Success,
        ),
        button(
          sessionId,
          turn,
          "ticket",
          "Dùng vé",
          "ticket",
          ButtonStyle.Secondary,
          state.escapeTokens <= 0,
        ),
      ),
    ];
  if (type === "surprise") {
    const actions = surpriseOptions(state).map((choice) =>
      button(
        sessionId,
        turn,
        choice.action,
        choice.label,
        "sparkles",
        ButtonStyle.Primary,
        choice.disabled,
      ),
    );
    actions.push(
      button(
        sessionId,
        turn,
        "ignore",
        state.encounter.kind === "adventurer" ? "Bỏ mặc" : "Bỏ qua",
        "walking",
        ButtonStyle.Secondary,
      ),
      retreat,
    );
    const rows = [];
    for (let offset = 0; offset < actions.length; offset += 5)
      rows.push(
        new ActionRowBuilder().addComponents(actions.slice(offset, offset + 5)),
      );
    return rows;
  }
  if (type === "blacksmith" || type === "cleanse") {
    const cost = serviceCost(state, type);
    const eligible =
      type === "blacksmith" ? forgeTarget(state) : curseTarget(state);
    return [
      new ActionRowBuilder().addComponents(
        button(
          sessionId,
          turn,
          type === "blacksmith" ? "forge" : "cleanse",
          `${type === "blacksmith" ? "Rèn" : "Giải nguyền"} · ${formatCoins(cost)} xu`,
          type === "blacksmith" ? "hammer" : "sparkles",
          ButtonStyle.Success,
          !eligible ||
            potentialPayout(state) <= 0 ||
            potentialPayout(state) < cost,
        ),
        button(
          sessionId,
          turn,
          "ignore",
          "Bỏ qua",
          "walking",
          ButtonStyle.Secondary,
        ),
        retreat,
      ),
    ];
  }
  return [
    new ActionRowBuilder().addComponents(
      button(
        sessionId,
        turn,
        "continue",
        type === "trap"
          ? state.encounter.kind === "tax_collector"
            ? `Thuế · ${formatCoins(payoutReductionCost(state, 0.15))} xu`
            : "Chấp nhận số phận"
          : "Đi tiếp",
        "arrow_right",
        ButtonStyle.Primary,
      ),
      retreat,
    ),
  ];
}
function hardcoreRows(sessionId, state, disabled, classes) {
  const rows = hardcoreActionRows(sessionId, state, disabled, classes);
  if (!disabled)
    rows.push(
      detailButtons(
        sessionId,
        state.turn,
        null,
        null,
        normalizeEquipment(state.items).length,
      ),
    );
  return rows;
}
module.exports = {
  rankLabel,
  encounterText,
  chaosLabel,
  hardcoreEmbed,
  hardcoreRows,
  hardcoreSetupPayload,
  hardcoreBetModal,
  hardcorePrivatePayload,
};
