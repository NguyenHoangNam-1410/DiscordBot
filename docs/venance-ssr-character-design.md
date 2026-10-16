# Venance — bản thiết kế SSR đầu tiên

Ngày đề xuất: 15/10/2026. **Trạng thái: đã triển khai catalog, bộ kỹ năng, S1–S6, quyền sở hữu, combat, banner SSR/Spark và nâng SSR → UR → LR. Các mốc win rate dưới đây là mục tiêu thiết kế.**

Liên quan: [Spark và tiến trình nhân vật](spark-tinh-hon-design.md), [tinh hồn 7 SR](sr-character-souls-design.md).

## 1. Định hướng và mục tiêu

**Venance · SSR · Pháp sư · ưu tiên ENE, bổ sung VIT.**

Pháp sư dùng Skill để chuẩn bị một chuỗi đánh thường bằng phép. Chọn giữa đánh đủ ba đòn để bùng nổ hoặc tiêu một hành động cho Phòng thủ/bình máu để sống sót. Không dùng Skill gây phép trực tiếp như Sorceress, không dùng cơ chế né phản công của Necromancer.

| Mốc tài khoản |      Mục tiêu hoàn thành tầng 999 |
| ------------- | --------------------------------: |
| SSR · S0      |                        Khoảng 40% |
| SSR · S6      |                        Khoảng 65% |
| UR · S6       | Đề xuất mốc trung gian khoảng 70% |
| LR · S6       |                        Khoảng 75% |

Ba mốc 40% / 65% / 75% do người dùng yêu cầu. Mốc UR và các con số kỹ năng/chỉ số dưới đây là đề xuất mới, chưa có dữ liệu xác minh. Tỷ lệ là toàn run, gồm boss cuối và rủi ro sự kiện/RNGesus, không chỉ tính những run đã gặp boss cuối.

Đây là mục tiêu trung bình theo cấu hình kiểm chứng, không phải trần thắng cứng cho mọi build hoặc run có di vật LR.

Mốc LR được hiểu là **LR đã có S6**, vì lộ trình nâng độ hiếm bắt đầu sau SSR S6. Không mở S7, không có LR(+n). LR nhân vật khác di vật LR trong run.

## 2. Skill — Astral Armament / Vũ Trang Tinh Giới

**Giá cơ bản: 2 MP. Tốn một hành động. Không gây sát thương. Boss vẫn phản công bình thường.**

Khi dùng Skill:

- Nhận **Cường hóa trong 3 hành động chiến đấu tiếp theo, giữ xuyên phòng**. Hành động vừa niệm Skill không trừ ngay một hành động của buff mới.
- Đánh thường trong thời gian này chuyển thành **một đòn phép**, dùng khoảng Phép hiện tại × **2,2** ở S0. Không cộng thêm sát thương vật lý lên trên.
- Đòn phép luôn trúng theo luật phép hiện hành, không Crit, chịu RES, lá chắn và điều kiện gây sát thương của boss. Không xuyên cơ chế miễn sát thương.
- Đòn cường hóa **không hồi MP**. Chặn hồi MP mặc định, hút MP và các nguồn hoàn MP phát sinh từ chính action đánh này; không biến hit phụ S6 thành cách hoàn MP.
- Phòng thủ, uống bình và hành động boss tốn lượt đều tiêu một hành động cường hóa, dù không đánh.
- Menu đổi mục tiêu không tốn lượt, xem Chỉ số/Rift/Chi tiết và bấm nút lỗi không tiêu thời gian.
- Đòn cuối vẫn được cường hóa khi bắt đầu action còn một hành động; timer giảm sau khi xử lý action, không tắt trước khi tính sát thương.
- Dùng Skill lại trả chi phí bình thường, đặt thời gian về 3, đặt lại số đòn của chuỗi và xóa Hồi lưu chưa dùng. Không cộng dồn thời lượng hoặc hệ số.

Khi hết buff, đánh thường trở về vật lý. **Đề xuất đánh thường không cường hóa hồi cố định 1 MP/action**, vẫn chịu hiệu ứng chặn/giảm hồi MP. Không dùng quy tắc hồi 70% Max MP của Sorceress/Necromancer để một đòn yếu có thể bỏ qua toàn bộ vòng quản lý tài nguyên.

Khóa hồi MP chỉ áp cho nguồn phát sinh trong action đánh cường hóa. Hồi MP từ event, đầu combat mới hoặc Phòng thủ ở một action khác vẫn hoạt động; mất MP do boss/Rift không bị chặn.

