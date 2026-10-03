"use strict";
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const stats = require("./hardcoreStats");
const core = require("./hardcoreV2");
const world = require("./hardcoreWorld");
const { RELEASE } = require("./hardcoreVersion");
const balance = require("./hardcoreBalance");
const { runDiamondReward } = require("./hardcoreRewards");
const emoji = require("../discordEmojiMap");
const { resultBlock } = require("../utils/rewardText");
const icon = (key, fallback) => emoji[`:${key}:`] || fallback;
const E = {
  hp: icon("HP", "❤️"),
  attack: icon("PHYS", "⚔️"),
  defense: icon("DEF", "🛡️"),
  mana: icon("MANA", "💧"),
  magic: icon("ELE", "🔮"),
  res: icon("crystal_ball", "🔮"),
  luck: icon("LUCK", "🍀"),
  crit: icon("boom", "💥"),
  potion: icon("potion", "🧪"),
  ticket: icon("ticket", "🎫"),
  str: icon("STR", "💪"),
  dex: icon("DEX", "🗡️"),
  vit: icon("VIT", "❤️"),
  ene: icon("ENE", "🔮"),
};
const SKILL_ICONS = Object.fromEntries(
  Object.entries({
    amazon: "skill_barrage",
    barbarian: "skill_ironwill",
    assassin: "skill_shadowstep",
    sorceress: "skill_arcaneburst",
    druid: "skill_windgeneration",
    necromancer: "skill_totemward",
    paladin: "skill_devineshield",
  }).map(([key, name]) => [key, icon(name, "✨")]),
);
const rarityLabel = (r) =>
  ({ common: "R", rare: "SR", legendary: "SSR", cursed: "UR" })[r];
