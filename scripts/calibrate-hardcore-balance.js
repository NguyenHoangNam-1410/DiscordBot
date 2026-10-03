"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "../docs/releases");
const files = fs
  .readdirSync(root)
  .filter((name) =>
    /^hardcore-2\.0\.1-(calibration-[a-g]|confirmation|mage-baseline|mage-1\.[346]|policy2-baseline|paladin-baseline-calibration|paladin-recalibration|paladin-1\.[46])\.json$/.test(
      name,
    ),
  );
const data = files.map((name) => ({
  name,
  report: JSON.parse(fs.readFileSync(path.join(root, name), "utf8")),
}));
const reference = JSON.parse(
  fs.readFileSync(
    path.join(root, "hardcore-2.0.1-assassin-reference.json"),
    "utf8",
  ),
).assassin;
const second = data.find((f) => f.name.includes("confirmation"))?.report
  .assassin;
const target =
  (reference.completed999 + (second?.completed999 || 0)) /
  (reference.runs + (second?.runs || 0));
const models = {};
for (const key of [
  "amazon",
  "barbarian",
  "sorceress",
  "druid",
  "necromancer",
  "paladin",
]) {
  const observations = data.flatMap((f) => {
    const row = f.report[key];
    if (!row) return [];
    const build = row.policy === "balanced" ? "baseline" : row.build;
    if (build !== "baseline") return [];
    return [
      {
        file: f.name,
        power: row.balanceProfile.power,
        n: row.runs,
        wins: row.completed999,
      },
    ];
  });
  if (new Set(observations.map((o) => o.power)).size < 2)
    throw new Error(`INSUFFICIENT_CALIBRATION: ${key}`);
  // Point-estimate interpolation only. Reused calibration seeds are correlated;
  // uncertainty is assessed using a separate frozen-profile evaluation.
  let best = { loss: Infinity };
  for (let slope = 1; slope <= 30; slope += 0.25) {
    for (let intercept = -15; intercept <= 0; intercept += 0.05) {
      let loss = 0;
      for (const o of observations) {
        const z = intercept + slope * Math.log(o.power);
        const logDen =
          z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
        loss += o.n * logDen - o.wins * z;
      }
      if (loss < best.loss) best = { intercept, slope, loss };
    }
  }
  const power = Math.exp(
    (Math.log(target / (1 - target)) - best.intercept) / best.slope,
  );
  models[key] = { ...best, power: +power.toFixed(2), observations };
}
const result = {
  targetPercent: 100 * target,
  referenceRuns: reference.runs + (second?.runs || 0),
  referenceWins: reference.completed999 + (second?.completed999 || 0),
  models,
};
fs.writeFileSync(
  path.join(root, "hardcore-2.0.1-calibration-model.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      targetPercent: result.targetPercent,
      powers: Object.fromEntries(
        Object.entries(models).map(([k, v]) => [k, v.power]),
      ),
    },
    null,
    2,
  ),
);
