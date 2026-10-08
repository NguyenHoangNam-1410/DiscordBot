"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const generator = require("../src/hardcore/tower/generator"),
  solver = require("../src/hardcore/tower/solver");
const { CLASS_ROTATION } = require("../src/hardcore/tower/classProfiles");
const catalog = require("../src/hardcore/tower/challengeCatalog"),
  repo = require("../src/services/hardcoreTowerRepository");
const secret = "test-only-tower-generator-secret",
  silent = { info() {}, error() {} };
const rng = Math.random;
Math.random = () => {
  throw Error("TOWER_GENERATOR_MATH_RANDOM");
};
try {
  const firstWeek = catalog.weekAt(catalog.ANCHOR);
  assert.deepEqual(firstWeek, {
    isoYear: 2026,
    isoWeek: 41,
    startsAt: catalog.ANCHOR,
    endsAt: catalog.ANCHOR + catalog.WEEK_MS,
  });
  assert.equal(catalog.weekAt(catalog.ANCHOR - 1).isoWeek, 40);
  for (const tz of ["UTC", "America/New_York", "Pacific/Auckland"]) {
    process.env.TZ = tz;
    assert.deepEqual(catalog.weekAt(catalog.ANCHOR), firstWeek);
    assert.equal(catalog.weekAt(Date.parse("2027-01-03T17:00:00Z")).isoWeek, 1);
  }
  const id = generator.challengeId(2026, 41, "sorceress");
  assert.equal(id, "tower:2026:W41:sorceress:g4");
  const seed = generator.productionSeed(id, 1, secret);
  assert.notEqual(seed, generator.productionSeed(id, 1, "different-secret"));
  assert.throws(
    () => generator.productionSeed(id, 1, ""),
    /MISSING_TOWER_GENERATOR_SECRET/,
  );
  const input = { ...firstWeek, classKey: "sorceress", seed };
  const a = generator.generate(input),
    b = generator.generate(input);
  assert.equal(JSON.stringify(a.payload), JSON.stringify(b.payload));
  assert.equal(a.payload.stepCount, 81);
  assert.equal(a.payload.contentVersion, 5);
  assert.equal(a.payload.floors.length, 15);
  assert.deepEqual(
    a.payload.floors.map((f) => f.stepCount),
    generator.FIRST_LENGTHS,
  );
  assert.equal(a.audit.winningPaths, 1);
  assert.equal(a.audit.wrongBranchesRecoverable, 0);
  assert.ok(a.audit.finalHpRatio > 0 && a.audit.finalHpRatio <= 0.25);
  assert.ok(a.audit.finalManaRatio >= 0 && a.audit.finalManaRatio <= 0.8);
  assert.equal(a.payload.seedCommitment, solver.hash(seed));
  assert.equal(
    a.payload.solutionHash,
    solver.hash(id + "|4|" + a.canonicalSolution.join(",")),
  );
  assert.ok(!("canonicalSolution" in a.payload));
  assert.ok(
    a.payload.floors.every((floor) => {
      const combat = a.payload.transitions.filter(
        (t) => t.floor === floor.number && t.type === "combat",
      );
      return new Set(combat.map((t) => t.expectedAction)).size === 3;
    }),
  );
  assert.ok(
    a.payload.transitions.filter(
      (t) => t.type === "combat" && t.expectedAction === "skill" && !t.finisher,
    ).length >= 10,
  );
  assert.ok(
    a.payload.floors.some(
      (floor) =>
        a.payload.transitions.filter(
          (t) =>
            t.floor === floor.number &&
            t.type === "combat" &&
            t.expectedAction === "skill",
        ).length >= 2,
    ),
  );
  assert.ok(
    a.payload.transitions
      .filter((t) => t.type === "combat")
      .every(
        (t) =>
          !t.spellLocked &&
          [t.physicalResist, t.magicResist].every(
            (value) => value >= 0 && value <= 100 && value % 25 === 0,
          ) &&
          (t.echoDelay == null || [1, 2].includes(t.echoDelay)),
      ),
  );
  assert.deepEqual(
    a.payload.floors.slice(12).map((floor) => floor.phaseHps.length),
    [2, 2, 3],
  );
  assert.ok(a.audit.lookaheadDepth >= 3);
  assert.ok(a.audit.lookaheadBranches >= 10);
  assert.ok(a.audit.nearMissBranches >= 3);
  assert.ok(a.audit.echoWindows >= 4);
  assert.ok(a.audit.partialResistanceWindows >= 15);
  const skillIndex = a.payload.transitions.findIndex(
      (t) => t.type === "combat" && !t.finisher && t.expectedAction === "skill",
    ),
    skillTransition = a.payload.transitions[skillIndex],
    reusableState = {
      ...solver.initial(a.payload),
      routeStep: skillIndex,
      floor: skillTransition.floor,
      floorStep: skillTransition.floorStep,
      mana: a.payload.character.maxMana,
      enemyHp: a.payload.floors[skillTransition.floor - 1].hp,
      skillUsed: true,
    };
  assert.ok(solver.options(a.payload, reusableState).includes("skill"));
  const normalSkill = solver.combatOutcome(
    a.payload,
    reusableState,
    skillTransition,
    "skill",
  );
  assert.equal(normalSkill.enemyHeal, 0);
  assert.ok(normalSkill.damage > 0);
  const legacyPayload = { ...a.payload, contentVersion: 3 },
    legacySkill = solver.combatOutcome(
      legacyPayload,
      reusableState,
      skillTransition,
      "skill",
    );
  assert.equal(legacySkill.enemyHeal, legacySkill.damage);
  assert.ok(!solver.options(legacyPayload, reusableState).includes("skill"));
  let mechanicsState = solver.initial(a.payload),
    sawEchoResolve = false,
    sawAdaptive = false,
    sawBreakSpend = false;
  while (mechanicsState.status === "playing") {
    const transition = a.payload.transitions[mechanicsState.routeStep],
      beforeBreak = mechanicsState.breakGauge,
      action = transition.expectedAction;
    if (transition.type === "combat") {
      const outcome = solver.combatOutcome(
        a.payload,
        mechanicsState,
        transition,
        action,
      );
      if (action === "attack") {
        assert.equal(outcome.adaptiveArmor, "physical");
        assert.equal(outcome.breakGauge, Math.min(3, beforeBreak + 1));
        sawAdaptive = true;
      }
      if (action === "skill") {
        assert.equal(outcome.adaptiveArmor, "magic");
        assert.equal(outcome.breakGauge, 0);
        if (beforeBreak) sawBreakSpend = true;
      }
      if (outcome.echoDamage) sawEchoResolve = true;
    }
    mechanicsState = solver.apply(a.payload, mechanicsState, action);
  }
  assert.equal(sawAdaptive, true);
  assert.equal(sawBreakSpend, true);
  assert.equal(sawEchoResolve, true);
  const firstPhaseEnd = a.payload.transitions.findIndex(
      (t) => t.floor === 13 && t.phaseEnd,
    ),
    phaseProbe = solver.initial(a.payload);
  let beforePhase = phaseProbe;
  while (beforePhase.routeStep < firstPhaseEnd)
    beforePhase = solver.apply(
      a.payload,
      beforePhase,
      a.payload.transitions[beforePhase.routeStep].expectedAction,
    );
  const phaseTransition = a.payload.transitions[firstPhaseEnd],
    overflowProbe = { ...beforePhase, phaseHp: 1 },
    phaseOutcome = solver.combatOutcome(
      a.payload,
      overflowProbe,
      phaseTransition,
      phaseTransition.expectedAction,
    );
  assert.equal(phaseOutcome.damage, 1);
  assert.equal(phaseOutcome.phaseEnded, true);
  assert.equal(phaseOutcome.bossPhase, 1);
  assert.equal(phaseOutcome.counter, 0);
  const broken = structuredClone(a.payload);
  broken.transitions[0].manaDelta = 200;
  assert.throws(() => solver.validate(broken));
  assert.throws(
    () => solver.validate(a.payload, { timeoutMs: 0 }),
    /TOWER_SOLVER_TIMEOUT/,
  );
  assert.throws(
    () =>
      generator.generate(input, {
        maxCandidates: 100,
        validate() {
          throw Error("SOLVER_THROW");
        },
      }),
    /TOWER_GENERATION_FAILED/,
  );
  const before = repo.rotation().next_index;
  assert.throws(
    () =>
      catalog.publishWeek(firstWeek, {
        secret,
        validate() {
          throw Error("SOLVER_TIMEOUT");
        },
      }),
    /SOLVER_TIMEOUT/,
  );
  assert.equal(repo.rotation().next_index, before);
  assert.equal(repo.challengeByWeek(2026, 41), null);
  let retries = 0;
  catalog.ensureWeekly(catalog.ANCHOR, {
    secret,
    logger: silent,
    generate() {
      retries++;
      throw Error("GENERATOR_THROW");
    },
  });
  assert.equal(retries, 1);
  assert.equal(repo.rotation().next_index, 0);
  catalog.ensureWeekly(catalog.ANCHOR + 1, {
    secret,
    logger: silent,
    generate() {
      retries++;
      throw Error("GENERATOR_THROW");
    },
  });
  assert.equal(retries, 1);
  const current = catalog.ensureWeekly(catalog.ANCHOR + 2, {
    secret,
    logger: silent,
    force: true,
  });
  assert.equal(current.challengeId, id);
  assert.equal(repo.rotation().next_index, 1);
  assert.equal(catalog.upcoming(catalog.ANCHOR), null);
  const snapshot = repo.challenge(id).payload_json;
  catalog.ensureWeekly(catalog.ANCHOR + 1000, {
    secret: "rotated-secret",
    logger: silent,
    generate() {
      throw Error("MUST_NOT_REGENERATE");
    },
  });
  assert.equal(repo.challenge(id).payload_json, snapshot);
  assert.throws(
    () =>
      db
        .prepare(
          "UPDATE hardcore_tower_challenges SET payload_json='{}' WHERE challenge_id=?",
        )
        .run(id),
    /IMMUTABLE_TOWER_SNAPSHOT/,
  );
  assert.throws(
    () =>
      db
        .prepare("DELETE FROM hardcore_tower_challenges WHERE challenge_id=?")
        .run(id),
    /IMMUTABLE_TOWER_SNAPSHOT/,
  );
  const rotation = [];
  for (let i = 0; i < 14; i++) {
    const now = catalog.ANCHOR + i * catalog.WEEK_MS;
    catalog.ensureWeekly(now, { secret, logger: silent });
    const c = catalog.active(now);
    assert.equal(c.classKey, CLASS_ROTATION[i % 7]);
    rotation.push(c.classKey);
    assert.ok(c.stepCount >= 72 && c.stepCount <= 90);
    assert.equal(c.floors.length, 15);
    assert.ok(c.floors.every((f) => f.stepCount >= 4));
    assert.ok(c.floors.slice(-4).reduce((a, f) => a + f.stepCount, 0) >= 27);
    const audit = solver.validate(c);
    assert.equal(audit.winningPaths, 1);
    assert.equal(audit.canonicalLength, c.stepCount);
    if (i === 7) assert.notEqual(c.solutionHash, a.payload.solutionHash);
  }
  assert.equal(new Set(rotation.slice(0, 7)).size, 7);
  assert.equal(catalog.active(catalog.ANCHOR - 1), null);
  assert.equal(catalog.active(catalog.ANCHOR + catalog.WEEK_MS - 1), null); // archived after rollover audit
  // A multi-week outage keeps the next class and last archived snapshot;
  // it never fills a missing week with an unvalidated fallback.
  const at = catalog.ANCHOR + 16 * catalog.WEEK_MS;
  const rotationBefore = repo.rotation().next_index;
  catalog.ensureWeekly(at, {
    secret,
    logger: silent,
    generate() {
      throw Error("PUBLISH_FAILURE");
    },
  });
  assert.equal(repo.rotation().next_index, rotationBefore);
  assert.equal(catalog.active(at), null);
  const recent = catalog.recent(at);
  assert.ok(recent && catalog.readable(recent, at));
  const next = repo.rotation().next_index % 7;
  catalog.ensureWeekly(at + 1, { secret, logger: silent, force: true });
  const failedWeek = catalog.weekAt(
    catalog.ANCHOR + rotationBefore * catalog.WEEK_MS,
  );
  assert.equal(
    repo.challengeByWeek(failedWeek.isoYear, failedWeek.isoWeek).class_key,
    CLASS_ROTATION[next],
  );
  // Broaden beyond the production seed: resources and all class mechanics are
  // independently audited for many distinct deterministic candidates.
  for (let sample = 0; sample < 10; sample++)
    for (const classKey of CLASS_ROTATION) {
      const r = generator.generate({
        ...catalog.weekAt(catalog.ANCHOR + catalog.WEEK_MS),
        classKey,
        seed: "fixture:" + sample + ":" + classKey,
      });
      assert.equal(solver.validate(r.payload).winningPaths, 1);
    }
  console.log(
    "Tower v4 generator: deterministic combat, hidden action counts, 7-class rotation, 70 diverse seeds, unique lethal paths, resource mechanics, audit rejection, immutable publication and UTC+7 rollover passed.",
  );
} finally {
  Math.random = rng;
  db.close();
}
