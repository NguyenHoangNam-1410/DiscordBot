# Rha-Kor — Kẻ Khắc Chiến Luật

**Trạng thái:** đề xuất thiết kế, chưa triển khai code  
**Độ hiếm:** SSR  
**Class:** Chiến binh  
**Profile đề xuất:** `rha_kor`  
**Chỉ số chính:** STR  
**Chỉ số phụ:** VIT  
**Vai trò:** sát thương vật lý đơn mục tiêu, phá DEF và bùng nổ theo dấu ấn.

## 1. Mục tiêu thiết kế

Rha-Kor được thiết kế để có lối chơi khác hẳn Venance:

- Không biến Attack thành đòn cường hóa.
- Không yêu cầu chuỗi ba đòn liên tiếp.
- Không phụ thuộc việc boss phải gây sát thương.
- Sát thương nền tự tạo được ngay từ tầng đầu.
- Hành động của boss chỉ tạo thêm lợi ích, không phải điều kiện để nhân vật hoạt động.

Nhịp chơi cốt lõi là:

> Dùng Skill đặt Vết Khắc → tiếp tục gây sát thương bình thường → Vết Khắc phát nổ → phá DEF và chuẩn bị chu kỳ kế tiếp.

## 2. Lore

Trước khi các vương quốc dùng chữ viết hiện đại, những chiến binh đầu tiên khắc luật lên bia đá bằng máu và kim loại. Mỗi nét khắc không chỉ ghi lại lịch sử mà còn buộc thực tại phải tuân theo một mệnh lệnh.

Rha-Kor là người bảo vệ cuối cùng của Thư Bia Uru. Khi các pháp sư phá hủy những bia cổ để chiếm quyền kiểm soát Cổ Luật, Rha-Kor đã nung chảy toàn bộ mảnh bia còn lại vào vũ khí của mình. Từ đó, mỗi nhát chém của hắn là một câu lệnh bị thất truyền.

Hắn không đọc cổ ngữ bằng giọng nói. Hắn viết nó bằng lưỡi rìu.

Rha-Kor không chiến đấu để gây nhiều vết thương nhất. Hắn chiến đấu để đặt đúng vết khắc cuối cùng, nơi toàn bộ bản án sẽ sụp xuống cùng một lúc.

## 3. Bộ kỹ năng

### 3.1. Skill — Khắc Lệnh Phá Giáp

- **Chi phí:** 2 MP.
- **Mục tiêu:** một kẻ địch đang hợp lệ để nhận sát thương.
- **Sát thương ban đầu:** 220% ST vật lý.
- **Hiệu ứng:** đặt `Vết Khắc Cổ Luật` (LV1) lên mục tiêu trong 3 lượt tiếp theo của Rha-Kor.
- Nếu dùng Skill mới khi Vết Khắc cũ còn tồn tại, Vết Khắc cũ bị xóa và chu kỳ mới bắt đầu.
- Nếu quái vật chết trước khi vết khắc nổ, ấn được chuyển sang quái vật ở tầng tiếp theo, (không có hiệu lực nếu tầng sau đó là boss, sự kiện khác, vết khắc sẽ không được áp dụng, Player phải dùng skill để tạo vết khắc mới)

#### Vết Khắc Cổ Luật

Mỗi khi Rha-Kor gây sát thương thực sự lên mục tiêu đang có Vết Khắc:

1. Tăng Vết Khắc thêm một cấp, tối đa 3 cấp.
2. Chỉ tính hit chính của Attack hoặc Skill.
3. Không tính hit phụ, phản đòn, phản phệ, sát thương cố định hoặc sát thương lên mục tiêu không hợp lệ.

Khi Vết Khắc đạt cấp 3:

- Phát nổ ngay sau khi xử lý action hiện tại.
- Gây thêm 280% sát thương vật lý.
- Giảm 20% DEF hiệu lực của mục tiêu trong 2 lượt tiếp theo.
- Xóa Vết Khắc sau khi phát nổ.

Nếu hết 3 lượt mà chưa đạt cấp 3, Vết Khắc biến mất mà không phát nổ. Dùng Defense, Potion hoặc xử lý cơ chế boss vẫn làm giảm thời lượng như hành động hợp lệ, nhưng không tự tăng cấp Vết Khắc.

### 3.2. Nội tại — Thân Bia Bất Khuất

Khi Vết Khắc phát nổ:

- Rha-Kor nhận 12% giảm sát thương trong lượt kế tiếp.
- Nếu vụ nổ hạ mục tiêu, hồi 1 MP.
- Hồi MP không vượt Max MP.
- Mỗi vụ nổ chỉ kích hoạt nội tại một lần.
- Hit phụ của vụ nổ không tạo thêm hồi MP.

Nội tại giúp Rha-Kor có khả năng tự duy trì trong run dài nhưng không biến nhân vật thành tanker thuần túy.

### 3.3. Tương tác với hành động của boss — Mệnh Đề Phản Nghịch.

Nếu boss gây sát thương trực tiếp trong lúc Vết Khắc còn tồn tại:

- Vết Khắc nhận một `Mệnh Đề Phản Nghịch`.
- Khi Vết Khắc phát nổ, sát thương vụ nổ tăng thêm 20%.
- Mỗi Vết Khắc chỉ nhận tối đa một Mệnh Đề.
- Nếu boss không tấn công hoặc không dùng kỹ năng đặc biệt, hiệu ứng không được áp dụng.

### 3.4. Thức tỉnh — Cổ Luật Đoạn Tuyệt

Mở theo mốc thức tỉnh hiện hành (sau khi giết boss Floor 100).

Khi Vết Khắc đạt cấp 2 và phát nổ:

