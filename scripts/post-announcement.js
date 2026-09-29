require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { launchEmbeds } = require('../src/announcements/launch');

const DEFAULT_CHANNEL_ID = '961232754010378291';
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const channelFlag = args.indexOf('--channel');
const channelId = (channelFlag >= 0 ? args[channelFlag + 1] : null) || process.env.ANNOUNCE_CHANNEL_ID || DEFAULT_CHANNEL_ID;
const body = { embeds: launchEmbeds().map(embed => embed.toJSON()), allowed_mentions: { parse: [] } };

if (dryRun) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}
if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is required');
if (!/^\d{15,25}$/.test(channelId)) throw new Error('Channel ID không hợp lệ');
new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)
  .post(Routes.channelMessages(channelId), { body })
  .then(message => console.log(`Đã đăng thông báo vào kênh ${channelId}: message ${message.id}`))
  .catch(error => { console.error(`Không đăng được: ${error.message}`); process.exitCode = 1; });
