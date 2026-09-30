const assert = require('node:assert/strict');
const r = require('../src/utils/rewardText');
const appEmoji = require('../src/utils/appEmoji');

// Mọi metric đều đi kèm icon: xu :coin:, kim cương :gem:, EXP :test_tube:
assert.equal(r.coins(102000), '102.000 :coin:'); assert.equal(r.gems(3), '3 :gem:'); assert.equal(r.exp(11), '11 :test_tube:');
assert.equal(r.signedCoins(102000), '+102.000 :coin:'); assert.equal(r.signedCoins(-5000), '-5.000 :coin:'); assert.equal(r.signedCoins(0), '±0 :coin:');

// Dòng kết quả gọn: <user> thắng: +xu +exp, kèm BUFF SỰ KIỆN
const drops = [{ type: 'diamonds', amount: 3 }, { type: 'item', name: 'Bùa Khắc Chế', rarity: 'SSR', amount: 1 }];
assert.equal(r.resultLine({ userId: '1', outcome: 'win', stake: 0, payout: 102000, experienceGained: 11 }), '**<@1>** thắng: **+102.000 :coin: +11 :test_tube:**');
assert.equal(r.resultLine({ userId: '1', outcome: 'loss', stake: 5000, payout: 0, experienceGained: 10, reason: 'trúng mìn' }), '**<@1>** thua (trúng mìn): **-5.000 :coin: +10 :test_tube:**');
assert.equal(r.resultLine({ userId: '1', outcome: 'draw', stake: 100, payout: 100, experienceGained: 10 }), '**<@1>** hòa: **±0 :coin: +10 :test_tube:**');
assert.equal(r.resultLine({ outcome: 'win', stake: 100, payout: 300 }), '**Bạn** thắng: **+200 :coin:**', 'không có EXP thì không hiện EXP; không có userId thì là "Bạn"');
assert.equal(r.resultLine({ userId: '1', outcome: 'win', stake: 0, payout: 25, gemsGained: 10 }), '**<@1>** thắng: **+25 :coin: +10 :gem:**');
assert.match(r.resultLine({ userId: '1', outcome: 'win', stake: 0, payout: 1, experienceGained: 5, levelUps: [{ level: 4 }] }), /Lên cấp \*\*4\*\*/);
assert.equal(r.bonusLine([]), ''); assert.equal(r.bonusLine(null), '');
appEmoji.setApplicationEmojisForTest([]);
assert.equal(r.bonusLine(drops), '🎉 **BUFF SỰ KIỆN:** +3 :gem: · 🟠 [SSR] Bùa Khắc Chế');
assert.equal(r.bonusLine([{ type: 'coins', amount: 250 }]), '🎉 **BUFF SỰ KIỆN:** +250 :coin:');
// icon độ hiếm dùng emoji ứng dụng ssr_icon nếu có
appEmoji.setApplicationEmojisForTest([['ssr_icon', '123']]);
assert.equal(r.bonusLine([drops[1]]), '🎉 **BUFF SỰ KIỆN:** <:ssr_icon:123> [SSR] Bùa Khắc Chế');
appEmoji.setApplicationEmojisForTest([]);
assert.equal(r.resultBlock({ userId: '1', outcome: 'win', stake: 51000, payout: 102000, result: { experienceGained: 11, bonusDrops: drops } }),
  '**<@1>** thắng: **+51.000 :coin: +11 :test_tube:**\n🎉 **BUFF SỰ KIỆN:** +3 :gem: · 🟠 [SSR] Bùa Khắc Chế');
assert.equal(r.rewardSummary({ coins: 30000, diamonds: 100, experience: 50, item: 'x', quantity: 1, itemName: 'Bùa', itemRarity: 'SR' }), '+30.000 :coin: +100 :gem: +50 :test_tube: 🟣 [SR] Bùa ×1');
appEmoji.setApplicationEmojisForTest([]);
console.log(JSON.stringify({ ok: true, rewardText: true }));
