const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-command-handlers.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

function interaction(overrides = {}) {
  const replies = [];
  return {
    id: `test-${Math.random()}`,
    guildId: "command-guild",
    guild: { name: "Server Kiểm Thử" },
    channelId: "channel",
    user: { id: "alice", bot: false, username: "alice", globalName: "Alice" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommand: () => "xem",
      getString: () => null,
      getBoolean: () => true,
      getInteger: () => 1,
      getNumber: () => 1,
      getUser: () => null,
    },
    reply: async (payload) => {
      replies.push(payload);
      return payload;
    },
    editReply: async (payload) => {
      replies.push(payload);
      return payload;
    },
    deferReply: async () => {},
    followUp: async (payload) => {
      replies.push(payload);
      return payload;
    },
    replies,
    ...overrides,
  };
}

async function run() {
  const profilePng =
    await require("../src/services/profileCardService").renderProfileCard({
      displayName: "Alice",
      username: "alice",
      avatarUrl: null,
      rank: 1,
      account: { balance: 1234, games_played: 8, wins: 5, losses: 2, draws: 1 },
      appearance: { color: { value: "#5865F2", name: "Discord" } },
      progress: { level: 3, experience: 250, diamonds: 40 },
      xpTarget: 600,
      serverName: "Server Kiểm Thử",
    });
  assert.equal(profilePng.subarray(1, 4).toString(), "PNG");
  for (const [name, overrides] of [
    ["trochoi", {}],
    ["trogiup", {}],
    ["luat", { options: { getString: () => "baucua" } }],
    ["batdau", {}],
    ["inventory", {}],
    ["nhiemvu", { options: { getSubcommand: () => "kiemtra" } }],
    ["xu", { options: { getSubcommand: () => "sodu" } }],
    ["shop", { options: { getSubcommand: () => "xem" } }],
    ["game", { options: { getSubcommand: () => "configs" } }],
    ["use", {}],
    ["xephang", {}],
    ["thuongrole", { member: { roles: ["member"] } }],
  ]) {
    const mock = interaction(overrides);
    await require(`../src/commands/${name}`).execute(mock);
    assert(mock.replies.length > 0, `${name} không phản hồi`);
  }
  const buffAdmin = interaction({
    options: {
      getSubcommand: () => "datbuff",
      getString: (name) =>
        ({ hanhdong: "set", loai: "diamonds" })[name] ?? null,
      getNumber: (name) => ({ phantram: 250, sogio: 48 })[name] ?? null,
      getInteger: () => null,
    },
  });
  await require("../src/commands/quantri").execute(buffAdmin);
  assert.match(buffAdmin.replies[0].content, /250%/);
  assert.equal(
    require("../src/services/gameBuffService").listBuffs("command-guild")[0]
      .chance_bps,
    25_000,
  );
  const levels = require("../src/services/playerLevelService");
  const previousAdmin = process.env.ADMIN_USER_ID;
  process.env.ADMIN_USER_ID = "admin";
  const towerResetDenied = interaction({
    user: { id: "guild-admin" },
    memberPermissions: { has: () => true },
    options: { getSubcommand: () => "thapreset" },
  });
  await require("../src/commands/quantri").execute(towerResetDenied);
  assert.match(towerResetDenied.replies[0].content, /quản trị bot/);
  const silentReplies = [];
  const adminMessage = (content) => ({
    id: `prefix-${content}`,
    guildId: "silent-admin-guild",
    content,
    author: { id: "admin", bot: false },
    member: { permissions: { has: () => true } },
    guild: {
      members: { fetch: async (id) => ({ id, user: { id, bot: false } }) },
    },
    reply: async (payload) => {
      silentReplies.push(payload);
      return payload;
    },
  });
  const prefixAdmin = require("../src/services/prefixCommandService");
  assert.equal(
    await prefixAdmin.handlePrefixMessage(
      adminMessage("!addgold 123456789 500"),
      {},
    ),
    true,
  );
  assert.equal(
    await prefixAdmin.handlePrefixMessage(
      adminMessage("!addgem 123456789 25"),
      {},
    ),
    true,
  );
  assert.equal(silentReplies.length, 0);
  assert.equal(
    require("../src/services/economyService").getAccount(
      "silent-admin-guild",
      "123456789",
    ).balance,
    1500,
  );
  assert.equal(
    levels.getPlayerProgression("silent-admin-guild", "123456789").diamonds,
    25,
  );
  if (previousAdmin === undefined) delete process.env.ADMIN_USER_ID;
  else process.env.ADMIN_USER_ID = previousAdmin;
  levels.addDiamonds("command-guild", "alice", 100, {
    operationId: "command-gacha-fund",
    reason: "test",
  });
  const gachaMock = interaction({
    options: { getSubcommand: () => "quay", getInteger: () => 1 },
  });
  await require("../src/commands/gacha").execute(gachaMock);
  assert.equal(gachaMock.replies.length, 1);
  assert.equal(gachaMock.replies[0].components[0].components.length, 2);
  assert(
    !gachaMock.replies[0].embeds[0]
      .toJSON()
      .fields.some((field) => field.name === "Cấp độ"),
  );

  levels.addDiamonds("command-guild", "alice", 1_000, {
    operationId: "command-gacha-button-fund",
    reason: "test",
  });
  const gachaUpdates = [];
  const gachaFollowUps = [];
  await require("../src/commands/gacha").handleButton({
    id: "gacha-button-1",
    customId: "gacha:alice:1",
    guildId: "command-guild",
    user: { id: "alice" },
    update: async (payload) => {
      gachaUpdates.push(payload);
      return payload;
    },
    followUp: async (payload) => {
      gachaFollowUps.push(payload);
      return payload;
    },
    reply: async (payload) => payload,
  });
  assert.equal(gachaUpdates.length, 1);
  assert.equal(gachaUpdates[0].components.length, 0);
  assert.equal(gachaFollowUps.length, 1);
  assert.equal(gachaFollowUps[0].components[0].components.length, 2);

  assert.match(
    require("../src/commands/nhiemvu").rewardText({
      coins: 30000,
      diamonds: 100,
      item: "horse_jackpot",
      quantity: 1,
    }),
    /Trúng Đậm ×1/,
  );
  assert.deepEqual(
    require("../src/commands/nhiemvu")
      .data.toJSON()
      .options.map((option) => option.name),
    ["kiemtra", "nhan", "diemdanh", "tanthu"],
  );
  // Gacha phía trên có thể ngẫu nhiên mở thành tựu; nhận trước để lần nhận kế tiếp chắc chắn trống
  await require("../src/commands/nhiemvu").execute(
    interaction({
      options: { getSubcommand: () => "nhan", getString: () => null },
    }),
  );
  const claimAll = interaction({
    options: { getSubcommand: () => "nhan", getString: () => null },
  });
  await require("../src/commands/nhiemvu").execute(claimAll);
  assert.match(claimAll.replies[0].content, /chưa có phần thưởng/i);
  const claimRole = interaction({
    member: { roles: ["member"] },
    options: {
      getSubcommand: () => "nhan",
      getString: (name) => (name === "loai" ? "vaitro" : null),
    },
  });
  await require("../src/commands/nhiemvu").execute(claimRole);
  assert.match(claimRole.replies[0].content, /vai trò/i);
  const dailyCheckin = interaction({
    options: { getSubcommand: () => "diemdanh" },
  });
  await require("../src/commands/nhiemvu").execute(dailyCheckin);
  assert.match(dailyCheckin.replies[0].content, /điểm danh/i);
  const nhiemvuKiemtra = interaction({
    options: { getSubcommand: () => "kiemtra" },
  });
  await require("../src/commands/nhiemvu").execute(nhiemvuKiemtra);
  assert.match(nhiemvuKiemtra.replies[0].embeds[0].toJSON().title, /KIỂM TRA/);
  assert.equal(
    nhiemvuKiemtra.replies[0].components[0].components[0].options.length,
    9,
  );
  const kiemtraUpdates = [];
  const kiemtraSelect = (values) => ({
    customId: "kiemtra:alice",
    values,
    guildId: "command-guild",
    user: { id: "alice" },
    update: async (payload) => {
      kiemtraUpdates.push(payload);
      return payload;
    },
    reply: async (payload) => payload,
  });
  const tenTicketsBefore =
    require("../src/services/gachaService").getTicketBalances(
      "command-guild",
      "alice",
    ).ten;
  await require("../src/commands/kiemtra").handleSelect(
    kiemtraSelect(["tanthu"]),
  );
  assert.match(
    kiemtraUpdates[0].embeds[0].toJSON().title,
    /ĐÃ NHẬN THƯỞNG TÂN THỦ/,
  );
  await require("../src/commands/kiemtra").handleSelect(
    kiemtraSelect(["tanthu"]),
  );
  assert.match(
    kiemtraUpdates[1].embeds[0].toJSON().description,
    /đã nhận thưởng tân thủ trước đây/,
  );
  const newbieAgain = interaction({
    options: { getSubcommand: () => "tanthu" },
  });
  await require("../src/commands/nhiemvu").execute(newbieAgain);
  assert.match(newbieAgain.replies[0].content, /đã nhận thưởng tân thủ/);
  assert.equal(
    require("../src/services/gachaService").getTicketBalances(
      "command-guild",
      "alice",
    ).ten,
    tenTicketsBefore + 1,
    "thưởng tân thủ chỉ trao đúng 1 vé ×10, một lần",
  );
  const foreign = [];
  await require("../src/commands/kiemtra").handleSelect({
    ...kiemtraSelect(["ngay"]),
    user: { id: "bob" },
    reply: async (payload) => {
      foreign.push(payload);
      return payload;
    },
  });
  assert.equal(foreign.length, 1);

  const help = require("../src/commands/trogiup");
  assert.equal(
    help.helpRow("alice").components[0].options.length,
    help.TABS.length,
  );
  for (const tab of help.TABS)
    assert(help.helpEmbed(tab.id).toJSON().fields.length > 0);
  const helpUpdates = [];
  await help.handleSelect({
    customId: "trogiup:alice",
    values: ["trochoi"],
    user: { id: "alice" },
    update: async (payload) => {
      helpUpdates.push(payload);
      return payload;
    },
    reply: async (payload) => payload,
  });
  assert.match(helpUpdates[0].embeds[0].toJSON().title, /TRÒ CHƠI/);
  assert.equal(
    helpUpdates[0].components[0].components[0].options.find(
      (option) => option.data.value === "trochoi",
    ).data.default,
    true,
  );
  const helpDenied = [];
  await help.handleSelect({
    customId: "trogiup:alice",
    values: ["quantri"],
    user: { id: "bob" },
    update: async (payload) => payload,
    reply: async (payload) => {
      helpDenied.push(payload);
      return payload;
    },
  });
  assert.equal(helpDenied.length, 1);
  assert.equal(help.helpEmbed("invalid"), null);

  const shop = require("../src/services/shopService");
  shop.addInventory("command-guild", "alice", "blackjack_redraw", 1);
  const prefixReplies = [];
  const prefixHandled =
    await require("../src/services/gamePrefixService").handleGamePrefix({
      guildId: "command-guild",
      channelId: "channel",
      content: "!use",
      author: { id: "alice", bot: false },
      reply: async (payload) => {
        prefixReplies.push(payload);
        return { id: "prefix-use-message" };
      },
    });
  assert.equal(prefixHandled, true);
  assert.equal(
    prefixReplies[0].embeds[0].toJSON().title,
    "🎒 SỬ DỤNG VẬT PHẨM",
  );
  assert.equal(prefixReplies[0].components[0].components.length, 1);

  const useUpdates = [];
  const useFollowUps = [];
  await require("../src/commands/use").handleSelect({
    customId: "use:alice",
    values: ["blackjack_redraw"],
    guildId: "command-guild",
    channelId: "channel",
    user: { id: "alice" },
    update: async (payload) => {
      useUpdates.push(payload);
      return payload;
    },
    followUp: async (payload) => {
      useFollowUps.push(payload);
      return payload;
    },
    reply: async (payload) => payload,
  });
  assert.equal(useUpdates.length, 1);
  assert.equal(useFollowUps.length, 1);

  const leaderboard = require("../src/commands/xephang");
  assert.equal(leaderboard.data.toJSON().options?.length || 0, 0);
  assert.equal(
    leaderboard.leaderboardRow("alice").components[0].options.length,
    11,
  );
  assert(
    !leaderboard
      .leaderboardRow("alice")
      .components[0].options.some(
        (option) => option.data.value === "vuatiengviet",
      ),
  );
  require("../src/services/economyService").recordGameResult({
    guildId: "command-guild",
    userId: "alice",
    game: "mines",
    outcome: "win",
  });
  assert.match(
    leaderboard.gameEmbed("empty-leaderboard-guild", "mines").toJSON()
      .description,
    /chưa có dữ liệu/i,
  );
  const leaderboardUpdates = [];
  await leaderboard.handleSelect({
    customId: "xephang:alice",
    values: ["mines"],
    guildId: "command-guild",
    user: { id: "alice" },
    update: async (payload) => {
      leaderboardUpdates.push(payload);
      return payload;
    },
    reply: async (payload) => payload,
  });
  assert.equal(leaderboardUpdates.length, 1);
  assert.match(leaderboardUpdates[0].embeds[0].toJSON().title, /MINES/);
  assert.match(
    leaderboard.gameEmbed("command-guild", "mines", "Server Kiểm Thử").toJSON()
      .title,
    /SERVER KIỂM THỬ/,
  );
  assert.equal(leaderboard.gameEmbed("command-guild", "unknown"), null);
  const { db: leaderboardDb } = require("../src/db");
  leaderboardDb
    .prepare(
      "INSERT INTO hardcore_records (guild_id,user_id,best_floor,runs,deaths,escapes,completions,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run("command-guild", "alice", 12, 1, 0, 1, 0, 1);
  leaderboardDb
    .prepare(
      "INSERT INTO hardcore_records (guild_id,user_id,best_floor,runs,deaths,escapes,completions,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run("command-guild", "bob", 5, 20, 0, 20, 0, 2);
  for (let index = 0; index < 20; index++)
    require("../src/services/economyService").recordGameResult({
      guildId: "command-guild",
      userId: "bob",
      game: "hardcore",
      outcome: "win",
    });
  const survival = leaderboard
    .gameEmbed("command-guild", "hardcore", "Server Kiểm Thử")
    .toJSON();
  assert.match(survival.title, /SINH TỒN/);
  assert.match(survival.footer.text, /tầng đã vượt cao nhất/i);
  assert(
    survival.description.indexOf("<@alice>") <
      survival.description.indexOf("<@bob>"),
    "Sinh tồn phải xếp theo tầng, không theo số trận thắng",
  );
  assert.match(survival.description, /tầng 12/);
  const survivalUpdates = [];
  await leaderboard.handleSelect({
    customId: "xephang:alice",
    values: ["hardcore"],
    guildId: "command-guild",
    user: { id: "alice" },
    update: async (payload) => {
      survivalUpdates.push(payload);
      return payload;
    },
    reply: async (payload) => payload,
  });
  assert.equal(
    survivalUpdates[0].embeds[0].toJSON().description,
    survival.description,
  );
  const survivalTop = interaction({ options: { getSubcommand: () => "top" } });
  await require("../src/commands/hardcore").execute(survivalTop);
  const survivalTopEmbed = survivalTop.replies[0].embeds[0].toJSON();
  assert.match(survivalTopEmbed.title, /SINH TỒN/);
  assert(
    survivalTopEmbed.description.indexOf("<@alice>") <
      survivalTopEmbed.description.indexOf("<@bob>"),
  );
  const assetUpdates = [];
  await leaderboard.handleSelect({
    customId: "xephang:alice",
    values: ["assets"],
    guildId: "command-guild",
    user: { id: "alice" },
    update: async (payload) => {
      assetUpdates.push(payload);
      return payload;
    },
    reply: async (payload) => payload,
  });
  assert.match(assetUpdates[0].embeds[0].toJSON().title, /TÀI SẢN/);
  const deniedReplies = [];
  await leaderboard.handleSelect({
    customId: "xephang:alice",
    values: ["assets"],
    guildId: "command-guild",
    user: { id: "bob" },
    update: async (payload) => payload,
    reply: async (payload) => {
      deniedReplies.push(payload);
      return payload;
    },
  });
  assert.equal(deniedReplies.length, 1);

  const poker = require("../src/services/pokerService");
  const betLimits = require("../src/services/gameBetLimitService");
  betLimits.setGameBetLimit("command-guild", "poker", 100);
  const pokerRound = poker.startPoker({
    guildId: "command-guild",
    channelId: "channel",
    userId: "alice",
    variant: "texas",
  });
  const invalidRaiseReplies = [];
  const invalidRaiseUpdates = [];
  await poker.handlePokerModal({
    customId: `poker-modal:${pokerRound.session.id}:raise`,
    user: { id: "alice" },
    fields: { getTextInputValue: () => "51" },
    update: async (payload) => {
      invalidRaiseUpdates.push(payload);
      return payload;
    },
    followUp: async (payload) => {
      invalidRaiseReplies.push(payload);
      return payload;
    },
  });
  assert.match(invalidRaiseReplies[0].content, /tối đa.*50 :coin:/i);
  assert.equal(invalidRaiseUpdates.length, 1);
  assert.equal(poker.getSession(pokerRound.session.id).user_id, "alice");
  betLimits.setGameBetLimit("command-guild", "poker", 55);
  const staleRaiseReplies = [];
  const staleRaiseUpdates = [];
  await poker.handlePokerButton({
    customId: `poker:${pokerRound.session.id}:raise`,
    user: { id: "alice" },
    showModal: async () => {
      throw new Error("Raise button must be disabled after limit drops");
    },
    update: async (payload) => {
      staleRaiseUpdates.push(payload);
      return payload;
    },
    followUp: async (payload) => {
      staleRaiseReplies.push(payload);
      return payload;
    },
  });
  assert.match(staleRaiseReplies[0].content, /không thể tố thêm/i);
  assert.equal(
    staleRaiseUpdates[0].components[0].components[0].data.disabled,
    true,
  );
  poker.playerAction(pokerRound.session.id, "alice", "fold");

  const quantri = require("../src/commands/quantri");
  const resetOptions = (user) => ({
    getSubcommand: () => "xoadulieu",
    getString: () => "server",
    getUser: () => user,
  });
  const resetPreview = interaction({ options: resetOptions(null) });
  await quantri.execute(resetPreview);
  assert.match(resetPreview.replies[0].content, /RESET SERVER/);
  assert.match(resetPreview.replies[0].content, /giữ nguyên/i);
  assert.equal(
    resetPreview.replies[0].components[0].components[0].data.custom_id,
    "admin-clear-all:server:alice:confirm",
  );
  const resetWithUser = interaction({ options: resetOptions({ id: "bob" }) });
  await quantri.execute(resetWithUser);
  assert.match(resetWithUser.replies[0].content, /bỏ trống/);
  const resetUpdates = [];
  await quantri.handleClearAllButton({
    customId: "admin-clear-all:server:alice:confirm",
    guildId: "command-guild",
    user: { id: "alice" },
    memberPermissions: { has: () => true },
    update: async (payload) => {
      resetUpdates.push(payload);
      return payload;
    },
    reply: async (payload) => payload,
  });
  assert.match(resetUpdates[0].content, /Đã reset server/);
  const strangerReplies = [];
  await quantri.handleClearAllButton({
    customId: "admin-clear-all:server:alice:confirm",
    guildId: "command-guild",
    user: { id: "mallory" },
    memberPermissions: { has: () => false },
    update: async () => {
      throw new Error("người lạ không được reset server");
    },
    reply: async (payload) => {
      strangerReplies.push(payload);
      return payload;
    },
  });
  assert.equal(strangerReplies.length, 1);

  const announcement = require("../src/announcements/launch")
    .launchEmbeds()
    .map((embed) => embed.toJSON());
  assert(announcement.length <= 10);
  assert(
    announcement.reduce((sum, embed) => sum + JSON.stringify(embed).length, 0) <
      6000,
    "Tổng embed vượt giới hạn 6000 ký tự của một tin nhắn",
  );
  const embedChars = (embed) =>
    (embed.title || "").length +
    (embed.description || "").length +
    (embed.footer?.text || "").length +
    (embed.fields || []).reduce(
      (sum, field) => sum + field.name.length + field.value.length,
      0,
    );
  assert(
    announcement.reduce((sum, embed) => sum + embedChars(embed), 0) <= 6000,
  );
  for (const embed of announcement)
    assert(
      (embed.fields || []).every(
        (field) => field.name.length <= 256 && field.value.length <= 1024,
      ),
    );
  const announcedCommands = new Set(
    announcement
      .flatMap(
        (embed) => JSON.stringify(embed).match(/`\/[a-z]+(?: [a-z]+)?/g) || [],
      )
      .map((text) => text.slice(2)),
  );
  const registered = new Map(
    require("../src/commandRegistry")
      .loadCommands()
      .map((command) => [command.data.toJSON().name, command.data.toJSON()]),
  );
  for (const text of announcedCommands) {
    const [name, sub] = text.split(" ");
    assert(
      registered.has(name),
      `Thông báo nhắc tới lệnh không tồn tại: /${name}`,
    );
    if (
      sub &&
      registered
        .get(name)
        .options?.some((option) => option.type === 1 || option.type === 2)
    ) {
      assert(
        registered.get(name).options.some((option) => option.name === sub),
        `Thông báo nhắc tới subcommand không tồn tại: /${name} ${sub}`,
      );
    }
  }

  const { db } = require("../src/db");
  db.close();
  for (const suffix of ["", "-wal", "-shm"])
    fs.rmSync(`${testDb}${suffix}`, { force: true });
  console.log(JSON.stringify({ ok: true, commandHandlers: 14 }));
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
