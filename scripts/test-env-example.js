"use strict";
// Integration checks run against SQLite in memory: no player data or test files.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
process.env.DB_PATH = ":memory:";
const config = require("../src/services/gameConfigService");
for (const key of config.GAME_CONFIG_KEYS) delete process.env[key];
const { db } = require("../src/db");
const game = require("../src/commands/game");
const commands = require("../src/commandRegistry").loadCommands();
const { ChannelType, MessageFlags } = require("discord.js");
const channels = require("../src/services/gameChannelService");
const chatbot = require("../src/services/chatbotService");
const prefix = require("../src/services/slashPrefixService");
const G = "config-guild",
  U = "123456789012345678",
  C = "234567890123456789";
function mock(sub = "cauhinh", extra = {}) {
  const calls = [];
  return {
    guildId: G,
    user: { id: U },
    memberPermissions: { has: () => true },
    options: { getSubcommand: () => sub },
    calls,
    reply: async (p) => {
      calls.push({ type: "reply", ...p });
      return p;
    },
    update: async (p) => {
      calls.push({ type: "update", ...p });
      return p;
    },
    showModal: async (p) => {
      calls.push({ type: "modal", modal: p });
      return p;
    },
    ...extra,
  };
}
const components = (panel) =>
  panel.components.flatMap((row) => row.toJSON().components);
