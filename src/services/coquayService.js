const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { db } = require('../db');
const { spendCoins, settleReservedGame, creditCoins } = require('./economyService');
const { formatCoins } = require('../utils/economy');
const { getGameBetLimit } = require('./gameBetLimitService');
const { createFairness, fairInt } = require('./fairnessService');
const { consumeInventory, getInventoryQuantity } = require('./shopService');
const { addExperienceField } = require('../utils/progressionView');
const engine = require('./coquayEngine');

const MIN_BET = 10;
const MAX_BET = 100_000;
// Người chơi đi trước; đánh tối ưu không dùng vật phẩm thắng ~55,5% → RTP ~111% (có lợi cho người chơi giỏi); ván thường thấp hơn.
const PAYOUT_MULTIPLIER = 2;
const ITEMS = Object.freeze({
  magnifier: { itemId: 'coquay_magnifier', name: 'Kính Lúp', emoji: '🔍' },
  shield: { itemId: 'coquay_decoy', name: 'Bia Đỡ Đạn', emoji: '🪖' },
  saw: { itemId: 'coquay_saw', name: 'Cưa Cầm Tay', emoji: '🪚' },
  cuffs: { itemId: 'coquay_cuffs', name: 'Còng Số 8', emoji: '⛓️' },
});
const LIVE = '🔴'; const BLANK = '⚪';

function rngFor(state) {
  return (maximum, label = 'roll') => {
    if (maximum <= 1) return 0;
    state.fairCounter = (state.fairCounter || 0) + 1;
    return state.fair?.serverSeed ? fairInt(state.fair.serverSeed, `coquay-${label}`, state.fairCounter, maximum) : crypto.randomInt(maximum);
  };
}
function payoutFor(stake) { return Math.floor(stake * PAYOUT_MULTIPLIER); }
function getSession(id) { return db.prepare('SELECT * FROM coquay_sessions WHERE id=?').get(String(id)) || null; }
function getCoquayByUser(guildId, userId) { return db.prepare('SELECT * FROM coquay_sessions WHERE guild_id=? AND user_id=?').get(String(guildId), String(userId)) || null; }
function parseState(session) { return JSON.parse(session.state_json); }
function saveState(session, state) { db.prepare('UPDATE coquay_sessions SET state_json=?,updated_at=? WHERE id=?').run(JSON.stringify(state), Date.now(), session.id); }
function setMessageId(id, messageId) { db.prepare('UPDATE coquay_sessions SET message_id=?,updated_at=? WHERE id=?').run(String(messageId), Date.now(), String(id)); }

function forceEndCoquaySession(id, guildId, adminId, { label = 'admin-refund', forfeit = false } = {}) {
  return db.transaction(() => {
    const session = db.prepare('SELECT * FROM coquay_sessions WHERE id=? AND guild_id=?').get(String(id), String(guildId)); if (!session) return null;
    const state = parseState(session);
    if (!forfeit) creditCoins({ guildId: session.guild_id, userId: session.user_id, amount: state.stake,
      reason: `coquay:${label}:${adminId}:${session.id}`, operationId: `refund:coquay-admin:${session.id}:${session.user_id}` });
    state.status = 'admin-ended';
    db.prepare('DELETE FROM coquay_sessions WHERE id=?').run(session.id);
    return { session, state, participants: [session.user_id], forfeited: forfeit ? state.stake : 0 };
  })();
}

const startTx = db.transaction(({ guildId, userId, channelId, stake, forcedChambers = null }) => {
  const maxBet = getGameBetLimit(guildId, 'coquay');
  if (!Number.isSafeInteger(stake) || stake < MIN_BET || stake > MAX_BET) throw new Error('INVALID_BET');
  if (stake > maxBet) { const error = new Error('BET_LIMIT'); error.maxBet = maxBet; throw error; }
  if (getCoquayByUser(guildId, userId)) throw new Error('ACTIVE_SESSION');
  const account = spendCoins({ guildId, userId, amount: stake, reason: 'coquay:reserve' });
  const state = { ...engine.createState(stake), fair: createFairness(), fairCounter: 0, usedItems: {}, forcedChambers };
  loadNext(state);
  const now = Date.now();
  const session = { id: crypto.randomBytes(6).toString('hex'), guild_id: String(guildId), user_id: String(userId), channel_id: String(channelId), message_id: null, created_at: now, updated_at: now };
  db.prepare('INSERT INTO coquay_sessions (id,guild_id,user_id,channel_id,message_id,state_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)')
    .run(session.id, session.guild_id, session.user_id, session.channel_id, JSON.stringify(state), now, now);
  return { session, state, account };
});
function startCoquay(args) { return startTx(args); }

