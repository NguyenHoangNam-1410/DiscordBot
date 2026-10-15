"use strict";
const core = require("../src/hardcore/engine"),
  u = require("../src/hardcore/bosses/mechanicsV2");
const boss = require("../src/hardcore/bosses/mechanics"),
  old = require("./hardcore-boss-policy");
function choose(s) {
  if (!u.on(s.encounter)) return old.choose(s);
  const { b, m, c, e } = u.current(s),
    options = core.actions(s).filter((a) => !a.disabled),
    has = (a) => options.some((o) => o.action === a);
  const offer = (cmd) => "boss_" + b.id + "__" + cmd,
    go = (cmd) => (has(offer(cmd)) ? offer(cmd) : null);
  let cmd = null;
  if (m.targets) {
    let priority =
      b.id === "necrobot"
        ? [
            "Weapon",
            ["sorceress", "necromancer", "venance"].includes(s.classKey)
              ? "Barrier"
              : "Plating",
            "boss",
          ]
        : b.id === "akarat"
          ? ["Wrath", "Mercy", "Faith", "boss"]
          : b.id === "manoruk"
            ? ["Ritualist", "Commander", "Vanguard", "boss"]
            : b.id === "lazarus"
              ? ["Restoration", "Drain", "Tremor", "boss"]
              : b.id === "astrogha"
                ? ["Brood", "Venom", "Web", "boss"]
                : ["Hunger", "Silence", "Ruin"];
    const target = priority.find((k) => has(offer("target_" + k)));
    if (target && m.target !== target) return go("target_" + target);
  }
  if (b.id === "quov") {
    const ward = u.elementPlan(u.current(s))[0];
    if (m.ward !== ward) return go("ward" + ward);
  }
  if (b.id === "justicar" && m.verdictTurns <= 0)
    return go(
      "verdict" +
        (["sorceress", "necromancer", "venance"].includes(s.classKey) ? 1 : 0),
    );
  if (b.id === "deimoss") {
    if (b.phase === 2 && m.cores.some((v) => v.choice == null))
      return go("core_burn") || go("core_leave");
    if (b.phase === 3 && m.planeTurns <= 0)
      return go(
        "plane" +
          (["sorceress", "necromancer", "venance"].includes(s.classKey)
            ? 1
            : 0),
      );
  }
  if (b.id === "death_projector" && m.zone === u.beamZone(u.current(s)))
    cmd = "zone" + ((m.zone + 1) % 3);
  if (
    b.id === "greater_riftwalker" &&
    u.dec.beamDue(u.current(s)) &&
    m.near !== u.stormNear(u.current(s))
  )
    cmd = "position";
  if (b.id === "dark_star_dragon" && u.dec.beamDue(u.current(s)))
    cmd = "cover" + m.pillars.findIndex((v) => v > 0);
  if (
    s.classKey === "venance" &&
    b.id === "inarius" &&
    m.lilithHp <= 25 &&
    m.protectUntil <= b.round + 1
  )
    return go("protect");
  if (s.classKey !== "venance" && b.id === "inarius" && m.lilithHp <= 35)
    cmd = "protect";
  if (
    b.id === "inarius" &&
    !u.isOpen(u.current(s)) &&
    (m.inarius !== m.ritual || m.lilith !== m.ritual)
  )
    cmd = "pull";
  if (
    b.id === "athulua" &&
    (m.zone === u.arrowZone(u.current(s)) ||
      m.zone === (u.arrowZone(u.current(s)) + 1) % 3 ||
      m.zone === u.dec.blockedZone(u.current(s)))
  )
    cmd =
      "zone" +
      [0, 2, 1].find(
        (n) =>
          n !== u.arrowZone(u.current(s)) &&
          n !== (u.arrowZone(u.current(s)) + 1) % 3 &&
          n !== u.dec.blockedZone(u.current(s)),
      );
  if (cmd && go(cmd)) {
    if (s.classKey === "venance" && cmd === "pull")
      return require("./hardcore-venance-policy").chooseBoss(s, go(cmd));
    return go(cmd);
  }
  const p = core.incomingPreview(s),
    skill = s.classKey === "venance" ? null : core.skillDamagePreview(s),
    attack = s.classKey === "venance" ? null : core.attackDamagePreview(s);
  if (
    s.classKey !== "venance" &&
    has("potion") &&
    s.hp < Math.max(p.high * 2, s.maxHp * 0.4) &&
    s.maxHp - s.hp >= s.maxHp * 0.25
  )
    return "potion";
  if (b.id === "assur" && !u.isOpen(u.current(s)))
    cmd = m.charges >= 3 ? "purify" : "sigil" + m.pattern[m.cursor % 3];
  if (b.id === "control" && m.hints >= 2 && !u.isOpen(u.current(s)))
    cmd = "frequency" + m.pattern[m.cursor % 3];
  if (b.id === "lucion" && !u.isOpen(u.current(s)))
    cmd = "command" + m.pattern[b.round % 3];
  if (b.id === "bul_kathos" && (m.staggerUntil || 0) <= b.round)
    cmd = "clash" + m.pattern[b.round % 3];
  if (b.id === "giyua" && m.nests > 1) cmd = "nest_seal";
  if (b.id === "gharbad" && !u.isOpen(u.current(s)))
    cmd = m.sign === m.surrenderRule ? "search" : "strike";
  if (b.id === "phoboss" && m.dream >= 4 && s.hp > 2 * p.high) cmd = "wake";
  if (b.id === "anomaly" && !u.isOpen(u.current(s)) && m.shards.length === 3)
    cmd = "overload";
  if (
    b.id === "anomaly" &&
    !u.isOpen(u.current(s)) &&
    !m.shards.includes((b.round + (m.formOffset || 0)) % 3)
  )
    cmd = "stabilize" + ((b.round + (m.formOffset || 0)) % 3);
  if (b.id === "zakarum" && m.halos.length && m.halos.includes("Might"))
    cmd = "halo_Might";
  if (b.id === "xazax" && m.portals >= 2) cmd = "portal_take";
  if (b.id === "samael" && m.lights >= 3) cmd = "seal_douse";
  if (b.id === "buyard")
    cmd = m.heat < 40 ? "shrink" : m.heat > 70 ? "expand" : null;
  if (b.id === "bartuc" && m.tether && s.hp > s.maxHp * 0.2) cmd = "cut";
  if (b.id === "jitan" && !u.isOpen(u.current(s)))
    cmd = "gate" + m.pattern[Math.floor(b.round / c.cycle) % 3];
  if (b.id === "azmodan" && m.mark === 1 && !m.reflected) cmd = "reflect";
  if (b.id === "baal" && m.purity > 0)
    cmd =
      m.corruption >= 2
        ? "purify0"
        : m.inferno >= 2
          ? "purify1"
          : m.vision
            ? "purify2"
            : null;
  if (b.id === "belial" && !u.isOpen(u.current(s)))
    cmd = "lie" + m.pattern[Math.floor(b.round / c.cycle) % 3];
  if (b.id === "atanna" && !m.erased)
    cmd =
      "erase" +
      (s.hp < s.maxHp * 0.4 ? m.dreams.indexOf(0) : m.dreams.indexOf(2));
  if (b.id === "sescheron" && !u.isOpen(u.current(s)) && m.hints >= 3)
    cmd = "rune" + m.code[m.input.length];
  if (b.id === "kabraxis" && m.pending && m.resonance >= 3) cmd = "purify_seal";
  if (s.classKey === "venance")
    return require("./hardcore-venance-policy").chooseBoss(s, cmd && go(cmd));
  if (cmd && go(cmd)) return go(cmd);
  if (
    has("skill") &&
    ["assassin", "necromancer", "paladin", "druid"].includes(s.classKey)
  )
    return "skill";
  if (
    has("skill") &&
    (skill.low + skill.high) / 2 > (attack.low + attack.high) / 2
  )
    return "skill";
  if (has("attack")) return "attack";
  if (has("skill")) return "skill";
  if (has("defend")) return "defend";
  return options.find((a) => a.action !== "retreat")?.action || null;
}
module.exports = { VERSION: 2, choose };
