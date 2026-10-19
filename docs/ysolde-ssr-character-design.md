# Ysolde — bản thiết kế SSR Thủ vệ

Ngày đề xuất: 19/10/2026. **Trạng thái: đề xuất thiết kế, chưa triển khai. Mọi con số dưới đây là giá trị khởi điểm để simulate, chưa có dữ liệu xác minh.**

Liên quan: [Venance](venance-ssr-character-design.md), [Spark và tiến trình nhân vật](spark-tinh-hon-design.md), [tinh hồn 7 SR](sr-character-souls-design.md).

## 1. Định hướng và mục tiêu

**Ysolde · SSR · Thủ vệ (`guardian`) · ưu tiên VIT, bổ sung STR.**

Hiệp sĩ huyết thệ dùng chính Max HP làm tài nguyên. Skill trả HP để chém vật lý và nạp MP; mỗi Skill khắc một Ấn Thệ Ước. Đủ 3 ấn, đòn đánh thường kế tiếp thành **Phá Thệ**: tiêu toàn bộ MP để hồi HP và tạo **Giáp Thệ Ước** (cơ chế giáp mới). Phòng thủ có thể tiêu ấn sớm để hồi ngay.

Khác các nhân vật hiện có:

- **Paladin** (cùng class Thủ vệ) gây Holy DMG theo DEF/RES. Ysolde gây DMG theo **Max HP**, không dùng DEF làm nguồn sát thương.
- **Barbarian** mạnh lên ở ngưỡng HP thấp bằng Fury. Ysolde **tự trả HP** để vận hành vòng tài nguyên; ngưỡng HP thấp chỉ giảm sát thương nhận, không tăng sát thương.
- **Venance** dùng MP để cường hóa. Ysolde **không dùng MP để tung Skill**; MP là lượng hồi phục được tích lại.

| Mốc tài khoản | Mục tiêu hoàn thành tầng 999 |
| ------------- | ---------------------------: |
| SSR · S0      |                   Khoảng 40% |
| SSR · S6      |                   Khoảng 65% |
| UR · S6       |                   Khoảng 70% |
| LR · S6       |                   Khoảng 75% |

Dùng lại bộ mục tiêu của Venance để hai SSR cùng mặt bằng. Tỷ lệ là toàn run, gồm boss cuối và rủi ro sự kiện/RNGesus.

## 2. Skill — Blood Oath / Huyết Thệ

**Giá: 8% Max HP, 0 MP. Tốn một hành động. Gây sát thương vật lý. Boss vẫn phản công bình thường.**

Khi dùng Skill:

- Trả **8% Max HP** (làm tròn xuống, tối thiểu 1). **Không thể tự giết:** luôn chừa ít nhất 1 HP, giống nguyền `skillHpCost` hiện có. Khi HP chỉ còn 1, Skill vẫn dùng được nhưng không trừ thêm.
- Gây sát thương vật lý = **Vật lý ×1,0 + 10% Max HP**. Có thể trượt/Crit theo luật vật lý; phần Max HP cũng nhân Crit. Chịu DEF quái, lá chắn và điều kiện gây sát thương của boss.
- Hồi **2 MP** (tối đa Max MP), chịu `attackManaLoss` và các hiệu ứng chặn/giảm hồi MP. Paradox Mana Fracture: hồi 1 MP thay vì 2.
- Nhận **1 Ấn Thệ Ước** (tối đa 3), kể cả khi đòn trượt. Đã đủ 3 ấn thì Skill vẫn gây DMG/hồi MP nhưng không tích thêm.

Chi phí HP của nhân vật **cộng** với các nguồn khác, không nhân với nhau:

| Nguồn                        |       Thêm |
| ---------------------------- | ---------: |
| Blood Oath                   |  8% Max HP |
| Nguyền `skillHpCost`         | 15% Max HP |
| Paradox Blood Pact           |  5% Max HP |
| Boss Deimoss (`skillHpCost`) |  1% Max HP |

Tổng chi phí vẫn không làm chết. Chi phí HP không bị giảm bởi nội tại, giáp, DEF hay Phòng thủ.

## 3. Đòn tiêu ấn — Oathbreaker / Phá Thệ

