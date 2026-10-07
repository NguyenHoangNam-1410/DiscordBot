"use strict";
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { db } = require("../../db");
const { RELIC_ITEMS } = require("../itemRelics");
const relicRecords = require("../storage/relicRecords");
const godRngesus = require("../events/godRngesus");
const { godRngesusChance, formatGodChance } = require("../events/rngesus");
const { CLASSES } = require("../engine/stats");
const { formatCoins } = require("../../utils/economy");
const { AVATAR_RINGS } = require("../../services/avatarRingCatalog");
const {
  getProfileAppearance,
  ownsCosmetic,
} = require("../../services/profileCosmeticService");

const HISTORY_PAGE = 8;
const TOP_PAGE = 10;
const LIMIT = 3800; // embed description tối đa 4096 ký tự
const REASONS = Object.freeze({
  cashout: "Rút thưởng",
  summit: "Chinh phục đỉnh",
  death: "Tử trận",
  rngesus: "RNGesus",
  forfeit: "Bỏ cuộc",
});
const TABS = Object.freeze([
  { id: "overview", label: "Tổng quan", emoji: "☠️" },
  { id: "class", label: "Theo class", emoji: "🧙" },
  { id: "economy", label: "Xu và kim cương", emoji: "💰" },
  { id: "events", label: "Sự kiện và chuỗi", emoji: "🌀" },
  { id: "fights", label: "Chiến đấu", emoji: "⚔️" },
  { id: "history", label: "Lịch sử ván", emoji: "📜" },
]);

const clip = (text) =>
  text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

function gatherStats(guildId, userId) {
  const g = String(guildId);
  const u = String(userId);
  const all = (sql, ...args) => db.prepare(sql).all(g, u, ...args);
  const totals =
    db
      .prepare(
        `SELECT COUNT(*) runs, COALESCE(SUM(stake),0) staked, COALESCE(SUM(payout),0) payout,
        COALESCE(MAX(payout),0) bestPayout, COALESCE(SUM(diamonds),0) diamonds,
        COALESCE(AVG(cleared),0) avgFloor, COALESCE(MAX(turns),0) longest,
        COALESCE(SUM(CASE WHEN payout>stake THEN 1 ELSE 0 END),0) profitable
        FROM hardcore_run_archive WHERE guild_id=? AND user_id=? AND reason<>'forfeit'`,
      )
      .get(g, u) || {};
  const events =
    db
      .prepare(
        "SELECT events,chains,kills,boss_kills,kinds_json FROM hardcore_event_stats WHERE guild_id=? AND user_id=?",
      )
      .get(g, u) || {};
  return {
    totals,
    godFavor: godRngesus.favor(g, u),
    godHistory: godRngesus.history(g, u),
    relicTotals: relicRecords.totals(g, u),
    relicHistory: Object.fromEntries(
      relicRecords.IDS.map((id) => [id, relicRecords.history(g, u, id)]),
    ),
    byClass: all(
      `SELECT class_key,COUNT(*) runs,MAX(cleared) best,AVG(cleared) avg,
      SUM(CASE WHEN reason IN ('cashout','summit') THEN 1 ELSE 0 END) escapes,
      SUM(CASE WHEN reason IN ('death','rngesus') THEN 1 ELSE 0 END) deaths
      FROM hardcore_run_archive WHERE guild_id=? AND user_id=? AND reason<>'forfeit' GROUP BY class_key ORDER BY runs DESC`,
    ),
    events: {
      events: events.events || 0,
      chains: events.chains || 0,
      kills: events.kills || 0,
      bossKills: events.boss_kills || 0,
      kinds: events.kinds_json ? JSON.parse(events.kinds_json) : [],
    },
    killers: all(
      `SELECT killed_by name,COUNT(*) count FROM hardcore_run_archive
      WHERE guild_id=? AND user_id=? AND killed_by IS NOT NULL GROUP BY killed_by ORDER BY count DESC,name LIMIT 10`,
    ),
    bosses: all(
      "SELECT boss name,count FROM hardcore_boss_kills WHERE guild_id=? AND user_id=? ORDER BY count DESC,boss LIMIT 10",
    ),
    deathFloors: all(
      `SELECT cleared+1 floor,COUNT(*) count FROM hardcore_run_archive
      WHERE guild_id=? AND user_id=? AND reason IN ('death','rngesus') GROUP BY cleared ORDER BY count DESC,cleared DESC LIMIT 5`,
    ),
  };
}

