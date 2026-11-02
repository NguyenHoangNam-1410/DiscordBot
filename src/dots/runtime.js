"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("dots").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("dots"),
  issueTicket: (id, user) => shared.issueTicket("dots", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("dots", id, user, code),
  roomUrl: (id) => shared.roomUrl("dots", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("dots", id, interaction),
};