Khi có **đủ 3 ấn**, đòn Tấn công kế tiếp tự động thành Phá Thệ:

- Sát thương vật lý = **(Vật lý ×1,5) + 10% Max HP**. Có thể trượt/Crit.
- **Tiêu cả 3 ấn và toàn bộ MP hiện có**, kể cả khi đòn trượt. Không hồi MP từ đòn này (chặn cả hút MP và hồi MP mặc định của đánh thường).
- Hồi HP và tạo giáp **trước phản công**, theo lượng MP đã tiêu:

| Hiệu ứng     | Mỗi MP tính được | Tối đa (5 MP) |
| ------------ | ---------------: | ------------: |
| Hồi HP       |        2% Max HP |    10% Max HP |
| Giáp Thệ Ước |      2,4% Max HP |    12% Max HP |

- **Chỉ tính tối đa 5 MP.** MP vượt 5 vẫn bị tiêu nhưng không tăng hồi/giáp. Điều này giữ vòng HP → MP → hồi không vượt chi phí khi trang bị nâng Max MP tới 10.
- Lượng hồi chịu giảm hồi phục (`healingReduction`, −15% hồi của boss) và giới hạn HP bị khóa. **Giáp không bị giảm hồi phục.**
- Có 0 MP vẫn dùng Phá Thệ được: gây DMG, tiêu ấn, không hồi/không giáp.

### Hiệu quả MP khi bị debuff

Skill không tốn MP, nên các debuff tăng chi phí MP Skill được quy đổi thành giảm hiệu quả mỗi MP:

**Hiệu quả = min(1, 2 / chi phí MP Skill hiện tại)**, với chi phí lấy từ `skillManaCost(state)` như các nhân vật khác.

| Trạng thái                                 | Chi phí |                    Hiệu quả |
| ------------------------------------------ | ------: | --------------------------: |
| Bình thường                                |       2 |                        ×1,0 |
| Nguyền `skillManaExtra` +1                 |       3 |                       ×0,67 |
| Nguyền `skillManaExtra` +3                 |       5 |                        ×0,4 |
| Deimoss Silence (+1)                       |       3 |                       ×0,67 |
| Paradox Mana Fracture (giá 1)              |       1 | ×1,0 (chặn, không thành ×2) |
| Skill miễn phí (Shrine/Astral Singularity) |       0 |                        ×1,0 |

Hiệu quả nhân vào cả hồi HP và giáp, cho cả Phá Thệ và Phòng thủ tiêu ấn sớm.

### Kiểm tra vòng tự hồi

Một vòng chuẩn ở S0: 3 Skill trả **24% Max HP**, Phá Thệ trả lại tối đa **10% hồi + 12% giáp = 22%**. Tổng nhận luôn nhỏ hơn tổng trả, chưa tính phản công mỗi lượt và việc giáp chỉ chặn 80%. Mọi bậc tinh hồn/độ hiếm phải giữ bất đẳng thức này.

## 4. Giáp Thệ Ước (Aegis) — cơ chế mới

Giáp khác Barrier hiện có (Barrier Venance, Bark Druid, lá chắn tinh hồn đều hấp thụ 100%). **Giáp chỉ chặn 80% sát thương.**

Khi nhận sát thương D (sau mọi giảm trừ) và đang có giáp A:

- Giáp nhận **0,8D**, HP nhận **0,2D**.
- Nếu 0,8D > A: giáp về 0, phần dư **(0,8D − A)** trừ tiếp vào HP.
- Tổng HP mất = **0,2D + max(0, 0,8D − A)**.

Ví dụ: D = 40, A = 18 → giáp nhận 32 nên vỡ, dư 14. HP mất 8 + 14 = **22** thay vì 40.

Luật:

- **Thứ tự:** sát thương quái → Phòng thủ/DEF/RES → nội tại Thành Lũy Cuối → chia 80/20 qua giáp → HP.
- **Không cộng dồn:** tạo giáp mới lấy giá trị lớn hơn giữa giáp hiện có và giáp mới. Trần **30% Max HP**.
- Giữ qua phase, **hết khi combat kết thúc**. Không mang sang phòng sau.
- **Không chặn** DMG chuẩn, chi phí HP, bẫy, mất HP mỗi tầng, phản phệ hay sát thương sự kiện. Giữ đúng luật lá chắn nội tại hiện tại.
- Chết và hồi sinh trong cùng combat không nạp lại giáp.

