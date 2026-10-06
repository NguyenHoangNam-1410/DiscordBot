"use strict";
const { RNGESUS_CYCLE_RULES, rngesusChaosRules } = require("./hardcoreRngesus");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const stats = require("./hardcoreStats");
const core = require("./hardcoreV2");
const paradox = require("./hardcoreParadoxService");
const world = require("./hardcoreWorld");
const { RELEASE } = require("./hardcoreVersion");
const balance = require("./hardcoreBalance");
const { runDiamondReward } = require("./hardcoreRewards");
const emoji = require("../discordEmojiMap");
const { appEmoji } = require("../utils/appEmoji");
const { resultBlock } = require("../utils/rewardText");
const icon = (key, fallback) => appEmoji(key, emoji[`:${key}:`] || fallback);
const {
  E,
  SKILL_ICONS,
  RIFT_ICONS,
  eventIcon,
  treasureChestIcon,
  paradoxIcon,
} = require("./hardcoreIcons");
const rarityLabel = (r) =>
  ({ common: "R", rare: "SR", legendary: "SSR", cursed: "UR" })[r];
const percent = (n) => `${Math.round(n * 1000) / 10}%`;
const money = (n) => Math.floor(n).toLocaleString("vi-VN");
const {
  healthBar,
  addTextFields,
  highlightStat,
  STAT_SEPARATOR,
} = require("./hardcoreUi");
const SKILLS = {
  amazon: "Hai phát vật lý ×0,85, tính trúng/Crit riêng.",
  barbarian: "Vật lý ×1,65.",
  assassin: "Vật lý ×1,30, né phản công.",
  sorceress: "Phép ×2,10, luôn trúng, không Crit.",
  druid: `Vật lý ×1,35; hồi ${E.hp} **HP** cho bạn bằng **12% Max HP**, không vượt Max HP.`,
  necromancer: "Phép ×1,55, luôn trúng, không Crit; chặn phản công.",
  paladin: "Vật lý ×1,40 rồi tự Phòng thủ.",
};
const SHRINES = {
  amazon: "20% thêm phát thứ ba khi dùng Barrage.",
  barbarian: `${E.defense} DEF +8 khi ${E.hp} HP ≤30%.`,
  assassin: "Chắc chắn né một phản công.",
  sorceress: "Một skill miễn phí.",
  druid: `Hồi ${E.hp} **HP** cho bạn bằng **5% Max HP** mỗi tầng trong ba tầng kế tiếp, không vượt Max HP.`,
  necromancer: "Chặn một đòn phản công.",
  paladin: `${E.res} RES +10 khi nhận phép.`,
};
const delta = (state, key, suffix = "") => {
  const n = state.lastStatChanges?.[key] || 0;
  return n
    ? ` (${n > 0 ? "+" : ""}${key === "critChance" ? Math.round(n * 1000) / 10 : n}${suffix})`
    : "";
};
function statLine(s, changes = false, compact = false, options = {}) {
  const d = (key, suffix) => (changes ? delta(s, key, suffix) : "");
  const inverse = s.paradox?.kind === "inverse";
  const range = core.physicalRange(s);
  const defense =
    (inverse ? (s.damageMin + s.damageMax) / 2 : s.defense) +
    (options.effective &&
    classShrineActive(s) &&
    s.classKey === "barbarian" &&
    s.hp <= s.maxHp * 0.3
      ? 8
      : 0);
  const resistance = options.effective
    ? core.effectiveResistance(s)
    : s.resistance;
  const lines = [
    `${healthBar(s.hp, s.maxHp)}${d("hp")}${d("maxHp", " MAX")}`,
    `${E.str} **STR** **${s.str}**${d("str")}${STAT_SEPARATOR}${E.dex} **DEX** **${s.dex}**${d("dex")}${STAT_SEPARATOR}${E.vit} **VIT** **${s.vit}**${d("vit")}${STAT_SEPARATOR}${E.ene} **ENE** **${s.ene}**${d("ene")}`,
    `${E.mana} **MP** **${s.mana}/${s.maxMana}**${d("mana")}${d("maxMana", " MAX")}${options.includeSupplies === false ? "" : `${STAT_SEPARATOR}${E.potion} **Bình** ${s.potions}${d("potions")}${STAT_SEPARATOR}${E.ticket} **Vé** ${s.escapeTokens}${d("escapeTokens")}`}`,
    `${E.attack} **${range[0]}–${range[1]}**${inverse ? " (Paradox)" : d("damageMin")}${STAT_SEPARATOR}${E.magic} **Phép** **${s.spellMin}–${s.spellMax}**${d("spellMin")}`,
    `${E.defense} **DEF** **${defense}**${inverse ? " (Paradox)" : d("defense")}${STAT_SEPARATOR}${E.res} **RES** **${resistance}%**${options.effective && resistance !== s.resistance ? ` (gốc ${s.resistance}%)` : d("resistance")}${STAT_SEPARATOR}${E.luck} **LUCK** **${s.luck}**${d("luck")}`,
  ];
  if (!compact)
    lines.push(
      `${E.accuracy} **ACC** **${s.accuracy}**${d("accuracy")}${STAT_SEPARATOR}${E.evasion} **EVA** **${s.evasion}**${d("evasion")}${STAT_SEPARATOR}${E.crit} **CRIT** **${percent(s.critChance)}**${d("critChance", "%")}\nBình **${percent(paradox.potionRate(s))}** Max HP`,
    );
  return lines.join("\n");
}
function battleStats(s) {
  const attack = core.attackDamagePreview(s);
  const defense =
    s.paradox?.kind === "inverse" ? (s.damageMin + s.damageMax) / 2 : s.defense;
  const skill = core.skillDamagePreview(s);
  const detail = {
    amazon: `Hai phát vật lý, trúng/Crit riêng.${skill.extraShot ? " 20% thêm phát thứ ba." : ""}`,
    barbarian: "Vật lý, có thể trượt/Crit.",
    assassin: "Vật lý, có thể trượt/Crit; né phản công.",
    sorceress: "Phép luôn trúng, không Crit.",
    druid: `Vật lý, có thể trượt/Crit; hồi tối đa ${E.hp} **${money(Math.floor(s.maxHp * 0.12))} HP** cho bạn (**12% Max HP**).`,
    necromancer: "Phép luôn trúng, không Crit; chặn phản công.",
    paladin: "Vật lý, có thể trượt/Crit; tự Phòng thủ.",
  }[s.classKey];
  return `${healthBar(s.hp, s.maxHp)}\n${E.mana} **MP** **${s.mana}/${s.maxMana}**${STAT_SEPARATOR}${E.potion} **Bình** **${s.potions}**${STAT_SEPARATOR}${E.ticket} **Vé** **${s.escapeTokens}**\n${E.attack} **${attack.low}–${attack.high} DMG**${STAT_SEPARATOR}${E.defense} **DEF** **${defense}**${STAT_SEPARATOR}${E.res} **RES** **${core.effectiveResistance(s)}%**${core.effectiveResistance(s) !== s.resistance ? ` (gốc ${s.resistance}%)` : ""}\n${SKILL_ICONS[s.classKey]} **${stats.CLASSES[s.classKey].skill} (${core.skillManaCost(s)} MP${paradox.hpCost(s) ? `, −${paradox.hpCost(s)} HP` : ""}): ${skill.low}–${skill.high} DMG**\n${detail}\n`;
}
function effectText(effects, level = 1) {
  const names = {
    str: `${E.str} STR`,
    dex: `${E.dex} DEX`,
    vit: `${E.vit} VIT`,
    ene: `${E.ene} ENE`,
    luck: `${E.luck} LUCK`,
    maxHp: `${E.hp} Max HP`,
    maxMana: `${E.mana} Max MP`,
    physical: `${E.attack} Vật lý`,
    spell: `${E.magic} Phép`,
    defense: `${E.defense} DEF`,
    accuracy: `${E.accuracy} ACC`,
    evasion: `${E.evasion} EVA`,
    resistance: `${E.res} RES`,
    critChance: `${E.crit} CRIT`,
    potionPower: `${E.potion} Hiệu lực bình`,
    bossDamage: `${E.attack} DMG Boss`,
    eliteDamage: `${E.attack} DMG Elite`,
    mimicDetection: `${E.accuracy} Phát hiện Mimic`,
    goblinChance: `${E.luck} Bắt Goblin`,
    legendaryFind: `${E.chest} Tìm SSR`,
    floorHpLoss: `${E.hp} HP mất/tầng`,
    mimicChance: `${E.chest} Mimic`,
    damageTaken: `${E.defense} DMG nhận`,
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
        if (key === "defenseSet") return `${E.defense} **DEF** = 0`;
        if (key === "bonusPenalty")
          return `**Payout** ×${(1 - value).toFixed(2)} mỗi cấp chưa giải`;
        if (key === "potions")
          return `${E.potion} **Bình máu** +${value} khi nhận mỗi cấp`;
        if (key === "escapeTokens")
          return `${E.ticket} **Vé** +${value} khi nhận mỗi cấp (giữ tối đa 1)`;
        if (key === "heal")
          return `${E.hp} **HP** +${value} (hồi khi nhận mỗi cấp)`;
        const n = value * level;
        if (key === "floorHpLoss")
          return `${E.hp} **Cuối tầng:** giảm HP hiện tại một lượng bằng ${percent(n)} Max HP (luôn còn ít nhất 1 HP)`;
        return `${highlightStat(names[key] || key)} ${n > 0 ? "+" : ""}${percentages.includes(key) ? percent(n) : Math.round(n * 100) / 100}`;
      })
      .join(STAT_SEPARATOR) || "Không có"
  );
}
function itemText(item, level = 1) {
  return `${effectText(item.effects, level)}${item.curse ? `\n☣️ Curse: ${effectText(item.curse.effects, level)}` : ""}`;
}
function merchantOffer(offer) {
  if (offer.item)
    return {
      name: `${E.backpack} ${offer.item.name} [${rarityLabel(offer.item.rarity)}]`,
      detail: itemText(offer.item),
      button: offer.item.name,
      icon: E.backpack,
    };
  return (
    {
      potion: {
        name: `${E.potion} Bình máu`,
        detail: `+1 ${E.potion} bình máu (tối đa 5).`,
        button: "Bình máu",
        icon: E.potion,
      },
      heal: {
        name: `${E.hp} Hồi đầy HP`,
        detail: `Hồi đầy ${E.hp} HP.`,
        button: "Hồi đầy HP",
        icon: E.hp,
      },
      luck: {
        name: `${E.luck} +1 LUCK`,
        detail: `+1 ${E.luck} LUCK.`,
        button: "+1 LUCK",
        icon: E.luck,
      },
      ticket: {
        name: `${E.ticket} Vé RNGesus`,
        detail: `+1 ${E.ticket} vé (giữ tối đa 1); tự cứu khi bỏ chạy RNGesus thất bại.`,
        button: "Vé RNGesus",
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
              `- **${percent(chance)}:** ${{ ancient_mimic: "Ancient Mimic", mimic: "Mimic", legendary: "SSR", cursed: "UR kèm lời nguyền", rare: "SR", common: "R", empty: "Rỗng", fake: "Đồ giả" }[key]}`,
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
    ? `${E.hp} HP`
    : kind === "diamond_shop"
      ? `${icon("gem", "💎")} kim cương`
      : `${icon("coin", "🪙")} xu payout`;
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
function rngesusLabel(state) {
  const chance = state.encounter.encounterChance ?? state.lastChaosChance;
  return Number.isFinite(chance) && chance > 0 && chance <= 1
    ? `RNGesus (${(chance * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%)`
    : "RNGesus";
}
function randomEventText(s) {
  const e = s.encounter;
  const heading = (name, intro) =>
    `${eventIcon(["surprise", "trap"].includes(e.type) ? e.kind : e.type)} **${name}:** (${intro})`;
  const option = (name, outcomes) =>
    `**${name}**\n${outcomes.map(([chance, text]) => `- ${chance ? `**${chance}:** ` : ""}${text}`).join("\n")}`;
  const show = (name, intro, options) =>
    [heading(name, intro), ...options].join("\n\n");
  const attr = (key, n) =>
    `${E[key]} **${key.toUpperCase()}** ${n > 0 ? "+" : ""}${n}`;
  if (e.type === "chest") {
    const labels = {
      ancient_mimic: "Chiến đấu Ancient Mimic (Tinh anh).",
      mimic: "Chiến đấu Mimic.",
      legendary: "Nhận đồ [SSR].",
      cursed: "Nhận đồ [UR], kèm curse.",
      rare: "Nhận đồ [SR].",
      common: "Nhận đồ [R].",
      empty: "Hòm trống.",
      fake: "SSR giả, không có công dụng.",
    };
    const odds = e.odds || core.chestOdds(s, e.name === "Treasure Chest");
    return show(
      e.name,
      e.revealed
        ? "Đã phát hiện Mimic."
        : "Mở để nhận đồ hoặc gặp nguy hiểm; trùng tên tăng level.",
      [
        option(
          "Mở hòm",
          e.revealed
            ? [["100%", "Chiến đấu Mimic đã phát hiện."]]
            : Object.entries(odds)
                .filter(([, p]) => p > 0)
                .map(([key, p]) => [percent(p), labels[key]]),
        ),
        `**Kiểm tra:** ${percent(e.detectionChance)} phát hiện nếu có Mimic; không phát hiện chưa chắc an toàn.\n**Bán:** bonus +15% cược.\n${chestPityText(s, e)}`,
      ],
    );
  }
  if (e.type === "shrine")
    return show(
      "Shrine",
      "Chạm để nhận một hiệu ứng; 6 loại có tỷ lệ bằng nhau, mỗi loại 1/6 ≈ 16,7%.",
      [
        option("Chạm Shrine", [
          [null, `**Healing:** hồi đầy ${E.hp} HP.`],
          [
            null,
            `**Armor:** +5 vào một thuộc tính: ${stats.ATTRIBUTES.map((key) => `${E[key]} ${key.toUpperCase()}`).join(" / ")} (mỗi chỉ số 25%).`,
          ],
          [
            null,
            `**Blood:** ${attr(e.powerStat || stats.mainStat(s), 8)}, ${attr("vit", -5)}.`,
          ],
          [null, "**Experience:** bonus +25% cược."],
          [
            null,
            `**Corrupted:** ${attr(e.powerStat || stats.mainStat(s), 12)}, ${attr("vit", -8)}.`,
          ],
          [
            null,
            `**Fake:** bẫy gây sát thương bằng 30% Max ${E.hp} HP (mức bẫy tối thiểu 10), nhưng luôn chừa ít nhất **1 HP**.`,
          ],
        ]),
        "**Bỏ qua:** đi tiếp, không nhận hiệu ứng.",
      ],
    );
  if (e.type === "rngesus") {
    const chance = e.fleeChance ?? core.rngesusFleeChance(s);
    return show(
      rngesusLabel(s),
      "Không thể đánh bại hoặc rút thưởng tại đây. Mỗi lần chọn bỏ chạy giảm 5 điểm % cho lần sau, thấp nhất 75%; chọn hành động khác giữ nguyên tỷ lệ.",
      [
        option("Bỏ chạy", [
          [percent(chance), "Thoát an toàn."],
          ...(chance < 1
            ? [
                [
                  percent(1 - chance),
                  `Tự dùng 1 ${E.ticket} vé nếu có; hết vé thì chết.`,
                ],
              ]
            : []),
        ]),
        option("Cầu nguyện", [
          [
            percent(e.prayerChance ?? core.rngesusPrayerChance(s)),
            "Sống và nhận **1 trang bị UR**, kèm lời nguyền.",
          ],
          [
            percent(1 - (e.prayerChance ?? core.rngesusPrayerChance(s))),
            "Tử trận; Lost Adventurer hoặc vé hồi sinh cứu nếu còn.",
          ],
        ]),
        "**Hối lộ:** cần payout ≥1.000 xu, mất 40% payout để thoát. **Đánh:** chết.",
      ],
    );
  }
  if (e.type === "echo")
    return show(
      e.name,
      "Mộ mất quyền nhận sau 30 phút không thao tác; đồ chỉ được tiết lộ khi nhận.",
      [
        `Class **${e.echo.profile.classKey}** · tử trận tầng ${e.echo.floor} · ${e.echo.kills} mạng.`,
        `**Cầu nguyện:** hồi 15% Max ${E.hp} HP, giữ mộ.`,
        option("Cướp mộ", [
          ["50%", "Nhận một món đồ, đi tiếp an toàn."],
          ["50%", "Nhận một món đồ, Echo thức tỉnh và phải chiến đấu."],
        ]),
        "**Khiêu chiến:** quái mạnh hơn 25%; hạ mới nhận loot. **Bỏ đi:** giữ mộ.",
      ],
    );
  if (e.type === "trap") {
    if (e.kind === "portal")
      return show(
        "Wrong Portal",
        "50% tốt / 50% xấu. Các kết quả trong mỗi nhóm có tỷ lệ bằng nhau; Lucky Break không áp dụng.",
        [
          option("Đi tiếp · kết quả tốt", [
            [
              "16,7%",
              `+10 ${E.hp} Max HP, hồi đầy ${E.hp} HP, +1 ${E.potion} bình máu.`,
            ],
            ["16,7%", "Bonus +50% cược."],
            [
              "16,7%",
              `${attr("str", 6)}${STAT_SEPARATOR}${attr("ene", 6)}${STAT_SEPARATOR}${attr("luck", 1)}.`,
            ],
          ]),
          option("Đi tiếp · kết quả xấu (Elite đánh phủ đầu sau đó)", [
            ["10%", `Mất 15% Max ${E.hp} HP, giữ ít nhất 1.`],
            ["10%", `${E.mana} MP về 0.`],
            ["10%", `Mất tối đa 2 ${E.potion} bình máu.`],
            ["10%", "Mất 10% payout."],
            ["10%", `${attr("str", -5)}, ${attr("ene", -5)}.`],
          ]),
        ],
      );
    const lucky = Math.min(0.3, s.luck * 0.015);
    return show(e.name, `${E.luck} Luck ${s.luck} quyết định Lucky Break.`, [
      option("Chấp nhận số phận", [
        [percent(lucky), "Lucky Break: tránh bẫy."],
        [
          percent(1 - lucky),
          e.kind === "tax"
            ? "Mất 15% payout."
            : `Mất 1 ${E.potion} bình máu nếu đang có.`,
        ],
      ]),
    ]);
  }
  if (e.type !== "surprise") return null;
  const main = stats.mainStat(s);
  switch (e.kind) {
    case "goblin": {
      const chance = Math.min(0.9, 0.6 + s.luck * 0.01 + s.goblinChance);
      return show(
        e.name,
        `Thử bắt để nhận thưởng; tỷ lệ đã tính ${E.luck} Luck và trang bị.`,
        [
          option("Bắt", [
            [percent(chance), "Bonus +25% cược."],
            [percent(1 - chance), "Mất 10% payout."],
          ]),
        ],
      );
    }
    case "gambler":
      return show(e.name, "Trả khoản cược trước khi phân thắng thua.", [
        ...[10, 25].map((n) =>
          option(`Cược ${n}% payout`, [
            ["50%", "Bonus bằng 2 lần khoản đã đặt."],
            ["50%", "Mất khoản đã đặt, không nhận bonus."],
          ]),
        ),
      ]);
    case "adventurer":
      return show(e.name, "Nhận được bảo hộ", [
        option(`Cứu · trả 1 ${E.potion} bình máu`, [
          ["70%", "Nhận đồ [R]."],
          ["30%", "Nhận đồ [SR]."],
        ]),
        option("Cướp", [
          ["75%", "Nhận đồ [SSR]."],
          ["25%", "Nhận đồ [UR], kèm curse."],
        ]),
        "**Hậu quả của cướp sau 10–30 tầng:** 50% mất 10% payout; 50% gặp Bounty Hunter (Elite). Không có nhánh hồi máu hoặc bonus.",
      ]);
    case "fountain":
      return show(e.name, "Uống để hồi phục hoặc gặp Blood Mimic.", [
        option("Uống", [
          ["60%", `Hồi đầy ${E.hp} HP.`],
          ["25%", `+15 ${E.hp} Max HP và hồi 15 ${E.hp} HP.`],
          ["15%", "Chiến đấu Blood Mimic (Tinh anh)."],
        ]),
      ]);
    case "mirror":
      return show(e.name, "Nhận sức mạnh hoặc phá gương để thử vận may.", [
        `**Sức mạnh:** ${attr(main, 10)}.`,
        `**Phòng thủ:** ${attr("vit", 8)}; ${attr("str", 5)} hoặc ${attr("dex", 5)} (50/50).`,
        option("Đập gương", [
          ["20%", `${attr("luck", 2)}.`],
          ["80%", "Chiến đấu Mirror Clone dùng chỉ số của bạn."],
        ]),
      ]);
    case "doors":
      return show(
        e.name,
        "Chọn một cửa; có thể nhận thưởng hoặc gặp nguy hiểm.",
        [
          option("Cửa sáng", [
            ["70%", `Hồi đầy ${E.hp} HP, +1 ${E.potion} bình máu (tối đa 5).`],
            ["30%", `Mất 20% Max ${E.hp} HP, giữ ít nhất 1.`],
          ]),
          option("Cửa vàng", [
            ["70%", "Bonus +50% cược."],
            ["30%", "Chiến đấu Mimic."],
          ]),
          option("Cửa tối", [
            ["60%", "Nhận đồ [SSR]."],
            ["40%", "Chiến đấu Premature Rift Boss."],
          ]),
        ],
      );
    case "treasure_room": {
      const reward = {
        red: `${E.attack} **Vật lý** +5${STAT_SEPARATOR}${E.magic} **Phép** +5.`,
        blue: `${E.defense} **DEF** +6${STAT_SEPARATOR}${E.res} **RES** +5%.`,
        gold: `Bonus +50% cược${STAT_SEPARATOR}${attr("luck", 1)}.`,
      };
      return show(
        e.name,
        "Chọn mở một trong ba rương; không được soi hoặc bỏ qua. Mỗi rương có 1/3 khả năng gặp Mimic, 2/3 nhận thưởng bên dưới.",
        [
          ...Object.entries(reward).map(([color, text]) => {
            return option(
              `${treasureChestIcon(color)} Mở rương ${{ red: "đỏ", blue: "xanh", gold: "vàng" }[color]}`,
              [[null, text]],
            );
          }),
        ],
      );
    }
    case "duelist":
      return show(
        e.name,
        "Oẳn tù tì; mỗi ván thắng, hòa, thua có tỷ lệ ngang nhau (1/3).",
        [
          option("Đấu thuộc tính · một ván", [
            [
              null,
              `**Thắng:** Búa ${attr("str", 6)} / Kéo ${attr("dex", 6)} / Bao ${attr("ene", 6)}.`,
            ],
            [
              null,
              "**Hòa/thua:** trừ ngẫu nhiên tối đa 6 điểm thuộc tính, mỗi chỉ số giữ ít nhất 1.",
            ],
          ]),
          option("Đấu trang bị · thắng 3/5 ván, tỷ lệ lúc bắt đầu", [
            ["≈21%", "Thắng thử thách: đồ [SSR] 75% / [UR] 25%."],
            ["≈79%", "Mất một món R/SR/SSR đã khóa; giữ đồ UR."],
          ]),
          ...(e.mode
            ? [
                `**Tiến trình:** ván ${Math.min(5, e.round + 1)}/5 · đã thắng ${e.wins}.`,
              ]
            : []),
        ],
      );
    default:
      return null;
  }
}
function checkpointPreview(s, key) {
  const p = stats.preview(s, key);
  return statTransitions(s, p);
}
function statTransitions(
  before,
  after,
  includeResources = false,
  options = {},
) {
  const parts = [];
  const add = (name, keys, format) => {
    if (options.only && !keys.some((key) => options.only.includes(key))) return;
    if (options.exclude && keys.some((key) => options.exclude.includes(key)))
      return;
    if (keys.some((key) => before[key] !== after[key]))
      parts.push(
        `${highlightStat(name)}: ${format(before)} → **${format(after)}**`,
      );
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
    ["accuracy", `${E.accuracy} ACC`],
    ["evasion", `${E.evasion} EVA`],
    ["maxMana", `${E.mana} Max MP`],
  ])
    add(label, [key], (s) => s[key]);
  add(`${E.crit} CRIT`, ["critChance"], (s) => percent(s.critChance));
  add(`${E.res} RES`, ["resistance"], (s) => `${s.resistance}%`);
  add(`${E.potion} Bình`, ["potionRate"], (s) =>
    percent(paradox.potionRate(s)),
  );
  if (includeResources) {
    for (const [key, label] of [
      ["hp", `${E.hp} HP`],
      ["mana", `${E.mana} MP`],
      ["luck", `${E.luck} LUCK`],
      ["potions", `${E.potion} Bình máu`],
      ["escapeTokens", `${E.ticket} Vé thoát hiểm`],
    ])
      add(label, [key], (s) => s[key]);
  }
  return (
    parts.join(STAT_SEPARATOR) ||
    (options.empty ? "" : "Không thay đổi chỉ số chiến đấu.")
  );
}
function encounterText(s) {
  if (s.phase === "boss_chest")
    return `${eventIcon("boss_chest")} **RƯƠNG BOSS · TẦNG ${s.encounter.bossFloor}**\nPhần thưởng sau boss cuối khu vực. Chọn **mở hoặc bán** để tiếp tục.\n\n**Mở rương**\n- **70%:** nhận trang bị **SSR**.\n- **30%:** nhận trang bị **UR**, kèm lời nguyền.\nĐồ trùng tên tăng level. Tỷ lệ cố định, không bị Luck/pity thay đổi.\n\n**Bán rương**\n- Cộng **50% payout gốc hiện tại (${money(Math.floor(core.rawPayout(s) * 0.5))} xu)** vào thưởng của run.\nPhải xử lý rương trước khi rút thưởng hoặc đi tiếp.`;
  if (s.phase === "upgrade")
    return `${E.checkpoint} **CHECKPOINT** · Đã hồi đầy ${E.hp} HP và nhận thêm 2 ${E.potion} bình máu.\nChọn **+5 STR, DEX, VIT hoặc ENE**; dự báo thay đổi ở ngay bên dưới.`;
  if (s.phase === "paradox" && s.encounter.version === 2)
    return paradox.choicesText(s.encounter);
  if (s.phase === "paradox")
    return `${eventIcon("paradox")} **RIFT PARADOX**\nChọn **một** quy luật đặc biệt cho tầng **${s.floor}–${s.floor + 4}**. Hết hạn, cơ chế trở lại bình thường.\n\n**Máu là tiền · đổi HP lấy thưởng xu**\n- Mất HP do quái/bẫy: tăng hệ số thưởng xu; hồi HP từ bình/skill/event: giảm hệ số. Mỗi 10% Max HP tương ứng 10 điểm %.\n- Hệ số giới hạn từ **−50% đến +50%**, chỉ áp dụng khi hiệu ứng còn hoạt động. Không tác động kim cương.\n- Hồi đầy ${E.hp} HP tại ${E.checkpoint} checkpoint **không giảm hệ số thưởng**. HP dùng để mua đồ/hiến tế không tăng thưởng.\n\n**Ngược đời · ATK chuyển thành DEF và ngược lại**\n- ${E.attack} ATK: **${s.damageMin}–${s.damageMax} → ${Math.max(1, s.defense - 2)}–${Math.max(1, s.defense + 3)}** (paradox). \n- ${E.defense} DEF: **${s.defense} → ${(s.damageMin + s.damageMax) / 2}** (paradox).`;
  if (s.phase === "severance")
    return `${eventIcon("severance")} Xóa **toàn bộ stack** của một modifier có hại. Unstable Rift được giữ. Chọn một nút để tiếp tục.`;
  if (s.phase === "summit")
    return `${eventIcon("boss")} Đã hạ Deimoss tầng 999. Bấm **Rút thưởng** để chốt chiến thắng và phần thưởng.`;
  const e = s.encounter;
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
      (e.mechanic ? `Cơ chế: ${mechanisms[e.mechanic]}\n` : "") +
      `**Tấn công:** vật lý, hồi ${core.attackManaGain(s)} MP (tối đa Max MP). **Thủ:** DEF ×2 hoặc +15 RES, giảm thêm 15% DMG, miễn Crit, +1 MP.\n**${stats.CLASSES[s.classKey].skill} (${core.skillManaCost(s)} MP${paradox.hpCost(s) ? `, −${paradox.hpCost(s)} HP` : ""}):** ${SKILLS[s.classKey]} **Bình:** hồi ${percent(paradox.potionRate(s))} Max HP, ít nhất 20; quái còn sống phản công.`
    );
  }
  if (e.type === "memory")
    return `${eventIcon("memory")} **The Tower Remembers:** (Hành động trước đó để lại hậu quả.)\n\n**Đi tiếp:** nhận hiệu ứng đã được khóa từ trước.`;
  if (e.type === "empty")
    return `${eventIcon("empty")} Phòng trống. Đi tiếp hoặc rút thưởng.`;
  const k = e.kind;
  if (k.endsWith("_shop"))
    return `${eventIcon(e.kind)} **${e.name}** · mua tối đa **một món**. Giá và offer đã khóa.\n${e.offers.map((offer, i) => `**${i + 1}. ${offer.item.name} [${rarityLabel(offer.item.rarity)}] · ${money(offer.price)} ${shopCurrency(k)}**\n${itemText(offer.item)}`).join("\n")}\n${k === "blood_shop" ? "Phải còn ít nhất 1 HP sau mua." : k === "diamond_shop" ? "Kim cương bị trừ ngay khi mua, kể cả run sau đó tử trận." : "Chi phí lấy từ payout gốc; không dùng bonus Paradox để mua."}`;
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
    return `${eventIcon(k)} **HORADRIC FORGE · LÒ CHUYỂN HÓA**\nTiêu hao **1 level trang bị** để giữ hiệu ứng có lợi trong run và chọn thêm một phần thưởng. Không tốn xu.\n\n**${E.backpack} Trang bị dùng để chuyển hóa**\n${E.backpack} **${target.name} [${rarityLabel(target.rarity)}] · Lv.${target.level}**\n- Sau khi dùng: ${target.level === 1 ? "món này biến mất khỏi trang bị" : `level **${target.level}→${target.level - 1}**`}.\n- **Giữ nguyên hiệu ứng của level đã tiêu hao:** ${effectText(retained)}. Đây là hiệu ứng được giữ lại, không cộng thêm lần nữa.\n${hasCurse ? `- **Xóa lời nguyền của 1 level:** ${effectText(target.definition.curse.effects)}.\n` : ""}- Không nhận lại ${E.potion} bình máu, ${E.ticket} vé hoặc ${E.hp} HP hồi khi nhặt đồ.\n\n**Chọn một phần thưởng thêm**\n- ${E[main]} **${main.toUpperCase()} +6**.\n- ${E[guard]} **${guard.toUpperCase()} +7**.\n- ${E.vit} **VIT +4**.${["legendary", "cursed"].includes(target.rarity) ? `\n- ${E.ticket} **Nhận 1 vé thoát hiểm** (giữ tối đa 1).` : ""}\n\n**Bỏ qua:** giữ nguyên trang bị, không nhận phần thưởng.`;
  }
  const descriptions = {
    healer: `**Hồi phục:** hồi ${E.hp} HP bằng 30% Max HP, ít nhất 20; +1 ${E.potion} bình máu (tối đa 5). Miễn phí.`,
    blacksmith: `Trả 12% payout để tăng một cấp **${target?.name}**. Cộng buff mới; UR chưa giải nguyền cộng cả curse. Đồ đã giải hết nguyền giữ trạng thái sạch khi rèn.`,
    purifier: `Trả **${percent(core.PURIFIER_COST_RATE)} payout gốc**: gỡ **toàn bộ lời nguyền** của **${target?.name}**, giữ buff/level, chuyển thành SSR.`,
    sacrifice: `**Hiến HP:** mất tối đa 20% Max ${E.hp} HP (giữ ≥1) → +6 ${E[stats.mainStat(s)]} ${stats.mainStat(s).toUpperCase()}.\n**Hiến payout:** trả 10% payout → +6 ${E.vit} VIT. Hiến HP không cộng bonus Blood Paradox.`,
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
    return `${["boss", "final_boss"].includes(e.rank) ? eventIcon("boss") : "👹"} **${e.name}** · ${rank}\n${healthBar(e.hp, e.maxHp)}\n${E.attack} ${money(e.damageMin)}–${money(e.damageMax)} DMG · ${E.defense} DEF ${money(e.defense)} · ${E.res} RES ${e.resistance}%\n${E.accuracy} Tỷ lệ vật lý trúng: **${percent(world.hitChance(s.accuracy, e.evasion))}**${e.mechanic === "riftwalker" && e.combatTurn % 3 === 0 ? " · 🛡️ Quái miễn sát thương lượt này" : ""}\n🎯 **Đòn kế tiếp:** ${e.nextDamageType === "magic" ? `${E.magic} Phép` : `${E.attack} Vật lý`}\n📉 **Dự báo nhận:** **${preview.low}–${preview.high} DMG** · ${E.evasion} **${percent(preview.chance)}** trúng bạn *(chưa Crit/DEF)*${world.mimicKind(e) === "ancient_mimic" ? `\n${E.chest} **Hạ quái nhận 1 đồ:** SR 50% · SSR 30% · UR 20%.` : world.mimicKind(e) === "blood_mimic" ? `\n${E.chest} **Hạ quái nhận 1 đồ:** SR 60% · SSR 40%.` : ""}`;
  }

  if (e.type === "empty")
    return `${eventIcon("empty")} **PHÒNG TRỐNG**\nĐi tiếp để vượt tầng hoặc rút thưởng.`;
  if (e.type === "surprise" && e.kind.endsWith("_shop"))
    return `${eventIcon(e.kind)} **${e.name}** · mua một món\n${e.offers.map((o, i) => `${i + 1}. **${E.backpack} ${o.item.name} [${rarityLabel(o.item.rarity)}]** · ${money(o.price)} ${shopCurrency(e.kind)}`).join("\n")}\nXem Chi tiết để đọc công dụng và điều kiện mua.`;
  if (e.type === "surprise" && e.kind === "merchant") return encounterText(s);
  if (hasEncounterDetails(s)) {
    const notices = {
      chest: e.revealed
        ? "Đã phát hiện Mimic. Chọn mở hòm để chiến đấu hoặc tránh Mimic."
        : "Chọn mở, kiểm tra hoặc bán hòm.",
      shrine: "Chọn chạm Shrine hoặc bỏ qua.",
      rngesus: "Không thể đánh bại hoặc rút thưởng tại đây. Chọn cách đối phó.",
      trap: "Đi tiếp để xử lý tình huống.",
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
  return Object.keys(active).length
    ? effectText(active)
    : "Không có chỉ số cộng thêm.";
}
function hasEncounterDetails(s) {
  if (["upgrade", "boss_chest", "paradox"].includes(s.phase)) return true;
  if (s.phase !== "encounter") return false;
  const e = s.encounter;
  return (
    ["chest", "shrine", "rngesus", "trap", "echo", "surprise"].includes(
      e.type,
    ) ||
    (e.type === "combat" &&
      (e.mechanic || ["boss", "final_boss"].includes(e.rank)))
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
    items: `Túi (${s.items.length})`,
    effects: `Rift (${Object.values(s.modifiers || {}).filter((stacks) => stacks > 0).length})`,
    encounter: "Chi tiết",
  }[tab];
}
function encounterDetails(s) {
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
      }[e.mechanic] || "Boss này không có chu kỳ kích hoạt riêng.";
    return `${eventIcon("boss")} **${e.name} · Cơ chế đặc biệt**\n${mechanism}${e.drainCharges > 0 ? `\nSoul Drain: **quái** còn **${e.drainCharges} lần hút**; mỗi phản công trúng rút **1** ${E.mana} **MP** của **bạn**.` : ""}`;
  }
  if (e.type === "chest")
    return encounterText(s).replace(
      chestPityText(s, e),
      chestPityText(s, e, true),
    );
  if (e.type === "surprise" && e.kind.endsWith("_shop"))
    return `${eventIcon(e.kind)} **Công dụng các món đang bán**\n${e.offers.map((offer, i) => `${i + 1}. **${E.backpack} ${offer.item.name} [${rarityLabel(offer.item.rarity)}]**\n${itemText(offer.item)}`).join("\n\n")}\n\nMua tối đa **một món** trong lần gặp. ${e.kind === "blood_shop" ? "Trả bằng HP, phải còn ít nhất 1 HP sau mua." : e.kind === "diamond_shop" ? "Kim cương trừ ngay khi mua, không hoàn lại khi run kết thúc." : "Trả từ payout gốc; bonus Blood Paradox không dùng để mua."}`;
  if (e.type === "surprise" && e.kind === "merchant")
    return `${eventIcon("merchant")} **Công dụng hàng hóa**\n${e.offers.map((o) => `**${merchantOffer(o).name}**\n${merchantOffer(o).detail}`).join("\n\n")}\nChỉ mua một món; trả từ payout gốc. Cần đủ payout để mua.`;
  return encounterText(s);
}
function turnText(state) {
  const details = [];
  const received = state.lastReceivedItems || [];
  const receivedTitles = received.map(
    (item) =>
      `${E.backpack} **${item.name} [${rarityLabel(item.rarity)}] · Lv.${item.level}**`,
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
  const lines = (state.lastLog || "Run bắt đầu.").split("\n").filter((line) => {
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
  if (factor < 1)
    lines.push("**" + percent(1 - factor) + " xu** (event/nguyền)");
  if (state.payoutSpent > 0)
    lines.push("**" + money(state.payoutSpent) + " " + E.coin + "** đã chi");
  return lines.length ? "\nĐã trừ: " + lines.join(STAT_SEPARATOR) : "";
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
    .addFields({
      name: `${c.emoji} ${c.name}`,
      value: (state.phase === "encounter" && state.encounter.type === "combat"
        ? battleStats(state)
        : statLine(state, false, state.phase !== "upgrade")
      ).slice(0, 1024),
    });
  const protections = [
    ...(state.prayerBoost
      ? ["🙏 Cầu nguyện RNGesus **60%** trong toàn run"]
      : []),
    ...(state.reviveTickets ? ["🎟️ **1** vé hồi sinh · 50% HP"] : []),
    ...(state.adventurerRescue
      ? [
          `🤝 Lost Adventurer bảo hộ một lần đến tầng **${state.adventurerRescue.until}** · ưu tiên trước vé`,
        ]
      : []),
  ];
  if (protections.length)
    e.addFields({ name: "Vé & bảo hộ", value: protections.join("\n") });
  addTextFields(
    e,
    state.encounter.type === "combat" ? `${E.attack} Đối thủ` : "⚠️ Tình huống",
    encounterSummary(state),
  );
  e.addFields({
    name: `${icon("moneybag", "💰")} Rút thưởng`,
    value: result
      ? `Đã nhận **${money(result.payout)} ${icon("coin", "🪙")}** ${STAT_SEPARATOR} **${money(result.diamonds || 0)} ${icon("gem", "💎")}**`
      : (state.cleared
          ? `Thực nhận: **${money(core.payout(state))} ${E.coin}**${STAT_SEPARATOR}**${money(runDiamondReward(state))} ${icon("gem", "💎")}**`
          : "Chưa thể rút") + coinPayoutDetails(state),
    inline: false,
  });
  addTextFields(e, `${icon("scroll", "📜")} Lượt vừa rồi`, turnText(state));
  if (result) {
    const won = ["cashout", "summit"].includes(result.reason);
    e.addFields({
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
    });
    if ((won ? result.diamonds : result.diamondsLost) > 0)
      e.addFields({
        name: `${icon("gem", "💎")} Kim cương Sinh tồn`,
        value: won
          ? `Đã cộng **${money(result.diamonds || 0)}** kim cương vào tài khoản.`
          : `Mất **${money(result.diamondsLost || 0)}** kim cương tạm giữ.`,
      });
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
    text: `${sessionId ? `Mã ván: ${sessionId} • ` : ""}Lượt ${state.turn} • Cược ${money(state.stake)} xu`,
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
    open: ["event_chest", "📦"],
    inspect: ["mag", "🔍"],
    sell: ["moneybag", "💰"],
    leave: ["walking", "🚶"],
    skip: ["walking", "🚶"],
    event_skip: ["walking", "🚶"],
    touch: ["event_shrine", "🗿"],
    next: ["arrow_right", "➡️"],
    fight: ["PHYS", "⚔️"],
    flee: ["runner", "🏃"],
    bribe: ["moneybag", "💰"],
    pray: ["pray", "🙏"],
    ticket: ["ticket_rngesus", "🎫"],
    event_smith: ["hammer", "🔨"],
    event_cleanse: ["sparkles", "✨"],
    event_heal: ["HP", "❤️"],
  };
  let symbol = id.startsWith("replay:") ? ["repeat", "🔁"] : symbols[action];
  if (action.startsWith("view_"))
    symbol = {
      stats: ["bar_chart", "📊"],
      items: ["backpack", "🎒"],
      effects: ["rift", "🌀"],
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
        potion: `${state.potions}`,
        open: "Mở hòm",
        inspect: "Kiểm tra",
        sell: "Bán hòm",
        leave: "Tránh Mimic",
      }[a.action] ||
        (state.encounter.kind === "merchant" && a.action.startsWith("buy_")
          ? `${merchantOffer(state.encounter.offers[Number(a.action.slice(4))]).button} · ${money(state.encounter.offers[Number(a.action.slice(4))].price)} xu`
          : a.label),
      a.action === "fight"
        ? ButtonStyle.Danger
        : ["attack", "open", "next", "flee"].includes(a.action)
          ? ButtonStyle.Primary
          : ["skill", "bribe", "ticket"].includes(a.action)
            ? ButtonStyle.Success
            : ButtonStyle.Secondary,
      a.disabled,
      a.action.startsWith("paradox_") && state.encounter.version === 2
        ? paradoxIcon(a.action.slice(8))
        : a.action.startsWith("chest_") &&
            state.encounter.kind === "treasure_room"
          ? treasureChestIcon(a.action.slice(6))
          : a.action.startsWith("boss_")
            ? eventIcon("boss_chest")
            : a.action === "skill"
              ? SKILL_ICONS[state.classKey]
              : a.action.startsWith("forge_")
                ? E[
                    a.action === "forge_main"
                      ? stats.mainStat(state)
                      : a.action === "forge_guard"
                        ? state.encounter.forgeStat || "str"
                        : a.action === "forge_vit"
                          ? "vit"
                          : "ticket"
                  ]
                : state.encounter.kind === "merchant" &&
                    a.action.startsWith("buy_")
                  ? merchantOffer(
                      state.encounter.offers[Number(a.action.slice(4))],
                    ).icon
                  : /^(event_|buy_|forge_|contract_|door_|duel_|hand_)/.test(
                        a.action,
                      )
                    ? eventIcon(state.encounter.kind || state.encounter.type)
                    : null,
    ),
  );
  if (state.encounter.type !== "rngesus" && state.phase !== "boss_chest")
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
function riftStatBonus(key, count) {
  const stacks = world.effectiveStacks(count);
  const stat = (label, value) => `${highlightStat(label)} **${value}**`;
  const amount = (n) => (Math.round(n * 1000) / 1000).toLocaleString("vi-VN");
  return {
    stone_skin: stat(`${E.defense} DEF`, `+${amount(stacks * 8)}%`),
    elemental_dominion: `${stat(`${E.attack} DMG`, `+${amount(stacks * 3)}%`)}; ${E.magic} **Tỷ lệ đòn phép** **+${amount(stacks * 3)} điểm phần trăm** (quái đánh hỗn hợp)`,
    bloodlust: stat(`${E.attack} DMG`, `+${amount(stacks * 6)}%`),
    fortified: stat(`${E.hp} Max HP`, `+${amount(stacks * 8)}%`),
    swift_horror: `${stat(`${E.accuracy} ACC`, `+${amount(stacks * 3)}`)}${STAT_SEPARATOR}${stat(`${E.evasion} EVA`, `+${amount(stacks * 1.5)}`)}`,
    cursed_ground: stat(
      `${E.res} RES`,
      `−${amount(stacks * 3)} điểm phần trăm`,
    ),
  }[key];
}
function riftModifierText(key, count, state) {
  const bonus = riftStatBonus(key, count);
  const icons = {
    "Max HP": E.hp,
    HP: E.hp,
    MP: E.mana,
    DMG: E.attack,
    DEF: E.defense,
    ACC: E.accuracy,
    EVA: E.evasion,
    RES: E.res,
  };
  const text = world.RIFT_MODIFIERS[key].text.replace(
    /\b(Max HP|HP|MP|DMG|DEF|ACC|EVA|RES)\b/g,
    (label) => highlightStat(`${icons[label]} ${label}`),
  );
  if (key === "soul_drain") {
    const charges = Math.min(3, Math.ceil(count / 4));
    const remaining =
      state.phase === "encounter" &&
      state.encounter.type === "combat" &&
      Number.isInteger(state.encounter.drainCharges)
        ? ` Trận hiện tại: còn **${state.encounter.drainCharges} lần hút**.`
        : "";
    return `Hiện tại: **${charges} lần hút mỗi trận**.${remaining}\n${text}`;
  }
  return `${bonus ? `Mức tăng/giảm hiện tại: ${bonus}.\n` : ""}${text}`;
}
function contractEffectText(state) {
  const c = state.contract;
  if (!c) return `${eventIcon("contract")} Rift Contract: không`;
  const action = {
    potion: `${E.potion} bình máu`,
    skill: `${SKILL_ICONS[state.classKey]} skill`,
    defend: `${E.defense} phòng thủ`,
  }[c.kind];
  const main = stats.mainStat(state);
  const reward =
    c.kind === "potion"
      ? `1 trang bị SSR${c.item?.name ? " · " + c.item.name : ""}`
      : c.kind === "skill"
        ? `bonus bằng 50% cược (${money(Math.floor(state.stake * 0.5))} ${E.coin})`
        : `+10 ${E[main]} ${main.toUpperCase()} cho bạn`;
  const range =
    Number.isFinite(c.from) && Number.isFinite(c.until)
      ? ` (${c.from}–${c.until})`
      : "";
  return `${eventIcon("contract")} **Rift Contract** · còn **${c.remaining} tầng**${range}\n**Điều kiện:** không dùng ${action}.\n**Thưởng khi hoàn thành:** ${reward}. Vi phạm hủy thưởng.`;
}

function classShrineActive(state) {
  return Boolean(
    state.classShrine &&
    state.floor >= state.classShrine.from &&
    state.floor <= state.classShrine.until &&
    !state.classShrine.consumed,
  );
}
function paradoxEffectText(state) {
  if (paradox.active(state)) return paradox.describe(state);
  const p = state.paradox;
  if (!p || state.floor < p.from || state.floor > p.until)
    return `${eventIcon("paradox")} Rift Paradox: không`;
  return `${eventIcon("paradox")} **Rift Paradox** · ${p.kind === "blood" ? `Máu là tiền · hệ số thưởng xu ${p.bloodFactor >= 0 ? "+" : ""}${percent(p.bloodFactor)}. Hồi HP tại checkpoint không giảm hệ số.` : "Ngược đời · vật lý lấy DEF, DEF lấy trung bình vật lý gốc."} · hết tầng ${p.until}`;
}
function riftStatSummary(state) {
  const lines = [];
  for (const [key, count] of Object.entries(state.modifiers || {})) {
    if (count <= 0) continue;
    const bonus = riftStatBonus(key, count);
    if (bonus)
      lines.push(
        `${RIFT_ICONS[key] || E.rift} **${world.RIFT_MODIFIERS[key].name} ×${count}** · **${key === "cursed_ground" ? "Bạn" : "Quái"}:** ${bonus}${key === "bloodlust" ? " khi quái còn dưới 50% HP" : ""}.`,
      );
    if (key === "soul_drain") {
      const charges = Math.min(3, Math.ceil(count / 4));
      const remaining =
        state.phase === "encounter" &&
        state.encounter.type === "combat" &&
        Number.isInteger(state.encounter.drainCharges)
          ? ` · quái còn ${state.encounter.drainCharges} lần hút trong trận này`
          : "";
      lines.push(
        `${RIFT_ICONS[key]} **Soul Drain ×${count}** · **Bạn:** ${E.mana} MP −1 mỗi phản công trúng; ${charges} lần/trận${remaining}.`,
      );
    }
  }
  const p = paradox.active(state);
  if (p) {
    const effects = [];
    const outgoing = paradox.outgoing(state),
      incoming = paradox.incoming(state, false);
    if (outgoing !== 1)
      effects.push(
        `${E.attack} DMG gây ra ×${outgoing.toLocaleString("vi-VN")}`,
      );
    if (incoming !== 1)
      effects.push(
        `${E.attack} DMG vật lý nhận ×${incoming.toLocaleString("vi-VN")}`,
      );
    if (["inverted_armor", "inverted_magic"].includes(p.id))
      effects.push(
        `${E.res} RES khi nhận phép: ${state.resistance}% → **${core.effectiveResistance(state)}%** (đã tính Rift/Class Shrine)`,
      );
    if (paradox.hpCost(state))
      effects.push(`Skill trừ ${E.hp} **${paradox.hpCost(state)} HP**`);
    if (p.id === "mana_fracture" || p.id === "unstable_soul") {
      const locked =
        p.id !== "unstable_soul" || Number.isInteger(p.lockedSkillCost);
      effects.push(
        locked
          ? `Skill tốn ${E.mana} **${core.skillManaCost(state)} MP**`
          : `Chi phí ${E.mana} MP của Skill được chốt theo lượt`,
      );
      if (p.id === "mana_fracture")
        effects.push(`Tấn công hồi ${E.mana} **0 MP**; Phòng thủ hồi **1 MP**`);
    }
    if (p.id === "hunger") {
      effects.push(
        `Bình hồi ${percent(state.potionRate)} → **${percent(paradox.potionRate(state))} Max HP**`,
      );
      effects.push(
        `Hạ quái hồi ${E.hp} **${Math.max(1, Math.floor(state.maxHp * 0.12))} HP** cho bạn`,
      );
    }
    if (p.id === "blood_mirror")
      effects.push(
        paradox.potionLocked(state)
          ? "Đang khóa bình máu"
          : "Được dùng bình máu",
      );
    if (p.id === "time_debt")
      effects.push(
        `Quái còn sống phản công **2 lần** ở hành động thứ 3 của bạn trong trận`,
      );
    lines.push(
      `${paradoxIcon(p.id)} **${paradox.CATALOG[p.id].name} · Bạn:** ${effects.join(STAT_SEPARATOR) || "Không có bonus DMG ở lượt hiện tại."}`,
    );
  } else if (
    state.paradox?.kind === "inverse" &&
    state.floor >= state.paradox.from &&
    state.floor <= state.paradox.until
  )
    lines.push(
      `${eventIcon("paradox")} **Ngược đời · Bạn:** ${E.attack} Vật lý ${state.damageMin}–${state.damageMax} → **${core.physicalRange(state).join("–")}**; ${E.defense} DEF ${state.defense} → **${(state.damageMin + state.damageMax) / 2}**.`,
    );
  return lines.join("\n") || "Không có ảnh hưởng chỉ số từ Rift/Paradox.";
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
      `SINH TỒN v${state.releaseVersion} · ${{ stats: "CHỈ SỐ", items: "TÚI ĐỒ", effects: "RIFT & HIỆU ỨNG", encounter: "CHI TIẾT" }[tab] || "CHI TIẾT"}`,
    )
    .setDescription(
      `${stats.CLASSES[state.classKey].emoji} ${stats.CLASSES[state.classKey].name} · Tầng ${state.floor}`,
    );
  if (tab === "items") {
    e.addFields({
      name: "Vật tư & vé",
      value: `${E.potion} Bình máu: **${state.potions}**${STAT_SEPARATOR}${E.ticket} Vé thoát hiểm: **${state.escapeTokens}**\n🎟️ Vé hồi sinh: **${state.reviveTickets || 0}**`,
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
      e.addFields({ name: `${E.backpack} Trang bị`, value: "Chưa có." });
  } else if (tab === "stats") {
    addTextFields(
      e,
      "Chỉ số nhân vật",
      statLine(state, false, false, {
        includeSupplies: false,
        effective: true,
      }),
    );
    addTextFields(
      e,
      `${E.backpack} Tổng hợp trang bị (${state.items.length})`,
      equipmentSummary(state),
    );
    addTextFields(
      e,
      `${E.rift} Ảnh hưởng Rift/Paradox đến chỉ số`,
      riftStatSummary(state),
    );
    if (classShrineActive(state))
      addTextFields(
        e,
        `${E.shrine} Class Shrine · Bạn`,
        `${SHRINES[state.classKey]} Hết tầng ${state.classShrine.until}.`,
      );
    addTextFields(
      e,
      "Cầu nguyện & bảo hộ",
      `🙏 Cầu nguyện RNGesus: **${percent(core.rngesusPrayerChance(state))}**${state.adventurerRescue ? `\n🤝 Lost Adventurer bảo hộ một lần đến tầng ${state.adventurerRescue.until}; dùng trước vé hồi sinh.` : ""}`,
    );
    e.addFields(
      {
        name: "Bốn thuộc tính",
        value:
          "STR: vật lý và DEF. DEX: trúng/né/Crit; damage chính Amazon/Assassin. VIT: Max HP và bình máu. ENE: phép/RES/Max MP. ENE là thuộc tính; MP là tài nguyên dùng skill.",
      },
      {
        name: `${SKILL_ICONS[state.classKey]} ${stats.CLASSES[state.classKey].skill}`,
        value: SKILLS[state.classKey],
      },
      {
        name: `${E.attack} Tấn công`,
        value: `Một đòn vật lý, có thể trượt/Crit ×1,75. Hồi **${core.attackManaGain(state)} MP** (tối đa Max MP), kể cả đánh trượt. Quái còn sống sẽ phản công.`,
      },
      {
        name: `${E.defense} Phòng thủ`,
        value:
          "Không gây sát thương, hồi **1 MP**. Lần phản công này: DEF ×2 khi nhận vật lý, +15 RES khi nhận phép, giảm thêm 15% sát thương, miễn Crit. Hết hiệu lực sau phản công.",
      },
      {
        name: "Sở trường class",
        value: `Sức mạnh ×${balance.power(state)}. Áp dụng vào sức mạnh vật lý và phép từ thuộc tính/trang bị; dải sát thương đang hiển thị đã tính hệ số. HP, DEF, RES và chi phí MP giữ theo thuộc tính.`,
      },
    );
  } else if (tab === "effects") {
    for (const [key, n] of Object.entries(state.modifiers).filter(
      ([, n]) => n > 0,
    ))
      e.addFields({
        name: `${RIFT_ICONS[key] || E.rift} ${world.RIFT_MODIFIERS[key].name} ×${n}`,
        value: riftModifierText(key, n, state),
      });
    if (!Object.values(state.modifiers).some((count) => count > 0))
      e.addFields({
        name: `${E.rift} Rift modifier`,
        value: "Chưa có Rift modifier.",
      });
    addTextFields(e, "Rift Paradox", paradoxEffectText(state));
    addTextFields(e, "Rift Contract", contractEffectText(state));
  } else {
    const detail = hasEncounterDetails(state)
      ? encounterDetails(state)
      : "Không có thông tin bổ sung; xem bảng chơi chính.";
    const description = `${e.data.description}\n\n${detail}`;
    if (description.length <= 4096) e.setDescription(description);
    else addTextFields(e, "Chi tiết tình huống", detail);
    if (state.phase === "upgrade")
      for (const key of stats.ATTRIBUTES)
        addTextFields(
          e,
          `${E[key]} +5 ${key.toUpperCase()}`,
          checkpointPreview(state, key),
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
      "Ưu tiên STR cho sát thương và DEF; thêm VIT để tăng HP. Chọn trang bị vật lý và chống chịu, dùng Iron Will khi đủ MP.",
    assassin:
      "Ưu tiên DEX cho sát thương, né và Crit; thêm VIT để tránh chết nhanh. Luân phiên đánh thường lấy MP và Shadow Step để né phản công.",
    sorceress:
      "Ưu tiên ENE cho skill phép, RES và Max MP; thêm VIT cho HP. Chọn trang bị phép, đánh thường hồi MP rồi dùng Arcane Burst.",
    druid:
      "Ưu tiên STR cho sát thương vật lý; thêm VIT cho HP và lượng hồi từ skill. Chọn trang bị vật lý/chống chịu, dùng Wild Regeneration khi đã mất HP.",
    necromancer:
      "Ưu tiên ENE cho skill phép, RES và Max MP; thêm VIT cho HP. Đánh thường hồi MP, dùng Totem Ward để vừa gây phép vừa chặn phản công.",
    paladin:
      "Ưu tiên STR cho sát thương và DEF; thêm VIT cho HP. Chọn trang bị vật lý/chống chịu, dùng Divine Shield để gây sát thương rồi thủ.",
  };
  const manaGain = core.attackManaGain(state);
  return {
    name: `${c.emoji} ${c.name}`,
    skillIcon: SKILL_ICONS[classKey],
    role: `Build ${main}${STAT_SEPARATOR}${{ amazon: "Hai phát vật lý", barbarian: "Vật lý và chống chịu", assassin: "Crit và né phản công", sorceress: "Skill phép mạnh", druid: "Vật lý và hồi phục", necromancer: "Phép và chặn phản công", paladin: "Vật lý và phòng thủ" }[classKey]}`,
    attributes: `${E.str} **STR** **${state.str}**${STAT_SEPARATOR}${E.dex} **DEX** **${state.dex}**${STAT_SEPARATOR}${E.vit} **VIT** **${state.vit}**${STAT_SEPARATOR}${E.ene} **ENE** **${state.ene}**`,
    stats: `${E.str} **STR** **${state.str}**${STAT_SEPARATOR}${E.dex} **DEX** **${state.dex}**${STAT_SEPARATOR}${E.vit} **VIT** **${state.vit}**${STAT_SEPARATOR}${E.ene} **ENE** **${state.ene}**\n${E.hp} **HP** **${state.hp}**${STAT_SEPARATOR}${E.mana} **MP** **${state.mana}**${STAT_SEPARATOR}${E.defense} **DEF** **${state.defense}**${STAT_SEPARATOR}${E.potion} **Bình** **${state.potions}**\n${E.attack} **Vật lý** **${state.damageMin}–${state.damageMax}**${STAT_SEPARATOR}${E.magic} **Phép** **${state.spellMin}–${state.spellMax}**${STAT_SEPARATOR}${E.res} **RES** **${state.resistance}%**${STAT_SEPARATOR}${E.crit} **CRIT** **${percent(state.critChance)}**`,
    build: builds[classKey],
    attack: `Một đòn **vật lý ${state.damageMin}–${state.damageMax}** trước giảm trừ; có thể trượt, có thể Crit ×1,75. Hồi **${manaGain} MP** ở chỉ số ban đầu (40% Max MP; class phép 70%, làm tròn xuống, tối thiểu 1). Quái còn sống sẽ phản công.`,
    defend:
      "Không gây sát thương; hồi **1 MP**. Trong lần phản công này: **DEF ×2** khi nhận vật lý, **+15 RES** khi nhận phép, giảm thêm **15% sát thương** và miễn Crit. Không duy trì sang lượt sau.",
    skill: `${SKILLS[classKey]} Tốn **2 MP**, không hồi MP như đánh thường. ${["sorceress", "necromancer"].includes(classKey) ? "Sát thương phép chịu RES của quái, không Crit." : "Mỗi đòn vật lý có thể trượt/Crit, chịu DEF của quái."} ${["assassin", "necromancer"].includes(classKey) ? "Chặn phản công của lượt này kể cả skill không gây sát thương." : classKey === "paladin" ? "Nếu quái sống, nhận phản công với hiệu quả Phòng thủ; skill không cộng 1 MP." : "Nếu quái sống, nhận phản công bình thường."}`,
    passive: `Đặc tính thường trực: vật lý lấy **${Math.round(c.strWeight * 100)}% STR + ${Math.round((1 - c.strWeight) * 100)}% DEX**; Crit nền **${percent(c.baseCrit)}**, RES nền **${c.baseRes}%**, cộng thêm từ thuộc tính/trang bị. Hiệu ứng né/chặn/hồi HP của skill chỉ kích hoạt khi dùng skill.`,
    shrine: `Chỉ có khi nhận **Class Shrine**, tối đa 3 tầng: ${SHRINES[classKey]}`,
    power: balance.power(state),
  };
}
function ratesFields(category) {
  const fields = {
    combat: [
      {
        name: `${E.attack} Tấn công và sát thương`,
        value:
          "- Đánh thường gây **vật lý**: có thể trượt (0 DMG) hoặc Crit ×1,75; DEF của quái giảm sát thương.\n- Sát thương **phép luôn trúng, không Crit**; chịu giảm trừ từ RES.\n- Dải DMG trên bảng giao tranh đã tính phòng thủ của quái hiện tại, chưa tính Crit và giả định đòn vật lý trúng. Chỉ số đầy đủ hiển thị sức mạnh trước giảm trừ.\n- Đánh thường hồi MP ngay cả khi trượt: Sorceress/Necromancer hồi 70% Max MP, class khác 40%; làm tròn xuống, ít nhất 1, không vượt Max MP.\n- Quái còn sống sẽ phản công sau hành động, trừ khi skill chặn/né đòn đó.",
      },
      {
        name: `${E.defense} Phòng thủ và ${E.potion} bình máu`,
        value:
          "- **Phòng thủ:** không gây DMG; hồi 1 MP. Trong lần phản công này, DEF ×2 khi nhận vật lý hoặc +15 RES khi nhận phép; giảm thêm 15% DMG và miễn Crit. Hết lượt thì hết hiệu lực.\n- **Bình máu:** tiêu thụ 1 bình để hồi HP theo tỷ lệ ghi trên bảng, ít nhất 20 HP, không vượt Max HP. Hiệu lực tăng theo VIT/trang bị, giới hạn 10–75% Max HP. Quái còn sống vẫn phản công. Không dùng bình khi HP đã đầy.",
      },
      {
        name: "Kỹ năng vật lý · 2 MP mỗi lần dùng",
        value:
          ["amazon", "barbarian", "assassin", "druid", "paladin"]
            .map(
              (key) =>
                `${SKILL_ICONS[key]} **${stats.CLASSES[key].name} — ${stats.CLASSES[key].skill}:** ${SKILLS[key]}`,
            )
            .join("\n") +
          "\nMỗi phát tính trúng/Crit riêng, chịu DEF của quái. Skill không hồi MP như đánh thường; các hệ số áp dụng trước phòng thủ của quái.",
      },
      {
        name: "Kỹ năng phép · 2 MP mỗi lần dùng",
        value:
          ["sorceress", "necromancer"]
            .map(
              (key) =>
                `${SKILL_ICONS[key]} **${stats.CLASSES[key].name} — ${stats.CLASSES[key].skill}:** ${SKILLS[key]}`,
            )
            .join("\n") +
          "\nSkill không hồi MP như đánh thường. Class Shrine của Sorceress cho một lần dùng miễn phí. Quái có cơ chế miễn sát thương vẫn có thể nhận 0 DMG dù phép luôn trúng.",
      },
      {
        name: `${eventIcon("boss")} Cơ chế boss`,
        value:
          "- **The Butcher:** mỗi lần ra đòn tăng 8% DMG, tối đa 5 stack.\n- **Ascendant Riftwalker:** miễn sát thương ở lượt đầu của mỗi chu kỳ 3 lượt giao tranh.\n- **Assur:** EVA và Crit cao.\n- **Lucion:** hồi HP bằng 35% sát thương thực sự gây ra.\n- **Deimoss:** Abyssal Spires giảm 25% sát thương nhận; tầng 999 là phiên bản boss cuối.\nNút **Chi tiết** cho biết cơ chế và trạng thái của boss đang gặp.",
      },
      {
        name: `${E.checkpoint} Checkpoint và ${E.rift} Rift`,
        value:
          "- Sau mỗi **5 tầng:** hồi đầy HP, +2 bình (tối đa 5), chọn **+5 STR/DEX/VIT/ENE**. Bảng hiển thị chỉ số hiện tại và dự báo từng lựa chọn.\n- Sau mỗi **10 tầng:** thêm 1 stack Rift; nhận đủ 8 loại trước khi lặp. Icon ×N là số stack của từng loại; nút Rift giải thích hiệu ứng.\n- Sau mỗi **25 tầng:** chọn Paradox có hiệu lực 5 tầng. Paradox v2 chọn đều một trong **4 cặp cố định**, hiệu lực từ tầng mốc +1 đến hết +5, sau nâng thuộc tính. Không đổi payout hoặc stat gốc; mở UI không roll lại.\n- Sau tầng **199/399/699/899:** xóa toàn bộ stack một Rift có hại, trừ Unstable Rift.",
      },
    ],
    loot: [
      {
        name: `${E.chest} Hòm thường: mở, kiểm tra hoặc bán`,
        value:
          "- **Kiểm tra:** thử phát hiện Mimic một lần; tỷ lệ tăng theo Luck/trang bị. Phát hiện được mới có nút tránh Mimic. Kiểm tra không đổi nội dung hòm.\n- **Mở:** có thể nhận đồ, gặp hòm rỗng/giả hoặc phải đánh Mimic. Tỷ lệ cơ bản: Ancient Mimic 3%, Mimic thường 12%.\n- **Nếu không phải Mimic:** SSR 10%, UR 3%, SR 22%, R 40%, rỗng 20%, giả 5%. Đây là tỷ lệ trong nhánh an toàn, không phải tỷ lệ tổng của mọi hòm. Luck/Rift/trang bị/pity có thể đổi tỷ lệ; xem **Chi tiết** để biết tỷ lệ của hòm hiện tại.\n- **Bán:** cộng bonus bằng 15% cược, không mở hòm. Kho báu có bảng tỷ lệ riêng.",
      },
      {
        name: `${E.backpack} Trang bị và bảo hiểm hòm`,
        value:
          "- Catalog có **100 món:** R 32, SR 28, SSR 24, UR 16. Đồ chỉ tồn tại trong run; trùng tên tăng level và cộng hiệu ứng. **UR có cả buff và lời nguyền**. Lời nguyền rút HP cuối tầng luôn chừa ít nhất **1 HP**.\n- Sau **5 hòm đã mở không nhận SR trở lên**, hòm kế bảo đảm SR+ và không có Mimic.\n- Sau **10 hòm không nhận SSR**, tỷ lệ SSR được cộng 2 điểm % mỗi lần tiếp theo; nhận SSR thì đặt lại bộ đếm. Luck cũng tăng tỷ lệ SSR, tổng tối đa 35% ở hòm thường.\n- Mốc 10 là lúc bắt đầu tăng xác suất, không phải bảo đảm SSR. Đồ từ Ancient Mimic/Blood Mimic, rương boss, shop hoặc event khác không đặt lại bộ đếm hòm thường/kho báu; rương thường mua ở Rift Merchant vẫn tính.",
      },
      {
        name: `${E.hp} Lời nguyền rút HP`,
        value:
          "Trang bị có lời nguyền rút HP áp dụng **sau khi vượt tầng**, dựa trên Max HP và số level chưa giải nguyền. Tổng lượng rút luôn chừa ít nhất **1 HP**; đang có 1 HP thì không mất thêm.\nĐiều này chỉ bảo vệ trước hiệu ứng rút HP của trang bị và Shrine Fake. Quái hoặc các event có nhánh tử trận vẫn có thể giết bạn. Giải nguyền hoặc chuyển hóa level bị nguyền có thể gỡ hiệu ứng theo công dụng dịch vụ.",
      },
      {
        name: `${E.chest} Phần thưởng Ancient Mimic`,
        value:
          "Ancient Mimic là **quái Tinh anh**, hưởng bonus sát thương lên Tinh anh. Hạ quái nhận ngay **1 trang bị**: **50% SR · 30% SSR · 20% UR**. UR kèm lời nguyền; đồ trùng tăng level. Trang bị được cộng ngay trong run và hiển thị ở **Lượt vừa rồi**. Tỷ lệ cố định, không chịu Luck/pity; phần thưởng này không làm thay đổi bộ đếm bảo hiểm hòm. Mimic thường không có phần thưởng này.",
      },
      {
        name: `${E.chest} Phần thưởng Blood Mimic`,
        value:
          "Blood Mimic từ event Blood Fountain là **quái Tinh anh**, hưởng bonus sát thương lên Tinh anh. Hạ quái nhận ngay **1 trang bị**: **60% SR · 40% SSR**. Đồ trùng tăng level và áp dụng hiệu ứng ngay trong run. Tỷ lệ cố định, không chịu Luck/pity và không làm đổi bộ đếm bảo hiểm hòm. Vẫn nhận bonus xu khi vượt tầng; Mimic thường từ hòm không có phần thưởng trang bị này.",
      },
      {
        name: `${eventIcon("boss_chest")} Rương boss cuối khu vực`,
        value:
          "- Hạ boss tầng **100/200/300/400/500/700/900**: lập tức nhận một rương boss bắt buộc xử lý. Boss 50 tầng khác và boss 999 không cho rương này.\n- **Mở:** 70% nhận SSR, 30% nhận UR có lời nguyền. Tỷ lệ cố định, không chịu Luck hoặc pity. Đồ trùng tăng level.\n- **Bán:** cộng bonus bằng **50% payout gốc hiện tại**; số xu cụ thể ghi trên bảng.\n- Không được bỏ qua hoặc rút thưởng khi rương chưa xử lý. Mở/bán không tính thêm một tầng.",
      },
    ],
    encounters: [
      {
        name: "Các tình huống có thể gặp",
        value:
          "- Pool thường: quái thường 53%, Elite 12%, hòm 10%, Shrine 8%, kho báu 5%, bẫy 6%, sự kiện đặc biệt 4%, phòng trống 2%. Đây là tỷ lệ gốc; điều kiện tầng/Rift có thể thay đổi lựa chọn hợp lệ.\n- Boss mỗi 50 tầng và boss cuối 999 được ưu tiên; tiếp theo là RNGesus, Tower Remembers và Grave Echo trước khi chọn pool thường. Sự kiện đặc biệt cách nhau ít nhất 2 tầng.\n- Mỗi event ghi tên, lựa chọn, tỷ lệ và hậu quả trên bảng; kết quả thực tế nằm ở **Lượt vừa rồi**. Event trả tiền hoặc thu thuế không xuất hiện ở tầng 1.",
      },
      {
        name: `${E.shrine} Shrine · chọn Chạm hoặc Bỏ qua`,
        value: `**6 loại có tỷ lệ bằng nhau (mỗi loại ≈16,7%)**; kết quả được giữ cố định khi mở lại bảng.\n- **Healing:** hồi đầy ${E.hp} HP.\n- **Armor:** +5 vào một thuộc tính ${E.str} STR / ${E.dex} DEX / ${E.vit} VIT / ${E.ene} ENE; trong nhánh Armor, mỗi chỉ số 25%.\n- **Blood:** +8 thuộc tính sát thương phù hợp class, −5 ${E.vit} VIT.\n- **Corrupted:** +12 thuộc tính sát thương phù hợp class, −8 ${E.vit} VIT.\n- **Experience:** bonus bằng 25% tiền cược.\n- **Fake:** rút 30% Max ${E.hp} HP, mức bẫy tối thiểu 10; chỉ trừ đến khi còn **1 HP**.\n**Bỏ qua** giữ nguyên chỉ số và đi tiếp.`,
      },
      {
        name: `${E.shrine} Thuộc tính nhận từ Blood / Corrupted`,
        value: `${E.dex} **DEX:** Amazon, Assassin.\n${E.ene} **ENE:** Sorceress, Necromancer.\n${E.str} **STR:** Barbarian, Druid, Paladin.\nMức tăng vẫn là +8 / +12 theo loại Shrine; cả hai đều giảm ${E.vit} VIT.`,
      },
      {
        name: `${E.luck} Bẫy và Lucky Break`,
        value: `- **Thu thuế:** giảm payout 15%. **Trộm bình:** lấy 1 ${E.potion} bình nếu còn. Lucky Break có thể tránh hai hậu quả này: mỗi Luck cho 1,5 điểm %, tối đa 30%.\n- **Wrong Portal:** 50% tốt / 50% xấu, không chịu Luck. Nhánh xấu gọi Elite đánh phủ đầu; phải hạ Elite mới vượt tầng.\n- Phòng trống cho phép đi tiếp hoặc rút thưởng.`,
      },
      {
        name: "Các sự kiện đặc biệt",
        value:
          "Healer · Treasure Goblin · Blacksmith · Purifier · Sacrificial Altar · Cursed Gambler · Lost Adventurer · Fountain · Horadric Forge · Rift Merchant · Mirror · Treasure Room · Contract · Class Shrine · Strange Doors · Duelist · Payout Shop · Blood Shop · Diamond Shop.\n\nChỉ những event đủ điều kiện mới được chọn. Các lựa chọn có thể đổi HP, thuộc tính, trang bị, payout hoặc tạo hiệu ứng tạm thời. Không phải event nào cũng miễn phí hoặc an toàn; đọc giá, tỷ lệ và điều kiện trên bảng trước khi xác nhận.",
      },
      {
        name: `${eventIcon("treasure_room")} Treasure Room`,
        value: `Chọn mở **một** rương, không soi hoặc bỏ qua. Đúng một trong ba rương là Mimic: mỗi màu có **1/3** gặp Mimic, **2/3** nhận thưởng.\n- ${treasureChestIcon("red")} **Đỏ:** ${E.attack} Vật lý +5 • ${E.magic} Phép +5.\n- ${treasureChestIcon("blue")} **Xanh:** ${E.defense} DEF +6 • ${E.res} RES +5%.\n- ${treasureChestIcon("gold")} **Vàng:** bonus +50% cược • ${E.luck} LUCK +1.\nNếu chọn trúng Mimic, phải chiến đấu thay vì nhận thưởng của màu đó.`,
      },
      {
        name: `${eventIcon("memory")} The Tower Remembers`,
        value:
          "- Dòng **The Tower will remember this** nghĩa là hành động vừa rồi tạo một hậu quả hẹn sau **10–30 tầng**, tối đa 8 hậu quả đang chờ.\n- Có thể đến từ bỏ qua event, hiến tế, đập gương, bán hòm, hối lộ hoặc cầu nguyện RNGesus thành công.\n- Khi đến hạn: **50%** hồi 10–20% Max HP và bonus 10–30% cược; **25%** mất 10% payout; **25%** phải đánh Bounty Hunter. Kết quả đã khóa lúc ghi nhận, không đổi khi mở lại bảng. Boss/RNGesus có thể làm hậu quả xuất hiện muộn hơn.\n- Lost Adventurer dùng cơ chế riêng bên dưới.",
      },
      {
        name: `${eventIcon("adventurer")} Lost Adventurer · cứu / cướp`,
        value:
          "- **Cứu:** trả một bình, nhận R 70% / SR 30% và một lần bảo hộ trong cùng khu vực. Chết bởi RNGesus → hồi sinh 50% HP, sang tầng kế; chết khi đánh quái → hồi sinh 50% HP, ở lại đánh tiếp. Ưu tiên trước vé hồi sinh, hết hiệu lực khi dùng hoặc sang khu vực khác; không tạo hậu quả hẹn.\n- **Cướp:** nhận **SSR 75% / UR có nguyền 25%**. Sau **10–30 tầng**: **50% mất 10% payout**, **50% đánh Bounty Hunter (Elite)**. Không có nhánh hồi máu/bonus. Tối đa 8 hậu quả đang chờ; kết quả khóa khi ghi nhận.",
      },
      {
        name: `${eventIcon("echo")} Grave Echo`,
        value:
          "- Từ tầng 101, có 1% cơ hội ở tình huống hợp lệ; tối đa một lần trong mỗi dải 100 tầng, không gặp mộ của chính mình.\n- Có thể cầu nguyện hồi HP, bỏ đi, cướp hoặc khiêu chiến. Cướp có thể đánh thức Echo; khiêu chiến tạo đối thủ mạnh hơn. Đọc tỷ lệ và phần thưởng trên bảng trước khi chọn.",
      },
    ],
    rngesus: [
      {
        name: "📊 Chu kỳ gặp RNGesus",
        value: RNGESUS_CYCLE_RULES,
      },
      {
        name: "🎲 Cách tính Chaos",
        value: rngesusChaosRules(),
      },
      {
        name: `${eventIcon("rngesus")} RNGesus · không được rút thưởng`,
        value:
          "Chaos trên bảng là tỷ lệ gặp RNGesus. RNGesus không thể bị đánh bại.\n- **Đánh:** tử trận ngay; Lost Adventurer hoặc vé hồi sinh có thể cứu nếu còn. Không được cứu thì mất cược/thưởng tạm giữ.\n- **Hối lộ:** cần payout hiển thị **≥1.000 xu**, đúng 1.000 vẫn được. Thoát an toàn, giảm hệ số payout 40%; thưởng tích lũy về sau cũng chịu hệ số đã giảm.\n- **Cầu nguyện:** **30%** thành công và nhận chắc chắn **1 trang bị UR kèm lời nguyền**; **70%** thất bại và tử trận. Mang vé cầu nguyện từ túi Sinh tồn: **60%** thành công, **40%** thất bại, áp dụng toàn run. Lost Adventurer hoặc vé hồi sinh cứu khi tử trận nếu còn.\nHối lộ hoặc cầu nguyện thành công ghi nhận The Tower Remembers.",
      },
      {
        name: `${E.ticket} Bỏ chạy và vé thoát hiểm`,
        value:
          "- Tỷ lệ cho các lần **chọn Bỏ chạy trong cùng run:** **100% → 95% → 90% → 85% → 80% → 75%**, các lần sau giữ 75%. Lần đầu chắc chắn thoát.\n- Mỗi lần chọn chạy giảm 5 điểm % cho lần sau, kể cả chạy thất bại được vé cứu. Chọn hối lộ/cầu nguyện không giảm và không đặt lại tỷ lệ bỏ chạy.\n- **Run mới reset về 100%.** Mở lại UI hoặc restart bot giữ nguyên tỷ lệ của run đang chơi.\n- Chạy thành công không mất vé. Chạy thất bại tự dùng 1 vé thoát hiểm nếu có; hết vé thì tử trận và kiểm tra Lost Adventurer/vé hồi sinh. Giữ tối đa 1 vé thoát hiểm.\n- Vé thoát hiểm chỉ cứu bỏ chạy thất bại. Đánh/cầu nguyện thất bại có thể được Lost Adventurer hoặc vé hồi sinh cứu. Không có nút dùng vé thoát hiểm riêng tại RNGesus.",
      },
    ],
    rewards: [
      {
        name: "Cửa hàng & túi Sinh tồn",
        value:
          "Dùng /sinhton cuahang và /sinhton tuido. Ba vé cố định: chạy RNGesus 100 💎, cầu nguyện ×2 100 💎, hồi sinh 300 💎. Năm trang bị chọn đều từ toàn bộ pool, đổi mỗi ngày lúc 00:00 Việt Nam: R 10.000 / SR 50.000 / SSR 100.000 / UR 200.000 xu. Mua không giới hạn lượt. Trước run chọn tối đa 5 món khác nhau (Lv.1), mỗi loại vé một chiếc; xem chỉ số rồi Bắt đầu. Không hoàn đồ/vé khi chết, rút, bỏ hoặc hết hạn run. Vé hồi sinh tự cứu một lần với 50% HP; ở lại đánh tiếp nếu chết khi đánh quái, sang tầng kế nếu chết bởi RNGesus.",
      },
      {
        name: "Dịch vụ: giá và điều kiện",
        value:
          "- **Rèn:** trả 12% payout gốc, tăng một level gồm buff và curse còn lại. **Giải nguyền:** trả 10% payout gốc, gỡ toàn bộ curse, giữ buff/level và chuyển đồ thành SSR.\n- **Horadric Forge:** tiêu hao 1 level trang bị, giữ nguyên hiệu ứng có lợi của level đó trong run và xóa lời nguyền tương ứng; chọn thêm một phần thưởng. Không nhận lại bình/vé/HP hồi khi nhặt đồ.\n- **Payout Shop:** R/SR/SSR giá 5%/12%/25% payout gốc, tối đa 5 lần gặp/run. **Blood Shop:** SR/SSR/UR giá 12%/25%/40% Max HP, tối đa 3 lần gặp/run; phải còn ít nhất 1 HP.\n- **Diamond Shop:** từ tầng 101, giá SR 100 / SSR 300 / UR 480 kim cương, tối đa 2 lần gặp/run; trừ ngay từ tài khoản, không hoàn khi chết.\n- Mỗi loại shop cách nhau ít nhất 50 tầng; mỗi lần gặp mua tối đa một món. Giá cụ thể và công dụng ghi trên bảng/Chi tiết.",
      },
      {
        name: `${eventIcon("merchant")} Rift Merchant · giá theo payout gốc`,
        value: `Mỗi lần gặp có **3 loại hàng khác nhau**, chọn từ 6 loại; mua tối đa **1 món**. Giá được khóa khi gặp, làm tròn lên, tối thiểu 1 xu.\n- ${E.potion} +1 bình (tối đa 5): **2,5%** payout gốc.\n- ${E.hp} Hồi đầy HP: **4%**.\n- ${E.luck} +1 LUCK trong run: **5%**.\n- ${E.backpack} 1 trang bị SR: **7,5%**.\n- ${E.ticket} Vé thoát hiểm (tối đa 1): **12,5%**.\n- ${E.chest} Rương thường: **7,5%**, **mở ngay khi mua**; tỷ lệ và pity như hòm thường, có thể gặp Mimic hoặc rỗng/giả. Chi tiết liệt kê tỷ lệ của rương đang bán.\nTrả bằng payout của run; bonus Blood Paradox không dùng để mua.`,
      },
      {
        name: `${eventIcon("purifier")} Purifier · giải lời nguyền`,
        value: `Chỉ xuất hiện khi có trang bị còn lời nguyền; không xuất hiện ở tầng 1. Trong nhóm event đặc biệt đủ điều kiện, Purifier có trọng số **gấp ${core.PURIFIER_EVENT_WEIGHT}** mỗi event khác. Đây không phải tỷ lệ cố định trên mỗi tầng.\nBấm **Giải toàn bộ**: trả **${percent(core.PURIFIER_COST_RATE)} payout gốc**, làm tròn lên và tối thiểu 1 xu; gỡ mọi level lời nguyền của món được chỉ định, giữ buff/level và chuyển thành SSR.`,
      },
      {
        name: `${eventIcon("diamond_shop")} Diamond Merchant`,
        value: `Từ tầng **101**; tối đa **2 lần gặp/run**, cách ít nhất 50 tầng. Bỏ qua vẫn tính một lần gặp.\nMỗi lần có **3 món ngẫu nhiên**, độ hiếm của từng món độc lập: **40% SR / 40% SSR / 20% UR**.\nGiá: **SR 100 / SSR 300 / UR 480** ${icon("gem", "💎")}. Mua tối đa **1 món/lần gặp**. Kim cương trừ từ tài khoản ngay khi mua, không hoàn khi chết. UR kèm lời nguyền; đồ chỉ dùng trong run.`,
      },
      {
        name: `${eventIcon("horadric")} Horadric Forge · chuyển hóa trang bị`,
        value: `Không tốn xu. Tiêu hao **1 level** của món chỉ định: level 1 thì món rời trang bị. **Giữ nguyên** hiệu ứng có lợi của level đã dùng trong run, không cộng lại lần nữa; xóa lời nguyền tương ứng. Không nhận lại ${E.potion} bình, ${E.ticket} vé hoặc ${E.hp} HP hồi khi nhặt món đó.\nChọn **một** phần thưởng thêm: +6 thuộc tính sát thương phù hợp class; hoặc +7 STR/VIT đã ghi trên nút; hoặc +4 ${E.vit} VIT. Món SSR/UR còn có lựa chọn nhận 1 ${E.ticket} vé (giữ tối đa 1). Bỏ qua thì giữ trang bị và không nhận phần thưởng.`,
      },
      {
        name: "Rút thưởng và mất thưởng",
        value:
          "- Sau khi vượt ít nhất một tầng, **Rút thưởng** kết thúc run và nhận thưởng theo bảng. Rút trước tầng đầu là bỏ run, mất cược. RNGesus và rương boss chưa xử lý không cho rút.\n- Payout là **tổng thưởng xu**, không phải tiền lãi. Hệ số từ vượt tầng dừng tăng sau 100; bonus từ event vẫn có thể tăng. Giới hạn 10 triệu xu. Các khoản mua đồ/dịch vụ trong run làm giảm payout theo giá đã xác nhận.\n- Chết, bỏ run hoặc hết hạn: mất cược và toàn bộ xu/kim cương tạm giữ. Trang bị trong run cũng không chuyển vào túi Gacha.\n- Run mới dùng v2.0.1; run cũ tiếp tục theo phiên bản đã lưu.",
      },
      {
        name: "Kim cương theo mốc",
        value:
          "**Tổng kim cương tạm giữ**, không cộng dồn từng mốc:\n100 → **100**; 200 → **200**; 300 → **400**; 400 → **800**; 500 → **1.600**; 600 → **3.200**; 700 → **6.400**; 800 → **12.800**; 900 → **25.600**; hạ boss 999 → **51.200**.\nChỉ rút thưởng mới nhận vào tài khoản. Ví dụ vượt tầng 300 rồi rút: nhận 400 kim cương, không phải 100 + 200 + 400.",
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
