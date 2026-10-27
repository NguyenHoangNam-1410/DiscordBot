// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    crypto,
    db,
    spendCoins,
    getGameBetLimit,
    createFairness,
    hardcoreRepository,
    hardcoreInventory,
    hardcoreV2,
    hardcoreStats,
    MIN_BET,
    MAX_BET,
    fairStateContext,
    getHardcoreByUser,
  } = dependencies;
  const randomFloat = (...args) => dependencies.randomFloat(...args);

  const startTx = db.transaction(
    ({
      guildId,
      userId,
      channelId,
      stake,
      classKey,
      forcedEncounter = null,
      loadout = {},
      playerName = String(userId),
      characterId = classKey,
      beta = false,
      soulLevel = 0,
    }) => {
      if (typeof beta !== "boolean") throw Error("INVALID_BETA_STATE");
      if (beta) {
        classKey = characterId = "rha_kor";
        stake = require("../beta").STAKE;
        loadout = {};
      }
      const template = hardcoreStats.CLASSES[classKey];
      if (!template) throw new Error("INVALID_CLASS");
      if (!Number.isSafeInteger(stake) || stake < MIN_BET || stake > MAX_BET)
        throw new Error("INVALID_BET");
      const maxBet = beta ? MAX_BET : getGameBetLimit(guildId, "hardcore");
      if (stake > maxBet) {
        const error = new Error("BET_LIMIT");
        error.maxBet = maxBet;
        throw error;
      }
      if (getHardcoreByUser(guildId, userId)) throw new Error("ACTIVE_SESSION");
      const account = beta
        ? null
        : spendCoins({
            guildId,
            userId,
            amount: stake,
            reason: "hardcore:reserve",
          });
      const state = hardcoreStats.createState(
        classKey,
        stake,
        beta ? { gameplayVersion: 3 } : {},
      );
      const fair = createFairness();
      if (beta) {
        require("../beta").activate(state);
        if (!Number.isSafeInteger(soulLevel) || soulLevel < 0 || soulLevel > 6)
          throw Error("INVALID_CHARACTER_SOUL");
        // Beta không cần sở hữu nhân vật: tinh hồn chọn tự do để thử nghiệm.
        if (soulLevel > 0)
          require("../characters/souls").attach(state, characterId, soulLevel);
      }
      const souls = require("../characters/souls");
      if (souls.enabled(state) && !beta) {
        const characters = require("../characters");
        const character = characters.get(characterId);
        const owned = characters.ownedCharacters(String(userId))[characterId];
        if (!owned || character?.profileKey !== classKey)
          throw Error("CHARACTER_NOT_OWNED");
        souls.attach(state, characterId, owned.soulLevel);
        if (classKey === "venance")
          require("../characters/venance").attach(state, owned.rarity || "SSR");
      }
      state.bossRosterVersion =
        require("../../services/gameConfigService").getGameConfig(
          guildId,
          "HARDCORE_BOSS_ROSTER_VERSION",
        ) || (state.gameplayVersion === 3 ? 2 : 1);
      if (state.bossRosterVersion === 2)
        state.bossDamageProfile = require("../bosses/balanceV2").snapshot(
          classKey,
        );
      state.fair = fair;
      state.fairCounter = 0;
      state.playerName = String(playerName).slice(0, 80);
      hardcoreInventory.applyLoadout(
        state,
        beta ? {} : hardcoreInventory.consume(guildId, userId, loadout),
      );
      const now = Date.now();
      const session = {
        id: crypto.randomBytes(6).toString("hex"),
        guild_id: String(guildId),
        user_id: String(userId),
        channel_id: String(channelId),
        message_id: null,
        created_at: now,
        updated_at: now,
      };
      state.godRngesusEnabled = true;
      state.encounter =
        forcedEncounter ||
        fairStateContext.run(state, () =>
          hardcoreV2.generateEncounter(state, session, randomFloat),
        );
      fairStateContext.run(state, () =>
        hardcoreV2.prepareItemCombat(state, randomFloat),
      );
      hardcoreRepository.insertSession(
        { ...session, created_at: now, updated_at: now },
        state,
      );
      require("../replay/store").ensure(session, state);
      return { session, state, account };
    },
  );

  function startHardcore(args) {
    dependencies.retireLegacyHardcoreSessions(args.guildId, args.userId);
    return startTx(args);
  }
  return { startTx, startHardcore };
};