// Cho phép test nạp sẵn ổ đạn; khi hết danh sách thì nạp ngẫu nhiên như bình thường.
function loadNext(state) {
  const forced = state.forcedChambers?.shift();
  if (forced) { state.chamber = [...forced]; state.loads += 1; state.lastLoad = { live: forced.filter(Boolean).length, blank: forced.filter(shell => !shell).length }; state.peek = null; return state.lastLoad; }
  return engine.loadChamber(state, rngFor(state));
}
function shoot(state, shooter, target) { return engine.shoot(state, shooter, target, rngFor(state), current => loadNext(current)); }
function describeShot(entry, state) {
  const who = side => (side === 'player' ? 'Bạn' : 'Bot');
  const shell = entry.live ? `${LIVE} **đạn thật**${entry.sawed ? ' (đã cưa nòng)' : ''}` : `${BLANK} **đạn lép**`;
  const aim = entry.shooter === entry.target ? 'tự bắn mình' : `bắn ${entry.target === 'player' ? 'bạn' : 'Bot'}`;
  let text = `${who(entry.shooter)} ${aim}: ${shell}`;
  if (entry.blocked) text += ` · 🪖 Bia Đỡ Đạn chặn 1 sát thương`;
  if (entry.damage) text += ` · −${entry.damage} ❤️`;
  if (!entry.live && entry.shooter === entry.target) text += ' · giữ lượt';
  if (entry.cuffSkip) text += ` · ⛓️ ${entry.shooter === 'player' ? 'Bot' : 'Bạn'} bị còng, mất lượt`;
  if (entry.reloaded) text += `\n🔄 Nạp đợt ${state.loads}: ${LIVE.repeat(entry.reloaded.live)}${BLANK.repeat(entry.reloaded.blank)}`;
  return text;
}
function runBot(state) {
  const lines = [];
  while (state.status === 'playing' && state.turn === 'bot') lines.push(describeShot(shoot(state, 'bot', engine.botTarget(state, rngFor(state))), state));
  return lines;
}
function settle(session, state, reason) {
  const won = reason === 'won';
  const payout = won ? payoutFor(state.stake) : 0;
  const outcome = won ? 'win' : 'loss';
  const account = settleReservedGame({ guildId: session.guild_id, userId: session.user_id, payout, stake: state.stake, game: 'coquay', outcome,
    operationId: `settle:coquay:${session.id}`, countGame: reason !== 'forfeit' });
  db.prepare('DELETE FROM coquay_sessions WHERE id=?').run(session.id);
  state.status = reason;
  return { reason, outcome, payout, balance: account.balance, achievements: account.unlockedAchievements, experienceGained: account.experienceGained, levelUps: account.levelUps, bonusDrops: account.bonusDrops };
}

