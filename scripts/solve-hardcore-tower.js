"use strict";
require("dotenv").config();
const catalog = require("../src/hardcore/tower/challengeCatalog");
const generator = require("../src/hardcore/tower/generator");
const solver = require("../src/hardcore/tower/solver");
const { db } = require("../src/db");
try {
  const id = process.argv.slice(2).find((v) => !v.startsWith("--"));
  const challenge = id ? catalog.get(id) : catalog.active() || catalog.recent();
  if (!challenge) throw Error("UNKNOWN_CHALLENGE");
  if (challenge.generatorVersion !== 3)
    throw Error("Use legacy fixture tests for archived v1 challenges");
  const proof = solver.validate(challenge),
    expired = Date.now() >= challenge.endsAt;
  if (
    (process.argv.includes("--solution") ||
      process.argv.includes("--reveal-seed")) &&
    !expired
  )
    throw Error("TOWER_SECRET_LOCKED_UNTIL_EXPIRY");
  const report = {
    challengeId: challenge.challengeId,
    winningPaths: proof.winningPaths,
    visited: proof.visited,
    stepCount: challenge.stepCount,
    finalHpRatio: proof.finalHpRatio,
    finalManaRatio: proof.finalManaRatio,
    solutionHash: proof.solutionHash,
    seedCommitment: challenge.seedCommitment,
  };
  if (process.argv.includes("--solution"))
    report.actions = proof.canonicalSolution;
  if (process.argv.includes("--reveal-seed")) {
    const seed = generator.productionSeed(
      challenge.challengeId,
      challenge.contentVersion,
    );
    if (solver.hash(seed) !== challenge.seedCommitment)
      throw Error("TOWER_SECRET_CHANGED_COMMITMENT_MISMATCH");
    report.seed = seed;
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
