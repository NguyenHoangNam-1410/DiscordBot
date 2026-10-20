# Rha-Kor — Kẻ Khắc Chiến Luật

**Trạng thái:** đã triển khai (bản thiết kế Cổ Luật; xem `src/hardcore/characters/rhakor.js`)  
**Độ hiếm:** SSR  
**Class:** Chiến binh  
**Profile đề xuất:** `rha_kor`  
**Chỉ số chính:** STR  
**Chỉ số phụ:** VIT  
**Vai trò:** sát thương vật lý, phá DEF, chống EVA và lựa chọn nhịp chiến đấu.

## 1. Bản sắc thiết kế

Rha-Kor phải nổi bật hơn các nhân vật SR nhưng không lặp lối chơi của Venance.

- Skill cơ bản tốn **2 MP**, phù hợp nhân vật vật lý..
- Mỗi lần dùng Skill mở một **Cổ Luật**; action tiếp theo quyết định cách vận hành.
- Có hai mốc Tinh Hồn tăng damage rõ ràng ở S3 và S5.
- S1, S2, S4 và S6 tập trung vào vận hành, độ ổn định và xử lý boss.

Nhịp chơi cơ bản:

> Khai Bia → chọn Đoạn để burst, Hộ để sống sót hoặc Dẫn để hồi phục → tận dụng Quyền Khắc.

## 2. Lore

Trước khi các vương quốc dùng chữ viết hiện đại, những chiến binh đầu tiên khắc luật lên bia đá bằng máu và kim loại. Mỗi nét khắc không chỉ ghi lại lịch sử mà còn buộc thực tại phải tuân theo một mệnh lệnh.

Rha-Kor là người bảo vệ cuối cùng của Thư Bia Uru. Khi các pháp sư phá hủy những bia cổ để chiếm quyền kiểm soát Cổ Luật, Rha-Kor đã nung chảy toàn bộ mảnh bia còn lại vào vũ khí của mình. Từ đó, mỗi nhát chém của hắn là một câu lệnh bị thất truyền.

Hắn không đọc cổ ngữ bằng giọng nói. Hắn viết nó bằng lưỡi rìu.

Rha-Kor không chiến đấu để gây nhiều vết thương nhất. Hắn áp đặt một điều luật lên chiến trường, rồi bắt kẻ địch phải trả giá theo đúng câu chữ đã khắc.

## 3. Bộ kỹ năng

### 3.1. Skill — Khai Bia Cổ Luật

- **Chi phí:** 2 MP.
- **Mục tiêu:** một kẻ địch hợp lệ.
- **Sát thương:** 150% STVL, loại vật lý.
- **Hiệu ứng:** mở `Cổ Luật Chủ Quyền` trong 1 action kế tiếp của Rha-Kor, nếu action không hợp lệ trong những action đã liệt kê chi tiết ở dưới, Cổ Luật Chủ Quyền kết thúc, cần phải sử dụng lại Skill để làm mới lại.
- Dùng Skill mới khi Cổ Luật cũ còn tồn tại sẽ kết thúc luật cũ và chuyển sang Luật Phán.

Action tiếp theo của người chơi quyết định một trong ba luật thông thường. Nếu chọn Skill lần nữa, Rha-Kor đi vào nhánh Luật Phán. Mỗi lần dùng Skill chỉ kích hoạt một luật.

### 3.2. Luật Đoạn — Skill + Attack

Khi Attack kế tiếp gây sát thương chính:

- Đòn Attack nhận thêm **40% DMG** trong cùng action.
- Mục tiêu bị giảm **20% DEF** trong 2 action.
- Nếu mục tiêu là boss, damage vẫn bị chặn đúng mốc; không vượt qua cơ chế boss.

Luật Đoạn là lựa chọn burst và phá DEF.

### 3.3. Luật Hộ — Skill + Defense

Khi dùng Defense:

- Tạo Barrier bằng **12% Max HP**.
- Hồi **2 MP** thay vì 1.
- Giảm **25% damage nhận** và áp dụng thêm hiệu quả của nút Defense trong 1 action kế tiếp.
- Attack kế tiếp gây ít hơn **12% DMG**.