const playTx = db.transaction(({ sessionId, userId, action, arg = null }) => {
  const session = getSession(sessionId);
  if (!session || session.user_id !== String(userId)) throw new Error('INVALID_SESSION');
  const state = parseState(session);
  if (action === 'forfeit') return { state, result: settle(session, state, 'forfeit'), lines: ['🏳️ Bạn bỏ cuộc.'] };
  if (state.turn !== 'player' || state.status !== 'playing') throw new Error('NOT_YOUR_TURN');
  if (action === 'item') {
    const item = ITEMS[arg]; if (!item) throw new Error('INVALID_ACTION');
    if (state.usedItems[arg]) throw new Error('ITEM_USED');
    if (!engine.canUseItem(state, 'player', arg)) throw new Error('ITEM_UNAVAILABLE');
    if (getInventoryQuantity(session.guild_id, userId, item.itemId) < 1) throw new Error('ITEM_NOT_OWNED');
    consumeInventory(session.guild_id, userId, item.itemId, 1);
    const used = engine.applyItem(state, 'player', arg); state.usedItems[arg] = true;
    const line = arg === 'magnifier' ? `${item.emoji} Bạn soi nòng súng (kết quả gửi riêng cho bạn).`
      : arg === 'shield' ? `${item.emoji} Bạn dựng Bia Đỡ Đạn: đỡ 1 sát thương khi Bot bắn trúng đạn thật.`
        : arg === 'saw' ? `${item.emoji} Bạn cưa nòng: viên kế tiếp nếu là đạn thật gây 2 sát thương.`
          : `${item.emoji} Bạn còng tay Bot: lần tới súng sang tay Bot, Bot mất lượt và súng quay lại bạn.`;
    saveState(session, state);
    return { state, result: null, lines: [line], reveal: arg === 'magnifier' ? used.live : undefined };
  }
  if (action !== 'shoot' || !['bot', 'self'].includes(arg)) throw new Error('INVALID_ACTION');
  const lines = [describeShot(shoot(state, 'player', arg === 'self' ? 'player' : 'bot'), state)];
  lines.push(...runBot(state));
  if (state.status !== 'playing') return { state, lines, result: settle(session, state, state.status) };
  saveState(session, state);
  return { state, lines, result: null };
});
function playCoquay(args) { return playTx(args); }

function hearts(hp) { return `${'❤️'.repeat(hp)}${'🖤'.repeat(Math.max(0, engine.MAX_HP - hp))}`; }
function coquayEmbed(state, userId, { lines = [], result = null, sessionId = null } = {}) {
  const left = engine.remaining(state);
  const embed = new EmbedBuilder().setColor(result ? (result.outcome === 'win' ? 0x2ECC71 : 0xE74C3C) : 0x992D22).setTitle('🔫 CÒ QUAY NGA')
    .setDescription(`## 👤 <@${userId}> ${hearts(state.hp.player)}\n## 🤖 Bot ${hearts(state.hp.bot)}\n\n### Đợt nạp ${state.loads}: ${LIVE.repeat(state.lastLoad?.live || 0)}${BLANK.repeat(state.lastLoad?.blank || 0)}\n**Còn trong ổ:** ${LIVE} ×${left.live} · ${BLANK} ×${left.blank}`)
    .addFields(
      { name: '💵 CƯỢC', value: `**${formatCoins(state.stake)} xu**`, inline: true },
      { name: '🏆 THẮNG NHẬN', value: `**${formatCoins(payoutFor(state.stake))} xu** (x${PAYOUT_MULTIPLIER})`, inline: true },
      { name: '🎯 LƯỢT', value: result ? '—' : state.turn === 'player' ? '**Của bạn**' : '**Bot**', inline: true },
    );
  const status = [state.saw ? '🪚 Nòng đã cưa (viên kế tiếp x2 sát thương)' : null, state.shield.player ? '🪖 Bia Đỡ Đạn đang dựng' : null,
    state.cuffed === 'bot' ? '⛓️ Bot đang bị còng' : null, state.peek !== null && !result ? '🔍 Bạn đã soi viên đang lên nòng' : null].filter(Boolean);
  if (status.length) embed.addFields({ name: '🧰 TRẠNG THÁI', value: status.join('\n') });
  if (lines.length) embed.addFields({ name: '📜 DIỄN BIẾN', value: lines.join('\n').slice(-1024) });
  if (result) {
    const text = result.reason === 'won' ? `🎉 Bot gục ngã! Bạn nhận **${formatCoins(result.payout)} xu**.`
      : result.reason === 'forfeit' ? `🏳️ Bạn bỏ cuộc và mất **${formatCoins(state.stake)} xu**.` : `💀 Bạn đã gục. Mất **${formatCoins(state.stake)} xu**.`;
    embed.addFields({ name: '🏁 KẾT QUẢ', value: `### ${text}` });
    addExperienceField(embed, result);
    if (result.achievements?.length) embed.addFields({ name: '🏅 Thành tựu mới', value: result.achievements.map(item => `**${item.name}**`).join('\n') });
  } else if (sessionId) embed.setFooter({ text: `Mã ván: ${sessionId} • Tự bắn đạn lép thì giữ lượt • Xem luật: /luat trochoi:Cò quay Nga` });
  return embed;
}
function coquayRows(sessionId, state, userId = null, guildId = null, result = null) {
  if (result) return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`replay:coquay:${state.stake}`).setLabel('Chơi lại').setEmoji('🔁').setStyle(ButtonStyle.Success))];
  const myTurn = state.turn === 'player' && state.status === 'playing';
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`coquay:${sessionId}:shoot:bot`).setLabel('Bắn Bot').setEmoji('🔫').setStyle(ButtonStyle.Danger).setDisabled(!myTurn),
    new ButtonBuilder().setCustomId(`coquay:${sessionId}:shoot:self`).setLabel('Tự bắn').setEmoji('🎯').setStyle(ButtonStyle.Secondary).setDisabled(!myTurn),
    new ButtonBuilder().setCustomId(`coquay:${sessionId}:forfeit`).setLabel('Bỏ cuộc').setEmoji('🏳️').setStyle(ButtonStyle.Secondary),
  )];
  if (userId && guildId) {
    const owned = Object.entries(ITEMS).map(([key, item]) => ({ key, item, count: getInventoryQuantity(guildId, userId, item.itemId) })).filter(entry => entry.count > 0);
    if (owned.length) rows.push(new ActionRowBuilder().addComponents(owned.map(({ key, item, count }) => new ButtonBuilder()
      .setCustomId(`coquay:${sessionId}:item:${key}`).setLabel(`${item.name} ×${count}`).setEmoji(item.emoji).setStyle(ButtonStyle.Primary)
      .setDisabled(!myTurn || Boolean(state.usedItems?.[key]) || !engine.canUseItem(state, 'player', key)))));
  }
  return rows;
}

