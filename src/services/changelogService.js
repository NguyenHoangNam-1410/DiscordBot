const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const PAGE_SIZE = 3;
const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function validTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function validateEntries(entries) {
  if (!Array.isArray(entries))
    throw new Error("Changelog phải là một danh sách.");
  const ids = new Set();
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id) ||
      ids.has(entry.id)
    )
      throw new Error("ID changelog không hợp lệ hoặc bị trùng.");
    ids.add(entry.id);
    if (!validTimestamp(entry.updatedAt) || !validTimestamp(entry.auditedAt))
      throw new Error("Changelog cần thời gian cập nhật và audit có múi giờ.");
    if (Date.parse(entry.auditedAt) < Date.parse(entry.updatedAt))
      throw new Error("Thời gian audit không thể trước thời gian cập nhật.");
    if (
      typeof entry.title !== "string" ||
      !entry.title.trim() ||
      entry.title.length > 100
    )
      throw new Error("Tiêu đề changelog cần có nội dung, tối đa 100 ký tự.");
    if (
      !Array.isArray(entry.changes) ||
      !entry.changes.length ||
      entry.changes.some(
        (change) => typeof change !== "string" || !change.trim(),
      ) ||
      entry.changes.map((change) => "• " + change).join("\n").length > 1024
    )
      throw new Error(
        "Nội dung mỗi bản cập nhật cần có nội dung, tối đa 1.024 ký tự.",
      );
    if (entry.commit !== undefined && !/^[a-f0-9]{40}$/.test(entry.commit))
      throw new Error("Commit audit phải là SHA đầy đủ.");
  }
  return entries;
}

function sortedEntries(entries) {
  return [...validateEntries(entries)].sort(
    (a, b) =>
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
      b.id.localeCompare(a.id),
  );
}

const entries = sortedEntries(require("../changelog.json"));

function changelogPanel(userId, requestedPage = 0, source = entries) {
  const ordered = sortedEntries(source);
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const numericPage = Number(requestedPage);
  const page = Number.isSafeInteger(numericPage)
    ? Math.max(0, Math.min(pages - 1, numericPage))
    : 0;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 LỊCH SỬ CẬP NHẬT")
    .setDescription(
      ordered.length
        ? "Mới nhất trước · Thời gian Việt Nam (UTC+7)."
        : "Chưa có bản cập nhật nào.",
    )
    .setFooter({
      text:
        "Trang " +
        (page + 1) +
        "/" +
        pages +
        " · " +
        ordered.length +
        " bản cập nhật",
    });
  for (const entry of ordered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    embed.addFields({
      name: dateFormat.format(new Date(entry.updatedAt)) + " · " + entry.title,
      value: entry.changes.map((change) => "• " + change).join("\n"),
    });
  }
  const components = [];
  if (pages > 1) {
    const button = (action, label, target, disabled) =>
      new ButtonBuilder()
        .setCustomId("changelog:" + userId + ":" + target + ":" + action)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    components.push(
      new ActionRowBuilder().addComponents(
        button("first", "Mới nhất", 0, page === 0),
        button("prev", "Trước", Math.max(0, page - 1), page === 0),
        button(
          "next",
          "Sau",
          Math.min(pages - 1, page + 1),
          page === pages - 1,
        ),
        button("last", "Cũ nhất", pages - 1, page === pages - 1),
      ),
    );
  }
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

async function handleChangelogButton(interaction) {
  const match = /^changelog:(\d{1,20}):(\d{1,8}):(first|prev|next|last)$/.exec(
    interaction.customId,
  );
  if (!match) {
    return interaction.reply({
      content: "Nút chuyển trang không hợp lệ.",
      flags: MessageFlags.Ephemeral,
    });
  }
  if (match[1] !== interaction.user.id) {
    return interaction.reply({
      content: "Hãy dùng /changelog để mở lịch sử cập nhật của bạn.",
      flags: MessageFlags.Ephemeral,
    });
  }
  return interaction.update(changelogPanel(match[1], Number(match[2])));
}

module.exports = {
  PAGE_SIZE,
  entries,
  validTimestamp,
  validateEntries,
  sortedEntries,
  changelogPanel,
  handleChangelogButton,
};
