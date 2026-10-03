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
  hp: icon("heart", "❤️"),
  attack: icon("crossed_swords", "⚔️"),
  defense: icon("shield", "🛡️"),
  mana: icon("sparkles", "✨"),
  res: icon("crystal_ball", "🔮"),
  luck: icon("four_leaf_clover", "🍀"),
  crit: icon("boom", "💥"),
  potion: icon("test_tube", "🧪"),
  ticket: icon("ticket", "🎫"),
  str: icon("STR", "💪"),
  dex: icon("DEX", "🗡️"),
  vit: icon("VIT", "❤️"),
  ene: icon("ENE", "🔮"),
};
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
function statLine(s, changes = true, compact = false) {
  const d = (key, suffix) => (changes ? delta(s, key, suffix) : "");
  const inverse = s.paradox?.kind === "inverse";
  const range = core.physicalRange(s);
  const defense = inverse ? (s.damageMin + s.damageMax) / 2 : s.defense;
  const lines = [
    `${healthBar(s.hp, s.maxHp)}${d("hp")}${d("maxHp", " MAX")}`,
    `${E.str} STR **${s.str}**${d("str")} · ${E.dex} DEX **${s.dex}**${d("dex")} · ${E.vit} VIT **${s.vit}**${d("vit")} · ${E.ene} ENE **${s.ene}**${d("ene")}`,
    `${E.mana} Mana **${s.mana}/${s.maxMana}**${d("mana")}${d("maxMana", " MAX")} · ${E.potion} Bình ${s.potions}${d("potions")} · ${E.ticket} Vé ${s.escapeTokens}${d("escapeTokens")}`,
    `${E.attack} Vật lý **${range[0]}–${range[1]}**${inverse ? " (Paradox)" : d("damageMin")} · ${E.res} Phép **${s.spellMin}–${s.spellMax}**${d("spellMin")}`,
    `${E.defense} DEF **${defense}**${inverse ? " (Paradox)" : d("defense")} · RES **${s.resistance}%**${d("resistance")} · ${E.luck} LUCK **${s.luck}**${d("luck")}`,
  ];
  if (!compact)
    lines.push(
      `${icon("dart", "🎯")} ACC **${s.accuracy}**${d("accuracy")} · ${icon("dash", "💨")} EVA **${s.evasion}**${d("evasion")} · ${E.crit} CRIT **${percent(s.critChance)}**${d("critChance", "%")}\nBình **${percent(s.potionRate)}** Max HP`,
    );
  return lines.join("\n");
}
function effectText(effects, level = 1) {
  const names = {
    str: `${E.str} STR`,
    dex: `${E.dex} DEX`,
    vit: `${E.vit} VIT`,
    ene: `${E.ene} ENE`,
    luck: "Luck",
    maxHp: "Max HP",
    maxMana: "Max Mana",
    physical: "Vật lý",
    spell: "Phép",
    defense: "DEF",
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
  return `HP ${s.maxHp}→${p.maxHp} · VL ${s.damageMin}–${s.damageMax}→${p.damageMin}–${p.damageMax} · Phép ${s.spellMin}–${s.spellMax}→${p.spellMin}–${p.spellMax}\nDEF ${s.defense}→${p.defense} · ACC ${s.accuracy}→${p.accuracy} · EVA ${s.evasion}→${p.evasion} · Crit ${percent(s.critChance)}→${percent(p.critChance)} · RES ${s.resistance}→${p.resistance}% · Mana ${s.maxMana}→${p.maxMana} · Bình ${percent(s.potionRate)}→${percent(p.potionRate)}`;
}
function encounterText(s) {
  if (s.phase === "upgrade")
    return "Chọn **+5 STR, DEX, VIT hoặc ENE**. Xem nút **Chỉ số** để đọc dự báo trước khi chọn.";
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
      `Đòn kế: **${e.nextDamageType === "magic" ? "Phép" : "Vật lý"}** · Dự báo nhận **${p.low}–${p.high} HP** · Trúng ${percent(p.chance)} *(chưa Crit/chưa Thủ)*\n` +
      (e.mechanic ? `Cơ chế: ${mechanisms[e.mechanic]}\n` : "") +
      `**Tấn công:** vật lý, hồi ${Math.max(1, Math.floor(s.maxMana * (["sorceress", "necromancer"].includes(s.classKey) ? 0.7 : 0.4)))} Mana. **Thủ:** DEF ×2 hoặc +15 RES, giảm thêm 15% DMG, miễn Crit, +1 Mana.\n**${stats.CLASSES[s.classKey].skill} (2 Mana):** ${SKILLS[s.classKey]} **Bình:** hồi ${percent(s.potionRate)} Max HP, ít nhất 20; quái còn sống phản công.`
    );
  }
  if (e.type === "rngesus")
    return "**RNGesus · không thể đánh bại.**\nĐánh: chết. Chạy: **75%**; thất bại tự tiêu vé, không có vé thì chết. Hối lộ: mất **40% payout**. Cầu nguyện: **10%** sống, thưởng 85% SSR/15% UR; trượt chết. Vé: vượt an toàn.";
  if (e.type === "chest")
    return `**${e.name}**${e.revealed ? " · ⚠️ Đã phát hiện Mimic" : ""}\nKiểm tra: ${percent(e.detectionChance)} phát hiện nếu là Mimic; không phát hiện chưa chắc an toàn. Bán: +15% cược. Mở: nhận item/rỗng/SSR giả hoặc chiến đấu Mimic.\nPity SR+: ${s.pityRare}/5 · Pity SSR: ${s.pityLegendary}/10 · ${e.guaranteed ? "Hòm này đảm bảo SR+, không Mimic." : `Cơ hội SSR cơ bản ${percent(core.legendaryChance(s))}.`}`;
  if (e.type === "shrine")
    return "**Shrine · sáu loại có tỷ lệ bằng nhau (~16,7%).**\nHealing: đầy HP. Armor: +5 STR hoặc VIT. Blood: +8 STR/−5 VIT. Experience: bonus +25% cược. Corrupted: +12 STR/−8 VIT. Fake: mất max(10,30% Max HP). Có thể bỏ qua.";
  if (e.type === "echo")
    return `**${e.name}** · ${e.echo.profile.classKey} · tử trận tầng ${e.echo.floor} · ${e.echo.kills} mạng\nCầu nguyện: hồi 15% HP, giữ mộ. Cướp: nhận một item, 50% đánh thức. Khiêu chiến: quái mạnh hơn 25%, hạ mới nhận loot. Bỏ đi: giữ mộ. Claim hết hạn sau 30 phút không thao tác.`;
  if (e.type === "memory")
    return "**The Tower Remembers.** Hành động trong quá khứ được tháp ghi nhớ. Bấm Đi tiếp để nhận hậu quả; kết quả đã được khóa từ lúc lựa chọn ban đầu.";
  if (e.type === "trap")
    return e.kind === "portal"
      ? "**Wrong Portal: 50% tốt / 50% xấu, Luck không tác động.**\nTốt: hồi đầy/+10 Max HP/+1 bình, bonus 50% cược, hoặc +6 STR/+6 ENE/+1 Luck. Xấu: mất 15% Max HP (giữ ≥1), Mana về 0, mất 2 bình, payout −10%, hoặc −5 STR/ENE; sau đó Elite đánh phủ đầu."
      : `**${e.name}** · Lucky Break ${percent(Math.min(0.3, s.luck * 0.015))}. ${e.kind === "tax" ? "Mất 15% payout nếu không né được." : "Mất 1 bình nếu đang có."}`;
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
    return `👹 **${e.name}** · ${rank}\n${healthBar(e.hp, e.maxHp)}\n${E.attack} Sát thương ${money(e.damageMin)}–${money(e.damageMax)} · ${E.defense} DEF ${money(e.defense)} · RES ${e.resistance}%\nĐòn kế tiếp: **${e.nextDamageType === "magic" ? "Phép" : "Vật lý"}** · Nhận ${preview.low}–${preview.high} HP (chưa Crit/Thủ)`;
  }
  if (e.type === "chest")
    return `📦 **${e.name}** · ${e.revealed ? "😈 Đã phát hiện Mimic" : e.inspected ? "Đã kiểm tra" : "Chưa kiểm tra"}\n${e.guaranteed ? "Đảm bảo SR+, không Mimic." : "Kiểm tra một lần; không phát hiện chưa chắc an toàn."}`;
  if (e.type === "rngesus")
    return "☠️ **RNGesus** · Không thể thắng hoặc rút thưởng.\nBỏ chạy 75%; thất bại tự dùng vé, hết vé thì chết. Hối lộ giảm 40% payout; vé vượt an toàn.";
  if (e.type === "shrine")
    return "🗿 **SHRINE KHÔNG RÕ NGUỒN GỐC**\nChạm để nhận hiệu ứng ngẫu nhiên hoặc bỏ qua. Xem Tình huống để đọc các hiệu ứng.";
  if (e.type === "empty")
    return "🕳️ **PHÒNG TRỐNG**\nĐi tiếp để vượt tầng hoặc rút thưởng.";
  if (e.type === "surprise" && e.kind.endsWith("_shop"))
    return `🛒 **${e.name}** · mua một món\n${e.offers.map((o, i) => `${i + 1}. **${o.item.name} [${rarityLabel(o.item.rarity)}]** · ${money(o.price)} ${e.kind === "blood_shop" ? "HP" : e.kind === "diamond_shop" ? "kim cương" : "xu payout"}`).join("\n")}\nXem Tình huống để đọc công dụng và điều kiện mua.`;
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
function chaosLabel(s) {
  const p = s.lastChaosChance || 0;
  const name =
    p === 0 ? "Yên" : p < 0.01 ? "Thấp" : p < 0.03 ? "Bất ổn" : "NGUY HIỂM";
  return `${icon(p < 0.01 ? "large_green_circle" : p < 0.03 ? "large_yellow_circle" : "red_circle", p < 0.01 ? "🟢" : p < 0.03 ? "🟡" : "🔴")} Chaos: ${name}${s.lastChaosSpike ? " · SPIKE" : ""}`;
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
        value: statLine(state, true, true).slice(0, 1024),
      },
      {
        name: state.encounter.type === "combat" ? "Đối thủ" : "Tình huống",
        value: encounterSummary(state).slice(0, 1024),
      },
    );
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
      value: (state.lastLog || "Run bắt đầu.").slice(0, 360),
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
function button(id, label, style = ButtonStyle.Secondary, disabled = false) {
  const action = id.split(":")[3] || "";
  const symbols = {
    attack: ["crossed_swords", "⚔️"],
    defend: ["shield", "🛡️"],
    skill: ["sparkles", "✨"],
    potion: ["test_tube", "🧪"],
    retreat: ["moneybag", "💰"],
    open: ["unlock", "🔓"],
    inspect: ["mag", "🔍"],
    sell: ["moneybag", "💰"],
    leave: ["walking", "🚶"],
    skip: ["walking", "🚶"],
    event_skip: ["walking", "🚶"],
    touch: ["moyai", "🗿"],
    next: ["arrow_right", "➡️"],
    fight: ["crossed_swords", "⚔️"],
    flee: ["runner", "🏃"],
    bribe: ["moneybag", "💰"],
    pray: ["pray", "🙏"],
    ticket: ["ticket", "🎫"],
    event_smith: ["hammer", "🔨"],
    event_cleanse: ["sparkles", "✨"],
    event_heal: ["heart", "❤️"],
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
  if (symbol) b.setEmoji(icon(...symbol));
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
      ["stats", "items", "effects", "encounter"].map((tab, i) =>
        button(
          prefix + `view_${tab}_0`,
          [
            "Chỉ số",
            `Vật phẩm (${state.items.length})`,
            "Rift & hiệu ứng",
            "Tình huống",
          ][i],
        ),
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
      `SINH TỒN v${state.releaseVersion} · ${{ stats: "CHỈ SỐ", items: "TRANG BỊ VÀ CÔNG DỤNG", effects: "RIFT & HIỆU ỨNG", encounter: "TÌNH HUỐNG" }[tab] || "CHI TIẾT"}`,
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
      { name: "Kỹ năng", value: SKILLS[state.classKey] },
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
      `${stats.CLASSES[state.classKey].emoji} ${stats.CLASSES[state.classKey].name} · Tầng ${state.floor}\n\n${encounterText(state)}`.slice(
        0,
        4096,
      ),
    );
    e.addFields({
      name: "📜 Diễn biến đầy đủ",
      value: (state.lastLog || "—").slice(0, 1024),
    });
  }
  e.setFooter({
    text: `v${state.releaseVersion} · Lượt ${state.turn} · Trang ${page + 1}/${pages}`,
  });
  const prefix = `hardcore:${sessionId}:${state.turn}:`;
  const buttons = ["stats", "items", "effects", "encounter"].map((t, i) =>
    button(
      prefix + `view_${t}_0:${sourceMessageId}`,
      [
        "Chỉ số",
        `Vật phẩm (${state.items.length})`,
        "Rift & hiệu ứng",
        "Tình huống",
      ][i],
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
  return {
    name: `${stats.CLASSES[classKey].emoji} ${stats.CLASSES[classKey].name} · v2`,
    stats: statLine(state, false),
    skill: SKILLS[classKey],
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
          "Nền: tầng 1–4 0%; 5–9 0,3%; 10–19 0,6%; 20+ 1%. Volatility ×0,25–3; mỗi tầng khô +0,05 điểm %; 2,5% Chaos Spike +4–10 điểm %. Cap 12%. Chạy 75%, thất bại tự dùng vé; cầu nguyện 10%, thưởng SSR 85%/UR 15%; đánh chết; hối lộ −40% payout.",
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
