// Reproducible import of the reviewed release specification, not a runtime dependency.
const fs = require("node:fs");
const passives = require("../src/hardcore/itemPassives");
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
    defense: /([+-]\d+) Defense/,
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
        (["luck", "maxMana", "resistance", "defense"].includes(key) ? 1 : 100);
  }
  if (/Defense = 0/.test(text)) effects.defenseSet = 0;
  const hpLoss = /mất (\d+)% Max HP/.exec(text);
  if (hpLoss) effects.floorHpLoss = Number(hpLoss[1]) / 100;
  const payout = /mất (\d+)% payout/.exec(text);
  if (payout) effects.bonusPenalty = Number(payout[1]) / 100;
  const damage = /nhận thêm (\d+)% damage/.exec(text);
  if (damage) {
    const key = /damage vật lý/.test(text)
      ? "physicalDamageTaken"
      : /damage phép/.test(text)
        ? "magicDamageTaken"
        : "damageTaken";
    effects[key] = Number(damage[1]) / 100;
  }
  const cursePatterns = {
    potionCapacityLoss: [/giảm (\d+) sức chứa bình/, 1],
    skillHpCost: [/Skill tốn (\d+)% Max HP/, 100],
    attackManaLoss: [/Tấn công hồi ít hơn (\d+) MP/, 1],
    skillManaExtra: [/Skill tốn thêm (\d+) MP/, 1],
    combatManaLoss: [/khi vào combat mất (\d+) MP/, 1],
    healingReduction: [/lượng HP hồi cho bạn giảm (\d+)%/, 100],
    normalDamagePenalty: [
      /DMG Tấn công\/Skill lên quái thường giảm (\d+)%/,
      100,
    ],
  };
  for (const [key, [pattern, scale]] of Object.entries(cursePatterns)) {
    const found = pattern.exec(text);
    if (found) effects[key] = Number(found[1]) / scale;
  }
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
    passive: passives.PASSIVES[id],
    effects: { ...parse(attributes), ...parse(special) },
    text: [attributes, special]
      .filter((x) => !["Không có", "Không cộng thuộc tính"].includes(x))
      .join(" · ")
      .replace(/Max Mana/g, "Max MP"),
    curse:
      rarity === "cursed"
        ? {
            id: `${id}_curse`,
            effects: parse(curseText),
            text: curseText.replace(/Max Mana/g, "Max MP"),
          }
        : null,
  });
}
const aliasSection =
  source.split("### 14.5. Gộp mã item cũ")[1]?.split("## 15.")[0] || "";
const aliases = Object.fromEntries(
  [...aliasSection.matchAll(/^\| ([a-z0-9_]+) \| ([a-z0-9_]+) \|\r?$/gm)].map(
    (m) => [m[1], m[2]],
  ),
);
const counts = Object.values(catalog).map((x) => x.length);
if (counts.join(",") !== "10,13,24,16")
  throw new Error(`INVALID_COUNTS:${counts}`);
const output = `"use strict";\n// Sinh tồn 2.0.0 — generated from docs/releases/hardcore-2.0.0-spec.md.\nconst passives = require("./itemPassives");\nconst ITEMS = ${JSON.stringify(catalog, null, 2)};\nconst TYPE_CODES = Object.freeze(${JSON.stringify(rarityCodes)});\nfunction validateItems(catalog = ITEMS) {\n  const ids = new Set();\n  for (const [rarity, count] of Object.entries({common:10,rare:13,legendary:24,cursed:16})) {\n    if (catalog[rarity]?.length !== count) throw new Error('INVALID_HARDCORE_ITEM_COUNT');\n    const targets = new Set();\n    for (const item of catalog[rarity]) {\n      if (rarity === "common" || rarity === "rare") { const keys = Object.keys(item.effects); if (keys.length !== 1 || targets.has(keys[0]) || item.effects[keys[0]] <= 0) throw new Error("DUPLICATE_HARDCORE_ITEM_ROLE:"+item.id); targets.add(keys[0]); }\n      if (ids.has(item.id) || item.rarity !== rarity || !Object.keys(item.effects).length || (rarity === 'cursed' && !Object.keys(item.curse?.effects || {}).length)) throw new Error('INVALID_HARDCORE_ITEM:'+item.id);\n      for (const value of Object.values({...item.effects,...item.curse?.effects})) if (!Number.isFinite(value)) throw new Error('INVALID_HARDCORE_EFFECT');\n      passives.validate(item.passive);\n      ids.add(item.id);\n    }\n  }\n  return true;\n}\nvalidateItems();\nconst ITEM_ALIASES = Object.freeze(${JSON.stringify(aliases, null, 2)});\nconst definitions = new Map(Object.values(ITEMS).flat().map(item => [item.id, item]));\nfor (const [oldId, targetId] of Object.entries(ITEM_ALIASES)) if (definitions.has(oldId) || !definitions.has(targetId)) throw new Error("INVALID_HARDCORE_ITEM_ALIAS:"+oldId);\nfunction resolveItemId(id) { return Object.hasOwn(ITEM_ALIASES, id) ? ITEM_ALIASES[id] : id; }\nfor (const pool of Object.values(ITEMS)) { for (const item of pool) { Object.freeze(item.effects); Object.freeze(item.passive.scopes); Object.freeze(item.passive); if(item.curse) {Object.freeze(item.curse.effects); Object.freeze(item.curse);} Object.freeze(item); } Object.freeze(pool); }\nObject.freeze(ITEMS);\nmodule.exports = { ITEMS, TYPE_CODES, ITEM_ALIASES, resolveItemId, validateItems };\n`;
fs.writeFileSync(path.join(__dirname, "../src/hardcore/item.js"), output);
console.log("Sinh tồn v2 catalog:", counts.join("/"), "items");
