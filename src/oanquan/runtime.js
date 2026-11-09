"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("oanquan").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("oanquan"),
  issueTicket: (id, user) => shared.issueTicket("oanquan", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("oanquan", id, user, code),
  roomUrl: (id) => shared.roomUrl("oanquan", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("oanquan", id, interaction),
};
