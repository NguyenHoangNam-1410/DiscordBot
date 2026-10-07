"use strict";
// Public API and explicit composition order. Gameplay/UI rules live in the modules below.
const dependencies = {};
Object.assign(dependencies, require("./dependencies")(dependencies));
Object.assign(dependencies, require("./stats")(dependencies));
Object.assign(dependencies, require("./items")(dependencies));
Object.assign(dependencies, require("./services")(dependencies));
Object.assign(dependencies, require("./events")(dependencies));
Object.assign(dependencies, require("./encounters")(dependencies));
Object.assign(dependencies, require("./log")(dependencies));
Object.assign(dependencies, require("./battle")(dependencies));
Object.assign(dependencies, require("./buttons")(dependencies));
Object.assign(dependencies, require("./rift")(dependencies));
Object.assign(dependencies, require("./details")(dependencies));
Object.assign(dependencies, require("./setup")(dependencies));
Object.assign(dependencies, require("./rules")(dependencies));
const {
  embed,
  rows,
  privatePayload,
  setupPreview,
  ratesFields,
  statLine,
  passiveText,
  effectText,
  encounterText,
  checkpointPreview,
  SKILLS,
} = dependencies;
module.exports = {
  embed,
  rows,
  privatePayload,
  setupPreview,
  ratesFields,
  statLine,
  passiveText,
  effectText,
  encounterText,
  checkpointPreview,
  SKILLS,
};
