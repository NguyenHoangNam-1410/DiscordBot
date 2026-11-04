"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("coquay").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("coquay"),
  issueTicket: (id, user) => shared.issueTicket("coquay", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("coquay", id, user, code),
  roomUrl: (id) => shared.roomUrl("coquay", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("coquay", id, interaction),
};