async function handleCoquayButton(interaction) {
  const [, sessionId, action, arg] = interaction.customId.split(':');
  const session = getSession(sessionId);
  if (!session || session.guild_id !== interaction.guildId) return interaction.reply({ content: 'Ván Cò quay đã kết thúc hoặc nút không còn hợp lệ.', flags: MessageFlags.Ephemeral });
  if (session.user_id !== interaction.user.id) return interaction.reply({ content: 'Đây là ván Cò quay của người chơi khác.', flags: MessageFlags.Ephemeral });
  let played;
  try { played = playCoquay({ sessionId, userId: interaction.user.id, action, arg }); }
  catch (error) {
    const content = { NOT_YOUR_TURN: 'Chưa tới lượt bạn.', ITEM_USED: 'Mỗi loại vật phẩm chỉ dùng được 1 lần mỗi ván.', ITEM_UNAVAILABLE: 'Không thể dùng vật phẩm này lúc này (hiệu ứng đang còn tác dụng).', ITEM_NOT_OWNED: 'Bạn không còn vật phẩm này.' }[error.message] || 'Không thể thực hiện thao tác này.';
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
  await interaction.update({ embeds: [coquayEmbed(played.state, interaction.user.id, { lines: played.lines, result: played.result, sessionId })],
    components: coquayRows(sessionId, played.state, interaction.user.id, interaction.guildId, played.result), allowedMentions: { parse: [] } });
  if (played.reveal !== undefined) return interaction.followUp({ content: `🔍 Viên đang lên nòng là ${played.reveal ? `${LIVE} **ĐẠN THẬT**` : `${BLANK} **ĐẠN LÉP**`}.`, flags: MessageFlags.Ephemeral });
  return null;
}

module.exports = { MIN_BET, MAX_BET, PAYOUT_MULTIPLIER, ITEMS, payoutFor, getCoquayByUser, startCoquay, playCoquay, setMessageId, coquayEmbed, coquayRows, handleCoquayButton, forceEndCoquaySession };
