"use strict";
const u = require("./runtimeV2");
const key = (x, cmd) => "boss_" + x.b.id + "__" + cmd;
const free = (s, a) =>
  options(s).some((o) => o.action === a && o.kind !== "action");
function options(s) {
  if (!u.on(s.encounter) || s.hp <= 0 || s.encounter.hp <= 0) return [];
  const x = u.current(s),
    { m, b } = x,
    r = [];
  const add = (cmd, label, disabled = false, kind = "action", menu = null) =>
    r.push({
      action: key(x, cmd),
      label: label + (kind === "action" ? " · 1 lượt" : " · không tốn lượt"),
      disabled,
      kind,
      menu,
      selected:
        kind === "selector" &&
        (cmd === "target_" + m.target ||
          cmd === "ward" + m.ward ||
          cmd === "plane" + m.plane ||
          cmd === "verdict" + m.verdict),
    });
  const select = (cmd, label, disabled = false) =>
    add(cmd, label, disabled, "selector", "target");
  const trio = (prefix, labels, disabled = () => false, kind = "action") =>
    labels.forEach((v, i) =>
      add(
        prefix + i,
        v,
        disabled(i),
        kind,
        kind === "selector" ? "target" : null,
      ),
    );
  switch (b.id) {
    case "butcher":
      add("back", "Lùi một ô", m.distance >= 2);
      add("cut", "Chặt xích −5% HP", s.hp <= Math.ceil(s.hp * 0.05));
      break;
    case "machine":
      add("vent", "Xả nhiệt −35");
      add("overload", "Quá tải +35");
      break;
    case "assur":
      trio("sigil", ["Sigil 1 · Lửa", "Sigil 2 · Lạnh", "Sigil 3 · Sét"]);
      if (m.charges >= 3 && m.rune) add("purify", "Purify");
      break;
    case "control":
      trio("frequency", ["Alpha", "Beta", "Gamma"]);
      break;
    case "necrobot":
    case "akarat":
    case "manoruk":
    case "lazarus":
    case "astrogha":
      u.aliveUnits(x).forEach((k) =>
        select(
          "target_" + k,
          k + " " + m.targets[k].hp + "/" + m.targets[k].maxHp,
        ),
      );
      if (
        b.id === "necrobot"
          ? u.aliveUnits(x).length <= 1
          : b.id === "akarat"
            ? u.aliveUnits(x).length === 0
            : b.id === "manoruk"
              ? u.aliveUnits(x).length === 0
              : true
      )
        select("target_boss", "Boss");
      break;
    case "quov":
      trio(
        "ward",
        ["Ward Lửa", "Ward Lạnh", "Ward Sét"],
        (i) => m.ward === i,
        "selector",
      );
      break;
    case "lucion":
      trio("command", ["Chống lệnh", "Giả vờ", "Phản bội"]);
      break;
    case "bul_kathos":
      trio("clash", ["Đỡ cao", "Đỡ thấp", "Không mắc lừa"]);
      break;
    case "giyua":
      if (m.nests) {
        add("nest_break", "Phá Nest");
        add("nest_seal", "Phong ấn Nest");
        add("nest_harvest", "Khai thác Nest");
      }
      break;
    case "riftwalker":
      m.echoes.forEach((v, i) =>
        add(
          "echo_" + i,
          "Bẻ Echo " +
            (i + 1) +
            " −" +
            Math.round(x.c.amount * 100) +
            "% Max HP",
          s.hp <= Math.ceil(s.maxHp * x.c.amount),
        ),
      );
      break;
    case "gharbad":
      add("accept", "Chấp nhận");
      add("search", "Khám xét");
      add("strike", "Tấn công lời đầu hàng");
      break;
    case "phoboss":
      add(
        "wake",
        "Thức tỉnh −" + Math.round(x.c.amount * 100) + "% HP",
        !m.dream || s.hp <= Math.ceil(s.hp * x.c.amount),
      );
      break;
    case "anomaly":
      trio("stabilize", ["Ổn định Matter", "Ổn định Energy", "Ổn định Void"]);
      if (m.shards.length === 3) add("overload", "Overload");
      break;
    case "zakarum":
      m.halos.forEach((k) =>
        add("halo_" + k, "Cướp Halo " + k, false, "action", "target"),
      );
      break;
    case "justicar":
      if (m.verdictTurns <= 0)
        trio(
          "verdict",
          ["Steel", "Arcane", "Silence"],
          () => false,
          "selector",
        );
      break;
    case "uldyssian":
      m.timeline.forEach((a, i) => {
        if (a !== "empty")
          add("rewrite_" + i, "Xóa ký ức " + (i + 1) + " −1 MP", s.mana < 1);
      });
      break;
    case "xazax":
      if (m.portals) {
        add("portal_close", "Đóng Portal");
        add("portal_take", "Chiếm Portal");
        add("portal_enter", "Bước vào Portal");
      }
      break;
    case "samael":
      if (m.lights) {
        add("seal_douse", "Dập ấn −1 MP", s.mana < 1);
        add("seal_take", "Cướp ấn");
      }
      break;
    case "death_projector":
      trio("zone", ["Sang A", "Sang B", "Sang C"]);
      break;
    case "buyard":
      add("shrink", "Thu hẹp vòng +" + x.c.amount);
      add("expand", "Mở rộng vòng −" + x.c.amount);
      break;
    case "bartuc":
      if (m.tether)
        add(
          "cut",
          "Cắt liên kết −" + Math.round(x.c.amount * 100) + "% HP",
          s.hp <= Math.ceil(s.hp * x.c.amount),
        );
      break;
    case "jitan":
      trio("gate", ["Cổng ◇", "Cổng △", "Cổng ○"]);
      break;
    case "greater_riftwalker":
      add("position", "Đổi vị trí " + (m.near ? "Xa" : "Gần"));
      break;
    case "athulua":
      trio(
        "zone",
        ["Sang Trái", "Sang Giữa", "Sang Phải"],
        (i) => blockedZone(x) === i,
      );
      break;
    case "lilith":
      [0.05, 0.1, 0.2].forEach((v, i) =>
        add(
          "bargain" + i,
          "Hiến " + v * 100 + "% Max HP",
          m.bargain > 0 || s.hp <= Math.ceil(s.maxHp * v),
          "action",
          "target",
        ),
      );
      break;
    case "nemesis":
      break;
    case "azmodan":
      add("reflect", "Phản ấn −1 MP", s.mana < 1);
      add("extinguish", "Dập lửa −1 bình", !s.potions);
      break;
    case "dark_star_dragon":
      if (beamDue(x))
        trio(
          "cover",
          m.pillars.map((n, i) => "Nấp trụ " + (i + 1) + " · " + n + " bền"),
          (i) => m.pillars[i] <= 0,
        );
      break;
    case "juris_khan":
      add("forward", "Tiến", m.position >= 3);
      add("back", "Lùi", m.position <= 0);
      break;
    case "baal":
      ["Defile", "Inferno", "Visions"].forEach((v, i) =>
        add("purify" + i, "Thanh tẩy " + v, m.purity < 1, "action", "target"),
      );
      break;
    case "belial":
      trio("lie", ["Đánh bóng 1 ◇", "Đánh bóng 2 △", "Đánh bóng 3 ○"]);
      break;
    case "atanna":
      if (!m.erased)
        m.dreams.forEach((v, i) =>
          add("erase" + i, "Xóa giấc " + (i + 1), i < b.round % 3 || v == null),
        );
      break;
    case "inarius":
      add("pull", "Kéo Inarius vào Ritual");
      add("protect", "Che chở Lilith");
      break;
    case "sescheron":
      trio("rune", ["Nhập ◇", "Nhập △", "Nhập ○"]);
      break;
    case "nithogur":
      add("anchor", "Neo thời gian", m.anchorUsed);
      add("rewind", "Tua lại", !m.anchor || m.rewound);
      break;
    case "kabraxis":
      if (m.pending) {
        add("purify_seal", "Thanh tẩy −3 Resonance", m.resonance < 3);
        add("break_seal", "Phá vỡ Seal");
      }
      break;
    case "deimoss":
      if (b.phase === 1)
        u.aliveUnits(x).forEach((k) =>
          select(
            "target_" + k,
            k + " " + m.targets[k].hp + "/" + m.targets[k].maxHp,
          ),
        );
      if (b.phase === 2 && m.cores.some((v) => v.choice == null)) {
        add("core_burn", "Thiêu hủy Core −1 MP", s.mana < 1, "decision");
        add("core_implant", "Cấy ghép Core", false, "decision");
        add("core_leave", "Bỏ mặc Core", false, "decision");
      }
      if (b.phase === 3 && m.planeTurns <= 0)
        trio("plane", ["Material", "Arcane", "Void"], () => false, "selector");
      break;
  }
  if (b.id === "astrogha")
    ["Trái", "Giữa", "Phải"].forEach((label, i) =>
      add(
        "zone" + i,
        "Sang " + label,
        m.targets.Web.hp > 0 || m.transfers.Web > b.round || m.zone === i,
        "action",
        "position",
      ),
    );
  return r;
}
function beamDue(x) {
  return (x.b.round + 1) % x.c.cycle === 0;
}
function blockedZone(x) {
  return x.m.siegeUntil > x.b.round ? x.m.siegeZone : null;
}
const pattern = (x) => x.m.pattern[(x.m.cursor || x.b.round) % 3];
function blocked(s, a) {
  if (!u.on(s.encounter)) return false;
  const x = u.current(s),
    { b, m } = x;
  if (b.id === "justicar" && m.verdictTurns <= 0) return true;
  if (
    b.id === "deimoss" &&
    ((b.phase === 3 && m.planeTurns <= 0) ||
      (b.phase === 2 && m.cores.some((v) => v.choice == null)))
  )
    return true;
  if (
    a === "skill" &&
    ((b.id === "justicar" && m.verdict === 2) ||
      (b.id === "phoboss" && m.dream >= 4 && b.round % 2 === 1))
  )
    return true;
  if (b.id === "nemesis" && m.lock === a && m.lockUntil > b.round) return true;
  if (a === "potion" && b.id === "deimoss" && m.plane === 2 && m.planeTurns > 0)
    return true;
  return false;
}
function act(s, action, ops) {
  const x = u.current(s),
    { m, b, e, c } = x,
    cmd = action.slice(("boss_" + b.id + "__").length);
  const offer = options(s).find((o) => o.action === action && !o.disabled);
  if (!offer) throw Error("INVALID_ACTION");
  const paid = (v) => u.cost(x, v, ops, true);
  const hurt = (v) => u.lose(x, s.maxHp * v, ops);
  let log = offer.label,
    skipCounter = false,
    dealt = 0;
  const strike = (rate) => {
    const n = Math.min(e.hp, Math.max(1, Math.floor(e.maxHp * rate)));
    e.hp -= n;
    dealt += n;
    log += " · " + n + " DMG chuẩn";
  };
  if (cmd.startsWith("target_")) {
    m.target = cmd.slice(7);
    return { selector: true, log };
  }
  if (cmd.startsWith("ward")) {
    if (m.ward === Number(cmd.slice(4))) throw Error("INVALID_ACTION");
    m.ward = Number(cmd.slice(4));
    return { selector: true, log };
  }
  if (cmd.startsWith("plane")) {
    m.plane = Number(cmd.slice(5));
    m.planeTurns = 3;
    return { selector: true, log };
  }
  if (cmd.startsWith("verdict")) {
    m.verdict = Number(cmd.slice(7));
    m.verdictTurns = 3;
    return { selector: true, log };
  }
  if (cmd.startsWith("core_")) {
    const core = m.cores.find((v) => v.choice == null);
    core.choice = cmd.slice(5);
    core.due = b.round + 2;
    if (core.choice === "burn") s.mana--;
    if (core.choice === "implant") {
      ops.addSource(s, { [core.stat]: core.amount }, "fleshCore");
      m.curses.push({
        type: core.curse,
        amount:
          core.curse === "skillHpCost"
            ? 0.01
            : core.curse === "healingReduction"
              ? 0.15
              : 0.05,
      });
    }
    return {
      selector: true,
      log:
        log +
        " · " +
        (core.choice === "implant"
          ? core.stat.toUpperCase() +
            " +" +
            core.amount +
            " / " +
            {
              damageTaken: "+5% DMG nhận",
              skillHpCost: "Skill trả 1% Max HP",
              healingReduction: "−15% hồi HP",
            }[core.curse]
          : "Core đã xử lý"),
    };
  }
  if (cmd.startsWith("echo_")) {
    u.cost(x, c.amount, ops);
    m.echoes.splice(Number(cmd.slice(5)), 1);
    return { selector: false, log, skipCounter: false };
  }
  switch (b.id) {
    case "butcher":
      if (cmd === "back") m.distance = Math.min(2, m.distance + 1);
      else {
        paid(0.05);
        m.chainCut = true;
      }
      break;
    case "machine":
      if (cmd === "vent") {
        m.heat = Math.max(0, m.heat - 35);
        m.shield = Math.min(2, m.shield + 1);
        u.healBoss(x, e.maxHp * 0.03);
      } else m.heat = Math.min(100, m.heat + 35);
      break;
    case "assur":
      if (cmd === "purify") {
        m.rune = false;
        u.open(x, c.amount);
        m.charges = 0;
        skipCounter = true;
      } else {
        if (Number(cmd.slice(5)) === m.pattern[m.cursor % 3])
          m.charges = Math.min(3, m.charges + 1);
        else hurt(c.power);
        m.cursor++;
      }
      break;
    case "control":
      if (Number(cmd.slice(9)) === m.pattern[m.cursor % 3]) {
        u.open(x, 2);
        m.cursor++;
        m.hints = 0;
        skipCounter = true;
      } else {
        hurt(c.power);
        m.hints = Math.min(2, m.hints + 1);
      }
      break;
    case "lucion":
      if (Number(cmd.slice(7)) === m.pattern[b.round % 3]) {
        m.will++;
        if (m.will >= 3) {
          u.open(x, 2);
          m.will = 0;
        }
        skipCounter = true;
      } else {
        hurt(c.power);
        u.healBoss(x, e.maxHp * 0.03);
      }
      break;
    case "bul_kathos":
      if (Number(cmd.slice(5)) === m.pattern[b.round % 3]) {
        u.open(x, 2);
        m.staggerUntil = b.round + 3;
        skipCounter = true;
      } else if (Number(cmd.slice(5)) === (m.pattern[b.round % 3] + 1) % 3) {
        strike(0.02);
        hurt(0.02);
        log += " · Hòa Clash: hai phía đổi DMG.";
      } else {
        m.clashWrong = true;
      }
      break;
    case "giyua":
      if (cmd === "nest_break") m.nests--;
      if (cmd === "nest_seal") {
        m.nests--;
        m.sealUntil = b.round + c.cycle + 1;
      }
      if (cmd === "nest_harvest") {
        ops.heal(s, s.maxHp * 0.04);
        s.mana = Math.min(s.maxMana, s.mana + 1);
        m.harvestDue = b.round + 2;
      }
      break;
    case "gharbad": {
      const trueSurrender = m.sign === m.surrenderRule;
      if (cmd === "accept" && trueSurrender) {
        ops.heal(s, s.maxHp * 0.05);
        s.mana = Math.min(s.maxMana, s.mana + 1);
        skipCounter = true;
      } else if (cmd === "search" && trueSurrender) {
        u.open(x, 2);
        skipCounter = true;
      } else if (cmd === "strike" && !trueSurrender) {
        strike(0.04);
        u.open(x, 2);
        skipCounter = true;
      } else {
        hurt(c.power);
        if (cmd === "accept") u.healBoss(x, e.maxHp * 0.03);
      }
      m.sign = (m.sign + 1) % 3;
      break;
    }
    case "phoboss":
      paid(c.amount);
      m.dream = Math.max(0, m.dream - 2);
      break;
    case "anomaly":
      if (cmd === "overload") {
        m.shards = [];
        u.open(x, 2);
        skipCounter = true;
      } else {
        const n = Number(cmd.slice(9));
        if (n === (b.round + (m.formOffset || 0)) % 3) {
          if (!m.shards.includes(n)) m.shards.push(n);
          skipCounter = true;
        } else {
          hurt(c.power);
          m.formOffset = ((m.formOffset || 0) + 1) % 3;
        }
      }
      break;
    case "zakarum": {
      const halo = cmd.slice(5);
      m.halos = m.halos.filter((k) => k !== halo);
      m.stolen = halo;
      m.stolenHalos.push(halo);
      m.haloUntil = b.round + 3;
      break;
    }
    case "uldyssian":
      s.mana--;
      m.timeline[Number(cmd.slice(8))] = "empty";
      break;
    case "xazax":
      m.portals--;
      if (cmd === "portal_take") {
        const n = Math.floor(e.maxHp * 0.04);
        e.hp = Math.max(0, e.hp - n);
        log += " · " + n + " DMG xuyên RES";
      }
      if (cmd === "portal_enter") {
        skipCounter = true;
        m.portalCurseUntil = b.round + 3;
      }
      break;
    case "samael":
      m.lights--;
      if (cmd === "seal_douse") s.mana--;
      else {
        hurt(0.05);
        m.stolen = Math.min(5, (m.stolen || 0) + 1);
      }
      break;
    case "death_projector":
      m.zone = Number(cmd.slice(4));
      skipCounter = true;
      break;
    case "buyard":
      m.heat = u.clamp(
        m.heat + (cmd === "shrink" ? c.amount : -c.amount),
        0,
        100,
      );
      break;
    case "bartuc":
      paid(c.amount);
      m.tether = false;
      u.open(x, 2);
      e.hp = Math.max(0, e.hp - m.golemDamage);
      m.golemDamage = 0;
      break;
    case "jitan":
      if (
        Number(cmd.slice(4)) === m.pattern[Math.floor(b.round / c.cycle) % 3]
      ) {
        m.gateOpen = true;
        u.open(x, c.amount);
        skipCounter = true;
      } else {
        m.towers = Math.min(3, m.towers + 1);
        hurt(c.power);
      }
      break;
    case "greater_riftwalker":
      m.near = !m.near;
      skipCounter = true;
      break;
    case "athulua":
      m.zone = Number(cmd.slice(4));
      skipCounter = true;
      break;
    case "lilith": {
      const i = Number(cmd.slice(7)),
        rates = [0.05, 0.1, 0.2];
      m.healDebt = u.cost(x, rates[i], ops);
      m.bargain = i + 2;
      m.bargainBonus = c.power * (i + 1);
      break;
    }
    case "azmodan":
      if (cmd === "reflect") {
        s.mana--;
        m.reflected = true;
      } else {
        s.potions--;
        m.mark = 3;
        m.reflected = false;
        m.extinguished = true;
      }
      break;
    case "dark_star_dragon":
      m.cover = Number(cmd.slice(5));
      skipCounter = true;
      break;
    case "juris_khan":
      m.position = u.clamp(m.position + (cmd === "forward" ? 1 : -1), 0, 3);
      m.still = 0;
      break;
    case "baal":
      m.purity--;
      {
        const i = Number(cmd.slice(6));
        if (i === 0) m.corruption = 0;
        if (i === 1) {
          s.mana = Math.min(s.maxMana, s.mana + m.inferno);
          m.inferno = 0;
        }
        if (i === 2) m.vision = 0;
      }
      break;
    case "belial":
      if (
        Number(cmd.slice(3)) === m.pattern[Math.floor(b.round / c.cycle) % 3]
      ) {
        u.open(x, 2);
        skipCounter = true;
      } else {
        m.deception = Math.min(5, m.deception + 1);
        hurt(c.power);
      }
      break;
    case "astrogha":
      m.zone = Number(cmd.slice(4));
      break;
    case "atanna":
      m.dreams[Number(cmd.slice(5))] = null;
      m.erased = true;
      break;
    case "inarius":
      if (cmd === "pull") {
        m.inarius = m.ritual;
        m.lilith = m.ritual;
        u.open(x, 2);
      } else {
        m.protectUntil = b.round + 3;
        m.lilithHp = Math.min(u.LILITH_MAX_HP, m.lilithHp + 15);
      }
      break;
    case "sescheron":
      m.input.push(Number(cmd.slice(4)));
      if (m.input.length === 3) {
        if (m.input.every((v, i) => v === m.code[i])) {
          u.open(x, 2);
          m.rage = 0;
          skipCounter = true;
        } else {
          m.rage = Math.min(5, m.rage + 1);
          hurt(c.power);
        }
        m.input = [];
        m.hints = 0;
        m.code = m.code.slice(1).concat(m.code[0]);
      }
      break;
    case "nithogur":
      if (cmd === "anchor") {
        m.anchor = { hp: s.hp, mana: s.mana, enemyHp: e.hp };
        m.anchorUsed = true;
      } else {
        s.hp = u.clamp(m.anchor.hp, 1, s.maxHp);
        s.mana = u.clamp(m.anchor.mana, 0, s.maxMana);
        e.hp = u.clamp(m.anchor.enemyHp, 1, e.maxHp);
        m.rewound = true;
      }
      break;
    case "kabraxis":
      if (cmd === "purify_seal") {
        m.resonance -= 3;
        m.seals.push("purified");
      } else m.seals.push("broken");
      m.pending = false;
      skipCounter = true;
      break;
    default:
      throw Error("INVALID_ACTION");
  }
  m.skipCounter = skipCounter;
  return { selector: false, log, skipCounter, dealt };
}
module.exports = {
  options,
  free,
  blocked,
  act,
  beamDue,
  blockedZone,
  pattern,
  key,
};
