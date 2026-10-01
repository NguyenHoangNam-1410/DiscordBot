const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-vua-dictionary.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const economy = require("../src/services/economyService");
const config = require("../src/services/gameConfigService");
const games = require("../src/services/funGameService");
const shop = require("../src/services/shopService");
const levels = require("../src/services/playerLevelService");
const channels = require("../src/services/gameChannelService");
const vua = require("../src/commands/vuatiengviet");
const { useItem } = require("../src/services/itemEffectService");

(async () => {
  const guild = "dictionary-guild";
  const channelId = "dictionary-channel";
  channels.setGameChannel(guild, "vuatiengviet", channelId);
  for (const key of [
    "GAME_COIN_DROP_CHANCE",
    "GAME_DIAMOND_DROP_CHANCE",
    "GAME_ITEM_DROP_MULTIPLIER",
  ])
    config.setGameConfig(guild, key, 0, "test");

  // useItem: coi như trả lời đúng; chỉ trả thông báo, câu mới do giao diện đăng
  games.startVuaSession(guild, { forceHard: true });
  shop.addInventory(guild, "alice", "living_dictionary", 2);
  const diamondsBefore = levels.getPlayerProgression(guild, "alice").diamonds;
  const coinsBefore = economy.getAccount(guild, "alice").balance;
  const used = useItem({
    guildId: guild,
    userId: "alice",
    channelId,
    itemId: "living_dictionary",
  });
  assert.equal(
    levels.getPlayerProgression(guild, "alice").diamonds,
    diamondsBefore + 10,
    "nhận 10 kim cương như trả lời câu khó thông thường",
  );
  assert(
    economy.getAccount(guild, "alice").balance > coinsBefore,
    "nhận xu thưởng câu khó",
  );
  assert.match(
    used.message,
    /^🎉 \*\*<@alice>\*\* thắng \(đúng \*\*.+\*\* nhờ 📖 Từ Điển Sống\): \*\*\+[\d.]+ :coin: \+10 :gem:\*\*/,
  );
  assert.doesNotMatch(
    used.message,
    /Câu tiếp theo|Gợi ý/,
    "không lặp lại câu hỏi mới trong thông báo",
  );
  assert.equal(
    shop.getInventoryQuantity(guild, "alice", "living_dictionary"),
    1,
  );

  // Nút nhanh trong Vua tiếng Việt: thông báo công khai + đăng câu hỏi mới; bảng riêng chỉ xác nhận ngắn
  games.startVuaSession(guild, { forceHard: true });
  const sent = [];
  const updates = [];
  const channel = {
    id: channelId,
    isTextBased: () => true,
    send: async (payload) => {
      sent.push(payload);
      return { id: `msg-${sent.length}` };
    },
    messages: { fetch: async () => null },
  };
  await vua.handleButton({
    guildId: guild,
    channelId,
    channel,
    user: { id: "alice" },
    message: { id: "ui" },
    customId: "vuatiengviet:item:alice:living_dictionary",
    update: async (payload) => {
      updates.push(payload);
      return payload;
    },
    reply: async (payload) => {
      updates.push(payload);
      return payload;
    },
  });
  assert.equal(sent.length, 2, "một thông báo công khai + một tin câu hỏi mới");
  assert.match(sent[0].content, /🎉.*đúng.*nhờ 📖 Từ Điển Sống/s);
  assert.match(sent[0].content, /\+10 :gem:/);
  assert.deepEqual(
    sent[0].allowedMentions,
    { users: ["alice"] },
    "ping người dùng như trả lời đúng bình thường",
  );
  assert(
    sent[1].embeds?.length && sent[1].components?.length,
    "đăng câu hỏi mới giống sau khi trả lời đúng",
  );
  const panel = JSON.stringify(updates[0].embeds[0].toJSON());
  assert.match(panel, /đã được thông báo trong kênh/);
  assert.doesNotMatch(
    panel,
    /Câu tiếp theo|Gợi ý/,
    "bảng riêng không lặp lại câu hỏi",
  );
  assert.equal(
    shop.getInventoryQuantity(guild, "alice", "living_dictionary"),
    0,
  );

  // /use chọn vật phẩm: cùng hành vi
  games.startVuaSession(guild, { forceHard: true });
  shop.addInventory(guild, "alice", "living_dictionary", 1);
  const useSent = [];
  const useUpdates = [];
  const useChannel = {
    id: channelId,
    isTextBased: () => true,
    send: async (payload) => {
      useSent.push(payload);
      return { id: `use-${useSent.length}` };
    },
    messages: { fetch: async () => null },
  };
  await require("../src/commands/use").handleSelect({
    customId: "use:alice:all",
    guildId: guild,
    channelId,
    channel: useChannel,
    user: { id: "alice" },
    values: ["living_dictionary"],
    update: async (payload) => {
      useUpdates.push(payload);
      return payload;
    },
    followUp: async (payload) => payload,
    reply: async (payload) => payload,
  });
  assert.equal(useSent.length, 2);
  assert.match(useSent[0].content, /nhờ 📖 Từ Điển Sống/);
  assert(useSent[1].embeds?.length, "/use cũng đăng câu hỏi mới");

  db.close();
  for (const suffix of ["", "-wal", "-shm"])
    fs.rmSync(`${testDb}${suffix}`, { force: true });
  console.log(JSON.stringify({ ok: true, vuaDictionary: true }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
