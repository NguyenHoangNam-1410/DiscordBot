const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
// Keep every reward/migration test isolated from the bot's real database.
const databaseModule = require.cache[require.resolve("better-sqlite3")];
databaseModule.exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
databaseModule.exports = Database;
const {
  AVATAR_RINGS,
  avatarRingRewardText,
} = require("../src/services/avatarRingCatalog");
const achievements = require("../src/services/achievementService");
const profile = require("../src/services/profileCosmeticService");
const shop = require("../src/services/shopService");
const { useItem } = require("../src/services/itemEffectService");
const {
  getCatalogItem,
  listCatalog,
} = require("../src/services/itemCatalogService");
const {
  addGachaItem,
  gachaItemChoices,
  listGachaPool,
} = require("../src/services/gachaPoolService");
const {
  dropPool,
  GAME_ITEM_DROP_CHANCE,
} = require("../src/services/gameItemDropService");
const { getAccount } = require("../src/services/economyService");
const { getPlayerProgression } = require("../src/services/playerLevelService");
const { usePanel } = require("../src/commands/use");
const { profilePayload } = require("../src/services/hardcoreProfile");
const { achievementPanel } = require("../src/commands/kiemtra");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const {
  renderProfileCard,
  WIDTH,
  HEIGHT,
} = require("../src/services/profileCardService");
const G = "ring-test";
const archive = db.prepare(
  "INSERT INTO hardcore_run_archive(session_id,guild_id,user_id,gameplay_version,release_version,class_key,cleared,reason,stake,payout,diamonds,turns,created_at,ended_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
);
function run(user, cls, floor) {
  archive.run(
    user + "-" + floor + "-" + cls,
    G,
    user,
    2,
    "2.0.0",
    cls,
    floor,
    "death",
    1000,
    0,
    0,
    10,
    1,
    2,
  );
}
function money(user) {
  return [getAccount(G, user).balance, getPlayerProgression(G, user).diamonds];
}
function claimRows(user) {
  return db
    .prepare("SELECT * FROM achievement_claims WHERE guild_id=? AND user_id=?")
    .all(G, user);
}
function settle(user) {
  for (let i = 0; i < 10; i++)
    if (!achievements.claimAchievements(G, user).length) return;
  throw Error("Achievement claims did not settle");
}

