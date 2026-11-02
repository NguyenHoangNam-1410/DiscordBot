"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("caro").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("caro"),
  issueTicket: (id, user) => shared.issueTicket("caro", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("caro", id, user, code),
  roomUrl: (id) => shared.roomUrl("caro", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("caro", id, interaction),
};
