"use strict";
const { E } = require("./hardcoreIcons");
const money = (n) => Math.floor(n).toLocaleString("vi-VN");
const STAT_SEPARATOR = "  •  ";
function highlightStat(label) {
  const match = label.match(
    /^(<a?:\w+:\d+>|\p{Extended_Pictographic}\uFE0F?)\s+(.+)$/u,
  );
  return match ? `${match[1]} **${match[2]}**` : `**${label}**`;
}
function healthBar(hp, maxHp) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const filled =
    ratio >= 1
      ? 10
      : ratio > 0
        ? Math.max(1, Math.min(9, Math.round(ratio * 10)))
        : 0;
  return `${E.hp} **HP** \`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` **${money(hp)}/${money(maxHp)}**`;
}
function addTextFields(embed, name, text, inline = false) {
  const limit = 1024;
  let chunk = "";
  let first = true;
  const lines = text.split("\n").flatMap((line) => {
    const parts = [];
    while (line.length > limit) {
      const space = line.lastIndexOf(" ", limit);
      const end = space > 0 ? space : limit;
      parts.push(line.slice(0, end));
      line = line.slice(end).trimStart();
    }
    return [...parts, line];
  });
  for (const line of lines) {
    if (chunk.length + line.length + 1 > limit && chunk) {
      embed.addFields({
        name: first ? name : "\u200b",
        value: chunk,
        inline,
      });
      first = false;
      chunk = "";
    }
    chunk += `${chunk ? "\n" : ""}${line}`;
  }
  if (chunk)
    embed.addFields({
      name: first ? name : "\u200b",
      value: chunk,
      inline,
    });
}

module.exports = { healthBar, addTextFields, highlightStat, STAT_SEPARATOR };
