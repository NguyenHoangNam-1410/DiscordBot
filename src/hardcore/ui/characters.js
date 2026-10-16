"use strict";
const soulTuning = require("../characters/soulTuning.json");
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
const { E, SKILL_ICONS, soulIcon } = require("../shared/icons");
const { appEmoji, appEmojiObject } = require("../../utils/appEmoji");
const { splitRuleFields } = require("./rulePages");
const PAGE_SIZE = 12;
const TABS = ["stats", "skills", "souls"];
const icon = (c) =>
  appEmoji("class_" + c.profileKey, c.id === "venance" ? "🔮" : "👤");
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
    !(classKey === "all" || Object.hasOwn(characters.CLASSES, classKey)) ||
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
  const owned = characters.ownedCharacters(owner);
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
      ["all", ...Object.keys(characters.CLASSES)].map((value) => ({
        label:
          value === "all" ? "Tất cả class" : characters.CLASSES[value].name,
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
              characters.CLASSES[c.classKey].name +
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
            characters.CLASSES[c.classKey].name +
            " · " +
            (owned[c.id]
              ? "S" + owned[c.id].soulLevel + " · Đã sở hữu"
              : "Chưa sở hữu") +
            "\n" +
            c.role,
        })),
      );
  } else {
    const state = characters.preview(
      id,
      owned[id]?.soulLevel || 0,
      owned[id]?.rarity,
    );
    embed
      .setTitle(
        icon(selected) +
          " " +
          selected.name +
          " [" +
          (owned[id]?.rarity || selected.rarity) +
          "]",
      )
      .setDescription(
        "Class **" +
          characters.CLASSES[selected.classKey].name +
          "** · " +
          (owned[id]
            ? "Đã sở hữu · **S" + owned[id].soulLevel + "**"
            : "Chưa sở hữu") +
          "\n" +
          "Ưu tiên **" +
          characters.CLASSES[selected.classKey].build +
          "** · " +
          selected.role,
      );
    const fields = [];
    if (tab === "stats") {
      fields.push({
        name: "Chỉ số khởi đầu · S" + (owned[id]?.soulLevel || 0),
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
      const preview = require("./index").setupPreview(selected.profileKey);
      fields.push({
        name:
          SKILL_ICONS[selected.profileKey] +
          " " +
          stats.CLASSES[selected.profileKey].skill,
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
        name: owned[id]
          ? "S" + owned[id].soulLevel + " · Đang sở hữu"
          : "S0 · Bộ kỹ năng cơ bản",
        value:
          "Bộ kỹ năng hiện tại. Các bậc cộng dồn, nâng theo thứ tự S1 → S6.",
      });
      fields.push(
        ...selected.souls.map((s) => ({
          name:
            ((owned[id]?.soulLevel || 0) >= s.level ? "✅" : "🔒") +
            " S" +
            s.level +
            " · " +
            soulIcon(selected, s.level) +
            " " +
            s.name,
          value:
            s.description +
            (s.level === 6 &&
            soulTuning.bossMultipliers[selected.profileKey] !== 1
              ? "\n" +
                E.attack +
                " DMG Tấn công/Skill lên boss +" +
                number(
                  (soulTuning.bossMultipliers[selected.profileKey] - 1) * 100,
                ) +
                "% (gồm hit phụ; không tăng sát thương cố định từ cơ chế boss)."
              : ""),
        })),
      );
      fields.push({
        name: "Tinh hồn · cơ chế chiến đấu",
        value:
          "S1–S6 đã có hiệu ứng chiến đấu; tài khoản khởi đầu S0. Nâng cấp chỉ áp dụng cho run mới." +
          (owned[id]
            ? "\nThẻ " +
              selected.name +
              ": **" +
              require("../characters/progression").cards(owner, selected.id) +
              "** · " +
              (owned[id].soulLevel >= 6
                ? "Đã đạt S6. Thẻ SSR dùng làm cọc nâng độ hiếm cùng class; không nâng tinh hồn nhân vật khác."
                : "Cần **" +
                  require("../characters/progression").SOUL_COST[
                    selected.rarity
                  ] +
                  " thẻ** để lên S" +
                  (owned[id].soulLevel + 1) +
                  ".")
            : ""),
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
  if (selected && owned[id]) {
    const p = require("../characters/progression"),
      n = owned[id].soulLevel,
      cost = p.SOUL_COST[selected.rarity];
    const upgradeButton = new ButtonBuilder()
      .setCustomId(custom("upgrade_" + n))
      .setLabel(
        n >= 6 ? "Đã đạt S6" : "Nâng S" + (n + 1) + " · " + cost + " thẻ",
      )
      .setStyle(ButtonStyle.Success)
      .setDisabled(n >= 6 || !cost || p.cards(owner, selected.id) < cost);
    const next =
      selected.rarity === "SSR" && n === 6 && p.nextRarity(owned[id].rarity);
    if (next)
      upgradeButton
        .setCustomId(custom("ascend_" + owned[id].rarity))
        .setLabel("Nâng " + next + " · 2 cọc thẻ")
        .setDisabled(false);
    const legacy = p.legacyCards(owner, selected.classKey, selected.rarity);
    if (legacy)
      embed.addFields({
        name: "Thẻ cũ chờ đối soát",
        value:
          number(legacy) +
          " thẻ chưa xác định được nhân vật; được giữ riêng, chưa dùng nâng cấp.",
      });
    const soulEmoji = appEmojiObject(selected.souls[Math.min(n, 5)].emojiName);
    if (soulEmoji) upgradeButton.setEmoji(soulEmoji);
    components.at(-1).addComponents(upgradeButton);
  }
  if (require("../characters/progression").account(owner))
    components
      .at(-1)
      .addComponents(
        new ButtonBuilder()
          .setCustomId(custom("gacha"))
          .setLabel("Banner gacha")
          .setStyle(ButtonStyle.Secondary),
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
function ascensionPayload(owner, state, expectedRarity) {
  const p = require("../characters/progression"),
    c = characters.get(state.id),
    owned = p.getOwned(owner)[state.id];
  if (
    !c ||
    c.rarity !== "SSR" ||
    owned?.soulLevel !== 6 ||
    owned.rarity !== expectedRarity ||
    !p.nextRarity(expectedRarity)
  )
    return payload(owner, { ...state, tab: "souls" });
  const sources = p
    .ascensionSources(owner, c.id)
    .filter((c) => c.quantity >= 50)
    .slice(0, 25);
  const enough =
    sources.reduce((n, c) => n + Math.floor(c.quantity / 50), 0) >= 2;
  const custom = (kind) =>
    [
      "hardcore-char",
      owner,
      state.rarity,
      state.classKey,
      state.page,
      state.id,
      "souls",
      kind,
    ].join(":");
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(
          c.name +
            " · " +
            expectedRarity +
            " → " +
            p.nextRarity(expectedRarity),
        )
        .setDescription(
          "Giữ S6. Tốn **2 cọc ×50 thẻ SSR cùng class**. Mỗi cọc phải thuộc một nhân vật.\nChọn **1 nhân vật: dùng 100 thẻ**; chọn **2 nhân vật: dùng 50 thẻ mỗi người**. Không ghép thẻ lẻ. Nâng cấp có hiệu lực từ run mới.",
        ),
    ],
    components: [
      row(
        new StringSelectMenuBuilder()
          .setCustomId(custom("ascend_select_" + expectedRarity))
          .setPlaceholder(
            enough ? "Chọn nguyên liệu để nâng độ hiếm" : "Chưa đủ 2 cọc thẻ",
          )
          .setMinValues(1)
          .setMaxValues(Math.max(1, Math.min(2, sources.length)))
          .setDisabled(!enough)
          .addOptions(
            sources.length
              ? sources.map((c) => ({
                  label: c.name,
                  value: c.id,
                  description:
                    c.quantity +
                    " thẻ · " +
                    Math.floor(c.quantity / 50) +
                    " cọc",
                }))
              : [{ label: "Chưa có cọc thẻ phù hợp", value: "none" }],
          ),
      ),
      row(
        new ButtonBuilder()
          .setCustomId(custom("tab_souls"))
          .setLabel("Quay lại tinh hồn")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
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
    !(classKey === "all" || Object.hasOwn(characters.CLASSES, classKey)) ||
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
  if (
    kind === "gacha" &&
    interaction.guildId &&
    require("../characters/progression").account(owner)
  )
    return interaction.update(
      require("../gacha/ui").payload(owner, { guildId: interaction.guildId }),
    );
  if (/^ascend_(SSR|UR)$/.test(kind) && id !== "all")
    return interaction.update(
      ascensionPayload(
        owner,
        { rarity, classKey, page, id, tab },
        kind.slice(7),
      ),
    );
  if (/^ascend_select_(SSR|UR)$/.test(kind) && id !== "all") {
    await interaction.deferUpdate();
    let notice;
    try {
      const r = require("../characters/progression").ascend({
        userId: owner,
        characterId: id,
        expectedRarity: kind.slice(14),
        sourceIds: interaction.values,
        operationId: interaction.id,
      });
      notice =
        "Đã nâng **" +
        characters.get(id).name +
        " lên " +
        r.rarity +
        " · S6**. Hiệu lực từ run mới.";
    } catch (error) {
      if (
        ![
          "STALE_CHARACTER_ASCENSION",
          "INVALID_ASCENSION_MATERIALS",
          "INSUFFICIENT_CHARACTER_CARDS",
          "CHARACTER_NOT_OWNED",
        ].includes(error.message)
      )
        throw error;
      notice =
        "Không thể nâng: cần S6 và đủ 2 cọc ×50 thẻ SSR cùng class, mỗi cọc từ một nhân vật. Đã làm mới bảng.";
    }
    return interaction.editReply({
      ...payload(owner, { rarity, classKey, page, id, tab: "souls" }),
      content: notice,
    });
  }
  if (/^upgrade_[0-5]$/.test(kind) && id !== "all") {
    await interaction.deferUpdate();
    let notice = "";
    try {
      const r = require("../characters/progression").upgrade({
        userId: owner,
        characterId: id,
        expectedLevel: Number(kind.slice(8)),
        operationId: interaction.id,
      });
      notice =
        "Đã nâng " +
        soulIcon(id, r.soulLevel) +
        " **" +
        characters.get(id).name +
        " lên S" +
        r.soulLevel +
        "**. Hiệu lực từ run mới.";
    } catch (error) {
      if (
        ![
          "STALE_CHARACTER_SOUL",
          "INSUFFICIENT_CHARACTER_CARDS",
          "CHARACTER_NOT_OWNED",
        ].includes(error.message)
      )
        throw error;
      notice =
        error.message === "INSUFFICIENT_CHARACTER_CARDS"
          ? "Chưa đủ thẻ của chính nhân vật này."
          : "Tiến trình đã thay đổi. Đã làm mới bảng nhân vật.";
    }
    return interaction.editReply({
      ...payload(owner, { rarity, classKey, page, id, tab }),
      content: notice,
    });
  }
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
      (value === "all" || Object.hasOwn(characters.CLASSES, value))
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
module.exports = { PAGE_SIZE, payload, ascensionPayload, handle };
