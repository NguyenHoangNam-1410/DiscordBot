"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("gunny").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("gunny"),
  issueTicket: (id, user) => shared.issueTicket("gunny", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("gunny", id, user, code),
  roomUrl: (id) => shared.roomUrl("gunny", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("gunny", id, interaction),
};
