"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("battleship").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("battleship"),
  issueTicket: (id, user) => shared.issueTicket("battleship", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("battleship", id, user, code),
  roomUrl: (id) => shared.roomUrl("battleship", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("battleship", id, interaction),
};