## 5. Phòng thủ — tiêu ấn sớm

- Không có ấn: Phòng thủ bình thường (+1 MP, giảm sát thương theo luật hiện hành).
- Có 1–3 ấn: **tiêu toàn bộ ấn và toàn bộ MP**, hồi HP ngay **trước phản công** = 2% Max HP × MP tính được × hiệu quả × (số ấn / 3). **Không tạo giáp.** Sau đó vẫn nhận +1 MP của Phòng thủ cho vòng kế.
- Ví dụ 2 ấn, 4 MP, không debuff: hồi 2% × 4 × 2/3 ≈ **5,3% Max HP**.

Chờ đủ 3 ấn và đánh Phá Thệ luôn có lợi hơn (thêm giáp và DMG); Phòng thủ sớm là lựa chọn an toàn khi sắp chết.

## 6. Tấn công thường

Vật lý, có thể trượt/Crit, hồi cố định **1 MP**, chịu chặn/giảm hồi MP. Giống Venance: không dùng quy tắc hồi theo % Max MP để đánh thường không thay được Skill.

## 7. Innate — Last Bastion / Thành Lũy Cuối

Có từ tầng 1. Khi HP **dưới 50% Max HP** lúc tính đòn: sát thương nhận **từ phản công của quái/boss giảm 25%**.

- Áp cho phản công vật lý, phép và DMG chuẩn của quái/boss.
- **Không áp** cho chi phí HP, bẫy, mất HP mỗi tầng, phản phệ, sát thương sự kiện.
- Ý tưởng gốc là 30%. Đề xuất khởi điểm 25% vì Skill tự trừ HP sẽ giữ Ysolde dưới 50% thường xuyên, cộng với giáp 80/20 có thể quá trâu. Hiệu chỉnh bằng simulate.

## 8. Awakening — Unbroken Vow / Lời Thề Bất Hoại

Mở sau khi hạ boss tầng 100, cùng mốc thức tỉnh hiện hành. **Phá Thệ tiêu đủ 3 ấn:**

- Sát thương chính **+30%**.
- Gây thêm sát thương vật lý bằng **50% lượng giáp vừa tạo** (trước trần giáp), chịu DEF quái, không Crit, không hồi MP.
- **Miễn phản phệ** trong chính action đó (phản phệ 10% của Avarice Revenant/Gilded Soul). Đây hiện là nguồn phản sát thương duy nhất từ quái lên người chơi, nên chỉ là hiệu ứng phụ.

Phòng thủ tiêu ấn sớm không kích hoạt thức tỉnh.

## 9. Tinh hồn S1–S6

Các bậc cộng dồn. Không bậc nào làm giảm chi phí HP của Skill hoặc tăng số MP tối đa được tính (5), để giữ kiểm tra vòng tự hồi ở mục 3.

| Bậc | Tên đề xuất          | Hiệu ứng                                                                                                                                                            |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Lưỡi kiếm huyết thệ  | Phần Max HP trong DMG Skill và Phá Thệ từ **10% → 12%**.                                                                                                            |
| S2  | Lời thề khai trận    | Lần Skill đầu tiên mỗi combat tạo **2 ấn** thay vì 1. Một lần/combat, không nạp lại qua phase.                                                                      |
| S3  | Thệ ước kiên định    | Sau thức tỉnh: bonus Phá Thệ từ **+30% → +50%**; DMG theo giáp từ **50% → 70%**.                                                                                    |
| S4  | Hộ vệ khẩn cấp       | Phòng thủ tiêu ấn sớm tạo thêm giáp = **50%** lượng giáp Phá Thệ tương ứng (theo MP, hiệu quả và số ấn/3).                                                          |
| S5  | Huyết lũy hoàn thiện | Hệ số vật lý của Phá Thệ từ **×1,5 → ×1,8**; hồi mỗi MP từ **2% → 2,2%** (tối đa 11%; tổng 11% + 12% = 23% < 24%).                                                  |
| S6  | Phán quyết bất hoại  | Sau thức tỉnh: Phá Thệ đủ 3 ấn phát thêm một hit vật lý **40% DMG hit chính sau DEF**. Không Crit, không hồi MP, không tạo ấn, không tràn sang mục tiêu/phase khác. |

