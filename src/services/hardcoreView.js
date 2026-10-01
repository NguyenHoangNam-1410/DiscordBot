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
} = require("./hardcoreEngine");
const { regionForFloor, RIFT_MODIFIERS } = require("./hardcoreEngine");
const { resultBlock, coins } = require("../utils/rewardText");
const emojiMap = require("../discordEmojiMap");
const {
  rarityLabel,
  normalizeEquipment,
  effectText,
} = require("./hardcoreEquipment");

const icon = (name, fallback = "•") => emojiMap[`:${name}:`] || fallback;
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
        value: CLASS_PROFILES[draft.classKey].role,
      },
      { name: "❤️ HP", value: `${character.hp}`, inline: true },
      {
        name: "⚔️ Sát thương",
        value: `${character.damageMin}–${character.damageMax}`,
        inline: true,
      },
      { name: "🛡️ Defense", value: `${character.defense}`, inline: true },
      { name: "🎯 Accuracy", value: `${character.accuracy}`, inline: true },
      { name: "💨 Evasion", value: `${character.evasion}`, inline: true },
      {
        name: "💥 Chí mạng",
        value: `${Math.round(character.critChance * 100)}% · sát thương ×1,75`,
        inline: true,
      },
      {
        name: "🔮 Kháng phép",
        value: `${character.resistance}%`,
        inline: true,
      },
      {
        name: "✨ Energy",
        value: `${character.energy}/${character.energy}`,
        inline: true,
      },
      {
        name: "🧪 Vật tư ban đầu",
        value: "3 bình máu · 0 Vé Thoát Hiểm · 0 Luck",
        inline: true,
      },
      {
        name: `✨ ${character.skill} · tốn 2 Energy`,
        value: CLASS_PROFILES[draft.classKey].effect,
      },
    );
  } else
    embed.addFields({
      name: "🧙 Chọn một trong 7 nhân vật",
      value: Object.values(classes)
        .map(
          (entry) =>
            `${entry.emoji} **${entry.name}** · ${entry.hp} HP · ${entry.damageMin}–${entry.damageMax} sát thương · ${entry.defense} Defense`,
        )
        .join("\n"),
    });
  embed
    .addFields({
      name: "📖 Trong run",
      value:
        "Tấn công / Phòng thủ hồi 1 Energy. Rút thưởng để nhận payout; tử trận mất cược và payout đang giữ. Mỗi 5 tầng có checkpoint hồi đầy HP.",
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
    return `${icon("crossed_swords")} **${encounter.name}** · ${rankLabel(encounter.rank)}\n${icon("heart")} ${formatCoins(encounter.hp)}/${formatCoins(encounter.maxHp)} HP · ${icon("crossed_swords")} ${formatCoins(encounter.damageMin)}–${formatCoins(encounter.damageMax)} · ${icon("shield")} ${formatCoins(encounter.defense)}\n**Sát thương:** ${damageType}${mechanic ? `\n**Cơ chế boss:** ${mechanic}` : ""}\n**Tấn công:** đánh và hồi 1 năng lượng. **Phòng thủ:** Defense ×2 và giảm thêm 50% sát thương vật lý/phép sau giảm trừ (tối thiểu 1), hồi 1 năng lượng. **Kỹ năng:** tốn 2 năng lượng — ${skillHint}\n**Bình máu:** hồi 35% HP tối đa; quái vẫn đánh trả nếu còn sống.`;
  }
  if (encounter.type === "chest")
    return `${icon("package")} **HÒM BÍ ẨN**\n${encounter.inspected ? "Đã kiểm tra một lần; kết quả có thể không phát hiện được Mimic." : "Kiểm tra một lần để thử phát hiện Mimic; Mở để nhận đồ hoặc có thể phải đánh Mimic; Bán để lấy thêm 15% tiền cược vào payout."}${encounter.revealed ? `\n${icon("warning")} Mimic đã bị phát hiện: **Tránh Mimic** để đi tiếp an toàn.` : ""}`;
  if (encounter.type === "shrine")
    return `${icon("moyai")} **SHRINE KHÔNG RÕ NGUỒN GỐC**\n**Chạm Shrine** để nhận hiệu ứng ngẫu nhiên (có cả hiệu ứng gây hại), hoặc **Bỏ qua** để đi tiếp.`;
  if (encounter.type === "rngesus")
    return `${icon("skull")} **RNGesus · HP ∞ · KHÔNG THỂ BỊ ĐÁNH BẠI**\nChiến đấu là chết. Bỏ chạy: **75% thành công**; thất bại tự dùng **1 Vé Thoát Hiểm** nếu còn, hết vé thì chết. Chạy thành công giữ vé. Hối lộ: giảm hệ số payout 40%; Cầu nguyện: 10% nhận Legendary, nếu trượt sẽ chết.`;
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
          : "Đi tiếp sẽ giữ nguyên tầng và roll sự kiện mới.";
    return `**${names[encounter.kind]}**\nChọn **Chấp nhận số phận** để xử lý: ${detail}`;
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
function statLine(state) {
  const hpChange = state.lastStatChanges?.hp || 0;
  const maxHpChange = state.lastStatChanges?.maxHp || 0;
  const hpDelta =
    hpChange || maxHpChange
      ? ` (${signed(hpChange)}/${signed(maxHpChange)})`
      : "";
  const minChange = state.lastStatChanges?.damageMin || 0;
  const maxChange = state.lastStatChanges?.damageMax || 0;
  const damageDelta =
    minChange || maxChange
      ? ` (${minChange === maxChange ? signed(minChange) : `${signed(minChange)}/${signed(maxChange)}`})`
      : "";
  return [
    `${icon("heart")} ${formatCoins(state.hp)}/${formatCoins(state.maxHp)}${hpDelta}`,
    `${icon("crossed_swords")} ${formatCoins(state.damageMin)}–${formatCoins(state.damageMax)}${damageDelta}`,
    `${icon("shield")} ${formatCoins(state.defense)}${change(state, "defense")}`,
    `${icon("sparkles")} ${state.energy}/${state.maxEnergy}${change(state, "energy")}`,
    `${icon("dart")} ${Math.round(state.critChance * 100)}%${change(state, "critChance", true)}`,
    `${icon("dash")} ${state.evasion}${change(state, "evasion")}`,
    `${icon("crystal_ball")} ${state.resistance}%${change(state, "resistance")}`,
    `${icon("four_leaf_clover")} ${state.luck}${change(state, "luck")}`,
  ].join(" · ");
}
function itemFields(state, itemCatalog) {
  const owned = normalizeEquipment(state.items);
  const title = `${icon("school_satchel")} Trang bị và công dụng`;
  if (!owned.length)
    return [{ name: title, value: "Chưa có trang bị.", inline: false }];
  const definitions = new Map(
    Object.values(itemCatalog)
      .flat()
      .map((item) => [item.name, item]),
  );
  const lines = owned.map((item) => {
    const definition = item.definition || definitions.get(item.name);
    const curseCount = Math.max(0, item.level - (item.cleansedLevels || 0));
    const effects = definition
      ? effectText({ ...definition, bonusPenalty: 0 }, item.level)
      : item.text || "Không rõ tác dụng";
    const curseText = definition?.bonusPenalty
      ? ` · ${curseCount ? `payout giảm ${Math.round((1 - (1 - definition.bonusPenalty) ** curseCount) * 100)}% (${curseCount} lời nguyền)` : "đã giải hết lời nguyền payout"}`
      : "";
    return `• **${item.name} Lv.${item.level}** [${rarityLabel(item.rarity)}]${definition?.base ? ` · ${definition.base}` : ""} — ${effects}${curseText}`;
  });
  const chunks = [];
  let total = 0;
  for (const line of lines) {
    if (total + line.length > 2100) {
      chunks.push(
        `Còn ${lines.length - lines.indexOf(line)} trang bị đã cộng chỉ số vào run.`,
      );
      break;
    }
    if (!chunks.length || `${chunks.at(-1)}\n${line}`.length > 1000)
      chunks.push(line.slice(0, 1000));
    else chunks[chunks.length - 1] += `\n${line}`;
    total += line.length + 1;
  }
  return chunks.map((value, index) => ({
    name: index ? `${title} · tiếp` : title,
    value,
    inline: false,
  }));
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
      `${icon("bust_in_silhouette")} <@${userId}> · **${regionForFloor(state.floor).name}**\n\n**${icon("warning")} Tình huống hiện tại**\n${encounterText(state)}`,
    )
    .addFields(
      {
        name: `${icon("bar_chart")} Chỉ số · thay đổi trong lượt vừa rồi`,
        value: statLine(state),
        inline: false,
      },
      {
        name: `${icon("compass")} Tiến trình`,
        value: `Đã vượt ${state.cleared} · Boss ${state.bosses} · ${icon("test_tube")} ${state.potions}${change(state, "potions")} · ${icon("mirror")} ${state.escapeTokens}${change(state, "escapeTokens")} · ${chaosLabel(state)}`,
        inline: false,
      },
      {
        name: `${icon("moneybag")} Rút thưởng`,
        value: state.cleared
          ? `**${formatCoins(payout)} :coin:** · x${baseMultiplier(state).toFixed(2)}${state.payoutSpent ? `\nĐã chi dịch vụ trong run: **${formatCoins(state.payoutSpent)} xu** (đã trừ).` : ""}`
          : "Chưa thể rút",
        inline: false,
      },
      {
        name: "🌀 Rift Modifier",
        value:
          Object.entries(state.modifiers || {})
            .filter(([, count]) => count > 0)
            .map(
              ([key, count]) =>
                `**${RIFT_MODIFIERS[key]?.name || key} ×${count}** · ${RIFT_MODIFIERS[key]?.text || ""}`,
            )
            .join("\n") || "Chưa có · Nhận thêm mỗi 10 tầng.",
        inline: false,
      },
      ...itemFields(state, itemCatalog),
      {
        name: `${icon("scroll")} Diễn biến`,
        value: String(state.lastLog || "—").slice(0, 1024),
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
    embed.setFooter({
      text: `${sessionId ? `Mã ván: ${sessionId} • ` : ""}Lượt ${state.turn} • Cược ${formatCoins(state.stake)} :coin: • /choi sinhton tieptuc để mở UI mới`,
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
function hardcoreRows(sessionId, state, disabled, classes) {
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
          "+5 Damage",
          "crossed_swords",
          ButtonStyle.Primary,
        ),
        button(
          sessionId,
          turn,
          "upgrade_hp",
          "+30 HP",
          "heart",
          ButtonStyle.Success,
        ),
        button(
          sessionId,
          turn,
          "upgrade_defense",
          "+6 Defense",
          "shield",
          ButtonStyle.Secondary,
        ),
        button(
          sessionId,
          turn,
          "upgrade_luck",
          "+2 Luck",
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
          state.energy < 2,
        ),
        button(
          sessionId,
          turn,
          "potion",
          `Bình máu (${state.potions})`,
          "test_tube",
          ButtonStyle.Secondary,
          state.potions <= 0,
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
module.exports = {
  rankLabel,
  encounterText,
  chaosLabel,
  hardcoreEmbed,
  hardcoreRows,
  hardcoreSetupPayload,
  hardcoreBetModal,
};
