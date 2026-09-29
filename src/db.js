const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');
dotenv.config();

const dbPath = path.resolve(process.env.DB_PATH || './data/game-bot.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS economy_accounts (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 1000 CHECK(balance >= 0),
  last_daily_at INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_economy_leaderboard ON economy_accounts(guild_id, balance DESC);

CREATE TABLE IF NOT EXISTS economy_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  operation_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_economy_transactions_created ON economy_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_economy_transactions_user ON economy_transactions(guild_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_cosmetics (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, cosmetic_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_cosmetics_user ON profile_cosmetics(guild_id, user_id);

CREATE TABLE IF NOT EXISTS profile_loadouts (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  color_id TEXT NOT NULL DEFAULT 'color_red',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS shop_items (
  guild_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price >= 1 AND price <= 100000000),
  stock INTEGER CHECK(stock IS NULL OR stock >= 0),
  sold_count INTEGER NOT NULL DEFAULT 0,
  min_games INTEGER NOT NULL DEFAULT 0 CHECK(min_games >= 0),
  min_wins INTEGER NOT NULL DEFAULT 0 CHECK(min_wins >= 0),
  min_balance INTEGER NOT NULL DEFAULT 0 CHECK(min_balance >= 0),
  discount_percent INTEGER NOT NULL DEFAULT 0 CHECK(discount_percent >= 0 AND discount_percent <= 90),
  discount_ends_at INTEGER,
  listed INTEGER NOT NULL DEFAULT 1 CHECK(listed IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, item_id),
  UNIQUE (guild_id, cosmetic_id)
);
CREATE INDEX IF NOT EXISTS idx_shop_items_active ON shop_items(guild_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS shop_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_purchases_created ON shop_purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_shop_purchases_user ON shop_purchases(guild_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_inventory (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  acquired_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON user_inventory(guild_id, user_id, quantity DESC);

CREATE TABLE IF NOT EXISTS user_item_effects (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  effect_id TEXT NOT NULL,
  charges INTEGER NOT NULL DEFAULT 0 CHECK(charges >= 0),
  expires_at INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, effect_id)
);

CREATE TABLE IF NOT EXISTS shop_settings (
  guild_id TEXT PRIMARY KEY,
  rotation_size INTEGER NOT NULL DEFAULT 8 CHECK(rotation_size BETWEEN 6 AND 10),
  next_rotation_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS coin_requests (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  requester_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 1 AND amount <= 100000),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coin_requests_requester ON coin_requests(guild_id, requester_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_requests_expiry ON coin_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_coin_requests_daily ON coin_requests(requester_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rps_duels (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  challenger_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  stake INTEGER NOT NULL CHECK(stake >= 10 AND stake <= 100000),
  challenger_choice TEXT CHECK(challenger_choice IS NULL OR challenger_choice IN ('bua','keo','bao')),
  opponent_choice TEXT CHECK(opponent_choice IS NULL OR opponent_choice IN ('bua','keo','bao')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','playing','completed','declined','expired')),
  winner_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rps_duels_active ON rps_duels(guild_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_rps_duels_players ON rps_duels(guild_id, challenger_id, opponent_id, status);

CREATE TABLE IF NOT EXISTS game_channels (
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, game)
);
CREATE INDEX IF NOT EXISTS idx_game_channels_channel ON game_channels(guild_id, channel_id);

CREATE TABLE IF NOT EXISTS game_sessions (
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, game)
);

CREATE TABLE IF NOT EXISTS game_player_stats (
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL,
  user_id TEXT NOT NULL,
  played INTEGER NOT NULL DEFAULT 0 CHECK(played >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK(wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK(losses >= 0),
  draws INTEGER NOT NULL DEFAULT 0 CHECK(draws >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, game, user_id)
);
CREATE INDEX IF NOT EXISTS idx_game_player_leaderboard ON game_player_stats(guild_id, game, wins DESC, played ASC);

CREATE TABLE IF NOT EXISTS game_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  game TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('win','loss','draw')),
  stake INTEGER NOT NULL DEFAULT 0,
  payout INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_history_user ON game_history(guild_id,user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS game_rewards (
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL,
  reward INTEGER NOT NULL CHECK(reward >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, game)
);

CREATE TABLE IF NOT EXISTS game_bet_limits (
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL,
  max_bet INTEGER NOT NULL CHECK(max_bet >= 10 AND max_bet <= 100000),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, game)
);

CREATE TABLE IF NOT EXISTS multiplayer_rounds (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  closes_at INTEGER NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_rounds_active ON multiplayer_rounds(guild_id, game, status, closes_at);

CREATE TABLE IF NOT EXISTS multiplayer_bets (
  round_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  choice TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (round_id, user_id, choice),
  FOREIGN KEY (round_id) REFERENCES multiplayer_rounds(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_bets_round ON multiplayer_bets(round_id, user_id);

CREATE TABLE IF NOT EXISTS blackjack_sessions (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_blackjack_channel ON blackjack_sessions(guild_id, channel_id);

CREATE TABLE IF NOT EXISTS blackjack_duels (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  challenger_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  stake INTEGER NOT NULL CHECK(stake >= 10 AND stake <= 100000),
  state_json TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','playing','completed','declined','expired')),
  winner_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blackjack_duels_active ON blackjack_duels(guild_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_blackjack_duels_players ON blackjack_duels(guild_id, challenger_id, opponent_id, status);

CREATE TABLE IF NOT EXISTS poker_sessions (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  user_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  state_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_poker_sessions_expiry ON poker_sessions(expires_at);

CREATE TABLE IF NOT EXISTS mines_sessions (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mines_channel ON mines_sessions(guild_id, channel_id);

CREATE TABLE IF NOT EXISTS chinchiro_sessions (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  stake INTEGER NOT NULL CHECK(stake >= 10 AND stake <= 100000),
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chinchiro_channel ON chinchiro_sessions(guild_id, channel_id);

CREATE TABLE IF NOT EXISTS hardcore_sessions (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_hardcore_channel ON hardcore_sessions(guild_id, channel_id);

CREATE TABLE IF NOT EXISTS hardcore_records (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  best_floor INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  escapes INTEGER NOT NULL DEFAULT 0,
  completions INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_hardcore_leaderboard ON hardcore_records(guild_id, best_floor DESC, completions DESC);

CREATE TABLE IF NOT EXISTS player_progress (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  daily_key TEXT NOT NULL DEFAULT '',
  daily_json TEXT NOT NULL DEFAULT '{}',
  daily_claimed_json TEXT NOT NULL DEFAULT '[]',
  weekly_key TEXT NOT NULL DEFAULT '',
  weekly_json TEXT NOT NULL DEFAULT '{}',
  weekly_claimed_json TEXT NOT NULL DEFAULT '[]',
  streak INTEGER NOT NULL DEFAULT 0,
  last_checkin_key TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS season_scores (
  guild_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, season_key, user_id)
);
CREATE INDEX IF NOT EXISTS idx_season_leaderboard ON season_scores(guild_id, season_key, points DESC, wins DESC);

CREATE TABLE IF NOT EXISTS weekly_scores (
  guild_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, week_key, user_id)
);
CREATE INDEX IF NOT EXISTS idx_weekly_leaderboard ON weekly_scores(guild_id,week_key,points DESC,wins DESC);

CREATE TABLE IF NOT EXISTS weekly_claims (
  guild_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id,week_key,user_id)
);

CREATE TABLE IF NOT EXISTS weekly_reward_settings (
  guild_id TEXT PRIMARY KEY,
  first_place INTEGER NOT NULL DEFAULT 300000,
  top_three INTEGER NOT NULL DEFAULT 150000,
  top_ten INTEGER NOT NULL DEFAULT 75000,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS achievement_claims (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id,user_id,achievement_id)
);

CREATE TABLE IF NOT EXISTS achievement_notifications (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id,user_id,achievement_id)
);

CREATE TABLE IF NOT EXISTS rps_bot_rounds (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  stake INTEGER NOT NULL,
  choice TEXT NOT NULL,
  fair_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS onboarding_claims (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id,user_id)
);

CREATE TABLE IF NOT EXISTS newbie_bonus_claims (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id,user_id)
);

CREATE TABLE IF NOT EXISTS season_claims (
  guild_id TEXT NOT NULL,
  season_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, season_key, user_id)
);

CREATE TABLE IF NOT EXISTS server_events (
  guild_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  boss_name TEXT NOT NULL,
  max_hp INTEGER NOT NULL,
  hp INTEGER NOT NULL,
  defeated_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, event_key)
);

CREATE TABLE IF NOT EXISTS server_event_contributions (
  guild_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  damage INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, event_key, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_damage ON server_event_contributions(guild_id, event_key, damage DESC);

`);

db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
)`);

function runMigration(version, name, migrate) {
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version)) return false;
  db.transaction(() => {
    migrate();
    db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)').run(version, name, Date.now());
  })();
  return true;
}

// A stable operation id makes rewards/refunds safe to retry after Discord
// interaction retries or a process restart during settlement.
runMigration(1, 'economy operation id', () => {
  const transactionColumns = new Set(db.prepare('PRAGMA table_info(economy_transactions)').all().map(column => column.name));
  if (!transactionColumns.has('operation_id')) db.exec('ALTER TABLE economy_transactions ADD COLUMN operation_id TEXT');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_economy_transactions_operation
    ON economy_transactions(guild_id, user_id, operation_id) WHERE operation_id IS NOT NULL`);
});

// Seed per-game rankings once from retained transaction history. New results are
// written directly by progressionService, while INSERT OR IGNORE prevents repeats.
db.exec(`WITH parsed AS (
  SELECT guild_id,user_id,amount,created_at,
    substr(reason,1,instr(reason,':')-1) AS game,
    substr(reason,instr(reason,':')+1) AS outcome
  FROM economy_transactions WHERE instr(reason,':')>0
)
INSERT OR IGNORE INTO game_player_stats(guild_id,game,user_id,played,wins,losses,draws,updated_at)
SELECT guild_id,game,user_id,COUNT(*),SUM(outcome='win'),SUM(outcome='loss'),SUM(outcome='draw'),MAX(created_at)
FROM parsed WHERE game IN ('vuatiengviet','baucua','taixiu','oantuti','blackjack','poker','duangua','mines','hardcore')
  AND outcome IN ('win','loss','draw')
GROUP BY guild_id,game,user_id;`);

// Remove all persisted configuration and gameplay data for the retired Nối từ game.
db.exec(`
  DELETE FROM game_channels WHERE game = 'noitu';
  DELETE FROM game_sessions WHERE game = 'noitu';
  DELETE FROM game_rewards WHERE game = 'noitu';
  DELETE FROM game_player_stats WHERE game = 'noitu';
  DROP TABLE IF EXISTS word_suggestions;
`);

// Lightweight migrations for databases created before the rotating shop fields existed.
runMigration(2, 'rotating shop fields', () => {
  const shopColumns = new Set(db.prepare('PRAGMA table_info(shop_items)').all().map(column => column.name));
  if (!shopColumns.has('discount_percent')) db.exec('ALTER TABLE shop_items ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0 CHECK(discount_percent >= 0 AND discount_percent <= 90)');
  if (!shopColumns.has('discount_ends_at')) db.exec('ALTER TABLE shop_items ADD COLUMN discount_ends_at INTEGER');
  if (!shopColumns.has('listed')) db.exec('ALTER TABLE shop_items ADD COLUMN listed INTEGER NOT NULL DEFAULT 1 CHECK(listed IN (0, 1))');
});

// Collapse legacy profile decoration loadouts to the single supported color setting.
runMigration(3, 'simplify profile loadouts', () => {
  const profileColumns = new Set(db.prepare('PRAGMA table_info(profile_loadouts)').all().map(column => column.name));
  if (profileColumns.has('title_id') || profileColumns.has('frame_id') || profileColumns.has('background_id') || profileColumns.has('badges_json')) {
    db.exec(`
      DROP TABLE IF EXISTS profile_loadouts_color_v2;
      CREATE TABLE profile_loadouts_color_v2 (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        color_id TEXT NOT NULL DEFAULT 'color_red',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );
      INSERT INTO profile_loadouts_color_v2 (guild_id,user_id,color_id,updated_at)
      SELECT guild_id,user_id,color_id,updated_at FROM profile_loadouts;
      DROP TABLE profile_loadouts;
      ALTER TABLE profile_loadouts_color_v2 RENAME TO profile_loadouts;
    `);
  }
});

// Expand the original 100,000 xu price ceiling without losing existing shop configuration.
runMigration(4, 'expand shop price ceiling', () => {
  const shopTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='shop_items'").get()?.sql || '';
  if (!/price\s*<=\s*100000000/i.test(shopTableSql)) {
    db.exec(`
      DROP TABLE IF EXISTS shop_items_price_v2;
      CREATE TABLE shop_items_price_v2 (
        guild_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        cosmetic_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        price INTEGER NOT NULL CHECK(price >= 1 AND price <= 100000000),
        stock INTEGER CHECK(stock IS NULL OR stock >= 0),
        sold_count INTEGER NOT NULL DEFAULT 0,
        min_games INTEGER NOT NULL DEFAULT 0 CHECK(min_games >= 0),
        min_wins INTEGER NOT NULL DEFAULT 0 CHECK(min_wins >= 0),
        min_balance INTEGER NOT NULL DEFAULT 0 CHECK(min_balance >= 0),
        discount_percent INTEGER NOT NULL DEFAULT 0 CHECK(discount_percent >= 0 AND discount_percent <= 90),
        discount_ends_at INTEGER,
        listed INTEGER NOT NULL DEFAULT 1 CHECK(listed IN (0, 1)),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, item_id),
        UNIQUE (guild_id, cosmetic_id)
      );
      INSERT INTO shop_items_price_v2
        (guild_id,item_id,cosmetic_id,display_name,price,stock,sold_count,min_games,min_wins,min_balance,
         discount_percent,discount_ends_at,listed,active,created_by,created_at,updated_at)
      SELECT guild_id,item_id,cosmetic_id,display_name,price,stock,sold_count,min_games,min_wins,min_balance,
         discount_percent,discount_ends_at,listed,active,created_by,created_at,updated_at FROM shop_items;
      DROP TABLE shop_items;
      ALTER TABLE shop_items_price_v2 RENAME TO shop_items;
      CREATE INDEX idx_shop_items_active ON shop_items(guild_id, active, updated_at DESC);
    `);
  }
});

runMigration(5, 'progression and player experience tables', () => {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_game_history_user ON game_history(guild_id,user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_weekly_leaderboard ON weekly_scores(guild_id,week_key,points DESC,wins DESC)`);
});

runMigration(6, 'user experience preferences', () => {
  // Retained as an applied migration number for existing databases.
});
runMigration(7, 'weekly reward settings', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS weekly_reward_settings (
    guild_id TEXT PRIMARY KEY,first_place INTEGER NOT NULL DEFAULT 300000,top_three INTEGER NOT NULL DEFAULT 150000,
    top_ten INTEGER NOT NULL DEFAULT 75000,updated_at INTEGER NOT NULL)`);
});
runMigration(8, 'achievement unlock notifications', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS achievement_notifications (
    guild_id TEXT NOT NULL,user_id TEXT NOT NULL,achievement_id TEXT NOT NULL,unlocked_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id,user_id,achievement_id))`);
});
runMigration(9, 'provably fair rps bot rounds', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS rps_bot_rounds (
    id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,user_id TEXT NOT NULL,stake INTEGER NOT NULL,
    choice TEXT NOT NULL,fair_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',result_json TEXT,
    expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`);
});
runMigration(10, 'gacha currencies and level progression', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS player_currencies (
    guild_id TEXT NOT NULL,user_id TEXT NOT NULL,diamonds INTEGER NOT NULL DEFAULT 0 CHECK(diamonds >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1),experience INTEGER NOT NULL DEFAULT 0 CHECK(experience >= 0),
    free_gacha_pulls INTEGER NOT NULL DEFAULT 0 CHECK(free_gacha_pulls >= 0),updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id,user_id));
    CREATE TABLE IF NOT EXISTS gacha_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,pulls INTEGER NOT NULL,
    diamond_cost INTEGER NOT NULL,results_json TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_gacha_history_user ON gacha_history(guild_id,user_id,created_at DESC)`);
});
runMigration(11, 'diamond transaction ledger', () => {
  const gachaColumns = new Set(db.prepare('PRAGMA table_info(gacha_history)').all().map(column => column.name));
  if (!gachaColumns.has('operation_id')) db.exec('ALTER TABLE gacha_history ADD COLUMN operation_id TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS diamond_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK(balance_after >= 0),reason TEXT NOT NULL,operation_id TEXT,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_diamond_transactions_user ON diamond_transactions(guild_id,user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_diamond_transactions_created ON diamond_transactions(created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_diamond_transactions_operation
      ON diamond_transactions(guild_id,user_id,operation_id) WHERE operation_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gacha_history_operation
      ON gacha_history(guild_id,user_id,operation_id) WHERE operation_id IS NOT NULL`);
});

runMigration(12, 'per guild gameplay settings', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS game_settings (
    guild_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, setting_key)
  )`);
});

runMigration(13, 'lifetime coins earned per game', () => {
  const columns = new Set(db.prepare('PRAGMA table_info(game_player_stats)').all().map(column => column.name));
  if (!columns.has('coins_earned')) db.exec('ALTER TABLE game_player_stats ADD COLUMN coins_earned INTEGER NOT NULL DEFAULT 0');
  db.exec(`UPDATE game_player_stats SET coins_earned=COALESCE((
    SELECT SUM(game_history.payout) FROM game_history
    WHERE game_history.guild_id=game_player_stats.guild_id
      AND game_history.user_id=game_player_stats.user_id
      AND game_history.game=game_player_stats.game
  ),0)`);
});

runMigration(14, 'weekly role rewards', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS weekly_role_rewards (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount >= 1 AND amount <= 100000000),
    starts_week_key TEXT NOT NULL,
    last_granted_week TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, role_id)
  );
  CREATE TABLE IF NOT EXISTS weekly_role_reward_grants (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    week_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    granted_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, role_id, week_key, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_weekly_role_rewards_due
    ON weekly_role_rewards(starts_week_key,last_granted_week);
  CREATE INDEX IF NOT EXISTS idx_weekly_role_reward_grants_user
    ON weekly_role_reward_grants(guild_id,user_id,granted_at DESC)`);
});

runMigration(15, 'configurable gacha pool and timed game buffs', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS gacha_pool_entries (
    guild_id TEXT NOT NULL,
    reward_key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('coins','item')),
    item_id TEXT,
    display_name TEXT NOT NULL,
    tier TEXT NOT NULL CHECK(tier IN ('XU','R','SR','SSR','UR')),
    amount INTEGER NOT NULL DEFAULT 1 CHECK(amount >= 1),
    weight INTEGER NOT NULL CHECK(weight >= 0),
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id,reward_key)
  );
  CREATE TABLE IF NOT EXISTS game_reward_buffs (
    guild_id TEXT NOT NULL,
    buff_type TEXT NOT NULL CHECK(buff_type IN ('coins','diamonds','free_pull','gacha_luck')),
    chance_bps INTEGER NOT NULL CHECK(chance_bps >= 0 AND chance_bps <= 100000),
    amount INTEGER NOT NULL CHECK(amount >= 1),
    ends_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id,buff_type)
  );
  CREATE INDEX IF NOT EXISTS idx_game_reward_buffs_expiry ON game_reward_buffs(ends_at)`);
});

runMigration(16, 'revamp gameplay items and remove loss taunts', () => {
  const allowedItems = [
    'color_red','color_violet','color_blue','color_green','color_gold','color_cyan','color_rose','color_emerald','color_century',
    'baucua_magnifier','taixiu_magnetic_dice','divine_eye','blackjack_redraw','blackjack_swap','blackjack_ace',
    'horse_second_insurance','horse_jackpot','rps_counter_charm','rps_coward_privilege','mines_radar',
    'mines_blast_shield','poker_insurance','living_dictionary','chinchiro_soundproof_bowl','chinchiro_weighted_dice',
    'chinchiro_otsuki_dice','chinchiro_karma_charm',
  ];
  const placeholders = allowedItems.map(() => '?').join(',');
  db.prepare(`DELETE FROM user_inventory WHERE item_id NOT IN (${placeholders})`).run(...allowedItems);
  db.prepare(`DELETE FROM shop_items WHERE cosmetic_id NOT IN (${placeholders})`).run(...allowedItems);
  db.prepare(`DELETE FROM gacha_pool_entries WHERE kind='item' AND item_id NOT IN (${placeholders})`).run(...allowedItems);
  db.exec(`DELETE FROM user_item_effects;
    DROP TABLE IF EXISTS user_preferences`);
});

runMigration(17, 'chinchiro game sessions', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS chinchiro_sessions (
    id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,
    stake INTEGER NOT NULL CHECK(stake >= 10 AND stake <= 100000),state_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE (guild_id,user_id));
    CREATE INDEX IF NOT EXISTS idx_chinchiro_channel ON chinchiro_sessions(guild_id,channel_id)`);
});

runMigration(18, 'allow multiple games per channel', () => {
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='game_channels'").get()?.sql || '';
  if (/UNIQUE\s*\(\s*guild_id\s*,\s*channel_id\s*\)/i.test(tableSql)) {
    db.exec(`DROP TABLE IF EXISTS game_channels_v18;
      CREATE TABLE game_channels_v18 (
        guild_id TEXT NOT NULL,
        game TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, game)
      );
      INSERT INTO game_channels_v18(guild_id,game,channel_id,updated_at)
        SELECT guild_id,game,channel_id,updated_at FROM game_channels;
      DROP TABLE game_channels;
      ALTER TABLE game_channels_v18 RENAME TO game_channels`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_game_channels_channel ON game_channels(guild_id, channel_id)');
});

runMigration(19, 'remove default shop listings', () => {
  db.prepare(`UPDATE shop_items SET listed=0,active=0,updated_at=? WHERE created_by='system'`).run(Date.now());
});

runMigration(20, 'daily VTV skips', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS vua_daily_skips (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, day_key TEXT NOT NULL,
    skips_used INTEGER NOT NULL DEFAULT 0 CHECK(skips_used >= 0),
    PRIMARY KEY (guild_id, user_id, day_key)
  )`);
});

runMigration(21, 'multiplayer human dealer blackjack', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS blackjack_tables (
    id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,
    dealer_id TEXT NOT NULL,ante INTEGER NOT NULL,state_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('lobby','playing','completed','expired')),
    expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_blackjack_tables_active ON blackjack_tables(guild_id,status,expires_at);
  CREATE TABLE IF NOT EXISTS blackjack_table_locks (
    guild_id TEXT NOT NULL,user_id TEXT NOT NULL,table_id TEXT NOT NULL,role TEXT NOT NULL,
    created_at INTEGER NOT NULL,PRIMARY KEY(guild_id,user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_blackjack_table_locks_table ON blackjack_table_locks(table_id)`);
});

runMigration(22, 'gacha tickets and player pity', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS gacha_pity (
    guild_id TEXT NOT NULL,user_id TEXT NOT NULL,
    since_sr INTEGER NOT NULL DEFAULT 0,since_ssr INTEGER NOT NULL DEFAULT 0,since_ur INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(guild_id,user_id)
  );
  ALTER TABLE gacha_history ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'diamonds';`);
  const now = Date.now();
  db.prepare(`INSERT INTO user_inventory(guild_id,user_id,item_id,quantity,acquired_at,updated_at)
    SELECT guild_id,user_id,'gacha_ticket_1',free_gacha_pulls,?,? FROM player_currencies WHERE free_gacha_pulls>0
    ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+excluded.quantity,updated_at=excluded.updated_at`).run(now, now);
  db.exec('UPDATE player_currencies SET free_gacha_pulls=0 WHERE free_gacha_pulls>0');
  const streaks = new Map();
  for (const row of db.prepare('SELECT guild_id,user_id,results_json FROM gacha_history ORDER BY id ASC').iterate()) {
    const key = `${row.guild_id}:${row.user_id}`;
    const pity = streaks.get(key) || { guildId: row.guild_id, userId: row.user_id, sr: 0, ssr: 0, ur: 0 };
    for (const result of JSON.parse(row.results_json)) {
      if (result.kind !== 'item') continue;
      pity.sr = ['SR', 'SSR', 'UR'].includes(result.tier) ? 0 : pity.sr + 1;
      pity.ssr = ['SSR', 'UR'].includes(result.tier) ? 0 : pity.ssr + 1;
      pity.ur = result.tier === 'UR' ? 0 : pity.ur + 1;
    }
    streaks.set(key, pity);
  }
  const savePity = db.prepare('INSERT INTO gacha_pity(guild_id,user_id,since_sr,since_ssr,since_ur) VALUES(?,?,?,?,?)');
  for (const pity of streaks.values()) savePity.run(pity.guildId, pity.userId, pity.sr, pity.ssr, pity.ur);
});

runMigration(23, 'remove effect cleanser from gacha pool', () => {
  db.prepare("DELETE FROM gacha_pool_entries WHERE reward_key='effect_cleanser' OR item_id='effect_cleanser'").run();
});

runMigration(24, 'remove Vietnamese first-letter item', () => {
  db.prepare('DELETE FROM user_inventory WHERE item_id=?').run('vietnamese_first_letter');
  db.prepare('DELETE FROM shop_items WHERE cosmetic_id=?').run('vietnamese_first_letter');
  db.prepare('DELETE FROM gacha_pool_entries WHERE item_id=? OR reward_key=?').run('vietnamese_first_letter', 'vietnamese_first_letter');
  db.prepare('DELETE FROM user_item_effects WHERE effect_id=?').run('quiz_first_letter');
});

module.exports = { db, dbPath, runMigration };
