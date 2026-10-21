const crypto = require("node:crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { db } = require("../db");
const { formatCoins } = require("../utils/economy");

const SIZE = 4;
const TARGET_TILE = 2048;
const DIRECTIONS = Object.freeze(["up", "down", "left", "right"]);
// Không có cược nên thưởng tính từ điểm; trần giữ cho một ván không vượt quá giá trị hợp lý.
const COINS_PER_SCORE = 1 / 30;
const MAX_SCORE_COINS = 1_000;
const TARGET_BONUS_COINS = 150;
const EXP_PER_SCORE = 1 / 250;
const MAX_EXP = 60;

function rewardFor(score, maxTile) {
  const safeScore = Math.max(0, Math.floor(Number(score) || 0));
  const coins =
    Math.min(MAX_SCORE_COINS, Math.floor(safeScore * COINS_PER_SCORE)) +
    (maxTile >= TARGET_TILE ? TARGET_BONUS_COINS : 0);
  const exp = Math.min(MAX_EXP, Math.floor(safeScore * EXP_PER_SCORE));
  return { coins, exp };
}

function emptyCells(board) {
  const cells = [];
  board.forEach((value, index) => {
    if (!value) cells.push(index);
  });
  return cells;
}

function spawnTile(board, random = (n) => crypto.randomInt(n)) {
  const cells = emptyCells(board);
  if (!cells.length) return board;
  const next = board.slice();
  next[cells[random(cells.length)]] = random(10) === 0 ? 4 : 2;
  return next;
}

function newBoard(random) {
  return spawnTile(spawnTile(new Array(SIZE * SIZE).fill(0), random), random);
}

// Trả về các "đường" theo chiều dồn: phần tử đầu là ô sát mép mà gạch trượt tới.
function lineIndices(direction) {
  const lines = [];
  for (let a = 0; a < SIZE; a += 1) {
    const line = [];
    for (let b = 0; b < SIZE; b += 1) {
      const row = direction === "up" || direction === "down" ? b : a;
      const column = direction === "up" || direction === "down" ? a : b;
      line.push(row * SIZE + column);
    }
    lines.push(
      direction === "down" || direction === "right" ? line.reverse() : line,
    );
  }
  return lines;
}

function slideLine(values) {
  const tiles = values.filter(Boolean);
  const merged = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i] === tiles[i + 1]) {
      merged.push(tiles[i] * 2);
      gained += tiles[i] * 2;
      i += 1;
    } else merged.push(tiles[i]);
  }
  while (merged.length < SIZE) merged.push(0);
  return { values: merged, gained };
}

function shift(board, direction) {
  if (!DIRECTIONS.includes(direction)) throw new Error("INVALID_DIRECTION");
  const next = board.slice();
  let gained = 0;
  for (const line of lineIndices(direction)) {
    const result = slideLine(line.map((index) => board[index]));
    gained += result.gained;
    line.forEach((index, i) => {
      next[index] = result.values[i];
    });
  }
  return { board: next, gained, moved: next.some((v, i) => v !== board[i]) };
}

function canMove(board) {
  return DIRECTIONS.some((direction) => shift(board, direction).moved);
}

function maxTile(board) {
  return Math.max(0, ...board);
}

function applyMove(state, direction, random) {
  const result = shift(state.board, direction);
  if (!result.moved) return null;
  const board = spawnTile(result.board, random);
  const tile = Math.max(state.maxTile || 0, maxTile(board));
  return {
    ...state,
    board,
    score: state.score + result.gained,
    moves: state.moves + 1,
    maxTile: tile,
    gameOver: !canMove(board),
  };
}

// ---- Hiển thị -------------------------------------------------------------
const KEYCAPS = Object.freeze(
  Array.from({ length: 10 }, (_, digit) => `${digit}️⃣`),
);
const REGIONAL_K = "\u{1F1F0}";
const TILE_COLORS = Object.freeze({
  0: "⬛",
  2: "⬜",
  4: "🟨",
  8: "🟧",
  16: "🟥",
  32: "🟪",
  64: "🟦",
  128: "🟩",
  256: "🟫",
  512: "🟠",
  1024: "🔵",
  2048: "🟡",
});

function tileLabel(value) {
  // Ô ≥ 1000 viết gọn dạng 2K để vẫn vừa 3 emoji; 6 chữ số không xuất hiện trong thực tế.
  const text = value >= 1000 ? `${Math.floor(value / 1000)}` : String(value);
  const digits = [...text].map((d) => KEYCAPS[Number(d)]);
  return value >= 1000 && digits.length < 3 ? [...digits, REGIONAL_K] : digits;
}

