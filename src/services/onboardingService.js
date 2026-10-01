const { db } = require("../db");
const { ensureAccount, creditCoins } = require("./economyService");
const { grantCosmetic } = require("./profileCosmeticService");

const STARTER_COINS = 500;
const NEWBIE_DIAMONDS = 3000;

function claimStarterPack(guildId, userId, now = Date.now()) {
  const guild = String(guildId);
  const user = String(userId);
  return db.transaction(() => {
    ensureAccount(guild, user, now);
    if (
      db
        .prepare(
          "SELECT 1 FROM onboarding_claims WHERE guild_id=? AND user_id=?",
        )
        .get(guild, user)
    )
      return { claimed: false };
    db.prepare(
      "INSERT INTO onboarding_claims(guild_id,user_id,claimed_at) VALUES(?,?,?)",
    ).run(guild, user, now);
    const account = creditCoins({
      guildId: guild,
      userId: user,
      amount: STARTER_COINS,
      reason: "onboarding:starter",
      operationId: `onboarding:${guild}:${user}`,
    });
    grantCosmetic(guild, user, "color_blue", now);
    return {
      claimed: true,
      coins: STARTER_COINS,
      balance: account.balance,
      cosmetic: "Xanh Băng",
    };
  })();
}

function hasClaimedNewbieBonus(guildId, userId) {
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM newbie_bonus_claims WHERE guild_id=? AND user_id=?",
      )
      .get(String(guildId), String(userId)),
  );
}
function claimNewbieBonus(guildId, userId, now = Date.now()) {
  const guild = String(guildId);
  const user = String(userId);
  return db.transaction(() => {
    if (hasClaimedNewbieBonus(guild, user)) return { claimed: false };
    db.prepare(
      "INSERT INTO newbie_bonus_claims(guild_id,user_id,claimed_at) VALUES(?,?,?)",
    ).run(guild, user, now);
    const progression = require("./playerLevelService").addDiamonds(
      guild,
      user,
      NEWBIE_DIAMONDS,
      {
        reason: "onboarding:newbie",
        operationId: `newbie:${guild}:${user}`,
        now,
      },
    );
    require("./shopService").addInventory(
      guild,
      user,
      require("./gachaService").TICKETS[10],
      1,
      now,
    );
    return {
      claimed: true,
      diamonds: NEWBIE_DIAMONDS,
      balance: progression.diamonds,
    };
  })();
}

module.exports = {
  STARTER_COINS,
  NEWBIE_DIAMONDS,
  claimStarterPack,
  claimNewbieBonus,
  hasClaimedNewbieBonus,
};
