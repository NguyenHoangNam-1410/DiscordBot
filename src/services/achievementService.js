const { db } = require("../db");
const { getAccount, creditCoins } = require("./economyService");
const { addDiamonds } = require("./playerLevelService");

const ACHIEVEMENTS = Object.freeze([
  {
    id: "first_game",
    name: "Bước chân đầu tiên",
    description: "Chơi ván đầu tiên",
    target: 1,
    reward: 2_000,
    diamonds: 10,
    metric: "games",
  },
  {
    id: "games_10",
    name: "Người chơi quen mặt",
    description: "Chơi 10 ván",
    target: 10,
    reward: 5_000,
    diamonds: 20,
    metric: "games",
  },
  {
    id: "games_25",
    name: "Khách quen",
    description: "Chơi 25 ván",
    target: 25,
    reward: 10_000,
    diamonds: 30,
    metric: "games",
  },
  {
    id: "games_100",
    name: "Cựu binh Game Hub",
    description: "Chơi 100 ván",
    target: 100,
    reward: 25_000,
    diamonds: 75,
    metric: "games",
  },
  {
    id: "games_500",
    name: "Huyền thoại sòng chơi",
    description: "Chơi 500 ván",
    target: 500,
    reward: 75_000,
    diamonds: 200,
    metric: "games",
  },
  {
    id: "games_1000",
    name: "Bất khả chiến bại",
    description: "Chơi 1.000 ván",
    target: 1_000,
    reward: 150_000,
    diamonds: 400,
    metric: "games",
  },
  {
    id: "wins_5",
    name: "Chuỗi chiến thắng",
    description: "Thắng 5 ván",
    target: 5,
    reward: 5_000,
    diamonds: 20,
    metric: "wins",
  },
  {
    id: "wins_20",
    name: "Tay chơi lên hạng",
    description: "Thắng 20 ván",
    target: 20,
    reward: 15_000,
    diamonds: 50,
    metric: "wins",
  },
  {
    id: "wins_50",
    name: "Nhà vô địch",
    description: "Thắng 50 ván",
    target: 50,
    reward: 35_000,
    diamonds: 100,
    metric: "wins",
  },
  {
    id: "wins_100",
    name: "Bách chiến bách thắng",
    description: "Thắng 100 ván",
    target: 100,
    reward: 75_000,
    diamonds: 200,
    metric: "wins",
  },
  {
    id: "wins_250",
    name: "Huyền thoại chiến thắng",
    description: "Thắng 250 ván",
    target: 250,
    reward: 150_000,
    diamonds: 400,
    metric: "wins",
  },
  {
    id: "games_3_types",
    name: "Kẻ khám phá",
    description: "Thử ít nhất 3 trò chơi",
    target: 3,
    reward: 7_500,
    diamonds: 30,
    metric: "gameTypes",
  },
  {
    id: "games_5_types",
    name: "Người chơi đa tài",
    description: "Thử ít nhất 5 trò chơi",
    target: 5,
    reward: 15_000,
    diamonds: 60,
    metric: "gameTypes",
  },
  {
    id: "games_10_types",
    name: "Bách nghệ",
    description: "Thử ít nhất 10 trò chơi",
    target: 10,
    reward: 35_000,
    diamonds: 120,
    metric: "gameTypes",
  },
  {
    id: "balance_100k",
    name: "Túi xu nặng trĩu",
    description: "Sở hữu 100.000 xu",
    target: 100_000,
    reward: 5_000,
    diamonds: 15,
    metric: "balance",
  },
  {
    id: "balance_1m",
    name: "Triệu phú",
    description: "Sở hữu 1.000.000 xu",
    target: 1_000_000,
    reward: 25_000,
    diamonds: 75,
    metric: "balance",
  },
  {
    id: "hardcore_10",
    name: "Sống sót trong bóng tối",
    description: "Đạt tầng 10 Sinh tồn",
    target: 10,
    reward: 10_000,
    diamonds: 30,
    metric: "hardcoreFloor",
  },
  {
    id: "hardcore_25",
    name: "Kẻ chinh phục vực sâu",
    description: "Đạt tầng 25 Sinh tồn",
    target: 25,
    reward: 30_000,
    diamonds: 100,
    metric: "hardcoreFloor",
  },
  {
    id: "hardcore_50",
    name: "Bóng ma sinh tồn",
    description: "Đạt tầng 50 Sinh tồn",
    target: 50,
    reward: 75_000,
    diamonds: 250,
    metric: "hardcoreFloor",
  },
  {
    id: "hc_runs_5",
    name: "Lần đầu xuống hầm",
    description: "Bắt đầu 5 lượt Sinh tồn",
    target: 5,
    reward: 5_000,
    diamonds: 20,
    metric: "hardcoreRuns",
  },
  {
    id: "hc_runs_25",
    name: "Dân hầm ngục",
    description: "Bắt đầu 25 lượt Sinh tồn",
    target: 25,
    reward: 20_000,
    diamonds: 60,
    metric: "hardcoreRuns",
  },
  {
    id: "hc_runs_100",
    name: "Nghiện sinh tồn",
    description: "Bắt đầu 100 lượt Sinh tồn",
    target: 100,
    reward: 60_000,
    diamonds: 180,
    metric: "hardcoreRuns",
  },
  {
    id: "hc_escape_1",
    name: "Thoát hiểm",
    description: "Rút lui an toàn khỏi Sinh tồn 1 lần",
    target: 1,
    reward: 8_000,
    diamonds: 25,
    metric: "hardcoreEscapes",
  },
  {
    id: "hc_escape_10",
    name: "Kẻ chạy trốn lão luyện",
    description: "Rút lui an toàn khỏi Sinh tồn 10 lần",
    target: 10,
    reward: 30_000,
    diamonds: 90,
    metric: "hardcoreEscapes",
  },
  {
    id: "hc_escape_30",
    name: "Nhà sinh tồn thực thụ",
    description: "Rút lui an toàn khỏi Sinh tồn 30 lần",
    target: 30,
    reward: 80_000,
    diamonds: 220,
    metric: "hardcoreEscapes",
  },
  {
    id: "hc_clear_1",
    name: "Chạm đáy vực sâu",
    description: "Hoàn thành trọn vẹn Sinh tồn 1 lần",
    target: 1,
    reward: 40_000,
    diamonds: 120,
    metric: "hardcoreCompletions",
  },
  {
    id: "hc_clear_5",
    name: "Huyền thoại hầm ngục",
    description: "Hoàn thành trọn vẹn Sinh tồn 5 lần",
    target: 5,
    reward: 120_000,
    diamonds: 350,
    metric: "hardcoreCompletions",
  },
  {
    id: "bet_wins_10",
    name: "Vận đỏ khởi đầu",
    description: "Thắng 10 ván game cược",
    target: 10,
    reward: 5_000,
    diamonds: 20,
    metric: "betWins",
  },
  {
    id: "bet_wins_50",
    name: "Con bạc có duyên",
    description: "Thắng 50 ván game cược",
    target: 50,
    reward: 20_000,
    diamonds: 60,
    metric: "betWins",
  },
  {
    id: "bet_wins_200",
    name: "Thần bài thần xúc xắc",
    description: "Thắng 200 ván game cược",
    target: 200,
    reward: 60_000,
    diamonds: 180,
    metric: "betWins",
  },
  {
    id: "bet_wins_500",
    name: "Vua sòng bạc",
    description: "Thắng 500 ván game cược",
    target: 500,
    reward: 150_000,
    diamonds: 400,
    metric: "betWins",
  },
  {
    id: "bet_types_5",
    name: "Dạo quanh sòng bạc",
    description: "Chơi 5 game cược khác nhau",
    target: 5,
    reward: 10_000,
    diamonds: 40,
    metric: "betGames",
  },
  {
    id: "bet_types_9",
    name: "Thông thạo mọi bàn cược",
    description: "Chơi đủ 9 game cược",
    target: 9,
    reward: 50_000,
    diamonds: 150,
    metric: "betGames",
  },
  {
    id: "bet_staked_100k",
    name: "Dám chơi dám chịu",
    description: "Tổng tiền đặt cược đạt 100.000 xu",
    target: 100_000,
    reward: 8_000,
    diamonds: 25,
    metric: "betStaked",
  },
  {
    id: "bet_staked_1m",
    name: "Tay chơi hạng nặng",
    description: "Tổng tiền đặt cược đạt 1.000.000 xu",
    target: 1_000_000,
    reward: 40_000,
    diamonds: 120,
    metric: "betStaked",
  },
  {
    id: "bet_staked_10m",
    name: "Đại gia sòng bạc",
    description: "Tổng tiền đặt cược đạt 10.000.000 xu",
    target: 10_000_000,
    reward: 150_000,
    diamonds: 400,
    metric: "betStaked",
  },
  {
    id: "bet_big_50k",
    name: "Trúng lớn",
    description: "Nhận 50.000 xu trong một ván cược",
    target: 50_000,
    reward: 10_000,
    diamonds: 35,
    metric: "betBigWin",
  },
  {
    id: "bet_big_500k",
    name: "Jackpot",
    description: "Nhận 500.000 xu trong một ván cược",
    target: 500_000,
    reward: 60_000,
    diamonds: 200,
    metric: "betBigWin",
  },
]);

