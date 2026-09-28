const { addCoinsByAdmin, removeCoinsByAdmin, getEconomyStats } = require('./economyService');
const { formatCoins } = require('../utils/economy');
const { PermissionFlagsBits } = require('discord.js');
const { addDiamonds } = require('./playerLevelService');

function adminIds() {
  return String(process.env.ADMIN_USER_ID || '').split(/[,;\n]/).map(id => id.trim()).filter(Boolean);
}

function parseAddGold(content, prefix = process.env.COMMAND_PREFIX || '!') {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(content || '').trim().match(new RegExp(`^${escaped}(?:congxu|addgold)\\s+(?:<@!?(\\d+)>|(\\d+))\\s+(\\d+)(?:\\s+(.+))?$`, 'i'));
  if (!match) return null;
  return { userId: match[1] || match[2], amount: Number(match[3]), reason: match[4]?.trim() || 'prefix' };
}

function parseRemoveGold(content, prefix = process.env.COMMAND_PREFIX || '!') {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(content || '').trim().match(new RegExp(`^${escaped}(?:truxu|removegold)\\s+(?:<@!?(\\d+)>|(\\d+))\\s+(\\d+)(?:\\s+(.+))?$`, 'i'));
  if (!match) return null;
  return { userId: match[1] || match[2], amount: Number(match[3]), reason: match[4]?.trim() || 'violation' };
}

function parseAddGem(content, prefix = process.env.COMMAND_PREFIX || '!') {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(content || '').trim().match(new RegExp(`^${escaped}addgem\\s+(?:<@!?(\\d+)>|(\\d+))\\s+(\\d+)$`, 'i'));
  if (!match) return null;
  return { userId: match[1] || match[2], amount: Number(match[3]) };
}

async function handlePrefixMessage(message, logger = console) {
  if (!message.guildId || message.author?.bot) return false;
  const prefix = process.env.COMMAND_PREFIX || '!';
  const lowerContent = String(message.content || '').toLowerCase();
  const isAdd = lowerContent.startsWith(`${prefix.toLowerCase()}congxu`) || lowerContent.startsWith(`${prefix.toLowerCase()}addgold`);
  const isRemove = lowerContent.startsWith(`${prefix.toLowerCase()}truxu`) || lowerContent.startsWith(`${prefix.toLowerCase()}removegold`);
  const isAddGem = lowerContent.startsWith(`${prefix.toLowerCase()}addgem`);
  const isStats = [`${prefix.toLowerCase()}thongkekinhte`, `${prefix.toLowerCase()}economystats`].includes(lowerContent.trim());
  if (!isAdd && !isRemove && !isAddGem && !isStats) return false;
  if (!adminIds().includes(message.author.id) && !message.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    await message.reply({ content: 'Bạn không có quyền dùng lệnh này.', allowedMentions: { repliedUser: false } });
    return true;
  }
  if (isStats) {
    const stats = getEconomyStats(message.guildId);
    await message.reply({ content: [
      '📊 **KINH TẾ SERVER**',
      `Người chơi: **${stats.users}**`, `Tổng cung: **${formatCoins(stats.supply)} xu**`, `Trung bình: **${formatCoins(stats.average)} xu**`,
      `Tài khoản cao nhất: **${formatCoins(stats.richest)} xu**`, `24 giờ tạo ra: **${formatCoins(stats.minted)} xu**`,
      `24 giờ đã tiêu/hủy: **${formatCoins(stats.spent)} xu**`, `Giao dịch 24 giờ: **${stats.transactions}**`,
    ].join('\n'), allowedMentions: { repliedUser: false } });
    return true;
  }
  if (isAddGem) {
    const parsed = parseAddGem(message.content, prefix);
    if (!parsed) {
      await message.reply({ content: `Cách dùng: \`${prefix}addgem @user <số kim cương>\``, allowedMentions: { repliedUser: false } });
      return true;
    }
    if (!Number.isSafeInteger(parsed.amount) || parsed.amount < 1 || parsed.amount > 1_000_000) {
      await message.reply({ content: 'Số kim cương phải là số nguyên từ 1 đến 1.000.000.', allowedMentions: { repliedUser: false } });
      return true;
    }
    const member = await message.guild.members.fetch(parsed.userId).catch(() => null);
    if (!member || member.user.bot) {
      await message.reply({ content: 'Người chơi không tồn tại trong server hoặc là bot.', allowedMentions: { repliedUser: false } });
      return true;
    }
    addDiamonds(message.guildId, parsed.userId, parsed.amount, { reason: `admin:${message.author.id}`,
      operationId: message.id ? `addgem:${message.id}` : null });
    logger.info?.({ adminId: message.author.id, userId: parsed.userId, guildId: message.guildId, amount: parsed.amount }, 'admin added gems');
    return true;
  }
  const parsed = isRemove ? parseRemoveGold(message.content, prefix) : parseAddGold(message.content, prefix);
  if (!parsed) {
    const command = isRemove ? 'truxu' : 'congxu';
    await message.reply({ content: `Cách dùng: \`${prefix}${command} @user <số xu> [lý do]\``, allowedMentions: { repliedUser: false } });
    return true;
  }
  const member = await message.guild.members.fetch(parsed.userId).catch(() => null);
  if (!member || member.user.bot) {
    await message.reply({ content: 'Người chơi không tồn tại trong server hoặc là bot.', allowedMentions: { repliedUser: false } });
    return true;
  }
  try {
    if (isRemove) {
      const account = removeCoinsByAdmin({ guildId: message.guildId, userId: parsed.userId, amount: parsed.amount, adminId: message.author.id, reason: parsed.reason });
      await message.reply({ content: `⚠️ Đã trừ **${formatCoins(account.deducted)} xu** của <@${parsed.userId}>. Lý do: **${parsed.reason}**.`, allowedMentions: { users: [parsed.userId], repliedUser: false } });
      logger.info?.({ adminId: message.author.id, userId: parsed.userId, guildId: message.guildId, requested: parsed.amount, deducted: account.deducted, reason: parsed.reason }, 'admin removed gold');
    } else {
      addCoinsByAdmin({ guildId: message.guildId, userId: parsed.userId, amount: parsed.amount, adminId: message.author.id, reason: parsed.reason });
      logger.info?.({ adminId: message.author.id, userId: parsed.userId, guildId: message.guildId, amount: parsed.amount, reason: parsed.reason }, 'admin added gold');
    }
  } catch (error) {
    const action = isRemove ? 'trừ' : 'cộng';
    const content = error.message === 'INVALID_AMOUNT' ? 'Số xu phải là số nguyên từ 1 đến 10.000.000.' : `Không thể ${action} xu lúc này.`;
    await message.reply({ content, allowedMentions: { repliedUser: false } });
    if (error.message !== 'INVALID_AMOUNT') logger.error?.({ err: error, action }, 'admin gold prefix command failed');
  }
  return true;
}

module.exports = { parseAddGold, parseRemoveGold, parseAddGem, handlePrefixMessage };