- Sát thương vụ nổ tăng từ 280% lên 360% ST VL.
- Giảm DEF tăng từ 20% lên 25% trong 1 lượt.
- Tạo Barrier bằng 12% Max HP.
- Barrier không chặn HP cost, sát thương chuẩn, phản phệ hoặc sát thương đã được boss quy định là không thể giảm.
- Chỉ kích hoạt một lần cho mỗi Vết Khắc.

## 4. Tinh Hồn S1–S6

Các bậc cộng dồn theo hệ thống hiện tại.

| Bậc | Tên | Hiệu ứng |
| --- | --- | --- |
| S1 | Nét Chém Khai Luật | Sát thương ban đầu của Khắc Lệnh Phá Giáp tăng từ 220% lên 250% STVL. |
| S2 | Vết Khắc Sâu | Giảm LVL phát nổ của vết khắc xuống 2, vụ nổ được tăng sát thương thêm 15% (Sau khi nổ lập tức xóa vết khắc). |
| S3 | Phán Quyết Phá Giáp | Sát thương vụ nổ tăng từ 280% lên 340% STVL; hiệu ứng giảm DEF tăng từ 20% lên 25%. |
| S4 | Bia Đá Hộ Thể | Khi Vết Khắc phát nổ, giảm thêm 10% sát thương nhận trong lượt kế tiếp. Hiệu ứng này cộng dồn với Nội tại nhưng không vượt trần giảm sát thương hiện hành. |
| S5 | Chiến Luật Hoàn Chỉnh | Sát thương Skill tăng từ 250% lên 280% STVL. Vụ nổ hồi thêm 1 MP một lần trong mỗi combat. |
| S6 | Đoạn Tuyệt Cổ Văn | Sau vụ nổ, tạo một Dư Chấn Vật Lý bằng 65% sát thương hit chính sau giảm trừ. Dư Chấn có thể Crit, nhưng không tạo lại Vết Khắc, không kích hoạt thêm nội tại và không đánh sang phase mới. |

### Quy tắc S2

S2 không cho phép một Skill hoàn thành Vết Khắc ngay lập tức. Sau S2, hit đầu tiên đưa Vết Khắc lên cấp 1; vẫn cần một hit chính hợp lệ nữa để đạt cấp 2. Mục đích của S2 là rút ngắn chu kỳ nhưng vẫn giữ cơ chế.

### Quy tắc S5

Hồi MP từ S5 chỉ tính sau khi vụ nổ chính được xử lý thành công. Không hồi MP nếu mục tiêu đã biến mất trước khi vụ nổ, bị miễn sát thương hoàn toàn hoặc action bị hủy.

### Quy tắc S6

- Dư Chấn lấy sát thương vụ nổ sau kháng làm cơ sở.
- Không nhân lại hệ số boss, hệ số độ hiếm hoặc bonus S6.
- Không tạo thêm hit phụ.
- Không kích hoạt lại Vết Khắc, Thân Bia hoặc Mệnh Đề Phản Nghịch.
- Nếu vụ nổ kết thúc combat, Dư Chấn không chuyển sang mục tiêu hay phase khác.

## 5. Giới hạn cơ chế bắt buộc

- Vết Khắc là trạng thái chiến đấu tạm thời trên mục tiêu, không phải tiền tệ hoặc tài nguyên tài khoản.
- Không tạo Skill thứ hai, nút phụ hoặc selector mới.
- Attack của Rha-Kor vẫn dùng công thức Attack vật lý hiện hành.
- Cổ Luật không tự tăng cấp từ hit phụ, phản đòn, phản phệ hoặc sát thương cố định.
- Chuyển phase không tự làm mới Vết Khắc.
- Đổi mục tiêu làm mất Vết Khắc nếu mục tiêu ban đầu không còn hợp lệ; không chuyển dấu ấn sang boss khác.
- Snapshot Tinh Hồn và độ hiếm được lấy lúc bắt đầu run.
- Nâng Tinh Hồn giữa run không thay đổi run đang diễn ra.
- Không ảnh hưởng Tower hoặc cơ chế riêng của bảy nhân vật SR.

## 6. Mục tiêu cân bằng

Rha-Kor nên có:

- Damage tầng đầu ổn định nhờ Skill và vụ nổ tự kích hoạt.
- Tốc độ clear tốt hơn nhân vật SR khi giữ được chu kỳ.
- Khả năng phá DEF hữu ích ở boss nhưng không biến thành xuyên DEF tuyệt đối.
- Khả năng sinh tồn vừa phải qua giảm sát thương, không thay thế Paladin.
- Burst cao ở S6 nhưng phải trả giá bằng việc duy trì Vết Khắc và chọn thời điểm dùng Skill.

Không nên dùng việc boss gây nhiều sát thương làm điều kiện bắt buộc để Rha-Kor đạt tỷ lệ thắng ở tầng 999.

## 7. Kế hoạch kiểm thử khi triển khai

1. Skill gây sát thương đúng một lần và đặt Vết Khắc đúng mục tiêu.
2. Hai hit chính hợp lệ tự kích hoạt vụ nổ kể cả khi boss không tấn công.
3. Hit phụ và phản đòn không tăng cấp Vết Khắc.
4. Vết Khắc hết hạn đúng sau 3 lượt của Rha-Kor.
5. Mệnh Đề Phản Nghịch chỉ tăng bonus một lần.
6. Defense không làm Vết Khắc tự tăng cấp nhưng vẫn giảm thời lượng.
7. S4 không cho vụ nổ kích hoạt chỉ bằng một hit duy nhất ngoài điều kiện đã mô tả.
8. S5 và nội tại không hồi MP vượt Max MP hoặc hồi lặp qua hit phụ.
9. S6 không tạo chuỗi proc mới và không đánh sang phase khác.

