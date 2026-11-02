"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("walls").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("walls"),
  issueTicket: (id, user) => shared.issueTicket("walls", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("walls", id, user, code),
  roomUrl: (id) => shared.roomUrl("walls", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("walls", id, interaction),
};