function tileCell(value) {
  const color = TILE_COLORS[value] || "🌟";
  if (!value) return `${color}${color}${color}`;
  const label = tileLabel(value).slice(0, 3);
  const pad = 3 - label.length;
  const left = Math.floor(pad / 2);
  return color.repeat(left) + label.join("") + color.repeat(pad - left);
}

function boardText(board) {
  const rows = [];
  for (let row = 0; row < SIZE; row += 1)
    rows.push(
      board
        .slice(row * SIZE, row * SIZE + SIZE)
        .map(tileCell)
        .join("⬛"),
    );
  return rows.join("\n\n");
}

function renderPayload(state, userId, sessionId, result = null) {
  const finished = Boolean(result);
  const preview = rewardFor(state.score, state.maxTile);
  const embed = new EmbedBuilder()
    .setColor(
      finished ? 0x7f8c8d : state.maxTile >= TARGET_TILE ? 0xf1c40f : 0xedc22e,
    )
    .setTitle(finished ? "🏁 2048 · KẾT THÚC" : "🔢 2048")
    .setDescription(
      finished
        ? `<@${userId}> kết thúc với **${formatCoins(state.score)}** điểm.`
        : `<@${userId}> dồn các ô giống nhau để chạm **${TARGET_TILE}**. Bấm 🏁 để chốt điểm và nhận thưởng.`,
    )
    .addFields(
      { name: "Điểm", value: formatCoins(state.score), inline: true },
      { name: "Ô cao nhất", value: formatCoins(state.maxTile), inline: true },
      { name: "Số nước", value: formatCoins(state.moves), inline: true },
      finished
        ? {
            name: "Thưởng",
            value: `+${formatCoins(result.coins)} :coin: · +${formatCoins(result.exp)} EXP${result.leveledUp ? " · 🎉 Lên cấp!" : ""}`,
            inline: false,
          }
        : {
            name: "Nếu kết thúc bây giờ",
            value: `+${formatCoins(preview.coins)} :coin: · +${formatCoins(preview.exp)} EXP`,
            inline: false,
          },
    );
  if (!finished && state.gameOver)
    embed.setFooter({ text: "Hết nước đi — ván sẽ được chốt." });
  return {
    content: boardText(state.board),
    embeds: [embed],
    components: finished ? [] : controlRows(sessionId),
    allowedMentions: { parse: [] },
  };
}