const percent = (n) => `${Math.round(n * 1000) / 10}%`;
const money = (n) => Math.floor(n).toLocaleString("vi-VN");
const SKILLS = {
  amazon: "Hai phát vật lý ×0,85, tính trúng/Crit riêng.",
  barbarian: "Vật lý ×1,65.",
  assassin: "Vật lý ×1,30, né phản công.",
  sorceress: "Phép ×2,10, luôn trúng, không Crit.",
  druid: "Vật lý ×1,35 và hồi 12% Max HP.",
  necromancer: "Phép ×1,55, luôn trúng, không Crit; chặn phản công.",
  paladin: "Vật lý ×1,40 rồi tự Phòng thủ.",
};
const SHRINES = {
  amazon: "20% thêm phát thứ ba khi dùng Barrage.",
  barbarian: "+8 DEF khi HP ≤30%.",
  assassin: "Chắc chắn né một phản công.",
  sorceress: "Một skill miễn phí.",
  druid: "Hồi 5% Max HP mỗi tầng trong ba tầng kế tiếp.",
  necromancer: "Chặn một đòn phản công.",
  paladin: "+10 RES khi nhận phép.",
};
const delta = (state, key, suffix = "") => {
  const n = state.lastStatChanges?.[key] || 0;
  return n
    ? ` (${n > 0 ? "+" : ""}${key === "critChance" ? Math.round(n * 1000) / 10 : n}${suffix})`
    : "";
};
function healthBar(hp, maxHp) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const filled =
    ratio >= 1
      ? 10
      : ratio > 0
        ? Math.max(1, Math.min(9, Math.round(ratio * 10)))
        : 0;
  return `${E.hp} HP \`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` **${money(hp)}/${money(maxHp)}**`;
}
function statLine(s, changes = false, compact = false) {
  const d = (key, suffix) => (changes ? delta(s, key, suffix) : "");
  const inverse = s.paradox?.kind === "inverse";
  const range = core.physicalRange(s);
  const defense = inverse ? (s.damageMin + s.damageMax) / 2 : s.defense;
  const lines = [
    `${healthBar(s.hp, s.maxHp)}${d("hp")}${d("maxHp", " MAX")}`,
    `${E.str} STR **${s.str}**${d("str")} · ${E.dex} DEX **${s.dex}**${d("dex")} · ${E.vit} VIT **${s.vit}**${d("vit")} · ${E.ene} ENE **${s.ene}**${d("ene")}`,
    `${E.mana} Mana **${s.mana}/${s.maxMana}**${d("mana")}${d("maxMana", " MAX")} · ${E.potion} Bình ${s.potions}${d("potions")} · ${E.ticket} Vé ${s.escapeTokens}${d("escapeTokens")}`,
    `${E.attack} Vật lý **${range[0]}–${range[1]}**${inverse ? " (Paradox)" : d("damageMin")} · ${E.magic} Phép **${s.spellMin}–${s.spellMax}**${d("spellMin")}`,
    `${E.defense} DEF **${defense}**${inverse ? " (Paradox)" : d("defense")} · RES **${s.resistance}%**${d("resistance")} · ${E.luck} LUCK **${s.luck}**${d("luck")}`,
  ];
  if (!compact)
    lines.push(
      `${icon("dart", "🎯")} ACC **${s.accuracy}**${d("accuracy")} · ${icon("dash", "💨")} EVA **${s.evasion}**${d("evasion")} · ${E.crit} CRIT **${percent(s.critChance)}**${d("critChance", "%")}\nBình **${percent(s.potionRate)}** Max HP`,
    );
  return lines.join("\n");
}
function battleStats(s) {
  const range = core.physicalRange(s);
  const defense =
    s.paradox?.kind === "inverse" ? (s.damageMin + s.damageMax) / 2 : s.defense;
  const skill = core.skillDamagePreview(s);
  const detail = {
    amazon: `Hai phát vật lý, trúng/Crit riêng.${skill.extraShot ? " 20% thêm phát thứ ba." : ""}`,
    barbarian: "Vật lý, có thể trượt/Crit.",
    assassin: "Vật lý, có thể trượt/Crit; né phản công.",
    sorceress: "Phép luôn trúng, không Crit.",
    druid: `Vật lý, có thể trượt/Crit; hồi ${money(Math.floor(s.maxHp * 0.12))} HP (tối đa Max HP).`,
    necromancer: "Phép luôn trúng, không Crit; chặn phản công.",
    paladin: "Vật lý, có thể trượt/Crit; tự Phòng thủ.",
  }[s.classKey];
  return `${healthBar(s.hp, s.maxHp)}\n${E.mana} Mana **${s.mana}/${s.maxMana}** · ${E.potion} Bình **${s.potions}** · ${E.ticket} Vé **${s.escapeTokens}**\n${E.attack} Vật lý **${range[0]}–${range[1]}** · ${E.defense} DEF **${defense}** · ${E.res} RES **${s.resistance}%**\n${SKILL_ICONS[s.classKey]} **${stats.CLASSES[s.classKey].skill} (${core.skillManaCost(s)} Mana): ${skill.low}–${skill.high} DMG**\n${detail}\n*Dự báo lên quái hiện tại${skill.magic ? "" : ` nếu ${skill.shots === 2 ? "cả hai phát " : ""}trúng, chưa Crit`}.*`;
}
function effectText(effects, level = 1) {
  const names = {
    str: `${E.str} STR`,
    dex: `${E.dex} DEX`,
    vit: `${E.vit} VIT`,
    ene: `${E.ene} ENE`,
    luck: `${E.luck} Luck`,
    maxHp: `${E.hp} Max HP`,
    maxMana: `${E.mana} Max Mana`,
    physical: `${E.attack} Vật lý`,
    spell: `${E.magic} Phép`,
    defense: `${E.defense} DEF`,
    accuracy: "ACC",
    evasion: "EVA",
    resistance: "RES",
    critChance: "Crit",
    potionPower: "Hiệu lực bình",
    bossDamage: "DMG Boss",
    eliteDamage: "DMG Elite",
    mimicDetection: "Phát hiện Mimic",
    goblinChance: "Bắt Goblin",
    legendaryFind: "Tìm SSR",
    floorHpLoss: "HP mất/tầng",
    mimicChance: "Mimic",
    damageTaken: "DMG nhận",
  };
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
        if (key === "defenseSet") return "DEF = 0";
        if (key === "bonusPenalty")
          return `Payout ×${(1 - value).toFixed(2)} mỗi cấp chưa giải`;
        if (key === "potions") return `+${value} bình khi nhận mỗi cấp`;
        if (key === "escapeTokens")
          return `+${value} vé khi nhận mỗi cấp (giữ tối đa 1)`;
        if (key === "heal") return `Hồi ${value} HP khi nhận mỗi cấp`;
        const n = value * level;
        return `${n > 0 ? "+" : ""}${percentages.includes(key) ? percent(n) : Math.round(n * 100) / 100} ${names[key] || key}`;
      })
      .join(" · ") || "Không có"
  );
}
function itemText(item, level = 1) {
  return `${effectText(item.effects, level)}${item.curse ? `\n☣️ Curse: ${effectText(item.curse.effects, level)}` : ""}`;
}
function checkpointPreview(s, key) {
  const p = stats.preview(s, key);
  return statTransitions(s, p);
}
function statTransitions(before, after) {
  const parts = [];
  const add = (name, keys, format) => {
    if (keys.some((key) => before[key] !== after[key]))
      parts.push(`${name} ${format(before)}→**${format(after)}**`);
  };
  for (const key of stats.ATTRIBUTES)
    add(`${E[key]} ${key.toUpperCase()}`, [key], (s) => s[key]);
  add(`${E.hp} Max HP`, ["maxHp"], (s) => s.maxHp);
  add(
    `${E.attack} Vật lý`,
    ["damageMin", "damageMax"],
    (s) => `${s.damageMin}–${s.damageMax}`,
  );
  add(
    `${E.magic} Phép`,
    ["spellMin", "spellMax"],
    (s) => `${s.spellMin}–${s.spellMax}`,
  );
  for (const [key, label] of [
    ["defense", `${E.defense} DEF`],
    ["accuracy", "ACC"],
    ["evasion", "EVA"],
    ["maxMana", `${E.mana} Max Mana`],
  ])
    add(label, [key], (s) => s[key]);
  add("Crit", ["critChance"], (s) => percent(s.critChance));
  add("RES", ["resistance"], (s) => `${s.resistance}%`);
  add(`${E.potion} Bình`, ["potionRate"], (s) => percent(s.potionRate));
  return parts.join(" · ") || "Không thay đổi chỉ số chiến đấu.";
}
function encounterText(s) {
  if (s.phase === "upgrade")
    return "🎁 **CHECKPOINT** · Đã hồi đầy HP và nhận thêm 2 bình.\nChọn **+5 STR, DEX, VIT hoặc ENE**; dự báo thay đổi ở ngay bên dưới.";
  if (s.phase === "paradox")
    return "**Máu là tiền:** mất HP do nguồn thù địch tăng payout, hồi HP giảm payout; biên ±50%. Chi phí tự nguyện không tăng thưởng.\n**Ngược đời:** vật lý dùng DEF làm sức tấn công; DEF chống vật lý lấy trung bình sát thương vật lý.\nCả hai chỉ có hiệu lực trong đúng 5 tầng tiếp theo.";
  if (s.phase === "severance")
    return "Xóa **toàn bộ stack** của một modifier có hại. Unstable Rift được giữ. Chọn một nút để tiếp tục.";
  if (s.phase === "summit")
    return "🏔️ Đã hạ Deimoss tầng 999. Bấm **Rút thưởng** để chốt chiến thắng và phần thưởng.";
  const e = s.encounter;
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
      `**${e.name}** · ${e.rank}\n${E.hp} ${e.hp}/${e.maxHp} · ${E.attack} ${e.damageMin}–${e.damageMax} · ${E.defense} ${e.defense} · RES ${e.resistance}%\n` +
      `Đòn quái kế tiếp: **${e.nextDamageType === "magic" ? "Phép" : "Vật lý"}** · Dự báo nhận **${p.low}–${p.high} HP** · Quái đánh trúng bạn **${percent(p.chance)}** *(chưa Crit/chưa Thủ)*\n` +
      `Bạn đánh vật lý trúng quái **${percent(world.hitChance(s.accuracy, e.evasion))}**; trượt gây 0 DMG nhưng vẫn hồi Mana khi đánh thường. Skill phép luôn trúng.\n` +
      (e.mechanic ? `Cơ chế: ${mechanisms[e.mechanic]}\n` : "") +
      `**Tấn công:** vật lý, hồi ${core.attackManaGain(s)} Mana (tối đa Max Mana). **Thủ:** DEF ×2 hoặc +15 RES, giảm thêm 15% DMG, miễn Crit, +1 Mana.\n**${stats.CLASSES[s.classKey].skill} (${core.skillManaCost(s)} Mana):** ${SKILLS[s.classKey]} **Bình:** hồi ${percent(s.potionRate)} Max HP, ít nhất 20; quái còn sống phản công.`
    );
  }
  if (e.type === "rngesus")
    return "**RNGesus · không thể đánh bại.**\nĐánh: chết. Chạy: **75%**; thất bại tự tiêu vé, không có vé thì chết. Hối lộ: mất **40% payout**. Cầu nguyện: **30%** sống, thưởng 85% SSR/15% UR; trượt chết. Vé: vượt an toàn.";
  if (e.type === "chest")
    return `**${e.name}**${e.revealed ? " · ⚠️ Đã phát hiện Mimic" : ""}\nKiểm tra: ${percent(e.detectionChance)} phát hiện nếu là Mimic; không phát hiện chưa chắc an toàn. Bán: +15% cược. Mở: nhận item/rỗng/SSR giả hoặc chiến đấu Mimic.\nPity SR+: ${s.pityRare}/5 · Pity SSR: ${s.pityLegendary}/10 · ${e.guaranteed ? "Hòm này đảm bảo SR+, không Mimic." : `Cơ hội SSR cơ bản ${percent(core.legendaryChance(s))}.`}`;
  if (e.type === "shrine")
    return "🗿 **SHRINE KHÔNG RÕ NGUỒN GỐC**\nMỗi loại **16,7%** khi chạm:\n💚 **Healing:** hồi đầy HP.\n🛡️ **Armor:** +5 STR hoặc +5 VIT (50/50).\n🩸 **Blood:** +8 STR, −5 VIT.\n✨ **Experience:** bonus +25% tiền cược.\n☣️ **Corrupted:** +12 STR, −8 VIT.\n🤡 **Fake:** mất 30% Max HP, tối thiểu 10.\nCó thể bỏ qua.";
  if (e.type === "echo")
    return `**${e.name}** · ${e.echo.profile.classKey} · tử trận tầng ${e.echo.floor} · ${e.echo.kills} mạng\nCầu nguyện: hồi 15% HP, giữ mộ. Cướp: nhận một item, 50% đánh thức. Khiêu chiến: quái mạnh hơn 25%, hạ mới nhận loot. Bỏ đi: giữ mộ. Claim hết hạn sau 30 phút không thao tác.`;
  if (e.type === "memory")
    return "**The Tower Remembers.** Hành động trong quá khứ được tháp ghi nhớ. Bấm Đi tiếp để nhận hậu quả; kết quả đã được khóa từ lúc lựa chọn ban đầu.";
  if (e.type === "trap")
    return e.kind === "portal"
      ? "**Wrong Portal: 50% tốt / 50% xấu.** Lucky Break không áp dụng.\nTốt: hồi đầy/+10 Max HP/+1 bình, bonus 50% cược, hoặc +6 STR/+6 ENE/+1 Luck. Xấu: mất 15% Max HP (giữ ≥1), Mana về 0, mất 2 bình, payout −10%, hoặc −5 STR/ENE; sau đó Elite đánh phủ đầu."
      : `**${e.name}**\n${E.luck} Luck **${s.luck}** · Lucky Break **${percent(Math.min(0.3, s.luck * 0.015))}** để tránh bẫy.\n${e.kind === "tax" ? "Mất 15% payout nếu không né được." : "Mất 1 bình nếu đang có và không né được."}`;
  if (e.type === "empty") return "Phòng trống. Đi tiếp hoặc rút thưởng.";
  const k = e.kind;
  if (k.endsWith("_shop"))
    return `**${e.name}** · mua tối đa **một món**. Giá và offer đã khóa.\n${e.offers.map((offer, i) => `**${i + 1}. ${offer.item.name} [${rarityLabel(offer.item.rarity)}] · ${money(offer.price)} ${k === "blood_shop" ? "HP" : k === "diamond_shop" ? "kim cương" : "xu payout"}**\n${itemText(offer.item)}`).join("\n")}\n${k === "blood_shop" ? "Phải còn ít nhất 1 HP sau mua." : k === "diamond_shop" ? "Kim cương bị trừ ngay khi mua, kể cả run sau đó tử trận." : "Chi phí lấy từ payout gốc; không dùng bonus Paradox để mua."}`;
  const target = s.items.find((x) => x.definition.id === e.targetId);
  const descriptions = {
    healer: "Hồi max(20,30% Max HP), +1 bình; miễn phí.",
    goblin: "Bắt thành công: bonus +25% cược. Thất bại: mất 10% payout.",
    blacksmith: `Trả 12% payout để tăng một cấp **${target?.name}**. Cộng buff mới; UR chưa giải nguyền cộng cả curse. Đồ đã giải hết nguyền giữ trạng thái sạch khi rèn.`,
    purifier: `Trả 20% payout: gỡ **toàn bộ curse** của **${target?.name}**, giữ buff/level, chuyển thành SSR.`,
    sacrifice:
      "Hiến tối đa 20% Max HP (giữ ≥1) → +6 stat chính; hoặc trả 10% payout → +6 VIT. Hiến HP không cộng bonus Blood Paradox.",
    gambler:
      "50% thắng. Trả trước 10% hoặc 25% payout; thắng cộng gấp đôi khoản đặt vào bonus, thua mất khoản đã chi.",
    adventurer:
      "Cứu: trả 1 bình → R/SR (30% SR). Cướp: nhận R, 25% biến thành UR.",
    fountain: "60% hồi đầy HP · 25% +15 Max HP/HP · 15% Blood Mimic.",
    horadric: `Nghiền **một cấp ${target?.name}**: hấp thụ buff vĩnh viễn trong run, gỡ curse của cấp bị nghiền; chọn thêm một bonus. Bình/vé/hồi HP đã nhận không phát lại.`,
    mirror:
      "Chọn +10 stat chính; hoặc +8 VIT/+5 STR hay DEX; đập gương: 20% +2 Luck, 80% Mirror Clone dùng chỉ số của bạn.",
    treasure_room: `Một trong ba hòm là Mimic. Soi đúng một màu. Đỏ: +5 vật lý/phép. Xanh: +6 DEF/+5 RES. Vàng: bonus +50% cược/+1 Luck.${e.inspected ? `\nĐã soi ${e.inspected}: ${e.inspected === e.mimicColor ? "Mimic" : "An toàn"}.` : ""}`,
    contract:
      "Trong 3 tầng: không bình → SSR; không skill → bonus 50% cược; không thủ → +10 stat chính. Vi phạm chỉ hủy thưởng.",
    class_shrine: `Hiệu lực ba tầng tiếp theo: ${SHRINES[s.classKey]}`,
    doors:
      "Sáng: 70% đầy HP/+1 bình, xấu mất 20% Max HP (giữ ≥1). Vàng: 70% bonus 50% cược, xấu Mimic. Tối: 60% SSR, xấu Premature Rift Boss.",
    duelist: `Đấu stat: một ván, thắng Búa→+6 STR, Kéo→+6 DEX, Bao→+6 ENE; hòa/thua trừ tối đa 6 stat (giữ ≥1).\nĐấu đồ: thắng 3 trong tối đa 5 ván → SSR 75%/UR 25%; thất bại mất một món R/SR/SSR đã khóa, UR được giữ.${e.mode ? `\nVán ${e.round + 1}/5 · Đã thắng ${e.wins}.` : ""}`,
    merchant: `Mua một offer bằng payout:\n${e.offers?.map((o) => `${o.key}: ${o.price} xu`).join(" · ")}`,
  };
  return `**${e.name}**\n${descriptions[k] || "Chọn một hành động."}`;
}
function encounterSummary(s) {
  if (s.phase !== "encounter") return encounterText(s);
  const e = s.encounter;
  if (e.type === "combat") {
    const rank =
      {
        normal: "Thường",
        elite: "Elite",
        boss: "BOSS",
        final_boss: "BOSS CUỐI",
        mimic: "Mimic",
        ancient_mimic: "Ancient Mimic",
      }[e.rank] || e.rank;
    const preview = core.incomingPreview(s);
    return `👹 **${e.name}** · ${rank}\n${healthBar(e.hp, e.maxHp)}\n${E.attack} Sát thương ${money(e.damageMin)}–${money(e.damageMax)} · ${E.defense} DEF ${money(e.defense)} · RES ${e.resistance}%\nBạn đánh vật lý trúng: **${percent(world.hitChance(s.accuracy, e.evasion))}**${e.mechanic === "riftwalker" && e.combatTurn % 3 === 0 ? " · 🛡️ Quái miễn sát thương lượt này" : ""}\n🎯 **Đòn kế tiếp:** ${e.nextDamageType === "magic" ? `${E.magic} Phép` : `${E.attack} Vật lý`}\n📉 **Dự báo nhận:** **${preview.low}–${preview.high} HP** · Quái trúng bạn **${percent(preview.chance)}** *(chưa Crit/Phòng thủ)*`;
  }
  if (e.type === "chest")
    return `📦 **${e.name}** · ${e.revealed ? "😈 Đã phát hiện Mimic" : e.inspected ? "Đã kiểm tra" : "Chưa kiểm tra"}\n${e.guaranteed ? "Đảm bảo SR+, không Mimic." : "Kiểm tra một lần; không phát hiện chưa chắc an toàn."}`;
  if (e.type === "rngesus")
    return "☠️ **RNGesus** · Không thể thắng hoặc rút thưởng.\nBỏ chạy 75%; thất bại tự dùng vé, hết vé thì chết. Cầu nguyện 30%; trượt chết. Hối lộ giảm 40% payout; vé vượt an toàn.";
  if (e.type === "shrine") return encounterText(s);
  if (e.type === "empty")
    return "🕳️ **PHÒNG TRỐNG**\nĐi tiếp để vượt tầng hoặc rút thưởng.";
  if (e.type === "surprise" && e.kind.endsWith("_shop"))
    return `🛒 **${e.name}** · mua một món\n${e.offers.map((o, i) => `${i + 1}. **${o.item.name} [${rarityLabel(o.item.rarity)}]** · ${money(o.price)} ${e.kind === "blood_shop" ? "HP" : e.kind === "diamond_shop" ? "kim cương" : "xu payout"}`).join("\n")}\nXem Chi tiết để đọc công dụng và điều kiện mua.`;
  return encounterText(s);
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
  return `${state.items.length} món${Object.keys(active).length ? ` · ${effectText(active)}` : ""}`.slice(
    0,
    700,
  );
}
function hasEncounterDetails(s) {
  if (s.phase !== "encounter") return false;
  const e = s.encounter;
  return (
    e.type === "chest" ||
    (e.type === "combat" &&
      (e.mechanic || ["boss", "final_boss"].includes(e.rank))) ||
    (e.type === "surprise" &&
      (e.kind.endsWith("_shop") || e.kind === "merchant"))
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
    items: `Vật phẩm (${s.items.length})`,
    effects: "Rift & hiệu ứng",
    encounter: "Chi tiết",
  }[tab];
}
function encounterDetails(s) {
  const e = s.encounter;
  if (e.type === "combat") {
    const mechanism =
      {
        butcher: `Frenzy: mỗi lần phản công tăng 8% sát thương, tối đa 5 stack. Hiện **${e.frenzy}/5**; phản công kế dùng **${Math.min(5, e.frenzy + 1)}/5** stack.`,
        riftwalker: `Miễn sát thương ở nhịp đầu mỗi chu kỳ 3 lần bạn tấn công/dùng skill. Nhịp kế **${(e.combatTurn % 3) + 1}/3**: **${e.combatTurn % 3 === 0 ? "miễn sát thương" : "có thể gây sát thương"}**. Phòng thủ/uống bình không đẩy nhịp này.`,
        assur: `EVA **${e.evasion}**, Crit **${percent(e.critChance)}**. Phòng thủ miễn Crit của lần phản công đó.`,
        lucion:
          "Hồi HP bằng **35% sát thương thực tế gây lên bạn** sau mỗi phản công, tối đa Max HP. Né/chặn phản công ngăn hồi HP.",
        deimoss:
          "Abyssal Spires giảm **25% sát thương bạn gây ra**, áp dụng mọi đòn. Dự báo skill trên bảng chính đã tính giảm trừ này.",
      }[e.mechanic] || "Boss này không có chu kỳ kích hoạt riêng.";
    return `**${e.name} · Cơ chế đặc biệt**\n${mechanism}${e.drainCharges > 0 ? `\nSoul Drain: còn **${e.drainCharges}** lần; phản công trúng sẽ hút 1 Mana.` : ""}`;
  }
  if (e.type === "chest") {
    const names = {
      ancient_mimic: "Ancient Mimic",
      mimic: "Mimic",
      legendary: "SSR",
      cursed: "UR (kèm curse)",
      rare: "SR",
      common: "R",
      empty: "Hòm trống",
      fake: "SSR giả (không công dụng)",
    };
    const odds = e.odds || core.chestOdds(s, e.name === "Treasure Chest");
    return `**Tỷ lệ mở hòm**\n${Object.entries(odds)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => `${names[key]}: **${percent(n)}**`)
      .join(
        "\n",
      )}\n\n**Kiểm tra:** ${percent(e.detectionChance)} phát hiện nếu có Mimic; không phát hiện chưa chắc an toàn.\n**Pity:** SR+ ${s.pityRare}/5 · SSR ${s.pityLegendary}/10.${e.guaranteed ? " Hòm này đảm bảo SR+, không Mimic." : ""}\n**Bán:** bonus +15% tiền cược. Đồ nhận chỉ dùng trong run; trùng tên tăng level. UR có curse.`;
  }
  if (e.type === "surprise" && e.kind.endsWith("_shop"))
    return `**Công dụng các món đang bán**\n${e.offers.map((offer, i) => `${i + 1}. **${offer.item.name} [${rarityLabel(offer.item.rarity)}]**\n${itemText(offer.item)}`).join("\n\n")}\n\nMua tối đa **một món** trong lần gặp. ${e.kind === "blood_shop" ? "Trả bằng HP, phải còn ít nhất 1 HP sau mua." : e.kind === "diamond_shop" ? "Kim cương trừ ngay khi mua, không hoàn lại khi run kết thúc." : "Trả từ payout gốc; bonus Blood Paradox không dùng để mua."}`;
  if (e.type === "surprise" && e.kind === "merchant")
    return `**Công dụng hàng hóa**\n${e.offers.map((o) => (o.item ? `**${o.item.name} [SR]**: ${itemText(o.item)}` : { potion: "Bình: thêm 1 bình (giới hạn 5).", heal: "Hồi đầy HP.", luck: "Luck: +1 Luck.", ticket: "Vé thoát: giữ tối đa 1, dùng ở RNGesus." }[o.key] || o.key)).join("\n")}\nChỉ mua một offer; trả từ payout gốc.`;
  return "Không có thông tin bổ sung; xem bảng chơi chính.";
}
function chaosLabel(s) {
  const p = s.lastChaosChance || 0;
  return `${icon(p < 0.01 ? "large_green_circle" : p < 0.03 ? "large_yellow_circle" : "red_circle", p < 0.01 ? "🟢" : p < 0.03 ? "🟡" : "🔴")} Chaos: **${percent(p)}**`;
}
function embed(state, userId, result = null, sessionId = null) {
  const c = stats.CLASSES[state.classKey];
  const e = new EmbedBuilder()
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
      `${c.emoji} SINH TỒN v${state.releaseVersion} · TẦNG ${state.floor}${state.floor > 100 ? " · OVERRUN" : ""}`,
    )
    .setDescription(
      `${icon("bust_in_silhouette", "👤")} <@${userId}> · **${world.regionForFloor(state.floor).name}**`,
    )
    .addFields(
      {
        name: `${c.emoji} ${c.name}`,
        value: (state.phase === "encounter" && state.encounter.type === "combat"
          ? battleStats(state)
          : statLine(state, false, state.phase !== "upgrade")
        ).slice(0, 1024),
      },
      {
        name: state.encounter.type === "combat" ? "Đối thủ" : "Tình huống",
        value: encounterSummary(state).slice(0, 1024),
      },
    );
  if (!result && state.phase === "upgrade")
    for (const key of stats.ATTRIBUTES)
      e.addFields({
        name: `${E[key]} +5 ${key.toUpperCase()}`,
        value: checkpointPreview(state, key),
      });
  if (!result && state.lastUpgrade)
    e.addFields({
      name: `${E[state.lastUpgrade.key]} Đã tăng +5 ${state.lastUpgrade.key.toUpperCase()}`,
      value: statTransitions(state.lastUpgrade.before, state.lastUpgrade.after),
    });
  const mods =
    Object.entries(state.modifiers)
      .map(([key, n]) => `${world.RIFT_MODIFIERS[key].name} ×${n}`)
      .join(" · ") || "Chưa có";
  e.addFields(
    {
      name: `${icon("compass", "🧭")} Tiến trình`,
      value: `Đã vượt ${state.cleared} · Boss ${state.bosses} · Modifier ${Object.values(state.modifiers || {}).reduce((sum, n) => sum + n, 0)}\n${chaosLabel(state)}`,
    },
    {
      name: `${icon("cyclone", "🌀")} Rift modifier`,
      value:
        `${mods}${state.paradox ? `\nParadox: ${state.paradox.kind === "blood" ? `Máu là tiền ${percent(state.paradox.bloodFactor)}` : "Ngược đời"} · hết tầng ${state.paradox.until}` : ""}`.slice(
          0,
          1024,
        ),
    },
    {
      name: `${icon("moneybag", "💰")} Rút thưởng`,
      value: result
        ? `Đã nhận **${money(result.payout)} ${icon("coin", "🪙")}** - **${money(result.diamonds || 0)} ${icon("gem", "💎")}**`
        : state.cleared
          ? `**${money(core.payout(state))} ${icon("coin", "🪙")}** - **${money(runDiamondReward(state))} ${icon("gem", "💎")}**`
          : "Chưa thể rút",
      inline: true,
    },
    {
      name: "🎒 Trang bị",
      value:
        equipmentSummary(state) +
        (state.payoutFactor < 1
          ? `\nPayout sau phạt ×${state.payoutFactor.toFixed(3)}`
          : "") +
        (state.classShrine &&
        state.floor >= state.classShrine.from &&
        state.floor <= state.classShrine.until
          ? `\nClass Shrine · hết sau tầng ${state.classShrine.until}`
          : "") +
        (state.contract
          ? `\nHợp đồng: không ${{ potion: "bình", skill: "skill", defend: "thủ" }[state.contract.kind]} · ${state.contract.remaining} tầng`
          : ""),
    },
    {
      name: `${icon("scroll", "📜")} Lượt vừa rồi`,
      value: (state.lastLog || "Run bắt đầu.").slice(0, 1024),
    },
  );
  if (result) {
    const won = ["cashout", "summit"].includes(result.reason);
    e.addFields(
      {
        name: `${icon("checkered_flag", "🏁")} KẾT QUẢ`,
        value: resultBlock({
          userId,
          outcome: result.outcome,
          stake: state.stake,
          payout: result.payout,
          result,
          reason: won
            ? `rút thưởng tầng ${state.floor}`
            : result.reason === "forfeit"
              ? "bỏ run"
              : `tử trận tầng ${state.floor}`,
        }).slice(0, 1024),
      },
      {
        name: `${icon("gem", "💎")} Kim cương Sinh tồn`,
        value: won
          ? `Đã cộng **${money(result.diamonds || 0)}** kim cương vào tài khoản.`
          : `Mất **${money(result.diamondsLost || 0)}** kim cương tạm giữ.`,
      },
    );
  }
  if (result?.achievements?.length)
    e.addFields({
      name: "Thành tựu mới",
      value: result.achievements
        .map((x) => x.name)
        .join(" · ")
        .slice(0, 1024),
    });
  return e.setFooter({
    text: `${sessionId ? `Mã ván: ${sessionId} • ` : ""}Lượt ${state.turn} • Cược ${money(state.stake)} xu • /sinhton tieptuc`,
  });
}
function button(
  id,
  label,
  style = ButtonStyle.Secondary,
  disabled = false,
  emojiOverride = null,
) {
  const action = id.split(":")[3] || "";
  const symbols = {
    attack: ["PHYS", "⚔️"],
    defend: ["DEF", "🛡️"],
    skill: ["sparkles", "✨"],
    potion: ["potion", "🧪"],
    retreat: ["moneybag", "💰"],
    open: ["unlock", "🔓"],
    inspect: ["mag", "🔍"],
    sell: ["moneybag", "💰"],
    leave: ["walking", "🚶"],
    skip: ["walking", "🚶"],
    event_skip: ["walking", "🚶"],
    touch: ["moyai", "🗿"],
    next: ["arrow_right", "➡️"],
    fight: ["PHYS", "⚔️"],
    flee: ["runner", "🏃"],
    bribe: ["moneybag", "💰"],
    pray: ["pray", "🙏"],
    ticket: ["ticket", "🎫"],
    event_smith: ["hammer", "🔨"],
    event_cleanse: ["sparkles", "✨"],
    event_heal: ["HP", "❤️"],
  };
  let symbol = id.startsWith("replay:") ? ["repeat", "🔁"] : symbols[action];
  if (action.startsWith("view_"))
    symbol = {
      stats: ["bar_chart", "📊"],
      items: ["school_satchel", "🎒"],
      effects: ["cyclone", "🌀"],
      encounter: ["information_source", "ℹ️"],
    }[action.split("_")[1]];
  if (action.startsWith("page_"))
    symbol = label === "Trước" ? ["arrow_left", "⬅️"] : ["arrow_right", "➡️"];
  if (action.startsWith("upgrade_"))
    symbol = {
      str: ["STR", "💪"],
      dex: ["DEX", "🗡️"],
      vit: ["VIT", "❤️"],
      ene: ["ENE", "🔮"],
    }[action.slice(8)];
  if (action.startsWith("buy_")) symbol = ["shopping_cart", "🛒"];
  const b = new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label.slice(0, 80))
    .setStyle(style)
    .setDisabled(Boolean(disabled));
  if (emojiOverride) b.setEmoji(emojiOverride);
  else if (symbol) b.setEmoji(icon(...symbol));
  return b;
}
function chunkRows(buttons) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5)
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  return rows;
}
function rows(sessionId, state, disabled = false) {
  if (disabled)
    return chunkRows([
      button(
        `replay:hardcore:${state.stake}:${state.classKey}`,
        "Chơi lại",
        ButtonStyle.Success,
      ),
    ]);
  const prefix = `hardcore:${sessionId}:${state.turn}:`;
  const actions = core.actions(state);
  if (state.encounter.type === "chest")
    actions.sort(
      (a, b) =>
        ["open", "inspect", "sell", "leave"].indexOf(a.action) -
        ["open", "inspect", "sell", "leave"].indexOf(b.action),
    );
  const buttons = actions.map((a) =>
    button(
      prefix + a.action,
      {
        potion: `Bình máu (${state.potions})`,
        open: "Mở hòm",
        inspect: "Kiểm tra",
        sell: "Bán hòm",
        leave: "Tránh Mimic",
      }[a.action] || a.label,
      a.action === "fight"
        ? ButtonStyle.Danger
        : ["attack", "open", "next", "flee"].includes(a.action)
          ? ButtonStyle.Primary
          : ["skill", "bribe", "ticket"].includes(a.action)
            ? ButtonStyle.Success
            : ButtonStyle.Secondary,
      a.disabled,
      a.action === "skill" ? SKILL_ICONS[state.classKey] : null,
    ),
  );
  if (state.encounter.type !== "rngesus")
    buttons.push(
      button(
        prefix + "retreat",
        state.phase === "summit"
          ? "Rút thưởng"
          : state.cleared
            ? "Rút thưởng"
            : "Bỏ run",
        ButtonStyle.Danger,
      ),
    );
  const result = chunkRows(buttons);
  result.push(
    new ActionRowBuilder().addComponents(
      viewTabs(state).map((tab) =>
        button(prefix + `view_${tab}_0`, viewLabel(tab, state)),
      ),
    ),
  );
  return result;
}
function privatePayload(
  state,
  sessionId,
  sourceMessageId,
  tab = "items",
  page = 0,
) {
  const pages =
    tab === "items" ? Math.max(1, Math.ceil(state.items.length / 5)) : 1;
  page = clampPage(page, pages);
  const e = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(
      `SINH TỒN v${state.releaseVersion} · ${{ stats: "CHỈ SỐ", items: "TRANG BỊ VÀ CÔNG DỤNG", effects: "RIFT & HIỆU ỨNG", encounter: "CHI TIẾT" }[tab] || "CHI TIẾT"}`,
    )
    .setDescription(
      `${stats.CLASSES[state.classKey].emoji} ${stats.CLASSES[state.classKey].name} · Tầng ${state.floor}`,
    );
  if (tab === "items") {
    e.addFields({
      name: "Vật tư",
      value: `${E.potion} ${state.potions} bình · hồi ${percent(state.potionRate)} Max HP, tối thiểu 20.\n${E.ticket} ${state.escapeTokens} vé (tối đa 1); dùng an toàn ở RNGesus.`,
    });
    for (const item of state.items.slice(page * 5, page * 5 + 5))
      e.addFields({
        name: `${item.name} Lv.${item.level} [${rarityLabel(item.rarity)}]`,
        value:
          `${effectText(item.definition.effects, item.level)}${item.definition.curse ? `\n☣️ ${item.level > (item.cleansedLevels || 0) ? effectText(item.definition.curse.effects, item.level - (item.cleansedLevels || 0)) : "Đã giải toàn bộ curse"}` : ""}`.slice(
            0,
            1024,
          ),
      });
    if (!state.items.length)
      e.addFields({ name: "Trang bị", value: "Chưa có." });
    e.addFields({
      name: "Cách đọc",
      value:
        "Buff cộng mỗi cấp. Bình/vé/hồi HP chỉ nhận lúc nhặt thêm cấp. Trang bị chỉ tồn tại trong run. Nhặt trùng tên tăng level; giới hạn chỉ số áp dụng sau khi tính tổng.",
    });
  } else if (tab === "stats") {
    e.addFields(
      { name: "Chỉ số", value: statLine(state) },
      {
        name: "Bốn thuộc tính",
        value:
          "STR: vật lý và DEF. DEX: trúng/né/Crit; damage chính Amazon/Assassin. VIT: Max HP và bình máu. ENE: phép/RES/Max Mana. ENE là thuộc tính; Mana là tài nguyên dùng skill.",
      },
      {
        name: `${SKILL_ICONS[state.classKey]} ${stats.CLASSES[state.classKey].skill}`,
        value: SKILLS[state.classKey],
      },
      {
        name: `${E.attack} Tấn công`,
        value: `Một đòn vật lý, có thể trượt/Crit ×1,75. Hồi **${core.attackManaGain(state)} Mana** (tối đa Max Mana), kể cả đánh trượt. Quái còn sống sẽ phản công.`,
      },
      {
        name: `${E.defense} Phòng thủ`,
        value:
          "Không gây sát thương, hồi **1 Mana**. Lần phản công này: DEF ×2 khi nhận vật lý, +15 RES khi nhận phép, giảm thêm 15% sát thương, miễn Crit. Hết hiệu lực sau phản công.",
      },
      {
        name: "Sở trường class",
        value: `Sức mạnh ×${balance.power(state)}. Áp dụng vào sức mạnh vật lý và phép từ thuộc tính/trang bị; dải sát thương đang hiển thị đã tính hệ số. HP, DEF, RES và chi phí Mana giữ theo thuộc tính.`,
      },
    );
    if (state.phase === "upgrade")
      for (const key of stats.ATTRIBUTES)
        e.addFields({
          name: `+5 ${key.toUpperCase()}`,
          value: checkpointPreview(state, key),
        });
  } else if (tab === "effects") {
    for (const [key, n] of Object.entries(state.modifiers))
      e.addFields({
        name: `${world.RIFT_MODIFIERS[key].name} ×${n}`,
        value: `${world.RIFT_MODIFIERS[key].text} Stack hiệu dụng: ${world.effectiveStacks(n)}.`,
      });
    e.addFields({
      name: "Hiệu ứng hiện hành",
      value: `Paradox: ${state.paradox ? `${state.paradox.kind} tới tầng ${state.paradox.until}` : "không"}\nClass Shrine: ${state.classShrine ? `${SHRINES[state.classKey]} Hết tầng ${state.classShrine.until}.` : "không"}\nHợp đồng: ${state.contract ? `không ${state.contract.kind}, còn ${state.contract.remaining} tầng` : "không"}\nPayout gốc ${money(core.rawPayout(state))} xu; bonus Blood Paradox không dùng mua đồ.`,
    });
  } else {
    e.setDescription(
      `${stats.CLASSES[state.classKey].emoji} ${stats.CLASSES[state.classKey].name} · Tầng ${state.floor}\n\n${hasEncounterDetails(state) ? encounterDetails(state) : "Không có thông tin bổ sung; xem bảng chơi chính."}`.slice(
        0,
        4096,
      ),
    );
  }
  e.setFooter({
    text: `v${state.releaseVersion} · Lượt ${state.turn} · Trang ${page + 1}/${pages}`,
  });
  const prefix = `hardcore:${sessionId}:${state.turn}:`;
  const buttons = viewTabs(state).map((t) =>
    button(
      prefix + `view_${t}_0:${sourceMessageId}`,
      viewLabel(t, state),
      t === tab ? ButtonStyle.Primary : ButtonStyle.Secondary,
    ),
  );
  if (pages > 1)
    buttons.push(
      button(
        prefix + `page_items_${Math.max(0, page - 1)}:${sourceMessageId}`,
        "Trước",
        ButtonStyle.Secondary,
        page === 0,
      ),
      button(
        prefix +
          `page_items_${Math.min(pages - 1, page + 1)}:${sourceMessageId}`,
        "Sau",
        ButtonStyle.Secondary,
        page === pages - 1,
      ),
    );
  return {
    content: "",
    embeds: [e],
    components: chunkRows(buttons),
    allowedMentions: { parse: [] },
  };
}
function clampPage(page, pages) {
  return Math.max(
    0,
    Math.min(pages - 1, Number.isSafeInteger(page) ? page : 0),
  );
}
function setupPreview(classKey) {
  const state = stats.createState(classKey, 10);
  const c = stats.CLASSES[classKey];
  const main = stats.mainStat(state).toUpperCase();
  const builds = {
    amazon:
      "Ưu tiên DEX cho sát thương, trúng/né và Crit; thêm VIT khi thiếu HP. Trang bị vật lý, ACC và Crit hợp với hai phát Barrage.",
    barbarian:
      "Ưu tiên STR cho sát thương và DEF; thêm VIT để tăng HP. Chọn trang bị vật lý và chống chịu, dùng Iron Will khi đủ Mana.",
    assassin:
      "Ưu tiên DEX cho sát thương, né và Crit; thêm VIT để tránh chết nhanh. Luân phiên đánh thường lấy Mana và Shadow Step để né phản công.",
    sorceress:
      "Ưu tiên ENE cho skill phép, RES và Max Mana; thêm VIT cho HP. Chọn trang bị phép, đánh thường hồi Mana rồi dùng Arcane Burst.",
    druid:
      "Ưu tiên STR cho sát thương vật lý; thêm VIT cho HP và lượng hồi từ skill. Chọn trang bị vật lý/chống chịu, dùng Wild Regeneration khi đã mất HP.",
    necromancer:
      "Ưu tiên ENE cho skill phép, RES và Max Mana; thêm VIT cho HP. Đánh thường hồi Mana, dùng Totem Ward để vừa gây phép vừa chặn phản công.",
    paladin:
      "Ưu tiên STR cho sát thương và DEF; thêm VIT cho HP. Chọn trang bị vật lý/chống chịu, dùng Divine Shield để gây sát thương rồi thủ.",
  };
  const manaGain = core.attackManaGain(state);
  return {
    name: `${c.emoji} ${c.name}`,
    skillIcon: SKILL_ICONS[classKey],
    role: `Build ${main} · ${{ amazon: "Hai phát vật lý", barbarian: "Vật lý và chống chịu", assassin: "Crit và né phản công", sorceress: "Skill phép mạnh", druid: "Vật lý và hồi phục", necromancer: "Phép và chặn phản công", paladin: "Vật lý và phòng thủ" }[classKey]}`,
    attributes: `${E.str} STR **${state.str}** · ${E.dex} DEX **${state.dex}** · ${E.vit} VIT **${state.vit}** · ${E.ene} ENE **${state.ene}**`,
    stats: `${E.str} STR **${state.str}** · ${E.dex} DEX **${state.dex}** · ${E.vit} VIT **${state.vit}** · ${E.ene} ENE **${state.ene}**\n${E.hp} HP **${state.hp}** · ${E.mana} Mana **${state.mana}** · ${E.defense} DEF **${state.defense}** · ${E.potion} Bình **${state.potions}**\n${E.attack} Vật lý **${state.damageMin}–${state.damageMax}** · ${E.magic} Phép **${state.spellMin}–${state.spellMax}** · RES **${state.resistance}%** · Crit **${percent(state.critChance)}**`,
    build: builds[classKey],
    attack: `Một đòn **vật lý ${state.damageMin}–${state.damageMax}** trước giảm trừ; có thể trượt, có thể Crit ×1,75. Hồi **${manaGain} Mana** ở chỉ số ban đầu (40% Max Mana; class phép 70%, làm tròn xuống, tối thiểu 1). Quái còn sống sẽ phản công.`,
    defend:
      "Không gây sát thương; hồi **1 Mana**. Trong lần phản công này: **DEF ×2** khi nhận vật lý, **+15 RES** khi nhận phép, giảm thêm **15% sát thương** và miễn Crit. Không duy trì sang lượt sau.",
    skill: `${SKILLS[classKey]} Tốn **2 Mana**, không hồi Mana như đánh thường. ${["sorceress", "necromancer"].includes(classKey) ? "Sát thương phép chịu RES của quái, không Crit." : "Mỗi đòn vật lý có thể trượt/Crit, chịu DEF của quái."} ${["assassin", "necromancer"].includes(classKey) ? "Chặn phản công của lượt này kể cả skill không gây sát thương." : classKey === "paladin" ? "Nếu quái sống, nhận phản công với hiệu quả Phòng thủ; skill không cộng 1 Mana." : "Nếu quái sống, nhận phản công bình thường."}`,
    passive: `Đặc tính thường trực: vật lý lấy **${Math.round(c.strWeight * 100)}% STR + ${Math.round((1 - c.strWeight) * 100)}% DEX**; Crit nền **${percent(c.baseCrit)}**, RES nền **${c.baseRes}%**, cộng thêm từ thuộc tính/trang bị. Hiệu ứng né/chặn/hồi HP của skill chỉ kích hoạt khi dùng skill.`,
    shrine: `Chỉ có khi nhận **Class Shrine**, tối đa 3 tầng: ${SHRINES[classKey]}`,
    power: balance.power(state),
  };
}
function ratesFields(category) {
  const fields = {
    encounters: [
      {
        name: "Encounter & sự kiện",
        value:
          "Boss mỗi 50 tầng, final boss 999 → RNGesus → Tower Remembers → Grave Echo → pool thường. Pool: quái 53%, Elite 12%, hòm 10%, Shrine 8%, kho báu 5%, trap 6%, surprise 4%, trống 2%. Surprise cách nhau ≥2 tầng. Event: Healer, Goblin, Smith, Purifier, Sacrifice, Gambler, Adventurer, Fountain, Forge, Merchant, Mirror, Treasure Room, Contract, Class Shrine, Doors, Duelist, ba Item Shop.",
      },
      {
        name: "Wrong Portal",
        value:
          "50% tốt/50% xấu; Luck không tác động. Nhánh xấu gọi Elite đánh phủ đầu.",
      },
      {
        name: "Grave Echo và Tower Remembers",
        value:
          "Echo từ tầng 101: 1% mỗi encounter hợp lệ, tối đa một/dải 100 tầng, không gặp chính mình; claim 30 phút, server tối đa 10, hết hạn 7 ngày. Tower giữ tối đa 8 món nợ, pre-roll 50/50 tốt/xấu, kích hoạt sau 10–30 tầng.",
      },
    ],
    loot: [
      {
        name: "Hòm, item và Luck",
        value:
          "Catalog v2: R 32/SR 28/SSR 24/UR 16. Trùng tên tăng level. Mimic: 3% Ancient +12% thường trước modifier. Hòm an toàn: SSR 10%, UR 3%, SR 22%, R 40%, rỗng 20%, giả 5%; bonus SSR thay bớt nhánh rỗng/giả. Sau 5 hòm không SR+, hòm kế đảm bảo SR+; sau 10 hòm không SSR, mỗi trượt thêm +2 điểm %. Luck +0,2 điểm % SSR/điểm, SSR cap 35%; inspect min(95%,25%+Luck×3%+item).",
      },
    ],
    rngesus: [
      {
        name: "RNGesus",
        value:
          "Chaos hiện bằng % trên bảng chơi. Chạy 75%, thất bại tự dùng vé; cầu nguyện 30%, thưởng SSR 85%/UR 15%; đánh chết; hối lộ −40% payout.",
      },
    ],
    combat: [
      {
        name: "Cân bằng class",
        value: `Run mới v${RELEASE.version}: ${Object.entries(balance.PROFILES)
          .map(
            ([key, profile]) => `${stats.CLASSES[key].name} ×${profile.power}`,
          )
          .join(
            " · ",
          )}. Hệ số áp dụng vào sức mạnh vật lý/phép trước khi tạo dải sát thương. Kỹ năng vẫn giữ cơ chế riêng; run đã bắt đầu giữ hệ số đã lưu.`,
      },
      {
        name: "Chỉ số và chiến đấu v2",
        value:
          "STR/DEX/VIT/ENE tạo chỉ số; Mana riêng. Skill tốn 2 Mana. Tấn công hồi 70% Max Mana cho Sorceress/Necromancer, 40% cho class khác, tối thiểu 1. Thủ: DEF ×2/+15 RES, giảm thêm 15%, miễn Crit, +1 Mana. Bình hồi 35% + min(15%,VIT×0,05%) + item, cap 10–75%.",
      },
      {
        name: "Checkpoint và Rift",
        value:
          "Mỗi 5 tầng: đầy HP, +2 bình, chọn +5 thuộc tính. Mỗi 10: modifier. Mỗi 25: Paradox 5 tầng. Sau 199/399/699/899: xóa một modifier (trừ Unstable). Stack 1–3 100%, 4–8 50%, sau đó 25%; cap 8 hiệu dụng. Soul Drain ceil(stack/4) charge mỗi combat, cap 3.",
      },
    ],
    rewards: [
      {
        name: "Dịch vụ và phần thưởng",
        value:
          "Rèn 12% payout tăng một cấp. Purifier 20% giải toàn bộ curse, giữ buff/cấp và chuyển SSR. Forge hấp thụ buff một cấp rồi chọn bonus. Payout Shop: 5%/12%/25% theo R/SR/SSR, tối đa 5/run. Blood Shop: 12%/25%/40% Max HP theo SR/SSR/UR, tối đa 3/run, giữ ≥1 HP. Diamond Shop từ tầng 101: 200/600/1.600 gem, tối đa 2/run. Mỗi loại cách ≥50 tầng.",
      },
      {
        name: "Payout và phiên bản",
        value:
          "Thưởng tầng dừng tăng tại 100, event bonus vẫn tăng; cap 10 triệu xu. Rút thưởng/Summit mới nhận xu và gem tạm giữ, chết/bỏ/hết hạn mất toàn bộ. Kim cương mốc 100–900: 100/200/400/800/1.600/3.200/6.400/12.800/25.600, hạ 999: 51.200. Run cũ giữ luật legacy; run mới v2.0.1. Mỗi run lưu phiên bản và lịch sử để đối chiếu.",
      },
    ],
  };
  return category
    ? fields[category] || fields.combat
    : Object.values(fields).flat();
}
module.exports = {
  embed,
  rows,
  privatePayload,
  setupPreview,
  ratesFields,
  statLine,
  effectText,
  encounterText,
  checkpointPreview,
  SKILLS,
};
