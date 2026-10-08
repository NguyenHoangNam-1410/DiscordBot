"use strict";
const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");
const engine = require("./hardcoreTowerEngine");
const catalog = require("../hardcore/tower/challengeCatalog");
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
  effects: "Cơ chế",
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
  const prior =
    c.generatorVersion >= 3
      ? {
          ...c.floors[before.floor - 1],
          type: c.transitions[before.routeStep].type,
        }
      : c.floors[before.floor - 1];
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
      before.enemyHpAfter ??
        Math.max(
          0,
          before.enemyHp - before.actionDamage + (before.enemyHeal || 0),
        ),
    );
  if (before.enemyHeal)
    lines.push(
      "Quái hấp thụ Skill chưa kết liễu: **+" + before.enemyHeal + " HP**.",
    );
  if (before.heal) lines.push("Hồi phục cho bạn: **+" + before.heal + " HP**.");
  change(`${E.hp} HP`, before.hp, state.hp);
  change(`${E.mana} MP`, before.mana, state.mana);
  change("Tầng", before.floor, state.floor);
  if (
    state.status === "playing" &&
    before.floor === state.floor &&
    before.step !== state.step
  )
    lines.push(
      `**Pha**: ${prior.phases?.[before.step]?.name || "Nhịp " + (before.step + 1)} → **${prior.phases?.[state.step]?.name || "Nhịp " + (state.step + 1)}**`,
    );
  const text = lines.join("\n");
  return c.generatorVersion >= 3
    ? text
    : text.replace(/\bMana\b(?! Vỡ Vụn)/g, "MP");
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
    text: `Challenge ${c.challengeId} · v${c.contentVersion}`,
  };
}
function button(
  prefix,
  action,
  label,
  disabled = false,
  selected = false,
  classKey = "sorceress",
) {
  const symbols = {
    attack: E.attack,
    skill: SKILL_ICONS[classKey],
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
      selected || action.split(":")[0] === "attack"
        ? ButtonStyle.Primary
        : ["skill", "replay"].includes(action.split(":")[0])
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
  if (c.generatorVersion >= 3)
    return payloadGenerated(row, state, c, result, now);
  const live = catalog.playable(c, now);
  const replayTarget =
    state.status !== "playing" ? (live ? c : catalog.active(now)) : null;
  const e = engine.current(state, c).encounter;
  const embed = new EmbedBuilder()
    .setColor(color(state, c))
    .setTitle(`🗼 THÁP ĐỊNH MỆNH · TẦNG ${state.floor}/${c.floors.length}`)
    .setDescription(
      `${row.user_id ? `👤 <@${row.user_id}>\n` : ""}**${c.name}** · ${c.weekLabel}${!live ? (replayTarget ? "\n⏰ **Challenge này đã đóng. Bấm Chơi Tháp hiện tại để mở tuần đang hoạt động.**" : "\n⏰ **Challenge đã hết hạn. Chỉ xem kết quả; không còn hành động hoặc thưởng.**") : ""}`,
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
      : [
          {
            action: "replay",
            label: live ? "Chơi lại từ tầng 1" : "Chơi Tháp hiện tại",
          },
        ];
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
        x.action === "replay" ? !replayTarget : !live || x.disabled,
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
  if (c.generatorVersion >= 3)
    return privateGenerated(row, state, c, sourceMessageId, tab);
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

function generatedPrefix(row, state) {
  return "hardcore-tower:" + row.id + ":" + state.turn + ":";
}
function generatedButton(
  row,
  state,
  c,
  action,
  label,
  disabled = false,
  selected = false,
  source,
) {
  return button(
    generatedPrefix(row, state),
    action + ":r" + state.routeStep + (source ? ":" + source : ""),
    label,
    disabled,
    selected,
    c.classKey,
  );
}
function generatedEncounter(state, c) {
  const { encounter: e, transition: t } = engine.current(state, c);
  let text = "**" + e.name + "**\n";
  if (t.type === "combat") text += healthBar(state.enemyHp, e.hp);
  if (c.contentVersion >= 5 && t.type === "combat") {
    const solver = require("../hardcore/tower/solver"),
      resistance = solver.resistances(c, state, t),
      next = c.transitions[state.routeStep + 1],
      intent = (transition) => {
        if (!transition || transition.floor !== t.floor) return "Hết tầng";
        if (transition.type === "event") return "Tình huống";
        if (transition.guardIntent)
          return "Trọng kích " + transition.intentDamage + " DMG";
        if (transition.phaseEnd) return "Cửa chuyển phase";
        return (
          transition.intentDamage +
          " DMG " +
          (transition.counterType === "magic" ? "phép" : "vật lý")
        );
      },
      pending = (state.delayedEffects || [])
        .map((effect) => effect.damage + " DMG/" + effect.turns)
        .join(", ");
    text +=
      "\nGiáp: **VL " +
      resistance.physical +
      "% · Phép " +
      resistance.magic +
      "%**" +
      (state.adaptiveArmor
        ? " · Thích nghi **" +
          (state.adaptiveArmor === "physical" ? "VL" : "Phép") +
          "**"
        : "") +
      "\nBreak **" +
      state.breakGauge +
      "/3**" +
      (pending ? " · Vọng âm **" + pending + "**" : "") +
      "\nIntent: **" +
      intent(t) +
      "** · Sau: **" +
      intent(next) +
      "**";
    if (e.phaseHps?.length > 1)
      text +=
        "\nBoss **Pha " +
        (state.bossPhase + 1) +
        "/" +
        e.phaseHps.length +
        "** · HP phase **" +
        state.phaseHp +
        "/" +
        e.phaseHps[state.bossPhase] +
        "**";
    if (t.echoDelay)
      text +=
        "\nVọng âm: **50% damage hành động lặp sau " + t.echoDelay + " lượt**";
  } else if (t.stance)
    text +=
      "\nTrạng thái: **" +
      {
        magic_resist: "Kháng phép",
        physical_resist: "Kháng vật lý",
        immune: "Miễn nhiễm sát thương",
      }[t.stance] +
      "**";
  if (t.type === "event")
    text += t.choices.map((x) => "• " + x.label).join("\n");
  else if (t.finisher)
    text += "\n💀 **Hành quyết** · Tấn công thường **−50% DMG**";
  else if (t.guardIntent)
    text +=
      "\n🛡️ **Trọng kích " +
      t.intentDamage +
      " DMG** · Phòng thủ còn **" +
      t.defendDamage +
      " DMG**";
  else
    text +=
      "\nÝ định: **" +
      t.intentDamage +
      " DMG " +
      (t.counterType === "magic" ? "phép" : "vật lý") +
      "**";
  return text;
}
function generatedStats(state, c) {
  const t = engine.current(state, c).transition;
  return (
    resources(state) +
    "\n" +
    E.attack +
    " **Tấn công " +
    engine.damage(state, c, "attack") +
    " DMG** · +" +
    t.attackMana +
    " MP\n" +
    SKILL_ICONS[c.classKey] +
    " **" +
    c.combat.skillName +
    " " +
    engine.damage(state, c, "skill") +
    " DMG** · −" +
    t.skillCost +
    " MP\n" +
    E.defense +
    " **Phòng thủ · nhận " +
    engine.counter(state, c, "defend") +
    " DMG** · +" +
    t.defendMana +
    " MP"
  );
}
function generatedEffects(state, c) {
  return (
    c.classDescription +
    (c.classKey === "necromancer"
      ? "\n**Ward:** " + state.classCharges.ward + " charge."
      : "") +
    "\nMọi trạng thái chỉ có hiệu lực trong tầng hiện tại."
  );
}
function generatedRules(c) {
  const date = (v) =>
    new Date(v).toLocaleString("vi-VN", { timeZone: "Asia/Bangkok" });
  return (
    "• **Thử thách sinh tử:** " +
    c.character.name +
    " cố định · 15 tầng. Hạ quái trước khi quái hạ bạn; tử trận sẽ **thử lại từ đầu tầng hiện tại**.\n" +
    "• Mỗi tầng là một puzzle độc lập. Khi sang tầng mới, HP, MP, Skill, Ward và hiệu ứng được đặt lại theo trạng thái đầu tầng; không lựa chọn nào từ tầng trước ảnh hưởng tầng sau. Tháp không công bố số hành động của từng tầng hoặc toàn bộ hành trình.\n" +
    "• Mỗi tuần chỉ có **một chuỗi hành động duy nhất** có thể hoàn thành đủ 15 tầng.\n" +
    (c.contentVersion >= 5
      ? "• Skill dùng tự do khi đủ MP. Tấn công tăng Break; Skill tiêu Break để tăng damage. Giáp thích nghi cộng kháng với loại damage vừa nhận; kháng được tính theo phần trăm hiển thị.\n• Bảng hiện hai intent. Vọng âm lặp 50% damage sau tối đa hai lượt. Boss tầng 13–15 có nhiều phase, damage dư không xuyên phase.\n"
      : c.contentVersion >= 4
        ? "• Skill hoạt động bình thường, có thể dùng nhiều lần nếu đủ MP và không cần làm đòn kết liễu. Quái không hồi lại damage Skill; trạng thái kháng hoặc miễn nhiễm của từng lượt được hiển thị trực tiếp.\n"
        : "• Tấn công và Skill luôn gây đúng damage đang hiển thị. Skill dùng **một lần mỗi tầng**; nếu Skill không kết liễu, quái hấp thụ và hồi lại toàn bộ damage vừa nhận.\n") +
    "• Phòng thủ giảm đòn sắp nhận xuống đúng số dự báo. Quái chết trong lượt thì không thể phản công.\n" +
    "• " +
    c.classDescription +
    "\n" +
    "• MP và HP áp dụng theo delta cố định của challenge; phản công xảy ra trước khi chuyển tầng. Không Crit, Miss hoặc RNG trong run.\n" +
    "• Không mang đồ, vé, bình, cược hoặc chỉ số từ Sinh tồn 999 vào Tháp. Hai mode tồn tại độc lập.\n" +
    "• Thưởng " +
    money(c.reward.coins) +
    " " +
    appEmoji("coin", "🪙") +
    " + " +
    money(c.reward.diamonds) +
    " " +
    appEmoji("gem", "💎") +
    " một lần/challenge/người/server. Chơi lại không nhận thêm.\n" +
    "• Đổi tuần lúc 00:00 thứ Hai (UTC+7), xoay đủ 7 class trước khi lặp. Mở " +
    date(c.startsAt) +
    "; đóng " +
    date(c.endsAt) +
    ".\n" +
    "• Snapshot đã kiểm chứng được khóa suốt tuần. Seed commitment: **" +
    c.seedCommitment +
    "**. Hash lời giải: **" +
    c.solutionHash +
    "**. Seed thật chỉ được admin xuất sau khi hết tuần."
  );
}
function payloadGenerated(row, state, c, result, now = Date.now()) {
  const live = catalog.playable(c, now),
    replayTarget =
      state.status !== "playing" ? (live ? c : catalog.active(now)) : null,
    e = engine.current(state, c).encounter;
  const embed = new EmbedBuilder()
    .setColor(color(state, c))
    .setTitle("🗼 THÁP ĐỊNH MỆNH · " + c.weekLabel)
    .setDescription(
      (row.user_id ? "👤 <@" + row.user_id + ">" + SEP : "") +
        "**" +
        c.character.name +
        "**" +
        SEP +
        "Tầng **" +
        state.floor +
        "/15**" +
        (!live
          ? replayTarget
            ? "\n⏰ Challenge này đã đóng. Bấm Chơi Tháp hiện tại để mở tuần đang hoạt động."
            : "\n⏰ Challenge đã hết hạn. Chỉ xem kết quả."
          : ""),
    );
  addTextFields(
    embed,
    "⚔️ Hành động",
    state.status === "playing" && e.type === "combat"
      ? generatedStats(state, c)
      : resources(state),
  );
  if (state.status === "playing")
    addTextFields(
      embed,
      encounterIcon(e) + " " + (e.type === "combat" ? "Đối thủ" : "Tình huống"),
      generatedEncounter(state, c),
    );
  if (state.status !== "playing") {
    addTextFields(
      embed,
      "📍 Tiến độ",
      "Đã vượt **" +
        state.cleared +
        "/15**" +
        SEP +
        "Cao nhất **" +
        result.best_floor +
        "/15**" +
        SEP +
        "Lần thử **" +
        result.attempts +
        "**",
    );
    addTextFields(embed, "🏆 Phần thưởng", rewardText(state, c, result));
  }
  if (state.lastLog) addTextFields(embed, "📜 Lượt trước", turnText(state, c));
  if (state.status !== "playing")
    addTextFields(
      embed,
      "🏁 KẾT QUẢ",
      state.status === "completed"
        ? "🏆 **Đã hạ toàn bộ kẻ địch và hoàn thành 15 tầng!**"
        : "❌ " + state.failure,
    );
  const t = engine.current(state, c).transition;
  const opts =
    state.status === "playing"
      ? engine.actions(state, c)
      : [
          {
            action: "replay",
            label: live
              ? state.status === "failed"
                ? "Thử lại tầng " + state.floor
                : "Chơi lại từ tầng 1"
              : "Chơi Tháp hiện tại",
          },
        ];
  const labels =
    e.type === "combat"
      ? {
          attack: "+" + t.attackMana + " MP",
          skill: "−" + t.skillCost + " MP",
          defend: "+" + t.defendMana + " MP",
        }
      : {};
  const components = chunkRows(
    opts.map((x) =>
      generatedButton(
        row,
        state,
        c,
        x.action,
        state.status === "playing" ? labels[x.action] || x.label : x.label,
        x.action === "replay" ? !replayTarget : !live || x.disabled,
      ),
    ),
  );
  components.push(
    new ActionRowBuilder().addComponents([
      ...Object.entries(tabs).map(([tab, label]) =>
        generatedButton(row, state, c, "view_" + tab, label),
      ),
      generatedButton(row, state, c, "top", "Xếp hạng"),
    ]),
  );
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}
function privateGenerated(row, state, c, source, tab) {
  const embed = new EmbedBuilder()
    .setColor(color(state, c))
    .setTitle("🗼 " + tabs[tab] + " · THÁP ĐỊNH MỆNH")
    .setDescription(
      "**" + c.character.name + "** · Tầng **" + state.floor + "/15**",
    )
    .setFooter(footer(state, c));
  const text =
    tab === "stats"
      ? statsText(state, c) + "\n" + c.classDescription
      : tab === "effects"
        ? generatedEffects(state, c)
        : tab === "rules"
          ? generatedRules(c)
          : state.status === "playing"
            ? generatedEncounter(state, c) +
              (engine.current(state, c).encounter.type === "combat"
                ? "\n" + generatedStats(state, c)
                : "")
            : state.status === "completed"
              ? "🏆 Challenge đã hoàn thành."
              : "❌ " + state.failure;
  addTextFields(embed, tabs[tab], text);
  return {
    content: "",
    embeds: [embed],
    components: chunkRows(
      Object.entries(tabs).map(([t, label]) =>
        generatedButton(
          row,
          state,
          c,
          "view_" + t,
          label,
          t === tab,
          t === tab,
          source,
        ),
      ),
    ),
    allowedMentions: { parse: [] },
  };
}