const BETTING_GAMES = Object.freeze(["baucua","oantuti","taixiu","chinchiro","blackjack","poker","duangua","mines","coquay"]);
const BETTING_SQL = BETTING_GAMES.map((game) => `'${game}'`).join(",");

function metrics(guildId, userId) {
  const guild = String(guildId);
  const user = String(userId);
  const account = getAccount(guild, user);
  const gameTypes = db
    .prepare(
      "SELECT COUNT(*) count FROM game_player_stats WHERE guild_id=? AND user_id=? AND played>0",
    )
    .get(guild, user).count;
  const hardcoreFloor =
    db
      .prepare(
        "SELECT COALESCE(best_floor,0) value FROM hardcore_records WHERE guild_id=? AND user_id=?",
      )
      .get(guild, user)?.value || 0;
  const hardcore =
    db
      .prepare(
        "SELECT COALESCE(runs,0) runs, COALESCE(escapes,0) escapes, COALESCE(completions,0) completions FROM hardcore_records WHERE guild_id=? AND user_id=?",
      )
      .get(guild, user) || {};
  const betting = db
    .prepare(
      `SELECT COALESCE(SUM(wins),0) wins, COALESCE(SUM(CASE WHEN played>0 THEN 1 ELSE 0 END),0) games
       FROM game_player_stats WHERE guild_id=? AND user_id=? AND game IN (${BETTING_SQL})`,
    )
    .get(guild, user);
  const history = db
    .prepare(
      `SELECT COALESCE(SUM(stake),0) staked, COALESCE(MAX(CASE WHEN outcome='win' THEN payout END),0) big
       FROM game_history WHERE guild_id=? AND user_id=? AND game IN (${BETTING_SQL})`,
    )
    .get(guild, user);
  return {
    hardcoreRuns: hardcore.runs || 0,
    hardcoreEscapes: hardcore.escapes || 0,
    hardcoreCompletions: hardcore.completions || 0,
    betWins: betting.wins,
    betGames: betting.games,
    betStaked: history.staked,
    betBigWin: history.big,
    games: account.games_played,
    wins: account.wins,
    balance: account.balance,
    gameTypes,
    hardcoreFloor,
  };
}

