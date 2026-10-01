const crypto = require("node:crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { db } = require("../db");
const {
  getAccount,
  spendCoins,
  settleReservedGame,
  creditCoins,
} = require("./economyService");
const { getGameBetLimit } = require("./gameBetLimitService");
const { formatCoins } = require("../utils/economy");
const {
  resultLine,
  resultBlock,
  bonusLine,
  coins,
} = require("../utils/rewardText");

const INVITE_TTL_MS = 60_000;
const PLAY_TTL_MS = 120_000;
const HANDS = {
  bua: { label: "Búa", emoji: "✊", beats: "keo" },
  keo: { label: "Kéo", emoji: "✌️", beats: "bao" },
  bao: { label: "Bao", emoji: "✋", beats: "bua" },
};

function getDuel(id) {
  return (
    db.prepare("SELECT * FROM rps_duels WHERE id = ?").get(String(id)) || null
  );
}

function createDuel({
  guildId,
  channelId,
  challengerId,
  opponentId,
  stake,
  now = Date.now(),
}) {
  const amount = Number(stake);
  if (!Number.isSafeInteger(amount) || amount < 10 || amount > 100_000)
    throw new Error("INVALID_BET");
  const maxBet = getGameBetLimit(guildId, "oantuti");
  if (amount > maxBet) {
    const error = new Error("BET_LIMIT");
    error.maxBet = maxBet;
    throw error;
  }
  if (String(challengerId) === String(opponentId)) throw new Error("SELF_DUEL");
  const stale = db
    .prepare(
      `SELECT id FROM rps_duels WHERE guild_id = ? AND status IN ('invited','playing') AND expires_at <= ?
    AND (challenger_id IN (?, ?) OR opponent_id IN (?, ?))`,
    )
    .all(
      String(guildId),
      now,
      String(challengerId),
      String(opponentId),
      String(challengerId),
      String(opponentId),
    );
  for (const row of stale) expireDuel(row.id, now);
  const active = db
    .prepare(
      `SELECT * FROM rps_duels WHERE guild_id = ? AND status IN ('invited','playing')
    AND (challenger_id IN (?, ?) OR opponent_id IN (?, ?)) LIMIT 1`,
    )
    .get(
      String(guildId),
      String(challengerId),
      String(opponentId),
      String(challengerId),
      String(opponentId),
    );
  if (active) {
    const error = new Error("ACTIVE_DUEL");
    error.duel = active;
    throw error;
  }
  const challenger = getAccount(guildId, challengerId);
  if (challenger.balance < amount) {
    const error = new Error("INSUFFICIENT_FUNDS");
    error.code = "INSUFFICIENT_FUNDS";
    error.balance = challenger.balance;
    throw error;
  }
  const duel = {
    id: crypto.randomBytes(6).toString("hex"),
    guild_id: String(guildId),
    channel_id: String(channelId),
    message_id: null,
    challenger_id: String(challengerId),
    opponent_id: String(opponentId),
    stake: amount,
    challenger_choice: null,
    opponent_choice: null,
    status: "invited",
    winner_id: null,
    expires_at: now + INVITE_TTL_MS,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO rps_duels
    (id,guild_id,channel_id,message_id,challenger_id,opponent_id,stake,challenger_choice,opponent_choice,status,winner_id,expires_at,created_at,updated_at)
    VALUES (@id,@guild_id,@channel_id,@message_id,@challenger_id,@opponent_id,@stake,@challenger_choice,@opponent_choice,@status,@winner_id,@expires_at,@created_at,@updated_at)`,
  ).run(duel);
  return duel;
}

function setDuelMessage(id, messageId) {
  db.prepare(
    "UPDATE rps_duels SET message_id = ?, updated_at = ? WHERE id = ?",
  ).run(String(messageId), Date.now(), String(id));
}

const acceptTx = db.transaction((id, actorId, now) => {
  const duel = getDuel(id);
  if (!duel || duel.status !== "invited") throw new Error("DUEL_CLOSED");
  if (duel.opponent_id !== String(actorId)) throw new Error("NOT_OPPONENT");
  if (duel.expires_at <= now) {
    db.prepare(
      "UPDATE rps_duels SET status = 'expired', updated_at = ? WHERE id = ?",
    ).run(now, id);
    throw new Error("DUEL_EXPIRED");
  }
  const maxBet = getGameBetLimit(duel.guild_id, "oantuti");
  if (duel.stake > maxBet) {
    const error = new Error("BET_LIMIT");
    error.maxBet = maxBet;
    throw error;
  }
  spendCoins({
    guildId: duel.guild_id,
    userId: duel.challenger_id,
    amount: duel.stake,
    reason: `oantuti-solo:reserve:${duel.id}`,
  });
  spendCoins({
    guildId: duel.guild_id,
    userId: duel.opponent_id,
    amount: duel.stake,
    reason: `oantuti-solo:reserve:${duel.id}`,
  });
  db.prepare(
    "UPDATE rps_duels SET status = 'playing', expires_at = ?, updated_at = ? WHERE id = ?",
  ).run(now + PLAY_TTL_MS, now, id);
  return getDuel(id);
});

function acceptDuel(id, actorId, now = Date.now()) {
  return acceptTx(String(id), String(actorId), now);
}

function declineDuel(id, actorId, now = Date.now()) {
  const duel = getDuel(id);
  if (!duel || duel.status !== "invited") throw new Error("DUEL_CLOSED");
  if (duel.opponent_id !== String(actorId)) throw new Error("NOT_OPPONENT");
  db.prepare(
    "UPDATE rps_duels SET status = 'declined', updated_at = ? WHERE id = ?",
  ).run(now, String(id));
  return getDuel(id);
}

function outcomeFor(first, second) {
  if (first === second) return "draw";
  return HANDS[first].beats === second ? "challenger" : "opponent";
}

const chooseTx = db.transaction((id, actorId, choice, now) => {
  let duel = getDuel(id);
  if (!duel || duel.status !== "playing") throw new Error("DUEL_NOT_PLAYING");
  if (duel.expires_at <= now) throw new Error("DUEL_EXPIRED");
  const column =
    duel.challenger_id === String(actorId)
      ? "challenger_choice"
      : duel.opponent_id === String(actorId)
        ? "opponent_choice"
        : null;
  if (!column) throw new Error("NOT_DUEL_PLAYER");
  if (!HANDS[choice]) throw new Error("INVALID_CHOICE");
  if (duel[column]) throw new Error("ALREADY_CHOSEN");
  db.prepare(
    `UPDATE rps_duels SET ${column} = ?, updated_at = ? WHERE id = ?`,
  ).run(choice, now, id);
  duel = getDuel(id);
  if (!duel.challenger_choice || !duel.opponent_choice)
    return { duel, completed: false };

  const result = outcomeFor(duel.challenger_choice, duel.opponent_choice);
  let challengerOutcome = "draw";
  let opponentOutcome = "draw";
  let winnerId = null;
  if (result === "challenger") {
    challengerOutcome = "win";
    opponentOutcome = "loss";
    winnerId = duel.challenger_id;
  }
  if (result === "opponent") {
    challengerOutcome = "loss";
    opponentOutcome = "win";
    winnerId = duel.opponent_id;
  }
  const challengerPayout =
    result === "draw"
      ? duel.stake
      : result === "challenger"
        ? duel.stake * 2
        : 0;
  const opponentPayout =
    result === "draw" ? duel.stake : result === "opponent" ? duel.stake * 2 : 0;
  const challengerAccount = settleReservedGame({
    guildId: duel.guild_id,
    userId: duel.challenger_id,
    payout: challengerPayout,
    stake: duel.stake,
    game: "oantuti",
    outcome: challengerOutcome,
    operationId: `settle:oantuti-duel:${duel.id}:${duel.challenger_id}`,
  });
  const opponentAccount = settleReservedGame({
    guildId: duel.guild_id,
    userId: duel.opponent_id,
    payout: opponentPayout,
    stake: duel.stake,
    game: "oantuti",
    outcome: opponentOutcome,
    operationId: `settle:oantuti-duel:${duel.id}:${duel.opponent_id}`,
  });
  db.prepare(
    "UPDATE rps_duels SET status = 'completed', winner_id = ?, updated_at = ? WHERE id = ?",
  ).run(winnerId, now, id);
  return {
    duel: getDuel(id),
    completed: true,
    result,
    challengerAccount,
    opponentAccount,
  };
});

function chooseHand(id, actorId, choice, now = Date.now()) {
  return chooseTx(String(id), String(actorId), String(choice), now);
}

const expireTx = db.transaction((id, now) => {
  const duel = getDuel(id);
  if (
    !duel ||
    !["invited", "playing"].includes(duel.status) ||
    duel.expires_at > now
  )
    return null;
  // A player who has not chosen when the duel times out caused the expiry and forfeits the stake; anyone who did act is refunded.
  const forfeited = [];
  if (duel.status === "playing") {
    for (const [userId, choice] of [
      [duel.challenger_id, duel.challenger_choice],
      [duel.opponent_id, duel.opponent_choice],
    ]) {
      if (!choice) {
        forfeited.push(userId);
        continue;
      }
      creditCoins({
        guildId: duel.guild_id,
        userId,
        amount: duel.stake,
        reason: `oantuti-solo:refund:${duel.id}`,
        operationId: `refund:oantuti-duel:${duel.id}:${userId}`,
      });
    }
  }
  db.prepare(
    "UPDATE rps_duels SET status = 'expired', updated_at = ? WHERE id = ?",
  ).run(now, id);
  return {
    ...duel,
    status: "expired",
    refunded: duel.status === "playing" && forfeited.length < 2,
    forfeited,
  };
});

function expireDuel(id, now = Date.now()) {
  return expireTx(String(id), now);
}

function forceEndRpsDuel(
  id,
  guildId,
  adminId,
  now = Date.now(),
  { forfeitUserId = null } = {},
) {
  return db.transaction(() => {
    const duel = getDuel(id);
    if (
      !duel ||
      duel.guild_id !== String(guildId) ||
      !["invited", "playing"].includes(duel.status)
    )
      return null;
    const refunded = duel.status === "playing";
    if (refunded)
      for (const userId of [duel.challenger_id, duel.opponent_id]) {
        if (userId === String(forfeitUserId)) continue;
        creditCoins({
          guildId: duel.guild_id,
          userId,
          amount: duel.stake,
          reason: `oantuti-solo:admin-refund:${adminId}:${duel.id}`,
          operationId: `refund:oantuti-duel:${duel.id}:${userId}`,
        });
      }
    db.prepare(
      "UPDATE rps_duels SET status = 'expired', updated_at = ? WHERE id = ?",
    ).run(now, duel.id);
    return {
      session: duel,
      participants: [duel.challenger_id, duel.opponent_id],
      refunded,
      gameName: "OẲN TÙ TÌ",
    };
  })();
}

function duelEmbed(duel, settlement = null) {
  const color =
    duel.status === "completed"
      ? 0x2ecc71
      : duel.status === "playing"
        ? 0x3498db
        : duel.status === "invited"
          ? 0xf1c40f
          : 0x7f8c8d;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("⚔️ OẲN TÙ TÌ · SOLO")
    .setDescription(
      `### <@${duel.challenger_id}>  ⚡  <@${duel.opponent_id}>\n**${formatCoins(duel.stake)} :coin:/người** · Tổng thưởng **${formatCoins(duel.stake * 2)} :coin:**`,
    );
  if (duel.status === "invited")
    embed.addFields({
      name: "📨 Lời thách đấu",
      value: `Đang chờ đối thủ phản hồi · <t:${Math.floor(duel.expires_at / 1000)}:R>`,
    });
  if (duel.status === "playing")
    embed.addFields(
      {
        name: "🔵 NGƯỜI THÁCH ĐẤU",
        value: `<@${duel.challenger_id}>\n${duel.challenger_choice ? "✅ Đã khóa lựa chọn" : "🎮 Đang lựa chọn"}`,
        inline: true,
      },
      {
        name: "🔴 ĐỐI THỦ",
        value: `<@${duel.opponent_id}>\n${duel.opponent_choice ? "✅ Đã khóa lựa chọn" : "🎮 Đang lựa chọn"}`,
        inline: true,
      },
      {
        name: "⏱️ Thời gian",
        value: `Kết thúc <t:${Math.floor(duel.expires_at / 1000)}:R> · Lựa chọn được giữ bí mật.`,
      },
    );
  if (duel.status === "completed") {
    const draw = !duel.winner_id;
    embed.addFields(
      {
        name: "🔵 NGƯỜI THÁCH ĐẤU",
        value: `### <@${duel.challenger_id}>\n# ${HANDS[duel.challenger_choice].emoji} ${HANDS[duel.challenger_choice].label}`,
        inline: true,
      },
      {
        name: "🔴 ĐỐI THỦ",
        value: `### <@${duel.opponent_id}>\n# ${HANDS[duel.opponent_choice].emoji} ${HANDS[duel.opponent_choice].label}`,
        inline: true,
      },
      {
        name: draw ? "🤝 KẾT QUẢ" : "🏆 KẾT QUẢ",
        value: [
          [duel.challenger_id, settlement?.challengerAccount],
          [duel.opponent_id, settlement?.opponentAccount],
        ]
          .map(([id, account]) => {
            const outcome = draw
              ? "draw"
              : String(duel.winner_id) === String(id)
                ? "win"
                : "loss";
            return resultBlock({
              userId: id,
              outcome,
              stake: duel.stake,
              payout:
                outcome === "win"
                  ? duel.stake * 2
                  : outcome === "draw"
                    ? duel.stake
                    : 0,
              result: account || {},
            });
          })
          .join("\n"),
      },
    );
  }
  if (duel.status === "declined")
    embed.addFields({
      name: "Kết quả",
      value: "❌ Đối thủ đã từ chối lời thách đấu.",
    });
  if (duel.status === "expired")
    embed.addFields({
      name: "Kết quả",
      value:
        "⌛ Ván đã hết hạn." +
        (duel.forfeited?.length
          ? ` ${duel.forfeited.map((id) => `<@${id}>`).join(", ")} không chọn kịp nên **mất tiền cược**${duel.refunded ? "; người còn lại được hoàn tiền" : ""}.`
          : duel.refunded
            ? " Tiền cược đã được hoàn."
            : ""),
    });
  return embed.setFooter({
    text: `Mã trận ${duel.id} · Kéo thắng Bao · Bao thắng Búa · Búa thắng Kéo`,
  });
}

function inviteButtons(id) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rpsduel:${id}:accept`)
        .setLabel("Chấp nhận")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`rpsduel:${id}:decline`)
        .setLabel("Từ chối")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function handButtons(id) {
  return [
    new ActionRowBuilder().addComponents(
      ...Object.entries(HANDS).map(([key, hand]) =>
        new ButtonBuilder()
          .setCustomId(`rpsduel:${id}:choose:${key}`)
          .setLabel(hand.label)
          .setEmoji(hand.emoji)
          .setStyle(ButtonStyle.Primary),
      ),
    ),
  ];
}
function replayButtons(duel) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `replay:rpsduel:${duel.stake}:${duel.challenger_id}:${duel.opponent_id}`,
        )
        .setLabel("Tái đấu")
        .setEmoji("🔁")
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

async function handleRpsDuelButton(interaction) {
  const [, id, action, choice] = interaction.customId.split(":");
  let duel = getDuel(id);
  if (
    !duel ||
    duel.guild_id !== interaction.guildId ||
    duel.channel_id !== interaction.channelId
  ) {
    return interaction.reply({
      content: "Ván đấu này không còn tồn tại.",
      flags: MessageFlags.Ephemeral,
    });
  }
  if (
    duel.expires_at <= Date.now() &&
    ["invited", "playing"].includes(duel.status)
  ) {
    duel = expireDuel(id) || duel;
    return interaction.update({ embeds: [duelEmbed(duel)], components: [] });
  }
  try {
    if (action === "decline") {
      duel = declineDuel(id, interaction.user.id);
      return interaction.update({ embeds: [duelEmbed(duel)], components: [] });
    }
    if (action === "accept") {
      duel = acceptDuel(id, interaction.user.id);
      return interaction.update({
        content: null,
        embeds: [duelEmbed(duel)],
        components: handButtons(id),
        allowedMentions: { parse: [] },
      });
    }
    if (action === "choose") {
      const result = chooseHand(id, interaction.user.id, choice);
      return interaction.update({
        embeds: [duelEmbed(result.duel, result)],
        components: result.completed
          ? replayButtons(result.duel)
          : handButtons(id),
        allowedMentions: { parse: [] },
      });
    }
  } catch (error) {
    if (error.message === "BET_LIMIT")
      return interaction.reply({
        content: `Giới hạn cược Oẳn tù tì hiện tại là **${formatCoins(error.maxBet)} :coin:**.`,
        flags: MessageFlags.Ephemeral,
      });
    if (error.code === "INSUFFICIENT_FUNDS")
      return interaction.reply({
        content: "Một người chơi không đủ xu để tham gia ván này.",
        flags: MessageFlags.Ephemeral,
      });
    const messages = {
      NOT_OPPONENT: "Chỉ người được thách đấu mới có thể quyết định.",
      DUEL_CLOSED: "Lời thách đấu này đã được xử lý.",
      DUEL_NOT_PLAYING: "Ván đấu chưa bắt đầu hoặc đã kết thúc.",
      NOT_DUEL_PLAYER: "Chỉ hai người trong ván mới được chọn.",
      ALREADY_CHOSEN: "Bạn đã chọn rồi, không thể đổi lựa chọn.",
      DUEL_EXPIRED: "Ván đấu đã hết hạn.",
    };
    if (messages[error.message])
      return interaction.reply({
        content: messages[error.message],
        flags: MessageFlags.Ephemeral,
      });
    throw error;
  }
}

async function expireDueDuels(client, logger = console, now = Date.now()) {
  const due = db
    .prepare(
      "SELECT id FROM rps_duels WHERE status IN ('invited','playing') AND expires_at <= ?",
    )
    .all(now);
  let expired = 0;
  for (const row of due) {
    const duel = expireDuel(row.id, now);
    if (!duel) continue;
    expired += 1;
    if (!duel.message_id) continue;
    try {
      const channel = await client.channels.fetch(duel.channel_id);
      const message = channel?.isTextBased?.()
        ? await channel.messages.fetch(duel.message_id)
        : null;
      if (message)
        await message.edit({ embeds: [duelEmbed(duel)], components: [] });
    } catch (error) {
      if (error?.code !== 10003 && error?.code !== 10008)
        logger.warn?.(
          { err: error, duelId: duel.id },
          "could not update expired rps duel",
        );
    }
  }
  return expired;
}

function startRpsDuelMaintenance(client, logger = console) {
  const run = () =>
    expireDueDuels(client, logger).catch((error) =>
      logger.error?.({ err: error }, "rps duel maintenance failed"),
    );
  run();
  const timer = setInterval(run, 15_000);
  timer.unref?.();
  return timer;
}

module.exports = {
  INVITE_TTL_MS,
  PLAY_TTL_MS,
  HANDS,
  getDuel,
  createDuel,
  setDuelMessage,
  acceptDuel,
  declineDuel,
  chooseHand,
  outcomeFor,
  expireDuel,
  forceEndRpsDuel,
  duelEmbed,
  inviteButtons,
  handButtons,
  replayButtons,
  handleRpsDuelButton,
  expireDueDuels,
  startRpsDuelMaintenance,
};