### Ví dụ thời gian

| Hành động     | Kết quả                               | Còn cường hóa |
| ------------- | ------------------------------------- | ------------: |
| Dùng Skill    | Không gây DMG; trả 2 MP, nhận buff    |             3 |
| Tấn công      | Phép cường hóa; không hồi MP          |             2 |
| Uống bình     | Hồi theo bình, mất một hành động buff |             1 |
| Tấn công      | Phép cường hóa; không hồi MP          |             0 |
| Tấn công tiếp | Vật lý, hồi cơ bản 1 MP               |             0 |

Đây là **3 hành động**, không phải ba lần đánh được bảo lưu đến khi dùng hết. Sau Skill không cần đủ MP để dùng các đòn cường hóa: mỗi đòn không có MP cost riêng.

## 3. Innate — Runic Reflux / Hồi Lưu Cổ Ngữ

Có từ tầng 1:

1. **Phòng thủ hồi tổng 2 MP**, gồm 1 MP cơ bản +1 MP thêm. Giữ hiệu quả giảm sát thương và luật MP hiện hành.
2. Hai đòn cường hóa hợp lệ trong cùng một lần dùng Skill tạo **một Ấn Hồi lưu**.
3. Phòng thủ khi có ấn: tiêu ấn, **hồi 5% Max HP trước phản công**. Chịu giảm hồi, giới hạn HP bị khóa và không tạo hồi dư thành lá chắn.
4. Mỗi lần cường hóa chỉ tạo một ấn; tối đa giữ một. Đã dùng rồi không tạo lại trong cùng chuỗi.

Ấn đã tạo vẫn dùng được sau khi buff hết thời gian, giữ qua phòng và chỉ mất khi dùng Skill mới hoặc đã tiêu ấn. Phòng thủ không có ấn vẫn hồi 2 MP, không hồi HP.

Đòn hợp lệ là hit chính cường hóa thực sự gây sát thương lên HP, lá chắn hoặc mục tiêu phụ được chọn hợp lệ. Đánh vào miễn sát thương không tạo tiến trình; phản đòn, phản phệ, hit phụ và Skill chuẩn bị không tính. Chuyển phase không nạp lại ấn hoặc hạn mức dùng.

## 4. Awakening — Trinity Mandate / Mệnh Lệnh Tam Trọng

Mở sau khi sống sót và hạ boss tầng 100, cùng mốc thức tỉnh hiện hành.

**Đòn cường hóa hợp lệ thứ ba trong cùng một lần dùng Skill:**

- Sát thương chính **tăng thêm 35%**, nhân trước RES theo cùng công thức phép.
- Sau khi gây sát thương, tạo lá chắn bằng **10% Max HP** trước phản công nếu combat còn tiếp diễn.
- Lá chắn riêng này không cộng dồn: làm mới tối đa 10% Max HP, không cộng thêm mỗi lần kích hoạt. Giữ qua phase, hết khi combat kết thúc; không chặn HP cost, DMG chuẩn hoặc phản phệ.

Vì chỉ có ba hành động sau Skill, đạt đòn thứ ba thường đòi hỏi đánh liên tiếp cả ba lần. Uống bình, Phòng thủ hoặc xử lý cơ chế boss tốn lượt có thể đổi lại việc mất phần thưởng này.

Một hit không gây sát thương vẫn tiêu thời gian nhưng không tăng số đòn hợp lệ. Không tự kích hoạt thức tỉnh bằng Skill spam, đánh vào boss miễn sát thương hoặc selector miễn lượt.

**Nhịp chuẩn:** Skill → đánh → đánh → đánh thứ ba → Phòng thủ. Phòng thủ vừa hồi lại 2 MP cho lần Skill kế, vừa dùng Ấn Hồi lưu để hồi HP. Khi nguy hiểm có thể Phòng thủ sớm sau hai đòn, nhận hồi HP nhưng bỏ bùng nổ thứ ba.

## 5. Tinh hồn S1–S6

Các bậc cộng dồn. Cường hóa luôn kéo dài ba hành động; không bậc nào cho hồi MP từ đòn cường hóa hoặc biến Skill thành đòn gây sát thương.

