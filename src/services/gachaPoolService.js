const { db } = require("../db");
const { getCatalogItem, listCatalog } = require("./itemCatalogService");

const DEFAULT_ENTRIES = Object.freeze([
  {
    rewardKey: "coins_10000",
    kind: "coins",
    itemId: null,
    name: "10.000 xu",
    tier: "XU",
    amount: 10_000,
    weight: 1,
  },
  {
    rewardKey: "coins_20000",
    kind: "coins",
    itemId: null,
    name: "20.000 xu",
    tier: "XU",
    amount: 20_000,
    weight: 1,
  },
  {
    rewardKey: "coins_50000",
    kind: "coins",
    itemId: null,
    name: "50.000 xu",
    tier: "XU",
    amount: 50_000,
    weight: 1,
  },
  {
    rewardKey: "chinchiro_soundproof_bowl",
    kind: "item",
    itemId: "chinchiro_soundproof_bowl",
    name: "Bát Cách Âm",
    tier: "R",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "baucua_magnifier",
    kind: "item",
    itemId: "baucua_magnifier",
    name: "Kính Lúp Bầu Cua",
    tier: "SR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "taixiu_magnetic_dice",
    kind: "item",
    itemId: "taixiu_magnetic_dice",
    name: "Xúc Xắc Từ Tính",
    tier: "SR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "blackjack_redraw",
    kind: "item",
    itemId: "blackjack_redraw",
    name: "Thẻ Rút Lại",
    tier: "SR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "mines_radar",
    kind: "item",
    itemId: "mines_radar",
    name: "Radar Nhỏ",
    tier: "SR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "chinchiro_weighted_dice",
    kind: "item",
    itemId: "chinchiro_weighted_dice",
    name: "Xúc Xắc Chì",
    tier: "SR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "blackjack_swap",
    kind: "item",
    itemId: "blackjack_swap",
    name: "Lệnh Bài Đổi Trắng",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "gacha_ticket_1",
    kind: "item",
    itemId: "gacha_ticket_1",
    name: "Vé Gacha ×1 · SSR",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "horse_second_insurance",
    kind: "item",
    itemId: "horse_second_insurance",
    name: "Bảo Hiểm Về Nhì",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "mines_blast_shield",
    kind: "item",
    itemId: "mines_blast_shield",
    name: "Giáp Chống Nổ",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "poker_insurance",
    kind: "item",
    itemId: "poker_insurance",
    name: "Bảo Hiểm Cược Poker",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "chinchiro_otsuki_dice",
    kind: "item",
    itemId: "chinchiro_otsuki_dice",
    name: "Xúc Xắc Của Quản Đốc",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "divine_eye",
    kind: "item",
    itemId: "divine_eye",
    name: "Mắt Thần",
    tier: "UR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "gacha_ticket_10",
    kind: "item",
    itemId: "gacha_ticket_10",
    name: "Vé Gacha ×10",
    tier: "UR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "blackjack_ace",
    kind: "item",
    itemId: "blackjack_ace",
    name: "Át Chủ Bài",
    tier: "UR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "horse_jackpot",
    kind: "item",
    itemId: "horse_jackpot",
    name: "Trúng Đậm",
    tier: "UR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "living_dictionary",
    kind: "item",
    itemId: "living_dictionary",
    name: "Từ Điển Sống",
    tier: "UR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "vietnamese_syllable_lengths",
    kind: "item",
    itemId: "vietnamese_syllable_lengths",
    name: "Đếm Âm Tiết",
    tier: "SR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "vietnamese_first_word",
    kind: "item",
    itemId: "vietnamese_first_word",
    name: "Mở Đầu Từ Điển",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "chinchiro_karma_charm",
    kind: "item",
    itemId: "chinchiro_karma_charm",
    name: "Bùa Trả Đũa",
    tier: "UR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "vietnamese_word_count",
    kind: "item",
    itemId: "vietnamese_word_count",
    name: "Kính Soi Chữ",
    tier: "R",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "mines_row_scanner",
    kind: "item",
    itemId: "mines_row_scanner",
    name: "Máy Quét Hàng",
    tier: "R",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "mines_column_scanner",
    kind: "item",
    itemId: "mines_column_scanner",
    name: "Máy Quét Cột",
    tier: "R",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "baucua_small_lens",
    kind: "item",
    itemId: "baucua_small_lens",
    name: "Kính Lúp Nứt",
    tier: "R",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "taixiu_total_scope",
    kind: "item",
    itemId: "taixiu_total_scope",
    name: "Ống Ngắm Tổng Điểm",
    tier: "R",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "horse_consolation",
    kind: "item",
    itemId: "horse_consolation",
    name: "Vé Khán Đài",
    tier: "R",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "blackjack_bust_guard",
    kind: "item",
    itemId: "blackjack_bust_guard",
    name: "Miếng Đệm Quắc",
    tier: "R",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "poker_fold_coupon",
    kind: "item",
    itemId: "poker_fold_coupon",
    name: "Phiếu Bỏ Bài",
    tier: "R",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "taixiu_edge_insurance",
    kind: "item",
    itemId: "taixiu_edge_insurance",
    name: "Bảo Hiểm Sát Nút",
    tier: "SR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "baucua_blank_insurance",
    kind: "item",
    itemId: "baucua_blank_insurance",
    name: "Bảo Hiểm Trắng Tay",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "coquay_magnifier",
    kind: "item",
    itemId: "coquay_magnifier",
    name: "Kính Lúp Soi Nòng",
    tier: "SR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "coquay_decoy",
    kind: "item",
    itemId: "coquay_decoy",
    name: "Bia Đỡ Đạn",
    tier: "SR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "coquay_saw",
    kind: "item",
    itemId: "coquay_saw",
    name: "Cưa Cầm Tay",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "coquay_cuffs",
    kind: "item",
    itemId: "coquay_cuffs",
    name: "Còng Số 8",
    tier: "UR",
    amount: 1,
    weight: 1,
  },
  {
    rewardKey: "vietnamese_extra_time",
    kind: "item",
    itemId: "vietnamese_extra_time",
    name: "Đồng Hồ Gia Hạn",
    tier: "SSR",
    amount: 1,
    weight: 1,
  },
]);

