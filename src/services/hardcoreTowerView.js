"use strict";
const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const engine = require("./hardcoreTowerEngine");
const catalog = require("../hardcore/towerChallenges");
const { E } = require("./hardcoreIcons");
const { appEmoji } = require("../utils/appEmoji");
const money = (n) => n.toLocaleString("vi-VN");
function combatText(state, c) {
  const { encounter: e, phase: p } = engine.current(state, c);
  const cost = engine.costs(state, c);
  const type = p.counterType === "magic" ? "phép" : "vật lý";
  const immune =
    p.immune === "all"
      ? "Bất tử trong pha này"
      : p.immune === "physical"
        ? "Miễn nhiễm vật lý"
        : p.immune === "magic"
          ? "Phản xạ phép: Skill gây 0 damage"
          : "";
  return (
    "👹 **" +
    e.name +
    "** · " +
    state.enemyHp +
    "/" +
    e.hp +
    " HP\n**Pha " +
    p.name +
    "**" +
    (immune ? " · " + immune : "") +
    (e.spellLocked ? " · Khóa phép" : "") +
    "\n" +
    (p.advanceAfter
      ? "Pha chuyển sau " + p.advanceAfter + " hành động hợp lệ."
      : "Phải hạ quái trong " +
        (p.maxActions - state.phaseActions) +
        " hành động còn lại.") +
    (p.requiredAction
      ? "\n**Luật pha:** phải dùng **" +
        ({ attack: "Tấn công", skill: "Arcane Burst", defend: "Phòng thủ" }[
          p.requiredAction
        ] || p.requiredAction) +
        "**; hành động khác làm run thất bại."
      : "") +
    "\nÝ định: **" +
    (p.counterDamage || 0) +
    " damage " +
    type +
    "** nếu còn sống; kết liễu không bị phản công.\n" +
    E.attack +
    " **Tấn công: " +
    engine.damage(state, c, "attack") +
    " damage · +" +
    engine.attackMana(state, c) +
    " Mana**\n✨ **Arcane Burst: " +
    engine.damage(state, c, "skill") +
    " damage · −" +
    cost.mana +
    " Mana" +
    (cost.hp ? " · −" + cost.hp + " HP" : "") +
    "**\n" +
    E.defense +
    " **Phòng thủ: nhận " +
    engine.counter(state, c, "defend") +
    " damage · +" +
    c.combat.defendMana +
    " Mana**\n*Damage đã gồm giảm trừ; Mana cap " +
    state.maxMana +
    ". Không Crit, không Miss.*"
  );
}
function payload(row, state, c, result, now = Date.now()) {
  const live = catalog.playable(c, now);
  const expired = !live;
  const e = engine.current(state, c).encounter;
  let detail =
    state.status === "playing"
      ? e.type === "combat"
        ? combatText(state, c)
        : "**" +
          e.name +
          "**\n" +
          e.choices.map((x) => "• " + x.label).join("\n")
      : state.status === "completed"
        ? "🏆 **Hoàn thành " +
          c.floors.length +
          "/" +
          c.floors.length +
          " tầng!**"
        : "❌ " + state.failure;
  if (expired)
    detail =
      "⏰ **Challenge đã hết hạn. Chỉ xem kết quả; không còn hành động hoặc thưởng.**\n" +
      detail;
  const reward = state.rewardGranted
    ? "Đã nhận " +
      money(c.reward.coins) +
      " " +
      appEmoji("coin", "🪙") +
      " và " +
      c.reward.diamonds +
      " " +
      appEmoji("gem", "💎")
    : result.reward_claimed_at != null
      ? "Phần thưởng tuần đã nhận; chơi lại không nhận thêm."
      : "Thưởng hoàn thành lần đầu: " +
        money(c.reward.coins) +
        " " +
        appEmoji("coin", "🪙") +
        " + " +
        c.reward.diamonds +
        " " +
        appEmoji("gem", "💎");
  const embed = new EmbedBuilder()
    .setColor(0x313a55)
    .setTitle("🗼 THÁP ĐỊNH MỆNH · " + c.weekLabel)
    .setDescription(
      (row.user_id ? "<@" + row.user_id + ">\n" : "") +
        "Tầng **" +
        state.floor +
        "/" +
        c.floors.length +
        "** · Sorceress · **" +
        c.name +
        "**\n" +
        E.hp +
        " **" +
        state.hp +
        "/" +
        state.maxHp +
        " HP** · " +
        E.mana +
        " **" +
        state.mana +
        "/" +
        state.maxMana +
        " Mana**\n\n" +
        detail,
    )
    .addFields(
      {
        name: "Tiến trình tuần",
        value:
          "Tầng cao nhất: " +
          result.best_floor +
          "/" +
          c.floors.length +
          " · Lần thử: " +
          result.attempts +
          "\n" +
          reward,
      },
      {
        name: "Nhân vật cố định",
        value:
          "STR " +
          c.character.str +
          " · DEX " +
          c.character.dex +
          " · VIT " +
          c.character.vit +
          " · ENE " +
          c.character.ene +
          "\nDEF " +
          c.character.defense +
          " · ACC " +
          c.character.accuracy +
          " · EVA " +
          c.character.evasion +
          " · RES " +
          c.character.resistance +
          "% · Crit tắt · Bình 0",
      },
    )
    .setFooter({
      text:
        "Challenge " +
        c.challengeId +
        " · v" +
        c.contentVersion +
        " · Lượt " +
        state.turn +
        " · " +
        (result.reward_claimed_at != null
          ? "Phần thưởng tuần đã nhận"
          : "Phần thưởng tuần chưa nhận"),
    });
  if (state.lastLog)
    embed.addFields({
      name: "Hành động vừa rồi",
      value: state.lastLog.slice(0, 1024),
    });
  const prefix = "hardcore-tower:" + row.id + ":" + state.turn + ":";
  const buttons = (
    state.status === "playing"
      ? engine.actions(state, c)
      : [{ action: "replay", label: "Chơi lại", disabled: false }]
  ).map((x) =>
    new ButtonBuilder()
      .setCustomId(prefix + x.action)
      .setLabel(x.label)
      .setStyle(
        x.action === "attack" || x.action === "replay"
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary,
      )
      .setDisabled(expired || x.disabled),
  );
  buttons.push(
    new ButtonBuilder()
      .setCustomId(prefix + "top")
      .setLabel("Bảng xếp hạng tuần")
      .setStyle(ButtonStyle.Secondary),
  );
  const components = [];
  for (let i = 0; i < buttons.length; i += 5)
    components.push(
      new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)),
    );
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
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
module.exports = { payload, combatText, topPayload };
