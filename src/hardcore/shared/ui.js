"use strict";
const { E, passiveIcon } = require("./icons");
const money = (n) => Math.floor(n).toLocaleString("vi-VN");
const statNumber = (n) => Number(Number(n).toFixed(1));
const STAT_SEPARATOR = "  •  ";
function highlightStat(label) {
  const match = label.match(
    /^(<a?:\w+:\d+>|\p{Extended_Pictographic}\uFE0F?)\s+(.+)$/u,
  );
  return match ? `${match[1]} **${match[2]}**` : `**${label}**`;
}
function formatStatText(text) {
  const labels = {
    "Max HP": E.hp,
    "Max MP": E.mana,
    "DMG vật lý": E.attack,
    "DMG phép": E.magic,
    "Sức chứa bình": passiveIcon("potionCapacity"),
    HP: E.hp,
    MP: E.mana,
    STR: E.str,
    DEX: E.dex,
    VIT: E.vit,
    ENE: E.ene,
    "DEF/RES": E.defres,
    DEF: E.defense,
    RES: E.res,
    ACC: E.accuracy,
    EVA: E.evasion,
    CRIT: E.crit,
    LUCK: E.luck,
    DMG: E.attack,
    Payout: E.payout,
  };
  // Preserve existing emoji markup and emphasis; format only plain text.
  return text
    .split(/(<a?:\w+:\d+>|\*\*[^*]*\*\*|`[^`]*`)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(
            /(?<![\p{L}\p{N}_])(Sức chứa bình|Max HP|Max MP|DMG vật lý|DMG phép|HP|MP|STR|DEX|VIT|ENE|DEF\/RES|DEF|RES|ACC|EVA|CRIT|LUCK|DMG|Payout)(?![\p{L}\p{N}_])/gu,
            (label) => highlightStat(`${labels[label]} ${label}`),
          ),
    )
    .join("");
}
function healthBar(hp, maxHp) {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const filled =
    ratio >= 1
      ? 10
      : ratio > 0
        ? Math.max(1, Math.min(9, Math.round(ratio * 10)))
        : 0;
  return `${E.hp} **HP** \`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` **${statNumber(hp).toLocaleString("vi-VN")}/${statNumber(maxHp).toLocaleString("vi-VN")}**`;
}
// Repair floating-point tails in saved display text without touching grouped money,
// emoji IDs, URLs, version strings, or the underlying combat state.
function roundStatText(text) {
  return text
    .split(/(<a?:\w+:\d+>|https?:\/\/[^\s)]+)/g)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(
            /(?<![\p{L}\p{N}_.])[-+]?\d+(?:\.\d+)+(?![\p{L}\p{N}_.])/gu,
            (token) => {
              const pieces = token.split(".");
              return pieces.length === 2 && pieces[1].length >= 4
                ? (token.startsWith("+") ? "+" : "") +
                    String(statNumber(Number(token)))
                : token;
            },
          ),
    )
    .join("");
}
function addTextFields(
  embed,
  name,
  text,
  inline = false,
  { keepLists = false } = {},
) {
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
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (keepLists && lines[i + 1]?.startsWith("- ")) {
      let end = i + 1;
      while (lines[end]?.startsWith("- ")) end++;
      const block = lines.slice(i, end).join("\n");
      if (block.length <= limit) {
        blocks.push(block);
        i = end - 1;
        continue;
      }
    }
    blocks.push(lines[i]);
  }
  for (const line of blocks) {
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

module.exports = {
  statNumber,
  roundStatText,
  healthBar,
  addTextFields,
  highlightStat,
  formatStatText,
  STAT_SEPARATOR,
};
