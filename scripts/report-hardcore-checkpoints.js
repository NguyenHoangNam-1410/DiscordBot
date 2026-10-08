"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.join(__dirname, "..");
const prefix = "docs/releases/hardcore-2026-10-07-checkpoints";
const read = (suffix) =>
  JSON.parse(
    fs.readFileSync(path.join(root, prefix + suffix + ".json"), "utf8"),
  );
const manifest = read("-manifest");
for (const [file, hash] of Object.entries(manifest.sourceSha256)) {
  assert.equal(
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, file)))
      .digest("hex"),
    hash,
    "SOURCE_CHANGED: " + file,
  );
}
const reports = Object.fromEntries(
  ["baseline", "700-10x10"].map((variant) => [
    variant,
    Object.assign(
      {},
      read("-" + variant + "-physical"),
      read("-" + variant + "-magic"),
    ),
  ]),
);
const labels = {
  amazon: "Amazon",
  barbarian: "Barbarian",
  assassin: "Assassin",
  sorceress: "Sorceress",
  druid: "Druid",
  necromancer: "Necromancer",
  paladin: "Paladin",
};
function round(value) {
  return +value.toFixed(3);
}
function wilson(k, n) {
  if (!n) return null;
  const p = k / n,
    z = 1.959963984540054,
    z2 = z * z,
    denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [round(100 * (center - half)), round(100 * (center + half))];
}
function paired(gained, lost, n) {
  const delta = (gained - lost) / n;
  const variance = Math.max(0, ((gained + lost) / n - delta * delta) / (n - 1));
  const half = 1.959963984540054 * Math.sqrt(variance);
  const discordant = gained + lost;
  let probability = 2 ** -discordant,
    sum = probability;
  for (let i = 1; i <= Math.min(gained, lost); i++) {
    probability *= (discordant - i + 1) / i;
    sum += probability;
  }
  return {
    gained,
    lost,
    deltaPoints: round(100 * delta),
    deltaConfidence95Points: [
      round(100 * (delta - half)),
      round(100 * (delta + half)),
    ],
    exactMcNemarP: discordant ? Math.min(1, 2 * sum) : 1,
  };
}
const classes = {};
for (const [classKey, label] of Object.entries(labels)) {
  const a = reports.baseline[classKey],
    b = reports["700-10x10"][classKey];
  for (const report of [a, b]) {
    assert.equal(report.runs, manifest.runsPerClassPerVariant);
    assert.equal(report.runFloors.length, report.runs);
    assert.equal(report.simulationSeed, manifest.seed);
    assert.equal(report.policy, manifest.policy);
    assert.equal(report.targetFloor, 999);
    assert.equal(report.backend, "memory");
    assert.equal(report.externalDiamonds, 0);
    assert.equal(report.timeouts, 0);
    assert.equal(report.echoEnvironment, "Isolated runs; no previous graves");
  }
  assert.equal(a.checkpointRule.variant, "baseline");
  assert.equal(b.checkpointRule.variant, "700-10x10");
  assert.deepEqual(a.balanceProfile, b.balanceProfile);
  assert.equal(a.passedFloor700, b.passedFloor700);
  let gained = 0,
    lost = 0;
  a.runFloors.forEach((floor, i) => {
    const other = b.runFloors[i];
    if (floor < 700 || other < 700)
      assert.equal(floor, other, "PRE_700_DIVERGENCE " + classKey + ":" + i);
    if (floor < 999 && other === 999) gained++;
    if (floor === 999 && other < 999) lost++;
  });
  const summarize = (report) => ({
    wins: report.completed999,
    runs: report.runs,
    winPercent: report.completedPercent,
    winConfidence95Percent: wilson(report.completed999, report.runs),
    winAfter700Percent: report.passedFloor700
      ? round((100 * report.completed999) / report.passedFloor700)
      : null,
    winAfter700Confidence95Percent: wilson(
      report.completed999,
      report.passedFloor700,
    ),
    passed700: report.passedFloor700,
    passed800: report.passedFloor800,
    passed900: report.passedFloor900,
    reachedFinalBoss: report.reachedFinalBoss,
    meanFloor: report.meanFloor,
    medianFloor: report.medianFloor,
    mostFrequentDeathFloors: report.mostFrequentDeathFloors,
    timeouts: report.timeouts,
  });
  classes[classKey] = {
    label,
    baseline: summarize(a),
    proposed: summarize(b),
    paired: paired(gained, lost, a.runs),
  };
}
// Holm adjustment controls the familywise error for the seven class comparisons.
let previous = 0;
Object.values(classes)
  .sort((a, b) => a.paired.exactMcNemarP - b.paired.exactMcNemarP)
  .forEach((row, i) => {
    previous = Math.max(
      previous,
      Math.min(1, row.paired.exactMcNemarP * (7 - i)),
    );
    row.paired.holmAdjustedP = previous;
  });
