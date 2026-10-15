"use strict";
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const characters = require("../characters");
const stats = require("../engine/stats");
const { E, SKILL_ICONS } = require("../shared/icons");
const { appEmoji } = require("../../utils/appEmoji");
const { splitRuleFields } = require("./rulePages");
const PAGE_SIZE = 12;
const TABS = ["stats", "skills", "souls"];
const icon = (c) => appEmoji("class_" + c.classKey, "👤");
const number = (n) => Number(Number(n).toFixed(1)).toLocaleString("vi-VN");
const pct = (n) => number(n * 100) + "%";
const row = (component) => new ActionRowBuilder().addComponents(component);
function payload(
  owner,
  {
    rarity = "all",
    classKey = "all",
    page = 0,
    id = "all",
    tab = "stats",
  } = {},
) {
  if (
    !(rarity === "all" || characters.RARITIES.includes(rarity)) ||
    !(classKey === "all" || Object.hasOwn(stats.CLASSES, classKey)) ||
    !TABS.includes(tab)
  )
    throw Error("INVALID_CHARACTER_FILTER");
  const filtered = characters.list({ rarity, classKey });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.max(
    0,
    Math.min(pages - 1, Number.isSafeInteger(page) ? page : 0),
  );
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selected = filtered.find((c) => c.id === id);
  id = selected?.id || "all";
  const owned = characters.ownedCharacters();
  const custom = (kind) =>
    ["hardcore-char", owner, rarity, classKey, page, id, tab, kind].join(":");
  const menu = (kind, placeholder, options, disabled = false) =>
    row(
      new StringSelectMenuBuilder()
        .setCustomId(custom(kind))
        .setPlaceholder(placeholder)
        .setDisabled(disabled)
        .addOptions(options),
    );
  const components = [
    menu(
      "rarity",
      "Lọc độ hiếm",
      ["all", ...characters.RARITIES].map((value) => ({
        label: value === "all" ? "Tất cả độ hiếm" : value,
        value,
        default: value === rarity,
      })),
    ),
    menu(
      "class",
      "Lọc class",
      ["all", ...Object.keys(stats.CLASSES)].map((value) => ({
        label: value === "all" ? "Tất cả class" : stats.CLASSES[value].name,
        value,
        default: value === classKey,
      })),
    ),
    menu(
      "character",
      "Chọn nhân vật để xem chi tiết",
      visible.length
        ? visible.map((c) => ({
            label: c.name,
            value: c.id,
            description:
              c.rarity +
              " · " +
              stats.CLASSES[c.classKey].name +
              " · " +
              (owned[c.id]
                ? "Đã sở hữu · S" + owned[c.id].soulLevel
                : "Chưa sở hữu"),
            default: c.id === id,
          }))
        : [{ label: "Không có nhân vật phù hợp", value: "none" }],
      !visible.length,
    ),
  ];
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("SINH TỒN · NHÂN VẬT");
  if (!selected) {
    embed.setDescription(
      "**" +
        Object.keys(owned).length +
        " nhân vật đã sở hữu** · 7 nhân vật khởi đầu **SR · S0**.\nChọn nhân vật để xem chỉ số, kỹ năng và tinh hồn.",
    );
    if (!visible.length)
      embed.addFields({
        name: "Danh sách",
        value: "Chưa có nhân vật thuộc bộ lọc này.",
      });
    else
      embed.addFields(
        visible.map((c) => ({
          name: icon(c) + " " + c.name + " [" + c.rarity + "]",
          value:
            stats.CLASSES[c.classKey].name +
            " · " +
            (owned[c.id]
              ? "S" + owned[c.id].soulLevel + " · Đã sở hữu"
              : "Chưa sở hữu") +
            "\n" +
            c.role,
        })),
      );
  } else {
    const state = characters.preview(id);
    embed
      .setTitle(
        icon(selected) + " " + selected.name + " [" + selected.rarity + "]",
      )
      .setDescription(
        "Class **" +
          stats.CLASSES[selected.classKey].name +
          "** · " +
          (owned[id]
            ? "Đã sở hữu · **S" + owned[id].soulLevel + "**"
            : "Chưa sở hữu") +
          "\n" +
          selected.role,
      );
    const fields = [];
    if (tab === "stats") {
      fields.push({
        name: "Chỉ số khởi đầu · S0",
        value:
          E.hp +
          " **" +
          number(state.maxHp) +
          "** · " +
          E.mana +
          " **" +
          number(state.maxMana) +
          "**\n" +
          E.str +
          " STR **" +
          number(state.str) +
          "** · " +
          E.dex +
          " DEX **" +
          number(state.dex) +
          "** · " +
          E.vit +
          " VIT **" +
          number(state.vit) +
          "** · " +
          E.ene +
          " ENE **" +
          number(state.ene) +
          "**\n" +
          E.attack +
          " Vật lý **" +
          state.damageMin +
          "–" +
          state.damageMax +
          "** · " +
          E.magic +
          " Phép **" +
          state.spellMin +
          "–" +
          state.spellMax +
          "**\n" +
          E.defense +
          " DEF **" +
          number(state.defense) +
          "** · " +
          E.res +
          " RES **" +
          number(state.resistance) +
          "%** · " +
          E.luck +
          " LUCK **" +
          number(state.luck) +
          "**\n" +
          E.accuracy +
          " ACC **" +
          number(state.accuracy) +
          "** · " +
          E.evasion +
          " EVA **" +
          number(state.evasion) +
          "** · " +
          E.crit +
          " CRIT **" +
          pct(state.critChance) +
          "**\nKhông gồm trang bị, Rift, buff sự kiện hoặc tiến trình run.",
      });
      fields.push({
        name: "Mastery · quy đổi thuộc tính",
        value: require("../shared/statsV3").description(state, E),
      });
    } else if (tab === "skills") {
      const preview = require("./index").setupPreview(selected.classKey);
      fields.push({
        name:
          SKILL_ICONS[selected.classKey] +
          " " +
          stats.CLASSES[selected.classKey].skill,
        value: preview.skill,
      });
      fields.push({
        name: "Nội tại · từ tầng 1",
        value: require("../innate").description(state),
      });
      state.floor = 100;
      state.encounter = { type: "combat", rank: "boss", hp: 0 };
      require("../awakening").grant(state, state.encounter);
      fields.push({
        name: "Thức tỉnh · sau khi hạ boss tầng 100",
        value: require("../awakening").description(state),
      });
    } else {
      fields.push({
        name: owned[id] ? "S0 · Đang sở hữu" : "S0 · Bộ kỹ năng cơ bản",
        value:
          "Bộ kỹ năng hiện tại. Các bậc cộng dồn, nâng theo thứ tự S1 → S6.",
      });
      fields.push(
        ...selected.souls.map((s) => ({
          name: "🔒 S" + s.level + " · " + s.name,
          value: s.description,
        })),
      );
      fields.push({
        name: "Tinh hồn · bản thiết kế",
        value:
          "S1–S6 chưa mở nâng cấp. Mục tiêu S6: **30–35%** hoàn thành tầng 999 cho từng nhân vật; chưa kiểm chứng bằng simulate. Sức mạnh mỗi bậc có thể thay đổi khi cân bằng.",
      });
    }
    embed.addFields(splitRuleFields(fields));
    components.push(
      new ActionRowBuilder().addComponents(
        TABS.map((t) =>
          new ButtonBuilder()
            .setCustomId(custom("tab_" + t))
            .setLabel(
              { stats: "Chỉ số", skills: "Kỹ năng", souls: "Tinh hồn" }[t],
            )
            .setStyle(t === tab ? ButtonStyle.Primary : ButtonStyle.Secondary),
        ),
      ),
    );
  }
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(custom("prev"))
        .setLabel("Trước")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(custom("overview"))
        .setLabel("Tổng quan")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!selected),
      new ButtonBuilder()
        .setCustomId(custom("next"))
        .setLabel("Sau")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= pages - 1),
    ),
  );
  embed.setFooter({
    text:
      "Trang " +
      (page + 1) +
      "/" +
      pages +
      " · " +
      filtered.length +
      " nhân vật phù hợp",
  });
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}
async function handle(interaction) {
  const parts = interaction.customId.split(":");
  const [, owner, rarity, classKey, rawPage, id, tab, kind] = parts;
  const reject = (content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (owner !== interaction.user.id)
    return reject("Chỉ người mở bảng nhân vật mới có thể thao tác.");
  const page = Number(rawPage);
  if (
    parts[0] !== "hardcore-char" ||
    parts.length !== 8 ||
    !(rarity === "all" || characters.RARITIES.includes(rarity)) ||
    !(classKey === "all" || Object.hasOwn(stats.CLASSES, classKey)) ||
    !/^\d+$/.test(rawPage) ||
    !Number.isSafeInteger(page) ||
    !TABS.includes(tab)
  )
    return reject("Bảng nhân vật không hợp lệ. Mở lại /sinhton nhanvat.");
  const filtered = characters.list({ rarity, classKey });
  if (
    page >= Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) ||
    (id !== "all" && !filtered.some((c) => c.id === id))
  )
    return reject("Danh sách đã thay đổi. Mở lại /sinhton nhanvat.");
  const state = { rarity, classKey, page, id, tab };
  if (["rarity", "class", "character"].includes(kind)) {
    if (interaction.values?.length !== 1)
      return reject("Lựa chọn nhân vật không hợp lệ.");
    const value = interaction.values[0];
    if (
      kind === "rarity" &&
      (value === "all" || characters.RARITIES.includes(value))
    )
      Object.assign(state, { rarity: value, page: 0, id: "all" });
    else if (
      kind === "class" &&
      (value === "all" || Object.hasOwn(stats.CLASSES, value))
    )
      Object.assign(state, { classKey: value, page: 0, id: "all" });
    else if (
      kind === "character" &&
      filtered
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .some((c) => c.id === value)
    )
      Object.assign(state, { id: value, tab: "stats" });
    else return reject("Lựa chọn không thuộc danh sách hiện tại.");
  } else if (kind === "overview") state.id = "all";
  else if (kind === "prev" && page > 0)
    Object.assign(state, { page: page - 1, id: "all" });
  else if (kind === "next" && (page + 1) * PAGE_SIZE < filtered.length)
    Object.assign(state, { page: page + 1, id: "all" });
  else if (
    kind.startsWith("tab_") &&
    id !== "all" &&
    TABS.includes(kind.slice(4))
  )
    state.tab = kind.slice(4);
  else return reject("Thao tác nhân vật không hợp lệ.");
  return interaction.update(payload(owner, state));
}
module.exports = { PAGE_SIZE, payload, handle };
