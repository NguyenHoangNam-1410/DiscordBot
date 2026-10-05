"use strict";
const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const engine = require("./hardcoreTowerEngine");
const catalog = require("../hardcore/towerChallenges");
const { E, SKILL_ICONS } = require("./hardcoreIcons");
const { CATALOG } = require("./hardcoreParadoxService");
const {
  healthBar,
  addTextFields,
  highlightStat,
  STAT_SEPARATOR: SEP,
} = require("./hardcoreUi");
const { appEmoji } = require("../utils/appEmoji");
const money = (n) => n.toLocaleString("vi-VN");
const actionName = {
  attack: "Tấn công",
  skill: "Arcane Burst",
  defend: "Phòng thủ",
};
const tabs = {
  stats: "Chỉ số",
  effects: "Rift",
  encounter: "Chi tiết",
  rules: "Luật chơi",
};
function encounterIcon(e) {
  if (e.type === "combat") return E.attack;
  return e.choices.some((x) => x.paradox)
    ? E.rift
    : e.choices.some((x) => x.mana)
      ? E.mana
      : E.shrine;
}
function resources(state) {
  return `${healthBar(state.hp, state.maxHp)}\n${E.mana} **MP** **${state.mana}/${state.maxMana}**`;
}
function battleStats(state, c) {
  const cost = engine.costs(state, c);
  return `${resources(state)}${SEP}${E.defense} **DEF** **${c.character.defense}**${SEP}${E.res} **RES** **${c.character.resistance}%**\n${E.attack} **Tấn công: ${engine.damage(state, c, "attack")} damage · +${engine.attackMana(state, c)} MP**\n${SKILL_ICONS[c.character.classKey]} **Arcane Burst: ${engine.damage(state, c, "skill")} damage · −${cost.mana} MP${cost.hp ? ` · −${cost.hp} HP` : ""}**\n${E.defense} **Phòng thủ: nhận ${engine.counter(state, c, "defend")} damage · +${c.combat.defendMana} MP**\n*Damage đã tính giảm trừ và luật pha; không Crit, không Miss.*`;
}
function encounterText(state, c) {
  const { encounter: e, phase: p } = engine.current(state, c);
  if (e.type !== "combat")
    return `**${e.name}**\n${e.choices.map((x) => `• ${x.label.replace(/\bMana\b(?! Vỡ Vụn)/g, "MP")}`).join("\n")}`;
  const immunity = {
    all: "Bất tử trong pha này",
    physical: "Miễn nhiễm vật lý",
    magic: "Phản xạ phép: Skill gây 0 damage",
  }[p.immune];
  return (
    `**${e.name}**\n${healthBar(state.enemyHp, e.hp)}\n**Pha ${p.name}**${immunity ? ` · ${immunity}` : ""}${e.spellLocked ? " · Khóa phép" : ""}\n` +
    (p.advanceAfter
      ? `Pha chuyển sau **${Math.max(0, p.advanceAfter - state.phaseActions)}** hành động hợp lệ còn lại.`
      : `Phải hạ quái trong **${Math.max(0, p.maxActions - state.phaseActions)}** hành động còn lại.`) +
    (p.requiredAction
      ? `\n**Luật pha:** phải dùng **${actionName[p.requiredAction] || p.requiredAction}**; hành động khác làm run thất bại.`
      : "") +
    `\nÝ định: **${p.counterDamage || 0} damage ${p.counterType === "magic" ? "phép" : "vật lý"}** nếu còn sống; kết liễu đúng luật pha không bị phản công.`
  );
}
function combatText(state, c) {
  return `${encounterText(state, c)}\n${battleStats(state, c)}`;
}
function effectText(state, c) {
  const p = state.paradox;
  if (!p) return "Chưa có Rift Paradox.";
  const cost = engine.costs(state, c);
  const text =
    p.id === "blood_pact"
      ? `Damage ×1,30. Mỗi Arcane Burst mất **${cost.hp} HP** (5% Max HP, làm tròn xuống, tối thiểu 1); cần còn ít nhất 1 HP sau chi phí.`
      : `Arcane Burst tốn **${cost.mana} MP**. Tấn công **+${engine.attackMana(state, c)} MP**; Phòng thủ **+${c.combat.defendMana} MP**.`;
  return `**${CATALOG[p.id]?.name || p.id}**\n${text}\nHiệu lực: tầng **${p.startFloor}–${p.endFloor}**.`;
}
function turnText(state, c) {
  const before = state.lastOutcome;
  if (!before) return state.lastLog || "";
  const prior = c.floors[before.floor - 1];
  const lines =
    prior.type === "combat"
      ? [
          `**${prior.name}** · ${state.lastLog.split(":")[0]}: **${before.actionDamage} damage** · Phản công: **${before.counterDamage} damage**`,
        ]
      : [state.lastLog];
  const change = (label, from, to) => {
    if (from !== to) lines.push(`${highlightStat(label)}: ${from} → **${to}**`);
  };
  if (prior.type === "combat")
    change(
      "HP quái",
      before.enemyHp,
      Math.max(0, before.enemyHp - before.actionDamage),
    );
  change(`${E.hp} HP`, before.hp, state.hp);
  change(`${E.mana} MP`, before.mana, state.mana);
  change("Tầng", before.floor, state.floor);
  if (before.floor === state.floor && before.step !== state.step)
    lines.push(
      `**Pha**: ${prior.phases[before.step].name} → **${prior.phases[state.step].name}**`,
    );
  return lines.join("\n").replace(/\bMana\b(?! Vỡ Vụn)/g, "MP");
}
function color(state, c) {
  if (state.status === "completed") return 0x2ecc71;
  if (state.status === "failed" || state.hp <= state.maxHp * 0.3)
    return 0xe74c3c;
  return engine.current(state, c).encounter.type === "combat"
    ? 0xe67e22
    : 0x3498db;
}
function rewardText(state, c, result) {
  const amount = `${money(c.reward.coins)} ${appEmoji("coin", "🪙")} + ${money(c.reward.diamonds)} ${appEmoji("gem", "💎")}`;
  return state.rewardGranted
    ? `Đã nhận **${amount}**`
    : result.reward_claimed_at != null
      ? "Phần thưởng tuần đã nhận; chơi lại không nhận thêm."
      : `Thưởng hoàn thành lần đầu: **${amount}**`;
}
function footer(state, c) {
  return {
    text: `Challenge ${c.challengeId} · v${c.contentVersion} · Lượt ${state.turn}`,
  };
}
function button(prefix, action, label, disabled = false, selected = false) {
  const symbols = {
    attack: E.attack,
    skill: SKILL_ICONS.sorceress,
    defend: E.defense,
    replay: appEmoji("repeat", "🔁"),
    top: appEmoji("trophy", "🏆"),
    touch: E.shrine,
    skip: appEmoji("walking", "🚶"),
    heal: E.hp,
    absorb_mana: E.mana,
    blood_pact: E.rift,
    mana_fracture: E.rift,
    view_stats: appEmoji("bar_chart", "📊"),
    view_effects: E.rift,
    view_encounter: appEmoji("information_source", "ℹ️"),
    view_rules: appEmoji("book", "📖"),
  };
  return new ButtonBuilder()
    .setCustomId(prefix + action)
    .setLabel(label.slice(0, 80))
    .setStyle(
      selected || action === "attack"
        ? ButtonStyle.Primary
        : ["skill", "replay"].includes(action)
          ? ButtonStyle.Success
          : ButtonStyle.Secondary,
    )
    .setDisabled(Boolean(disabled))
    .setEmoji(symbols[action.split(":")[0]] || "➡️");
}
function chunkRows(buttons) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5)
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  return rows;
}
function payload(row, state, c, result, now = Date.now()) {
  const live = catalog.playable(c, now);
  const e = engine.current(state, c).encounter;
  const embed = new EmbedBuilder()
    .setColor(color(state, c))
    .setTitle(`🗼 THÁP ĐỊNH MỆNH · TẦNG ${state.floor}/${c.floors.length}`)
    .setDescription(
      `${row.user_id ? `👤 <@${row.user_id}>\n` : ""}**${c.name}** · ${c.weekLabel}${!live ? "\n⏰ **Challenge đã hết hạn. Chỉ xem kết quả; không còn hành động hoặc thưởng.**" : ""}`,
    )
    .setFooter(footer(state, c));
  addTextFields(
    embed,
    `${SKILL_ICONS[c.character.classKey]} Sorceress`,
    state.status === "playing" && e.type === "combat"
      ? battleStats(state, c)
      : resources(state),
  );
  if (state.status === "playing")
    addTextFields(
      embed,
      `${encounterIcon(e)} ${e.type === "combat" ? "Đối thủ" : "Tình huống"}`,
      encounterText(state, c),
    );
  if (state.paradox)
    addTextFields(embed, `${E.rift} Rift Paradox`, effectText(state, c));
  addTextFields(
    embed,
    "📍 Tiến trình tuần",
    `Đã vượt: **${state.cleared}/${c.floors.length}**${SEP}Cao nhất: **${result.best_floor}/${c.floors.length}**${SEP}Lần thử: **${result.attempts}**`,
  );
  addTextFields(embed, "🏆 Phần thưởng", rewardText(state, c, result));
  if (state.lastLog)
    addTextFields(embed, "📜 Lượt vừa rồi", turnText(state, c));
  if (state.status !== "playing")
    addTextFields(
      embed,
      "🏁 KẾT QUẢ",
      state.status === "completed"
        ? `🏆 **Hoàn thành ${c.floors.length}/${c.floors.length} tầng!**`
        : `❌ ${state.failure}`,
    );
  const prefix = `hardcore-tower:${row.id}:${state.turn}:`;
  const actions =
    state.status === "playing"
      ? engine.actions(state, c)
      : [{ action: "replay", label: "Chơi lại" }];
  const cost = engine.costs(state, c);
  const labels =
    state.status === "playing" && e.type === "combat"
      ? {
          attack: `+${engine.attackMana(state, c)} MP`,
          defend: `+${c.combat.defendMana} MP`,
          skill: `${cost.mana === 0 ? "" : "−"}${cost.mana} MP${cost.hp ? ` · −${cost.hp} HP` : ""}`,
        }
      : {};
  const components = chunkRows(
    actions.map((x) =>
      button(
        prefix,
        x.action,
        labels[x.action] || x.label.replace(/\bMana\b(?! Vỡ Vụn)/g, "MP"),
        !live || x.disabled,
      ),
    ),
  );
  components.push(
    new ActionRowBuilder().addComponents([
      ...Object.entries(tabs).map(([tab, label]) =>
        button(prefix, `view_${tab}`, label),
      ),
      button(prefix, "top", "Bảng xếp hạng tuần"),
    ]),
  );
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}
function statsText(state, c) {
  const s = c.character;
  const attributes = ["str", "dex", "vit", "ene"]
    .map((k) => `${E[k]} **${k.toUpperCase()}** **${s[k]}**`)
    .join(SEP);
  return `${resources(state)}\n${attributes}\n${E.defense} **DEF** **${s.defense}**${SEP}${E.res} **RES** **${s.resistance}%**\n${E.accuracy} **ACC** **${s.accuracy}**${SEP}${E.evasion} **EVA** **${s.evasion}**${SEP}${E.crit} **CRIT** **Tắt**\n${E.potion} **Bình** **0**\n*Nhân vật cố định; sát thương và phản công dùng giá trị của challenge, đã tính giảm trừ.*`;
}
function rulesText(c) {
  const date = (value) =>
    new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  return `• Vượt **${c.floors.length} tầng** với Sorceress cố định; không Crit, không Miss, không RNG.\n• Tấn công gây **${c.combat.attackDamage} damage**, nhận **${c.combat.attackMana} MP**. Arcane Burst gây **${c.combat.skillDamage} damage**, tốn **${c.combat.skillCost} MP**. Rift và luật pha có thể thay đổi các giá trị này.\n• Phòng thủ nhận **${c.combat.defendMana} MP**; sát thương nhận vào theo pha hiện tại. MP không vượt **${c.character.maxMana}**.\n• Kết liễu quái đúng luật pha không bị phản công. Phải tuân thủ hành động bắt buộc và giới hạn hành động của từng pha.\n• Không mang trang bị, vé hoặc bình vào Tháp.\n• Thưởng một lần mỗi người trong server cho challenge này. Chơi lại tăng số lần thử.\n• Mở: **${date(c.startsAt)}**; đóng: **${date(c.endsAt)}** (giờ Việt Nam). Sau khi đóng, chỉ xem kết quả trong 24 giờ.`;
}
function privatePayload(row, state, c, sourceMessageId, tab = "stats") {
  const embed = new EmbedBuilder()
    .setColor(color(state, c))
    .setTitle(`🗼 ${tabs[tab]} · THÁP ĐỊNH MỆNH`)
    .setDescription(
      `**${c.name}** · Tầng **${state.floor}/${c.floors.length}**`,
    )
    .setFooter(footer(state, c));
  const text =
    tab === "stats"
      ? statsText(state, c)
      : tab === "effects"
        ? effectText(state, c)
        : tab === "rules"
          ? rulesText(c)
          : state.status === "playing"
            ? engine.current(state, c).encounter.type === "combat"
              ? combatText(state, c)
              : encounterText(state, c)
            : state.status === "completed"
              ? "🏆 Challenge đã hoàn thành."
              : `❌ ${state.failure}`;
  addTextFields(embed, tabs[tab], text);
  const prefix = `hardcore-tower:${row.id}:${state.turn}:`;
  return {
    content: "",
    embeds: [embed],
    components: chunkRows(
      Object.entries(tabs).map(([t, label]) =>
        button(
          prefix,
          `view_${t}:${sourceMessageId}`,
          label,
          t === tab,
          t === tab,
        ),
      ),
    ),
    allowedMentions: { parse: [] },
  };
}

function topPayload(rows, c) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x313a55)
        .setTitle("🏆 THÁP ĐỊNH MỆNH · " + c.weekLabel)
        .setDescription(
          rows
            .map(
              (r, i) =>
                "**" +
                (i + 1) +
                ".** <@" +
                r.user_id +
                "> · " +
                (r.completed_at != null
                  ? "✅ Hoàn thành"
                  : "tầng " + r.best_floor) +
                " · " +
                r.attempts +
                " lần thử",
            )
            .join("\n") || "Chưa có thành tích.",
        )
        .setFooter({
          text: "Hoàn thành → ít lần thử → hoàn thành sớm → ID ổn định",
        }),
    ],
    allowedMentions: { parse: [] },
  };
}

module.exports = { payload, combatText, topPayload, privatePayload };