const pilotMemory = read("-pilot-700-10x10"),
  pilotSQLite = read("-pilot-sqlite");
for (const key of Object.keys(labels)) {
  const { backend: _, ...memory } = pilotMemory[key],
    { backend: __, ...sqlite } = pilotSQLite[key];
  assert.deepEqual(memory, sqlite, "BACKEND_DIFFERENCE: " + key);
}
const output = {
  ...manifest,
  finishedAt: new Date().toISOString(),
  evaluationRuns: 14000,
  backendValidation: {
    runs: 70,
    variant: "700-10x10",
    result:
      "Exact report equality excluding backend name, memory versus SQLite",
  },
  intervals: {
    winRate: "Wilson 95%",
    pairedDelta:
      "Approximate 95% interval from per-seed signed win differences",
    classComparisons:
      "Exact two-sided McNemar; Holm adjustment across seven classes",
  },
  limitations: [
    "Fixed balanced policy, alternating main stat/VIT by checkpoint ordinal; no optimization per configuration.",
    "No starting items/tickets, no diamond purchases; isolated runs without previous graves. Real current service, combat, fairness, item, passive, curse and event engine; temporary database.",
    "Skips Shrine, avoids exposed Mimics, skips Royal Invitation; does not actively pursue rare LR chains.",
    "Same deterministic seed per class and run index; all paired runs are identical until completing floor 700. After that, actions and random draws can diverge.",
    "Proposal is simulation-only; production checkpoint rules and Tower mode are unchanged.",
  ],
  classes,
};
fs.writeFileSync(
  path.join(root, prefix + "-comparison.json"),
  JSON.stringify(output, null, 2) + "\n",
);
const percent = (x) =>
  x == null
    ? "—"
    : x.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + "%";
const delta = (x) =>
  (x > 0 ? "+" : "") + x.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const rows = Object.values(classes).map(
  (r) =>
    "| " +
    [
      r.label,
      r.baseline.wins + "/1000",
      percent(r.baseline.winPercent),
      r.proposed.wins + "/1000",
      percent(r.proposed.winPercent),
      delta(r.paired.deltaPoints),
      r.paired.deltaConfidence95Points.map(delta).join(" đến "),
      r.paired.holmAdjustedP < 0.05
        ? r.paired.deltaPoints < 0
          ? "Giảm rõ"
          : "Tăng rõ"
        : "Chưa rõ",
    ].join(" | ") +
    " |",
);
const lateRows = Object.values(classes).map(
  (r) =>
    "| " +
    [
      r.label,
      r.baseline.passed700,
      percent(r.baseline.winAfter700Percent),
      percent(r.proposed.winAfter700Percent),
      r.baseline.reachedFinalBoss + " → " + r.proposed.reachedFinalBoss,
      r.baseline.meanFloor + " → " + r.proposed.meanFloor,
    ].join(" | ") +
    " |",
);
const allLower = Object.values(classes).every(
  (r) => r.proposed.winPercent < r.baseline.winPercent,
);
const mostAffected = Object.values(classes)
  .filter((r) => r.baseline.winPercent > 0)
  .sort(
    (a, b) =>
      a.proposed.winPercent / a.baseline.winPercent -
      b.proposed.winPercent / b.baseline.winPercent,
  )[0];