function getAchievements(guildId, userId) {
  const values = metrics(guildId, userId);
  const claimed = new Set(
    db
      .prepare(
        "SELECT achievement_id FROM achievement_claims WHERE guild_id=? AND user_id=?",
      )
      .all(String(guildId), String(userId))
      .map((row) => row.achievement_id),
  );
  return ACHIEVEMENTS.map((item) => ({
    ...item,
    progress: Math.min(item.target, values[item.metric] || 0),
    complete: (values[item.metric] || 0) >= item.target,
    claimed: claimed.has(item.id),
  }));
}

function claimAchievements(guildId, userId, now = Date.now()) {
  return db.transaction(() => {
    const available = getAchievements(guildId, userId).filter(
      (item) => item.complete && !item.claimed,
    );
    for (const item of available) {
      db.prepare(
        "INSERT INTO achievement_claims(guild_id,user_id,achievement_id,claimed_at) VALUES(?,?,?,?)",
      ).run(String(guildId), String(userId), item.id, now);
      creditCoins({
        guildId,
        userId,
        amount: item.reward,
        reason: `achievement:${item.id}`,
        operationId: `achievement:${guildId}:${userId}:${item.id}`,
      });
      if (item.diamonds)
        addDiamonds(guildId, userId, item.diamonds, {
          reason: `achievement:${item.id}`,
          operationId: `achievement-diamonds:${guildId}:${userId}:${item.id}`,
          now,
        });
    }
    return available;
  })();
}
function detectAchievementUnlocks(guildId, userId, now = Date.now()) {
  const unlocked = [];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO achievement_notifications(guild_id,user_id,achievement_id,unlocked_at) VALUES(?,?,?,?)",
  );
  for (const item of getAchievements(guildId, userId)) {
    if (
      item.complete &&
      insert.run(String(guildId), String(userId), item.id, now).changes
    )
      unlocked.push(item);
  }
  return unlocked;
}

module.exports = {
  ACHIEVEMENTS,
  BETTING_GAMES,
  getAchievements,
  claimAchievements,
  detectAchievementUnlocks,
};
