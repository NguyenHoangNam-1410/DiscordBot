# Sinh tồn 3.0.0 — hệ chỉ số

Cập nhật ngày 12/10/2026. Áp dụng cho run mới; run V2 đang chơi tiếp tục dùng nguyên công thức V2.

## Phạm vi

Thực hiện Class Core, chuyển đổi thuộc tính theo mastery và tách nguồn sát thương từ nghiên cứu 10/10/2026. Nghiên cứu chưa chốt hệ số; bảng dưới là cấu hình đầu tiên triển khai, chưa phải kết quả cân bằng tỷ lệ thắng 999 tầng.

Giữ nguyên định nghĩa/stat/passive/nguyền của item, số item hoạt động, tăng level, Forge/hấp thụ, drop, checkpoint, kỹ năng và hệ số kỹ năng, boss, event, Rift/Paradox/Contract, payout, LR và Tháp Định Mệnh. Chỉ số mới sẽ ảnh hưởng kết quả chiến đấu; không tuyên bố tỷ lệ thắng giữ nguyên. Trigger gameplay, affinity, giới hạn năm item, giảm dần level và sửa Forge trong nghiên cứu nằm ngoài yêu cầu lần này.

## Chuyển đổi thuộc tính

Chỉ số bắt đầu của bảy class giữ nguyên. Gọi S0/D0/V0/E0 là thuộc tính nền, S/D/V/E là thuộc tính hiện tại sau item và mọi nguồn; mỗi thuộc tính ít nhất 1. Mastery áp dụng cho phần tăng/giảm so với nền.

| Class       | ACC/DEX | EVA/DEX | CRIT điểm %/DEX | Trần CRIT | Trần né | HP/VIT | DEF/STR | DEF/VIT | RES điểm %/ENE | MP/ENE | Vật lý phân bổ | Phép phân bổ | Vật lý/VIT | Vật lý/ENE | Phép/VIT |
| ----------- | ------: | ------: | --------------: | --------: | ------: | -----: | ------: | ------: | -------------: | -----: | -------------: | -----------: | ---------: | ---------: | -------: |
| Amazon      |    1,35 |     0,3 |            0,06 |       50% |     40% |      3 |     0,2 |    0,15 |            0,1 |   0,04 |              1 |            1 |          0 |          0 |        0 |
| Barbarian   |     1,2 |    0,15 |            0,03 |       40% |     30% |      4 |     0,4 |     0,2 |            0,1 |   0,04 |            1,2 |            1 |          0 |          0 |        0 |
| Assassin    |     1,2 |     0,9 |            0,18 |       65% |     55% |      3 |    0,15 |     0,1 |            0,1 |   0,04 |            1,1 |            1 |          0 |          0 |        0 |
| Sorceress   |     1,2 |    0,15 |            0,03 |       35% |     30% |      3 |    0,15 |     0,1 |           0,22 |   0,05 |              1 |          1,2 |          0 |          0 |        0 |
| Druid       |     1,2 |    0,25 |            0,04 |       40% |     35% |      4 |     0,2 |     0,2 |           0,16 |   1/22 |              1 |            1 |       0,12 |        0,1 |        0 |
| Necromancer |     1,2 |    0,15 |            0,03 |       35% |     30% |      3 |    0,15 |     0,2 |            0,2 |   0,05 |              1 |          1,1 |          0 |          0 |      0,1 |
| Paladin     |     1,2 |    0,15 |            0,04 |       40% |     30% |    3,5 |    0,35 |    0,25 |           0,18 |   0,04 |              1 |            1 |       0,08 |       0,05 |        0 |

Hệ số damage phân bổ nhân đóng góp STR/DEX hoặc ENE của nguồn checkpoint/event; gear mặc định là 1. Damage cộng thẳng từ event không bị nhân hệ số toàn cục.

    MaxHP = max(1, floor(HP nền + V0×3 + (V−V0)×HP/VIT + HP cộng thẳng))
    DEF = max(0, floor(S0×0,3 + V0×0,15 + (S−S0)×DEF/STR + (V−V0)×DEF/VIT) + DEF cộng thẳng)
    ACC = max(1, floor(60 + D0×1,2 + (D−D0)×ACC/DEX) + ACC cộng thẳng)
    EVA = max(0, floor(D0×0,55 + (D−D0)×EVA/DEX) + EVA cộng thẳng)
    CRIT = clamp(CRIT nền + D0×0,1% + (D−D0)×CRIT/DEX + CRIT cộng thẳng, 0, trần class + passive)
    RES = clamp(RES nền + floor(E0×0,2 + (E−E0)×RES/ENE) + RES cộng thẳng, −30, 70)
    MaxMP = clamp(floor(MP nền + E0/25 + (E−E0)×MP/ENE + MP cộng thẳng), 1, 10)
    Né thực tế = clamp(EVA / (max(1, ACC đối thủ) + EVA), 5%, trần né class + passive)