function configuredRows(guildId) {
  return db
    .prepare("SELECT * FROM gacha_pool_entries WHERE guild_id=?")
    .all(String(guildId));
}

// Tỷ lệ theo độ hiếm là cố định (đơn vị: trọng số, tự chuẩn hóa về 100%). Số vật phẩm trong mỗi bậc không ảnh hưởng tỷ lệ bậc:
// bậc được chọn trước, rồi vật phẩm được chọn ngẫu nhiên đều trong bậc đó. `weight` của từng phần thưởng chỉ còn ý nghĩa bật (>0) / tắt (0).
const TIERS = Object.freeze(["XU", "R", "SR", "SSR", "UR"]);
const DEFAULT_TIER_RATES = Object.freeze({
  XU: 50,
  R: 22,
  SR: 14,
  SSR: 10,
  UR: 4,
});
const tierRateKey = (tier) => `GACHA_RATE_${tier}`;
function tierRates(guildId) {
  const config = require("./gameConfigService");
  const rates = {};
  for (const tier of TIERS)
    rates[tier] = guildId
      ? config.getGameConfig(String(guildId), tierRateKey(tier))
      : DEFAULT_TIER_RATES[tier];
  return rates;
}

function listGachaPool(
  guildId,
  { luckMultiplier = 1, tierMultipliers = {} } = {},
) {
  const overrides = new Map(
    configuredRows(guildId).map((row) => [row.reward_key, row]),
  );
  const defaults = DEFAULT_ENTRIES.map((entry) => {
    const row = overrides.get(entry.rewardKey);
    if (!row) return { ...entry, customized: false };
    overrides.delete(entry.rewardKey);
    return {
      rewardKey: row.reward_key,
      kind: row.kind,
      itemId: row.item_id,
      name: row.display_name,
      tier: row.tier,
      amount: row.amount,
      weight: row.weight,
      customized: true,
    };
  });
  const custom = [...overrides.values()].map((row) => ({
    rewardKey: row.reward_key,
    kind: row.kind,
    itemId: row.item_id,
    name: row.display_name,
    tier: row.tier,
    amount: row.amount,
    weight: row.weight,
    customized: true,
  }));
  const available = [...defaults, ...custom]
    .filter(
      (entry) =>
        entry.kind !== "item" ||
        getCatalogItem(entry.itemId)?.gachaEligible !== false,
    )
    .map((entry) =>
      entry.itemId === "vietnamese_word_count"
        ? { ...entry, name: getCatalogItem(entry.itemId).name }
        : entry,
    );
  const luck = Number.isFinite(Number(luckMultiplier))
    ? Math.max(1, Number(luckMultiplier))
    : 1;
  const rates =
    guildId === "__default__" ? { ...DEFAULT_TIER_RATES } : tierRates(guildId);
  const enabled = (tier) =>
    available.filter((entry) => entry.tier === tier && entry.weight > 0).length;
  const order = (tier) => TIERS.indexOf(tier);
  const entries = available
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) => order(a.entry.tier) - order(b.entry.tier) || a.index - b.index,
    )
    .map(({ entry }) => {
      const count = enabled(entry.tier);
      const tierWeight =
        rates[entry.tier] *
        (entry.tier === "XU" ? 1 : luck) *
        (Number(tierMultipliers[entry.tier]) || 1);
      return {
        ...entry,
        effectiveWeight: entry.weight > 0 && count ? tierWeight / count : 0,
      };
    });
  const total = entries.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
  return entries.map((entry) => ({
    ...entry,
    rate: total ? (entry.effectiveWeight / total) * 100 : 0,
  }));
}
// Tổng tỷ lệ thực tế của từng bậc (đã tính bậc không có phần thưởng nào bật).
function tierSummary(guildId, options) {
  const pool = listGachaPool(guildId, options);
  return TIERS.map((tier) => ({
    tier,
    count: pool.filter((entry) => entry.tier === tier && entry.weight > 0)
      .length,
    rate: pool
      .filter((entry) => entry.tier === tier)
      .reduce((sum, entry) => sum + entry.rate, 0),
  }));
}

