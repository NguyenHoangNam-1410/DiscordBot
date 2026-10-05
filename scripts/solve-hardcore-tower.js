"use strict";
const catalog = require("../src/hardcore/towerChallenges");
const engine = require("../src/services/hardcoreTowerEngine");
const challenge = catalog.get(process.argv[2] || "tower-2026-W41-v1");
if (!challenge) throw Error("UNKNOWN_CHALLENGE");
const proof = engine.verify(challenge);
console.log(
  JSON.stringify(
    {
      challengeId: challenge.challengeId,
      visited: proof.visited,
      winningPaths: proof.winningPaths.length,
      actions: proof.winningPaths[0].actions,
      final: challenge.expectedFinal,
      solutionHash: proof.solutionHash,
    },
    null,
    2,
  ),
);
