"use strict";
const { db } = require("../../db");
const { EmbedBuilder } = require("discord.js");
const { setTimeout: delay } = require("node:timers/promises");
const { RELIC_ITEMS } = require("../itemRelics");
const { eventIcon, relicIcon } = require("../shared/icons");
function frame(state, userId, stage = 0) {
  const e = state.encounter;
  if (e?.type !== "royal_blessing" || e.revealedAt != null) return null;
  const name = RELIC_ITEMS[e.relicId].name;
  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setColor(stage ? 0xf1c40f : 0x181b24)
        .setTitle(stage ? "✦ PHƯỚC LÀNH HOÀNG GIA ✦" : "…")
        .setDescription(
          "<@" +
            userId +
            "> · Tầng " +
            e.sourceFloor +
            "\n\n" +
            (stage
              ? relicIcon(e.relicId) + " Năm bảo vật tan vào một luồng sáng.\n**" +
                name +
                "** được trao cho người nhận lời…"
              : eventIcon("royal_invitation") +
                " Cánh cửa cung điện mở ra.\nHoàng gia công nhận lời giao ước của bạn…"),
        ),
    ],
    components: [],
    allowedMentions: { parse: [] },
  };
}
function claimReveal(sessionId, state, now = Date.now()) {
  const e = state.encounter;
  if (e?.type !== "royal_blessing") return false;
  return Boolean(
    db
      .prepare(
        "UPDATE hardcore_sessions SET state_json=json_set(state_json,'$.encounter.revealedAt',?) WHERE id=? AND json_extract(state_json,'$.turn')=? AND json_extract(state_json,'$.encounter.type')='royal_blessing' AND json_extract(state_json,'$.encounter.sourceFloor')=? AND json_extract(state_json,'$.encounter.relicId')=? AND json_extract(state_json,'$.encounter.revealedAt') IS NULL",
      )
      .run(now, String(sessionId), state.turn, e.sourceFloor, e.relicId)
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
    logger?.warn?.({ err, sessionId }, "Royal blessing reveal skipped");
  } finally {
    state.encounter.revealedAt = Date.now();
  }
  return true;
}
module.exports = { frame, claimReveal, play };
