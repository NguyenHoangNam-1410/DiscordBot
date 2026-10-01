require("dotenv").config();
const { REST, Routes } = require("discord.js");
const { loadCommands } = require("../src/commandRegistry");
if (
  !process.env.DISCORD_TOKEN ||
  !process.env.CLIENT_ID ||
  !process.env.GUILD_ID
)
  throw new Error("DISCORD_TOKEN, CLIENT_ID and GUILD_ID are required");
const body = loadCommands("../src/commands").map((command) =>
  command.data.toJSON(),
);
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID,
    ),
    { body },
  );
  console.log(`Registered ${body.length} game-bot commands`);
})();
