"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.join(__dirname, ".."),
  out = path.join(root, "docs/releases");
const balance = require("../src/services/hardcoreBalance");
const report = Object.assign(
  {},
  ...["physical", "magic", "paladin"].map((group) =>
    JSON.parse(
      fs.readFileSync(
        path.join(out, `hardcore-2.0.1-holdout-${group}.json`),
        "utf8",
      ),
    ),
  ),
);
const logFactorial = [0];
for (let i = 1; i <= 1000; i++)
  logFactorial[i] = logFactorial[i - 1] + Math.log(i);
function cdf(k, n, p) {
  if (p === 0) return 1;
  if (p === 1) return k === n ? 1 : 0;
  let sum = 0;
  for (let i = 0; i <= k; i++)
    sum += Math.exp(
      logFactorial[n] -
        logFactorial[i] -
        logFactorial[n - i] +
        i * Math.log(p) +
        (n - i) * Math.log1p(-p),
    );
  return Math.min(1, sum);
}
function rootCdf(k, n, target) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 64; i++) {
    const p = (lo + hi) / 2;
    if (cdf(k, n, p) > target) lo = p;
    else hi = p;
  }
  return (lo + hi) / 2;
}
function interval(k, n) {
  return [
    k ? 100 * rootCdf(k - 1, n, 0.975) : 0,
    k < n ? 100 * rootCdf(k, n, 0.025) : 100,
  ].map((p) => +p.toFixed(3));
}
const classes = {};
for (const key of Object.keys(balance.PROFILES)) {
  const row = report[key];
  if (
    !row ||
    row.runs !== 1000 ||
    row.runFloors.length !== 1000 ||
    row.balanceProfile.power !== balance.PROFILES[key].power
  )
    throw new Error(`INCOMPLETE_REPORT: ${key}`);
  classes[key] = {
    ...row,
    completionConfidence95Percent: interval(row.completed999, row.runs),
  };
}
const tracked = [
  "src/services/hardcoreBalance.js",
  "src/services/hardcoreStats.js",
  "src/services/hardcoreV2.js",
  "src/services/hardcoreWorld.js",
  "src/services/hardcoreVersion.js",
  "src/hardcore/item.js",
  "scripts/simulate-hardcore.js",
];
const output = {
  version: "2.0.1",
  date: "2026-10-03",
  targetPercent: 1,
  reference: { runs: 800, wins: 8 },
  evaluationRuns: 7000,
  policy: "balanced",
  intervalMethod: "Exact two-sided Clopper-Pearson, 95%, isolated runs",
  limitations:
    "Fixed simulation policy, no diamond purchases or previous graves. Intervals overlapping the target do not prove equal mathematical expectations or equivalence.",
  sourceSha256: Object.fromEntries(
    tracked.map((p) => [
      p,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, p)))
        .digest("hex"),
    ]),
  ),
  classes,
};
fs.writeFileSync(
  path.join(out, "hardcore-2.0.1-simulation.json"),
  JSON.stringify(output, null, 2) + "\n",
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
const rows = Object.entries(classes).map(
  ([k, v]) =>
    `| ${labels[k]} | ${v.balanceProfile.power} | ${v.completed999}/1000 | ${v.completedPercent}% | ${v.completionConfidence95Percent.join("–")}% | ${v.meanFloor} | ${v.medianFloor} | ${v.reachedFinalBoss} |`,
);
const md = [
  "# Sinh tồn 2.0.1 — đánh giá cân bằng class",
  "",
  "Mục tiêu khoảng 1% hoàn thành tầng 999 theo Assassin (8/800 ở dữ liệu hiệu chỉnh). Hệ số và chiến thuật được khóa trước lượt đánh giá của từng class. Tổng 7.000 run đánh giá cuối, 1.000/class.",
  "",
  "| Class | Sức mạnh | Hoàn thành 999 | Tỷ lệ mẫu | Khoảng tin cậy 95% | Tầng trung bình | Trung vị | Đến boss 999 |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...rows,
  "",
  "Khoảng tin cậy Clopper–Pearson hai phía. Tất cả khoảng tin cậy đều bao phủ mục tiêu 1%; việc này không chứng minh các kỳ vọng bằng nhau hoặc thỏa một biên tương đương cụ thể. Tỷ lệ mẫu nằm trong 0,6–1,5%, Assassin 0,8%.",
  "",
  `Hết giới hạn action: ${Object.values(classes).reduce((a, v) => a + v.timeouts, 0)}/7000. Run thắng có action chốt Summit/settlement. Đây là mô phỏng engine, không kiểm tra nút Discord trực tiếp.`,
  "",
  "## Điều kiện",
  "",
  "- Cược 100.000 xu, không mua bằng kim cương; tối đa 40.000 action/run.",
  "- Service/combat/event/catalog/fairness thật, repository memory và SQLite tạm riêng; không dùng database sản xuất.",
  "- Mỗi run tách khỏi mộ của run trước; không chọn action theo seed, loot ẩn hoặc kết quả sự kiện chưa công bố.",
  "- Chính sách balanced: skill, stat chính/VIT, inspect và né Mimic đã lộ, tránh Shrine; payout/HP shop, hối lộ RNGesus khi không có vé. Không chứng minh đây là tối ưu tuyệt đối.",
  "- Điểm hiệu chỉnh dùng mô hình logistic để chọn hệ số. Seed hiệu chỉnh được tái sử dụng giữa một số ứng viên nên không dùng chúng để tính khoảng tin cậy độc lập.",
  "- Paladin 1,55 đạt 2/1000 ở lượt trước: lượt đó đã được dùng để hiệu chỉnh, không tính vào bảng cuối. Hệ số cuối 1,67 đo bằng seed mới.",
  "- Kỳ vọng tiến sâu trung bình vẫn khác giữa class; mục tiêu lần này là tỷ lệ hoàn thành 999. Guild có mộ, người chơi đổi chiến thuật hoặc mua đồ bằng kim cương có thể cho kết quả khác.",
  "",
  "## Chạy lại",
  "",
  "```powershell",
  "$env:HARDCORE_SIM_BACKEND='memory'",
  "$env:HARDCORE_SIM_POLICY='balanced'",
  "$env:HARDCORE_SIM_ISOLATED='1'",
  "$env:HARDCORE_SIM_SEED='survival-balanced-holdout-2026-10-03'",
  "$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2.0.1-holdout-physical.json'",
  "node scripts/simulate-hardcore.js 1000 999 40000 amazon,barbarian,assassin",
  "$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2.0.1-holdout-magic.json'",
  "node scripts/simulate-hardcore.js 1000 999 40000 sorceress,druid,necromancer",
  "$env:HARDCORE_SIM_SEED='survival-balanced-paladin-final-2026-10-03'",
  "$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2.0.1-holdout-paladin.json'",
  "node scripts/simulate-hardcore.js 1000 999 40000 paladin",
  "node scripts/report-hardcore-balance.js",
  "```",
  "",
  "Các biến HARDCORE_SIM_POWER/HARDCORE_SIM_BUILDS/HARDCORE_GAMEPLAY_VERSION nên không được đặt khi chạy lại bản chính thức. Hash nguồn và danh sách tầng của từng run nằm trong hardcore-2.0.1-simulation.json.",
];
fs.writeFileSync(
  path.join(out, "hardcore-2.0.1-simulation.md"),
  md.join("\n") + "\n",
);
console.log(
  Object.fromEntries(
    Object.entries(classes).map(([k, v]) => [
      k,
      {
        wins: v.completed999,
        runs: v.runs,
        percent: v.completedPercent,
        ci95: v.completionConfidence95Percent,
        mean: v.meanFloor,
        timeouts: v.timeouts,
      },
    ]),
  ),
);
