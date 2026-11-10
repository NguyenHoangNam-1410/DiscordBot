"use strict";
// One shuffle bag and playback position per tab, shared across game pages.
(() => {
  const tools = document.querySelector(".wg-header-tools");
  if (!tools || typeof Audio === "undefined") return;
  const STATE = "discord-games:bgm-session-v1",
    PREF = "discord-games:bgm-enabled";
  const audio = new Audio();
  audio.id = "webgame-bgm";
  audio.hidden = true;
  document.body.append(audio);
  audio.preload = "metadata";
  audio.volume = 0.15;
  let tracks = [],
    order = [],
    index = 0,
    seek = null,
    enabled = true,
    ready = false,
    unavailable = false;
  const failed = new Set();
  try {
    enabled = localStorage.getItem(PREF) !== "0";
  } catch {}
  const button = document.createElement("button");
  button.id = "bgm-toggle";
  button.type = "button";
  button.className = "wg-sound-toggle";
  button.textContent = "♫";
  tools.append(button);
  function paint() {
    const active = enabled && !audio.paused && !unavailable;
    button.disabled = unavailable;
    button.dataset.musicState = unavailable
      ? "unavailable"
      : !enabled
        ? "muted"
        : active
          ? "playing"
          : "waiting";
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Tắt nhạc nền" : "Bật nhạc nền");
    button.classList.toggle("muted", !active);
    button.title = unavailable
      ? "Không có nhạc nền phát được"
      : active
        ? "Tắt nhạc nền"
        : enabled
          ? "Bấm để phát nhạc nền"
          : "Bật nhạc nền";
  }
  function save() {
    if (!ready) return;
    try {
      sessionStorage.setItem(
        STATE,
        JSON.stringify({ order, index, position: seek ?? audio.currentTime }),
      );
    } catch {}
  }
  function shuffle(previous) {
    order = [...tracks];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.length > 1 && order[0] === previous)
      [order[0], order[1]] = [order[1], order[0]];
    index = 0;
  }
  async function play() {
    if (!ready || !enabled || unavailable) return;
    try {
      await audio.play();
      if (!enabled) audio.pause();
    } catch {
      /* Next trusted gesture retries blocked autoplay. */
    }
    paint();
  }
  function load(position = 0) {
    seek = position;
    audio.src = order[index];
    audio.load();
    save();
    paint();
    void play();
  }
  function advance() {
    const previous = order[index];
    if (++index >= order.length) shuffle(previous);
    // Bad files are skipped without an infinite retry loop.
    while (failed.has(order[index])) {
      if (++index >= order.length) shuffle(previous);
    }
    load();
  }
  audio.addEventListener("loadedmetadata", () => {
    if (seek !== null) {
      try {
        audio.currentTime = Number.isFinite(audio.duration)
          ? Math.min(seek, Math.max(0, audio.duration - 0.05))
          : seek;
      } catch {}
      seek = null;
    }
    save();
  });
  audio.addEventListener("timeupdate", save);
  audio.addEventListener("pause", () => {
    save();
    paint();
  });
  audio.addEventListener("playing", paint);
  audio.addEventListener("ended", () => {
    if (ready) advance();
  });
  audio.addEventListener("error", () => {
    if (!ready) return;
    failed.add(order[index]);
    if (failed.size >= tracks.length) {
      unavailable = true;
      audio.pause();
      paint();
      return;
    }
    advance();
  });
  button.addEventListener("click", () => {
    enabled = !(enabled && !audio.paused);
    try {
      localStorage.setItem(PREF, enabled ? "1" : "0");
    } catch {}
    if (enabled) void play();
    else audio.pause();
    save();
    paint();
  });
  function gesture(e) {
    if (
      e.isTrusted !== false &&
      e.target !== button &&
      !button.contains(e.target)
    )
      void play();
  }
  document.addEventListener("pointerup", gesture, { passive: true });
  document.addEventListener("keydown", gesture, { passive: true });
  window.addEventListener("pagehide", () => {
    save();
    audio.pause();
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) void play();
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== PREF && e.key !== null) return;
    try {
      enabled = localStorage.getItem(PREF) !== "0";
    } catch {
      return;
    }
    if (enabled) void play();
    else audio.pause();
    paint();
  });
  paint();
  fetch("/api/bgm", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    })
    .then((data) => {
      tracks = [
        ...new Set(
          data.tracks.filter(
            (t) => typeof t === "string" && /^\/assets\/bgm\/[^/]+$/.test(t),
          ),
        ),
      ];
      if (!tracks.length) throw Error();
      let saved;
      try {
        saved = JSON.parse(sessionStorage.getItem(STATE));
      } catch {}
      if (
        saved &&
        Array.isArray(saved.order) &&
        saved.order.length === tracks.length &&
        new Set(saved.order).size === tracks.length &&
        saved.order.every((t) => tracks.includes(t)) &&
        Number.isInteger(saved.index) &&
        saved.index >= 0 &&
        saved.index < tracks.length &&
        Number.isFinite(saved.position) &&
        saved.position >= 0
      ) {
        order = saved.order;
        index = saved.index;
        seek = saved.position;
      } else shuffle();
      ready = true;
      load(seek ?? 0);
    })
    .catch(() => {
      unavailable = true;
      paint();
    });
})();