function historyCount(guildId, userId) {
  return db
    .prepare(
      "SELECT COUNT(*) c FROM hardcore_run_archive WHERE guild_id=? AND user_id=?",
    )
    .get(String(guildId), String(userId)).c;
}
function historyRows(guildId, userId, page) {
  return db
    .prepare(
      `SELECT class_key,cleared,reason,stake,payout,turns,killed_by,ended_at FROM hardcore_run_archive
      WHERE guild_id=? AND user_id=? ORDER BY ended_at DESC LIMIT ? OFFSET ?`,
    )
    .all(String(guildId), String(userId), HISTORY_PAGE, page * HISTORY_PAGE);
}

function classLabel(key) {
  return CLASSES[key]?.name || key;
}

function tabEmbed(guildId, user, tab, page, overview) {
  const embed = new EmbedBuilder().setColor(0x9b59b6);
  const head = `**Người chơi:** <@${user.id}>`;
  if (tab === "overview") return overview;
  const s = gatherStats(guildId, user.id);
  const t = s.totals;
  if (tab === "class") {
    const equipped = getProfileAppearance(guildId, user.id).avatarRing;
    const lines = s.byClass.map((c) => {
      const ring = AVATAR_RINGS.find((item) => item.classKey === c.class_key);
      const reward = ring
        ? ownsCosmetic(guildId, user.id, ring.id)
          ? ring.emoji +
            " **" +
            ring.name +
            "** · " +
            (equipped?.id === ring.id
              ? "Đang trang bị"
              : "Đã sở hữu · /vatpham sudung để trang bị")
          : ring.emoji +
            " **" +
            ring.name +
            "** · " +
            (c.best >= 500
              ? "Đủ điều kiện · nhận thưởng thành tựu để mở"
              : "Mở qua thành tựu tầng 500")
        : "";
      return (
        "**" +
        classLabel(c.class_key) +
        "** — " +
        c.runs +
        " ván · cao nhất tầng **" +
        c.best +
        "** · TB " +
        Math.round(c.avg) +
        " · rút " +
        c.escapes +
        " · chết " +
        c.deaths +
        (reward ? "\n↳ " + reward : "")
      );
    });

    return embed
      .setTitle("🧙 SINH TỒN · THEO CLASS")
      .setDescription(
        clip(
          `${head}\n\n${lines.join("\n") || "Chưa có ván nào được lưu (từ bản 2.0)."}`,
        ),
      )
      .setFooter({
        text: `Class chơi nhiều nhất: ${s.byClass[0] ? classLabel(s.byClass[0].class_key) : "—"}`,
      });
  }
  if (tab === "economy") {
    const net = t.payout - t.staked;
    return embed
      .setTitle("💰 SINH TỒN · XU VÀ KIM CƯƠNG")
      .setDescription(head)
      .addFields(
        { name: "Tổng cược", value: formatCoins(t.staked), inline: true },
        { name: "Tổng nhận", value: formatCoins(t.payout), inline: true },
        {
          name: "Lãi/lỗ ròng",
          value: `${net >= 0 ? "+" : "−"}${formatCoins(Math.abs(net))}`,
          inline: true,
        },
        {
          name: "Payout lớn nhất",
          value: formatCoins(t.bestPayout),
          inline: true,
        },
        {
          name: "Kim cương kiếm được",
          value: String(t.diamonds),
          inline: true,
        },
        {
          name: "Ván có lãi",
          value: `${t.profitable}/${t.runs} (${pct(t.profitable, t.runs)})`,
          inline: true,
        },
        {
          name: "Tầng trung bình",
          value: String(Math.round(t.avgFloor)),
          inline: true,
        },
        { name: "Ván dài nhất", value: `${t.longest} lượt`, inline: true },
      );
  }
  if (tab === "events") {
    const e = s.events;
    return embed
      .setTitle("🌀 SINH TỒN · SỰ KIỆN VÀ CHUỖI")
      .setDescription(head)
      .addFields(
        {
          name: "🌟 God of RNGesus",
          value:
            "Đã gặp: **" +
            s.godFavor.blessings +
            "** lần · Tỷ lệ hiện tại: **" +
            formatGodChance(
              godRngesusChance(s.godFavor.deaths_since_blessing),
            ) +
            "**\n" +
            (s.godHistory.length
              ? s.godHistory
                  .map(
                    (h) =>
                      "Tầng " +
                      h.floor +
                      " · **" +
                      formatGodChance(h.chance) +
                      "** · <t:" +
                      Math.floor(h.encountered_at / 1000) +
                      ":d>",
                  )
                  .join("\n")
              : "Chưa được ban phước."),
        },
        ...relicRecords.IDS.map((id) => ({
          name: "💠 " + RELIC_ITEMS[id].name + " [LR]",
          value:
            "Đã lưu: **" +
            s.relicTotals[id] +
            "** lần" +
            (s.relicTotals[id] === 0 && e.kinds.includes(id)
              ? "\nĐã hoàn thành trong run cũ; chưa có thời điểm/số lần đầy đủ."
              : "") +
            (s.relicHistory[id].length
              ? "\n" +
                s.relicHistory[id]
                  .map(
                    (h) =>
                      "Tầng " +
                      h.floor +
                      " · " +
                      classLabel(h.class_key) +
                      " · " +
                      (h.acquired_at == null
                        ? "Run cũ, chưa có thời điểm"
                        : "<t:" + Math.floor(h.acquired_at / 1000) + ":d>"),
                  )
                  .join("\n")
              : ""),
        })),
        { name: "Sự kiện đã gặp", value: String(e.events), inline: true },
        { name: "Chuỗi kích hoạt", value: String(e.chains), inline: true },
        { name: "Loại sự kiện", value: String(e.kinds.length), inline: true },
        {
          name: "Đã gặp",
          value: e.kinds.length
            ? e.kinds
                .map((k) => `\`${k}\``)
                .join(" ")
                .slice(0, 1000)
            : "Chưa có.",
        },
      );
  }
  if (tab === "fights") {
    const killers =
      s.killers
        .map((k, i) => `${i + 1}. ${k.name} — ${k.count} lần`)
        .join("\n") || "Chưa tử trận ván nào.";
    const bosses =
      s.bosses
        .map((b, i) => `${i + 1}. ${b.name} — ${b.count} lần`)
        .join("\n") || "Chưa hạ boss nào.";
    const floors =
      s.deathFloors.map((f) => `Tầng ${f.floor}: ${f.count} lần`).join(" · ") ||
      "—";
    return embed
      .setTitle("⚔️ SINH TỒN · CHIẾN ĐẤU")
      .setDescription(head)
      .addFields(
        { name: "Quái đã hạ", value: String(s.events.kills), inline: true },
        { name: "Boss đã hạ", value: String(s.events.bossKills), inline: true },
        {
          name: "Tử trận",
          value: String(s.byClass.reduce((n, c) => n + c.deaths, 0)),
          inline: true,
        },
        { name: "Kẻ hạ gục bạn nhiều nhất", value: killers.slice(0, 1000) },
        { name: "Boss đã hạ", value: bosses.slice(0, 1000) },
        { name: "Tầng hay chết nhất", value: floors },
      );
  }
  // history
  const total = historyCount(guildId, user.id);
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE));
  const rows = historyRows(guildId, user.id, Math.min(page, pages - 1));
  const lines = rows.map(
    (r) =>
      `<t:${Math.floor(r.ended_at / 1000)}:d> **${classLabel(r.class_key)}** · tầng ${r.cleared} · ${REASONS[r.reason] || r.reason}` +
      ` · cược ${formatCoins(r.stake)} → ${formatCoins(r.payout)} · ${r.turns} lượt${r.killed_by ? ` · bởi ${r.killed_by}` : ""}`,
  );
  return embed
    .setTitle("📜 SINH TỒN · LỊCH SỬ VÁN")
    .setDescription(
      clip(
        `${head}\n\n${lines.join("\n") || "Chưa có ván nào được lưu (từ bản 2.0)."}`,
      ),
    )
    .setFooter({
      text: `Trang ${Math.min(page, pages - 1) + 1}/${pages} · ${total} ván`,
    });
}

