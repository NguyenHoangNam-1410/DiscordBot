// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
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

  const { formatCoins } = require("../../../utils/economy");

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
    taxCost,
    SURPRISE_EVENTS,
    CLASS_SHRINE_TEXT,
    surpriseOptions,
    shrineOutcomes,
    surpriseOdds,
    FIXED_SURPRISES,
    trapOdds,
  } = require("../formulas/index");

  const { regionForFloor, RIFT_MODIFIERS } = require("../formulas/index");

  const { resultBlock } = require("../../../utils/rewardText");

  const emojiMap = require("../../../discordEmojiMap");

  const {
    rarityLabel,
    normalizeEquipment,
    effectText,
    STAT_EMOJI,
  } = require("../../shared/equipment");

  const icon = (name, fallback = "•") => emojiMap[`:${name}:`] || fallback;

  const percentText = (value) =>
    `${(value * 100).toFixed(1).replace(".", ",")}%`;

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

  const DETAIL_TABS = Object.freeze([
    ["stats", "Chỉ số", "bar_chart"],
    ["items", "Vật phẩm", "school_satchel"],
    ["effects", "Rift & hiệu ứng", "cyclone"],
    ["encounter", "Tình huống", "information_source"],
  ]);
  return {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    formatCoins,
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
    taxCost,
    SURPRISE_EVENTS,
    CLASS_SHRINE_TEXT,
    surpriseOptions,
    shrineOutcomes,
    surpriseOdds,
    FIXED_SURPRISES,
    trapOdds,
    regionForFloor,
    RIFT_MODIFIERS,
    resultBlock,
    emojiMap,
    rarityLabel,
    normalizeEquipment,
    effectText,
    STAT_EMOJI,
    icon,
    percentText,
    CLASS_PROFILES,
    DETAIL_TABS,
  };
};
