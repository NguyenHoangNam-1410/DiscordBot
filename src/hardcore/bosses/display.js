"use strict";
const boss = require("./mechanics");
const { E } = require("../shared/icons");
const names = ["", "Abyssal Spires", "Flesh Feast", "Dimensional Collapse"];
const RULES = {
  butcher:
    "Frenzy: phản công trúng +1 stack, tối đa 5; mỗi stack +8% DMG. Phòng thủ xóa 1 stack, không thêm stack trong lượt Phòng thủ.",
  machine:
    "HP ×2 so với boss cùng nhóm. Chu kỳ 3 vòng: mỗi hit Tấn công/Skill gây DMG tạo 1 Overheat (+8% DMG boss). Ở vòng thứ ba, đủ 3 hit ngắt Overcharge; thiếu hit thì boss bắn tia vật lý ×2,5. Phòng thủ vẫn giảm tia theo luật hiện tại. Hết chu kỳ reset Overheat.",
  assur:
    "Sau 2 phản công thường: cảnh báo Flamefront. Phòng thủ ở lượt cảnh báo chặn Flamefront, đòn gây DMG tiếp theo +30%. Nếu không xử lý: Flamefront phép ×2, giảm bởi RES.",
  control:
    "Plasma Shield giữ ít nhất 1 HP cho đến khi Feedback được xử lý. Ghi DMG sau giảm trừ của 2 hành động Tấn công/Skill (kể cả phần hấp thụ bởi Shield). Vòng tiếp theo phản 25% dưới dạng phép, chịu RES; Phòng thủ chặn toàn bộ sát thương Feedback. Xử lý xong reset bộ nhớ. Shield bật lại khi đủ 2 hành động tiếp theo.",
  necrobot:
    "Mỗi vòng đổi Plating ↔ Energy Barrier. Plating: DEF ×1,4, RES −15; DMG vật lý của bạn ×0,7. Barrier: DEF ×0,7, RES +20 (tối đa 75%); DMG phép của bạn ×0,7. Không miễn nhiễm; loại phản công đổi cố định vật lý/phép.",
  quov: "Mythal: mỗi phản công trúng giảm RES của bạn 5 điểm %, tối đa 20. Phòng thủ xóa 5 điểm và ngăn stack mới trong lượt đó. Chỉ tồn tại trong trận này.",
  lucion:
    "Scales giảm 99% DMG nhận vào. Sau mỗi 3 hành động: lượt kế tiếp mở Malic. Skill đổi thành Brain Control, 0 MP, gây DMG chuẩn 20% Max HP boss và tắt Scales cho 2 hành động gây DMG tiếp theo. Bỏ lỡ: boss hồi 50% Max HP, phản công phép ×1,5. Mỗi phản công trúng còn hồi 10% Max HP; hụt hoặc bị chặn không hồi.",
  bul_kathos:
    "Hai Tấn công hoặc hai Skill liên tiếp: phản công ×1,5 và chắc chắn CRIT. Đổi giữa Tấn công/Skill/Phòng thủ reset chuỗi. Bình không reset. Phòng thủ vẫn miễn CRIT theo luật chung.",
  giyua:
    "Mỗi 2 vòng sinh 1 Spirit Nest, tối đa 3; mỗi tổ +24% DMG boss. Tấn công thường phá 1 tổ, không gây DMG lên boss; Skill đánh boss và giữ nguyên tổ.",
  riftwalker:
    "Chu kỳ Hiện diện → Hiện diện → Biến mất. Biến mất: Tấn công/Skill hụt; Phòng thủ hồi tổng 2 MP; bình an toàn, boss không phản công. Boss trở lại: đòn gây DMG đầu tiên +25%.",
  gharbad:
    "False Surrender có 25% cơ hội mỗi lượt, khóa khi tạo lượt. Lúc đầu hàng: Tấn công/Skill nhận phản công ×1,8; Phòng thủ hồi tổng 2 MP, đòn tiếp theo +30%; bình an toàn, không nhận buff.",
  phoboss:
    "Dream Eater: phản công trúng hút 1 MP còn lại, tạo 1 Nightmare (tối đa 5). Mỗi stack +15% DMG phép boss. Skill gây DMG xóa Nightmare; 0 MP không tạo stack mới.",
  anomaly:
    "Chu kỳ Matter → Energy → Void. Matter: DEF ×1,4, vật lý. Energy: RES +20 (tối đa 75%), phép. Void: DEF ×0,7, RES −20, nhận thêm 50% DMG, phản công phép.",
  kabraxis:
    "Phase 1 (>2/3 HP): cơ chế ấn. Phase 2 (>1/3 HP): +15% DMG; mỗi 3 vòng thêm Corrupted Seal, tối đa 3. Phase 3: +20% DMG, DEF −15%, RES −15, không hồi máu. War: sau Skill có phản công thêm 60%, không CRIT; Phase 2 dùng 2 Skill liên tiếp tăng lên 100%, mỗi Corrupted Seal thêm 10 điểm %. Protection: +25% Max HP; vật lý → phép → phép, đòn phép thứ hai giảm RES 5 + số Seal trong 2 vòng, Phòng thủ ngăn debuff. Arcane: phản công trúng hút 1 MP (Phase 2 hút thêm số Seal); 0 MP nhận thêm 30% DMG. Skill khi đầy MP ở Phase 2 giảm RES boss 10 trong lượt. Thưởng khóa: SSR 66,6% / UR có nguyền 33,4%, bonus 66,6% cược và thức tỉnh ấn; không thêm rương/drop LUCK. Không rút thưởng trong trận.",
  zakarum:
    "Mỗi 3 vòng nhận Divine Grace. Hit đầu ×0,25 và phá khiên; các hit sau bình thường, Barrage tính riêng từng hit. Sau khi vỡ: DEF boss −15%, RES −15 cho các hit sau và lượt kế tiếp.",
  justicar:
    "Mỗi 2 vòng đổi Judgment of Steel (Tấn công thường ×0,6) ↔ Judgment of Power (Skill ×0,6). Xét hành động, không xét loại damage.",
  uldyssian:
    "Lặp Tấn công: boss EVA +30 trong lượt. Lặp Skill: boss RES +20 trong lượt và bạn mất thêm tối đa 1 MP sau khi dùng. Lặp Phòng thủ: phản công chuyển sang phép. Đổi hành động reset; bình không reset chuỗi.",
  lazarus:
    "Black Hand Totem bất tử. Cuối mỗi vòng boss hồi 8% Max HP và bạn mất tối đa 1 MP. Tấn công/Skill chỉ đánh boss. Soul Drain không có tác dụng trong trận này.",
  xazax:
    "Mỗi 2 vòng thêm 1 Hell Portal, tối đa 5; mỗi Portal +6% DMG boss. Skill gây DMG đóng 1 Portal. Đủ 5: phản công kế gây DMG chuẩn 50% Max HP của bạn, không CRIT, không giảm bởi DEF/RES; UI cảnh báo trước, Skill có thể đóng Portal để ngăn.",
  samael:
    "Mỗi 4 vòng: Pentagram vật lý ×3, cảnh báo ở lượt trước. Phòng thủ giảm riêng Pentagram 70%, nhận 1 Dread (tối đa 3); mỗi Dread −1 Max MP trong trận, không giảm dưới 2. CRIT gây DMG hoặc Skill gây DMG xóa 1 Dread.",
  deimoss:
    "Ba thanh HP độc lập 30% / 30% / 40% tổng HP. Damage dư không xuyên phase; chuyển phase không phản công và không trao thưởng. Phase 1: nhận DMG ×0,75, đổi phản công vật lý/phép mỗi 3 vòng. Phase 2: hồi 15% DMG thực tế gây lên bạn, Phòng thủ chặn hồi; mỗi bình +1 Flesh (tối đa 3), mỗi Flesh +10% DMG. Phase 3: không hồi/không giảm 25%, +30% DMG và +10 điểm % CRIT. Chỉ Phase 3 chết mới hoàn thành tầng.",
};
function status(s) {
  const e = s.encounter,
    b = boss.bstate(s);
  if (!b) return "";
  const round = b.round;
  const text = {
    butcher: "Frenzy " + b.frenzy + "/5 · Phòng thủ giảm stack.",
    machine:
      "Overcharge " +
      ((round % 3) + 1) +
      "/3 · Overheat " +
      b.overheat +
      " · còn " +
      Math.max(0, 3 - b.overheat) +
      " hit để ngắt." +
      (round % 3 === 2 ? " ⚠️ Tia vật lý ×2,5 lượt này." : ""),
    assur:
      b.normals >= 2
        ? "⚠️ Flamefront ×2 phép — Phòng thủ để phá bảo hộ, nhận buff +30%."
        : "Flamefront: " + b.normals + "/2 phản công thường.",
    control:
      "Plasma " +
      b.memoryActions +
      "/2 · ghi " +
      Math.floor(b.damageMemory) +
      " DMG" +
      (b.feedback ? " · ⚠️ Feedback lượt này: Phòng thủ để chặn sát thương phản lại." : "") +
      (!b.feedbackResolved ? " · 🛡️ Plasma Shield: chưa thể hạ boss." : ""),
    necrobot:
      round % 2 === 0
        ? "🗡️ Plating · giảm DMG vật lý 30%; kế: Energy Barrier."
        : "🔮 Energy Barrier · giảm DMG phép 30%; kế: Plating.",
    quov: "Mythal −" + b.mythal + " điểm % RES của bạn · Phòng thủ gỡ 5.",
    lucion: b.malic
      ? "🧠 MALIC — dùng Brain Control (0 MP); bỏ lỡ: hồi 50% HP, phản công ×1,5."
      : b.vulnerable > 0
        ? "Scales đã tắt: còn " + b.vulnerable + " đòn gây DMG."
        : "🛡️ Scales: giảm 99% DMG · Malic sau " +
          (3 - (round % 3)) +
          " hành động.",
    bul_kathos:
      "Chuỗi " +
      b.chain +
      " · gần nhất " +
      (b.lastAction || "chưa có") +
      " · ⚠️ lặp Tấn công/Skill: phản công ×1,5, chắc chắn CRIT.",
    giyua:
      "Spirit Nest " +
      b.nests +
      "/3 · mỗi tổ +24% DMG boss; đánh thường phá 1 tổ.",
    riftwalker: boss.vanished(s)
      ? "🌀 Biến mất — đòn của bạn hụt; Phòng thủ +2 MP hoặc uống bình an toàn."
      : "Hiện diện " +
        ((round % 3) + 1) +
        "/2 · kế " +
        (round % 3 === 1 ? "Biến mất" : "Hiện diện") +
        (b.returnBonus ? " · đòn gây DMG kế +25%." : ""),
    gharbad: b.surrender
      ? "⚠️ “Ta đầu hàng…” — Đánh: phản công ×1,8; Phòng thủ +2 MP và buff +30%; bình an toàn."
      : "Gharbad đang chiến đấu." +
        (b.returnBonus ? " Đòn gây DMG kế +30%." : ""),
    phoboss:
      "Nightmare " + b.nightmare + "/5 · Skill gây DMG xóa; quái trúng hút MP.",
    anomaly: [
      "🗡️ Matter → Energy",
      "🔮 Energy → Void",
      "🌀 Void: nhận +50% DMG → Matter",
    ][round % 3],
    kabraxis:
      "🔺 Ấn " +
      b.seal +
      " · Phase " +
      b.phase +
      "/3 · Corrupted Seal " +
      b.sealPower +
      "/3" +
      (b.seal === "war"
        ? " · Skill gây thêm Blood Revenge."
        : b.seal === "arcane"
          ? " · quái trúng hút MP; cạn MP tăng DMG boss."
          : " · vật lý → phép → phép; Phòng thủ ngăn giảm RES."),
    zakarum: b.grace
      ? "🛡️ Divine Grace: hit đầu ×0,25; nhiều hit phá khiên."
      : b.graceWeak
        ? "Khiên đã vỡ: DEF −15%, RES −15."
        : "Divine Grace sau " + (3 - (round % 3)) + " vòng.",
    justicar:
      Math.floor(round / 2) % 2 === 0
        ? "Judgment of Steel: đánh thường −40% DMG; dùng Skill."
        : "Judgment of Power: Skill −40% DMG; đánh thường.",
    uldyssian:
      "Memory: " +
      (b.lastAction || "chưa có") +
      " · Đổi hành động để tránh phản ứng; bình không reset.",
    lazarus:
      "🗿 Totem bất tử: boss hồi 8% Max HP và hút 1 MP mỗi vòng; không có Soul Drain.",
    xazax:
      "Hell Portal " +
      b.portals +
      "/5 · Skill gây DMG đóng 1." +
      (b.portals >= 5
        ? " ⚠️ Phản công kế: 50% Max HP của bạn, DMG chuẩn."
        : ""),
    samael:
      "Dread " +
      b.dread +
      "/3 · Max MP " +
      boss.effectiveMaxMana(s) +
      (round % 4 === 3
        ? " · ⚠️ Pentagram lượt này: Phòng thủ giảm 70%."
        : " · Pentagram sau " + (4 - (round % 4)) + " vòng."),
    deimoss:
      b.phase === 1
        ? "Abyssal Spires: giảm 25% DMG nhận, đổi loại phản công mỗi 3 vòng."
        : b.phase === 2
          ? "Flesh Feast " +
            b.flesh +
            "/3: hồi 15% DMG gây ra; Phòng thủ ngăn hồi."
          : "Dimensional Collapse: +30% DMG, +10 điểm % CRIT; không hồi máu.",
  }[b.id];
  return text || "";
}
function bars(s) {
  const e = s.encounter,
    b = boss.bstate(s);
  if (b?.id !== "deimoss") return "";
  const bar = (ratio) =>
    "█".repeat(Math.min(10, Math.max(0, Math.ceil(ratio * 10)))) +
    "░".repeat(10 - Math.min(10, Math.max(0, Math.ceil(ratio * 10))));
  return (
    "**DEIMOSS — PHASE " +
    b.phase +
    "/3: " +
    names[b.phase].toUpperCase() +
    "**\n" +
    b.bars
      .map((hp, i) =>
        i + 1 < b.phase
          ? "✅ Phase " + (i + 1) + " ██████████ · Đã phá"
          : i + 1 > b.phase
            ? "🔒 Phase " + (i + 1) + " ██████████ · Chưa mở"
            : E.hp +
              " Phase " +
              (i + 1) +
              " " +
              bar(e.hp / hp) +
              " · **" +
              e.hp.toLocaleString("vi-VN") +
              "/" +
              hp.toLocaleString("vi-VN") +
              " HP** (" +
              Math.ceil((e.hp / hp) * 100) +
              "%)",
      )
      .join("\n")
  );
}
function details(s) {
  const b = boss.bstate(s);
  return b ? RULES[b.id] + "\n\n**Hiện tại:** " + status(s) : "";
}
function special(s) {
  if (s.encounter.type === "prophecy")
    return "🔺 **THREEFOLD PROPHECY · TẦNG 333**\nChọn một ấn: **War** +12 stat chính, +8% DMG boss; **Protection** +12 VIT, +5 RES; **Arcane** +10 ENE, +1 Max MP.\nẤn bạn chọn quyết định cơ chế Kabraxis ở tầng 666. Xem **Rift** để biết hiệu lực của ký ức này.";
  if (s.encounter.type === "boss_gate")
    return (
      "🔺 **KABRAXIS · TẦNG 666**\nBạn có thể rút thưởng ngay tại cửa. Bước vào sẽ khóa rút thưởng; phải thắng hoặc tử trận.\nXem **Chi tiết** để biết cơ chế của ấn " +
      s.encounter.enemy.boss.seal +
      "."
    );
  return "";
}
module.exports = { RULES, status, bars, details, special };