function pagerRow(prefix, ids, page, pages) {
  const id = (suffix) => `${prefix}:${ids}:${page}:${suffix}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id("prev"))
      .setLabel("Trước")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`${prefix}info:${ids}`)
      .setLabel(`Trang ${page + 1}/${pages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(id("next"))
      .setLabel("Sau")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );
}

function profilePayload(guildId, viewerId, user, tab, page, overview) {
  const selected = TABS.find((t) => t.id === tab) || TABS[0];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`hardcore-hoso:${viewerId}:${user.id}`)
    .setPlaceholder("Chọn mục thống kê…")
    .addOptions(
      TABS.map((t) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(t.label)
          .setValue(t.id)
          .setEmoji(t.emoji)
          .setDefault(t.id === selected.id),
      ),
    );
  const components = [new ActionRowBuilder().addComponents(menu)];
  let safePage = 0;
  if (selected.id === "history") {
    const pages = Math.max(
      1,
      Math.ceil(historyCount(guildId, user.id) / HISTORY_PAGE),
    );
    safePage = Math.min(Math.max(0, page), pages - 1);
    if (pages > 1)
      components.push(
        pagerRow("hardcore-hosopg", `${viewerId}:${user.id}`, safePage, pages),
      );
  }
  return {
    embeds: [tabEmbed(guildId, user, selected.id, safePage, overview)],
    components,
  };
}

