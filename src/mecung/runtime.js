"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("mecung").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("mecung"),
  issueTicket: (id, user) => shared.issueTicket("mecung", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("mecung", id, user, code),
  roomUrl: (id) => shared.roomUrl("mecung", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("mecung", id, interaction),
};
