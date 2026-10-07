"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const itemCurses = require("../itemCurses");

  const monsterLoot = require("../monsterLoot");
  const covenant = require("../events/covenant");

  const memories = require("../towerMemories");

  const {
    RNGESUS_CYCLE_RULES,
    GOD_RNGESUS_RULES,
    formatGodChance,
    rngesusChaosRules,
  } = require("../events/rngesus");

  const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");

  const stats = require("../engine/stats");

  const core = require("../engine/index");

  const itemPassives = require("../itemPassives");

  const paradox = require("../events/paradox");

  const world = require("../engine/world");

  const { RELEASE } = require("../shared/version");

  const balance = require("../shared/balance");

  const { runDiamondReward } = require("../shared/rewards");

  const emoji = require("../../discordEmojiMap");

  const { appEmoji } = require("../../utils/appEmoji");

  const { resultBlock } = require("../../utils/rewardText");

  const icon = (key, fallback) => appEmoji(key, emoji[`:${key}:`] || fallback);

  const {
    E,
    SKILL_ICONS,
    RIFT_ICONS,
    eventIcon,
    treasureChestIcon,
    paradoxIcon,
    memoryIcon,
    effectStatLabel,
    passiveIcon,
    ticketIcon,
  } = require("../shared/icons");

  const rarityLabel = (r) =>
    ({
      common: "R",
      rare: "SR",
      legendary: "SSR",
      cursed: "UR",
      limited: "LR",
    })[r];

  const percent = (n) => `${Math.round(n * 1000) / 10}%`;

  const money = (n) => Math.floor(n).toLocaleString("vi-VN");

  const {
    healthBar,
    addTextFields,
    highlightStat,
    formatStatText,
    STAT_SEPARATOR,
  } = require("../shared/ui");

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
    get barbarian() {
      return `${E.defense} **DEF** +8 khi ${E.hp} **HP** ≤30%.`;
    },
    assassin: "Chắc chắn né một phản công.",
    sorceress: "Một skill miễn phí.",
    get druid() {
      return `Hồi ${E.hp} **HP** cho bạn bằng **5% Max HP** mỗi tầng trong ba tầng kế tiếp, không vượt Max HP.`;
    },
    necromancer: "Chặn một đòn phản công.",
    get paladin() {
      return `${E.res} **RES** +10 khi nhận phép.`;
    },
  };

  const delta = (state, key, suffix = "") => {
    const n = state.lastStatChanges?.[key] || 0;
    return n
      ? ` (${n > 0 ? "+" : ""}${key === "critChance" ? Math.round(n * 1000) / 10 : n}${suffix})`
      : "";
  };
  return {
    itemCurses,
    monsterLoot,
    covenant,
    memories,
    RNGESUS_CYCLE_RULES,
    GOD_RNGESUS_RULES,
    formatGodChance,
    rngesusChaosRules,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    stats,
    core,
    itemPassives,
    paradox,
    world,
    RELEASE,
    balance,
    runDiamondReward,
    emoji,
    appEmoji,
    resultBlock,
    icon,
    E,
    SKILL_ICONS,
    RIFT_ICONS,
    eventIcon,
    treasureChestIcon,
    paradoxIcon,
    memoryIcon,
    effectStatLabel,
    passiveIcon,
    ticketIcon,
    rarityLabel,
    percent,
    money,
    healthBar,
    addTextFields,
    highlightStat,
    formatStatText,
    STAT_SEPARATOR,
    SKILLS,
    SHRINES,
    delta,
  };
};
