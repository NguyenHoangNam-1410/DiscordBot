"use strict";
require("dotenv").config();
const catalog = require("../src/hardcore/tower/challengeCatalog");
const generator = require("../src/hardcore/tower/generator");
const repo = require("../src/services/hardcoreTowerRepository");
const { CLASS_ROTATION } = require("../src/hardcore/tower/classProfiles");
const solver = require("../src/hardcore/tower/solver");
const { db } = require("../src/db");
function requestedWeek(value) {
  if (!value) return catalog.weekAt();
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) throw Error("Use --week YYYY-Www");
  const year = Number(match[1]),
    week = Number(match[2]),
    jan4 = Date.UTC(year, 0, 4),
    day = (new Date(jan4).getUTCDay() + 6) % 7;
  const at = jan4 - day * 86400000 + (week - 1) * catalog.WEEK_MS - 7 * 3600000,
    result = catalog.weekAt(at);
  if (result.isoYear !== year || result.isoWeek !== week)
    throw Error("INVALID_ISO_WEEK");
  return result;
}
try {
  const index = process.argv.indexOf("--week"),
    week = requestedWeek(index < 0 ? null : process.argv[index + 1]);
  let payload;
  if (process.argv.includes("--publish")) payload = catalog.publishWeek(week);
  else {
    const existing = repo.challengeByWeek(week.isoYear, week.isoWeek);
    if (existing) payload = catalog.get(existing.challenge_id);
    else {
      const classKey = CLASS_ROTATION[repo.rotation().next_index % 7],
        id = generator.challengeId(week.isoYear, week.isoWeek, classKey);
      payload = generator.generate({
        ...week,
        classKey,
        seed: generator.productionSeed(id, generator.CONTENT_VERSION),
      }).payload;
    }
  }
  const audit = solver.validate(payload);
  console.log(
    JSON.stringify(
      {
        challengeId: payload.challengeId,
        classKey: payload.classKey,
        stepCount: payload.stepCount,
        seedCommitment: payload.seedCommitment,
        solutionHash: payload.solutionHash,
        difficultyScore: payload.difficultyScore,
        winningPaths: audit.winningPaths,
        wrongBranchesRecoverable: audit.wrongBranchesRecoverable,
        publicationStatus: payload.publicationStatus || "validated preview",
        startsAt: new Date(payload.startsAt).toISOString(),
        endsAt: new Date(payload.endsAt).toISOString(),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
