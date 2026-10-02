const { db } = require("../db");
const hardcoreRepository = require("./hardcoreRepository");

const SURVIVAL_FRAMES = Object.freeze([
  {
    id: "survival_silver",
    name: "Khung Bạc",
    floor: 333,
    colors: ["#687481", "#f3f7fc", "#a7b3c0", "#ffffff", "#687481"],
  },
  {
    id: "survival_gold",
    name: "Khung Vàng",
    floor: 666,
    colors: ["#926213", "#ffec9b", "#d6a72f", "#fff4b8", "#926213"],
  },
  {
    id: "survival_diamond",
    name: "Khung Kim cương",
    floor: 999,
    colors: ["#528cc7", "#efffff", "#82e9f5", "#e6ceff", "#528cc7"],
  },
]);

const CATALOG = Object.freeze([
  {
    id: "color_black",
    type: "color",
    emoji: "⚫",
    name: "Đen Huyền",
    value: "#334155",
  },
  {
    id: "color_blue",
    type: "color",
    emoji: "🔵",
    name: "Xanh Lam",
    value: "#38bdf8",
  },
  {
    id: "color_brown",
    type: "color",
    emoji: "🟤",
    name: "Nâu Đất",
    value: "#92400e",
  },
  {
    id: "color_green",
    type: "color",
    emoji: "🟢",
    name: "Xanh Lá",
    value: "#22c55e",
  },
  {
    id: "color_orange",
    type: "color",
    emoji: "🟠",
    name: "Cam Tươi",
    value: "#f97316",
  },
  {
    id: "color_purple",
    type: "color",
    emoji: "🟣",
    name: "Tím Huyền Bí",
    value: "#a855f7",
  },
  {
    id: "color_red",
    type: "color",
    emoji: "🔴",
    name: "Đỏ Rực",
    value: "#ef4444",
  },
  {
    id: "color_white",
    type: "color",
    emoji: "⚪",
    name: "Trắng Sáng",
    value: "#f8fafc",
  },
  {
    id: "color_yellow",
    type: "color",
    emoji: "🟡",
    name: "Vàng Kim",
    value: "#fbbf24",
  },
  {
    id: "color_violet",
    type: "color",
    emoji: "🟣",
    name: "Tím Huyền Bí",
    value: "#a855f7",
    rarity: "epic",
    shopEligible: false,
  },
  {
    id: "color_gold",
    type: "color",
    emoji: "🟡",
    name: "Vàng Kim",
    value: "#fbbf24",
    rarity: "rare",
    shopEligible: false,
  },
  {
    id: "color_cyan",
    type: "color",
    emoji: "🔵",
    name: "Xanh Cyan",
    value: "#22d3ee",
    rarity: "epic",
    shopEligible: false,
  },
  {
    id: "color_rose",
    type: "color",
    emoji: "🔴",
    name: "Hồng Rose",
    value: "#f472b6",
    rarity: "epic",
    shopEligible: false,
  },
  {
    id: "color_emerald",
    type: "color",
    emoji: "🟢",
    name: "Lục Bảo",
    value: "#34d399",
    rarity: "rare",
    shopEligible: false,
  },
  {
    id: "color_century",
    type: "color",
    emoji: "✨",
    name: "Hào Quang Bách Cấp",
    value: "#ff4fd8",
    rarity: "mythic",
    shopEligible: false,
  },
]);
const BY_ID = new Map(CATALOG.map((item) => [item.id, item]));
if (BY_ID.has("color_purple") && !BY_ID.has("color_violet"))
  BY_ID.set("color_violet", BY_ID.get("color_purple"));
if (BY_ID.has("color_yellow") && !BY_ID.has("color_gold"))
  BY_ID.set("color_gold", BY_ID.get("color_yellow"));