const md = [
  "# Sinh tồn — so sánh checkpoint từ tầng 700, 07/10/2026",
  "",
  "14.000 run đánh giá: 1.000/class/cấu hình. Thắng = hạ Deimoss tầng 999, còn sống và chốt Summit. Hai cấu hình được đo lại trên cùng mã nguồn hiện tại và seed; báo cáo cũ 06/10 không dùng làm đối chứng.",
  "",
  "- Hiện tại: checkpoint mỗi 5 tầng, +5 vào một thuộc tính, hồi đầy HP và +2 bình.",
  "- Đề xuất: trước 700 giữ nguyên; sau khi vượt tầng 700, checkpoint ở 700, 710, …, 990, +10 vào một thuộc tính, hồi đầy HP và +2 bình. Các mốc 705, 715, …, 995 không có checkpoint.",
  "- 700–999: hai cấu hình đều cộng tổng **300 điểm** nếu đi hết; số lần hồi đầy HP/nhận bình giảm **60 → 30**, lượng bình bổ sung danh nghĩa giảm **120 → 60** (thực nhận tùy giới hạn túi). Khoảng chiến đấu giữa lần hồi đầy tăng 5 → 10 tầng.",
  "- Luật thật chưa đổi; thử nghiệm nạp bản sao hai module vào riêng tiến trình simulator. Không thay đổi Tower.",
  "",
  "| Class | Thắng hiện tại | Tỷ lệ | Thắng đề xuất | Tỷ lệ | Chênh lệch điểm % | Khoảng 95% chênh lệch | Kết luận mẫu |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ...rows,
  "",
  "## Nhận xét",
  "",
  allLower
    ? "Cả bảy class đều giảm tỷ lệ thắng trong chiến thuật được đo. " +
      mostAffected.label +
      " chịu mức giảm tương đối lớn nhất: " +
      percent(
        100 *
          (1 -
            mostAffected.proposed.winPercent /
              mostAffected.baseline.winPercent),
      ) +
      " so với tỷ lệ hiện tại của chính class đó."
    : "Mức thay đổi khác nhau theo class; xem khoảng tin cậy và kiểm định ghép cặp trước khi kết luận.",
  "",
  "Gấp đôi điểm mỗi lần chọn bù việc giảm một nửa số lần chọn, nên tổng điểm không tăng. Đồng thời mất một nửa lần hồi đầy HP/nhận bình và đi thêm năm tầng trước boss cuối kể từ lần hồi cuối. Đây là thay đổi lớn về khả năng sống sót cuối run. Lần thử này đo cả hai thay đổi cùng lúc, chưa tách riêng tác động của nhịp cấp điểm và nhịp hồi phục.",
  "",
  "Nếu mục tiêu là giảm thao tác chọn chỉ số nhưng giữ độ khó gần hiện tại, nên thử cấu hình chọn +10 mỗi 10 tầng từ 700, còn hồi HP/+2 bình mỗi 5 tầng; cấu hình đó cần một phép đo riêng trước khi áp dụng.",
  "",
  "## Chỉ xét run đã vượt tầng 700",
  "",
  "Số run vượt tầng 700 giống hệt ở hai cấu hình. Điều chỉnh bắt đầu ở checkpoint sau trận tầng 700, nên phần này tập trung vào giai đoạn chịu thay đổi.",
  "",
  "| Class | Qua 700 | Thắng hiện tại / qua 700 | Thắng đề xuất / qua 700 | Đến Deimoss | Tầng trung bình toàn run |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...lateRows,
  "",
  "## Phương pháp và giới hạn",
  "",
  "- Balanced: nâng stat chính và VIT luân phiên theo **số checkpoint**, không dùng số tầng để chia lượt nâng. Với cấu hình cũ cách này giống nguyên simulator; cấu hình mới tránh sai lệch chỉ nâng VIT ở mọi checkpoint chia hết cho 10.",
  "- Cược 100.000 xu; không mang đồ/vé đầu run, không mua kim cương. Dùng item/drop/shop trong run như chiến thuật hiện tại. Drop hiện hành: min(20%, 1% + LUCK × 0,5 điểm %), độ hiếm thấp/cao 60%/40%.",
  "- Bỏ Shrine, cứu Adventurer khi có bình, chọn rương đỏ trong Treasure Room, dùng Skill khi đủ MP, bình khi nguy hiểm; tránh Mimic đã lộ. Royal Invitation bị bỏ qua, không chủ động săn LR từ chuỗi bí mật.",
  "- Paradox/Contract/Rift/event/RNGesus dùng engine hiện tại. Hối lộ RNGesus khi phù hợp; không chọn theo loot hoặc kết quả ẩn. Mỗi run có user riêng, không có mộ từ run trước; không có lượt tích lũy tử trận RNGesus trước đó.",
  "- 70 run pilot SQLite và memory cho kết quả chính xác như nhau (chỉ khác tên backend); pilot dùng seed riêng, không tính vào đánh giá.",
  "- Tất cả run ghép cặp kết thúc trước 700 đều có cùng tầng kết thúc; không run nào hết giới hạn 40.000 action. Sau 700, lựa chọn và thứ tự draw có thể khác vì trạng thái khác.",
  "- Khoảng tỷ lệ thắng Wilson 95% và khoảng chênh lệch ghép cặp xấp xỉ 95% nằm trong JSON. Nhãn giảm/tăng rõ dùng kiểm định McNemar chính xác, điều chỉnh Holm cho bảy class ở mức 5%. Chúng mô tả chiến thuật này, không chứng minh tối ưu hay tỷ lệ của mọi người chơi.",
  "",
  "## Tái hiện",
  "",
  "Commit nền: " +
    manifest.baseCommit +
    ". SHA-256 của " +
    Object.keys(manifest.sourceSha256).length +
    " file nằm trong manifest và JSON tổng hợp.",
  "",
  "~~~powershell",
  "$env:HARDCORE_SIM_BACKEND='memory'",
  "$env:HARDCORE_SIM_POLICY='balanced'",
  "$env:HARDCORE_SIM_ISOLATED='1'",
  "$env:HARDCORE_SIM_SEED='" + manifest.seed + "'",
  "Remove-Item Env:HARDCORE_SIM_POWER,Env:HARDCORE_SIM_BUILDS,Env:HARDCORE_GAMEPLAY_VERSION,Env:HARDCORE_SIM_BUILD,Env:HARDCORE_SIM_STAKE -ErrorAction SilentlyContinue",
  "$env:HARDCORE_SIM_CHECKPOINTS='baseline'",
  "$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2026-10-07-checkpoints-baseline-physical.json'",
  "node scripts/simulate-hardcore.js 1000 999 40000 amazon,barbarian,assassin,paladin",
  "$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2026-10-07-checkpoints-baseline-magic.json'",
  "node scripts/simulate-hardcore.js 1000 999 40000 sorceress,druid,necromancer",
  "# Lặp hai lệnh trên với HARDCORE_SIM_CHECKPOINTS='700-10x10' và đổi tên output tương ứng.",
  "node scripts/report-hardcore-checkpoints.js",
  "~~~",
  "",
];
fs.writeFileSync(path.join(root, prefix + "-comparison.md"), md.join("\n"));
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(classes).map(([k, r]) => [
        k,
        {
          baseline: r.baseline.winPercent,
          proposed: r.proposed.winPercent,
          delta: r.paired.deltaPoints,
          passed700: r.baseline.passed700,
          lateBaseline: r.baseline.winAfter700Percent,
          lateProposed: r.proposed.winAfter700Percent,
          holmP: r.paired.holmAdjustedP,
        },
      ]),
    ),
  ),
);
