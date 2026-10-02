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
  if (item?.type === "color") return [];
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

module.exports = {
  GAME_FILTERS,
  EFFECT_GAMES,
  itemGames,
  itemMatchesGame,
  gameLabels,
};