| Bậc | Tên đề xuất          | Hiệu ứng                                                                                                                                                                                     |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Khắc ấn tinh giới    | Hệ số đòn cường hóa từ **2,2 → 2,5**.                                                                                                                                                        |
| S2  | Vòng hộ thân         | Lần Skill đầu tiên trong mỗi combat tạo lá chắn **6% Max HP** trước phản công. Một lần/combat, không nạp lại qua phase hoặc khi niệm Skill tiếp.                                             |
| S3  | Tam trọng cộng minh  | Sau thức tỉnh: bonus đòn thứ ba từ **+35% → +60%**, lá chắn của đòn đó từ **10% → 12% Max HP**. Thay giá trị cũ, không cộng thêm lần nữa.                                                    |
| S4  | Mạch nguồn không đứt | Chỉ cần **một** đòn cường hóa hợp lệ để tạo Ấn Hồi lưu thay vì hai. Vẫn một ấn/mỗi lần cường hóa; tăng khả năng Phòng thủ sớm, không tự có đòn thứ ba.                                       |
| S5  | Cổ ngữ hoàn thiện    | Hệ số đòn cường hóa từ **2,5 → 2,8**; Hồi lưu từ **5% → 7% Max HP**.                                                                                                                         |
| S6  | Phán quyết tam trọng | Sau thức tỉnh: đòn thứ ba hợp lệ phát thêm **một Xung Tinh Giới = 40% sức sát thương hit chính sau kháng**. Không Crit, không hồi MP, không tạo ấn/tiến trình, không kích hoạt thêm hit phụ. |

### Quy tắc Xung Tinh Giới

- Chỉ xuất hiện khi đạt đúng đòn thứ ba hợp lệ; không kích hoạt theo số hit phụ, số mục tiêu hoặc số phase.
- Dùng sức sát thương hit chính sau RES, bonus thứ ba và các hệ số đã áp, **trước khi giới hạn bởi HP còn lại**. Không lấy lượng HP thực trừ để làm đòn phụ yếu đi khi gần kết liễu.
- Không nhân RES, bonus boss, Gilded Soul hoặc hệ số độ hiếm lần nữa. Lá chắn, cửa sổ gây sát thương, mục tiêu hợp lệ và ngân sách damage của boss vẫn được thực thi.
- Không tràn sang mục tiêu khác/HP bar hoặc phase kế nếu hit chính đã hạ mục tiêu hiện tại. Combat đã kết thúc thì bỏ hit phụ.

Với cùng khoảng Phép, chưa tính giảm trừ và làm tròn, ba đòn sau thức tỉnh có tổng hệ số:

- S0: 2,2 × (1 + 1 + 1,35) = **7,37 lần Phép**.
- S6: 2,8 × (1 + 1 + 1,6 × 1,4) = **11,872 lần Phép**, tăng khoảng **61,1%** so với S0 ở chuỗi trọn vẹn.

Đây là so sánh damage một chuỗi cố định, không phải tăng 61,1 điểm % tỷ lệ thắng. Trước thức tỉnh, S3 và phần bùng nổ S6 chưa hoạt động; không suy ra tốc độ vượt tầng 1–100 từ chuỗi sau thức tỉnh.

## 6. Chỉ số khởi đầu SSR S0

Không trang bị, không loadout, không Rift hoặc buff sự kiện. Dùng cùng cấu trúc công thức V3.1, với profile riêng cho Venance.

| Thuộc tính nền              |   Đề xuất |
| --------------------------- | --------: |
| STR                         |        10 |
| DEX                         |        14 |
| VIT                         |        24 |
| ENE                         |        40 |
| HP cơ sở                    |        40 |
| MP cơ sở                    |         3 |
| RES cơ sở                   |       10% |
| CRIT cơ sở                  |        4% |
| Tỷ trọng vật lý STR / DEX   | 70% / 30% |
| Hệ số phần sức mạnh ban đầu |       1,8 |

| Chỉ số sau quy đổi ở tầng 1             |         Giá trị |
| --------------------------------------- | --------------: |
| Max HP                                  |         **112** |
| Max MP                                  |           **4** |
| Vật lý chưa cường hóa                   |        **8–13** |
| Phép                                    |       **52–57** |
| Đánh cường hóa S0, trước RES/hệ số boss | **114–125 DMG** |
| DEF                                     |           **6** |
| RES                                     |         **18%** |
| ACC chỉ số                              |          **76** |
| EVA chỉ số                              |           **7** |
| CRIT đòn vật lý                         |        **5,4%** |

