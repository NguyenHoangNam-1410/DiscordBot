# Sinh tồn Beta · Venance

Lệnh: /sinhton beta. Dùng trong kênh Sinh tồn đã cấu hình.

- Vào thẳng Venance SSR S0 ở tầng 1, cược giả lập 100.000 xu. Không cần sở hữu Venance; không cấp nhân vật vào tài khoản.
- Giữ luật và Battle UI hiện tại, gồm quái/boss, checkpoint, Rift, trang bị và sự kiện. Bảng có nhãn BETA và thưởng giả lập.
- Không trừ cược hoặc lấy trang bị/vé từ túi tài khoản. Trang bị nhặt trong beta chỉ dùng trong run.
- Không cộng/trừ xu, gem thật; không cấp XP, khung, thành tích, thành tựu hoặc ghi nhận di vật/God vào hồ sơ. Không tạo hay chiếm mộ chung của người chơi.
- Diamond Merchant chỉ trừ gem giả lập kiếm theo mốc tầng trong run, giữ số đã chi trong snapshot beta. Underworld Lead vẫn có hiệu lực như run thường.
- Tử trận sẽ lưu phiên và hiện nút Hồi sinh · 100% HP. Hồi sinh không cấp thêm MP, không tốn vé, không reset chuỗi cường hóa/S2 hoặc phản công thêm. Có thể dùng nhiều lần. Chết bởi RNGesus/sự kiện sẽ đi qua tầng gây tử trận; chết trong combat tiếp tục trận đó. Nếu Lilith đã chết ở nghi lễ Inarius, beta cứu lại Lilith để có thể thử tiếp.
- Kết thúc beta dùng nút riêng; không quyết toán phần thưởng. Hết hạn hoặc lỗi đăng bảng cũng không hoàn cược giả vào tài khoản.
- Gõ lại /sinhton beta hoặc /sinhton tieptuc để mở lại phiên đang chơi. Mỗi người chỉ có một slot Sinh tồn trong server; beta không thay thế run thật.

## Kiểm chứng

Chạy npm run test:hardcore-beta. Bộ kiểm thử dùng SQLite trong bộ nhớ, đối chiếu toàn bộ bảng dữ liệu ngoài bảng phiên; bao gồm command/router thật, hồi sinh, retry/rollback, mua gem, thanh toán giả lập, timeout, lỗi xuất UI và giới hạn Discord của 41 boss.

Không chạy simulate và không thay luật Tower.

Kiểm thử hồi quy God of RNGesus cũ hiện thất bại tại scripts/test-hardcore-god-rngesus.js:151: kỳ vọng modifiers là object rỗng trong khi Rift V3 giữ tám loại ở giá trị 0. Đã đối chiếu bằng mã HEAD cho toàn bộ module thay đổi và tái hiện cùng lỗi trước bản beta; không thay cơ chế Rift để ép test này qua.
