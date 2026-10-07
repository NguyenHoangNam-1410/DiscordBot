// Public API and explicit composition order. Gameplay/UI rules live in the modules below.
const dependencies = {};
Object.assign(dependencies, require("./dependencies")(dependencies));
Object.assign(dependencies, require("./helpers")(dependencies));
Object.assign(dependencies, require("./setup")(dependencies));
Object.assign(dependencies, require("./encounters")(dependencies));
Object.assign(dependencies, require("./stats")(dependencies));
Object.assign(dependencies, require("./details")(dependencies));
Object.assign(dependencies, require("./battle")(dependencies));
Object.assign(dependencies, require("./buttons")(dependencies));
const {
  rankLabel,
  encounterText,
  chaosLabel,
  hardcoreEmbed,
  hardcoreRows,
  hardcoreSetupPayload,
  hardcoreBetModal,
  hardcorePrivatePayload,
} = dependencies;
module.exports = {
  rankLabel,
  encounterText,
  chaosLabel,
  hardcoreEmbed,
  hardcoreRows,
  hardcoreSetupPayload,
  hardcoreBetModal,
  hardcorePrivatePayload,
};
