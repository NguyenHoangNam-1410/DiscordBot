"use strict";

const shared = require("../webGames");
module.exports = {
  store: shared.game("cotuong").store,
  start: shared.start,
  stop: shared.stop,
  syncMessages: shared.syncMessages,
  isAvailable: () => shared.isAvailable("cotuong"),
  issueTicket: (id, user) => shared.issueTicket("cotuong", id, user),
  confirmPairing: (id, user, code) =>
    shared.confirmPairing("cotuong", id, user, code),
  roomUrl: (id) => shared.roomUrl("cotuong", id),
  bindInteraction: (id, interaction) =>
    shared.bindInteraction("cotuong", id, interaction),
};
