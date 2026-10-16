"use strict";
// Presentation is captured alongside gameplay state; reading new frames never reruns rules.
function capture(s) {
  const rift = require("../rift"),
    icons = require("../shared/icons"),
    stats = require("../engine/stats");
  const format = (n) => Number(Number(n).toFixed(1)).toLocaleString("vi-VN");
  const ui = require("../ui/rift")({
    stats,
    paradox: require("../events/paradox"),
    E: icons.E,
    SKILL_ICONS: icons.SKILL_ICONS,
    eventIcon: icons.eventIcon,
    percent: (n) => format(n * 100) + "%",
    money: format,
  });
  const names = {
    stone_skin: "Stone Skin",
    elemental_dominion: "Elemental Dominion",
    bloodlust: "Bloodlust",
    unstable_rift: "Unstable Rift",
    fortified: "Fortified",
    swift_horror: "Swift Horror",
    soul_drain: "Soul Drain",
    cursed_ground: "Cursed Ground",
  };
  const rifts = Object.entries(s.rift?.stacks || s.modifiers || {})
    .filter(([, n]) => n > 0)
    .map(([key, n]) => ({
      title: (names[key] || key) + " ×" + n,
      text:
        rift.enabled(s) && rift.KEYS.includes(key)
          ? rift.description(key, n, s)
          : "Snapshot này chỉ ghi số stack, chưa có diễn giải chi tiết luật Rift.",
    }));
  const effects = [];
  const add = (title, text) => {
    if (text) effects.push({ title, text });
  };
  add("Rift Paradox", ui.paradoxEffectText(s));
  add("Rift Contract", ui.contractEffectText(s));
  if (ui.classShrineActive(s))
    add(
      "Phước lành nhân vật",
      "Đang có hiệu lực từ tầng " +
        s.classShrine.from +
        " đến tầng " +
        s.classShrine.until +
        "; chưa sử dụng.",
    );
  for (const field of require("../towerMemories").fields(s))
    add(field.name, field.value);
  if (require("../innate").enabled(s))
    add("Nội tại", require("../innate").description(s));
  if (require("../awakening").active(s))
    add("Thức tỉnh", require("../awakening").description(s));
  if (require("../characters/venance").enabled(s))
    add("Cường hóa / Hồi lưu", require("../characters/venance").status(s));
  return { version: 1, rifts, effects };
}
module.exports = { capture };