const DEFAULT_IDS = Object.freeze(["color_red"]);
const grantStatement = db.prepare(
  "INSERT OR IGNORE INTO profile_cosmetics (guild_id,user_id,cosmetic_id,acquired_at) VALUES (?,?,?,?)",
);
const loadoutStatement = db.prepare(
  "SELECT * FROM profile_loadouts WHERE guild_id=? AND user_id=?",
);
const ensureProfileTx = db.transaction((guildId, userId, now) => {
  grantStatement.run(guildId, userId, "color_red", now);
  db.prepare(
    "INSERT OR IGNORE INTO user_inventory (guild_id,user_id,item_id,quantity,acquired_at,updated_at) VALUES (?,?,'color_red',1,?,?)",
  ).run(guildId, userId, now, now);
  db.prepare(
    "INSERT OR IGNORE INTO profile_loadouts (guild_id,user_id,color_id,updated_at) VALUES (?,?,'color_red',?)",
  ).run(guildId, userId, now);
  return loadoutStatement.get(guildId, userId);
});
function ensureProfile(guildId, userId, now = Date.now()) {
  return ensureProfileTx(String(guildId), String(userId), now);
}
function ownsCosmetic(guildId, userId, cosmeticId) {
  const item = getCosmetic(cosmeticId);
  const ids = item ? [item.id, String(cosmeticId)] : [String(cosmeticId)];
  const placeholders = ids.map(() => "?").join(",");
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM profile_cosmetics WHERE guild_id=? AND user_id=? AND cosmetic_id IN (${placeholders})`,
      )
      .get(String(guildId), String(userId), ...ids),
  );
}
function getCosmetic(cosmeticId) {
  return BY_ID.get(String(cosmeticId)) || null;
}
function grantCosmetic(guildId, userId, cosmeticId, now = Date.now()) {
  const item = getCosmetic(cosmeticId);
  if (!item) throw new Error("UNKNOWN_COSMETIC");
  ensureProfile(guildId, userId, now);
  const result = grantStatement.run(
    String(guildId),
    String(userId),
    item.id,
    now,
  );
  return { item, newlyOwned: result.changes > 0 };
}
function equipCosmetic(guildId, userId, cosmeticId, now = Date.now()) {
  const item = getCosmetic(cosmeticId);
  if (!item) throw new Error("UNKNOWN_COSMETIC");
  ensureProfile(guildId, userId, now);
  if (!ownsCosmetic(guildId, userId, item.id))
    throw new Error("COSMETIC_NOT_OWNED");
  db.prepare(
    "UPDATE profile_loadouts SET color_id=?,updated_at=? WHERE guild_id=? AND user_id=?",
  ).run(item.id, now, String(guildId), String(userId));
  return getProfileAppearance(guildId, userId);
}
function getOwnedCosmetics(guildId, userId) {
  ensureProfile(guildId, userId);
  return db
    .prepare(
      "SELECT cosmetic_id,acquired_at FROM profile_cosmetics WHERE guild_id=? AND user_id=? ORDER BY acquired_at,cosmetic_id",
    )
    .all(String(guildId), String(userId))
    .map((row) => ({ ...row, item: getCosmetic(row.cosmetic_id) }))
    .filter((row) => row.item);
}
function getProfileAppearance(guildId, userId) {
  const row = ensureProfile(guildId, userId);
  const record = hardcoreRepository.getRecord(guildId, userId);
  const session = hardcoreRepository.getByUser(guildId, userId);
  const state = session ? hardcoreRepository.parseState(session) : null;
  const activeFloor = state
    ? Math.min(state.cleared || 0, state.finalBossDefeated ? 999 : 998)
    : 0;
  const bestFloor = Math.max(record?.best_floor || 0, activeFloor);
  const frame =
    [...SURVIVAL_FRAMES].reverse().find((item) => bestFloor >= item.floor) ||
    null;
  return {
    color: getCosmetic(row.color_id) || getCosmetic("color_red"),
    bestFloor,
    frame,
  };
}
module.exports = {
  CATALOG,
  DEFAULT_IDS,
  getCosmetic,
  getProfileAppearance,
  getOwnedCosmetics,
  grantCosmetic,
  equipCosmetic,
  ownsCosmetic,
};
