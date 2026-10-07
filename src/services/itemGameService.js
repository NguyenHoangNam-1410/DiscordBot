const GAME_FILTERS = Object.freeze([
  { id: "baucua", label: "Bầu cua", emoji: "🎲" },
  { id: "taixiu", label: "Tài xỉu", emoji: "🎯" },
  { id: "duangua", label: "Đua ngựa", emoji: "🏇" },
  { id: "blackjack", label: "Xì dách", emoji: "🃏" },
  { id: "poker", label: "Poker", emoji: "♠️" },
  { id: "mines", label: "Mines", emoji: "💣" },
  { id: "coquay", label: "Cò quay Nga", emoji: "🔫" },
  { id: "vuatiengviet", label: "Vua tiếng Việt", emoji: "🧠" },
  { id: "chinchiro", label: "Chinchiro", emoji: "🎲" },
]);

const EFFECT_GAMES = Object.freeze({
  baucua_magnifier: ["baucua"],
  taixiu_no_triple: ["taixiu"],
  dice_divine_eye: ["baucua", "taixiu"],
  blackjack_redraw: ["blackjack"],
  blackjack_swap: ["blackjack"],
  blackjack_first_ace: ["blackjack"],
  horse_second_insurance: ["duangua"],
  horse_jackpot: ["duangua"],
  mines_radar: ["mines"],
  mines_blast_shield: ["mines"],
  poker_insurance: ["poker"],
  quiz_living_dictionary: ["vuatiengviet"],
  quiz_first_word: ["vuatiengviet"],
  quiz_syllable_lengths: ["vuatiengviet"],
  quiz_letter_position: ["vuatiengviet"],
  quiz_extra_time: ["vuatiengviet"],
  mines_row_scanner: ["mines"],
  mines_column_scanner: ["mines"],
  baucua_small_lens: ["baucua"],
  baucua_blank_insurance: ["baucua"],
  taixiu_total_scope: ["taixiu"],
  taixiu_edge_insurance: ["taixiu"],
  horse_consolation: ["duangua"],
  blackjack_bust_guard: ["blackjack"],
  poker_fold_coupon: ["poker"],
  chinchiro_soundproof_bowl: ["chinchiro"],
  chinchiro_weighted_dice: ["chinchiro"],
  chinchiro_otsuki_dice: ["chinchiro"],
  chinchiro_karma: ["chinchiro"],
  coquay_magnifier: ["coquay"],
  coquay_decoy: ["coquay"],
  coquay_saw: ["coquay"],
  coquay_cuffs: ["coquay"],
});

function itemGames(item) {
  if (item?.type === "color" || item?.type === "avatar_ring") return [];
  const mapped = EFFECT_GAMES[item?.effect];
  if (mapped) return mapped;
  // Items without a game-specific effect are shared and remain visible in every filter.
  return null;
}

function itemMatchesGame(item, gameId) {
  if (!gameId || gameId === "all") return true;
  const games = itemGames(item);
  return games === null || games.includes(gameId);
}

function gameLabels(item) {
  const games = itemGames(item);
  return games === null
    ? null
    : games.map(
        (id) => GAME_FILTERS.find((game) => game.id === id)?.label || id,
      );
}

const RARITY_RANK = Object.freeze({
  LR: 6,
  mythic: 5,
  UR: 4,
  legendary: 4,
  SSR: 3,
  epic: 3,
  SR: 2,
  rare: 2,
  R: 1,
  common: 1,
});

// Vị trí nhóm game: vật phẩm theo game đứng theo thứ tự GAME_FILTERS, vật phẩm dùng chung sau đó, vật phẩm hồ sơ cuối cùng.
function gameGroupIndex(item) {
  const games = itemGames(item);
  if (games === null) return GAME_FILTERS.length;
  if (!games.length) return GAME_FILTERS.length + 1;
  const indexes = games
    .map((id) => GAME_FILTERS.findIndex((game) => game.id === id))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : GAME_FILTERS.length;
}

// Độ hiếm cao trước; cùng độ hiếm thì cùng game đứng gần nhau; cuối cùng theo tên.
function compareItems(a, b) {
  return (
    (RARITY_RANK[b?.rarity] || 0) - (RARITY_RANK[a?.rarity] || 0) ||
    gameGroupIndex(a) - gameGroupIndex(b) ||
    String(a?.name || "").localeCompare(String(b?.name || ""), "vi")
  );
}

module.exports = {
  compareItems,
  gameGroupIndex,
  GAME_FILTERS,
  EFFECT_GAMES,
  itemGames,
  itemMatchesGame,
  gameLabels,
};
