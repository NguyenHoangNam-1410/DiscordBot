const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");

const PAGE_SIZE = 3;
// Loại thay đổi và đối tượng (trò chơi / hệ thống) dùng để lọc lịch sử cập nhật.
const TYPES = Object.freeze({
  feature: { label: "Tính năng", icon: "✨" },
  fix: { label: "Sửa lỗi", icon: "🐛" },
  balance: { label: "Điều chỉnh", icon: "⚖️" },
  improvement: { label: "Cải thiện", icon: "🎨" },
  maintenance: { label: "Bảo trì", icon: "🔧" },
});
const SCOPES = Object.freeze({
  survival: "Sinh tồn",
  tower: "Tháp Định Mệnh",
  blackjack: "Xì dách",
  poker: "Poker",
  coquay: "Cò quay Nga",
  taixiu: "Tài Xỉu",
  baucua: "Bầu cua",
  mines: "Mines",
  chinchiro: "Chinchiro",
  horse: "Đua ngựa",
  vuatiengviet: "Vua Tiếng Việt",
  game2048: "2048",
  chatbot: "Chatbot",
  profile: "Hồ sơ",
  system: "Hệ thống",
});
const TYPE_KEYS = Object.freeze(Object.keys(TYPES));
const SCOPE_KEYS = Object.freeze(Object.keys(SCOPES));
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
    if (!Object.hasOwn(TYPES, entry.type))
      throw new Error("Loại thay đổi changelog không hợp lệ.");
    if (!Object.hasOwn(SCOPES, entry.scope))
      throw new Error("Đối tượng thay đổi changelog không hợp lệ.");
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

const filterIndex = (keys, value) => (value ? keys.indexOf(value) + 1 : 0);
const filterKey = (keys, index) => (index > 0 ? keys[index - 1] || null : null);
const customId = (userId, page, action, filter) =>
  "changelog:" +
  userId +
  ":" +
  page +
  ":" +
  action +
  ":" +
  filterIndex(TYPE_KEYS, filter.type) +
  ":" +
  filterIndex(SCOPE_KEYS, filter.scope);

function changelogPanel(
  userId,
  requestedPage = 0,
  source = entries,
  filter = {},
) {
  const active = {
    type: Object.hasOwn(TYPES, filter?.type) ? filter.type : null,
    scope: Object.hasOwn(SCOPES, filter?.scope) ? filter.scope : null,
  };
  const ordered = sortedEntries(source).filter(
    (entry) =>
      (!active.type || entry.type === active.type) &&
      (!active.scope || entry.scope === active.scope),
  );
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const numericPage = Number(requestedPage);
  const page = Number.isSafeInteger(numericPage)
    ? Math.max(0, Math.min(pages - 1, numericPage))
    : 0;
  const filterText =
    active.type || active.scope
      ? "\nBộ lọc: " +
        [
          active.type ? "Loại **" + TYPES[active.type].label + "**" : null,
          active.scope ? "Đối tượng **" + SCOPES[active.scope] + "**" : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 LỊCH SỬ CẬP NHẬT")
    .setDescription(
      (ordered.length
        ? "Mới nhất trước · Thời gian Việt Nam (UTC+7)."
        : filterText
          ? "Không có bản cập nhật nào khớp bộ lọc."
          : "Chưa có bản cập nhật nào.") + filterText,
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
    const type = TYPES[entry.type];
    embed.addFields({
      name:
        dateFormat.format(new Date(entry.updatedAt)) +
        " · " +
        type.icon +
        " " +
        type.label +
        " · " +
        SCOPES[entry.scope] +
        " · " +
        entry.title,
      value: entry.changes.map((change) => "• " + change).join("\n"),
    });
  }
  const select = (action, placeholder, options, current) =>
    new StringSelectMenuBuilder()
      .setCustomId(customId(userId, 0, action, active))
      .setPlaceholder(placeholder)
      .addOptions(
        [{ value: "all", label: "Tất cả", icon: "" }, ...options].map((o) => ({
          label: o.label,
          value: o.value,
          default: (current || "all") === o.value,
          ...(o.icon ? { emoji: { name: o.icon } } : {}),
        })),
      );
  const components = [
    new ActionRowBuilder().addComponents(
      select(
        "type",
        "Lọc theo loại thay đổi",
        TYPE_KEYS.map((key) => ({
          value: key,
          label: TYPES[key].label,
          icon: TYPES[key].icon,
        })),
        active.type,
      ),
    ),
    new ActionRowBuilder().addComponents(
      select(
        "scope",
        "Lọc theo đối tượng (trò chơi / hệ thống)",
        SCOPE_KEYS.map((key) => ({ value: key, label: SCOPES[key] })),
        active.scope,
      ),
    ),
  ];
  if (pages > 1) {
    const button = (action, label, target, disabled) =>
      new ButtonBuilder()
        .setCustomId(customId(userId, target, action, active))
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
  const match =
    /^changelog:(\d{1,20}):(\d{1,8}):(first|prev|next|last|type|scope)(?::(\d{1,2}):(\d{1,2}))?$/.exec(
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
  const filter = {
    type: filterKey(TYPE_KEYS, Number(match[4] || 0)),
    scope: filterKey(SCOPE_KEYS, Number(match[5] || 0)),
  };
  if (match[3] === "type" || match[3] === "scope") {
    const value = interaction.values?.length === 1 ? interaction.values[0] : "";
    const keys = match[3] === "type" ? TYPES : SCOPES;
    if (value !== "all" && !Object.hasOwn(keys, value))
      return interaction.reply({
        content: "Bộ lọc không hợp lệ.",
        flags: MessageFlags.Ephemeral,
      });
    filter[match[3]] = value === "all" ? null : value;
    return interaction.update(changelogPanel(match[1], 0, entries, filter));
  }
  return interaction.update(
    changelogPanel(match[1], Number(match[2]), entries, filter),
  );
}

module.exports = {
  PAGE_SIZE,
  TYPES,
  SCOPES,
  TYPE_KEYS,
  SCOPE_KEYS,
  entries,
  validTimestamp,
  validateEntries,
  sortedEntries,
  changelogPanel,
  handleChangelogButton,
};
