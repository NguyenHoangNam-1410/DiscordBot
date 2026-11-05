"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("cothu").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("cothu"),
  issueTicket: (id, user) => shared.issueTicket("cothu", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("cothu", id, user, code),
  roomUrl: (id) => shared.roomUrl("cothu", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("cothu", id, interaction),
};