## 10. Chỉ số khởi đầu SSR S0

Không trang bị, không loadout, không Rift hoặc buff sự kiện. Cùng công thức V3.1 trong `engine/stats.js`.

| Thuộc tính nền              |   Đề xuất |
| --------------------------- | --------: |
| STR                         |        24 |
| DEX                         |        12 |
| VIT                         |        36 |
| ENE                         |        26 |
| HP cơ sở                    |        44 |
| MP cơ sở                    |         4 |
| RES cơ sở                   |        8% |
| CRIT cơ sở                  |        4% |
| Tỷ trọng vật lý STR / DEX   | 90% / 10% |
| Hệ số phần sức mạnh ban đầu |       1,8 |

| Chỉ số sau quy đổi ở tầng 1 |                    Giá trị |
| --------------------------- | -------------------------: |
| Max HP                      |                    **152** |
| Max MP                      |                      **5** |
| Vật lý                      |                  **21–26** |
| Skill (Vật lý + 10% Max HP) |   **36–41 DMG**, trả 12 HP |
| Phá Thệ (×1,5 + 10% Max HP) |              **46–54 DMG** |
| Phá Thệ đủ 5 MP             | hồi **15 HP**, giáp **18** |
| DEF                         |                     **12** |
| RES                         |                    **13%** |
| ACC chỉ số                  |                     **74** |
| EVA chỉ số                  |                      **6** |
| CRIT                        |                   **5,2%** |

Phép tính theo công thức hiện có, chưa chạy qua engine: HP = 44 + 36×3 = 152; MP = floor(4 + 26/25) = 5; vật lý = floor(floor((24×0,9 + 12×0,1)×0,6)×1,8) = 23 → 21–26; DEF = floor(24×0,3 + 36×0,15) = 12; RES = 8 + floor(26×0,2) = 13.

Max MP 5 khớp đúng số MP tối đa được tính, nên ENE thêm không tăng hồi. Build tự nhiên là VIT (tăng cả HP, DMG Skill, hồi và giáp).

### Mastery — Oathbound Vitality / Sinh Lực Huyết Thệ

| Mỗi +100 điểm | Hiệu quả                                               |
| ------------- | ------------------------------------------------------ |
| VIT           | +330 Max HP, +18 DEF                                   |
| STR           | +15 DEF; vật lý theo tỷ trọng 90/10                    |
| DEX           | +120 ACC, +20 EVA, +3 điểm % CRIT                      |
| ENE           | +20 điểm RES, +5 Max MP (không tăng hồi/giáp quá 5 MP) |

Giữ trần CRIT 35%, né vật lý 30%, RES 70%, Max MP 10.

### Tham số boss để hiệu chỉnh

Đề xuất hệ số DMG lên boss riêng của Ysolde bắt đầu ở **×1,6** (thấp hơn ×2,0 của Venance vì Ysolde gây DMG mọi action trừ Phòng thủ). Bonus boss riêng S6 **×1,0**. Đây là tham số thử nghiệm, không phải hệ số đã đo.

## 11. UR và LR

Điều kiện như Venance: SSR S6 mới nâng lên UR, rồi LR; mỗi bước cần 2 cọc ×50 thẻ SSR cùng class Thủ vệ. Giữ S6, hiệu lực từ run mới.

| Mốc      | Max HP | DMG Skill/Phá Thệ |  Trần giáp |
| -------- | -----: | ----------------: | ---------: |
| SSR · S6 |   ×1,0 |              ×1,0 | 30% Max HP |
| UR · S6  |   ×1,1 |             ×1,08 | 30% Max HP |
| LR · S6  |   ×1,2 |             ×1,15 | 35% Max HP |

Hệ số là mức tuyệt đối theo SSR, không nhân UR × LR. Max HP nhân một lần sau khi tổng hợp chỉ số; chi phí HP, DMG theo Max HP, hồi và giáp dùng Max HP đã nâng, không nhân độ hiếm thêm lần nữa. Không đổi tỷ lệ hồi/giáp mỗi MP hay số MP tối đa được tính.

