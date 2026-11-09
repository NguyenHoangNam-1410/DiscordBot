"use strict";

const PLAYER_LABELS = Object.freeze({
  oanquan: Object.freeze({ X: "Bên xanh", O: "Bên cam" }),
  cothu: Object.freeze({ X: "Đỏ ●", O: "Xanh ◆" }),
  santorini: Object.freeze({ X: "Thợ xanh", O: "Thợ cam" }),
  coquay: Object.freeze({ X: "Chủ bàn", O: "Đối thủ" }),
  dots: Object.freeze({ X: "Người nối xanh", O: "Người nối cam" }),
  caro: Object.freeze({ X: "X", O: "O" }),
  mecung: Object.freeze({ X: "Người dò xanh", O: "Người dò cam" }),
  blokus: Object.freeze({ X: "Quân xanh", O: "Quân cam" }),
  walls: Object.freeze({ X: "Quân xanh", O: "Quân cam" }),
  battleship: Object.freeze({ X: "Hạm đội xanh", O: "Hạm đội cam" }),
});

function safeAvatarURL(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== "https://cdn.discordapp.com" ||
      url.username ||
      url.password
    )
      return null;
    if (
      !/^\/(?:avatars\/\d+\/[a-zA-Z0-9_]+\.(?:png|jpe?g|webp|gif)|embed\/avatars\/[0-5]\.png|guilds\/\d+\/users\/\d+\/avatars\/[a-zA-Z0-9_]+\.(?:png|jpe?g|webp|gif))$/.test(
        url.pathname,
      )
    )
      return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
function defaultAvatar(user) {
  const discriminator = String(user.discriminator ?? "0");
  let index = 0;
  if (/^\d{1,4}$/.test(discriminator) && Number(discriminator) !== 0)
    index = Number(discriminator) % 5;
  else if (/^\d{1,20}$/.test(String(user.id)))
    index = Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
function avatarFor(user) {
  if (!user) return null;
  let url = safeAvatarURL(user.avatarUrl);
  if (!url && typeof user.displayAvatarURL === "function") {
    try {
      url = safeAvatarURL(
        user.displayAvatarURL({
          extension: "png",
          size: 128,
          forceStatic: true,
        }),
      );
    } catch {}
  }
  return url || defaultAvatar(user);
}
function makePlayer(user) {
  return {
    id: String(user.id),
    name: String(
      user.globalName || user.displayName || user.username || "Người chơi",
    ).slice(0, 80),
    avatarUrl: avatarFor(user),
  };
}
function playerIdentityView(room, game) {
  return {
    avatars: Object.fromEntries(
      ["X", "O"].map((mark) => [mark, avatarFor(room.players[mark])]),
    ),
    playerLabels: { ...PLAYER_LABELS[game] },
  };
}
module.exports = {
  PLAYER_LABELS,
  safeAvatarURL,
  avatarFor,
  makePlayer,
  playerIdentityView,
};
