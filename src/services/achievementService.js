const { ringForAchievement } = require("./avatarRingCatalog");
const { grantCosmetic } = require("./profileCosmeticService");
const { db } = require("../db");
const relicRecords = require("../hardcore/storage/relicRecords");
const { getAccount, creditCoins } = require("./economyService");
const { addDiamonds } = require("./playerLevelService");

const BASE_ACHIEVEMENTS = [
  {
    id: "first_game",
    name: "Bước chân đầu tiên",
    description: "Chơi ván đầu tiên",
    target: 1,
    reward: 2_000,
    diamonds: 10,
    metric: "games",
  },
  {
    id: "games_10",
    name: "Người chơi quen mặt",
    description: "Chơi 10 ván",
    target: 10,
    reward: 5_000,
    diamonds: 20,
    metric: "games",
  },
  {
    id: "games_25",
    name: "Khách quen",
    description: "Chơi 25 ván",
    target: 25,
    reward: 10_000,
    diamonds: 30,
    metric: "games",
  },
  {
    id: "games_100",
    name: "Cựu binh Game Hub",
    description: "Chơi 100 ván",
    target: 100,
    reward: 25_000,
    diamonds: 75,
    metric: "games",
  },
  {
    id: "games_500",
    name: "Huyền thoại sòng chơi",
    description: "Chơi 500 ván",
    target: 500,
    reward: 75_000,
    diamonds: 200,
    metric: "games",
  },
  {
    id: "games_1000",
    name: "Bất khả chiến bại",
    description: "Chơi 1.000 ván",
    target: 1_000,
    reward: 150_000,
    diamonds: 400,
    metric: "games",
  },
  {
    id: "wins_5",
    name: "Chuỗi chiến thắng",
    description: "Thắng 5 ván",
    target: 5,
    reward: 5_000,
    diamonds: 20,
    metric: "wins",
  },
  {
    id: "wins_20",
    name: "Tay chơi lên hạng",
    description: "Thắng 20 ván",
    target: 20,
    reward: 15_000,
    diamonds: 50,
    metric: "wins",
  },
  {
    id: "wins_50",
    name: "Nhà vô địch",
    description: "Thắng 50 ván",
    target: 50,
    reward: 35_000,
    diamonds: 100,
    metric: "wins",
  },
  {
    id: "wins_100",
    name: "Bách chiến bách thắng",
    description: "Thắng 100 ván",
    target: 100,
    reward: 75_000,
    diamonds: 200,
    metric: "wins",
  },
  {
    id: "wins_250",
    name: "Huyền thoại chiến thắng",
    description: "Thắng 250 ván",
    target: 250,
    reward: 150_000,
    diamonds: 400,
    metric: "wins",
  },
  {
    id: "games_3_types",
    name: "Kẻ khám phá",
    description: "Thử ít nhất 3 trò chơi",
    target: 3,
    reward: 7_500,
    diamonds: 30,
    metric: "gameTypes",
  },
  {
    id: "games_5_types",
    name: "Người chơi đa tài",
    description: "Thử ít nhất 5 trò chơi",
    target: 5,
    reward: 15_000,
    diamonds: 60,
    metric: "gameTypes",
  },
  {
    id: "games_10_types",
    name: "Bách nghệ",
    description: "Thử ít nhất 10 trò chơi",
    target: 10,
    reward: 35_000,
    diamonds: 120,
    metric: "gameTypes",
  },
  {
    id: "balance_100k",
    name: "Túi xu nặng trĩu",
    description: "Sở hữu 100.000 xu",
    target: 100_000,
    reward: 5_000,
    diamonds: 15,
    metric: "balance",
  },
  {
    id: "balance_1m",
    name: "Triệu phú",
    description: "Sở hữu 1.000.000 xu",
    target: 1_000_000,
    reward: 25_000,
    diamonds: 75,
    metric: "balance",
  },
  {
    id: "hardcore_10",
    name: "Sống sót trong bóng tối",
    description: "Đạt tầng 10 Sinh tồn",
    target: 10,
    reward: 10_000,
    diamonds: 30,
    metric: "hardcoreFloor",
  },
  {
    id: "hardcore_25",
    name: "Kẻ chinh phục vực sâu",
    description: "Đạt tầng 25 Sinh tồn",
    target: 25,
    reward: 30_000,
    diamonds: 100,
    metric: "hardcoreFloor",
  },
  {
    id: "hardcore_50",
    name: "Bóng ma sinh tồn",
    description: "Đạt tầng 50 Sinh tồn",
    target: 50,
    reward: 75_000,
    diamonds: 250,
    metric: "hardcoreFloor",
  },
  {
    id: "hc_runs_5",
    name: "Lần đầu xuống hầm",
    description: "Bắt đầu 5 lượt Sinh tồn",
    target: 5,
    reward: 5_000,
    diamonds: 20,
    metric: "hardcoreRuns",
  },
  {
    id: "hc_runs_25",
    name: "Dân hầm ngục",
    description: "Bắt đầu 25 lượt Sinh tồn",
    target: 25,
    reward: 20_000,
    diamonds: 60,
    metric: "hardcoreRuns",
  },
  {
    id: "hc_runs_100",
    name: "Nghiện sinh tồn",
    description: "Bắt đầu 100 lượt Sinh tồn",
    target: 100,
    reward: 60_000,
    diamonds: 180,
    metric: "hardcoreRuns",
  },
  {
    id: "hc_escape_1",
    name: "Thoát hiểm",
    description: "Rút lui an toàn khỏi Sinh tồn 1 lần",
    target: 1,
    reward: 8_000,
    diamonds: 25,
    metric: "hardcoreEscapes",
  },
  {
    id: "hc_escape_10",
    name: "Kẻ chạy trốn lão luyện",
    description: "Rút lui an toàn khỏi Sinh tồn 10 lần",
    target: 10,
    reward: 30_000,
    diamonds: 90,
    metric: "hardcoreEscapes",
  },
  {
    id: "hc_escape_30",
    name: "Nhà sinh tồn thực thụ",
    description: "Rút lui an toàn khỏi Sinh tồn 30 lần",
    target: 30,
    reward: 80_000,
    diamonds: 220,
    metric: "hardcoreEscapes",
  },
  {
    id: "hc_clear_1",
    name: "Chạm đáy vực sâu",
    description: "Hoàn thành trọn vẹn Sinh tồn 1 lần",
    target: 1,
    reward: 40_000,
    diamonds: 120,
    metric: "hardcoreCompletions",
  },
  {
    id: "hc_clear_5",
    name: "Huyền thoại hầm ngục",
    description: "Hoàn thành trọn vẹn Sinh tồn 5 lần",
    target: 5,
    reward: 120_000,
    diamonds: 350,
    metric: "hardcoreCompletions",
  },
  {
    id: "bet_wins_10",
    name: "Vận đỏ khởi đầu",
    description: "Thắng 10 ván game cược",
    target: 10,
    reward: 5_000,
    diamonds: 20,
    metric: "betWins",
  },
  {
    id: "bet_wins_50",
    name: "Con bạc có duyên",
    description: "Thắng 50 ván game cược",
    target: 50,
    reward: 20_000,
    diamonds: 60,
    metric: "betWins",
  },
  {
    id: "bet_wins_200",
    name: "Thần bài thần xúc xắc",
    description: "Thắng 200 ván game cược",
    target: 200,
    reward: 60_000,
    diamonds: 180,
    metric: "betWins",
  },
  {
    id: "bet_wins_500",
    name: "Vua sòng bạc",
    description: "Thắng 500 ván game cược",
    target: 500,
    reward: 150_000,
    diamonds: 400,
    metric: "betWins",
  },
  {
    id: "bet_types_5",
    name: "Dạo quanh sòng bạc",
    description: "Chơi 5 game cược khác nhau",
    target: 5,
    reward: 10_000,
    diamonds: 40,
    metric: "betGames",
  },
  {
    id: "bet_types_9",
    name: "Thông thạo mọi bàn cược",
    description: "Chơi đủ 8 game cược",
    target: 8,
    reward: 50_000,
    diamonds: 150,
    metric: "betGames",
  },
  {
    id: "bet_staked_100k",
    name: "Dám chơi dám chịu",
    description: "Tổng tiền đặt cược đạt 100.000 xu",
    target: 100_000,
    reward: 8_000,
    diamonds: 25,
    metric: "betStaked",
  },
  {
    id: "bet_staked_1m",
    name: "Tay chơi hạng nặng",
    description: "Tổng tiền đặt cược đạt 1.000.000 xu",
    target: 1_000_000,
    reward: 40_000,
    diamonds: 120,
    metric: "betStaked",
  },
  {
    id: "bet_staked_10m",
    name: "Đại gia sòng bạc",
    description: "Tổng tiền đặt cược đạt 10.000.000 xu",
    target: 10_000_000,
    reward: 150_000,
    diamonds: 400,
    metric: "betStaked",
  },
  {
    id: "bet_big_50k",
    name: "Trúng lớn",
    description: "Nhận 50.000 xu trong một ván cược",
    target: 50_000,
    reward: 10_000,
    diamonds: 35,
    metric: "betBigWin",
  },
  {
    id: "bet_big_500k",
    name: "Jackpot",
    description: "Nhận 500.000 xu trong một ván cược",
    target: 500_000,
    reward: 60_000,
    diamonds: 200,
    metric: "betBigWin",
  },
  {
    id: "gacha_pulls_1",
    name: "Lần quay đầu tiên",
    description: "Quay Gacha 1 lượt",
    target: 1,
    reward: 2_000,
    diamonds: 10,
    metric: "gachaPulls",
  },
  {
    id: "gacha_pulls_10",
    name: "Thử vận may",
    description: "Quay Gacha tổng cộng 10 lượt",
    target: 10,
    reward: 5_000,
    diamonds: 20,
    metric: "gachaPulls",
  },
  {
    id: "gacha_pulls_50",
    name: "Nghiện gacha nhẹ",
    description: "Quay Gacha tổng cộng 50 lượt",
    target: 50,
    reward: 15_000,
    diamonds: 50,
    metric: "gachaPulls",
  },
  {
    id: "gacha_pulls_200",
    name: "Con nghiện gacha",
    description: "Quay Gacha tổng cộng 200 lượt",
    target: 200,
    reward: 40_000,
    diamonds: 120,
    metric: "gachaPulls",
  },
  {
    id: "gacha_pulls_1000",
    name: "Đại gia gacha",
    description: "Quay Gacha tổng cộng 1.000 lượt",
    target: 1_000,
    reward: 120_000,
    diamonds: 350,
    metric: "gachaPulls",
  },
  {
    id: "gacha_sr_5",
    name: "Ánh sáng tím",
    description: "Nhận 5 vật phẩm SR trở lên từ Gacha",
    target: 5,
    reward: 6_000,
    diamonds: 25,
    metric: "gachaSR",
  },
  {
    id: "gacha_sr_25",
    name: "Sưu tầm SR",
    description: "Nhận 25 vật phẩm SR trở lên từ Gacha",
    target: 25,
    reward: 20_000,
    diamonds: 70,
    metric: "gachaSR",
  },
  {
    id: "gacha_sr_100",
    name: "Kho báu SR",
    description: "Nhận 100 vật phẩm SR trở lên từ Gacha",
    target: 100,
    reward: 60_000,
    diamonds: 180,
    metric: "gachaSR",
  },
  {
    id: "gacha_ssr_1",
    name: "Hào quang vàng",
    description: "Nhận 1 vật phẩm SSR trở lên từ Gacha",
    target: 1,
    reward: 10_000,
    diamonds: 40,
    metric: "gachaSSR",
  },
  {
    id: "gacha_ssr_5",
    name: "Tay vàng",
    description: "Nhận 5 vật phẩm SSR trở lên từ Gacha",
    target: 5,
    reward: 30_000,
    diamonds: 100,
    metric: "gachaSSR",
  },
  {
    id: "gacha_ssr_20",
    name: "Thần may mắn",
    description: "Nhận 20 vật phẩm SSR trở lên từ Gacha",
    target: 20,
    reward: 90_000,
    diamonds: 260,
    metric: "gachaSSR",
  },
  {
    id: "gacha_ur_1",
    name: "Huyền thoại xuất hiện",
    description: "Nhận 1 vật phẩm UR từ Gacha",
    target: 1,
    reward: 30_000,
    diamonds: 120,
    metric: "gachaUR",
  },
  {
    id: "gacha_ur_3",
    name: "Con cưng của vận may",
    description: "Nhận 3 vật phẩm UR từ Gacha",
    target: 3,
    reward: 80_000,
    diamonds: 250,
    metric: "gachaUR",
  },
  {
    id: "gacha_ur_10",
    name: "Chúa tể UR",
    description: "Nhận 10 vật phẩm UR từ Gacha",
    target: 10,
    reward: 200_000,
    diamonds: 500,
    metric: "gachaUR",
  },
  {
    id: "gacha_spent_1k",
    name: "Đốt kim cương",
    description: "Tiêu 1.000 kim cương để quay Gacha",
    target: 1_000,
    reward: 5_000,
    diamonds: 15,
    metric: "gachaSpent",
  },
  {
    id: "gacha_spent_10k",
    name: "Nhà đầu tư gacha",
    description: "Tiêu 10.000 kim cương để quay Gacha",
    target: 10_000,
    reward: 30_000,
    diamonds: 80,
    metric: "gachaSpent",
  },
  {
    id: "gacha_spent_50k",
    name: "Cá voi gacha",
    description: "Tiêu 50.000 kim cương để quay Gacha",
    target: 50_000,
    reward: 100_000,
    diamonds: 300,
    metric: "gachaSpent",
  },
  {
    id: "mines_wins_5",
    name: "Thợ dò mìn tập sự",
    description: "Thắng 5 ván Dò mìn",
    target: 5,
    reward: 5_000,
    diamonds: 20,
    metric: "minesWins",
  },
  {
    id: "mines_wins_25",
    name: "Chuyên gia gỡ mìn",
    description: "Thắng 25 ván Dò mìn",
    target: 25,
    reward: 20_000,
    diamonds: 60,
    metric: "minesWins",
  },
  {
    id: "mines_wins_100",
    name: "Bậc thầy bãi mìn",
    description: "Thắng 100 ván Dò mìn",
    target: 100,
    reward: 70_000,
    diamonds: 200,
    metric: "minesWins",
  },
  {
    id: "mines_clear_1",
    name: "Quét sạch bãi mìn",
    description: "Mở hết ô an toàn trong 1 ván Dò mìn",
    target: 1,
    reward: 15_000,
    diamonds: 50,
    metric: "minesClears",
  },
  {
    id: "mines_clear_5",
    name: "Không sót ô nào",
    description: "Mở hết ô an toàn trong 5 ván Dò mìn",
    target: 5,
    reward: 50_000,
    diamonds: 150,
    metric: "minesClears",
  },
  {
    id: "mines_clear_20",
    name: "Bàn tay vàng bãi mìn",
    description: "Mở hết ô an toàn trong 20 ván Dò mìn",
    target: 20,
    reward: 150_000,
    diamonds: 400,
    metric: "minesClears",
  },
  {
    id: "mines_hard_4",
    name: "Chơi với lửa",
    description: "Thắng một ván Dò mìn có ít nhất 4 mìn",
    target: 4,
    reward: 8_000,
    diamonds: 30,
    metric: "minesHardWin",
  },
  {
    id: "mines_hard_6",
    name: "Gan dạ",
    description: "Thắng một ván Dò mìn có ít nhất 6 mìn",
    target: 6,
    reward: 25_000,
    diamonds: 90,
    metric: "minesHardWin",
  },
  {
    id: "mines_hard_7",
    name: "Đi trên lưỡi dao",
    description: "Thắng một ván Dò mìn có 7 mìn",
    target: 7,
    reward: 60_000,
    diamonds: 200,
    metric: "minesHardWin",
  },
  {
    id: "mines_mult_5",
    name: "Chốt lời đẹp",
    description: "Chốt thắng Dò mìn với hệ số từ x5",
    target: 5,
    reward: 10_000,
    diamonds: 35,
    metric: "minesBestMultiplier",
  },
  {
    id: "mines_mult_20",
    name: "Hệ số khủng",
    description: "Chốt thắng Dò mìn với hệ số từ x20",
    target: 20,
    reward: 40_000,
    diamonds: 120,
    metric: "minesBestMultiplier",
  },
  {
    id: "mines_mult_100",
    name: "Trúng độc đắc bãi mìn",
    description: "Chốt thắng Dò mìn với hệ số từ x100",
    target: 100,
    reward: 150_000,
    diamonds: 400,
    metric: "minesBestMultiplier",
  },
  {
    id: "mines_star_1",
    name: "Ngôi sao may mắn",
    description: "Tìm thấy ngôi sao trong 1 ván Dò mìn",
    target: 1,
    reward: 5_000,
    diamonds: 20,
    metric: "minesStars",
  },
  {
    id: "mines_star_10",
    name: "Thợ săn sao",
    description: "Tìm thấy ngôi sao trong 10 ván Dò mìn",
    target: 10,
    reward: 20_000,
    diamonds: 60,
    metric: "minesStars",
  },
  {
    id: "mines_star_30",
    name: "Chòm sao riêng",
    description: "Tìm thấy ngôi sao trong 30 ván Dò mìn",
    target: 30,
    reward: 60_000,
    diamonds: 180,
    metric: "minesStars",
  },
  {
    id: "chin_wins_5",
    name: "Tay lắc học việc",
    description: "Thắng 5 ván Chinchiro",
    target: 5,
    reward: 5_000,
    diamonds: 20,
    metric: "chinchiroWins",
  },
  {
    id: "chin_wins_25",
    name: "Cao thủ chén bát",
    description: "Thắng 25 ván Chinchiro",
    target: 25,
    reward: 20_000,
    diamonds: 60,
    metric: "chinchiroWins",
  },
  {
    id: "chin_wins_100",
    name: "Vua xúc xắc",
    description: "Thắng 100 ván Chinchiro",
    target: 100,
    reward: 70_000,
    diamonds: 200,
    metric: "chinchiroWins",
  },
  {
    id: "chin_shigoro_1",
    name: "Tứ Ngũ Lục!",
    description: "Thắng bằng Shigoro 4-5-6",
    target: 1,
    reward: 8_000,
    diamonds: 30,
    metric: "chinchiroShigoro",
  },
  {
    id: "chin_shigoro_5",
    name: "Sáu cửa tay",
    description: "Thắng bằng Shigoro 5 lần",
    target: 5,
    reward: 25_000,
    diamonds: 80,
    metric: "chinchiroShigoro",
  },
  {
    id: "chin_shigoro_20",
    name: "Bậc thầy 4-5-6",
    description: "Thắng bằng Shigoro 20 lần",
    target: 20,
    reward: 80_000,
    diamonds: 220,
    metric: "chinchiroShigoro",
  },
  {
    id: "chin_zoro_1",
    name: "Bão xúc xắc",
    description: "Thắng bằng Bão (ba xúc xắc giống nhau, kể cả Pin-Zoro)",
    target: 1,
    reward: 15_000,
    diamonds: 50,
    metric: "chinchiroZoro",
  },
  {
    id: "chin_zoro_3",
    name: "Gọi gió hô mưa",
    description: "Thắng bằng Bão 3 lần",
    target: 3,
    reward: 40_000,
    diamonds: 120,
    metric: "chinchiroZoro",
  },
  {
    id: "chin_zoro_10",
    name: "Chúa tể bão",
    description: "Thắng bằng Bão 10 lần",
    target: 10,
    reward: 120_000,
    diamonds: 320,
    metric: "chinchiroZoro",
  },
  {
    id: "chin_pin_1",
    name: "Pin-Zoro",
    description: "Thắng bằng Pin-Zoro 1-1-1",
    target: 1,
    reward: 30_000,
    diamonds: 100,
    metric: "chinchiroPinZoro",
  },
  {
    id: "chin_pin_3",
    name: "Ba chấm nhất thiên hạ",
    description: "Thắng bằng Pin-Zoro 3 lần",
    target: 3,
    reward: 100_000,
    diamonds: 300,
    metric: "chinchiroPinZoro",
  },
  {
    id: "chin_hifumi_1",
    name: "Hifumi xui xẻo",
    description: "Lắc ra Hifumi 1-2-3",
    target: 1,
    reward: 3_000,
    diamonds: 10,
    metric: "chinchiroHifumi",
  },
  {
    id: "chin_hifumi_10",
    name: "Bạn thân của Hifumi",
    description: "Lắc ra Hifumi 10 lần",
    target: 10,
    reward: 15_000,
    diamonds: 50,
    metric: "chinchiroHifumi",
  },
  {
    id: "chin_streak_3",
    name: "Đà thắng",
    description: "Thắng liên tiếp 3 ván Chinchiro",
    target: 3,
    reward: 8_000,
    diamonds: 30,
    metric: "chinchiroStreak",
  },
  {
    id: "chin_streak_5",
    name: "Chuỗi nóng",
    description: "Thắng liên tiếp 5 ván Chinchiro",
    target: 5,
    reward: 30_000,
    diamonds: 90,
    metric: "chinchiroStreak",
  },
  {
    id: "chin_streak_10",
    name: "Bất bại",
    description: "Thắng liên tiếp 10 ván Chinchiro",
    target: 10,
    reward: 120_000,
    diamonds: 320,
    metric: "chinchiroStreak",
  },
  {
    id: "poker_wins_5",
    name: "Tay bài tập sự",
    description: "Thắng 5 ván Poker",
    target: 5,
    reward: 5_000,
    diamonds: 20,
    metric: "pokerWins",
  },
  {
    id: "poker_wins_25",
    name: "Gương mặt sòng bài",
    description: "Thắng 25 ván Poker",
    target: 25,
    reward: 20_000,
    diamonds: 60,
    metric: "pokerWins",
  },
  {
    id: "poker_wins_100",
    name: "Cao thủ Poker",
    description: "Thắng 100 ván Poker",
    target: 100,
    reward: 70_000,
    diamonds: 200,
    metric: "pokerWins",
  },
  {
    id: "poker_hand_straight",
    name: "Sảnh rồng",
    description: "Thắng ván Poker với Sảnh trở lên",
    target: 4,
    reward: 6_000,
    diamonds: 20,
    metric: "pokerHandRank",
  },
  {
    id: "poker_hand_flush",
    name: "Thùng sắc màu",
    description: "Thắng ván Poker với Thùng trở lên",
    target: 5,
    reward: 12_000,
    diamonds: 40,
    metric: "pokerHandRank",
  },
  {
    id: "poker_hand_fullhouse",
    name: "Cù lũ đầy nhà",
    description: "Thắng ván Poker với Cù lũ trở lên",
    target: 6,
    reward: 25_000,
    diamonds: 80,
    metric: "pokerHandRank",
  },
  {
    id: "poker_hand_quads",
    name: "Tứ quý đại cát",
    description: "Thắng ván Poker với Tứ quý trở lên",
    target: 7,
    reward: 60_000,
    diamonds: 180,
    metric: "pokerHandRank",
  },
  {
    id: "poker_hand_sf",
    name: "Thùng phá sảnh",
    description: "Thắng ván Poker với Thùng phá sảnh",
    target: 8,
    reward: 150_000,
    diamonds: 400,
    metric: "pokerHandRank",
  },
  {
    id: "poker_fold_1",
    name: "Bluff thành công",
    description: "Thắng khi mọi người khác bỏ bài",
    target: 1,
    reward: 5_000,
    diamonds: 20,
    metric: "pokerFoldWins",
  },
  {
    id: "poker_fold_10",
    name: "Mặt lạnh như tiền",
    description: "Thắng 10 ván khi mọi người khác bỏ bài",
    target: 10,
    reward: 25_000,
    diamonds: 70,
    metric: "pokerFoldWins",
  },
  {
    id: "poker_fold_50",
    name: "Bậc thầy dọa nạt",
    description: "Thắng 50 ván khi mọi người khác bỏ bài",
    target: 50,
    reward: 80_000,
    diamonds: 220,
    metric: "pokerFoldWins",
  },
  {
    id: "poker_allin_1",
    name: "Được ăn cả",
    description: "Thắng một ván khi đã All-in",
    target: 1,
    reward: 8_000,
    diamonds: 30,
    metric: "pokerAllInWins",
  },
  {
    id: "poker_allin_5",
    name: "Liều ăn nhiều",
    description: "Thắng 5 ván khi đã All-in",
    target: 5,
    reward: 30_000,
    diamonds: 90,
    metric: "pokerAllInWins",
  },
  {
    id: "poker_allin_20",
    name: "Kẻ máu liều",
    description: "Thắng 20 ván khi đã All-in",
    target: 20,
    reward: 100_000,
    diamonds: 280,
    metric: "pokerAllInWins",
  },
  {
    id: "poker_pvp_1",
    name: "Hạ gục người thật",
    description: "Thắng một ván Poker với người chơi khác",
    target: 1,
    reward: 8_000,
    diamonds: 30,
    metric: "pokerPvpWins",
  },
  {
    id: "poker_pvp_10",
    name: "Sát thủ bàn tròn",
    description: "Thắng 10 ván Poker với người chơi khác",
    target: 10,
    reward: 40_000,
    diamonds: 120,
    metric: "pokerPvpWins",
  },
  {
    id: "poker_pvp_30",
    name: "Vua sòng người",
    description: "Thắng 30 ván Poker với người chơi khác",
    target: 30,
    reward: 120_000,
    diamonds: 320,
    metric: "pokerPvpWins",
  },
  {
    id: "poker_pot_20k",
    name: "Pot lớn",
    description: "Nhận 20.000 xu trong một ván Poker",
    target: 20_000,
    reward: 8_000,
    diamonds: 30,
    metric: "pokerBigPot",
  },
  {
    id: "poker_pot_200k",
    name: "Pot khủng",
    description: "Nhận 200.000 xu trong một ván Poker",
    target: 200_000,
    reward: 40_000,
    diamonds: 120,
    metric: "pokerBigPot",
  },
  {
    id: "poker_pot_1m",
    name: "Ăn sạch bàn",
    description: "Nhận 1.000.000 xu trong một ván Poker",
    target: 1_000_000,
    reward: 150_000,
    diamonds: 400,
    metric: "pokerBigPot",
  },
  {
    id: "horse_wins_5",
    name: "Nhà cái ngựa tập sự",
    description: "Thắng 5 cuộc Đua ngựa",
    target: 5,
    reward: 5_000,
    diamonds: 20,
    metric: "horseWins",
  },
  {
    id: "horse_wins_25",
    name: "Tay đua có mắt nhìn",
    description: "Thắng 25 cuộc Đua ngựa",
    target: 25,
    reward: 20_000,
    diamonds: 60,
    metric: "horseWins",
  },
  {
    id: "horse_wins_100",
    name: "Bá chủ đường đua",
    description: "Thắng 100 cuộc Đua ngựa",
    target: 100,
    reward: 70_000,
    diamonds: 200,
    metric: "horseWins",
  },
  {
    id: "horse_played_25",
    name: "Khán giả trung thành",
    description: "Tham gia 25 cuộc Đua ngựa",
    target: 25,
    reward: 8_000,
    diamonds: 30,
    metric: "horsePlayed",
  },
  {
    id: "horse_played_100",
    name: "Khách quen trường đua",
    description: "Tham gia 100 cuộc Đua ngựa",
    target: 100,
    reward: 30_000,
    diamonds: 90,
    metric: "horsePlayed",
  },
  {
    id: "horse_played_500",
    name: "Cư dân trường đua",
    description: "Tham gia 500 cuộc Đua ngựa",
    target: 500,
    reward: 100_000,
    diamonds: 280,
    metric: "horsePlayed",
  },
  {
    id: "horse_mult_10",
    name: "Cửa dưới nổ hũ",
    description: "Thắng với ngựa có hệ số từ x10",
    target: 10,
    reward: 12_000,
    diamonds: 40,
    metric: "horseBestMultiplier",
  },
  {
    id: "horse_mult_18",
    name: "Ngựa ô bất ngờ",
    description: "Thắng với ngựa có hệ số từ x18",
    target: 18,
    reward: 35_000,
    diamonds: 110,
    metric: "horseBestMultiplier",
  },
  {
    id: "horse_mult_30",
    name: "Thiên mệnh",
    description: "Thắng với ngựa có hệ số x30",
    target: 30,
    reward: 100_000,
    diamonds: 300,
    metric: "horseBestMultiplier",
  },
  {
    id: "horse_special_1",
    name: "Thiên Mã giáng thế",
    description: "Thắng cược Thiên Mã",
    target: 1,
    reward: 50_000,
    diamonds: 150,
    metric: "horseSpecialWins",
  },
  {
    id: "horse_special_3",
    name: "Được trời chọn",
    description: "Thắng cược Thiên Mã 3 lần",
    target: 3,
    reward: 150_000,
    diamonds: 400,
    metric: "horseSpecialWins",
  },
  {
    id: "horse_streak_3",
    name: "Đà thắng đường đua",
    description: "Thắng liên tiếp 3 cuộc đua",
    target: 3,
    reward: 10_000,
    diamonds: 35,
    metric: "horseStreak",
  },
  {
    id: "horse_streak_5",
    name: "Chuỗi thắng vàng",
    description: "Thắng liên tiếp 5 cuộc đua",
    target: 5,
    reward: 40_000,
    diamonds: 120,
    metric: "horseStreak",
  },
  {
    id: "horse_spread_1",
    name: "Rải cược khôn ngoan",
    description: "Thắng một cuộc đua khi đã cược từ 3 ngựa",
    target: 1,
    reward: 8_000,
    diamonds: 30,
    metric: "horseSpreadWins",
  },
  {
    id: "horse_spread_10",
    name: "Chia trứng nhiều giỏ",
    description: "Thắng 10 cuộc đua khi đã cược từ 3 ngựa",
    target: 10,
    reward: 40_000,
    diamonds: 120,
    metric: "horseSpreadWins",
  },
  {
    id: "horse_pot_20k",
    name: "Trúng lớn đường đua",
    description: "Nhận 20.000 xu trong một cuộc Đua ngựa",
    target: 20_000,
    reward: 8_000,
    diamonds: 30,
    metric: "horseBigPayout",
  },
  {
    id: "horse_pot_200k",
    name: "Thắng đậm",
    description: "Nhận 200.000 xu trong một cuộc Đua ngựa",
    target: 200_000,
    reward: 40_000,
    diamonds: 120,
    metric: "horseBigPayout",
  },
  {
    id: "horse_pot_1m",
    name: "Cú đổi đời",
    description: "Nhận 1.000.000 xu trong một cuộc Đua ngựa",
    target: 1_000_000,
    reward: 150_000,
    diamonds: 400,
    metric: "horseBigPayout",
  },
  {
    id: "baucua_wins_5",
    name: "Dân chơi bầu cua",
    description: "Thắng 5 ván Bầu cua",
    target: 5,
    reward: 5_000,
    diamonds: 20,
    metric: "baucuaWins",
  },
  {
    id: "baucua_wins_25",
    name: "Tay lắc có duyên",
    description: "Thắng 25 ván Bầu cua",
    target: 25,
    reward: 20_000,
    diamonds: 60,
    metric: "baucuaWins",
  },
  {
    id: "baucua_wins_100",
    name: "Vua chiếu bạc",
    description: "Thắng 100 ván Bầu cua",
    target: 100,
    reward: 70_000,
    diamonds: 200,
    metric: "baucuaWins",
  },
  {
    id: "baucua_played_25",
    name: "Khách chiếu bạc",
    description: "Tham gia 25 ván Bầu cua",
    target: 25,
    reward: 8_000,
    diamonds: 30,
    metric: "baucuaPlayed",
  },
  {
    id: "baucua_played_100",
    name: "Con nhang đệ tử",
    description: "Tham gia 100 ván Bầu cua",
    target: 100,
    reward: 30_000,
    diamonds: 90,
    metric: "baucuaPlayed",
  },
  {
    id: "baucua_played_500",
    name: "Nhà cái ruột",
    description: "Tham gia 500 ván Bầu cua",
    target: 500,
    reward: 100_000,
    diamonds: 280,
    metric: "baucuaPlayed",
  },
  {
    id: "baucua_double_5",
    name: "Trúng đôi",
    description: "Trúng cửa có hai biểu tượng giống nhau 5 lần",
    target: 5,
    reward: 8_000,
    diamonds: 30,
    metric: "baucuaDoubleHits",
  },
  {
    id: "baucua_double_25",
    name: "Đôi như hình với bóng",
    description: "Trúng cửa có hai biểu tượng giống nhau 25 lần",
    target: 25,
    reward: 30_000,
    diamonds: 90,
    metric: "baucuaDoubleHits",
  },
  {
    id: "baucua_triple_1",
    name: "Ba con trùng",
    description: "Trúng cửa ra cả ba biểu tượng giống nhau",
    target: 1,
    reward: 25_000,
    diamonds: 80,
    metric: "baucuaTripleHits",
  },
  {
    id: "baucua_triple_3",
    name: "Hên hết phần thiên hạ",
    description: "Trúng cửa ra ba biểu tượng giống nhau 3 lần",
    target: 3,
    reward: 80_000,
    diamonds: 220,
    metric: "baucuaTripleHits",
  },
  {
    id: "baucua_triple_10",
    name: "Thần tài gõ cửa",
    description: "Trúng cửa ra ba biểu tượng giống nhau 10 lần",
    target: 10,
    reward: 200_000,
    diamonds: 500,
    metric: "baucuaTripleHits",
  },
  {
    id: "baucua_streak_3",
    name: "Đà thắng chiếu bạc",
    description: "Thắng liên tiếp 3 ván Bầu cua",
    target: 3,
    reward: 8_000,
    diamonds: 30,
    metric: "baucuaStreak",
  },
  {
    id: "baucua_streak_5",
    name: "Chuỗi đỏ",
    description: "Thắng liên tiếp 5 ván Bầu cua",
    target: 5,
    reward: 35_000,
    diamonds: 100,
    metric: "baucuaStreak",
  },
  {
    id: "baucua_spread_1",
    name: "Phủ cửa",
    description: "Thắng một ván Bầu cua khi đã cược từ 4 cửa",
    target: 1,
    reward: 8_000,
    diamonds: 30,
    metric: "baucuaSpreadWins",
  },
  {
    id: "baucua_spread_10",
    name: "Rải cược cao tay",
    description: "Thắng 10 ván Bầu cua khi đã cược từ 4 cửa",
    target: 10,
    reward: 40_000,
    diamonds: 120,
    metric: "baucuaSpreadWins",
  },
  {
    id: "baucua_pot_20k",
    name: "Ăn lớn",
    description: "Nhận 20.000 xu trong một ván Bầu cua",
    target: 20_000,
    reward: 8_000,
    diamonds: 30,
    metric: "baucuaBigPayout",
  },
  {
    id: "baucua_pot_200k",
    name: "Ăn đậm",
    description: "Nhận 200.000 xu trong một ván Bầu cua",
    target: 200_000,
    reward: 40_000,
    diamonds: 120,
    metric: "baucuaBigPayout",
  },
  {
    id: "baucua_pot_1m",
    name: "Ăn sạch chiếu",
    description: "Nhận 1.000.000 xu trong một ván Bầu cua",
    target: 1_000_000,
    reward: 150_000,
    diamonds: 400,
    metric: "baucuaBigPayout",
  },
];