Passive nâng trần giữ giới hạn cộng thêm 15 điểm %; trần tuyệt đối CRIT 75%, né 60%. Phép vẫn luôn trúng, không né/Crit. Lời nguyền đặt DEF=0 vẫn ưu tiên công thức DEF. Hiệu lực bình vẫn theo VIT và công thức cũ. Tăng MaxHP/MaxMP không tự hồi HP/MP.

## Ba nguồn sát thương

Ký hiệu w là tỷ trọng STR cũ của class; P(x)=(x.STR×w+x.DEX×(1−w))×0,6, M(x)=x.ENE×0,75.

- Nền class: vật lý floor(floor(P(nền))×basePower), phép floor(floor(M(nền))×basePower). basePower giữ hệ số đầu run cũ: Amazon 2,09; Barbarian 1,64; Assassin 1; Sorceress 1,57; Druid 1,12; Necromancer 0,54; Paladin 1,67.
- Phân bổ: sources.checkpoint, sources.event và các nguồn khác trừ absorbed. Thuộc tính hiệu dụng A=max(1,nền+nguồn phân bổ)−nền.
- Item/hấp thụ: mọi item ở level hiện tại, chỉ các cấp chưa giải nguyền, cộng sources.absorbed. Thuộc tính hiệu dụng G=thuộc tính hiện tại−nền−A, tránh tính trùng khi có nguồn âm chạm sàn 1.

  Vật lý phân bổ = (P(A)×physicalPower + A.VIT×vitPhysical + A.ENE×enePhysical + physical phân bổ)×attributePower
  Phép phân bổ = (M(A)×spellPower + A.VIT×vitSpell + spell phân bổ)×attributePower
  Vật lý item = (P(G) + G.VIT×vitPhysical + G.ENE×enePhysical + physical item/hấp thụ)×equipmentPower
  Phép item = (M(G) + G.VIT×vitSpell + spell item/hấp thụ)×equipmentPower
  Damage trung tâm = max(0, floor(nền + phân bổ + item))
  Dải damage = [max(1, trung tâm−2), trung tâm+3]

attributePower=1, equipmentPower=1, skillPower=1. Sau đó dùng nguyên trình tự Skill, passive/LR/Rift, Crit và giảm trừ quái hiện tại. +10 physical/spell trực tiếp từ item tăng trung tâm đúng 10 ở mọi class. Stat/passive của toàn bộ item vẫn hoạt động; level chưa bị giới hạn. Hấp thụ không được tính lại thành điểm checkpoint.

## Lưu và UI

Run V3 lưu gameplayVersion=3, releaseVersion/balanceVersion=3.0.0, statSystemVersion=3, classMasteryVersion=1, catalogVersion=2; statProfile chứa core, mastery và bốn hệ số power. Tiếp tục run đọc snapshot, không chép lại hệ số hiện tại. Snapshot thiếu/hỏng bị từ chối thay vì âm thầm đổi công thức. Run V2 không được chuyển sang V3.

Tab Chỉ số có Mastery và nguồn sát thương class / phân bổ / item-hấp thụ. Luật và bảng chuẩn bị ghi phiên bản mới. UI chiến đấu giữ bố cục hiện tại.

## Kiểm tra

Test V3 đối chiếu 28 mẫu V2 từ commit 149ee4ff3d964bfaf232e60cf4732fe800d7686d, kiểm tra chỉ số khởi đầu, snapshot/resume, hồ sơ hỏng, cùng stat/gear giữa class, cap, damage item/hấp thụ, không tự hồi máu, UR giải nguyền, giới hạn Discord và transaction thật. Bộ test gameplay kiểm tra boss, event, LR, nguyền, passive, payout, Tháp và legacy. Cần mô phỏng riêng trước khi kết luận tỷ lệ thắng của từng class.

Bộ test tổng chưa xanh do các lỗi tồn tại trên source trước thay đổi: test-hardcore-loadout (fixture RNGesus), test-hardcore-trap (text thuế cũ), test-hardcore (đường cong enemyScale) và test-command-handlers (INVALID_BUFF_TYPE). Đã tái hiện cả bốn bằng module từ HEAD 149ee4f; không sửa các cơ chế ngoài phạm vi. Test Blood Merchant cập nhật kỳ vọng 5 VIT của Barbarian từ 15 thành 20 HP và đã qua.
