// Public API and explicit composition order. Gameplay/UI rules live in the modules below.
const dependencies = {};
Object.assign(dependencies, require("./dependencies")(dependencies));
Object.assign(dependencies, require("./fairness")(dependencies));
Object.assign(dependencies, require("./records")(dependencies));
Object.assign(dependencies, require("./state")(dependencies));
Object.assign(dependencies, require("./start")(dependencies));
Object.assign(dependencies, require("./setupFlow")(dependencies));
Object.assign(dependencies, require("./setup")(dependencies));
Object.assign(dependencies, require("./settlement")(dependencies));
Object.assign(dependencies, require("./actions")(dependencies));
Object.assign(dependencies, require("./render")(dependencies));
Object.assign(dependencies, require("./interactions")(dependencies));
const {
  RELEASE,
  hardcoreV2,
  hardcoreStats,
  startHardcore,
  openHardcoreSetup,
  handleHardcoreSetup,
  playHardcore,
  getHardcoreByUser,
  getHardcoreRun,
  setMessageId,
  hardcoreEmbed,
  hardcoreRows,
  forceEndHardcoreSession,
  handleHardcoreButton,
  withHardcoreSession,
  getHardcoreRecord,
  getHardcoreTop,
  cleanupStaleHardcoreSessions,
  retireLegacyHardcoreSessions,
  MIN_BET,
  MAX_BET,
  MAX_PAYOUT,
  MAX_FLOOR,
  COMPLETION_FLOOR,
  rngesusChance,
} = dependencies;
module.exports = {
  RELEASE,
  V2: hardcoreV2,
  V2_CLASSES: hardcoreStats.CLASSES,
  CLASSES: hardcoreStats.CLASSES,
  ITEMS: hardcoreV2.ITEMS,
  MIN_BET,
  MAX_BET,
  MAX_PAYOUT,
  MAX_FLOOR,
  COMPLETION_FLOOR,
  potentialPayout: hardcoreV2.payout,
  baseMultiplier: require("../shared/rewards").baseMultiplier,
  rngesusChance,
  rollRngesus: hardcoreV2.rollRngesus,
  startHardcore,
  openHardcoreSetup,
  handleHardcoreSetup,
  playHardcore,
  getHardcoreByUser,
  getHardcoreRun,
  setMessageId,
  hardcoreEmbed,
  hardcoreRows,
  forceEndHardcoreSession,
  handleHardcoreButton,
  withHardcoreSession,
  getHardcoreRecord,
  getHardcoreTop,
  cleanupStaleHardcoreSessions,
  retireLegacyHardcoreSessions,
};