// ---- Xếp hạng theo class có phân trang ----
function topRows(guildId, classKey) {
  if (classKey === "all")
    return require("../storage/sessions").getTop(guildId, 100);
  return db
    .prepare(
      `SELECT user_id,MAX(cleared) best_floor,COUNT(*) runs,
      SUM(CASE WHEN reason IN ('cashout','summit') THEN 1 ELSE 0 END) escapes
      FROM hardcore_run_archive WHERE guild_id=? AND class_key=? AND reason<>'forfeit'
      GROUP BY user_id ORDER BY best_floor DESC,escapes DESC LIMIT 100`,
    )
    .all(String(guildId), classKey);
}
function topPayload(guildId, viewerId, classKey, page) {
  if (classKey !== "all" && !Object.hasOwn(CLASSES, classKey)) classKey = "all";
  const rows = topRows(guildId, classKey);
  const pages = Math.max(1, Math.ceil(rows.length / TOP_PAGE));
  page = Math.min(Math.max(0, page), pages - 1);
  const slice = rows.slice(page * TOP_PAGE, (page + 1) * TOP_PAGE);
  const body = slice.length
    ? slice
        .map(
          (r, i) =>
            `**${page * TOP_PAGE + i + 1}.** <@${r.user_id}> — tầng **${r.best_floor}**${classKey === "all" ? ` · hoàn thành ${r.completions}` : ` · ${r.runs} ván`}`,
        )
        .join("\n")
    : "Chưa có thành tích.";
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`hardcore-top:${viewerId}`)
    .setPlaceholder("Lọc theo class…")
    .addOptions(
      [
        { id: "all", name: "Tất cả class" },
        ...Object.entries(CLASSES).map(([id, c]) => ({ id, name: c.name })),
      ].map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.name)
          .setValue(c.id)
          .setDefault(c.id === classKey),
      ),
    );
  const components = [new ActionRowBuilder().addComponents(menu)];
  if (pages > 1)
    components.push(
      pagerRow("hardcore-toppg", `${viewerId}:${classKey}`, page, pages),
    );
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(
          `🏆 SINH TỒN · TOP TẦNG${classKey === "all" ? "" : ` · ${CLASSES[classKey].name}`}`,
        )
        .setDescription(clip(body))
        .setFooter({
          text: `Trang ${page + 1}/${pages} · xếp theo tầng đã vượt cao nhất`,
        }),
    ],
    components,
  };
}

const deny = (interaction) =>
  interaction.reply({
    content: "Chỉ người mở bảng mới điều khiển được.",
    flags: MessageFlags.Ephemeral,
  });

module.exports = {
  TABS,
  HISTORY_PAGE,
  TOP_PAGE,
  gatherStats,
  profilePayload,
  topPayload,
  async handleSelect(interaction, buildOverview, fetchUser) {
    const [, viewer, target] = interaction.customId.split(":");
    if (interaction.user.id !== viewer) return deny(interaction);
    const user = await fetchUser(target);
    return interaction.update(
      profilePayload(
        interaction.guildId,
        viewer,
        user,
        interaction.values[0],
        0,
        buildOverview(user),
      ),
    );
  },
  async handlePage(interaction, buildOverview, fetchUser) {
    const [, viewer, target, page, dir] = interaction.customId.split(":");
    if (interaction.user.id !== viewer) return deny(interaction);
    const user = await fetchUser(target);
    const next = Number(page) + (dir === "next" ? 1 : -1);
    return interaction.update(
      profilePayload(
        interaction.guildId,
        viewer,
        user,
        "history",
        next,
        buildOverview(user),
      ),
    );
  },
  async handleTopSelect(interaction) {
    const [, viewer] = interaction.customId.split(":");
    if (interaction.user.id !== viewer) return deny(interaction);
    return interaction.update(
      topPayload(interaction.guildId, viewer, interaction.values[0], 0),
    );
  },
  async handleTopPage(interaction) {
    const [, viewer, classKey, page, dir] = interaction.customId.split(":");
    if (interaction.user.id !== viewer) return deny(interaction);
    return interaction.update(
      topPayload(
        interaction.guildId,
        viewer,
        classKey,
        Number(page) + (dir === "next" ? 1 : -1),
      ),
    );
  },
};
