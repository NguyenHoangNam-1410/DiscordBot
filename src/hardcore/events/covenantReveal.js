"use strict";
const { eventIcon, relicIcon } = require("../shared/icons");
const { db } = require("../../db");
const { EmbedBuilder } = require("discord.js");
const { setTimeout: delay } = require("node:timers/promises");
function frame(state, userId, stage = 0) {
  if (
    state.encounter?.type !== "covenant_blessing" ||
    state.encounter.revealedAt != null
  )
    return null;
  const texts = [
    eventIcon("covenant") + " Bốn mảnh bắt đầu cộng hưởng.\nNanh giả, cổ ấn, huyết tâm và ảnh gương cùng tan vào một luồng sáng…",
    relicIcon("conquerors_covenant") + " Tầng hầm rung chuyển.\nMột khế ước cổ xưa công nhận người đã chinh phục cả bốn thử thách…",
  ];
  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setColor(stage ? 0xf1c40f : 0x181b24)
        .setTitle(stage ? "✦ KHẾ ƯỚC CHINH PHẠT ✦" : "…")
        .setDescription(
          "<@" +
            userId +
            "> · Tầng " +
            state.encounter.sourceFloor +
            "\n\n" +
            texts[Math.min(stage, 1)],
        ),
    ],
    components: [],
    allowedMentions: { parse: [] },
  };
}
function claimReveal(sessionId, state, now = Date.now()) {
  if (state.encounter?.type !== "covenant_blessing") return false;
  // Only claim this saved turn: stale panels cannot change a later encounter.
  return Boolean(
    db
      .prepare(
        "UPDATE hardcore_sessions SET state_json=json_set(state_json,'$.encounter.revealedAt',?) WHERE id=? AND json_extract(state_json,'$.turn')=? AND json_extract(state_json,'$.encounter.type')='covenant_blessing' AND json_extract(state_json,'$.encounter.sourceFloor')=? AND json_extract(state_json,'$.encounter.revealedAt') IS NULL",
      )
      .run(now, String(sessionId), state.turn, state.encounter.sourceFloor)
      .changes,
  );
}
async function play(
  sessionId,
  state,
  userId,
  edit,
  { wait = delay, logger = null } = {},
) {
  if (!frame(state, userId) || !claimReveal(sessionId, state)) return false;
  try {
    await edit(frame(state, userId, 0));
    await wait(650);
    await edit(frame(state, userId, 1));
    await wait(850);
  } catch (err) {
    logger?.warn?.({ err, sessionId }, "Conqueror's Covenant reveal skipped");
  } finally {
    state.encounter.revealedAt = Date.now();
  }
  return true;
}
module.exports = { frame, claimReveal, play };
