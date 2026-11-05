"use strict";

globalThis.WebGameFeedback = (() => {
  const STORAGE_KEY = "discord-games:sound-enabled";
  const PATTERNS = {
    shot: [
      [0, 95, 0.18, 28],
      [0.01, 53, 0.14, 20],
    ],
    blank: [[0, 900, 0.025, 180]],
    reload: [
      [0, 210, 0.055],
      [0.1, 330, 0.06],
      [0.2, 440, 0.08],
    ],
    tool: [[0, 490, 0.05, 300]],
    join: [
      [0, 523, 0.09],
      [0.12, 784, 0.16],
    ],
    start: [
      [0, 392, 0.08],
      [0.1, 523, 0.08],
      [0.2, 659, 0.17],
    ],
    ready: [
      [0, 660, 0.06],
      [0.09, 880, 0.1],
    ],
    move: [[0, 280, 0.055, 160]],
    opponent: [[0, 480, 0.055, 300]],
    wall: [[0, 190, 0.07, 110]],
    hit: [
      [0, 180, 0.07, 100],
      [0.08, 300, 0.06],
    ],
    sunk: [
      [0, 220, 0.09],
      [0.11, 330, 0.09],
      [0.22, 440, 0.15],
    ],
    capture: [
      [0, 659, 0.07],
      [0.1, 880, 0.12],
    ],
    turn: [
      [0, 880, 0.075],
      [0.1, 1174, 0.1],
    ],
    win: [
      [0, 523, 0.1],
      [0.12, 659, 0.1],
      [0.24, 784, 0.1],
      [0.36, 1046, 0.24],
    ],
    lose: [
      [0, 392, 0.12],
      [0.15, 330, 0.12],
      [0.3, 262, 0.24],
    ],
    draw: [
      [0, 440, 0.12],
      [0.18, 440, 0.16],
    ],
    finish: [
      [0, 440, 0.09],
      [0.12, 523, 0.12],
    ],
    preview: [
      [0, 659, 0.075],
      [0.1, 880, 0.12],
    ],
  };
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  let enabled = true,
    context = null,
    master = null,
    previous = null,
    button;
  const voices = new Set();
  try {
    enabled = localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {}

  function icon(paths) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of paths) {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }
  function paintSound() {
    if (!button) return;
    button.replaceChildren(
      icon(
        enabled
          ? [
              "M11 5 6 9H3v6h3l5 4V5Z",
              "M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14",
            ]
          : ["M11 5 6 9H3v6h3l5 4V5Z", "m16 9 6 6m0-6-6 6"],
      ),
    );
    button.setAttribute("aria-pressed", String(enabled && Boolean(Audio)));
    button.setAttribute(
      "aria-label",
      Audio
        ? enabled
          ? "Tắt âm thanh"
          : "Bật âm thanh"
        : "Thiết bị không hỗ trợ âm thanh",
    );
    button.title = !Audio
      ? "Thiết bị không hỗ trợ âm thanh"
      : enabled
        ? "Âm thanh bật · Chạm/bấm vào trang để kích hoạt"
        : "Âm thanh đã tắt";
    button.disabled = !Audio;
    button.classList.toggle("muted", !enabled);
  }
  function connection(ok, label) {
    const el = document.getElementById("connection");
    if (!el) return;
    const state =
      ok === true ? "connected" : ok === false ? "retry" : "waiting";
    const text =
      label ||
      (ok === true
        ? "Đã kết nối trực tiếp"
        : ok === false
          ? "Đang kết nối lại"
          : "Chưa kết nối");
    el.dataset.connection = state;
    el.title = text;
    el.setAttribute("aria-label", text);
    el.setAttribute("role", "status");
    el.classList.toggle("connected", ok === true);
    el.replaceChildren(
      icon([
        "M3 8a14 14 0 0 1 18 0",
        "M6 11a9 9 0 0 1 12 0",
        "M9 14a4.5 4.5 0 0 1 6 0",
        "M12 18h.01",
      ]),
    );
  }
  function stop() {
    for (const node of voices) {
      try {
        node.stop();
      } catch {}
    }
    voices.clear();
    if (master && context)
      master.gain.setValueAtTime(enabled ? 0.14 : 0, context.currentTime);
  }
  async function unlock() {
    if (!enabled || !Audio) return false;
    try {
      if (!context || context.state === "closed") {
        context = new Audio();
        master = context.createGain();
        master.gain.value = 0.14;
        master.connect(context.destination);
      }
      if (context.state !== "running") await context.resume();
      if (!enabled) return false;
      master.gain.setValueAtTime(0.14, context.currentTime);
      return context.state === "running";
    } catch {
      return false;
    }
  }
  function schedule(cues) {
    // Never queue old notifications while the browser is waiting for a user gesture.
    if (!enabled || !context || context.state !== "running") return;
    let delay = 0;
    for (const cue of cues) {
      const pattern = PATTERNS[cue];
      if (!pattern) continue;
      if (
        cue === "shot" &&
        context.createBuffer &&
        context.createBufferSource
      ) {
        const buffer = context.createBuffer(
          1,
          Math.ceil(context.sampleRate * 0.2),
          context.sampleRate,
        );
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++)
          data[i] =
            (Math.random() * 2 - 1) *
            Math.exp(-i / (context.sampleRate * 0.045));
        const burst = context.createBufferSource(),
          envelope = context.createGain();
        burst.buffer = buffer;
        envelope.gain.value = 0.65;
        burst.connect(envelope);
        envelope.connect(master);
        voices.add(burst);
        burst.onended = () => {
          voices.delete(burst);
          burst.disconnect();
          envelope.disconnect();
        };
        burst.start(context.currentTime + 0.015 + delay);
      }
      for (const [offset, frequency, duration, end] of pattern) {
        const at = context.currentTime + 0.015 + delay + offset;
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, at);
        if (end)
          oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.4, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
        oscillator.connect(gain);
        gain.connect(master);
        voices.add(oscillator);
        oscillator.onended = () => {
          voices.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(at);
        oscillator.stop(at + duration + 0.025);
      }
      delay +=
        Math.max(...pattern.map(([at, , duration]) => at + duration)) + 0.06;
    }
  }
  function play(cues) {
    try {
      schedule(cues);
    } catch {
      try {
        stop();
      } catch {}
    }
  }
  function eventsBetween(game, before, next) {
    if (
      !before ||
      before.id !== next.id ||
      before.me !== next.me ||
      next.version <= before.version
    )
      return [];
    const gunCues = () => {
      if (game !== "coquay" || next.moves <= before.moves) return [];
      const a = next.lastAction;
      const cues = [a?.type === "shoot" ? (a.live ? "shot" : "blank") : "tool"];
      if (a?.reloaded) cues.push("reload");
      return cues;
    };
    if (before.status !== "finished" && next.status === "finished") {
      if (next.winner)
        return [
          ...gunCues(),
          next.me ? (next.winner === next.me ? "win" : "lose") : "finish",
        ];
      return [next.reason === "draw" ? "draw" : "finish"];
    }
    if (!before.players?.O && next.players?.O) return ["join"];
    if (before.status === "setup" && next.status === "playing")
      return ["start"];
    if (
      game === "santorini" &&
      next.phase !== before.phase &&
      next.phase === "turn"
    )
      return ["start"];
    if (
      game === "santorini" &&
      next.lastAction?.type === "place" &&
      next.lastAction.mark !== before.lastAction?.mark
    )
      return ["ready"];
    if (next.moves > before.moves) {
      const last = next.lastAction,
        actor =
          last?.mark ||
          (game === "caro" ? next.board?.[next.lastCell] : before.turn),
        cues = [];
      if (game === "coquay") cues.push(...gunCues());
      else if (game === "battleship" && last?.sunk) cues.push("sunk");
      else if (game === "battleship" && last?.hit) cues.push("hit");
      else if (game === "mecung" && last?.hit) cues.push("wall");
      else if (game === "dots" && last?.captured?.length) cues.push("capture");
      else if (game === "cothu" && last?.capturedPieceId) cues.push("capture");
      else if (game === "walls" && last?.type === "wall") cues.push("wall");
      else
        cues.push(next.me && actor && actor !== next.me ? "opponent" : "move");
      if (
        next.me &&
        before.turn !== next.me &&
        next.turn === next.me &&
        next.status === "playing"
      )
        cues.push("turn");
      return cues;
    }
    if (
      next.status === "setup" &&
      ["X", "O"].some((mark) => !before.ready?.[mark] && next.ready?.[mark])
    )
      return ["ready"];
    return [];
  }
  function update(game, next) {
    if (
      previous?.game === game &&
      previous.state.id === next.id &&
      previous.state.me === next.me &&
      next.version <= previous.state.version
    )
      return;
    const cues = eventsBetween(
      game,
      previous?.game === game ? previous.state : null,
      next,
    );
    previous = { game, state: next };
    if (cues.some((cue) => ["win", "lose", "draw", "finish"].includes(cue)))
      stop();
    play(cues);
  }
  async function setEnabled(value, preview = false) {
    enabled = Boolean(value);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {}
    if (!enabled) stop();
    paintSound();
    if (enabled && (await unlock()) && preview) play(["preview"]);
  }
  const el = document.getElementById("connection");
  if (el && !document.getElementById("sound-toggle")) {
    const tools = document.createElement("div");
    tools.className = "wg-header-tools";
    el.before(tools);
    button = document.createElement("button");
    button.type = "button";
    button.id = "sound-toggle";
    button.className = "wg-sound-toggle";
    tools.append(el, button);
    button.addEventListener("click", () => {
      void setEnabled(!enabled, true);
    });
  }
  connection(null);
  paintSound();
  const gesture = (event) => {
    if (event.isTrusted !== false) void unlock();
  };
  document.addEventListener("pointerdown", gesture, {
    capture: true,
    passive: true,
  });
  // Touch activation is granted on release, while mouse activation starts on press.
  document.addEventListener("pointerup", gesture, {
    capture: true,
    passive: true,
  });
  document.addEventListener("click", gesture, { capture: true });
  document.addEventListener("keydown", gesture, { capture: true });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      enabled = localStorage.getItem(STORAGE_KEY) !== "0";
    } catch {
      return;
    }
    if (!enabled) stop();
    else if (master && context)
      master.gain.setValueAtTime(0.14, context.currentTime);
    paintSound();
  });
  window.addEventListener("pagehide", () => {
    stop();
    void context?.close().catch(() => {});
  });
  return {
    update,
    connection,
    setEnabled,
    eventsBetween,
    enabled: () => enabled,
  };
})();
