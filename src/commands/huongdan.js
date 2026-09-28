const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { helpEmbed } = require('./trochoi');

module.exports = {
  data: new SlashCommandBuilder().setName('huongdan').setDescription('Xem hệ thống lệnh gọn và cách chơi'),
  async execute(interaction) {
    return interaction.reply({ embeds: [helpEmbed()], flags: MessageFlags.Ephemeral });
  },
};
