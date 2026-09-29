const { CATALOG: PROFILE_COSMETICS, DEFAULT_IDS } = require('./profileCosmeticService');

const DEFAULT_PRICE_MULTIPLIER = 100;
const shopPrice = basePrice => basePrice * DEFAULT_PRICE_MULTIPLIER;
const DEFAULT_PROFILE_ITEMS = new Set(DEFAULT_IDS);

const UTILITY_ITEMS = [
  { id: 'gacha_ticket_1', type: 'gacha', name: 'Vé Gacha ×1 · SSR', effect: 'gacha_ticket_1', rarity: 'SSR', price: 0, shopEligible: false, stackable: true, tradeable: false, description: 'Quay 1 lượt Gacha, chắc chắn nhận vật phẩm SSR trở lên. Vé được dùng tự động khi quay; không thể trao đổi.' },
  { id: 'gacha_ticket_10', type: 'gacha', name: 'Vé Gacha ×10', effect: 'gacha_ticket_10', rarity: 'UR', price: 0, shopEligible: false, stackable: true, tradeable: false, description: 'Quay 10 lượt Gacha, chắc chắn có ít nhất một SSR và nhân đôi trọng số UR. Vé được dùng tự động khi quay; không thể trao đổi.' },
  { id: 'vietnamese_word_count', type: 'consumable', name: 'Máy Đếm Tiếng', effect: 'quiz_word_count', rarity: 'R', price: shopPrice(500), stackable: true, tradeable: true, description: 'Tiết lộ đáp án Vua tiếng Việt hiện hành có bao nhiêu tiếng; chỉ bạn nhìn thấy.' },
  { id: 'vietnamese_extra_time', type: 'consumable', name: 'Đồng Hồ Gia Hạn', effect: 'quiz_extra_time', rarity: 'SSR', price: 0, shopEligible: false, stackable: true, tradeable: true, description: 'Cộng 15 giây cho câu hỏi khó hiện tại; mỗi câu chỉ gia hạn một lần.' },
  { id: 'mines_row_scanner', type: 'consumable', name: 'Máy Quét Hàng', effect: 'mines_row_scanner', rarity: 'R', price: shopPrice(600), stackable: true, tradeable: true, description: 'Báo số mìn trong một hàng ngẫu nhiên còn ô chưa mở của ván Mines hiện tại.' },
  { id: 'mines_column_scanner', type: 'consumable', name: 'Máy Quét Cột', effect: 'mines_column_scanner', rarity: 'R', price: shopPrice(600), stackable: true, tradeable: true, description: 'Báo số mìn trong một cột ngẫu nhiên còn ô chưa mở của ván Mines hiện tại.' },
  { id: 'baucua_small_lens', type: 'consumable', name: 'Kính Lúp Nứt', effect: 'baucua_small_lens', rarity: 'R', price: shopPrice(600), stackable: true, tradeable: true, description: 'Loại trừ một linh vật chắc chắn không xuất hiện trong ván Bầu cua đang mở.' },
  { id: 'taixiu_total_scope', type: 'consumable', name: 'Ống Ngắm Tổng Điểm', effect: 'taixiu_total_scope', rarity: 'R', price: shopPrice(600), stackable: true, tradeable: true, description: 'Báo tổng điểm ván Tài xỉu đang mở thuộc khoảng 3-7, 8-13 hoặc 14-18. Sau khi dùng, ván này không thể dùng Xúc Xắc Từ Tính.' },
  { id: 'taixiu_edge_insurance', type: 'consumable', name: 'Bảo Hiểm Sát Nút', effect: 'taixiu_edge_insurance', rarity: 'SR', price: 0, shopEligible: false, stackable: true, tradeable: true, description: 'Hoàn 50% cược nếu cửa Tài thua ở tổng 10 hoặc cửa Xỉu thua ở tổng 11. Chỉ tiêu hao khi được hoàn.' },
  { id: 'baucua_blank_insurance', type: 'consumable', name: 'Bảo Hiểm Trắng Tay', effect: 'baucua_blank_insurance', rarity: 'SSR', price: 0, shopEligible: false, stackable: true, tradeable: true, description: 'Hoàn 35% tổng cược nếu không linh vật nào bạn cược xuất hiện. Chỉ tiêu hao khi được hoàn.' },
  { id: 'horse_consolation', type: 'consumable', name: 'Vé Khán Đài', effect: 'horse_consolation', rarity: 'R', price: 0, shopEligible: false, stackable: true, tradeable: true, description: 'Hoàn 20% tiền cược nếu ngựa bạn chọn về ba. Chỉ tiêu hao khi được hoàn và không chồng với Bảo Hiểm Về Nhì hoặc Trúng Đậm.' },
  { id: 'rps_loss_shield', type: 'consumable', name: 'Bùa Giảm Đau', effect: 'rps_loss_shield', rarity: 'R', price: 0, shopEligible: false, stackable: true, tradeable: true, description: 'Hoàn 20% tiền cược khi thua bot trong Oẳn tù tì. Chỉ tiêu hao khi được hoàn.' },
  { id: 'blackjack_bust_guard', type: 'consumable', name: 'Miếng Đệm Quắc', effect: 'blackjack_bust_guard', rarity: 'R', price: 0, shopEligible: false, stackable: true, tradeable: true, description: 'Nếu quắc đúng 22 điểm trong ván Xì dách với nhà cái, hoàn 25% tiền cược của tay đó. Chỉ tiêu hao khi được hoàn.' },
  { id: 'poker_fold_coupon', type: 'consumable', name: 'Phiếu Bỏ Bài', effect: 'poker_fold_coupon', rarity: 'R', price: 0, shopEligible: false, stackable: true, tradeable: true, description: 'Hoàn 50% Ante nếu bạn bỏ bài ở Flop khi chưa bỏ thêm xu ngoài Ante (Poker với bot). Chỉ tiêu hao khi được hoàn.' },
  { id: 'effect_cleanser', type: 'consumable', name: 'Nước Thanh Tẩy', effect: 'remove_active_game_effect', rarity: 'SSR', price: 50_000, shopEligible: true, gachaEligible: false, stackable: true, tradeable: true, description: 'Hủy hiệu ứng vật phẩm đang chờ kích hoạt gần nhất để bạn đổi sang vật phẩm khác. Vật phẩm đã bị hủy không được hoàn lại.' },
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
  { id: 'vietnamese_first_word', type: 'consumable', name: 'Mở Đầu Từ Điển', effect: 'quiz_first_word', rarity: 'SSR', price: shopPrice(3000), stackable: true, tradeable: true, description: 'Tiết lộ tiếng đầu tiên trong đáp án của câu Vua tiếng Việt hiện hành; chỉ bạn nhìn thấy.' },
  { id: 'vietnamese_syllable_lengths', type: 'consumable', name: 'Đếm Âm Tiết', effect: 'quiz_syllable_lengths', rarity: 'SR', price: shopPrice(1600), stackable: true, tradeable: true, description: 'Tiết lộ số chữ cái của từng tiếng trong đáp án câu Vua tiếng Việt hiện hành; chỉ bạn nhìn thấy.' },
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
