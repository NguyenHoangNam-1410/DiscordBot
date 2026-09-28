const { CATALOG: PROFILE_COSMETICS, DEFAULT_IDS } = require('./profileCosmeticService');

const DEFAULT_PRICE_MULTIPLIER = 100;
const shopPrice = basePrice => basePrice * DEFAULT_PRICE_MULTIPLIER;
const DEFAULT_PROFILE_ITEMS = new Set(DEFAULT_IDS);

const UTILITY_ITEMS = [
  { id: 'baucua_magnifier', type: 'consumable', name: 'Kính Lúp Bầu Cua', effect: 'baucua_magnifier', rarity: 'SR', price: shopPrice(1000), stackable: true, tradeable: true, description: 'Loại trừ 2 linh vật chắc chắn không xuất hiện trong ván Bầu cua đang mở.' },
  { id: 'taixiu_magnetic_dice', type: 'consumable', name: 'Xúc Xắc Từ Tính', effect: 'taixiu_no_triple', rarity: 'SR', price: shopPrice(1200), stackable: true, tradeable: true, description: 'Loại bỏ kết quả bộ ba trong ván Tài xỉu đang mở.' },
  { id: 'divine_eye', type: 'consumable', name: 'Mắt Thần', effect: 'dice_divine_eye', rarity: 'UR', price: shopPrice(5000), stackable: true, tradeable: true, description: 'Tiết lộ 1 mặt chắc chắn xuất hiện; ván đó áp dụng giới hạn cược an toàn.' },
  { id: 'blackjack_redraw', type: 'consumable', name: 'Thẻ Rút Lại', effect: 'blackjack_redraw', rarity: 'SR', price: shopPrice(1200), stackable: true, tradeable: true, description: 'Nếu bị quắc trong ván Xì dách kế tiếp, được bỏ lá vừa rút và rút lại.' },
  { id: 'blackjack_swap', type: 'consumable', name: 'Lệnh Bài Đổi Trắng', effect: 'blackjack_swap', rarity: 'SSR', price: shopPrice(2800), stackable: true, tradeable: true, description: 'Đổi một lá bài rác trên tay lấy lá mới trong ván Xì dách kế tiếp.' },
  { id: 'blackjack_ace', type: 'consumable', name: 'Át Chủ Bài', effect: 'blackjack_first_ace', rarity: 'UR', price: shopPrice(5500), stackable: true, tradeable: true, description: 'Lá đầu tiên của bạn trong ván Xì dách kế tiếp chắc chắn là Át.' },
  { id: 'horse_second_insurance', type: 'consumable', name: 'Bảo Hiểm Về Nhì', effect: 'horse_second_insurance', rarity: 'SSR', price: shopPrice(2600), stackable: true, tradeable: true, description: 'Hoàn tiền cược gốc nếu ngựa đã chọn về nhì trong cuộc đua kế tiếp.' },
  { id: 'horse_jackpot', type: 'consumable', name: 'Trúng Đậm', effect: 'horse_jackpot', rarity: 'UR', price: shopPrice(6000), stackable: true, tradeable: true, description: 'Nhân đôi payout nếu ngựa đã chọn thắng cuộc đua kế tiếp.' },
  { id: 'rps_counter_charm', type: 'consumable', name: 'Bùa Khắc Chế', effect: 'rps_counter', rarity: 'SR', price: shopPrice(1000), stackable: true, tradeable: true, description: 'Trong ván với bot kế tiếp, bot chỉ có thể hòa hoặc thua lựa chọn của bạn.' },
  { id: 'rps_coward_privilege', type: 'consumable', name: 'Đặc Quyền Kẻ Hèn', effect: 'rps_draw_win', rarity: 'SSR', price: shopPrice(2500), stackable: true, tradeable: true, description: 'Ván với bot kế tiếp nếu hòa sẽ tính thắng và trả payout 1,5 lần cược.' },
  { id: 'mines_radar', type: 'consumable', name: 'Radar Nhỏ', effect: 'mines_radar', rarity: 'SR', price: shopPrice(1200), stackable: true, tradeable: true, description: 'Quét một khu vực 3x3 và báo chính xác số mìn trong đó.' },
  { id: 'mines_blast_shield', type: 'consumable', name: 'Giáp Chống Nổ', effect: 'mines_blast_shield', rarity: 'SSR', price: shopPrice(3000), stackable: true, tradeable: true, description: 'Vô hiệu hóa quả mìn đầu tiên đạp trúng trong ván Mines kế tiếp.' },
  { id: 'poker_insurance', type: 'consumable', name: 'Bảo Hiểm Cược Poker', effect: 'poker_insurance', rarity: 'SSR', price: shopPrice(3200), stackable: true, tradeable: true, description: 'Hoàn ngẫu nhiên 25%–50% tiền cược khi thua trắng ở Showdown kế tiếp.' },
  { id: 'living_dictionary', type: 'consumable', name: 'Từ Điển Sống', effect: 'quiz_living_dictionary', rarity: 'UR', price: shopPrice(5500), stackable: true, tradeable: true, description: 'Giải ngay câu hỏi khó Vua tiếng Việt trước khi hết giờ và nhận thưởng.' },
  { id: 'chinchiro_soundproof_bowl', type: 'consumable', name: 'Bát Cách Âm', effect: 'chinchiro_soundproof_bowl', rarity: 'R', price: shopPrice(700), stackable: true, tradeable: true, description: 'Tăng tối đa từ 3 lên 4 lần lắc trong ván Chinchiro kế tiếp.' },
  { id: 'chinchiro_weighted_dice', type: 'consumable', name: 'Xúc Xắc Chì', effect: 'chinchiro_weighted_dice', rarity: 'SR', price: shopPrice(1600), stackable: true, tradeable: true, description: 'Viên xúc xắc đầu tiên mỗi lần lắc luôn ra ngẫu nhiên 4, 5 hoặc 6.' },
  { id: 'chinchiro_otsuki_dice', type: 'consumable', name: 'Xúc Xắc Của Quản Đốc', effect: 'chinchiro_otsuki_dice', rarity: 'SSR', price: shopPrice(3800), stackable: true, tradeable: true, description: 'Dùng bộ xúc xắc chỉ có mặt 4, 5, 6 trong ván Chinchiro kế tiếp.' },
  { id: 'chinchiro_karma_charm', type: 'consumable', name: 'Bùa Trả Đũa', effect: 'chinchiro_karma', rarity: 'UR', price: shopPrice(6500), stackable: true, tradeable: true, description: 'Tự động đảo Hifumi 1-2-3 thành thắng lãi x2; chỉ tiêu khi kích hoạt.' },
];

const COSMETICS = PROFILE_COSMETICS.map(item => ({
  ...item, rarity: item.rarity || 'rare', price: shopPrice(10000),
  shopEligible: item.shopEligible === false ? false : !DEFAULT_PROFILE_ITEMS.has(item.id), stackable: false, tradeable: false,
  effect: 'profile_color', description: 'Đổi màu chủ đạo của thẻ /hoso.',
}));
const CATALOG = Object.freeze([...COSMETICS, ...UTILITY_ITEMS]);
const BY_ID = new Map(CATALOG.map(item => [item.id, item]));
function getCatalogItem(id) { return BY_ID.get(String(id)) || null; }
function listCatalog({ shopEligible = false } = {}) {
  return shopEligible ? CATALOG.filter(item => item.price > 0 && item.shopEligible !== false) : CATALOG;
}
module.exports = { DEFAULT_PRICE_MULTIPLIER, CATALOG, COSMETICS, UTILITY_ITEMS, getCatalogItem, listCatalog };