function upsertEntry(guildId, entry, updatedBy) {
  db.prepare(
    `INSERT INTO gacha_pool_entries
    (guild_id,reward_key,kind,item_id,display_name,tier,amount,weight,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,reward_key) DO UPDATE SET
    kind=excluded.kind,item_id=excluded.item_id,display_name=excluded.display_name,tier=excluded.tier,
    amount=excluded.amount,weight=excluded.weight,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    entry.rewardKey,
    entry.kind,
    entry.itemId,
    entry.name,
    entry.tier,
    entry.amount,
    entry.weight,
    String(updatedBy),
    Date.now(),
  );
}

// Thêm (hoặc bật lại) một vật phẩm catalog vào bậc tương ứng; tỷ lệ bậc không đổi, chỉ chia đều cho thêm một vật phẩm.
function addGachaItem(guildId, itemId, tier, updatedBy) {
  const item = getCatalogItem(itemId);
  if (!item || item.gachaEligible === false)
    throw new Error("INVALID_GACHA_ITEM");
  if (!["R", "SR", "SSR", "UR"].includes(tier) || tier !== item.rarity)
    throw new Error("INVALID_GACHA_TIER");
  upsertEntry(
    guildId,
    {
      rewardKey: item.id,
      kind: "item",
      itemId: item.id,
      name: item.name,
      tier,
      amount: 1,
      weight: 1,
    },
    updatedBy,
  );
  return listGachaPool(guildId).find((entry) => entry.rewardKey === item.id);
}

// Bật/tắt một phần thưởng. Không thể để Gacha thiếu phần thưởng SR+ hoặc bậc UR không còn vật phẩm nào.
function setGachaEnabled(guildId, rewardKey, enabled, updatedBy) {
  const pool = listGachaPool(guildId);
  const entry = pool.find((item) => item.rewardKey === rewardKey);
  if (!entry) throw new Error("INVALID_GACHA_REWARD");
  if (!enabled) {
    const others = pool.filter(
      (item) => item.rewardKey !== rewardKey && item.weight > 0,
    );
    if (!others.length) throw new Error("EMPTY_GACHA_POOL");
    if (
      ["SR", "SSR", "UR"].includes(entry.tier) &&
      !others.some((item) => ["SR", "SSR", "UR"].includes(item.tier))
    )
      throw new Error("GACHA_REQUIRES_HIGH_TIER");
    if (
      entry.tier === "UR" &&
      !others.some((item) => item.tier === "UR" && item.kind === "item")
    )
      throw new Error("GACHA_REQUIRES_HIGH_TIER");
  }
  upsertEntry(guildId, { ...entry, weight: enabled ? 1 : 0 }, updatedBy);
  return listGachaPool(guildId).find((item) => item.rewardKey === rewardKey);
}

function gachaItemChoices() {
  return listCatalog()
    .filter((item) => item.type !== "color" && item.gachaEligible !== false)
    .map((item) => ({ name: item.name, value: item.id }));
}

module.exports = {
  TIERS,
  DEFAULT_TIER_RATES,
  DEFAULT_ENTRIES,
  tierRateKey,
  tierRates,
  listGachaPool,
  tierSummary,
  addGachaItem,
  setGachaEnabled,
  gachaItemChoices,
};
