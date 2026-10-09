"use strict";
const { eventIcon } = require("../shared/icons");
const { EmbedBuilder } = require("discord.js");
const { setTimeout: delay } = require("node:timers/promises");
const god = require("./godRngesus");
const royalReveal = require("./royalReveal");
const covenantReveal = require("./covenantReveal");
function frame(state, userId, stage = 0) {
  if (state.encounter?.type === "royal_blessing")
    return royalReveal.frame(state, userId, stage);
  if (state.encounter?.type === "covenant_blessing")
    return covenantReveal.frame(state, userId, stage);
  if (state.encounter?.type !== "god_rngesus") return null;
  const texts = [
    "…\nKhông gian quanh bạn đột ngột im lặng.\n" + eventIcon("god_rngesus") + " Một ánh mắt dừng lại trên số phận của bạn.",
    eventIcon("god_rngesus") + " Những con số ngừng chuyển động.\nMột quyền năng vượt trên RNGesus đang hiện diện…",
  ];
  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setColor(stage ? 0xf1c40f : 0x181b24)
        .setTitle(stage ? "✦ SỐ PHẬN ĐANG ĐƯỢC VIẾT LẠI ✦" : "…")
        .setDescription(
          "<@" +
            userId +
            "> · Tầng " +
            state.floor +
            "\n\n" +
            texts[Math.min(stage, texts.length - 1)],
        ),
    ],
    components: [],
    allowedMentions: { parse: [] },
  };
}
async function play(
  sessionId,
  state,
  userId,
  edit,
  { wait = delay, logger = null } = {},
) {
  if (state.encounter?.type === "royal_blessing")
    return royalReveal.play(sessionId, state, userId, edit, { wait, logger });
  if (state.encounter?.type === "covenant_blessing")
    return covenantReveal.play(sessionId, state, userId, edit, {
      wait,
      logger,
    });
  if (
    state.encounter?.type !== "god_rngesus" ||
    !god.claimReveal(sessionId, state.floor)
  )
    return false;
  try {
    await edit(frame(state, userId, 0));
    await wait(650);
    await edit(frame(state, userId, 1));
    await wait(850);
  } catch (err) {
    // Blessing was already persisted; an animation failure must never undo it.
    logger?.warn?.({ err, sessionId }, "God of RNGesus reveal skipped");
  }
  return true;
}
module.exports = { frame, play };
