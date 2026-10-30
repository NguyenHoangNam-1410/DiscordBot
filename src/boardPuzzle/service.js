const crypto = require("node:crypto");
const { db } = require("../db");
const {
  channelHasGame,
  isGameMaintenance,
} = require("../services/gameChannelService");
const { getGameReward } = require("../services/gameRewardService");
const { rewardGame } = require("../services/economyService");

function createBoardPuzzleService({
  prefix,
  game,
  name,
  idPrefix,
  engine,
  loadPuzzle,
  view,
  allowRepeats = false,
}) {
  if (!["chess", "xiangqi"].includes(prefix))
    throw new Error("INVALID_BOARD_PUZZLE_TABLE");
  const { checkAnswer, validatePuzzle } = engine;
  const { boardImage, roundEmbed } = view;
  const TTL = 60 * 60_000;
  const LOCK_TTL = 60_000;
  function getRound(id) {
    return (
      db.prepare(`SELECT * FROM ${prefix}_rounds WHERE id=?`).get(id) || null
    );
  }
  function currentRound(guildId, channelId) {
    return (
      db
        .prepare(
          `SELECT * FROM ${prefix}_rounds WHERE guild_id=? AND channel_id=? AND status='open'`,
        )
        .get(String(guildId), String(channelId)) || null
    );
  }
  function latestRound(guildId, channelId) {
    return (
      db
        .prepare(
          `SELECT * FROM ${prefix}_rounds WHERE guild_id=? AND channel_id=? ORDER BY (status='open') DESC,created_at DESC,rowid DESC LIMIT 1`,
        )
        .get(String(guildId), String(channelId)) || null
    );
  }
  function hasSolved(guildId, userId, puzzleId) {
    return (
      allowRepeats &&
      Boolean(
        db
          .prepare(
            `SELECT 1 FROM ${prefix}_awards WHERE guild_id=? AND user_id=? AND puzzle_id=?`,
          )
          .get(String(guildId), String(userId), puzzleId),
      )
    );
  }
  function expireRounds(now = Date.now()) {
    return db
      .prepare(
        `UPDATE ${prefix}_rounds SET status='expired',closed_at=? WHERE status='open' AND expires_at<=?`,
      )
      .run(now, now).changes;
  }
  function assertChannel(guildId, channelId) {
    if (!channelHasGame(guildId, channelId, game))
      throw new Error("CHESS_CHANNEL_REQUIRED");
    if (isGameMaintenance(guildId, game)) throw new Error("CHESS_MAINTENANCE");
  }
  function assertNoOtherBoard(guildId, channelId) {
    const other = prefix === "chess" ? "xiangqi" : "chess";
    if (
      db
        .prepare(
          `SELECT 1 FROM ${other}_rounds WHERE guild_id=? AND channel_id=? AND status='open' AND expires_at>?`,
        )
        .get(String(guildId), String(channelId), Date.now())
    )
      throw new Error("BOARD_CHANNEL_BUSY");
  }

  async function startRound({
    guildId,
    channelId,
    userId,
    replace = false,
    puzzleLoader = loadPuzzle,
  }) {
    assertChannel(guildId, channelId);
    const guild = String(guildId),
      channel = String(channelId);
    const token = crypto.randomUUID();
    const reserved = db.transaction(() => {
      expireRounds();
      assertNoOtherBoard(guild, channel);
      const old = currentRound(guild, channel);
      if (old && !replace) return { existing: old };
      db.prepare(`DELETE FROM ${prefix}_channel_locks WHERE expires_at<=?`).run(
        Date.now(),
      );
      const inserted = db
        .prepare(
          `INSERT OR IGNORE INTO ${prefix}_channel_locks(guild_id,channel_id,token,expires_at) VALUES(?,?,?,?)`,
        )
        .run(guild, channel, token, Date.now() + LOCK_TTL).changes;
      if (!inserted) throw new Error("CHESS_LOADING");
      return { old };
    })();
    if (reserved.existing) return reserved;
    try {
      const puzzle = validatePuzzle(
        await puzzleLoader({
          seen: (id) =>
            Boolean(
              db
                .prepare(
                  `SELECT 1 FROM ${prefix}_rounds WHERE guild_id=? AND puzzle_id=?`,
                )
                .get(guild, id),
            ),
        }),
      );
      const image = boardImage(puzzle);
      return db.transaction(() => {
        const now = Date.now();
        const lock = db
          .prepare(
            `SELECT token,expires_at FROM ${prefix}_channel_locks WHERE guild_id=? AND channel_id=?`,
          )
          .get(guild, channel);
        if (lock?.token !== token || lock.expires_at <= now)
          throw new Error("CHESS_LOADING");
        assertChannel(guild, channel);
        assertNoOtherBoard(guild, channel);
        const old = currentRound(guild, channel);
        // A correct answer received during the API request must not be replaced.
        if ((old?.id || null) !== (reserved.old?.id || null))
          throw new Error("CHESS_CHANGED");
        if (old)
          db.prepare(
            `UPDATE ${prefix}_rounds SET status='skipped',closed_at=? WHERE id=? AND status='open'`,
          ).run(now, old.id);
        const id = `${idPrefix}${crypto.randomBytes(6).toString("hex")}`;
        const reward = getGameReward(guild, game) * puzzle.mate ** 2;
        db.prepare(
          `INSERT INTO ${prefix}_rounds(id,guild_id,channel_id,created_by,puzzle_id,puzzle_json,mate,reward,status,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,'open',?,?)`,
        ).run(
          id,
          guild,
          channel,
          String(userId),
          puzzle.id,
          JSON.stringify(puzzle),
          puzzle.mate,
          reward,
          now,
          now + TTL,
        );
        return { round: currentRound(guild, channel), previous: old, image };
      })();
    } finally {
      db.prepare(
        `DELETE FROM ${prefix}_channel_locks WHERE guild_id=? AND channel_id=? AND token=?`,
      ).run(guild, channel, token);
    }
  }

  function publicationFailed(result) {
    db.transaction(() => {
      const changed = db
        .prepare(
          `UPDATE ${prefix}_rounds SET status='delivery_failed',closed_at=? WHERE id=? AND status='open' AND message_id IS NULL`,
        )
        .run(Date.now(), result.round.id).changes;
      if (
        changed &&
        result.previous &&
        result.previous.expires_at > Date.now() &&
        !currentRound(result.previous.guild_id, result.previous.channel_id)
      ) {
        db.prepare(
          `UPDATE ${prefix}_rounds SET status='open',closed_at=NULL,ui_closed=0 WHERE id=? AND status='skipped'`,
        ).run(result.previous.id);
      }
    })();
  }
  function attachMessage(id, messageId) {
    db.prepare(
      `UPDATE ${prefix}_rounds SET message_id=?,ui_closed=0 WHERE id=?`,
    ).run(String(messageId), id);
  }

  function solveRound({
    guildId,
    channelId,
    userId,
    messageId,
    text,
    now = Date.now(),
  }) {
    return db.transaction(() => {
      assertChannel(guildId, channelId);
      const round = currentRound(guildId, channelId);
      if (!round) return null;
      if (round.expires_at <= now) {
        db.prepare(
          `UPDATE ${prefix}_rounds SET status='expired',closed_at=? WHERE id=? AND status='open'`,
        ).run(now, round.id);
        return null;
      }
      const answer = checkAnswer(JSON.parse(round.puzzle_json), text);
      if (!answer) return null;
      if (hasSolved(guildId, userId, round.puzzle_id))
        return { alreadySolved: true, round };
      const claimed = db
        .prepare(
          `UPDATE ${prefix}_rounds SET status='won',closed_at=?,winner_id=?,answer_message_id=?,answer_uci=?
      WHERE id=? AND status='open' AND expires_at>?`,
        )
        .run(
          now,
          String(userId),
          String(messageId),
          answer.line.join(" "),
          round.id,
          now,
        ).changes;
      if (!claimed) return null;
      if (allowRepeats)
        db.prepare(
          `INSERT INTO ${prefix}_awards(guild_id,user_id,puzzle_id,round_id,created_at) VALUES(?,?,?,?,?)`,
        ).run(String(guildId), String(userId), round.puzzle_id, round.id, now);
      db.prepare(
        `INSERT INTO ${prefix}_records(guild_id,user_id,solved,best_mate,updated_at) VALUES(?,?,1,?,?)
      ON CONFLICT(guild_id,user_id) DO UPDATE SET solved=solved+1,best_mate=MAX(best_mate,excluded.best_mate),updated_at=excluded.updated_at`,
      ).run(String(guildId), String(userId), round.mate, now);
      // Claim, wallet, missions, experience and achievements commit together.
      const account = rewardGame({
        guildId,
        userId,
        amount: round.reward,
        game: game,
        outcome: "win",
      });
      return {
        round: {
          ...round,
          status: "won",
          winner_id: String(userId),
          answer_uci: answer.line.join(" "),
        },
        account,
        answer,
      };
    })();
  }

  async function updateBoard(client, round, logger = console) {
    // Re-read after network waits so a restored/won board is never shown as skipped.
    if (round?.id)
      round =
        db.prepare(`SELECT * FROM ${prefix}_rounds WHERE id=?`).get(round.id) ||
        round;
    if (!round?.message_id) return;
    try {
      const channel = await client.channels.fetch(round.channel_id);
      const message = await channel?.messages?.fetch(round.message_id);
      if (message)
        await message.edit({
          embeds: [roundEmbed(round)],
          components: [],
          allowedMentions: { parse: [] },
        });
    } catch (error) {
      if (![10003, 10008, 50001, 50013].includes(error.code))
        logger.warn?.(
          { code: error.code || error.name, roundId: round.id },
          "could not update chess board",
        );
    } finally {
      // Do not repeatedly hit Discord when an old message is gone or access is denied.
      if (round.status !== "open")
        db.prepare(
          `UPDATE ${prefix}_rounds SET ui_closed=1 WHERE id=? AND status=?`,
        ).run(round.id, round.status);
    }
  }

  async function handleMessage(message, logger = console) {
    if (
      !message.guildId ||
      message.author?.bot ||
      !channelHasGame(message.guildId, message.channelId, game) ||
      isGameMaintenance(message.guildId, game)
    )
      return false;
    await engine.initialize?.();
    const result = solveRound({
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      messageId: message.id,
      text: message.content,
    });
    if (!result) return false;
    if (result.alreadySolved) {
      try {
        await message.react("♻️");
      } catch {}
      return true;
    }
    // Reaction/reply can each be forbidden independently. Discord failure never undoes a committed reward.
    try {
      await message.react("✅");
    } catch (error) {
      logger.warn?.(
        { code: error.code || error.name },
        "could not react to chess solution",
      );
    }
    try {
      await message.reply({
        content:
          `🏆 <@${message.author.id}> giải đúng **mate ${result.round.mate}**: **+${result.round.reward.toLocaleString("vi-VN")} xu**!\n` +
          `${game === "cotuong" ? "ICCS" : "UCI"} của bạn: \`${result.answer.playerMoves.join(" ")}\`\nLời giải hai bên: \`${result.answer.line.join(" ")}\`` +
          (result.account.unlockedAchievements.length
            ? `\n🏅 Mở ${result.account.unlockedAchievements.length} thành tựu. Nhận thưởng tại \`/nhiemvu kiemtra\`.`
            : ""),
        allowedMentions: { users: [message.author.id], repliedUser: false },
      });
    } catch (error) {
      logger.warn?.(
        { code: error.code || error.name },
        "could not announce chess winner",
      );
    }
    await updateBoard(message.client, result.round, logger);
    return true;
  }

  function forceEndRound(id, guildId) {
    const round = db
      .prepare(
        `SELECT * FROM ${prefix}_rounds WHERE id=? AND guild_id=? AND status='open'`,
      )
      .get(String(id), String(guildId));
    if (!round) return null;
    db.prepare(
      `UPDATE ${prefix}_rounds SET status='admin_closed',closed_at=? WHERE id=? AND status='open'`,
    ).run(Date.now(), round.id);
    return {
      session: round,
      participants: [],
      gameName: name.toUpperCase(),
      chess: game === "covua",
      xiangqi: game === "cotuong",
    };
  }

  function startMaintenance(client, logger = console) {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        expireRounds();
        // Clean up an unpublished board left by a process crash, without blocking its channel for an hour.
        db.prepare(
          `UPDATE ${prefix}_rounds SET status='delivery_failed',closed_at=? WHERE status='open' AND message_id IS NULL AND created_at<?`,
        ).run(Date.now(), Date.now() - 120_000);
        const closed = db
          .prepare(
            `SELECT * FROM ${prefix}_rounds WHERE status<>'open' AND ui_closed=0 AND message_id IS NOT NULL LIMIT 50`,
          )
          .all();
        for (const row of closed) await updateBoard(client, row, logger);
      } catch (error) {
        logger.error?.(
          { code: error.code || error.name },
          "chess maintenance failed",
        );
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(run, 15_000);
    timer.unref?.();
    return timer;
  }

  return {
    TTL,
    currentRound,
    getRound,
    hasSolved,
    latestRound,
    expireRounds,
    startRound,
    publicationFailed,
    attachMessage,
    solveRound,
    updateBoard,
    handleMessage,
    forceEndRound,
    startMaintenance,
  };
}
module.exports = { createBoardPuzzleService };
