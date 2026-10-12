# Rift Sinh tồn V3 — quy tắc phát và chiến đấu

Áp dụng cho run Sinh tồn V3 mới (`state.rift.version = 2`). Run đã lưu không có marker tiếp tục luật trước đó. Tower giữ cơ chế và snapshot riêng.

## Phát stack

- Hoàn tất mỗi 10 tầng từ 10 đến 960: một stack. Không phát tại 970/980/990 hoặc các tầng đặc biệt 333/666/999.
- Túi gồm tám loại, xáo trộn một lần rồi lưu cùng vị trí và chu kỳ. Mỗi tám lần phát có đủ tám loại; không xóa Rift thì đến tầng 960 mỗi loại ×12.
- Stack tối đa 12; Rift I ×1–4, II ×5–8, III ×9–12. Nhật ký báo khi lên II/III.
- Khóa loại nhận sau khi giải quyết tầng; chỉ cộng sau tất cả lựa chọn bắt buộc (rương boss, checkpoint, Paradox). `pendingAward` lưu cùng run để mở lại không roll hoặc cộng lần hai.
- Severance 199/399/699/899 xóa một loại về ×0, trừ Unstable. Phước lành xóa tất cả stack. Cả hai giữ thứ tự túi, không sửa encounter đã tạo hoặc hoàn tài nguyên.

## Tám loại

| Rift               | Quy tắc mỗi stack / ngưỡng                                                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stone Skin         | Stone Armor bằng 1,5% Max HP, tối đa 18%. Mỗi hit phá riêng; dư trừ HP ngay. Vỡ giáp giảm DEF quái 8/12/16% theo tier đến hết trận. Hồi HP/chuyển phase không hồi giáp.                                                                         |
| Elemental Dominion | Quái hỗn hợp +2 điểm % phản công phép; phản công phép +1,25% DMG. Không tăng vật lý, DMG chuẩn hoặc cố định. Loại phản công khóa trước lượt.                                                                                                    |
| Bloodlust          | Lần đầu HP quái xuống dưới 50%: phản công tiếp +12% +2% × stack DMG. Phòng thủ giảm một nửa bonus; né/chặn vẫn tiêu trạng thái. Một lần/thanh HP.                                                                                               |
| Unstable Rift      | Hòm/kho báu +0,75 điểm %, lấy từ quái thường; SSR kho báu an toàn +2 điểm %, Mimic +1,5 điểm %, Ancient Mimic +0,5 điểm %. Giữ pity và cap, không áp dụng rương boss/goblin/phần thưởng sự kiện.                                                |
| Fortified          | Max HP quái +3%. Lần đầu dưới 50%: action gây DMG kế tiếp của bạn +10/15/20% theo tier, toàn bộ hit. Action kích hoạt không được bonus.                                                                                                         |
| Swift Horror       | Phản công vật lý quái +1 điểm % trúng. Né tự nhiên tạo Exposed: action gây DMG kế +8/12/16%, vật lý chắc chắn trúng. Né bảo đảm không kích hoạt.                                                                                                |
| Soul Drain         | ceil(stack/4), tối đa ba charge/combat. Phản công trúng hút 1 MP; 0 MP giữ charge. Phòng thủ tiêu charge, không mất MP; né/chặn giữ charge. Sau khi thực sự bị hút, đánh thường tiếp theo hồi thêm 1 MP một lần, không vượt MP tối đa hiệu lực. |
| Cursed Ground      | Khi nhận vật lý: DEF gốc × (1 −2% × stack), làm tròn xuống. Khi nhận phép: RES gốc −1,5 điểm % × stack. Sau đó mới áp dụng buff class, Consecration và Phòng thủ. Không thay đổi stat gốc, hồi phục hoặc Barrier.                               |

## Tương tác và ưu tiên

- Swift và Fortified Exposed cùng tồn tại thì cộng các phần trăm bonus trên cùng action; chỉ tiêu khi action thực sự gây sát thương. Echo/Nova trong action hưởng bonus của hit chính, không nhân thêm lần nữa.
- Bloodlust/Fortified kiểm tra ngưỡng HP thật; Stone Armor không tính vào Max HP. Boss chuyển phase cùng thanh HP không tái kích hoạt. Các thanh HP riêng của Deimoss có lượt kích hoạt riêng.
- Barrier người chơi hấp thụ sau giảm trừ; Fury chỉ tính HP thực mất.
- DMG chuẩn/cố định của boss giữ luật boss, bỏ qua bonus Elemental/Bloodlust. Các hành động riêng Brain Control/Malic/Control/portal Xazax/golem Bartuc và sát thương boss tự gây giữ cơ chế riêng, bỏ qua Stone Armor/Exposed. Chi tiết Rift ghi rõ ngoại lệ.
- Hút MP riêng của Lazarus/Baal/Atanna/Deimoss, clone Skill của Uldyssian và các boss cũ có hút MP thay thế Soul Drain; charge được giữ, không hút hai lần trên cùng hit. UI Rift/battle ghi rõ thay thế.
- Snapshot giáp, stack, charge, Exposed, ngưỡng từng thanh HP và loại phản công lưu trong encounter. Mở UI/khởi động lại không roll, hồi giáp hoặc tái tiêu charge.

## Kiểm chứng

`npm run test:hardcore:rift`: 21 nhóm xác định, gồm 96 lần phát theo túi, resume/stale action, các tương tác nhiều hit/Echo/Nova, Barrier, boss và giới hạn Discord. Không chạy mô phỏng tỷ lệ thắng.

Miễn nhiễm của boss được xử lý trước Stone Armor: hit bị vô hiệu không phá giáp.
