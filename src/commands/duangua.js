const { SlashCommandBuilder } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { createHorseRace } = require('../services/horseRaceService');

module.exports = {
  data: new SlashCommandBuilder().setName('duangua').setDescription('Đua ngựa: 20 ngựa thường, 1 Thiên Mã hiếm, mỗi ván chọn 6'),
  async execute(interaction) {
    if (!await requireGameChannel(interaction, 'duangua')) return null;
    return createHorseRace(interaction);
  },
};
