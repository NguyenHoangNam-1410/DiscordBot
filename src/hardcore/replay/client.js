"use strict";
(async () => {
  const el = (id) => document.getElementById(id);
  const number = (n) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
      Number(n) || 0,
    );
  const clean = (s) =>
    String(s ?? "")
      .replace(/<a?:\w+:\d+>/g, "")
      .replace(/<@!?(\d+)>/g, "Người chơi")
      .replace(/\*\*/g, "")
      .trim();
  const text = (id, s) => {
    el(id).textContent = clean(s);
  };
  const node = (tag, content, className) => {
    const e = document.createElement(tag);
    e.textContent = clean(content);
    if (className) e.className = className;
    return e;
  };
  const labels = {
    hp: "HP",
    mana: "MP",
    str: "STR",
    dex: "DEX",
    vit: "VIT",
    ene: "ENE",
    luck: "LUCK",
    defense: "DEF",
    resistance: "RES",
    accuracy: "ACC",
    evasion: "EVA",
    critChance: "CRIT",
    critDamage: "Hệ số CRIT",
    potions: "Bình",
    escapeTokens: "Vé thoát",
    barrier: "Barrier",
    maxHp: "Max HP",
    maxMana: "Max MP",
    spell: "Phép",
    physical: "Vật lý",
  };
  const actions = {
    start: "Bắt đầu",
    recording_started: "Bắt đầu ghi lịch sử",
    attack: "Tấn công",
    skill: "Kỹ năng",
    defend: "Phòng thủ",
    potion: "Dùng bình",
    retreat: "Rút thưởng",
    continue: "Đi tiếp",
    next: "Đi tiếp",
    beta_end: "Kết thúc beta",
  };
  const reasons = {
    death: "Tử trận",
    rngesus: "Tử trận bởi RNGesus",
    cashout: "Rút thưởng",
    summit: "Hoàn thành",
    forfeit: "Bỏ cuộc",
    beta_end: "Kết thúc beta",
  };
  function entries(id, values) {
    const root = el(id);
    root.replaceChildren();
    for (const [key, value] of values) {
      if (value === undefined || value === null) continue;
      const row = node("div", "", "stat");
      row.append(
        node("dt", labels[key] || key),
        node("dd", typeof value === "number" ? number(value) : value),
      );
      root.append(row);
    }
  }
  function resource(rootId, label, value, max, mana = false) {
    if (value === undefined) return;
    const wrap = node("div", "", "resource" + (mana ? " mana" : "")),
      line = node("div", "");
    line.append(
      node("span", label),
      node("strong", number(value) + " / " + number(max)),
    );
    const track = node("div", "", "track"),
      fill = node("div", "", "fill");
    fill.style.width =
      Math.max(0, Math.min(100, max ? (value / max) * 100 : 0)) + "%";
    track.append(fill);
    wrap.append(line, track);
    el(rootId).append(wrap);
  }
  function describe(o) {
    if (!o || !Object.keys(o).length) return "Không có";
    return Object.entries(o)
      .map(
        ([k, v]) =>
          (labels[k] || k) +
          ": " +
          (typeof v === "number"
            ? number(v)
            : typeof v === "object"
              ? JSON.stringify(v, null, 2)
              : String(v)),
      )
      .join(" · ");
  }
  try {
    if (typeof DecompressionStream === "undefined")
      throw Error(
        "Trình duyệt chưa hỗ trợ mở dữ liệu nén. Hãy mở file bằng Chrome, Edge hoặc Firefox bản mới.",
      );
    const bytes = Uint8Array.from(
      atob(el("replay-data").textContent.trim()),
      (c) => c.charCodeAt(0),
    );
    const data = await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).json();
    const frames = data.frames || [],
      floors = [...new Set(frames.map((f) => f.floor))].sort((a, b) => a - b);
    let index = 0;
    const result = data.result || {};
    text(
      "summary",
      "Mã ván " +
        data.id +
        " · " +
        (reasons[result.reason] || result.reason || "Đã kết thúc") +
        " · Qua " +
        number(result.cleared) +
        " tầng · " +
        number(result.payout) +
        " xu / " +
        number(result.diamonds) +
        " gem",
    );
    if (data.partial) {
      el("warning").hidden = false;
      text(
        "warning",
        data.summaryOnly
          ? "Ván này kết thúc trước khi có lưu lịch sử từng lượt. Chỉ có tổng kết; không có dữ liệu để dựng replay."
          : "Lịch sử bắt đầu từ giữa ván (lượt " +
              (frames[0]?.turn || 0) +
              "). Những lượt trước đó không được ghi lại.",
      );
    }
    const position = () =>
      el("mode").value === "floor"
        ? floors.indexOf(frames[index]?.floor)
        : index;
    const count = () =>
      el("mode").value === "floor" ? floors.length : frames.length;
    function render() {
      const frame = frames[index];
      if (!frame) return;
      const s = frame.state,
        e = s.encounter || {},
        mode = el("mode").value;
      text("stepTitle", "Tầng " + frame.floor + " · Lượt " + frame.turn);
      text("timestamp", actions[frame.action] || frame.action);
      text("progress", index + 1 + " / " + frames.length + " mốc");
      text(
        "playerName",
        (s.className || s.classKey || "Nhân vật") +
          (s.soul?.soulLevel !== undefined ? " · S" + s.soul.soulLevel : ""),
      );
      el("resources").replaceChildren();
      resource("resources", "HP", s.hp, s.maxHp);
      resource(
        "resources",
        "MP",
        s.mana ?? s.energy,
        s.maxMana ?? s.maxEnergy,
        true,
      );
      entries("stats", [
        ...[
          "str",
          "dex",
          "vit",
          "ene",
          "defense",
          "resistance",
          "accuracy",
          "evasion",
          "luck",
          "potions",
          "escapeTokens",
          "barrier",
        ].map((k) => [k, s[k]]),
        [
          "physical",
          s.damageMin !== undefined
            ? number(s.damageMin) + "–" + number(s.damageMax)
            : undefined,
        ],
        [
          "spell",
          s.spellMin !== undefined
            ? number(s.spellMin) + "–" + number(s.spellMax)
            : undefined,
        ],
        [
          "critChance",
          s.critChance !== undefined
            ? number(s.critChance * 100) + "%"
            : undefined,
        ],
      ]);
      text("encounterName", e.name || e.kind || e.type || "Phòng");
      text(
        "encounterMeta",
        [e.type, e.rank, "Trạng thái sau lượt · tầng " + s.floor]
          .filter(Boolean)
          .join(" · "),
      );
      el("enemyResources").replaceChildren();
      resource("enemyResources", "HP", e.hp, e.maxHp);
      entries("enemyStats", [
        ...["defense", "resistance", "accuracy", "evasion"].map((k) => [
          k,
          e[k],
        ]),
        [
          "physical",
          e.damageMin !== undefined
            ? number(e.damageMin) + "–" + number(e.damageMax)
            : undefined,
        ],
      ]);
      text(
        "context",
        frame.context?.encounter?.name
          ? "Hành động tại tầng " +
              frame.floor +
              " · " +
              frame.context.encounter.name
          : "",
      );
      const log = el("log");
      log.replaceChildren();
      for (const line of clean(s.lastLog || "Chưa có diễn biến.")
        .split("\n")
        .filter(Boolean))
        log.append(node("div", line, "logline"));
      text("changes", JSON.stringify(s.lastStatChanges || {}, null, 2));
      el("items").replaceChildren();
      for (const item of s.items || []) {
        const div = node("div", "", "item");
        div.append(
          node(
            "strong",
            item.name + " [" + (item.rarity || "?") + "] · Lv." + item.level,
          ),
          node("p", describe(item.effects)),
        );
        if (item.curse)
          div.append(node("p", "Lời nguyền: " + describe(item.curse)));
        el("items").append(div);
      }
      if (!s.items?.length) el("items").append(node("p", "Không có trang bị."));
      text("rifts", describe(s.rifts));
      text(
        "effects",
        JSON.stringify(
          { effects: s.effects, memories: s.memories, boss: e.boss },
          null,
          2,
        ),
      );
      el("inputLabel").textContent =
        mode === "floor" ? "Nhập tầng" : "Nhập lượt";
      el("position").value = mode === "floor" ? frame.floor : frame.turn;
      el("position").min = mode === "floor" ? floors[0] : frames[0].turn;
      el("position").max =
        mode === "floor" ? floors.at(-1) : frames.at(-1).turn;
      el("prev").disabled = position() <= 0;
      el("next").disabled = position() >= count() - 1;
      el("timeline").max = count() - 1;
      el("timeline").value = position();
    }
    function navigate(n) {
      if (!frames.length) return;
      const target = Math.max(0, Math.min(count() - 1, n));
      index =
        el("mode").value === "floor"
          ? frames.findIndex((f) => f.floor === floors[target])
          : target;
      text("message", "");
      render();
    }
    el("prev").addEventListener("click", () => navigate(position() - 1));
    el("next").addEventListener("click", () => navigate(position() + 1));
    el("timeline").addEventListener("input", () =>
      navigate(Number(el("timeline").value)),
    );
    el("mode").addEventListener("change", () => {
      text("message", "");
      render();
    });
    el("jump").addEventListener("submit", (event) => {
      event.preventDefault();
      const raw = el("position").value.trim(),
        n = Number(raw),
        key = el("mode").value === "floor" ? "floor" : "turn";
      const found =
        raw && Number.isSafeInteger(n)
          ? frames.findIndex((f) => f[key] === n)
          : -1;
      if (found < 0) {
        text(
          "message",
          "Không có " +
            (key === "floor" ? "tầng" : "lượt") +
            " này trong lịch sử đã ghi.",
        );
        return;
      }
      index = found;
      text("message", "");
      render();
    });
    document.addEventListener("keydown", (event) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(event.target?.tagName))
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        navigate(position() + (event.key === "ArrowLeft" ? -1 : 1));
      }
    });
    if (!frames.length) {
      el("scene").hidden = true;
      text("stepTitle", "Chỉ có tổng kết");
      for (const id of ["mode", "position", "prev", "next", "timeline"])
        el(id).disabled = true;
      el("jump").hidden = true;
    } else render();
    return { data, getIndex: () => index };
  } catch (error) {
    text("summary", "Không mở được replay");
    text("message", error.message);
    el("scene").hidden = true;
    for (const id of ["mode", "position", "prev", "next", "timeline"])
      el(id).disabled = true;
  }
})();