async function main() {
  assert.equal(AVATAR_RINGS.length, 7);
  assert.equal(new Set(AVATAR_RINGS.map((r) => r.id)).size, 7);
  for (const ring of AVATAR_RINGS) {
    const user = ring.classKey;
    assert.equal(getCatalogItem(ring.id).type, "avatar_ring");
    assert(!listCatalog({ shopEligible: true }).some((i) => i.id === ring.id));
    assert(!gachaItemChoices().some((i) => i.value === ring.id));
    assert(!listGachaPool(G).some((i) => i.itemId === ring.id));
    for (const game of Object.keys(GAME_ITEM_DROP_CHANCE))
      assert(!dropPool(game).some((i) => i.id === ring.id));
    assert.throws(
      () => addGachaItem(G, ring.id, "UR", "admin"),
      /INVALID_GACHA_ITEM/,
    );
    assert.throws(
      () =>
        shop.upsertShopItem({
          guildId: G,
          catalogId: ring.id,
          createdBy: "admin",
        }),
      /UNKNOWN_SHOP_EFFECT/,
    );
    assert.throws(
      () => shop.addInventory(G, user, ring.id),
      /ACHIEVEMENT_REQUIRED/,
    );
    assert.throws(
      () => profile.grantCosmetic(G, user, ring.id),
      /ACHIEVEMENT_REQUIRED/,
    );

    run(user, ring.classKey, 499);
    assert(
      !achievements
        .getAchievements(G, user)
        .find((a) => a.id === ring.achievementId).complete,
    );
    achievements.claimAchievements(G, user);
    assert.equal(shop.getInventoryQuantity(G, user, ring.id), 0);
    run(user, ring.classKey, 500);
    const readyProfile = profilePayload(
      G,
      user,
      { id: user },
      "class",
      0,
      null,
    ).embeds[0].toJSON().description;
    assert(
      readyProfile.includes(ring.name) && readyProfile.includes("Đủ điều kiện"),
    );
    const before = money(user);
    const claimed = achievements.claimAchievements(G, user);
    const reward = claimed.find((a) => a.id === ring.achievementId);
    assert.equal(reward.cosmetic, ring.id);
    assert.equal(reward.reward, 500000);
    assert.equal(reward.diamonds, 1000);
    assert.deepEqual(money(user), [
      before[0] + claimed.reduce((sum, a) => sum + a.reward, 0),
      before[1] + claimed.reduce((sum, a) => sum + (a.diamonds || 0), 0),
    ]);
    assert.equal(profile.getProfileAppearance(G, user).avatarRing.id, ring.id);
    assert.equal(shop.getInventoryQuantity(G, user, ring.id), 1);
    assert.equal(
      shop
        .getInventory(G, user)
        .filter((row) => row.item.type === "avatar_ring").length,
      1,
    );
    settle(user);
    const settled = money(user);
    assert.deepEqual(achievements.claimAchievements(G, user), []);
    assert.deepEqual(money(user), settled);
    assert.equal(shop.addInventory(G, user, ring.id, 10).quantity, 1);
    profile.grantCosmetic(G, user, ring.id);
    assert.equal(shop.getInventoryQuantity(G, user, ring.id), 1);
    assert.throws(
      () =>
        shop.transferInventory({
          guildId: G,
          fromUserId: user,
          toUserId: "other",
          itemId: ring.id,
        }),
      /ITEM_NOT_TRADEABLE/,
    );
    assert.throws(
      () => shop.equipOwnedCosmetic("another-guild", user, ring.id),
      /ITEM_NOT_OWNED/,
    );
    assert.throws(
      () => profile.equipCosmetic(G, "other", ring.id),
      /COSMETIC_NOT_OWNED/,
    );
    const classProfile = profilePayload(
      G,
      user,
      { id: user },
      "class",
      0,
      null,
    ).embeds[0].toJSON().description;
    assert(
      classProfile.includes(ring.name) &&
        classProfile.includes("Đang trang bị"),
    );
    const used = useItem({ guildId: G, userId: user, itemId: ring.id });
    assert(used.message.includes(ring.name));
    assert.equal(shop.getInventoryQuantity(G, user, ring.id), 1);
    const panel = usePanel(G, user);
    assert(
      panel.components
        .flatMap((row) => row.toJSON().components)
        .some((c) =>
          c.options?.some(
            (o) =>
              o.value === ring.id && o.description.startsWith("Vòng avatar"),
          ),
        ),
    );
    const pages = Array.from({ length: 6 }, (_, page) =>
      achievementPanel(G, user, "all", "hardcoreClass", page),
    );
    assert(
      pages.some((panel) =>
        panel.embeds[0].toJSON().description.includes(ring.name),
      ),
    );
    assert(avatarRingRewardText(claimed).includes(ring.name));
  }

  const amazon = AVATAR_RINGS[0],
    paladin = AVATAR_RINGS[6];
  profile.grantCosmetic(G, "amazon", "color_blue");
  shop.addInventory(G, "amazon", "color_blue");
  shop.equipOwnedCosmetic(G, "amazon", "color_blue");
  run("amazon", "paladin", 500);
  achievements.claimAchievements(G, "amazon");
  assert.equal(
    profile.getProfileAppearance(G, "amazon").avatarRing.id,
    amazon.id,
    "second reward must not replace the chosen ring",
  );
  useItem({ guildId: G, userId: "amazon", itemId: paladin.id });
  assert.equal(
    profile.getProfileAppearance(G, "amazon").color.id,
    "color_blue",
  );
  shop.equipOwnedCosmetic(G, "amazon", "color_red");
  assert.equal(
    profile.getProfileAppearance(G, "amazon").avatarRing.id,
    paladin.id,
    "color and avatar ring are independent",
  );

  // Even a stale/manual shop row must not offer an achievement-exclusive reward.
  db.prepare(
    "INSERT INTO shop_items(guild_id,item_id,cosmetic_id,display_name,price,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,1,'admin',1,1)",
  ).run(G, "forged-ring", paladin.id, paladin.name, 1);
  const unpaid = money("buyer");
  assert.throws(
    () =>
      shop.purchaseShopItem({
        guildId: G,
        userId: "buyer",
        itemId: "forged-ring",
      }),
    /SHOP_ITEM_NOT_FOUND/,
  );
  assert.deepEqual(money("buyer"), unpaid);

  // A grant failure must roll back currency, claims and cosmetic ownership together.
  run("rollback", "amazon", 500);
  achievements.getAchievements(G, "rollback");
  const baseline = money("rollback");
  db.exec(
    "CREATE TRIGGER fail_ring BEFORE INSERT ON user_inventory WHEN NEW.user_id='rollback' AND NEW.item_id LIKE 'avatar_ring_%' BEGIN SELECT RAISE(ABORT,'test grant failure'); END",
  );
  assert.throws(
    () => achievements.claimAchievements(G, "rollback"),
    /test grant failure/,
  );
  assert.deepEqual(money("rollback"), baseline);
  assert.equal(claimRows("rollback").length, 0);
  assert(!profile.ownsCosmetic(G, "rollback", amazon.id));
  db.exec("DROP TRIGGER fail_ring");
  achievements.claimAchievements(G, "rollback");
  assert.equal(shop.getInventoryQuantity(G, "rollback", amazon.id), 1);

  // Re-run the migration with historical claims, preserving colors and existing selections.
  profile.grantCosmetic(G, "legacy", "color_blue");
  profile.equipCosmetic(G, "legacy", "color_blue");
  const legacyMoney = money("legacy");
  db.prepare("INSERT INTO achievement_claims VALUES(?,?,?,?)").run(
    G,
    "legacy",
    paladin.achievementId,
    100,
  );
  db.prepare("INSERT INTO achievement_claims VALUES(?,?,?,?)").run(
    G,
    "legacy",
    AVATAR_RINGS[5].achievementId,
    200,
  );
  const previousRing = profile.getProfileAppearance(G, "amazon").avatarRing.id;
  function replayMigration() {
    db.prepare("DELETE FROM schema_migrations WHERE version=38").run();
    delete require.cache[require.resolve("../src/db")];
    databaseModule.exports = function () {
      return db;
    };
    try {
      require("../src/db");
    } finally {
      databaseModule.exports = Database;
    }
  }
  replayMigration();
  assert.deepEqual(
    money("legacy"),
    legacyMoney,
    "backfill must not pay coins or diamonds again",
  );
  assert.equal(
    profile.getProfileAppearance(G, "legacy").avatarRing.id,
    paladin.id,
  );
  assert.equal(
    profile.getProfileAppearance(G, "legacy").color.id,
    "color_blue",
  );
  assert.equal(
    profile.getProfileAppearance(G, "amazon").avatarRing.id,
    previousRing,
  );
  for (const ring of [paladin, AVATAR_RINGS[5]])
    assert.equal(shop.getInventoryQuantity(G, "legacy", ring.id), 1);
  replayMigration();
  assert.equal(shop.getInventoryQuantity(G, "legacy", paladin.id), 1);

  const options = {
    displayName: "Silv",
    username: "silvchan",
    avatarUrl: null,
    account: { balance: 123456, games_played: 42 },
    rank: 3,
    progress: { level: 20, experience: 100, diamonds: 1500 },
    xpTarget: 4000,
    serverName: "Preview",
  };
  const baseAppearance = {
    color: { value: "#334155" },
    bestFloor: 500,
    frame: {
      id: "survival_silver",
      name: "Khung Bạc",
      colors: ["#687481", "#f3f7fc", "#a7b3c0", "#ffffff", "#687481"],
    },
  };
  async function pixels(png) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(await loadImage(png), 0, 0);
    return ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  }
  const plain = await pixels(
    await renderProfileCard({ ...options, appearance: baseAppearance }),
  );
  const digests = new Set();
  for (const ring of AVATAR_RINGS) {
    const png = await renderProfileCard({
      ...options,
      appearance: { ...baseAppearance, avatarRing: ring },
    });
    digests.add(crypto.createHash("sha256").update(png).digest("hex"));
    const rendered = await pixels(png);
    let changed = 0;
    for (let y = 0; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++) {
        const i = (y * WIDTH + x) * 4;
        if (
          rendered[i] === plain[i] &&
          rendered[i + 1] === plain[i + 1] &&
          rendered[i + 2] === plain[i + 2]
        )
          continue;
        changed++;
        assert(
          x >= 28 && x <= 256 && y >= 31 && y <= 306,
          "ring must stay in the avatar panel, without moving stats or profile frame",
        );
        assert(
          Math.hypot(x - 142, y - 145) >= 80,
          "ring must preserve the avatar",
        );
      }
    assert(changed > 1000, "ring must be visibly drawn");
  }
  assert.equal(
    digests.size,
    7,
    "every class must have a distinct rendered design",
  );
  db.close();
  console.log(
    "Avatar rings: 7 class rewards, exclusivity, atomic claims, historical backfill, equip UI and rendering passed.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
