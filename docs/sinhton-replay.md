# Replay Sinh tồn offline

Dùng **/sinhton replay ma_van:<mã 12 ký tự>**. Mã ván nằm ở cuối bảng Sinh tồn. Bot gửi file HTML; tải file xuống rồi mở bằng trình duyệt để xem offline. Không cần domain, web server hoặc đăng nhập web. Discord không chạy giao diện HTML ngay trong khung chat.

## Điều khiển

- Chọn **Lượt / Tầng**, nhập số và nhấn Enter hoặc **Đi tới**.
- **Trước / Sau** chuyển từng mốc đã ghi ở chế độ Lượt, hoặc sang tầng liền trước/sau trong lịch sử ở chế độ Tầng. Có thể dùng phím mũi tên khi không nhập liệu.
- Thanh tiến trình hỗ trợ kéo nhanh. Nhảy tới tầng mở mốc đầu tiên của tầng đó; đổi sang Lượt để xem các hành động tiếp theo.
- Tầng của hành động và tầng/phòng sau hành động hiển thị riêng: một lượt kết liễu có thể đưa người chơi sang tầng mới.
- Mốc ban đầu là lượt 0. Ghi cả hành động chọn mục tiêu/selector hợp lệ, dù hành động không tiêu lượt chiến đấu theo cơ chế boss. Số mốc có thể khác số lượt.
- Hiện HP/MP, chỉ số, đối thủ, log, trang bị, Rift và trạng thái hiệu ứng đã ghi. Phần chi tiết trạng thái hỗ trợ đối chiếu cơ chế; không chạy lại engine hoặc RNG.

## Phạm vi và dữ liệu cũ

Chỉ xuất khi ván đã kết thúc: tử trận, rút thưởng, hoàn thành, bỏ cuộc, timeout hoặc quản trị viên kết thúc. Hỗ trợ run Sinh tồn legacy/V2/V3 và beta qua runtime Sinh tồn; Tháp Định Mệnh dùng runtime riêng chưa có replay này.

Mã ván được kiểm tra trong server đang gọi lệnh. Thành viên server có thể xem ván đã kết thúc của server đó; không truy xuất ván server khác. Lệnh trả file riêng cho người gọi. File đã tải có thể chia sẻ như một bản replay độc lập.

- Run bắt đầu sau cập nhật: lưu từ trạng thái ban đầu tới hành động kết thúc.
- Run đang chơi từ trước cập nhật: bắt đầu ghi ở hành động tiếp theo, đánh dấu lịch sử một phần; không dựng các lượt đã mất.
- Run cũ đã kết thúc và còn trong archive: chỉ xuất tổng kết, báo rõ không có snapshot từng lượt.
- Ván đang chơi luôn bị chặn, kể cả đã có snapshot.

## Lưu trữ và tính nguyên tử

Migration 48 tạo hardcore_replays và hardcore_replay_frames trong database đang dùng. Mỗi hành động thành công lưu snapshot nén riêng, cùng transaction với state, thanh toán và kết thúc run. Action sai/stale/khác người không thêm mốc. Lỗi ghi lịch sử rollback cả lượt và giao dịch thưởng. Snapshot không ghi đè hoặc xóa khi xóa session đã kết thúc.

Mỗi mốc lưu state gốc nén và một bản dữ liệu hiển thị được chụp ngay tại thời điểm đó. Xuất file chỉ dùng bản hiển thị, không normalize state bằng engine hiện tại. Fairness seed, event roll và dữ liệu tài khoản không được xuất trực tiếp. Dữ liệu nằm trong cùng SQLite nên đi theo quy trình backup/restore hiện có. Chưa tự xóa lịch sử; cần theo dõi dung lượng database khi nhiều run dài.

HTML chứa CSS/JavaScript và dữ liệu gzip dưới dạng base64; không tải thư viện/ảnh bên ngoài, không có API ghi game. Nội dung động dùng textContent; CSP chặn kết nối mạng. Cần trình duyệt hỗ trợ DecompressionStream gzip; nếu không, file hiển thị hướng dẫn đổi trình duyệt. File vượt giới hạn Discord (tối đa 8 MiB hoặc giới hạn interaction nhỏ hơn) sẽ báo lỗi rõ ràng.

## Triển khai và kiểm thử

Deploy cả src/hardcore/replay, restart bot để chạy migration và đăng ký lại slash commands bằng **npm run register** để có subcommand replay với tham số ma_van. Không có biến môi trường hoặc service web mới.

Chạy **npm run test:hardcore-replay**. Bộ test dùng SQLite trong RAM và thực thi client HTML để kiểm tra lượt/tầng, Prev/Next, slider, input sai, lịch sử trống, snapshot/rollback, kết thúc beta/admin/timeout, seed không bị xuất, dữ liệu cũ và command thật. Kiểm tra bổ sung beta, gacha, latency và module boundaries.
