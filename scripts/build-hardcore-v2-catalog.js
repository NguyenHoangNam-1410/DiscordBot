// Reproducible import of the reviewed release specification, not a runtime dependency.
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../docs/releases/hardcore-2.0.0-spec.md"),
  "utf8",
);
const catalog = { common: [], rare: [], legendary: [], cursed: [] };
const rarityCodes = { common: "R", rare: "SR", legendary: "SSR", cursed: "UR" };
let rarity;
function parse(text) {
  const effects = {};
  for (const match of text.matchAll(/([+-]\d+) (STR|DEX|VIT|ENE)/g))
    effects[match[2].toLowerCase()] = Number(match[1]);
  const patterns = {
    luck: /([+-]\d+) Luck/,
    maxMana: /([+-]\d+) Max Mana/,
    mimicDetection: /([+-]\d+)% phát hiện Mimic/,
    goblinChance: /([+-]\d+)% bắt Goblin/,
    legendaryFind: /([+-]\d+)% tìm SSR/,
    potionPower: /([+-]\d+)% (?:hiệu lực bình|hiệu lực bình máu)/,
    bossDamage: /([+-]\d+)% damage Boss/,
    eliteDamage: /([+-]\d+)% damage Elite/,
    resistance: /([+-]\d+) Resistance/,
    mimicChance: /([+-]\d+)% Mimic/,
  };
  for (const [key, regex] of Object.entries(patterns)) {
    const m = regex.exec(text);
    if (m)
      effects[key] =
        Number(m[1]) /
        (["luck", "maxMana", "resistance"].includes(key) ? 1 : 100);
  }
  if (/Defense = 0/.test(text)) effects.defenseSet = 0;
  const hpLoss = /mất (\d+)% Max HP/.exec(text);
  if (hpLoss) effects.floorHpLoss = Number(hpLoss[1]) / 100;
  const payout = /mất (\d+)% payout/.exec(text);
  if (payout) effects.bonusPenalty = Number(payout[1]) / 100;
  const damage = /nhận thêm (\d+)% damage/.exec(text);
  if (damage) effects.damageTaken = Number(damage[1]) / 100;
  const potions = /\+(\d+) bình/.exec(text);
  if (potions) effects.potions = Number(potions[1]);
  const ticket = /\+(\d+) Vé/.exec(text);
  if (ticket) effects.escapeTokens = Number(ticket[1]);
  const heal = /hồi (\d+) HP/.exec(text);
  if (heal) effects.heal = Number(heal[1]);
  return effects;
}
for (const line of source.split(/\r?\n/)) {
  const heading = /^### 14\.(\d)/.exec(line);
  if (heading) rarity = Object.keys(catalog)[Number(heading[1]) - 1];
  if (/^## 15/.test(line)) break;
  if (!rarity || !line.startsWith("| ")) continue;
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((x) => x.trim());
  if (!["weapon", "armor", "jewelry", "charm", "utility"].includes(cells[1]))
    continue;
  const [name, category, attributes, special, curseText] = cells;
  const id = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  catalog[rarity].push({
    id,
    name,
    category,
    rarity,
    typeCode: rarityCodes[rarity],
    catalogVersion: 2,
    effects: { ...parse(attributes), ...parse(special) },
    text: [attributes, special]
      .filter((x) => !["Không có", "Không cộng thuộc tính"].includes(x))
      .join(" · "),
    curse:
      rarity === "cursed"
        ? { id: `${id}_curse`, effects: parse(curseText), text: curseText }
        : null,
  });
}
const counts = Object.values(catalog).map((x) => x.length);
if (counts.join(",") !== "32,28,24,16")
  throw new Error(`INVALID_COUNTS:${counts}`);
const output = `"use strict";\n// Sinh tồn 2.0.0 — generated from docs/releases/hardcore-2.0.0-spec.md.\nconst ITEMS = ${JSON.stringify(catalog, null, 2)};\nconst TYPE_CODES = Object.freeze(${JSON.stringify(rarityCodes)});\nfunction validateItems(catalog = ITEMS) {\n  const ids = new Set();\n  for (const [rarity, count] of Object.entries({common:32,rare:28,legendary:24,cursed:16})) {\n    if (catalog[rarity]?.length !== count) throw new Error('INVALID_HARDCORE_ITEM_COUNT');\n    for (const item of catalog[rarity]) {\n      if (ids.has(item.id) || item.rarity !== rarity || !Object.keys(item.effects).length || (rarity === 'cursed' && !Object.keys(item.curse?.effects || {}).length)) throw new Error('INVALID_HARDCORE_ITEM:'+item.id);\n      for (const value of Object.values({...item.effects,...item.curse?.effects})) if (!Number.isFinite(value)) throw new Error('INVALID_HARDCORE_EFFECT');\n      ids.add(item.id);\n    }\n  }\n  return true;\n}\nvalidateItems();\nfor (const pool of Object.values(ITEMS)) { for (const item of pool) { Object.freeze(item.effects); if(item.curse) {Object.freeze(item.curse.effects); Object.freeze(item.curse);} Object.freeze(item); } Object.freeze(pool); }\nObject.freeze(ITEMS);\nmodule.exports = { ITEMS, TYPE_CODES, validateItems };\n`;
fs.writeFileSync(path.join(__dirname, "../src/hardcore/item.js"), output);
console.log("Sinh tồn v2 catalog:", counts.join("/"), "items");
