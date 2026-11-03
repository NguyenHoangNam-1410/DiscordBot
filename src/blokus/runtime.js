"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("blokus").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("blokus"),
  issueTicket: (id, user) => shared.issueTicket("blokus", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("blokus", id, user, code),
  roomUrl: (id) => shared.roomUrl("blokus", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("blokus", id, interaction),
};
