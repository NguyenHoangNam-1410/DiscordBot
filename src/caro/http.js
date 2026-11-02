"use strict";

const { createWebServer: createSharedServer } = require("../webGames/http");
const { createGame } = require("./webGame");

function createWebServer({ store, ...options }) {
  const shared = createSharedServer({
    ...options,
    games: [createGame({ store })],
    legacyGame: "caro",
  });
  return {
    ...shared,
    issueTicket: (id, user) => shared.issueTicket("caro", id, user),
    confirmPairing: (id, user, code) =>
      shared.confirmPairing("caro", id, user, code),
    roomUrl: (id) => shared.roomUrl("caro", id),
  };
}
module.exports = { createWebServer };