Đòn cường hóa không Crit; 5,4% chỉ áp cho vật lý khi chưa cường hóa. 76 là chỉ số ACC, không phải 76% đánh trúng. ENE 40 là cao hơn SR, nhưng DEF 6/EVA 7 vẫn thấp; lượt Skill vẫn có rủi ro.

Các số quy đổi đã kiểm tra bằng phép tính theo công thức hiện có, chưa chạy nhân vật qua engine vì chưa triển khai profile. Ví dụ: HP = 40 +24×3 =112; MP = floor(3+40/25)=4; Phép cơ sở = floor(floor(40×0,75)×1,8)=54, nên khoảng 52–57.

### Mastery — Astral Conduction / Dẫn Truyền Tinh Giới

Đề xuất quy đổi phần chỉ số tăng thêm:

| Mỗi +100 điểm                   | Hiệu quả                                                |
| ------------------------------- | ------------------------------------------------------- |
| ENE phân bổ từ checkpoint/event | +105 Phép, +25 điểm RES, +5 Max MP                      |
| ENE từ trang bị                 | +75 Phép, +25 điểm RES, +5 Max MP                       |
| VIT                             | +330 Max HP, +18 DEF                                    |
| STR                             | +15 DEF; đóng góp vật lý theo công thức 70/30 hiện hành |
| DEX                             | +120 ACC, +20 EVA, +3 điểm % CRIT cho vật lý            |

Hệ số Phép từ ENE phân bổ = 0,75 ×1,4; phần ENE trang bị giữ hệ số 0,75 theo cách V3 tách nguồn. Hệ số 1,8 chỉ nhân phần sức mạnh ban đầu, không nhân lại toàn bộ chỉ số/trang bị mỗi tầng.

Giữ trần nền CRIT 35%, né vật lý 30%, RES 70%, Max MP 10. Trang bị vẫn nâng trần theo luật hiện hành; không đề xuất né tự nhiên riêng hay phép Crit cho Venance.

### Tham số boss để hiệu chỉnh

Đề xuất hệ số Attack gây sát thương lên boss của riêng Venance bắt đầu ở **×2,0**, sau đó hiệu chỉnh bằng simulate. Cả vật lý thường và phép cường hóa dùng cùng hệ số; Skill chuẩn bị bằng 0 damage nên vẫn bằng 0.

Đây là tham số mới để thử nghiệm, không phải hệ số đã đo đạt 40%. Không sao chép hệ số của Sorceress hoặc bonus boss S6 của các SR. Đề xuất bonus boss riêng S6 của Venance ban đầu **×1,0**: sức mạnh S6 đến từ bộ tinh hồn, tránh nhân thêm một hệ số SR không liên quan.

## 7. UR và LR

Điều kiện đề xuất: SSR đạt S6 mới nâng lên UR, rồi LR. Không đặt lại hoặc nhân lặp tinh hồn. Mỗi bước cần 2 cọc ×50 thẻ nhân vật SSR cùng class. Hai cọc có thể từ cùng nhân vật (100 thẻ), hoặc hai nhân vật (50 thẻ mỗi người); không gom thẻ lẻ. Giữ S6, hiệu lực từ run mới.

| Mốc      | Max HP | Damage đòn cường hóa | Lá chắn Mệnh Lệnh Tam Trọng |
| -------- | -----: | -------------------: | --------------------------: |
| SSR · S6 |   ×1,0 |                 ×1,0 |                  12% Max HP |
| UR · S6  |   ×1,1 |                ×1,08 |                  12% Max HP |
| LR · S6  |   ×1,2 |                ×1,15 |                  15% Max HP |

Các hệ số là **mức tuyệt đối theo SSR**, không nhân UR ×LR. Nhân Max HP sau khi tổng hợp các nguồn chỉ số, một lần; các hiệu ứng tính theo Max HP dùng Max HP đã nâng, không được nhân độ hiếm thêm lần nữa.

Hệ số damage độ hiếm áp một lần trên hit chính. Xung S6 lấy chính hit đã tăng nên không nhân thêm ×1,15 lần thứ hai. Không đổi ba hành động, chi phí cơ bản 2 MP hoặc luật 0 MP hồi từ đánh cường hóa.

LR không thêm hồi sinh/miễn damage và không vượt cơ chế boss. Sau LR vẫn nhận 50 thẻ Venance khi trùng; dùng làm cọc nâng độ hiếm cho nhân vật SSR cùng class, không nâng tinh hồn nhân vật khác. Giữ nguyên trần S6. Không đổi thành thẻ SR, không nâng Venance lên LR+.

