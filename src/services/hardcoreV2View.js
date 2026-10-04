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
const { appEmoji } = require("../utils/appEmoji");
const { resultBlock } = require("../utils/rewardText");
const icon = (key, fallback) => appEmoji(key, emoji[`:${key}:`] || fallback);
const { E, SKILL_ICONS, RIFT_ICONS, eventIcon } = require("./hardcoreIcons");
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
  barbarian: `${E.defense} DEF +8 khi ${E.hp} HP ≤30%.`,
  assassin: "Chắc chắn né một phản công.",
  sorceress: "Một skill miễn phí.",
  druid: "Hồi 5% Max HP mỗi tầng trong ba tầng kế tiếp.",
  necromancer: "Chặn một đòn phản công.",
  paladin: `${E.res} RES +10 khi nhận phép.`,
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
    `${E.mana} MP **${s.mana}/${s.maxMana}**${d("mana")}${d("maxMana", " MAX")} · ${E.potion} Bình ${s.potions}${d("potions")} · ${E.ticket} Vé ${s.escapeTokens}${d("escapeTokens")}`,
    `${E.attack} Vật lý **${range[0]}–${range[1]}**${inverse ? " (Paradox)" : d("damageMin")} · ${E.magic} Phép **${s.spellMin}–${s.spellMax}**${d("spellMin")}`,
    `${E.defense} DEF **${defense}**${inverse ? " (Paradox)" : d("defense")} · ${E.res} RES **${s.resistance}%**${d("resistance")} · ${E.luck} LUCK **${s.luck}**${d("luck")}`,
  ];
  if (!compact)
    lines.push(
      `${E.accuracy} ACC **${s.accuracy}**${d("accuracy")} · ${E.evasion} EVA **${s.evasion}**${d("evasion")} · ${E.crit} CRIT **${percent(s.critChance)}**${d("critChance", "%")}\nBình **${percent(s.potionRate)}** Max HP`,
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
    druid: `Vật lý, có thể trượt/Crit; hồi ${money(Math.floor(s.maxHp * 0.12))} HP (tối đa Max HP).`,
    necromancer: "Phép luôn trúng, không Crit; chặn phản công.",
    paladin: "Vật lý, có thể trượt/Crit; tự Phòng thủ.",
  }[s.classKey];
  return `${healthBar(s.hp, s.maxHp)}\n${E.mana} MP **${s.mana}/${s.maxMana}** · ${E.potion} Bình **${s.potions}** · ${E.ticket} Vé **${s.escapeTokens}**\n${E.attack} Tấn công **${attack.low}–${attack.high} DMG** · ${E.defense} DEF **${defense}** · ${E.res} RES **${s.resistance}%**\n${SKILL_ICONS[s.classKey]} **${stats.CLASSES[s.classKey].skill} (${core.skillManaCost(s)} MP): ${skill.low}–${skill.high} DMG**\n${detail}\n*DMG đã tính phòng thủ/kháng của quái hiện tại; vật lý giả định trúng, chưa Crit.*`;
}
function effectText(effects, level = 1) {
  const names = {
    str: `${E.str} STR`,
    dex: `${E.dex} DEX`,
    vit: `${E.vit} VIT`,
    ene: `${E.ene} ENE`,
    luck: `${E.luck} Luck`,
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
    bossDamage: "DMG Boss",
    eliteDamage: "DMG Elite",
    mimicDetection: "Phát hiện Mimic",
    goblinChance: "Bắt Goblin",
    legendaryFind: "Tìm SSR",
    floorHpLoss: `${E.hp} HP mất/tầng`,
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
        if (key === "defenseSet") return `${E.defense} DEF = 0`;
        if (key === "bonusPenalty")
          return `Payout ×${(1 - value).toFixed(2)} mỗi cấp chưa giải`;
        if (key === "potions")
          return `+${value} ${E.potion} bình máu khi nhận mỗi cấp`;
        if (key === "escapeTokens")
          return `+${value} ${E.ticket} vé khi nhận mỗi cấp (giữ tối đa 1)`;
        if (key === "heal") return `Hồi ${value} ${E.hp} HP khi nhận mỗi cấp`;
        const n = value * level;
        return `${n > 0 ? "+" : ""}${percentages.includes(key) ? percent(n) : Math.round(n * 100) / 100} ${names[key] || key}`;
      })
      .join(" · ") || "Không có"
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
function randomEventText(s) {
  const e = s.encounter;
  const heading = (name, intro) =>
    `${eventIcon(["surprise", "trap"].includes(e.type) ? e.kind : e.type)} **${name}:** (${intro})`;
  const option = (name, outcomes) =>
    `**${name}**\n${outcomes.map(([chance, text]) => `- ${chance ? `**${chance}:** ` : ""}${text}`).join("\n")}`;
  const show = (name, intro, options) =>
    [heading(name, intro), ...options].join("\n\n");
  const attr = (key, n) =>
    `${n > 0 ? "+" : ""}${n} ${E[key]} ${key.toUpperCase()}`;
  if (e.type === "chest") {
    const labels = {
      ancient_mimic: "Chiến đấu Ancient Mimic.",
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
        `**Kiểm tra:** ${percent(e.detectionChance)} phát hiện nếu có Mimic; không phát hiện chưa chắc an toàn.\n**Bán:** bonus +15% cược.\n**Pity:** SR+ ${s.pityRare}/5 · SSR ${s.pityLegendary}/10.${e.guaranteed ? " Đảm bảo SR+, không Mimic." : ""}`,
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
            `**Armor:** ${attr("str", 5)} hoặc ${attr("vit", 5)} (50/50).`,
          ],
          [null, `**Blood:** ${attr("str", 8)}, ${attr("vit", -5)}.`],
          [null, "**Experience:** bonus +25% cược."],
          [null, `**Corrupted:** ${attr("str", 12)}, ${attr("vit", -8)}.`],
          [null, `**Fake:** mất 30% Max ${E.hp} HP, tối thiểu 10.`],
        ]),
        "**Bỏ qua:** đi tiếp, không nhận hiệu ứng.",
      ],
    );
  if (e.type === "rngesus")
    return show("RNGesus", "Không thể đánh bại hoặc rút thưởng tại đây.", [
      option("Bỏ chạy", [
        ["75%", "Thoát an toàn."],
        ["25%", `Tự dùng 1 ${E.ticket} vé nếu có; hết vé thì chết.`],
      ]),
      option("Cầu nguyện", [
        ["30%", "Sống và nhận đồ: SSR 85% / UR 15% trong nhánh thành công."],
        ["70%", "Chết."],
      ]),
      "**Hối lộ:** cần payout ≥1.000 xu, mất 40% payout để thoát. **Đánh:** chết.",
    ]);
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
              `${attr("str", 6)}, ${attr("ene", 6)}, +1 ${E.luck} Luck.`,
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
      return show(e.name, "Chọn giúp đỡ hoặc cướp; đồ trùng tên tăng level.", [
        option(`Cứu · trả 1 ${E.potion} bình máu`, [
          ["70%", "Nhận đồ [R]."],
          ["30%", "Nhận đồ [SR]."],
        ]),
        option("Cướp", [
          ["75%", "Nhận đồ [R]."],
          ["25%", "Nhận đồ [UR], kèm curse."],
        ]),
      ]);
    case "fountain":
      return show(e.name, "Uống để hồi phục hoặc gặp Blood Mimic.", [
        option("Uống", [
          ["60%", `Hồi đầy ${E.hp} HP.`],
          ["25%", `+15 ${E.hp} Max HP và hồi 15 ${E.hp} HP.`],
          ["15%", "Chiến đấu Blood Mimic."],
        ]),
      ]);
    case "mirror":
      return show(e.name, "Nhận sức mạnh hoặc phá gương để thử vận may.", [
        `**Sức mạnh:** ${attr(main, 10)}.`,
        `**Phòng thủ:** ${attr("vit", 8)}; +5 ${E.str} STR hoặc ${E.dex} DEX (50/50).`,
        option("Đập gương", [
          ["20%", `+2 ${E.luck} Luck.`],
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
        red: `+5 ${E.attack} Vật lý, +5 ${E.magic} Phép.`,
        blue: `+6 ${E.defense} DEF, +5 ${E.res} RES.`,
        gold: `Bonus +50% cược, +1 ${E.luck} Luck.`,
      };
      return show(
        e.name,
        "Một trong ba hòm là Mimic. Có thể soi đúng một màu trước khi mở.",
        [
          ...Object.entries(reward).map(([color, text]) => {
            const chance = !e.inspected
              ? 1 / 3
              : e.inspected === e.mimicColor
                ? color === e.inspected
                  ? 1
                  : 0
                : color === e.inspected
                  ? 0
                  : 0.5;
            return option(
              `Mở hòm ${{ red: "đỏ", blue: "xanh", gold: "vàng" }[color]}`,
              [
                [percent(1 - chance), text],
                [percent(chance), "Chiến đấu Mimic."],
              ].filter(([p]) => p !== "0%"),
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
function statTransitions(before, after, includeResources = false) {
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
    ["accuracy", `${E.accuracy} ACC`],
    ["evasion", `${E.evasion} EVA`],
    ["maxMana", `${E.mana} Max MP`],
  ])
    add(label, [key], (s) => s[key]);
  add(`${E.crit} CRIT`, ["critChance"], (s) => percent(s.critChance));
  add(`${E.res} RES`, ["resistance"], (s) => `${s.resistance}%`);
  add(`${E.potion} Bình`, ["potionRate"], (s) => percent(s.potionRate));
  if (includeResources) {
    for (const [key, label] of [
      ["hp", `${E.hp} HP`],
      ["mana", `${E.mana} MP`],
      ["luck", `${E.luck} Luck`],
      ["potions", `${E.potion} Bình máu`],
      ["escapeTokens", `${E.ticket} Vé thoát hiểm`],
    ])
      add(label, [key], (s) => s[key]);
  }
  return parts.join(" · ") || "Không thay đổi chỉ số chiến đấu.";
}
function encounterText(s) {
  if (s.phase === "boss_chest")
    return `${eventIcon("boss_chest")} **RƯƠNG BOSS · TẦNG ${s.encounter.bossFloor}**\nPhần thưởng sau boss cuối khu vực. Chọn **mở hoặc bán** để tiếp tục.\n\n**Mở rương**\n- **70%:** nhận trang bị **SSR**.\n- **30%:** nhận trang bị **UR**, kèm lời nguyền.\nĐồ trùng tên tăng level. Tỷ lệ cố định, không bị Luck/pity thay đổi.\n\n**Bán rương**\n- Cộng **50% payout gốc hiện tại (${money(Math.floor(core.rawPayout(s) * 0.5))} xu)** vào thưởng của run.\nPhải xử lý rương trước khi rút thưởng hoặc đi tiếp.`;
  if (s.phase === "upgrade")
    return `${E.checkpoint} **CHECKPOINT** · Đã hồi đầy ${E.hp} HP và nhận thêm 2 ${E.potion} bình máu.\nChọn **+5 STR, DEX, VIT hoặc ENE**; dự báo thay đổi ở ngay bên dưới.`;
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
      `**Tấn công:** vật lý, hồi ${core.attackManaGain(s)} MP (tối đa Max MP). **Thủ:** DEF ×2 hoặc +15 RES, giảm thêm 15% DMG, miễn Crit, +1 MP.\n**${stats.CLASSES[s.classKey].skill} (${core.skillManaCost(s)} MP):** ${SKILLS[s.classKey]} **Bình:** hồi ${percent(s.potionRate)} Max HP, ít nhất 20; quái còn sống phản công.`
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
  const descriptions = {
    healer: `**Hồi phục:** hồi ${E.hp} HP bằng 30% Max HP, ít nhất 20; +1 ${E.potion} bình máu (tối đa 5). Miễn phí.`,
    blacksmith: `Trả 12% payout để tăng một cấp **${target?.name}**. Cộng buff mới; UR chưa giải nguyền cộng cả curse. Đồ đã giải hết nguyền giữ trạng thái sạch khi rèn.`,
    purifier: `Trả 20% payout: gỡ **toàn bộ curse** của **${target?.name}**, giữ buff/level, chuyển thành SSR.`,
    sacrifice: `**Hiến HP:** mất tối đa 20% Max ${E.hp} HP (giữ ≥1) → +6 ${E[stats.mainStat(s)]} ${stats.mainStat(s).toUpperCase()}.\n**Hiến payout:** trả 10% payout → +6 ${E.vit} VIT. Hiến HP không cộng bonus Blood Paradox.`,
    horadric: `Nghiền **một cấp ${target?.name} [${rarityLabel(target?.rarity)}]**: hấp thụ buff trong run, gỡ curse của cấp đó. Bình/vé/hồi HP không phát lại.\n\n**Chọn thêm một bonus:**\n- Sức mạnh: +6 ${E[stats.mainStat(s)]} ${stats.mainStat(s).toUpperCase()}.\n- Phòng thủ: 50% +7 ${E.str} STR / 50% +7 ${E.vit} VIT.\n- Sinh lực: +4 ${E.vit} VIT.\n- Vé: nhận 1 ${E.ticket} vé thoát hiểm (giữ tối đa 1).`,
    contract: `Trong 3 tầng, chọn một điều kiện:\n- **Không dùng ${E.potion} bình:** nhận đồ [SSR].\n- **Không dùng skill:** bonus +50% cược.\n- **Không phòng thủ:** +10 ${E[stats.mainStat(s)]} ${stats.mainStat(s).toUpperCase()}.\nVi phạm chỉ hủy thưởng.`,
    class_shrine: `Hiệu lực ba tầng tiếp theo: ${SHRINES[s.classKey]}`,
  };
  return `${eventIcon(e.kind)} **${e.name}**\n${descriptions[k] || "Chọn một hành động."}`;
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
    return `${["boss", "final_boss"].includes(e.rank) ? eventIcon("boss") : "👹"} **${e.name}** · ${rank}\n${healthBar(e.hp, e.maxHp)}\n${E.attack} Sát thương ${money(e.damageMin)}–${money(e.damageMax)} · ${E.defense} DEF ${money(e.defense)} · ${E.res} RES ${e.resistance}%\n${E.accuracy} Bạn đánh vật lý trúng: **${percent(world.hitChance(s.accuracy, e.evasion))}**${e.mechanic === "riftwalker" && e.combatTurn % 3 === 0 ? " · 🛡️ Quái miễn sát thương lượt này" : ""}\n🎯 **Đòn kế tiếp:** ${e.nextDamageType === "magic" ? `${E.magic} Phép` : `${E.attack} Vật lý`}\n📉 **Dự báo nhận:** **${preview.low}–${preview.high} HP** · ${E.evasion} Quái trúng bạn **${percent(preview.chance)}** *(chưa Crit/Phòng thủ)*`;
  }
  if (e.type === "shrine") return encounterText(s);
  if (e.type === "empty")
    return `${eventIcon("empty")} **PHÒNG TRỐNG**\nĐi tiếp để vượt tầng hoặc rút thưởng.`;
  if (e.type === "surprise" && e.kind.endsWith("_shop"))
    return `${eventIcon(e.kind)} **${e.name}** · mua một món\n${e.offers.map((o, i) => `${i + 1}. **${E.backpack} ${o.item.name} [${rarityLabel(o.item.rarity)}]** · ${money(o.price)} ${shopCurrency(e.kind)}`).join("\n")}\nXem Chi tiết để đọc công dụng và điều kiện mua.`;
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
  return (
    Object.keys(active).length
      ? effectText(active)
      : "Không có chỉ số cộng thêm."
  ).slice(0, 700);
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
    effects: `Rift & hiệu ứng (${Object.values(s.modifiers || {}).filter((stacks) => stacks > 0).length})`,
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
        assur: `${E.evasion} EVA **${e.evasion}**, ${E.crit} CRIT **${percent(e.critChance)}**. Phòng thủ miễn Crit của lần phản công đó.`,
        lucion:
          "Hồi HP bằng **35% sát thương thực tế gây lên bạn** sau mỗi phản công, tối đa Max HP. Né/chặn phản công ngăn hồi HP.",
        deimoss:
          "Abyssal Spires giảm **25% sát thương bạn gây ra**, áp dụng mọi đòn. Dự báo skill trên bảng chính đã tính giảm trừ này.",
      }[e.mechanic] || "Boss này không có chu kỳ kích hoạt riêng.";
    return `${eventIcon("boss")} **${e.name} · Cơ chế đặc biệt**\n${mechanism}${e.drainCharges > 0 ? `\nSoul Drain: còn **${e.drainCharges}** lần; phản công trúng sẽ hút 1 MP.` : ""}`;
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
    return `${E.chest} **Tỷ lệ mở hòm**\n${Object.entries(odds)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => `${names[key]}: **${percent(n)}**`)
      .join(
        "\n",
      )}\n\n**Kiểm tra:** ${percent(e.detectionChance)} phát hiện nếu có Mimic; không phát hiện chưa chắc an toàn.\n**Pity:** SR+ ${s.pityRare}/5 · SSR ${s.pityLegendary}/10.${e.guaranteed ? " Hòm này đảm bảo SR+, không Mimic." : ""}\n**Bán:** bonus +15% tiền cược. Đồ nhận chỉ dùng trong run; trùng tên tăng level. UR có curse.`;
  }
  if (e.type === "surprise" && e.kind.endsWith("_shop"))
    return `${eventIcon(e.kind)} **Công dụng các món đang bán**\n${e.offers.map((offer, i) => `${i + 1}. **${E.backpack} ${offer.item.name} [${rarityLabel(offer.item.rarity)}]**\n${itemText(offer.item)}`).join("\n\n")}\n\nMua tối đa **một món** trong lần gặp. ${e.kind === "blood_shop" ? "Trả bằng HP, phải còn ít nhất 1 HP sau mua." : e.kind === "diamond_shop" ? "Kim cương trừ ngay khi mua, không hoàn lại khi run kết thúc." : "Trả từ payout gốc; bonus Blood Paradox không dùng để mua."}`;
  if (e.type === "surprise" && e.kind === "merchant")
    return `${eventIcon("merchant")} **Công dụng hàng hóa**\n${e.offers.map((o) => `**${merchantOffer(o).name}**\n${merchantOffer(o).detail}`).join("\n\n")}\nChỉ mua một món; trả từ payout gốc. Cần đủ payout để mua.`;
  return "Không có thông tin bổ sung; xem bảng chơi chính.";
}
function chaosLabel(s) {
  const p = s.lastChaosChance || 0;
  return `${icon(p < 0.01 ? "large_green_circle" : p < 0.03 ? "large_yellow_circle" : "red_circle", p < 0.01 ? "🟢" : p < 0.03 ? "🟡" : "🔴")} Chaos: **${percent(p)}**`;
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
      `${E.checkpoint} **Tăng điểm checkpoint:**\n- ${statTransitions(state.lastUpgrade.before, state.lastUpgrade.after).split(" · ").join("\n- ")}`,
    );
  if (state.lastEventResult) {
    const receipt = state.lastEventResult;
    const names = {
      chest: "Rương",
      shrine: "Shrine",
      surprise: "Sự kiện",
      trap: "Bẫy",
      rngesus: "RNGesus",
      echo: "Grave Echo",
      memory: "The Tower Remembers",
    };
    const heading = `${eventIcon(["surprise", "trap"].includes(receipt.type) ? receipt.kind || Object.keys(core.EVENT_NAMES).find((key) => core.EVENT_NAMES[key] === receipt.name) || receipt.type : receipt.type)} **${received.length ? "Nhận đồ từ" : "Do"} ${receipt.name || names[receipt.type] || "sự kiện"}:**`;
    details.push(
      [
        heading,
        ...receivedTitles,
        ...(received.length ? ["**Thay đổi chỉ số:**"] : []),
        `- ${statTransitions(receipt.before, receipt.after, true).split(" · ").join("\n- ")}`,
      ].join("\n"),
    );
  }
  if (!state.lastEventResult)
    received.forEach((item, index) =>
      details.push(
        `${receivedTitles[index]}\n${effectText(item.definition.effects, item.levels)}${item.definition.curse && item.curseLevels ? `\n☣️ Curse: ${effectText(item.definition.curse.effects, item.curseLevels)}` : ""}`,
      ),
    );
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
  // Old sessions can still contain the numeric summaries written before this UI change.
  for (let i = 0; i < lines.length; i++)
    if (lines[i].endsWith("Shrine experience."))
      lines[i] =
        `${E.shrine} Shrine Experience: bonus +25% cược (${money(Math.floor(state.stake * 0.25))} xu), cộng vào thưởng của run.`;
  if (state.lastUpgrade) lines[0] = "Đã phân bổ điểm checkpoint.";
  if (state.lastEventResult?.name === "Potion Thief")
    lines[0] = "Potion Thief đã cướp bình máu.";
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
function addTextFields(embed, name, text, inline = false) {
  const limit = 1024;
  let chunk = "";
  let first = true;
  const lines = text.split("\n").flatMap((line) => {
    const parts = [];
    while (line.length > limit) {
      const space = line.lastIndexOf(" ", limit);
      const end = space > 0 ? space : limit;
      parts.push(line.slice(0, end));
      line = line.slice(end).trimStart();
    }
    return [...parts, line];
  });
  for (const line of lines) {
    if (chunk.length + line.length + 1 > limit && chunk) {
      embed.addFields({
        name: first ? name : "\u200b",
        value: chunk,
        inline,
      });
      first = false;
      chunk = "";
    }
    chunk += `${chunk ? "\n" : ""}${line}`;
  }
  if (chunk)
    embed.addFields({
      name: first ? name : "\u200b",
      value: chunk,
      inline,
    });
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
  addTextFields(
    e,
    state.encounter.type === "combat" ? `${E.attack} Đối thủ` : "⚠️ Tình huống",
    encounterSummary(state),
  );
  if (!result && state.phase === "upgrade")
    for (const key of stats.ATTRIBUTES)
      e.addFields({
        name: `${E[key]} +5 ${key.toUpperCase()}`,
        value: checkpointPreview(state, key),
      });
  const activeRifts = Object.entries(state.modifiers || {}).filter(
    ([, n]) => n > 0,
  );
  const mods =
    activeRifts
      .map(([key, n]) => `${RIFT_ICONS[key] || E.rift} ×${n}`)
      .join(" · ") || "Chưa có";
  e.addFields(
    {
      name: `${icon("compass", "🧭")} Tiến trình`,
      value: `Đã vượt ${state.cleared} · Boss ${state.bosses} · Modifier ${Object.values(state.modifiers || {}).reduce((sum, n) => sum + n, 0)}\n${chaosLabel(state)}`,
    },
    {
      name: `${E.rift} Rift modifier (${activeRifts.length})`,
      value:
        `${mods}${state.paradox ? `\n${eventIcon("paradox")} Paradox: ${state.paradox.kind === "blood" ? `Máu là tiền ${percent(state.paradox.bloodFactor)}` : "Ngược đời"} · hết tầng ${state.paradox.until}` : ""}`.slice(
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
      name: `${E.backpack} Trang bị (${state.items.length})`,
      value:
        equipmentSummary(state) +
        (state.payoutFactor < 1
          ? `\nPayout sau phạt ×${state.payoutFactor.toFixed(3)}`
          : "") +
        (state.classShrine &&
        state.floor >= state.classShrine.from &&
        state.floor <= state.classShrine.until
          ? `\n${E.shrine} Class Shrine · hết sau tầng ${state.classShrine.until}`
          : "") +
        (state.contract
          ? `\n${eventIcon("contract")} Hợp đồng: không ${{ potion: "bình", skill: "skill", defend: "thủ" }[state.contract.kind]} · ${state.contract.remaining} tầng`
          : ""),
    },
  );
  addTextFields(e, `${icon("scroll", "📜")} Lượt vừa rồi`, turnText(state));
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
        potion: `Bình máu (${state.potions})`,
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
      a.action.startsWith("boss_")
        ? eventIcon("boss_chest")
        : a.action === "skill"
          ? SKILL_ICONS[state.classKey]
          : state.encounter.kind === "merchant" && a.action.startsWith("buy_")
            ? merchantOffer(state.encounter.offers[Number(a.action.slice(4))])
                .icon
            : /^(event_|buy_|forge_|contract_|door_|duel_|hand_)/.test(a.action)
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
      value: `${E.potion} ${state.potions} bình · hồi ${percent(state.potionRate)} Max HP, tối thiểu 20.\n${E.ticket} ${state.escapeTokens} vé (tối đa 1); tự cứu khi bỏ chạy RNGesus thất bại.`,
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
    if (state.phase === "upgrade")
      for (const key of stats.ATTRIBUTES)
        e.addFields({
          name: `+5 ${key.toUpperCase()}`,
          value: checkpointPreview(state, key),
        });
  } else if (tab === "effects") {
    for (const [key, n] of Object.entries(state.modifiers).filter(
      ([, n]) => n > 0,
    ))
      e.addFields({
        name: `${RIFT_ICONS[key] || E.rift} ${world.RIFT_MODIFIERS[key].name} ×${n}`,
        value: `${world.RIFT_MODIFIERS[key].text} Stack hiệu dụng: ${world.effectiveStacks(n)}.`,
      });
    e.addFields({
      name: "Hiệu ứng hiện hành",
      value: `${eventIcon("paradox")} Rift Paradox: ${state.paradox ? `${state.paradox.kind === "blood" ? `Máu là tiền (hồi HP tại checkpoint không giảm hệ số) · hệ số thưởng xu ${state.paradox.bloodFactor >= 0 ? "+" : ""}${percent(state.paradox.bloodFactor)}` : "Ngược đời · vật lý lấy DEF, DEF lấy trung bình vật lý gốc"} · hết tầng ${state.paradox.until}` : "không"}\nClass Shrine: ${state.classShrine ? `${SHRINES[state.classKey]} Hết tầng ${state.classShrine.until}.` : "không"}\nHợp đồng: ${state.contract ? `không ${state.contract.kind}, còn ${state.contract.remaining} tầng` : "không"}\nPayout gốc ${money(core.rawPayout(state))} xu; bonus Blood Paradox không dùng mua đồ.`,
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
    role: `Build ${main} · ${{ amazon: "Hai phát vật lý", barbarian: "Vật lý và chống chịu", assassin: "Crit và né phản công", sorceress: "Skill phép mạnh", druid: "Vật lý và hồi phục", necromancer: "Phép và chặn phản công", paladin: "Vật lý và phòng thủ" }[classKey]}`,
    attributes: `${E.str} STR **${state.str}** · ${E.dex} DEX **${state.dex}** · ${E.vit} VIT **${state.vit}** · ${E.ene} ENE **${state.ene}**`,
    stats: `${E.str} STR **${state.str}** · ${E.dex} DEX **${state.dex}** · ${E.vit} VIT **${state.vit}** · ${E.ene} ENE **${state.ene}**\n${E.hp} HP **${state.hp}** · ${E.mana} MP **${state.mana}** · ${E.defense} DEF **${state.defense}** · ${E.potion} Bình **${state.potions}**\n${E.attack} Vật lý **${state.damageMin}–${state.damageMax}** · ${E.magic} Phép **${state.spellMin}–${state.spellMax}** · ${E.res} RES **${state.resistance}%** · ${E.crit} CRIT **${percent(state.critChance)}**`,
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
          "Chaos hiện bằng % trên bảng chơi. Chạy 75%, thất bại tự dùng vé; cầu nguyện 30%, thưởng SSR 85%/UR 15%; đánh chết; hối lộ cần payout ≥1.000 xu, −40% payout.",
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
          "STR/DEX/VIT/ENE tạo chỉ số; MP riêng. Skill tốn 2 MP. Tấn công hồi 70% Max MP cho Sorceress/Necromancer, 40% cho class khác, tối thiểu 1. Thủ: DEF ×2/+15 RES, giảm thêm 15%, miễn Crit, +1 MP. Bình hồi 35% + min(15%,VIT×0,05%) + item, cap 10–75%.",
      },
      {
        name: `${E.checkpoint} Checkpoint và Rift`,
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
