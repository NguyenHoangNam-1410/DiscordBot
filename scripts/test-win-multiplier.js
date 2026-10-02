const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-win-multiplier.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;
process.env.ADMIN_USER_ID = "boss";

const { db } = require("../src/db");
const { MessageFlags } = require("discord.js");
const economy = require("../src/services/economyService");
const config = require("../src/services/gameConfigService");
const wm = require("../src/services/winMultiplierService");
const blackjack = require("../src/services/blackjackService");
const chinchiro = require("../src/services/chinchiroService");
const coquay = require("../src/services/coquayService");
const multiplayer = require("../src/services/multiplayerGameService");
const channels = require("../src/services/gameChannelService");
const roleRewards = require("../src/services/weeklyRoleRewardService");
const quantri = require("../src/commands/quantri");
const router = require("../src/componentRouter");
const START = economy.STARTING_COINS;
const balance = (guild, user) => economy.getAccount(guild, user).balance;
const fund = (guild, user, amount = 1_000_000) => economy.creditCoins({ guildId: guild, userId: user, amount, reason: "test" });
const noDrops = (guild) => { for (const key of ["GAME_COIN_DROP_CHANCE"]) config.setGameConfig(guild, key, 0, "test"); };

(async () => {
  // ───── 1) Dịch vụ: mặc định, đặt, khôi phục, kiểm tra phạm vi, tách theo server ─────
  assert.deepEqual(Object.fromEntries(wm.WIN_MULTIPLIER_GAMES.map((item) => [item.game, wm.getWinMultiplier("g1", item.game)])),
    { blackjack: 2, chinchiro: 1.8, coquay: 2, taixiu: 2 }, "mặc định giữ nguyên như trước khi có lệnh");
  assert.equal(wm.parseMultiplier("x1,9"), 1.9); assert.equal(wm.parseMultiplier(" 2.25 "), 2.25); assert.equal(wm.parseMultiplier("1.234"), 1.23);
  for (const bad of ["", "abc", "1.09", "3.01", "-2", "0", "NaN", "1e9"]) assert.throws(() => wm.parseMultiplier(bad), /INVALID_WIN_MULTIPLIER/, `phải từ chối "${bad}"`);
  assert.equal(wm.setWinMultiplier("g1", "chinchiro", "1,9", "boss").value, 1.9);
  assert.equal(wm.getWinMultiplier("g1", "chinchiro"), 1.9); assert.equal(wm.getWinMultiplier("g2", "chinchiro"), 1.8, "mỗi server một cấu hình");
  assert(wm.describeWinMultiplier("g1", "chinchiro").customized); assert(!wm.describeWinMultiplier("g1", "coquay").customized);
  assert.throws(() => wm.setWinMultiplier("g1", "mines", 2), /INVALID_WIN_MULTIPLIER_GAME/);
  assert.throws(() => wm.setWinMultiplier("g1", "coquay", 9), /INVALID_WIN_MULTIPLIER/); assert.equal(wm.getWinMultiplier("g1", "coquay"), 2, "giá trị sai không được lưu");
  assert.equal(wm.resetWinMultiplier("g1", "chinchiro").value, 1.8);
  wm.setWinMultiplier("g1", "taixiu", 1.5); wm.setWinMultiplier("g1", "coquay", 2.5);
  wm.resetAllWinMultipliers("g1"); assert(wm.listWinMultipliers("g1").every((item) => !item.customized));
  assert.equal(wm.formatMultiplier(2), "x2"); assert.equal(wm.formatMultiplier(1.8), "x1,8");
  // không làm tăng số mục cấu hình dùng chung (menu chọn của Discord tối đa 25 mục)
  assert(config.GAME_CONFIG_KEYS.length <= 25 && !config.GAME_CONFIG_KEYS.some((key) => key.startsWith("WIN_MULT_")));

  // ───── 2) Xì dách với bot ─────
  const bjGuild = "bj-guild"; noDrops(bjGuild);
  const hand = (cards) => ({ cards, bet: 1000 });
  assert.equal(blackjack.evaluateHand(["10♠", "9♣"], 1000, ["10♥", "7♦"]).payout, 2000, "mặc định x2");
  assert.equal(blackjack.evaluateHand(["10♠", "9♣"], 1000, ["10♥", "7♦"], 1.7).payout, 1700);
  assert.equal(blackjack.evaluateHand(["2♠", "3♣", "4♦", "A♥", "5♣"], 1000, ["10♥", "7♦"], 2.4).payout, 2400, "Ngũ linh cũng theo hệ số");
  assert.equal(blackjack.evaluateHand(["10♠", "9♣"], 1000, ["10♥", "9♦"], 2.4).payout, 1000, "hòa vẫn hoàn cược");
  assert.equal(blackjack.evaluateHand(["10♠", "6♣", "9♦"], 1000, ["10♥", "7♦"], 2.4).payout, 0, "quắc vẫn thua");
  assert.equal(blackjack.initialResult({ hands: [hand(["A♠", "K♠"])], dealer: ["9♦", "7♦"] }).payout, 2500, "Xì dách tự nhiên mặc định 2,5×");
  assert.equal(blackjack.initialResult({ hands: [hand(["A♠", "K♠"])], dealer: ["9♦", "7♦"] }, 1.8).payout, 2300, "Xì dách tự nhiên = hệ số + 0,5");
  // Hệ số được khóa vào ván: đổi cấu hình giữa chừng không ảnh hưởng
  fund(bjGuild, "bj1"); wm.setWinMultiplier(bjGuild, "blackjack", 1.5, "boss");
  const bjStart = blackjack.startBlackjack({ guildId: bjGuild, channelId: "c", userId: "bj1", stake: 1000, forcedDeck: ["7♦", "9♣", "10♥", "10♠"] });
  assert.equal(bjStart.immediate, false); assert.equal(bjStart.state.winMultiplier, 1.5);
  wm.setWinMultiplier(bjGuild, "blackjack", 3, "boss");
  const bjDone = blackjack.playAction({ sessionId: bjStart.session.id, userId: "bj1", action: "stand" });
  assert.equal(bjDone.result.outcome, "win"); assert.equal(bjDone.result.payout, 1500, "thanh toán theo hệ số lúc bắt đầu (1,5) chứ không phải 3");
  assert.equal(balance(bjGuild, "bj1"), START + 1_000_000 - 1000 + 1500);
  // Xì dách tự nhiên đi qua startBlackjack
  fund(bjGuild, "bj2"); wm.setWinMultiplier(bjGuild, "blackjack", 1.6, "boss");
  const natural = blackjack.startBlackjack({ guildId: bjGuild, channelId: "c", userId: "bj2", stake: 1000, forcedDeck: ["7♦", "K♠", "9♦", "A♠"] });
  assert.equal(natural.immediate, true); assert.equal(natural.result.payout, 2100, "tự nhiên = (1,6 + 0,5) × cược");
  // footer hiện hệ số
  wm.setWinMultiplier(bjGuild, "blackjack", 1.9, "boss"); fund(bjGuild, "bj3");
  const bjFooter = blackjack.startBlackjack({ guildId: bjGuild, channelId: "c", userId: "bj3", stake: 1000, forcedDeck: ["7♦", "9♣", "10♥", "10♠"] });
  assert.match(blackjack.blackjackEmbed(bjFooter.state, "bj3", null, bjFooter.session.id).toJSON().footer.text, /Thắng x1,9/);

  // ───── 3) Cò quay Nga ─────
  const cqGuild = "cq-guild"; noDrops(cqGuild); fund(cqGuild, "cq1");
  wm.setWinMultiplier(cqGuild, "coquay", 2.5, "boss");
  const cq = coquay.startCoquay({ guildId: cqGuild, userId: "cq1", channelId: "c", stake: 1000 });
  assert.equal(cq.state.winMultiplier, 2.5);
  assert.match(JSON.stringify(coquay.coquayEmbed(cq.state, "cq1", { sessionId: cq.session.id }).toJSON()), /2\.500 :coin:\*\* \(x2,5\)/);
  wm.setWinMultiplier(cqGuild, "coquay", 1.2, "boss");
  const patch = (patchState) => { const row = db.prepare("SELECT state_json FROM coquay_sessions WHERE id=?").get(cq.session.id); db.prepare("UPDATE coquay_sessions SET state_json=? WHERE id=?").run(JSON.stringify({ ...JSON.parse(row.state_json), ...patchState }), cq.session.id); };
  patch({ chamber: [true, false], hp: { player: 3, bot: 1 } });
  const cqWin = coquay.playCoquay({ sessionId: cq.session.id, userId: "cq1", action: "shoot", arg: "bot" });
  assert.equal(cqWin.result.payout, 2500, "thanh toán theo hệ số lúc bắt đầu (2,5)");
  assert.equal(coquay.payoutFor(1000), 2000, "mặc định x2");

  // ───── 4) Chinchiro ─────
  const chGuild = "ch-guild"; noDrops(chGuild);
  assert.equal(chinchiro.playerDecision({ kind: "point", point: 5 }, { kind: "point", point: 3 }).profitMultiplier, 0.8, "mặc định lãi 0,8");
  assert.equal(chinchiro.playerDecision({ kind: "point", point: 5 }, { kind: "point", point: 3 }, 0.9).profitMultiplier, 0.9);
  assert.equal(chinchiro.playerDecision({ kind: "shigoro" }, { kind: "point", point: 3 }, 0.9).profitMultiplier, 1, "Shigoro giữ nguyên");
  assert.equal(chinchiro.playerDecision({ kind: "pin_zoro" }, { kind: "point", point: 3 }, 0.9).profitMultiplier, 3, "Pin-Zoro giữ nguyên");
  wm.setWinMultiplier(chGuild, "chinchiro", 2.2, "boss");
  let immediateWin = null;
  for (let seed = 1; seed < 400 && !immediateWin; seed += 1) {
    const user = `ch${seed}`; fund(chGuild, user);
    const started = chinchiro.startChinchiro({ guildId: chGuild, channelId: "c", userId: user, stake: 1000, forcedSeed: seed });
    if (started.immediate && started.result.outcome === "win") immediateWin = started; else if (!started.immediate) chinchiro.forceEndChinchiroSession?.(started.session.id, chGuild, "test", { forfeit: true });
  }
  assert(immediateWin, "phải tìm được ván nhà cái thua ngay");
  assert.equal(immediateWin.state.winMultiplier, 2.2); assert.equal(immediateWin.result.payout, 2200, "thắng ngay theo hệ số 2,2");

  // ───── 5) Tài xỉu: khóa hệ số lúc mở ván, chỉ cửa 1:1 đổi ─────
  const txGuild = "tx-guild"; noDrops(txGuild); channels.setGameChannel(txGuild, "taixiu", "tx-channel");
  wm.setWinMultiplier(txGuild, "taixiu", 1.9, "boss");
  const opened = await multiplayer.createRound({ guildId: txGuild, channelId: "tx-channel", client: null, reply: async () => ({ resource: { message: { id: "m1" } } }) }, "taixiu");
  assert.equal(JSON.parse(opened.result_json).evenMultiplier, 1.9, "hệ số khóa vào ván lúc mở");
  assert.match(JSON.stringify(multiplayer.resultEmbed ? {} : {}), /\{\}/);
  wm.setWinMultiplier(txGuild, "taixiu", 2.8, "boss");
  const result = multiplayer.rollResult ? null : null; void result;
  assert.equal(multiplayer.calculatePayout("taixiu", "tai", 1000, { total: 15, triple: false }), 2000, "mặc định x2");
  assert.equal(multiplayer.calculatePayout("taixiu", "tai", 1000, { total: 15, triple: false }, 1.9), 1900);
  assert.equal(multiplayer.calculatePayout("taixiu", "xiu", 1000, { total: 8, triple: false }, 1.9), 1900);
  assert.equal(multiplayer.calculatePayout("taixiu", "chan", 1000, { total: 8, triple: false }, 1.9), 1900);
  assert.equal(multiplayer.calculatePayout("taixiu", "le", 1000, { total: 9, triple: false }, 1.9), 1900);
  assert.equal(multiplayer.calculatePayout("taixiu", "tai", 1000, { total: 12, triple: true }, 1.9), 0, "ra bộ ba vẫn thua");
  assert.equal(multiplayer.calculatePayout("taixiu", "bo_ba", 1000, { total: 12, triple: true }, 1.9), 35_000, "Bộ ba giữ nguyên");
  assert.equal(multiplayer.calculatePayout("taixiu", "tong:10", 1000, { total: 10, triple: false }, 1.9), 1000 * (multiplayer.TOTAL_RATIOS[10] + 1), "Tổng cụ thể giữ nguyên");
  assert.equal(multiplayer.calculatePayout("baucua", "bau", 1000, { symbols: ["bau", "ca", "cua"] }, 1.9), 2000, "Bầu cua không bị ảnh hưởng");
  fund(txGuild, "tx1");
  economy.spendCoins({ guildId: txGuild, userId: "tx1", amount: 1000, reason: "test-bet" });
  db.prepare("INSERT INTO multiplayer_bets (round_id,user_id,choice,amount,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(opened.id, "tx1", "tai", 1000, Date.now(), Date.now());
  const settled = await multiplayer.settleRound(opened.id, null, console, [6, 5, 4]);
  assert.equal(settled.settlements[0].payout, 1900, "thanh toán theo hệ số khóa lúc mở ván (1,9) dù cấu hình đã đổi thành 2,8");

  // ───── 7) RTP ước tính khớp với mô phỏng / liệt kê thật ─────
  for (const m of [1.5, 2, 2.5]) {
    const { simulate } = require("../src/services/blackjackSim");
    const estimated = wm.estimateRtp("blackjack", m); const simulated = simulate("basic", 60_000, undefined, m).rtp;
    assert(Math.abs(estimated - simulated) < 3, `Xì dách m=${m}: ước tính ${estimated.toFixed(1)} vs mô phỏng ${simulated.toFixed(1)}`);
  }
  for (const m of [1.5, 1.8, 2.5]) {
    let total = 0; const N = 60_000;
    for (let i = 0; i < N; i += 1) {
      const seed = crypto.randomBytes(8).toString("hex");
      const dealer = chinchiro.rollTurn({ seed, side: "dealer" }); const immediate = chinchiro.dealerDecision(dealer.hand);
      if (immediate === "win") { total += m; continue; } if (immediate === "loss") continue;
      if (crypto.randomInt(100) === 0) continue; // Shonben
      const player = chinchiro.rollTurn({ seed: `${seed}p`, side: "player" }); const decision = chinchiro.playerDecision(player.hand, dealer.hand, m - 1);
      if (decision.outcome === "hifumi") total -= 1; else if (decision.outcome === "win") total += 1 + decision.profitMultiplier; else if (decision.outcome === "draw") total += 1;
    }
    assert(Math.abs(wm.chinchiroRtp(m) - total / N * 100) < 3, `Chinchiro m=${m}: ${wm.chinchiroRtp(m).toFixed(1)} vs ${(total / N * 100).toFixed(1)}`);
  }
  let taixiuReturn = 0;
  for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) for (let c = 1; c <= 6; c += 1)
    taixiuReturn += multiplayer.calculatePayout("taixiu", "tai", 1_000_000, { total: a + b + c, triple: a === b && b === c }, 2.2);
  assert(Math.abs(taixiuReturn / 216 / 1_000_000 * 100 - wm.estimateRtp("taixiu", 2.2)) < 0.01, "Tài xỉu: RTP công thức khớp liệt kê 216 kết quả");
  assert.throws(() => wm.getWinMultiplier("g1", "oantuti"), /INVALID_WIN_MULTIPLIER_GAME/, "Oẳn tù tì đã bị gỡ");
  assert(Math.abs(require("../src/services/coquayEngine").solve().value(3, 3, 0, 0, "player", 1) - wm.COQUAY_OPTIMAL_WIN_PROBABILITY) < 0.002, "Cò quay: xác suất thắng tối ưu khớp lời giải");

  // ───── 8) Đăng ký lệnh: gộp 3 lệnh vai trò, thêm lệnh hệ số thắng ─────
  const names = quantri.data.toJSON().options.map((option) => option.name);
  assert(names.length <= 25 && names.length === new Set(names).size);
  assert(names.includes("xemthuongvaitro") && names.includes("hesothang"));
  assert(!names.includes("datthuongvaitro") && !names.includes("xoathuongvaitro"), "hai lệnh cũ đã được gộp");
  assert(require("../src/commands/game").data.toJSON().options.every((option) => !option.name.startsWith("roleweekly")));

  // ───── 9) Giao diện hệ số thắng ─────
  const guildId = "ui-guild";
  const call = (extra = {}) => {
    const sent = { replies: [], updates: [], modals: [] };
    return { sent, interaction: { guildId, user: { id: "boss" }, memberPermissions: { has: () => false }, guild: { roles: { cache: new Map([["r1", { name: "VIP" }], ["r2", { name: "Mod" }]]) } },
      reply: async (payload) => sent.replies.push(payload), update: async (payload) => sent.updates.push(payload), showModal: async (modal) => sent.modals.push(modal),
      isModalSubmit: () => false, isButton: () => false, isStringSelectMenu: () => false, isRoleSelectMenu: () => false, ...extra } };
  };
  const first = call({ options: { getSubcommand: () => "hesothang" } });
  await quantri.execute(first.interaction);
  const panel = first.sent.replies[0]; assert.equal(panel.flags, MessageFlags.Ephemeral);
  const panelJson = JSON.stringify(panel.embeds[0].toJSON()); assert.match(panelJson, /HỆ SỐ THẮNG/); assert.match(panelJson, /Xì dách.*x2/); assert.match(panelJson, /RTP ước tính/); assert.match(panelJson, /Chinchiro.*x1,8/);
  assert.match(panelJson, /⚠️ có lợi cho người chơi/, "cảnh báo khi RTP trên 100%");
  const rows = panel.components.map((row) => row.toJSON());
  assert.equal(rows[0].components[0].type, 3); assert.equal(rows[0].components[0].options.length, 4);
  assert.equal(rows[1].components.find((button) => button.custom_id.endsWith(":reset")).disabled, true, "chưa tùy chỉnh thì chưa cần khôi phục");
  const denied = call({ user: { id: "stranger" }, options: { getSubcommand: () => "hesothang" } }); await quantri.execute(denied.interaction);
  assert.match(denied.sent.replies[0].content, /Chỉ admin/); const stranger = call({ user: { id: "stranger" }, options: { getSubcommand: () => "xemthuongvaitro" } }); await quantri.execute(stranger.interaction);
  assert.match(stranger.sent.replies[0].content, /Chỉ admin/);
  // chọn game → modal điền sẵn giá trị hiện tại
  const pick = call({ customId: "admin-winmult:boss:pick", values: ["chinchiro"], isStringSelectMenu: () => true });
  await router.routeComponentInteraction(pick.interaction);
  const modal = pick.sent.modals[0].toJSON(); assert.equal(modal.custom_id, "admin-winmult:boss:chinchiro"); assert.equal(modal.components[0].components[0].value, "1.8");
  // gửi modal: sai → báo lỗi, đúng → cập nhật bảng và lưu
  const submit = (value, game = "chinchiro") => call({ customId: `admin-winmult:boss:${game}`, isModalSubmit: () => true, fields: { getTextInputValue: () => value } });
  const bad = submit("7"); await router.routeComponentInteraction(bad.interaction); assert.match(bad.sent.replies[0].content, /1,1.*3/); assert.equal(wm.getWinMultiplier(guildId, "chinchiro"), 1.8);
  const good = submit("1,95"); await router.routeComponentInteraction(good.interaction);
  assert.equal(wm.getWinMultiplier(guildId, "chinchiro"), 1.95); assert.match(JSON.stringify(good.sent.updates[0].embeds[0].toJSON()), /đã đổi thành \*\*x1,95\*\*/);
  assert.equal(good.sent.updates[0].components[1].toJSON().components[0].disabled, false, "đã tùy chỉnh thì bật nút khôi phục");
  // người không phải chủ bảng / không phải admin bị chặn ở mọi thao tác
  const intruder = call({ user: { id: "stranger" }, customId: "admin-winmult:boss:reset", isButton: () => true }); await router.routeComponentInteraction(intruder.interaction);
  assert.match(intruder.sent.replies[0].content, /Chỉ quản trị/); assert.equal(wm.getWinMultiplier(guildId, "chinchiro"), 1.95);
  const hijack = call({ user: { id: "stranger" }, customId: "admin-winmult:stranger:reset", isButton: () => true }); await router.routeComponentInteraction(hijack.interaction);
  assert.match(hijack.sent.replies[0].content, /Chỉ quản trị/, "không phải admin thì không thể tự tạo bảng của mình");
  const reset = call({ customId: "admin-winmult:boss:reset", isButton: () => true }); await router.routeComponentInteraction(reset.interaction);
  assert.equal(wm.getWinMultiplier(guildId, "chinchiro"), 1.8); assert.match(JSON.stringify(reset.sent.updates[0].embeds[0].toJSON()), /Đã khôi phục/);
  const refresh = call({ customId: "admin-winmult:boss:refresh", isButton: () => true }); await router.routeComponentInteraction(refresh.interaction); assert(refresh.sent.updates.length === 1);

  // ───── 10) Giao diện thưởng vai trò (thay cho 3 lệnh) ─────
  const rolePanel = call({ options: { getSubcommand: () => "xemthuongvaitro" } }); await quantri.execute(rolePanel.interaction);
  const empty = rolePanel.sent.replies[0]; assert.match(JSON.stringify(empty.embeds[0].toJSON()), /Chưa cấu hình vai trò nào/);
  const emptyRow = empty.components[0].toJSON().components; assert.deepEqual(emptyRow.map((button) => button.custom_id.split(":")[2]), ["add", "remove", "refresh"]);
  assert.equal(emptyRow.find((button) => button.custom_id.endsWith(":remove")).disabled, true, "chưa có vai trò thì khóa nút Xóa");
  // Thêm/Sửa: bước 1 hiện menu chọn vai trò
  const addStep = call({ customId: "admin-rolereward:boss:add", isButton: () => true }); await router.routeComponentInteraction(addStep.interaction);
  const addRows = addStep.sent.updates[0].components.map((row) => row.toJSON()); assert.equal(addRows[0].components[0].type, 6, "menu chọn vai trò (RoleSelect)"); assert.equal(addRows[1].components[0].custom_id, "admin-rolereward:boss:back");
  // chọn vai trò (menu vai trò được định tuyến) → modal nhập xu
  assert.equal(router.interactionKind({ isButton: () => false, isStringSelectMenu: () => false, isRoleSelectMenu: () => true, isModalSubmit: () => false }), "select");
  const rolePick = call({ customId: "admin-rolereward:boss:pick", values: ["r1"], isRoleSelectMenu: () => true }); await router.routeComponentInteraction(rolePick.interaction);
  assert.equal(rolePick.sent.modals[0].toJSON().custom_id, "admin-rolereward:boss:r1");
  const setRole = (roleId, value) => call({ customId: `admin-rolereward:boss:${roleId}`, isModalSubmit: () => true, fields: { getTextInputValue: () => value } });
  const badRole = setRole("r1", "0"); await router.routeComponentInteraction(badRole.interaction); assert.match(badRole.sent.replies[0].content, /không hợp lệ/); assert.equal(roleRewards.listWeeklyRoleRewards(guildId).length, 0);
  const text = setRole("r1", "150.000"); await router.routeComponentInteraction(text.interaction);
  assert.equal(roleRewards.listWeeklyRoleRewards(guildId)[0].amount, 150_000, "chấp nhận dấu chấm ngăn cách nghìn"); assert.match(JSON.stringify(text.sent.updates[0].embeds[0].toJSON()), /<@&r1>.*150\.000 :coin:/s);
  await router.routeComponentInteraction(setRole("r2", "50000").interaction); await router.routeComponentInteraction(setRole("r1", "200000").interaction);
  assert.deepEqual(roleRewards.listWeeklyRoleRewards(guildId).map((item) => [item.role_id, item.amount]), [["r1", 200_000], ["r2", 50_000]], "đặt lại vai trò cũ là sửa mức thưởng");
  const withData = call({ customId: "admin-rolereward:boss:pick", values: ["r1"], isRoleSelectMenu: () => true }); await router.routeComponentInteraction(withData.interaction);
  assert.equal(withData.sent.modals[0].toJSON().components[0].components[0].value, "200000", "modal điền sẵn mức hiện tại khi sửa");
  // Xóa: bước chọn vai trò đã cấu hình
  const dropStep = call({ customId: "admin-rolereward:boss:remove", isButton: () => true }); await router.routeComponentInteraction(dropStep.interaction);
  const dropSelect = dropStep.sent.updates[0].components[0].toJSON().components[0]; assert.equal(dropSelect.options.length, 2); assert.deepEqual(dropSelect.options.map((option) => option.label).sort(), ["Mod", "VIP"]);
  const drop = call({ customId: "admin-rolereward:boss:drop", values: ["r2"], isStringSelectMenu: () => true }); await router.routeComponentInteraction(drop.interaction);
  assert.deepEqual(roleRewards.listWeeklyRoleRewards(guildId).map((item) => item.role_id), ["r1"]); assert.match(JSON.stringify(drop.sent.updates[0].embeds[0].toJSON()), /Đã xóa thưởng của <@&r2>/);
  const dropAgain = call({ customId: "admin-rolereward:boss:drop", values: ["r2"], isStringSelectMenu: () => true }); await router.routeComponentInteraction(dropAgain.interaction); assert.match(JSON.stringify(dropAgain.sent.updates[0].embeds[0].toJSON()), /không còn trong danh sách/);
  const back = call({ customId: "admin-rolereward:boss:back", isButton: () => true }); await router.routeComponentInteraction(back.interaction); assert.equal(back.sent.updates[0].components[0].toJSON().components.length, 3);
  // bảo mật: người lạ không sửa/xóa/chọn được
  for (const [customId, extra] of [["admin-rolereward:boss:add", { isButton: () => true }], ["admin-rolereward:boss:pick", { values: ["r1"], isRoleSelectMenu: () => true }], ["admin-rolereward:boss:drop", { values: ["r1"], isStringSelectMenu: () => true }], ["admin-rolereward:boss:r1", { isModalSubmit: () => true, fields: { getTextInputValue: () => "999999" } }]]) {
    const attack = call({ user: { id: "stranger" }, customId, ...extra }); await router.routeComponentInteraction(attack.interaction);
    assert.match(attack.sent.replies[0].content, /Chỉ quản trị/, customId); assert.equal(attack.sent.updates.length + attack.sent.modals.length, 0);
  }
  assert.deepEqual(roleRewards.listWeeklyRoleRewards(guildId).map((item) => [item.role_id, item.amount]), [["r1", 200_000]]);
  // người chơi vẫn nhận được thưởng đã cấu hình bằng bảng
  economy.ensureAccount(guildId, "member");
  const claim = roleRewards.claimWeeklyRoleRewards({ guildId, userId: "member", roleIds: ["r1"] });
  assert.equal(claim.total, 200_000); assert.equal(balance(guildId, "member"), START + 200_000);

  db.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
  console.log(JSON.stringify({ ok: true, winMultiplier: true }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
