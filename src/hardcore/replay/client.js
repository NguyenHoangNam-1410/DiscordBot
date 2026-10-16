"use strict";
(async () => {
  const el = (id) => document.getElementById(id);
  const number = (n) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
      Number(n) || 0,
    );
  const clean = (s) =>
    String(s ?? "")
      .replace(/<a?:(HP|MANA|Mana):\d+>/g, (_, name) =>
        name === "HP" ? "HP" : "MP",
      )
      .replace(/<a?:\w+:\d+>/g, "")
      .replace(/\b(HP|MP)(?:[ \t]+\1)+\b/g, "$1")
      .replace(/<@!?(\d+)>/g, "Người chơi")
      .replace(
        /\$\{E\.(\w+)\}/g,
        (_, key) =>
          ({ mana: "MP", hp: "HP", defense: "DEF", res: "RES" })[key] || key,
      )
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
    damageMin: "Vật lý tối thiểu",
    damageMax: "Vật lý tối đa",
    spellMin: "Phép tối thiểu",
    spellMax: "Phép tối đa",
    potionRate: "Hiệu lực bình",
    heal: "Hồi HP",
    startMana: "MP đầu trận",
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
  const percentKeys = new Set([
    "critChance",
    "potionRate",
    "physicalPercent",
    "spellPercent",
    "defensePercent",
    "maxHpPercent",
    "maxManaPercent",
  ]);
  const title = (key) =>
    labels[key] ||
    String(key)
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2");
  function describe(o, depth = 0) {
    if (o === null || o === undefined) return "Không có";
    if (typeof o !== "object")
      return typeof o === "number"
        ? number(o)
        : typeof o === "boolean"
          ? o
            ? "Đang bật"
            : "Chưa kích hoạt"
          : clean(o);
    if (depth > 5) return "Trạng thái bổ sung";
    return (
      Object.entries(o)
        .map(
          ([k, v]) =>
            title(k) +
            ": " +
            (typeof v === "number" && percentKeys.has(k)
              ? number(v * 100) + "%"
              : describe(v, depth + 1)),
        )
        .join(" · ") || "Không có"
    );
  }
  const collectionPages = { items: 0, rifts: 0, effects: 0 },
    collectionData = { items: [], rifts: [], effects: [] };
  function renderCollection(key, records) {
    collectionData[key] = records;
    collectionPages[key] = Math.max(
      0,
      Math.min(collectionPages[key], records.length - 1),
    );
    const page = collectionPages[key],
      root = el(key);
    root.replaceChildren();
    text(
      key + "Page",
      records.length ? page + 1 + " / " + records.length : "0 / 0",
    );
    el(key + "Prev").disabled = !records.length || page === 0;
    el(key + "Next").disabled = !records.length || page >= records.length - 1;
    const record = records[page];
    if (!record) {
      root.append(
        node(
          "p",
          {
            items: "Không có trang bị.",
            rifts: "Không có Rift đang hoạt động.",
            effects: "Không có hiệu ứng đang hoạt động.",
          }[key],
        ),
      );
      return;
    }
    root.append(node("h4", record.title));
    for (const line of clean(record.text).split("\n").filter(Boolean))
      root.append(node("p", line));
    if (record.note) root.append(node("p", record.note, "muted"));
  }
  for (const key of Object.keys(collectionPages))
    for (const [suffix, delta] of [
      ["Prev", -1],
      ["Next", 1],
    ])
      el(key + suffix).addEventListener("click", () => {
        collectionPages[key] += delta;
        renderCollection(key, collectionData[key]);
      });
  function renderChanges(current, previous) {
    const root = el("changes");
    root.replaceChildren();
    if (!previous) {
      root.append(
        node("p", "Mốc bắt đầu, chưa có thay đổi để đối chiếu.", "muted"),
      );
      return;
    }
    const keys = [
      "hp",
      "mana",
      "energy",
      "maxHp",
      "maxMana",
      "str",
      "dex",
      "vit",
      "ene",
      "damageMin",
      "damageMax",
      "spellMin",
      "spellMax",
      "defense",
      "resistance",
      "accuracy",
      "evasion",
      "critChance",
      "luck",
      "potions",
      "potionRate",
      "escapeTokens",
      "barrier",
    ];
    let count = 0;
    for (const key of keys) {
      if (key === "energy" && current.mana !== undefined) continue;
      if (!Number.isFinite(current[key]) || !Number.isFinite(previous[key]))
        continue;
      const delta =
        (current[key] - previous[key]) * (percentKeys.has(key) ? 100 : 1);
      if (Math.abs(delta) < 0.05) continue;
      const suffix =
        percentKeys.has(key) || key === "resistance" ? " điểm %" : "";
      root.append(
        node(
          "span",
          (key === "energy" ? "MP" : title(key)) +
            ": " +
            (delta > 0 ? "+" : "") +
            number(delta) +
            suffix,
          "change " + (delta > 0 ? "positive" : "negative"),
        ),
      );
      count++;
    }
    if (!count) root.append(node("p", "Không thay đổi chỉ số.", "muted"));
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
    let index = 0,
      lastRendered = -1;
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
      renderChanges(s, frames[index - 1]?.state);
      if (lastRendered !== index) {
        for (const key of Object.keys(collectionPages))
          collectionPages[key] = 0;
        lastRendered = index;
      }
      renderCollection(
        "items",
        (s.items || []).map((item) => ({
          title:
            item.name + " [" + (item.rarity || "?") + "] · Lv." + item.level,
          text:
            describe(item.effects) +
            (item.curse ? "\nLời nguyền: " + describe(item.curse) : ""),
        })),
      );
      const presentation = s.presentation || {};
      renderCollection(
        "rifts",
        presentation.rifts ||
          Object.entries(s.rifts || {})
            .filter(([, n]) => n > 0)
            .map(([key, n]) => ({
              title: title(key) + " ×" + n,
              text: "Snapshot cũ chưa lưu diễn giải chi tiết Rift.",
            })),
      );
      renderCollection(
        "effects",
        presentation.effects ||
          Object.entries(s.effects || {})
            .filter(
              ([, value]) =>
                value && typeof value === "object" && Object.keys(value).length,
            )
            .map(([key, value]) => ({
              title: title(key),
              text: describe(value),
            })),
      );
      if (presentation.supplemented)
        el("rifts").append(
          node(
            "p",
            "Diễn giải bổ sung khi xuất lại từ snapshot cũ; không tính lại chỉ số.",
            "muted",
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