// Sinh tồn: mốc tầng theo từng class (tối đa tầng 500) và sự kiện đặc biệt / chuỗi kích hoạt.
const HARDCORE_CLASSES = Object.freeze({
  amazon: "Amazon",
  barbarian: "Barbarian",
  assassin: "Assassin",
  sorceress: "Sorceress",
  druid: "Druid",
  necromancer: "Necromancer",
  paladin: "Paladin",
});
const CLASS_FLOOR_TIERS = Object.freeze([
  { floor: 50, tag: "50", title: "Tân binh", reward: 20_000, diamonds: 60 },
  { floor: 150, tag: "150", title: "Chiến binh", reward: 80_000, diamonds: 200 },
  { floor: 300, tag: "300", title: "Huyền thoại", reward: 200_000, diamonds: 500 },
  { floor: 500, tag: "500", title: "Bất tử", reward: 500_000, diamonds: 1000 },
]);
const classFloorAchievements = Object.entries(HARDCORE_CLASSES).flatMap(([key, name]) =>
  CLASS_FLOOR_TIERS.map((tier) => ({
    id: `hc_class_${key}_${tier.tag}`,
    name: `${name} ${tier.title}`,
    description: `Đạt tầng ${tier.floor} Sinh tồn bằng ${name}`,
    target: tier.floor,
    reward: tier.reward,
    diamonds: tier.diamonds,
    cosmetic: ringForAchievement("hc_class_" + key + "_" + tier.tag)?.id || null,
    metric: `hcClass_${key}`,
  })),
);
const eventAchievements = [
  ["hc_event_5", "Người ưa bất ngờ", "Gặp 5 sự kiện đặc biệt trong Sinh tồn", 5, 10_000, 30, "hardcoreEvents"],
  ["hc_event_25", "Kẻ săn sự kiện", "Gặp 25 sự kiện đặc biệt trong Sinh tồn", 25, 40_000, 120, "hardcoreEvents"],
  ["hc_event_100", "Con cưng của vận may", "Gặp 100 sự kiện đặc biệt trong Sinh tồn", 100, 150_000, 400, "hardcoreEvents"],
  ["hc_chain_3", "Phản ứng dây chuyền", "Kích hoạt 3 chuỗi sự kiện (sự kiện dẫn tới trận chiến)", 3, 15_000, 40, "hardcoreChains"],
  ["hc_chain_15", "Domino chết chóc", "Kích hoạt 15 chuỗi sự kiện", 15, 60_000, 150, "hardcoreChains"],
  ["hc_chain_50", "Bậc thầy chuỗi", "Kích hoạt 50 chuỗi sự kiện", 50, 200_000, 500, "hardcoreChains"],
  ["hc_kinds_5", "Nhà thám hiểm", "Gặp 5 loại sự kiện đặc biệt khác nhau", 5, 15_000, 40, "hardcoreEventKinds"],
  ["hc_kinds_10", "Nhà sưu tầm biến cố", "Gặp 10 loại sự kiện đặc biệt khác nhau", 10, 60_000, 150, "hardcoreEventKinds"],
  ["hc_kinds_20", "Đã thấy tất cả", "Gặp đủ 20 loại sự kiện đặc biệt", 20, 250_000, 600, "hardcoreEventKinds"],
  ["hc_kills_50", "Thợ săn quái", "Hạ 50 quái trong Sinh tồn", 50, 10_000, 30, "hardcoreKills"],
  ["hc_kills_500", "Đồ tể hầm ngục", "Hạ 500 quái trong Sinh tồn", 500, 60_000, 150, "hardcoreKills"],
  ["hc_kills_2500", "Lưỡi hái vực sâu", "Hạ 2.500 quái trong Sinh tồn", 2500, 250_000, 600, "hardcoreKills"],
  ["hc_boss_1", "Kẻ diệt trùm", "Hạ 1 boss trong Sinh tồn", 1, 10_000, 30, "hardcoreBossKills"],
  ["hc_boss_10", "Thợ săn trùm", "Hạ 10 boss trong Sinh tồn", 10, 60_000, 150, "hardcoreBossKills"],
  ["hc_boss_50", "Bóng đen của trùm", "Hạ 50 boss trong Sinh tồn", 50, 250_000, 600, "hardcoreBossKills"],
].map(([id, name, description, target, reward, diamonds, metric]) => ({ id, name, description, target, reward, diamonds, metric }));
const godAchievement = {
  id: "hc_god_rngesus_1", name: "Được Thần Vận Mệnh Chọn",
  description: "Gặp God of RNGesus và nhận phước lành trong Sinh tồn",
  target: 1, reward: 0, diamonds: 0, metric: "hardcoreGodBlessings",
};
const relicAchievements = [
  {
    id: "hc_conquerors_covenant_1",
    name: "Khế Ước Chinh Phạt",
    description:
      "Hợp nhất bốn mảnh và hạ Covenant Guardian, nhận Conqueror’s Covenant [LR] trong Sinh tồn",
    target: 1,
    reward: 0,
    diamonds: 0,
    metric: "hardcoreConquerorRelics",
  },
  {
    id: "hc_gilded_soul_1",
    name: "Linh Hồn Hoàng Kim",
    description:
      "Vượt nghi lễ Oán Hận, hạ Avarice Revenant và nhận Gilded Soul [LR] trong Sinh tồn",
    target: 1,
    reward: 0,
    diamonds: 0,
    metric: "hardcoreGildedRelics",
  },
];
const ACHIEVEMENTS = Object.freeze([
  ...BASE_ACHIEVEMENTS,
  ...classFloorAchievements,
  ...eventAchievements,
  godAchievement,
  ...relicAchievements,
]);