const scopes = {
  baucua: "baucua",
  taixiu: "taixiu",
  chinchiro: "chinchiro",
  xidach: "blackjack",
  poker: "poker",
  duangua: "duangua",
  domin: "mines",
  coquay: "coquay",
  sinhton: "hardcore",
  2048: "2048",
  vtv: "vuatiengviet",
  chatbot: "chatbot",
  gacha: "gacha",
  quantri: "system",
};
async function run() {
  const env = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
  const listed = [...env.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(
    (m) => m[1],
  );
  assert(listed.length <= 12, "env example must stay minimal");
  for (const key of [
    "DISCORD_TOKEN",
    "CLIENT_ID",
    "GUILD_ID",
    "OPENAI_API_KEY",
    "TOWER_GENERATOR_SECRET",
  ])
    assert(listed.includes(key));
  for (const key of config.GAME_CONFIG_KEYS)
    assert(!listed.includes(key), `${key} belongs in Discord`);
  for (const key of [
    "DISCORD_TOKEN",
    "OPENAI_API_KEY",
    "TOWER_GENERATOR_SECRET",
    "ADMIN_USER_ID",
    "OPENAI_BASE_URL",
    "__proto__",
    "constructor",
  ]) {
    assert.throws(
      () => config.setGameConfig(G, key, "secret", U),
      /INVALID_GAME_CONFIG/,
    );
  }
  const systemKeys = config.configKeysForScope("system");
  assert.deepEqual(systemKeys, [
    "ECONOMY_STARTING_COINS",
    "LEVEL_XP_PER_LEVEL",
    "GAME_EXP_BASE",
    "GAME_EXP_WIN_COIN_DIVISOR",
    "GAME_EXP_MAX",
    "GAME_COIN_DROP_CHANCE",
    "GAME_COIN_DROP_MIN",
    "GAME_COIN_DROP_MAX",
  ]);
  const resetOptions = commands
    .find((c) => c.data.toJSON().name === "quantri")
    .data.toJSON()
    .options.find((o) => o.name === "khoiphuc").options[0].choices;
  assert(resetOptions.every((o) => systemKeys.includes(o.value)));
  for (const [name, scope] of Object.entries(scopes)) {
    const command = commands.find((c) => c.data.toJSON().name === name);
    const schema = command.data.toJSON();
    assert(
      schema.options.some((o) => o.name === "cauhinh"),
      name,
    );
    assert(
      schema.options.every((o) => o.type === 1 || o.type === 2),
      "no mixed root arguments",
    );
    const i = mock();
    if (channels.GAMES.includes(scope))
      channels.setGameMaintenance(G, scope, true, U);
    await command.execute(i); // Works even when the game is paused or channel isn't set.
    assert.equal(i.calls.length, 1, name);
    assert(i.calls[0].embeds, name);
    assert.equal(i.calls[0].flags, MessageFlags.Ephemeral);
    const expected = config.configKeysForScope(scope),
      seen = [];
    for (let page = 0; page < Math.ceil(expected.length / 8); page++) {
      const panel = game.configPanel(G, null, scope, U, page);
      const embed = panel.embeds[0].toJSON();
      assert(embed.description.length <= 4096);
      const select = components(panel).find((c) => c.type === 3);
      assert(select.options.length <= 25);
      assert(select.options.every((o) => expected.includes(o.value)));
      seen.push(...select.options.map((o) => o.value));
      for (const option of select.options) {
        const click = mock("cauhinh", {
          customId: select.custom_id,
          values: [option.value],
        });
        await game.handleConfigSelect(click);
        assert.equal(click.calls[0].type, "modal", `${name}:${option.value}`);
        const modal = click.calls[0].modal.toJSON();
        assert(modal.custom_id.length <= 100);
        assert(modal.title.length <= 45);
      }
    }
    assert.deepEqual(seen, expected);
    const denied = mock("cauhinh", {
      memberPermissions: { has: () => false },
      user: { id: "outsider" },
    });
    await command.execute(denied);
    assert(
      !denied.calls[0].embeds && denied.calls[0].content,
      `admin only ${name}`,
    );
    if (channels.GAMES.includes(scope))
      channels.setGameMaintenance(G, scope, false, U);
  }
  for (const customId of [
    `game-config-modal:system:${U}:0:POKER_ANTE`,
    `game-config-modal:poker:someone:0:POKER_ANTE`,
    `game-config-modal:poker:${U}:0:DISCORD_TOKEN`,
    `game-config-modal:system:${U}:0:constructor`,
    "game-config-modal:POKER_ANTE",
  ]) {
    const i = mock("cauhinh", {
      customId,
      fields: { getTextInputValue: () => "100" },
    });
    await game.handleConfigModal(i);
    assert(i.calls[0].content && i.calls[0].type === "reply");
  }
  const save = async (scope, key, value, reset = "", extra = {}) => {
    const i = mock("cauhinh", {
      customId: `game-config-modal:${scope}:${U}:0:${key}`,
      fields: { getTextInputValue: (id) => (id === "reset" ? reset : value) },
      ...extra,
    });
    await game.handleConfigModal(i);
    return i;
  };
  let i = await save("poker", "POKER_ANTE", "90");
  assert.equal(i.calls[0].type, "update");
  assert.equal(config.getGameConfig(G, "POKER_ANTE"), 90);
  assert.equal(config.getGameConfig("other", "POKER_ANTE"), 50);
  await save("poker", "POKER_ANTE", "0");
  assert.equal(config.getGameConfig(G, "POKER_ANTE"), 90);
  await save("poker", "POKER_ANTE", "", "MACDINH");
  assert.equal(config.getGameConfig(G, "POKER_ANTE"), 50);
  await save("blackjack", "MAX_BET_blackjack", "1500");
  assert.equal(
    require("../src/services/gameBetLimitService").getGameBetLimit(
      G,
      "blackjack",
    ),
    1500,
  );
  await save("blackjack", "WIN_MULT_BLACKJACK", "1.7");
  assert.equal(
    require("../src/services/winMultiplierService").getWinMultiplier(
      G,
      "blackjack",
    ),
    1.7,
  );
  await save("vuatiengviet", "VUATIENGVIET_REWARD", "40");
  assert.equal(
    require("../src/services/gameRewardService").getGameReward(
      G,
      "vuatiengviet",
    ),
    40,
  );
  await save("vuatiengviet", "MAINTENANCE_vuatiengviet", "1");
  assert(channels.isGameMaintenance(G, "vuatiengviet"));
  const guild = {
    channels: {
      fetch: async (id) => ({ id, guildId: G, type: ChannelType.GuildText }),
    },
  };
  await save("poker", "CHANNELS_poker", C, "", { guild });
  assert.equal(channels.getGameChannels(G, "poker")[0].channel_id, C);
  i = await save("poker", "CHANNELS_poker", U, "", {
    guild: {
      channels: {
        fetch: async () => ({ guildId: "other", type: ChannelType.GuildText }),
      },
    },
  });
  assert.equal(i.calls[0].type, "reply");
  assert.equal(channels.getGameChannels(G, "poker")[0].channel_id, C);
  await save("poker", "CHANNELS_poker", "", "", { guild });
  assert.equal(channels.getGameChannels(G, "poker").length, 0);
  await save("chatbot", "CHATBOT_DAILY_LIMIT", "35");
  assert.equal(chatbot.dailyLimit(G), 35);
  await save("chatbot", "CHATBOT_CHANNEL", C, "", { guild });
  assert.equal(chatbot.getChannelId(G), C);
  config.setGameConfig(G, "HARDCORE_GAMEPLAY_VERSION", "legacy", U);
  assert.equal(require("../src/hardcore/shared/version").useV2(G), false);
  assert.equal(require("../src/hardcore/shared/version").useV2("other"), true);
  config.setGameConfig(G, "GAME_COIN_DROP_MIN", 50, U);
  config.setGameConfig(G, "GAME_COIN_DROP_MAX", 60, U);
  assert.throws(
    () => config.resetGameConfig(G, "GAME_COIN_DROP_MIN"),
    /INVALID_DROP_RANGE/,
  );
  assert.equal(config.getGameConfig(G, "GAME_COIN_DROP_MIN"), 50);
  assert.throws(
    () => config.setGameConfig(G, "POKER_ANTE", "", U),
    /INVALID_GAME_CONFIG_VALUE/,
  );
  const legacyRun = require("../src/services/hardcoreService").startHardcore({
    guildId: G,
    userId: "config-legacy-player",
    channelId: C,
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty", name: "Trống" },
  });
  assert(
    ![2, 3].includes(legacyRun.state.gameplayVersion),
    "guild engine setting reaches new runs",
  );
  const rates = require("../src/hardcore/ui/ratesPanel");
  assert.match(
    rates.ratesPayload(U, "encounters", 0, G).embeds[0].toJSON().title,
    /legacy/,
  );
  assert(
    !rates
      .ratesPayload(U, "encounters", 0, "other")
      .embeds[0].toJSON()
      .title.includes("legacy"),
  );
  // No key or request endpoint is accepted from the UI. Per-server AI settings reach the request.
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_BASE_URL;
  config.setGameConfig(G, "OPENAI_MODEL", "test-model", U);
  config.setGameConfig(G, "CHATBOT_MAX_TOKENS", 2300, U);
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () =>
        url.endsWith("/moderations")
          ? { results: [{ flagged: false }] }
          : { choices: [{ message: { content: "ok" } }] },
    };
  };
  assert(
    (await chatbot.ask({ guildId: G, userId: U, channelId: C, text: "test" }))
      .ok,
  );
  const request = requests.find((r) => r.url.endsWith("/chat/completions"));
  assert.equal(request.body.model, "test-model");
  assert.equal(request.body.max_tokens, 2300);
  // Losing admin privileges after opening the form must prevent saving.
  const deniedSave = await save("poker", "POKER_ANTE", "150", "", {
    memberPermissions: { has: () => false },
    user: { id: U },
  });
  assert.equal(deniedSave.calls[0].type, "reply");
  assert.equal(config.getGameConfig(G, "POKER_ANTE"), 50);
  const deniedSelect = mock("cauhinh", {
    customId: `game-config-select:poker:${U}:0`,
    values: ["POKER_ANTE"],
    memberPermissions: { has: () => false },
  });
  await game.handleConfigSelect(deniedSelect);
  assert.equal(deniedSelect.calls[0].type, "reply");
  const page = mock("cauhinh", { customId: `game-config-page:poker:${U}:0` });
  await game.handleConfigPage(page);
  assert.equal(page.calls[0].type, "update");
  // Old positional prefix arguments still choose the new play subcommand.
  process.env.COMMAND_PREFIX = "!";
  const xidach = commands.find((c) => c.data.toJSON().name === "xidach");
  for (const [content, sub, ante] of [
    ["!xidach 1000", "choi", 1000],
    ["!xidach choi 2000", "choi", 2000],
    ["!xidach cauhinh", "cauhinh", null],
  ]) {
    let seen;
    const message = {
      content,
      guildId: G,
      channelId: C,
      author: { id: U },
      client: {
        commands: new Map([
          [
            "xidach",
            {
              data: xidach.data,
              execute: async (i) => {
                seen = [
                  i.options.getSubcommand(),
                  i.options.getInteger("ante"),
                ];
              },
            },
          ],
        ]),
      },
      reply: async () => {
        throw Error("Unexpected prefix failure");
      },
    };
    assert(await prefix.handleSlashPrefix(message));
    assert.deepEqual(seen, [sub, ante]);
  }
  // Changes survive reloading the settings module.
  delete require.cache[require.resolve("../src/services/gameConfigService")];
  assert.equal(
    require("../src/services/gameConfigService").getGameConfig(
      G,
      "OPENAI_MODEL",
    ),
    "test-model",
  );
  console.log(
    JSON.stringify({
      ok: true,
      envExample: true,
      scopes: Object.keys(scopes).length,
      settings: config.GAME_CONFIG_KEYS.length,
    }),
  );
  db.close();
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
