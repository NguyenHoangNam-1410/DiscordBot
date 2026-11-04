"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("santorini").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("santorini"),
  issueTicket: (id, user) => shared.issueTicket("santorini", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("santorini", id, user, code),
  roomUrl: (id) => shared.roomUrl("santorini", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("santorini", id, interaction),
};
