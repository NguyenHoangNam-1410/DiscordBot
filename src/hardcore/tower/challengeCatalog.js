"use strict";
const repo = require("../../services/hardcoreTowerRepository");
const generator = require("./generator");
const solver = require("./solver");
const { CLASS_ROTATION } = require("./classProfiles");
const WEEK_MS = 7 * 86400000,
  ANCHOR = Date.parse("2026-10-05T00:00:00+07:00");
function weekAt(now = Date.now()) {
  const shifted = new Date(now + 7 * 3600000),
    day = (shifted.getUTCDay() + 6) % 7;
  const monday = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - day,
  );
  const thursday = new Date(monday + 3 * 86400000),
    year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4)),
    firstMonday = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000;
  return {
    isoYear: year,
    isoWeek: 1 + Math.floor((monday - firstMonday) / WEEK_MS),
    startsAt: monday - 7 * 3600000,
    endsAt: monday - 7 * 3600000 + WEEK_MS,
  };
}
function freeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function fromRow(row) {
  if (!row) return null;
  return freeze({
    ...JSON.parse(row.payload_json),
    publicationStatus: row.status,
  });
}
function get(id, version) {
  const row = repo.challenge(id);
  if (row && (version == null || row.content_version === version))
    return fromRow(row);
  // Historical attempts remain readable, but cannot start or earn another reward.
  const old = require("../towerChallenges").get(id, version);
  return old
    ? freeze({ ...old, publicationStatus: "archived", legacy: true })
    : null;
}
function playable(c, now = Date.now()) {
  return (
    c?.publicationStatus === "published" &&
    now >= new Date(c.startsAt).getTime() &&
    now < new Date(c.endsAt).getTime()
  );
}
function readable(c, now = Date.now()) {
  return (
    !!c &&
    now >= new Date(c.startsAt).getTime() &&
    (now < new Date(c.endsAt).getTime() + 86400000 ||
      (!active(now) && recent(now)?.challengeId === c.challengeId))
  );
}
function active(now = Date.now()) {
  return fromRow(repo.activeChallenge(now));
}
function recent(now = Date.now()) {
  const row = repo.recentChallenge(now);
  if (row) return fromRow(row);
  const old = require("../towerChallenges")
    .CHALLENGES.filter((c) => Date.parse(c.startsAt) <= now)
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];
  return old ? get(old.challengeId, old.contentVersion) : null;
}
function upcoming(now = Date.now()) {
  const week = weekAt(weekAt(now).endsAt);
  const row = repo.challengeByWeek(week.isoYear, week.isoWeek);
  return row?.status === "published" ? fromRow(row) : null;
}
function publishWeek(
  week,
  {
    secret = process.env.TOWER_GENERATOR_SECRET,
    generate = generator.generate,
    validate = solver.validate,
    now = Date.now(),
  } = {},
) {
  const existing = repo.challengeByWeek(week.isoYear, week.isoWeek);
  if (existing) {
    if (!["published", "archived"].includes(existing.status))
      throw Error("CHALLENGE_NOT_PUBLISHED");
    return fromRow(existing);
  }
  const rotation = repo.rotation(),
    classKey = CLASS_ROTATION[rotation.next_index % CLASS_ROTATION.length];
  const id = generator.challengeId(week.isoYear, week.isoWeek, classKey);
  const seed = generator.productionSeed(id, generator.CONTENT_VERSION, secret);
  const generated = generate({ ...week, classKey, seed });
  if (
    generated.payload.challengeId !== id ||
    generated.payload.classKey !== classKey ||
    generated.payload.isoYear !== week.isoYear ||
    generated.payload.isoWeek !== week.isoWeek ||
    generated.payload.startsAt !== week.startsAt ||
    generated.payload.endsAt !== week.endsAt ||
    generated.payload.seedCommitment !== solver.hash(seed)
  )
    throw Error("INVALID_TOWER_METADATA");
  const audit = validate(generated.payload);
  if (audit.solutionHash !== generated.payload.solutionHash)
    throw Error("TOWER_AUDIT_HASH_MISMATCH");
  return fromRow(
    repo.publishChallenge(generated.payload, audit, rotation.next_index, now),
  );
}
function ensureWeekly(now = Date.now(), options = {}) {
  const logger = options.logger || console;
  if (now < ANCHOR) return null;
  repo.archiveChallenges(now);
  const target = weekAt(now).startsAt + WEEK_MS;
  let cursor = repo.lastPublication()?.starts_at + WEEK_MS || ANCHOR;
  // Published weeks are materialized chronologically, including the coming week:
  // rotation advances only after a valid immutable snapshot is committed.
  let generated = 0;
  while (cursor <= target && generated < 104) {
    const week = weekAt(cursor),
      retry = repo.generationFailure(week.startsAt);
    if (retry && now < retry.retry_at && !options.force) break;
    try {
      const c = publishWeek(week, { ...options, now });
      logger.info?.(
        {
          challengeId: c.challengeId,
          seedCommitment: c.seedCommitment,
          stepCount: c.stepCount,
        },
        "tower challenge published",
      );
      repo.clearGenerationFailure(week.startsAt);
      cursor += WEEK_MS;
      generated++;
    } catch (error) {
      repo.noteGenerationFailure(week.startsAt, error.message, now);
      logger.error?.(
        { err: error, isoYear: week.isoYear, isoWeek: week.isoWeek },
        "tower generator failed; previous challenge remains viewable, rotation unchanged",
      );
      break;
    }
  }
  repo.archiveChallenges(now);
  return active(now);
}
function startWeeklyMaintenance(logger = console) {
  const run = () => {
    try {
      ensureWeekly(Date.now(), { logger });
    } catch (error) {
      logger.error?.({ err: error }, "tower weekly maintenance failed");
    }
  };
  run();
  const timer = setInterval(run, 30000);
  timer.unref?.();
  return timer;
}
module.exports = {
  ANCHOR,
  WEEK_MS,
  weekAt,
  get,
  active,
  recent,
  upcoming,
  readable,
  playable,
  publishWeek,
  ensureWeekly,
  startWeeklyMaintenance,
};
