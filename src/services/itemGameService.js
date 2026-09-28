const GAME_FILTERS = Object.freeze([
  { id: 'baucua', label: 'Bầu cua', emoji: '🎲' },
  { id: 'taixiu', label: 'Tài xỉu', emoji: '🎯' },
  { id: 'duangua', label: 'Đua ngựa', emoji: '🏇' },
  { id: 'oantuti', label: 'Oẳn tù tì', emoji: '✊' },
  { id: 'blackjack', label: 'Xì dách', emoji: '🃏' },
  { id: 'poker', label: 'Poker', emoji: '♠️' },
  { id: 'mines', label: 'Mines', emoji: '💣' },
  { id: 'vuatiengviet', label: 'Vua tiếng Việt', emoji: '🧠' },
  { id: 'chinchiro', label: 'Chinchiro', emoji: '🎲' },
  { id: 'profile', label: 'Hồ sơ', emoji: '🎨' },
]);

const EFFECT_GAMES = Object.freeze({
  baucua_magnifier: ['baucua'],
  taixiu_no_triple: ['taixiu'],
  dice_divine_eye: ['baucua', 'taixiu'],
  blackjack_redraw: ['blackjack'],
  blackjack_swap: ['blackjack'],
  blackjack_first_ace: ['blackjack'],
  horse_second_insurance: ['duangua'],
  horse_jackpot: ['duangua'],
  rps_counter: ['oantuti'],
  rps_draw_win: ['oantuti'],
  mines_radar: ['mines'],
  mines_blast_shield: ['mines'],
  poker_insurance: ['poker'],
  quiz_living_dictionary: ['vuatiengviet'],
  quiz_first_word: ['vuatiengviet'],
  quiz_syllable_lengths: ['vuatiengviet'],
  chinchiro_soundproof_bowl: ['chinchiro'],
  chinchiro_weighted_dice: ['chinchiro'],
  chinchiro_otsuki_dice: ['chinchiro'],
  chinchiro_karma: ['chinchiro'],
});

function itemGames(item) {
  const mapped = EFFECT_GAMES[item?.effect];
  if (mapped) return mapped;
  // Items without a game-specific effect are shared and remain visible in every filter.
  return null;
}

function itemMatchesGame(item, gameId) {
  if (!gameId || gameId === 'all') return true;
  const games = itemGames(item);
  return !games || games.includes(gameId);
}

function gameLabels(item) {
  const games = itemGames(item);
  return games ? games.map(id => GAME_FILTERS.find(game => game.id === id)?.label || id) : null;
}

module.exports = { GAME_FILTERS, EFFECT_GAMES, itemGames, itemMatchesGame, gameLabels };
