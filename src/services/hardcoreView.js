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
  enemyDamageType,
  serviceCost,
  forgeTarget,
  curseTarget,
  luckyBreakChance,
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
  const color = ratio > 0.5 ? "🟩" : ratio > 0.25 ? "🟨" : "🟥";
  return `${STAT_EMOJI.hp} ${color.repeat(filled)}${"⬛".repeat(segments - filled)} **${formatCoins(current)}/${formatCoins(maximum)}**`;
}
function emojiStats(text) {
  return String(text)
    .replace(/HP tối đa/g, `${STAT_EMOJI.hp} tối đa`)
    .replace(/\bHP\b/g, STAT_EMOJI.hp)
    .replace(/All Resistance|Resistance|kháng phép/g, STAT_EMOJI.resistance)
    .replace(/Defense/g, STAT_EMOJI.defense)
    .replace(/Accuracy/g, STAT_EMOJI.accuracy)
    .replace(/Evasion/g, STAT_EMOJI.evasion)
    .replace(/Energy|năng lượng/g, STAT_EMOJI.energy)
    .replace(/\bLuck\b/g, STAT_EMOJI.luck)
    .replace(/sát thương|damage/g, STAT_EMOJI.attack)
    .replace(/chí mạng/g, STAT_EMOJI.crit);
}
const CLASS_PROFILES = Object.freeze({
  amazon: {
    role: "Bắn hai phát, Accuracy cao",
    effect:
      "Bắn hai phát vật lý, mỗi phát 85% sát thương; mỗi phát tính trúng và chí mạng riêng.",
  },
  barbarian: {
    role: "HP cao, đánh vật lý mạnh",
    effect: "Gây 165% sát thương vật lý.",
  },
  assassin: {
    role: "Né và chí mạng cao",
    effect: "Gây 130% sát thương vật lý và né hoàn toàn đòn phản công.",
  },
  sorceress: {
    role: "Sát thương phép mạnh",
    effect:
      "Gây 210% sát thương phép, luôn trúng; chịu ảnh hưởng kháng phép của quái.",
  },
  druid: {
    role: "Tấn công và tự hồi máu",
    effect:
      "Gây 135% sát thương vật lý, hồi 12% HP tối đa (không vượt HP tối đa).",
  },
  necromancer: {
    role: "Nhiều Energy, chặn phản công",
    effect:
      "Gây 155% sát thương phép, luôn trúng, chặn hoàn toàn đòn phản công.",
  },
  paladin: {
    role: "Defense và kháng phép cao",
    effect:
      "Gây 140% sát thương vật lý rồi thủ: Defense ×2, giảm thêm 50% sát thương phản công sau giảm trừ (tối thiểu 1).",
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
        name: "💰 Số dư",
        value: `${formatCoins(context.balance)} xu`,
        inline: true,
      },
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
        value: `10–${formatCoins(context.maxBet)} xu${affordable < 10 ? "\nChưa đủ 10 xu để chơi." : `\nHiện có thể cược tối đa ${formatCoins(affordable)} xu.`}`,
        inline: true,
      },
    );
  if (character) {
    embed.addFields(
      {
        name: `${character.emoji} ${character.name}`,
        value: emojiStats(CLASS_PROFILES[draft.classKey].role),
      },
      {
        name: "📊 Chỉ số ban đầu",
        value: `${healthBar(character.hp, character.hp)}\n${STAT_EMOJI.attack} ${character.damageMin}–${character.damageMax} · ${STAT_EMOJI.defense} ${character.defense} · ${STAT_EMOJI.accuracy} ${character.accuracy}\n${STAT_EMOJI.evasion} ${character.evasion} · ${STAT_EMOJI.crit} ${Math.round(character.critChance * 100)}% ×1,75 · ${STAT_EMOJI.resistance} ${character.resistance}%\n${STAT_EMOJI.energy} ${character.energy}/${character.energy} · ${STAT_EMOJI.luck} 0 · ${STAT_EMOJI.potions} 3 · ${STAT_EMOJI.tickets} 0`,
      },
      {
        name: `✨ ${character.skill} · tốn 2 ✨`,
        value: emojiStats(CLASS_PROFILES[draft.classKey].effect),
      },
    );
  } else
    embed.addFields({
      name: "🧙 Chọn một trong 7 nhân vật",
      value: Object.values(classes)
        .map(
          (entry) =>
            `${entry.emoji} **${entry.name}** · ${STAT_EMOJI.hp} ${entry.hp} · ${STAT_EMOJI.attack} ${entry.damageMin}–${entry.damageMax} · ${STAT_EMOJI.defense} ${entry.defense}`,
        )
        .join("\n"),
    });
  embed
    .addFields({
      name: "📖 Ký hiệu",
      value:
        "❤️ HP · ⚔️ sát thương · 🛡️ phòng thủ · 🎯 chính xác · 💨 né · 💥 chí mạng · 🔮 kháng phép · ✨ năng lượng · 🍀 Luck · 🧪 bình máu · 🎫 vé.\nRút thưởng để chốt payout; tử trận mất cược. Mỗi 5 tầng có checkpoint hồi đầy HP.",
    })
    .setFooter({ text: "Bảng chuẩn bị hết hạn sau 5 phút không thao tác." });
  const customId = (action) =>
    `hardcore-setup:${draft.id}:${draft.version}:${action}`;
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId("class"))
    .setPlaceholder("Chọn nhân vật và xem kỹ năng")
    .addOptions(
      Object.entries(classes).map(([value, entry]) => ({
        label: entry.name,
        value,
        emoji: entry.emoji,
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
function encounterText(state) {
  const encounter = state.encounter;
  if (state.phase === "upgrade")
    return `${icon("gift")} **NÂNG CẤP SAU MỐC TẦNG ${encounter.milestone}**\nChọn đúng một nút để nhận nâng cấp trong phần còn lại của run. +HP tăng giới hạn tối đa và hồi 30 HP; Rút thưởng chốt payout.`;
  if (state.phase === "summit")
    return `${icon("trophy")} **ĐÃ CHINH PHỤC TẦNG 999**\nĐây là giới hạn Sinh tồn. Bấm **Rút thưởng** để nhận payout hiện tại.`;
  if (encounter.type === "combat") {
    const skillHint = CLASS_PROFILES[state.classKey].effect;
    const mechanic = {
      butcher:
        "Blood Frenzy: mỗi lần ra đòn +8% sát thương, tối đa 5 cộng dồn.",
      riftwalker: "Miễn nhiễm đòn đầu trong mỗi chu kỳ 3 lần bạn tấn công.",
      assur: "Né cao, 30% chí mạng.",
      lucion: "Hồi HP bằng 35% sát thương gây ra.",
      deimoss: "Abyssal Spires: giảm 25% sát thương nhận vào.",
    }[encounter.mechanic];
    const damageType = {
      physical: "Vật lý cố định",
      magic: "Phép cố định",
      mixed: "Vật lý / phép",
    }[enemyDamageType(encounter)];
    return `${icon("crossed_swords")} **${encounter.name}** · ${rankLabel(encounter.rank)}\n${healthBar(encounter.hp, encounter.maxHp)}\n${icon("crossed_swords")} ${formatCoins(encounter.damageMin)}–${formatCoins(encounter.damageMax)} · ${icon("shield")} ${formatCoins(encounter.defense)}\n**Sát thương:** ${damageType}${mechanic ? `\n**Cơ chế boss:** ${mechanic}` : ""}\n**Tấn công:** đánh và hồi 1 năng lượng. **Phòng thủ:** Defense ×2 và giảm thêm 50% sát thương vật lý/phép sau giảm trừ (tối thiểu 1), hồi 1 năng lượng. **Kỹ năng:** tốn 2 năng lượng — ${skillHint}\n**Bình máu:** hồi 35% HP tối đa; quái vẫn đánh trả nếu còn sống.`;
  }
  if (encounter.type === "chest")
    return `${icon("package")} **HÒM BÍ ẨN**\n${encounter.inspected ? "Đã kiểm tra một lần; kết quả có thể không phát hiện được Mimic." : "Kiểm tra một lần để thử phát hiện Mimic; Mở để nhận đồ hoặc có thể phải đánh Mimic; Bán để lấy thêm 15% tiền cược vào payout."}${encounter.revealed ? `\n${icon("warning")} Mimic đã bị phát hiện: **Tránh Mimic** để đi tiếp an toàn.` : ""}`;
  if (encounter.type === "shrine")
    return `${icon("moyai")} **SHRINE KHÔNG RÕ NGUỒN GỐC**\n**Chạm Shrine** để nhận hiệu ứng ngẫu nhiên (có cả hiệu ứng gây hại), hoặc **Bỏ qua** để đi tiếp.`;
  if (encounter.type === "rngesus")
    return `${icon("skull")} **RNGesus · HP ∞ · KHÔNG THỂ BỊ ĐÁNH BẠI**\nChiến đấu là chết. Bỏ chạy: **75% thành công**; thất bại tự dùng **1 Vé Thoát Hiểm** nếu còn, hết vé thì chết. Chạy thành công giữ vé. Hối lộ: trả 40% payout hiện tại (làm tròn lên); Cầu nguyện: 10% nhận SSR, nếu trượt sẽ chết.`;
  if (encounter.type === "surprise")
    return "❓ **LỐI ĐI BÍ ẨN**\n**Khám phá**: mỗi kết quả 25% — người cứu trợ (hồi 35% HP, nhận 1 bình), Vé Thoát Hiểm, kho xu (+50% tiền cược vào bonus) hoặc Champion phục kích ra đòn trước. **Bỏ qua** để đi tiếp an toàn.";
  if (encounter.type === "blacksmith") {
    const target = forgeTarget(state);
    const cost = serviceCost(state, "blacksmith");
    return `🔨 **THỢ RÈN**\n${target ? `Nâng **${target.name} Lv.${target.level} → ${target.level + 1}**, cộng thêm hiệu ứng: ${effectText(target.definition, 1)}.` : "Chưa có trang bị phù hợp để nâng cấp."}\nƯu tiên SSR → SR → R, rồi cấp thấp nhất; đồ UR và đồ cấp vật tư không thể rèn. Phí **${formatCoins(cost)} xu**, trừ payout đang có của run. Mỗi lần gặp rèn một lần; có thể bỏ qua.`;
  }
  if (encounter.type === "cleanse") {
    const target = curseTarget(state);
    const cost = serviceCost(state, "cleanse");
    return `✨ **GIẢI NGUYỀN**\n${target ? `Gỡ một cộng dồn phạt payout **${Math.round(target.definition.bonusPenalty * 100)}%** của **${target.name}**; còn ${target.level - (target.cleansedLevels || 0)} cộng dồn.` : "Không có lời nguyền payout của trang bị UR cần giải."}\nGiữ chỉ số và cấp trang bị. Phí **${formatCoins(cost)} xu**, trừ payout đang có của run. Thuế, hối lộ và Rift Modifier vẫn áp dụng; có thể bỏ qua.`;
  }
  if (encounter.type === "trap") {
    const names = {
      tax_collector: "🧾 TAX COLLECTOR",
      potion_thief: "🦹 KẺ TRỘM BÌNH MÁU",
      wrong_portal: "🌀 WRONG PORTAL",
    };
    const detail =
      encounter.kind === "tax_collector"
        ? "Đi tiếp sẽ giảm payout 15%."
        : encounter.kind === "potion_thief"
          ? "Đi tiếp có thể mất 1 bình máu."
          : "25% Portal tốt: nhận lợi ích và qua tầng an toàn. 75% Portal xấu: chịu hiệu ứng rồi gặp Rift Ambusher cấp Elite đánh phủ đầu; hạ nó mới qua tầng. Đích đến đã được lưu, Luck không đổi tỷ lệ Portal tốt. Có thể rút thưởng trước khi chấp nhận.";
    return `**${names[encounter.kind]}**\nChọn **Chấp nhận số phận** để xử lý: ${detail}\n🍀 Lucky Break: **${Math.round(luckyBreakChance(state) * 1000) / 10}%** tránh thuế, trộm bình hoặc riêng đòn phủ đầu của portal xấu.`;
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
    `${STAT_EMOJI.attack} ${formatCoins(state.damageMin)}–${formatCoins(state.damageMax)}${damageDelta} · ${STAT_EMOJI.defense} ${formatCoins(state.defense)}${delta("defense")}`,
    `${STAT_EMOJI.energy} ${state.energy}/${state.maxEnergy}${delta("energy")} · ${STAT_EMOJI.accuracy} ${state.accuracy} · ${STAT_EMOJI.evasion} ${state.evasion}${delta("evasion")}`,
    `${STAT_EMOJI.crit} ${Math.round(state.critChance * 100)}%${delta("critChance", true)} · ${STAT_EMOJI.resistance} ${state.resistance}%${delta("resistance")} · ${STAT_EMOJI.luck} ${state.luck}${delta("luck")}`,
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
  const totals = {};
  for (const item of items) {
    for (const key of [
      "attack",
      "defense",
      "maxHp",
      "resistance",
      "critChance",
      "luck",
    ])
      totals[key] =
        (totals[key] || 0) + (item.definition?.[key] || 0) * item.level;
  }
  const effects = [
    ["attack", STAT_EMOJI.attack],
    ["defense", STAT_EMOJI.defense],
    ["maxHp", STAT_EMOJI.hp],
    ["resistance", STAT_EMOJI.resistance],
    ["critChance", STAT_EMOJI.crit],
    ["luck", STAT_EMOJI.luck],
  ]
    .filter(([key]) => totals[key])
    .map(
      ([key, emoji]) =>
        `${emoji} ${signed(totals[key], key === "critChance")}${key === "resistance" ? "%" : ""}`,
    );
  if (items.some((item) => item.definition?.defenseSet !== undefined))
    effects.push(`${STAT_EMOJI.defense} ↺ khi nhặt`);
  if (items.some((item) => !item.definition))
    effects.push("có hiệu ứng chưa rõ");
  return `${icon("school_satchel")} ${items.length} món${effects.length ? ` · ${effects.join(" · ")}` : ""}`;
}
function riftSummary(state) {
  const m = state.modifiers || {};
  const effects = [];
  if (m.fortified) effects.push(`👹 ${STAT_EMOJI.hp} +${m.fortified * 10}%`);
  if (m.stone_skin)
    effects.push(`👹 ${STAT_EMOJI.defense} +${m.stone_skin * 10}%`);
  if (m.elemental_dominion)
    effects.push(`👹 ${STAT_EMOJI.attack} +${m.elemental_dominion * 4}%`);
  if (m.bloodlust)
    effects.push(
      `👹 ${STAT_EMOJI.attack} +${m.bloodlust * 8}% khi dưới ½ ${STAT_EMOJI.hp}`,
    );
  if (m.swift_horror)
    effects.push(
      `👹 ${STAT_EMOJI.accuracy} +${m.swift_horror * 3} / ${STAT_EMOJI.evasion} +${m.swift_horror * 2}`,
    );
  if (m.soul_drain)
    effects.push(
      `${STAT_EMOJI.energy} −${Math.min(2, m.soul_drain)}/đòn trúng`,
    );
  if (m.cursed_ground)
    effects.push(`${STAT_EMOJI.resistance} −${m.cursed_ground * 2}%/đòn phép`);
  if (m.unstable_rift) effects.push("📦 ↑ / Mimic ↑");
  return effects.length
    ? `🌀 ${effects.join(" · ")}`
    : "🌀 Chưa có hiệu ứng Rift";
}
function encounterSummary(state) {
  const e = state.encounter;
  if (state.phase === "upgrade")
    return `🎁 **Chọn nâng cấp** · Đã vượt tầng ${e.milestone}`;
  if (state.phase === "summit")
    return "🏆 **Đã chinh phục tầng 999** · Rút thưởng để hoàn tất.";
  if (e.type === "combat")
    return `**${e.name}** · ${rankLabel(e.rank)} · ${enemyDamageType(e) === "magic" ? "🔮 Phép" : enemyDamageType(e) === "physical" ? "⚔️ Vật lý" : "⚔️ / 🔮"}\n${healthBar(e.hp, e.maxHp)}\n${STAT_EMOJI.attack} ${formatCoins(e.damageMin)}–${formatCoins(e.damageMax)} · ${STAT_EMOJI.defense} ${formatCoins(e.defense)} · ${STAT_EMOJI.resistance} ${e.resistance}%`;
  if (e.type === "chest")
    return `📦 **Hòm bí ẩn** · ${e.revealed ? "😈 Đã phát hiện Mimic" : e.inspected ? "Đã kiểm tra" : "Chưa kiểm tra"}`;
  if (e.type === "rngesus")
    return "☠️ **RNGesus** · Không thể thắng hoặc rút thưởng.\nChạy thất bại tự dùng vé nếu còn; hết vé sẽ chết.";
  if (e.type === "shrine")
    return "🗿 **Shrine** · Chạm để nhận hiệu ứng, có thể gây hại.";
  if (e.type === "surprise")
    return "❓ **Lối đi bí ẩn** · Khám phá có thể gặp phục kích.";
  if (e.type === "blacksmith")
    return "🔨 **Thợ rèn** · Nâng 1 cấp trang bị; dùng payout của run.";
  if (e.type === "cleanse")
    return "✨ **Giải nguyền** · Gỡ 1 lớp phạt payout UR; dùng payout của run.";
  if (e.type === "trap")
    return (
      {
        tax_collector: "🧾 **Tax Collector** · Có thể mất 15% payout hiện tại.",
        potion_thief: "🦹 **Kẻ trộm** · Có thể mất 1 🧪.",
        wrong_portal:
          "🌀 **Wrong Portal** · 25% tốt / 75% xấu + Elite đánh phủ đầu.",
      }[e.kind] || "⚠️ **Bẫy**"
    );
  return "🕳️ **Phòng trống** · Đi tiếp hoặc rút thưởng.";
}
function briefLog(state) {
  const text = emojiStats(state.lastLog || "—")
    .split("\n")
    .slice(0, 3)
    .join("\n");
  return text.length > 360 ? `${text.slice(0, 357)}…` : text;
}

const DETAIL_TABS = Object.freeze([
  ["stats", "Chỉ số", "bar_chart"],
  ["items", "Vật phẩm", "school_satchel"],
  ["effects", "Hiệu ứng", "cyclone"],
  ["encounter", "Tình huống", "information_source"],
]);
function detailButtons(
  sessionId,
  turn,
  originMessageId = null,
  selected = null,
) {
  return new ActionRowBuilder().addComponents(
    DETAIL_TABS.map(([tab, label, emoji]) =>
      button(
        sessionId,
        turn,
        `view_${tab}_0${originMessageId ? `:${originMessageId}` : ""}`,
        label,
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
  const pages =
    tab === "items" ? Math.max(1, Math.ceil(owned.length / pageSize)) : 1;
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
      name: "🎒 Tổng hiệu ứng trang bị",
      value: equipmentSummary(state, itemCatalog),
    });
    if (!owned.length)
      embed.addFields({
        name: "Vật phẩm",
        value: "Chưa có vật phẩm trong run.",
      });
    for (const item of owned.slice(
      page * pageSize,
      page * pageSize + pageSize,
    )) {
      const d = item.definition;
      const curses = Math.max(0, item.level - (item.cleansedLevels || 0));
      const effects = d
        ? effectText({ ...d, bonusPenalty: 0 }, item.level)
        : item.text || "Không rõ tác dụng";
      const curse = d?.bonusPenalty
        ? `\n${STAT_EMOJI.payout} ${curses ? `−${Math.round((1 - (1 - d.bonusPenalty) ** curses) * 100)}% · ${curses} lớp nguyền` : "Đã giải hết lời nguyền"}`
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
        value: `${STAT_EMOJI.potions} ${state.potions}${change(state, "potions")} · ${STAT_EMOJI.tickets} ${state.escapeTokens}${change(state, "escapeTokens")} · ${STAT_EMOJI.crit} ×${state.critDamage || 1.75}`,
      },
      {
        name: "📖 Ký hiệu",
        value:
          "❤️ HP / tối đa\n⚔️ khoảng sát thương · 🛡️ phòng thủ\n🎯 chính xác · 💨 né (dùng để tính cơ hội trúng)\n💥 tỷ lệ chí mạng · 🔮 kháng phép\n✨ năng lượng / tối đa · 🍀 Luck\n🧪 bình máu · 🎫 Vé Thoát Hiểm · 💰 payout",
      },
      {
        name: `✨ ${classes[state.classKey].skill} · tốn 2 ✨`,
        value: emojiStats(CLASS_PROFILES[state.classKey].effect),
      },
      {
        name: "⚔️ Giao tranh",
        value:
          "Tấn công/thủ hồi 1 ✨. Thủ: 🛡️ ×2 và giảm thêm 50% phản công. 🧪 hồi 35% ❤️ tối đa, tối thiểu 20; quái còn sống sẽ phản công. Giảm vật lý tối đa 75%; 🔮 từ −50% đến 75%; cơ hội trúng từ 20% đến 95%.",
      },
    );
  } else if (tab === "effects") {
    embed.addFields({
      name: "🎒 Trang bị",
      value: equipmentSummary(state, itemCatalog),
    });
    embed.addFields({
      name: "🌀 Tổng hiệu ứng Rift",
      value: riftSummary(state),
    });
    for (const [key, stacks] of Object.entries(state.modifiers || {}).filter(
      ([, value]) => value > 0,
    ))
      embed.addFields({
        name: `🌀 ${RIFT_MODIFIERS[key]?.name || key} ×${stacks}`.slice(0, 256),
        value: emojiStats(RIFT_MODIFIERS[key]?.text || "Không rõ tác dụng"),
      });
    if (!Object.values(state.modifiers || {}).some((stacks) => stacks > 0))
      embed.addFields({
        name: "🌀 Rift",
        value:
          "Chưa có modifier. Nhận thêm mỗi 10 tầng; đủ tám loại trước khi lặp.",
      });
    const curseFactor = owned.reduce(
      (factor, item) =>
        factor *
        (1 - (item.definition?.bonusPenalty || 0)) **
          Math.max(0, item.level - (item.cleansedLevels || 0)),
      1,
    );
    embed.addFields(
      {
        name: "💰 Payout",
        value: `Có thể rút: **${formatCoins(potentialPayout(state))} xu**\nHệ số tầng ×${baseMultiplier(state).toFixed(2)} · hệ số phạt ×${Number(state.payoutFactor).toFixed(3)}\nUR còn nguyền: −${Math.round((1 - curseFactor) * 100)}% · Wrong Portal: −${Math.round((1 - (state.portalPayoutFactor || 1)) * 100)}%\nĐã chi dịch vụ: ${formatCoins(state.payoutServiceSpent ?? state.payoutSpent ?? 0)} xu · thuế/hối lộ: ${formatCoins((state.payoutSpent || 0) - (state.payoutServiceSpent ?? state.payoutSpent ?? 0))} xu\nHệ số tầng dừng tăng sau 100; bonus tiếp tục tăng; trần payout 10.000.000 xu.`,
      },
      {
        name: "🍀 Lucky Break",
        value: `${Math.round(luckyBreakChance(state) * 1000) / 10}% = min(30%, 🍀 ×1,5%). Tránh thuế, trộm bình hoặc riêng đòn phủ đầu Wrong Portal; không xóa hiệu ứng xấu hay Elite.`,
      },
    );
  } else {
    embed.setDescription(
      `${embed.data.description}\n\n${emojiStats(encounterText(state))}`.slice(
        0,
        4096,
      ),
    );
    embed.addFields({
      name: "📜 Diễn biến đầy đủ",
      value: emojiStats(state.lastLog || "—").slice(0, 1024),
    });
    if (state.encounter.kind === "wrong_portal")
      embed.addFields({
        name: "🌀 Đích đến có thể gặp",
        value:
          "25% tốt, chọn đều: hồi đầy ❤️, +10 ❤️ tối đa, +1 🧪 (trần 5); kho xu +50% cược; chúc phúc +4 🛡️, +5% 🔮, +1 🍀.\n75% xấu, chọn đều trong pool hợp lệ: mất tối đa 15% ❤️ tối đa nhưng giữ ít nhất 1; ✨ về 0 nếu còn; mất tối đa 2 🧪 nếu còn; hệ số 💰 toàn run ×0,9; −5 🛡️/🔮. Sau đó Elite đánh phủ đầu, hạ nó mới qua tầng. 🍀 không đổi tỷ lệ portal tốt. Đích đến được giấu trước khi chấp nhận.",
      });
  }
  const components = [
    detailButtons(sessionId, state.turn, originMessageId, tab),
  ];
  if (pages > 1)
    components.push(
      new ActionRowBuilder().addComponents(
        button(
          sessionId,
          state.turn,
          `view_items_${Math.max(0, page - 1)}:${originMessageId}`,
          "Trước",
          "arrow_left",
          ButtonStyle.Secondary,
          page === 0,
        ),
        button(
          sessionId,
          state.turn,
          `view_items_${page + 1}:${originMessageId}`,
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
        : state.floor > 100
          ? 0x9b59b6
          : 0xe67e22,
    )
    .setTitle(
      `${classIcon} SINH TỒN · TẦNG ${state.floor}${state.floor > 100 ? " · OVERRUN" : ""}`,
    )
    .setDescription(
      `${icon("bust_in_silhouette")} <@${userId}> · **${regionForFloor(state.floor).name}**\n\n${encounterSummary(state)}`,
    )
    .addFields(
      {
        name: `${icon("bar_chart")} Chỉ số`,
        value: statLine(state, false),
        inline: false,
      },
      {
        name: `${icon("compass")} Run`,
        value: `🧭 ${state.cleared}/${state.floor} · 👑 ${state.bosses}\n${STAT_EMOJI.potions} ${state.potions} · ${STAT_EMOJI.tickets} ${state.escapeTokens} · ${chaosLabel(state)}`,
        inline: true,
      },
      {
        name: `${icon("moneybag")} Rút thưởng`,
        value: state.cleared
          ? `**${formatCoins(payout)} ${icon("coin")}**`
          : "Chưa thể rút",
        inline: true,
      },
      {
        name: "📈 Hiệu ứng tổng hợp",
        value: `${equipmentSummary(state, itemCatalog)}\n${riftSummary(state)}${state.payoutFactor < 1 ? `\n${STAT_EMOJI.payout} ×${Number(state.payoutFactor).toFixed(3)}` : ""}`,
        inline: false,
      },
      {
        name: `${icon("scroll")} Diễn biến`,
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
        : `💀 tử trận tầng ${state.floor}`;
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
    if (result.achievements?.length)
      embed.addFields({
        name: `${icon("sports_medal")} Thành tựu mới`,
        value: result.achievements.map((item) => `**${item.name}**`).join("\n"),
      });
  } else
    // Embed footers are plain text; use Unicode instead of :coin: or custom emoji markup.
    embed.setFooter({
      text: `${sessionId ? `Mã ván: ${sessionId} • ` : ""}Lượt ${state.turn} • Cược ${formatCoins(state.stake)} ${icon("coin", "🪙")} • /choi sinhton tieptuc`,
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
          "+5",
          "crossed_swords",
          ButtonStyle.Primary,
        ),
        button(
          sessionId,
          turn,
          "upgrade_hp",
          "+30",
          "heart",
          ButtonStyle.Success,
        ),
        button(
          sessionId,
          turn,
          "upgrade_defense",
          "+6",
          "shield",
          ButtonStyle.Secondary,
        ),
        button(
          sessionId,
          turn,
          "upgrade_luck",
          "+2",
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
          `${classes[state.classKey].skill} · ${STAT_EMOJI.energy}2`,
          "sparkles",
          ButtonStyle.Success,
          state.energy < 2,
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
          "Hối lộ −40%",
          "money_with_wings",
          ButtonStyle.Secondary,
        ),
        button(
          sessionId,
          turn,
          "pray",
          "Cầu nguyện 10%",
          "pray",
          ButtonStyle.Success,
        ),
      ),
    ];
  if (type === "surprise")
    return [
      new ActionRowBuilder().addComponents(
        button(
          sessionId,
          turn,
          "explore",
          "Khám phá",
          "mag",
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
          !eligible || potentialPayout(state) < cost,
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
        type === "trap" ? "Chấp nhận số phận" : "Đi tiếp",
        "arrow_right",
        ButtonStyle.Primary,
      ),
      retreat,
    ),
  ];
}
function hardcoreRows(sessionId, state, disabled, classes) {
  const rows = hardcoreActionRows(sessionId, state, disabled, classes);
  if (!disabled) rows.push(detailButtons(sessionId, state.turn));
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