## 12. Cách hiển thị

Ví dụ khi đang có 2 ấn:

> 🩸 Huyết Thệ: trả 12 HP · 36–41 DMG · +2 MP · Ấn Thệ Ước **2/3**.
> 🛡️ Giáp Thệ Ước: **18** · chặn 80% DMG.
> 🏰 Thành Lũy Cuối: đang hoạt động (HP dưới 50%).

Battle UI hiện chi phí HP thực tế (gồm nguyền/Paradox/boss), số ấn, giáp hiện có, lượng hồi/giáp dự kiến nếu đánh Phá Thệ ngay và hệ số hiệu quả MP khi bị debuff. Icon tạm dùng emoji Unicode; tên portal đề xuất: `class_ysolde`, `skill_ysolde_blood_oath`, `effect_ysolde_aegis`, `innate_ysolde_last_bastion`, `awaken_ysolde_unbroken_vow`, `soul_ysolde_1` … `soul_ysolde_6`.

characterId và profileKey **ysolde**, classKey **guardian**.

## 13. Điểm bắt buộc khi triển khai

- Module riêng `src/hardcore/characters/ysolde.js` theo khuôn `venance.js`: `snapshot()` lưu tham số theo S/độ hiếm lúc tạo run; trạng thái run trong `state.ysoldeState` (số ấn, giáp, cờ S2 đã dùng). Ấn giữ qua phòng; giáp và cờ S2 reset khi combat kết thúc.
- Chi phí HP đi qua `skillHpCost()` để UI và kiểm tra điều kiện dùng Skill dùng chung một nguồn; trừ HP không làm chết.
- Giáp hook vào `enemyTurn` cạnh `venance.absorb` và chỉ chạy khi không phải `plan.trueDamage`. Nội tại giảm 25% áp trước giáp, kể cả DMG chuẩn của boss.
- Hiệu quả MP đọc `skillManaCost(state)`; không hardcode danh sách debuff.
- Hồi HP dùng `heal()` để giảm hồi phục, giới hạn HP và Paradox Blood áp đúng.
- Miễn phản phệ hook vào `events/gildedSoul.js`, chỉ cho action Phá Thệ đủ 3 ấn sau thức tỉnh.
- Hiện có các nhánh hardcode theo `classKey` (Paladin dùng `guardian`). Ysolde phải đọc profile riêng, không mượn nội tại/thức tỉnh của Paladin.
- Tắt trong Tower như nội tại hiện tại. Không vào banner tân thủ; banner SSR và cửa hàng 200 Spark phát hành riêng sau khi kiểm chứng.

## 14. Kế hoạch xác minh — chưa chạy simulate

1. Test xác định (`test:hardcore-ysolde`): chi phí HP chừa 1 HP; cộng dồn với nguyền/Paradox/Deimoss; tích ấn khi trượt; trần 3 ấn; Phá Thệ tiêu MP/ấn, tối đa 5 MP; hiệu quả MP theo bảng; giáp 80/20 và phần dư khi vỡ; giáp không chặn DMG chuẩn/HP cost; Phòng thủ tiêu ấn sớm; reset khi hết combat; hồi sinh; resume.
2. Kiểm tra bất đẳng thức vòng tự hồi ở mọi bậc S và độ hiếm.
3. Policy simulate riêng: biết số ấn, MP, giáp, ngưỡng 50% HP và nguy cơ tử trận; không dùng policy "có MP thì Skill".
4. Lô chẩn đoán 100 run/mốc, rồi tối thiểu 2.000 run/mốc trên seed độc lập. Mốc SSR S0, SSR S6, UR S6, LR S6; báo tỷ lệ, Wilson 95%, tầng/boss tử trận.
5. Thứ tự hiệu chỉnh: S0 bằng hệ số boss, chi phí HP và % nội tại; S6 bằng hệ số Phá Thệ/hit S6; độ hiếm bằng hệ số HP/DMG.

Bản này chưa khẳng định Ysolde đạt bất kỳ mốc thắng nào.