### 3.4. Luật Dẫn — Skill + Potion

Khi dùng Potion:

- Lượng HP hồi tăng thêm **15%**.
- Attack kế tiếp hồi máu dựa trên 12% lượng damage gây ra, không bỏ qua cơ chế cấm hồi HP, vẫn bị giảm hiệu lực hồi HP nếu có cơ chế khác.

### 3.5. Luật Phán — Skill + Skill

Skill lần hai vẫn tốn **2 MP** như Skill bình thường và dùng để chuyển Cổ Luật đang mở thành một đòn kết thúc trực tiếp

- Gây **250% STVL**.
- Mục tiêu bị giảm **25% DEF** trong 1 action.
- Kết thúc Cổ Luật ngay sau khi thi triển; không tạo hit phụ và không tự mở thêm một Skill khác.
- Nếu boss đang ở Boss Phase Gate, damage vẫn bị chặn theo gate.

Luật Phán giúp Rha-Kor có một nhánh dồn damage rõ ràng khi người chơi chấp nhận trả thêm MP, nhưng không biến Skill thành chuỗi bắt buộc 4 MP ở mọi lượt.

### 3.6. Nội tại — Nét Khắc Không Thể Né

Attack và Skill của Rha-Kor bỏ qua 15% DEF hiệu lực của mục tiêu.

### 3.7. Thức tỉnh — Quyền Khắc Cổ Luật

Sau khi hoàn thành một trong bốn Luật, Rha-Kor nhận `Quyền Khắc`

Ở action Attack hoặc Skill kế tiếp:

- Tự động tiêu thụ Quyền Khắc.
- Gây thêm 25% sát thương sau kháng.
- Bỏ qua thêm 20% DEF hiệu lực của mục tiêu.
- Mỗi lần hoàn thành Luật chỉ tạo 1 Quyền Khắc.

## 4. Tinh Hồn S1–S6

Các bậc cộng dồn theo hệ thống Tinh Hồn hiện tại. Không mở S7 và không tạo tài nguyên tài khoản mới.

| Bậc | Tên | Hướng | Hiệu ứng |
| --- | --- | --- | --- |
| S1 | Bia Khai Mệnh | Vận hành | Skill đầu tiên trong mỗi combat hoàn lại 1 MP nếu gây sát thương chính lên mục tiêu hợp lệ. Cổ Luật mở bởi Skill được giữ xuyên phòng; cửa sổ chỉ giảm khi Rha-Kor hành động. |
| S2 | Nét Khắc Bền Vững | Vận hành | Skill kế tiếp trong vòng 2 action được giảm 1 MP, tối thiểu còn 1 MP, Nếu Skill đó kích hoạt Luật Phán, nhận thêm 15% Damage. Nếu Skill bị trượt, hiệu ứng giảm MP vẫn được giữ lại cho lần Skill kế tiếp. Mỗi Cổ Luật chỉ kích hoạt hiệu ứng này một lần. |
| S3 | Luật Đoạn Tuyệt | Damage | Bonus Luật Đoạn tăng từ **40% lên 80% DMG**; Luật Phán tăng từ **250% lên 280% STR**; giảm DEF tăng từ 20% lên 25%. |
| S4 | Luật Hộ Phản Chấn | Vận hành | Barrier Luật Hộ tăng từ 12% lên 24% Max HP. Nếu Barrier hấp thụ damage, Attack kế tiếp nhận thêm +10% Damage. |
| S5 | Quyền Khắc Toàn Phần | Damage | Bonus Quyền Khắc tăng từ **25% lên 35% DMG sau kháng**; cửa sổ hiệu lực tăng từ 2 lên 3 action. |
| S6 | Cổ Luật Không Thể Xóa | Vận hành | Sau khi thi triển skill, hành động tiếp theo trong 3 turn sẽ thực hiện ngay Cổ Luật Tương Ứng, ví dụ Skill, action tiếp theo dùng skill sẽ được tính là Luật Phán, Skill tiếp theo cũng sẽ thi triển Luật Phán, Skill tiếp theo nữa cũng sẽ kích hoạt Luật Phán |

