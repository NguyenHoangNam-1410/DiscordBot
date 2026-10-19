"use strict";
const { MessageFlags } = require("discord.js");
const { requireGameChannel } = require("../../utils/gameChannel");
const beta = require("../beta");
async function open(interaction) {
  if (!(await requireGameChannel(interaction, "hardcore"))) return null;
  const runtime = require("./index");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let run = runtime.getHardcoreRun(interaction.guildId, interaction.user.id),
    created = false;
  if (run && !beta.is(run.state))
    return interaction.editReply({
      content:
        "Bạn đang có run Sinh tồn thật. Hãy kết thúc run đó trước khi dùng /sinhton beta.",
    });
  if (!run) {
    try {
      run = runtime.startHardcore({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        beta: true,
        playerName:
          interaction.member?.displayName ||
          interaction.user.globalName ||
          interaction.user.username ||
          interaction.user.id,
      });
      created = true;
    } catch (error) {
      if (error.message === "ACTIVE_SESSION")
        return interaction.editReply({
          content:
            "Bạn đã có run đang diễn ra. Dùng /sinhton tieptuc để mở lại.",
        });
      throw error;
    }
  }
  return runtime.withHardcoreSession(run.session.id, async () => {
    const current = runtime.getHardcoreRun(
      interaction.guildId,
      interaction.user.id,
    );
    if (!current || current.session.id !== run.session.id)
      return interaction.editReply({
        content: "Run beta đã kết thúc; dùng /sinhton beta để mở run mới.",
      });
    if (current.session.channel_id !== interaction.channelId)
      return interaction.editReply({
        content: "Hãy tiếp tục beta trong kênh Sinh tồn nơi bạn đã bắt đầu.",
      });
    let message;
    try {
      message = await interaction.channel.send({
        embeds: [
          runtime.hardcoreEmbed(
            current.state,
            interaction.user.id,
            null,
            current.session.id,
          ),
        ],
        components: runtime.hardcoreRows(current.session.id, current.state),
        allowedMentions: { parse: [] },
      });
      runtime.setMessageId(current.session.id, message.id);
    } catch (error) {
      if (created)
        runtime.forceEndHardcoreSession(
          current.session.id,
          interaction.guildId,
          interaction.user.id,
          { label: "beta-ui-failed" },
        );
      if (message) await message.edit({ components: [] }).catch(() => {});
      throw error;
    }
    if (current.session.message_id) {
      const previous = await interaction.channel.messages
        .fetch(current.session.message_id)
        .catch(() => null);
      if (previous) await previous.edit({ components: [] }).catch(() => {});
    }
    return interaction.editReply({
      content:
        "Đã mở **Rha-Kor · SSR · S0 — BETA**. Cược giả lập 100.000 xu; không tốn cược, không nhận thưởng tài khoản. Tử trận có nút hồi sinh 100% HP.",
    });
  });
}
module.exports = { open };