// Nhóm bộ lọc ở /kiemtra (Discord giới hạn 25 mục chọn): các chỉ số cùng chủ đề gộp thành một mục lọc.
const CATEGORY_GROUPS = Object.freeze({
  hardcoreEvents: "hardcoreEvents",
  hardcoreGodBlessings: "hardcoreEvents",
  hardcoreConquerorRelics: "hardcoreEvents",
  hardcoreGildedRelics: "hardcoreEvents",
  hardcoreChains: "hardcoreEvents",
  hardcoreEventKinds: "hardcoreEvents",
  hardcoreKills: "hardcoreEvents",
  hardcoreBossKills: "hardcoreEvents",
  hardcoreRuns: "hardcoreJourney",
  hardcoreEscapes: "hardcoreJourney",
  hardcoreCompletions: "hardcoreJourney",
  gachaSR: "gachaRare",
  gachaSSR: "gachaRare",
  gachaUR: "gachaRare",
  minesClears: "minesFeats",
  minesHardWin: "minesFeats",
  minesBestMultiplier: "minesFeats",
  minesStars: "minesFeats",
  chinchiroShigoro: "chinchiroHands",
  chinchiroZoro: "chinchiroHands",
  chinchiroPinZoro: "chinchiroHands",
  chinchiroHifumi: "chinchiroHands",
  baucuaWins: "baucua",
  baucuaPlayed: "baucua",
  baucuaDoubleHits: "baucua",
  baucuaTripleHits: "baucua",
  baucuaStreak: "baucua",
  baucuaSpreadWins: "baucua",
  baucuaBigPayout: "baucua",
  betStaked: "betMoney",
  betBigWin: "betMoney",
  horseWins: "horse",
  horsePlayed: "horse",
  horseBestMultiplier: "horse",
  horseSpecialWins: "horse",
  horseStreak: "horse",
  horseSpreadWins: "horse",
  horseBigPayout: "horse",
  pokerFoldWins: "pokerFeats",
  pokerAllInWins: "pokerFeats",
  pokerPvpWins: "pokerFeats",
  pokerBigPot: "pokerFeats",
  pokerHandRank: "pokerHands",
});
const achievementCategory = (item) =>
  item.metric.startsWith("hcClass_") ? "hardcoreClass" : CATEGORY_GROUPS[item.metric] || item.metric;

