const { MessageFlags } = require('discord.js');

const formatCoins = value => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

function cooldownText(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours ? `${hours} giờ` : null, minutes ? `${minutes} phút` : null, rest || (!hours && !minutes) ? `${rest} giây` : null].filter(Boolean).join(' ');
}

async function economyError(interaction, error) {
  const content = error?.code === 'INSUFFICIENT_FUNDS'
    ? `Bạn không đủ xu. Số dư hiện tại: **${formatCoins(error.balance)} xu**.`
    : error?.message === 'INVALID_BET'
      ? 'Mức cược phải từ **10 đến 100.000 xu**.'
      : 'Không thể xử lý giao dịch xu lúc này.';
  const options = { content, flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred) return interaction.followUp(options);
  return interaction.reply(options);
}

module.exports = { formatCoins, cooldownText, economyError };