## 8. Cách hiển thị để người chơi hiểu

Skill hiện mô tả cường hóa, không hiển thị damage giả hoặc log đánh trượt 0 DMG khi đang niệm phép.

Ví dụ sau thức tỉnh, đang giữ buff:

> 🔮 Tấn công cường hóa: 114–125 DMG · không hồi MP.
> ✨ Cường hóa còn 1 hành động · 2/3 đòn hợp lệ · Hồi lưu sẵn sàng.
> 🛡️ Phòng thủ: hồi 2 MP; dùng Ấn Hồi lưu để hồi 5% Max HP.

Dòng damage thực tế dùng preview theo mục tiêu, kháng và trạng thái hiện tại; 114–125 ở ví dụ chỉ là khoảng minh họa với chỉ số tầng 1, không khẳng định đó là damage tầng 100. Chi tiết giải thích rằng Phòng thủ lúc này đổi lại việc mất bùng nổ thứ ba.

Tên/ID đề xuất: characterId và profileKey riêng **venance**, classKey **mage**. Emoji sau này có thể dùng class_venance, skill_venance_astral_armament và soul_venance_1 đến soul_venance_6.

## 9. Điểm bắt buộc khi triển khai

- Giữ action của đòn cường hóa là Attack; gắn damageType = magic. Các buff theo Attack và theo phép áp đúng một lần. Không kích hoạt buff đòi Skill gây damage từ việc niệm Skill bằng 0.
- Hiện có các nhánh hardcode phép là Skill của Sorceress/Necromancer, như metadata gửi vào Affinity và tính MP đánh thường. Cần chuyển sang đọc loại hit/cơ chế nhân vật phù hợp; không gắn Venance vào profile Sorceress để mượn nội tại.
- Vẫn kiểm tra chi phí MP/HP và điều kiện được phép dùng Skill; Skill không damage không được bỏ qua giá hoặc giới hạn boss. Phòng thủ +2 vẫn chịu giảm/chặn hồi MP, Max MP hiệu lực và luật phản công hiện hành.
- Skill miễn MP từ Astral Singularity vẫn tốn action và chỉ làm mới ba hành động; không gây damage, không nạp lại lá chắn S2 hoặc phát sinh tiến trình MP đã trả. Venance không tự có Arcane Echo của Sorceress.
- Giữ timer/tiến trình qua phase, giảm đúng một lần cho mỗi action hợp lệ; không giảm thêm vì counter/hit phụ/chuyển phase không tốn lượt. Cường hóa còn lại, tiến trình đòn hợp lệ và Ấn Hồi lưu giữ xuyên phòng; đi phòng/sự kiện/checkpoint không tự trừ hành động cường hóa. Barrier hết khi combat kết thúc, hạn mức S2 nạp lại ở combat mới.
- Chết và hồi sinh trong cùng combat không tự nạp timer, lá chắn S2, ấn đã tiêu hoặc đòn thứ ba. Phải lưu tiến trình trong snapshot, không dựng lại từ HP/tầng.
- Snapshot cấp S, độ hiếm và thông số lúc bắt đầu run. Nâng tài khoản giữa run không cập nhật sức mạnh run cũ. Không thay cơ chế Tower hoặc 7 SR.
- Không tự cho Venance vào banner tân thủ. Banner SSR, xác suất và cửa hàng 200 Spark phát hành riêng sau khi nhân vật được triển khai và kiểm chứng.

## 10. Kế hoạch xác minh mục tiêu — chưa chạy simulate

