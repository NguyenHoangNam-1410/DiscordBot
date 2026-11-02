"use strict";

const { db } = require("../db");
const { createRuntime } = require("./runtime");
const { createStore } = require("../caro/store");
const { createGame } = require("../caro/webGame");
const { createStore: createWallsStore } = require("../walls/store");
const { createGame: createWallsGame } = require("../walls/webGame");

// Register each new game here. Transport, browser sessions and Discord sync are shared.
module.exports = createRuntime({
  games: [
    createGame({ store: createStore(db), db }),
    createWallsGame({ store: createWallsStore(db), db }),
  ],
  legacyGame: "caro",
});
