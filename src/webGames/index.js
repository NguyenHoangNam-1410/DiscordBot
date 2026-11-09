"use strict";

const { db } = require("../db");
const { createRuntime } = require("./runtime");
const { createStore } = require("../caro/store");
const { createGame } = require("../caro/webGame");
const { createStore: createWallsStore } = require("../walls/store");
const { createGame: createWallsGame } = require("../walls/webGame");
const { createStore: createBattleshipStore } = require("../battleship/store");
const { createGame: createBattleshipGame } = require("../battleship/webGame");
const { createStore: createDotsStore } = require("../dots/store");
const { createGame: createDotsGame } = require("../dots/webGame");

const { createStore: createBlokusStore } = require("../blokus/store");
const { createGame: createBlokusGame } = require("../blokus/webGame");

const { createStore: createMazeStore } = require("../mecung/store");
const { createGame: createMazeGame } = require("../mecung/webGame");

const { createStore: createCoquayStore } = require("../coquay/store");
const { createGame: createCoquayGame } = require("../coquay/webGame");

const { createStore: createSantoriniStore } = require("../santorini/store");
const { createGame: createSantoriniGame } = require("../santorini/webGame");

// Register each new game here. Transport, browser sessions and Discord sync are shared.
module.exports = createRuntime({
  games: [
    require("../oanquan/webGame").createGame({
      store: require("../oanquan/store").createStore(db),
      db,
    }),
    require("../cothu/webGame").createGame({
      store: require("../cothu/store").createStore(db),
      db,
    }),
    createGame({ store: createStore(db), db }),
    createWallsGame({ store: createWallsStore(db), db }),
    createBattleshipGame({ store: createBattleshipStore(db), db }),
    createDotsGame({ store: createDotsStore(db), db }),
    createBlokusGame({ store: createBlokusStore(db), db }),
    createMazeGame({ store: createMazeStore(db), db }),
    createCoquayGame({ store: createCoquayStore(db), db }),
    createSantoriniGame({ store: createSantoriniStore(db), db }),
  ],
  legacyGame: "caro",
});