const BETTING_GAMES = Object.freeze(["baucua","taixiu","chinchiro","blackjack","poker","duangua","mines","coquay"]);
const BETTING_SQL = BETTING_GAMES.map((game) => `'${game}'`).join(",");

function metrics(guildId, userId) {
  const guild = String(guildId);
  const user = String(userId);
  const account = getAccount(guild, user);
  const relicCounts = relicRecords.totals(guild, user);
  const gameTypes = db
    .prepare(
      "SELECT COUNT(*) count FROM game_player_stats WHERE guild_id=? AND user_id=? AND played>0",
    )
    .get(guild, user).count;
  const hardcoreFloor =
    db
      .prepare(
        "SELECT COALESCE(best_floor,0) value FROM hardcore_records WHERE guild_id=? AND user_id=?",
      )
      .get(guild, user)?.value || 0;
  const hardcore =
    db
      .prepare(
        "SELECT COALESCE(runs,0) runs, COALESCE(escapes,0) escapes, COALESCE(completions,0) completions FROM hardcore_records WHERE guild_id=? AND user_id=?",
      )
      .get(guild, user) || {};
  const classFloors = {};
  for (const row of db
    .prepare(
      "SELECT class_key, MAX(cleared) best FROM hardcore_run_archive WHERE guild_id=? AND user_id=? GROUP BY class_key",
    )
    .all(guild, user))
    classFloors[`hcClass_${row.class_key}`] = row.best || 0;
  const eventRow =
    db
      .prepare("SELECT events, chains, kills, boss_kills, kinds_json FROM hardcore_event_stats WHERE guild_id=? AND user_id=?")
      .get(guild, user) || {};
  const betting = db
    .prepare(
      `SELECT COALESCE(SUM(wins),0) wins, COALESCE(SUM(CASE WHEN played>0 THEN 1 ELSE 0 END),0) games
       FROM game_player_stats WHERE guild_id=? AND user_id=? AND game IN (${BETTING_SQL})`,
    )
    .get(guild, user);
  const history = db
    .prepare(
      `SELECT COALESCE(SUM(stake),0) staked, COALESCE(MAX(CASE WHEN outcome='win' THEN payout END),0) big
       FROM game_history WHERE guild_id=? AND user_id=? AND game IN (${BETTING_SQL})`,
    )
    .get(guild, user);
  const gacha = { pulls: 0, spent: 0, sr: 0, ssr: 0, ur: 0 };
  const tierRank = { SR: 1, SSR: 2, UR: 3 };
  for (const row of db
    .prepare(
      "SELECT pulls,diamond_cost,results_json FROM gacha_history WHERE guild_id=? AND user_id=?",
    )
    .iterate(guild, user)) {
    gacha.pulls += row.pulls;
    gacha.spent += row.diamond_cost;
    let results = [];
    try {
      results = JSON.parse(row.results_json);
    } catch {}
    for (const result of results) {
      const rank = tierRank[result?.tier] || 0;
      if (rank >= 1) gacha.sr += 1;
      if (rank >= 2) gacha.ssr += 1;
      if (rank >= 3) gacha.ur += 1;
    }
  }
  const mines =
    db
      .prepare(
        "SELECT clears,best_multiplier,max_mines_won,star_finds FROM mines_records WHERE guild_id=? AND user_id=?",
      )
      .get(guild, user) || {};
  const minesWins =
    db
      .prepare(
        "SELECT COALESCE(wins,0) wins FROM game_player_stats WHERE guild_id=? AND user_id=? AND game='mines'",
      )
      .get(guild, user)?.wins || 0;
  const chinchiro =
    db
      .prepare(
        "SELECT shigoro_wins,zoro_wins,pin_zoro_wins,hifumi,best_streak FROM chinchiro_records WHERE guild_id=? AND user_id=?",
      )
      .get(guild, user) || {};
  const chinchiroWins =
    db
      .prepare(
        "SELECT COALESCE(wins,0) wins FROM game_player_stats WHERE guild_id=? AND user_id=? AND game='chinchiro'",
      )
      .get(guild, user)?.wins || 0;
  const poker =
    db
      .prepare(
        "SELECT best_win_rank,fold_wins,allin_wins,pvp_wins FROM poker_records WHERE guild_id=? AND user_id=?",
      )
      .get(guild, user) || {};
  const pokerStats = db
    .prepare(
      `SELECT COALESCE((SELECT wins FROM game_player_stats WHERE guild_id=? AND user_id=? AND game='poker'),0) wins,
        COALESCE((SELECT MAX(payout) FROM game_history WHERE guild_id=? AND user_id=? AND game='poker' AND outcome='win'),0) pot`,
    )
    .get(guild, user, guild, user);
  const horse =
    db
      .prepare(
        "SELECT best_win_multiplier,special_wins,spread_wins,best_streak FROM horse_records WHERE guild_id=? AND user_id=?",
      )
      .get(guild, user) || {};
  const horseStats = db
    .prepare(
      `SELECT COALESCE((SELECT wins FROM game_player_stats WHERE guild_id=? AND user_id=? AND game='duangua'),0) wins,
        COALESCE((SELECT played FROM game_player_stats WHERE guild_id=? AND user_id=? AND game='duangua'),0) played,
        COALESCE((SELECT MAX(payout) FROM game_history WHERE guild_id=? AND user_id=? AND game='duangua' AND outcome='win'),0) pot`,
    )
    .get(guild, user, guild, user, guild, user);
  const baucua =
    db
      .prepare(
        "SELECT triple_hits,double_hits,spread_wins,best_streak FROM baucua_records WHERE guild_id=? AND user_id=?",
      )
      .get(guild, user) || {};
  const baucuaStats = db
    .prepare(
      `SELECT COALESCE((SELECT wins FROM game_player_stats WHERE guild_id=? AND user_id=? AND game='baucua'),0) wins,
        COALESCE((SELECT played FROM game_player_stats WHERE guild_id=? AND user_id=? AND game='baucua'),0) played,
        COALESCE((SELECT MAX(payout) FROM game_history WHERE guild_id=? AND user_id=? AND game='baucua' AND outcome='win'),0) pot`,
    )
    .get(guild, user, guild, user, guild, user);
  return {
    baucuaWins: baucuaStats.wins,
    baucuaPlayed: baucuaStats.played,
    baucuaDoubleHits: baucua.double_hits || 0,
    baucuaTripleHits: baucua.triple_hits || 0,
    baucuaStreak: baucua.best_streak || 0,
    baucuaSpreadWins: baucua.spread_wins || 0,
    baucuaBigPayout: baucuaStats.pot,
    horseWins: horseStats.wins,
    horsePlayed: horseStats.played,
    horseBestMultiplier: Math.floor(horse.best_win_multiplier || 0),
    horseSpecialWins: horse.special_wins || 0,
    horseStreak: horse.best_streak || 0,
    horseSpreadWins: horse.spread_wins || 0,
    horseBigPayout: horseStats.pot,
    pokerWins: pokerStats.wins,
    pokerHandRank: poker.best_win_rank || 0,
    pokerFoldWins: poker.fold_wins || 0,
    pokerAllInWins: poker.allin_wins || 0,
    pokerPvpWins: poker.pvp_wins || 0,
    pokerBigPot: pokerStats.pot,
    chinchiroWins,
    chinchiroShigoro: chinchiro.shigoro_wins || 0,
    chinchiroZoro: (chinchiro.zoro_wins || 0) + (chinchiro.pin_zoro_wins || 0),
    chinchiroPinZoro: chinchiro.pin_zoro_wins || 0,
    chinchiroHifumi: chinchiro.hifumi || 0,
    chinchiroStreak: chinchiro.best_streak || 0,
    minesWins,
    minesClears: mines.clears || 0,
    minesHardWin: mines.max_mines_won || 0,
    minesBestMultiplier: Math.floor(mines.best_multiplier || 0),
    minesStars: mines.star_finds || 0,
    gachaPulls: gacha.pulls,
    gachaSpent: gacha.spent,
    gachaSR: gacha.sr,
    gachaSSR: gacha.ssr,
    gachaUR: gacha.ur,
    hardcoreRuns: hardcore.runs || 0,
    hardcoreEscapes: hardcore.escapes || 0,
    hardcoreCompletions: hardcore.completions || 0,
    betWins: betting.wins,
    betGames: betting.games,
    betStaked: history.staked,
    betBigWin: history.big,
    games: account.games_played,
    wins: account.wins,
    balance: account.balance,
    gameTypes,
    hardcoreFloor,
    ...classFloors,
    hardcoreConquerorRelics: Math.max(relicCounts.conquerors_covenant, eventRow.kinds_json && JSON.parse(eventRow.kinds_json).includes("conquerors_covenant") ? 1 : 0),
    hardcoreGildedRelics: relicCounts.gilded_soul,
    hardcoreGodBlessings: db.prepare("SELECT blessings FROM hardcore_rngesus_favor WHERE guild_id=? AND user_id=?").get(guild, user)?.blessings || 0,
    hardcoreEvents: eventRow.events || 0,
    hardcoreChains: eventRow.chains || 0,
    hardcoreKills: eventRow.kills || 0,
    hardcoreBossKills: eventRow.boss_kills || 0,
    hardcoreEventKinds: eventRow.kinds_json ? JSON.parse(eventRow.kinds_json).length : 0,
  };
}

