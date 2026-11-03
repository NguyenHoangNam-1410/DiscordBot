"use strict";

// Shared avatar rendering for web games. Player names remain text, never HTML.
globalThis.WebGamePlayers = (() => {
  function safeURL(value) {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      return url.origin === "https://cdn.discordapp.com" &&
        !url.username &&
        !url.password &&
        /^\/(avatars|embed\/avatars|guilds)\//.test(url.pathname)
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  function render(state) {
    for (const mark of ["X", "O"]) {
      const img = document.getElementById("avatar-" + mark);
      const fallback = document.getElementById("avatar-fallback-" + mark);
      if (!img || !fallback) continue;
      const name = state.players[mark];
      fallback.textContent = name
        ? Array.from(name.trim())[0]?.toLocaleUpperCase("vi") || "?"
        : "?";
      const url = name ? safeURL(state.avatars?.[mark]) : null;
      if (!url) {
        delete img.dataset.avatarUrl;
        img.removeAttribute("src");
        img.hidden = true;
        fallback.hidden = false;
      } else if (img.dataset.avatarUrl !== url) {
        img.dataset.avatarUrl = url;
        img.hidden = true;
        fallback.hidden = false;
        img.onload = () => {
          if (img.dataset.avatarUrl === url) {
            img.hidden = false;
            fallback.hidden = true;
          }
        };
        img.onerror = () => {
          if (img.dataset.avatarUrl === url) {
            img.hidden = true;
            fallback.hidden = false;
          }
        };
        img.src = url;
      }
    }
  }
  return { render, avatarURL: safeURL };
})();