function controlRows(sessionId) {
  const button = (action, emoji, style = ButtonStyle.Primary) =>
    new ButtonBuilder()
      .setCustomId(`g2048:${sessionId}:${action}`)
      .setEmoji(emoji)
      .setStyle(style);
  const blank = (id) =>
    new ButtonBuilder()
      .setCustomId(`g2048:${sessionId}:blank${id}`)
      .setLabel("​")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);
  return [
    new ActionRowBuilder().addComponents(
      blank(1),
      button("up", "⬆️"),
      blank(2),
    ),
    new ActionRowBuilder().addComponents(
      button("left", "⬅️"),
      button("down", "⬇️"),
      button("right", "➡️"),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`g2048:${sessionId}:end`)
        .setLabel("Kết thúc")
        .setEmoji("🏁")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

// ---- Phiên chơi -----------------------------------------------------------
function getSession(id) {
  return (
    db
      .prepare("SELECT * FROM game2048_sessions WHERE id = ?")
      .get(String(id)) || null
  );
}
function getGame2048ByUser(guildId, userId) {
  return (
    db
      .prepare(
        "SELECT * FROM game2048_sessions WHERE guild_id = ? AND user_id = ?",
      )
      .get(String(guildId), String(userId)) || null
  );
}
const parseState = (session) => JSON.parse(session.state_json);
function saveState(session, state) {
  db.prepare(
    "UPDATE game2048_sessions SET state_json = ?, updated_at = ? WHERE id = ?",
  ).run(JSON.stringify(state), Date.now(), session.id);
}
function setMessageId(id, messageId) {
  db.prepare(
    "UPDATE game2048_sessions SET message_id = ?, updated_at = ? WHERE id = ?",
  ).run(String(messageId), Date.now(), String(id));
}

function startGame2048({ guildId, userId, channelId, random }) {
  if (getGame2048ByUser(guildId, userId)) throw new Error("ACTIVE_SESSION");
  const id = crypto.randomBytes(5).toString("hex");
  const state = {
    board: newBoard(random),
    score: 0,
    moves: 0,
    maxTile: 2,
    gameOver: false,
  };
  state.maxTile = maxTile(state.board);
  const now = Date.now();
  db.prepare(
    `INSERT INTO game2048_sessions(id,guild_id,user_id,channel_id,message_id,state_json,created_at,updated_at)
    VALUES(?,?,?,?,NULL,?,?,?)`,
  ).run(
    id,
    String(guildId),
    String(userId),
    String(channelId),
    JSON.stringify(state),
    now,
    now,
  );
  return { session: getSession(id), state };
}

// Chốt ván: xóa phiên và trả thưởng trong cùng transaction để bấm hai lần không nhận đôi.
function settleSession(session, label = "end") {
  const state = parseState(session);
  const reward = rewardFor(state.score, state.maxTile);
  return db.transaction(() => {
    const removed = db
      .prepare("DELETE FROM game2048_sessions WHERE id = ?")
      .run(session.id).changes;
    if (!removed) return null;
    let leveledUp = false;
    if (reward.coins > 0) {
      require("./economyService").rewardGame({
        guildId: session.guild_id,
        userId: session.user_id,
        amount: reward.coins,
        game: "2048",
        outcome: state.maxTile >= TARGET_TILE ? "win" : "draw",
      });
    }
    if (reward.exp > 0) {
      const progress = require("./playerLevelService").addExperience(
        session.guild_id,
        session.user_id,
        reward.exp,
        { reason: `game:2048:${label}` },
      );
      leveledUp = Boolean(progress.levelUps?.length);
    }
    return { state, ...reward, leveledUp, label };
  })();
}

function play2048({ sessionId, userId, action, random }) {
  const session = getSession(sessionId);
  if (!session || session.user_id !== String(userId))
    throw new Error("SESSION_NOT_FOUND");
  const state = parseState(session);
  if (action === "end") return { result: settleSession(session), state };
  const next = applyMove(state, action, random);
  if (!next) throw new Error("NO_CHANGE");
  if (next.gameOver)
    return {
      result: settleSession(
        { ...session, state_json: JSON.stringify(next) },
        "over",
      ),
      state: next,
    };
  saveState(session, next);
  return { result: null, state: next };
}

function forceEndGame2048(id, guildId, adminId, { label = "admin" } = {}) {
  const session = db
    .prepare("SELECT * FROM game2048_sessions WHERE id = ? AND guild_id = ?")
    .get(String(id), String(guildId));
  if (!session) return null;
  const result = settleSession(session, label);
  if (!result) return null;
  return {
    session,
    state: result.state,
    result,
    participants: [session.user_id],
    forfeited: 0,
  };
}

async function handleGame2048Button(interaction) {
  const [, sessionId, action] = interaction.customId.split(":");
  const session = getSession(sessionId);
  if (
    !session ||
    session.guild_id !== interaction.guildId ||
    session.channel_id !== interaction.channelId
  )
    return interaction.reply({
      content: "Ván 2048 đã kết thúc hoặc nút không còn hợp lệ.",
      flags: MessageFlags.Ephemeral,
    });
  if (session.user_id !== interaction.user.id)
    return interaction.reply({
      content: "Đây là ván 2048 của người chơi khác.",
      flags: MessageFlags.Ephemeral,
    });
  try {
    const played = play2048({
      sessionId,
      userId: interaction.user.id,
      action,
    });
    return interaction.update(
      renderPayload(
        played.state,
        interaction.user.id,
        sessionId,
        played.result,
      ),
    );
  } catch (error) {
    return interaction.reply({
      content:
        error.message === "NO_CHANGE"
          ? "Không có ô nào di chuyển theo hướng này."
          : "Không thể thực hiện thao tác này.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = {
  SIZE,
  TARGET_TILE,
  MAX_SCORE_COINS,
  TARGET_BONUS_COINS,
  MAX_EXP,
  rewardFor,
  newBoard,
  spawnTile,
  slideLine,
  shift,
  canMove,
  applyMove,
  tileCell,
  boardText,
  renderPayload,
  getGame2048ByUser,
  startGame2048,
  setMessageId,
  play2048,
  forceEndGame2048,
  handleGame2048Button,
};