function getAchievements(guildId, userId) {
  const values = metrics(guildId, userId);
  const claimed = new Set(
    db
      .prepare(
        "SELECT achievement_id FROM achievement_claims WHERE guild_id=? AND user_id=?",
      )
      .all(String(guildId), String(userId))
      .map((row) => row.achievement_id),
  );
  return ACHIEVEMENTS.map((item) => ({
    ...item,
    progress: Math.min(item.target, values[item.metric] || 0),
    complete: (values[item.metric] || 0) >= item.target,
    claimed: claimed.has(item.id),
  }));
}

function claimAchievements(guildId, userId, now = Date.now()) {
  return db.transaction(() => {
    const available = getAchievements(guildId, userId).filter(
      (item) => item.complete && !item.claimed,
    );
    for (const item of available) {
      db.prepare(
        "INSERT INTO achievement_claims(guild_id,user_id,achievement_id,claimed_at) VALUES(?,?,?,?)",
      ).run(String(guildId), String(userId), item.id, now);
      if (item.reward > 0) creditCoins({
        guildId,
        userId,
        amount: item.reward,
        reason: `achievement:${item.id}`,
        operationId: `achievement:${guildId}:${userId}:${item.id}`,
      });
      if (item.diamonds)
        addDiamonds(guildId, userId, item.diamonds, {
          reason: `achievement:${item.id}`,
          operationId: `achievement-diamonds:${guildId}:${userId}:${item.id}`,
          now,
        });
      if (item.cosmetic) grantCosmetic(guildId, userId, item.cosmetic, now);
    }
    return available;
  })();
}
function detectAchievementUnlocks(guildId, userId, now = Date.now()) {
  const unlocked = [];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO achievement_notifications(guild_id,user_id,achievement_id,unlocked_at) VALUES(?,?,?,?)",
  );
  for (const item of getAchievements(guildId, userId)) {
    if (
      item.complete &&
      insert.run(String(guildId), String(userId), item.id, now).changes
    )
      unlocked.push(item);
  }
  return unlocked;
}

module.exports = {
  ACHIEVEMENTS,
  achievementCategory,
  BETTING_GAMES,
  getAchievements,
  claimAchievements,
  detectAchievementUnlocks,
};