1. Test timer với Skill → Attack/Potion/Defend và hành động boss; giữ state qua phase; selector miễn lượt; lượt bị từ chối; chết/hồi sinh; retry và resume.
2. Test skill 0 damage không tạo on-hit/MP leech; cường hóa dùng RES và không Crit; chặn mọi hồi MP từ action đánh cường hóa; Phòng thủ đúng tổng 2 MP và chịu luật giảm/chặn hồi.
3. Test Hồi lưu tối đa một lần/mỗi buff, reset khi recast, không reset phase; S2 một lần/combat; hit hợp lệ khi đánh lá chắn/module; Xung S6 không đánh tràn phase hoặc tạo tài nguyên mới.
4. Viết policy riêng cho Venance. Không dùng policy Sorceress “có MP thì Skill”, vì nó sẽ liên tục niệm phép không gây damage. Policy phải biết buff còn bao nhiêu action, nguy cơ tử trận, ấn hồi phục và cơ chế boss đang bắt xử lý.
5. Bắt đầu bằng một lô chẩn đoán 100 run/mốc, sau đó kiểm chứng tối thiểu 2.000 run/mốc trên seed độc lập với tập hiệu chỉnh. Ba mốc chính: SSR S0, SSR S6, LR S6; đo thêm UR S6 để kiểm tra đường tăng sức mạnh.
6. Cùng cược, roster, checkpoint, item policy, không cấp diamond bên ngoài, không chủ động farm LR run, không nhặt mộ từ run trước. Mỗi mốc phải hạ boss 999 và còn sống mới tính thắng; timeout là không hoàn thành, không được bỏ khỏi mẫu.
7. Báo cả tỷ lệ mẫu, Wilson 95%, số timeout, tầng tử trận, boss gây tử trận, thời lượng và số lần mất đòn thứ ba vì hồi phục/xử lý boss. Mục tiêu dung sai ban đầu đề xuất 40±3 / 65±3 / 75±3 điểm %; không chọn các shard đẹp để ghép tỷ lệ.
8. Hiệu chỉnh S0 bằng hệ số cường hóa, hệ số boss và độ chống chịu; sau đó S6 bằng Xung/bonus thứ ba; cuối cùng độ hiếm bằng multiplier HP/damage. Nếu vượt 75% ở LR, giảm số trước khi thêm cơ chế boss bất lợi riêng để ép tỷ lệ.

Tỷ lệ chiến thắng không thể xác nhận chỉ từ bảng chỉ số hoặc tổng hệ số damage. Bản này chưa công bố Venance đã đạt bất kỳ mốc thắng nào.

## 11. Ghi chú triển khai · 15/10/2026

- Bộ kỹ năng và trạng thái combat riêng: `src/hardcore/characters/venance.js`. Snapshot tham số/cấp tinh hồn/độ hiếm lúc tạo run; không cập nhật theo tài khoản giữa run.
- Đã nối vào `/sinhton nhanvat`, màn hình chọn run, preview loadout, Battle UI và các tab riêng. Chỉ tài khoản sở hữu Venance mới chọn được. Bảy SR vẫn được cấp S0 như trước.
- Icon tạm **🔮** cho nhân vật/kỹ năng, **✨** cho tinh hồn. Tên portal: `class_venance`, `skill_venance_astral_armament`, `soul_venance_1` … `soul_venance_6`. Các điểm hiển thị đọc registry lúc render; icon mới thay placeholder khi bot nạp registry.
- Forge ưu tiên ENE/RES. Venance dùng pool affinity pháp sư hiện tại; affinity riêng tăng damage phép theo ENE (trần 15%), không hoàn MP. Chỉ số/nội tại của bảy SR giữ nguyên.
- Class Shrine cho một lần Astral Armament miễn MP; Astral Singularity cũng miễn MP của Skill, vẫn tốn một hành động, trả HP nếu có và không gây damage.
- Đã có hệ số SSR/UR/LR cho snapshot Venance S6. Đã có thao tác nâng độ hiếm trong /sinhton nhanvat bằng 2 cọc ×50 thẻ SSR cùng class.
- Banner tân thủ không có Venance. Không tự cấp SSR cho tài khoản; Venance có banner trả gem và đổi 200 Spark tại /sinhton cuahang.
- Kiểm thử xác định: `npm run test:hardcore-venance`; gồm timer, MP, S1–S6, mục tiêu phụ, selector, chuyển phase, hồi sinh, stale click, rollback, UI và quyền sở hữu. Không dùng kết quả test cơ chế để khẳng định win rate.
- Policy simulate riêng cho Venance và các lô đo mục tiêu ở mục 10 còn thực hiện khi có yêu cầu simulate; chưa dùng policy Sorceress để đánh giá nhân vật này.

### Cập nhật 15/10/2026 · Cường hóa xuyên phòng

Astral Armament nay lưu ở `state.venanceState`: giữ số hành động còn lại, số đòn hợp lệ, Ấn Hồi lưu và trạng thái đã dùng ấn qua các phòng. Chỉ hành động chiến đấu tốn lượt mới giảm thời gian; sự kiện, checkpoint và thao tác xem/đổi mục tiêu không trừ. Không nạp lại thời lượng khi đổi phòng. Barrier/S2 vẫn theo combat. Run đang lưu dùng frame cũ được chuyển sang trạng thái mới khi khôi phục; không tự cấp lại cường hóa đã mất từ trước cập nhật.
