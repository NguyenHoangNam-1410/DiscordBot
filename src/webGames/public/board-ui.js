"use strict";

globalThis.WebGameBoardUI = (() => {
  function ruleBadges(game, state) {
    const rules = state.rules || {};
    const clock = {
      text: `${rules.timeMinutes ?? 30} phút/người`,
      title: "Đồng hồ riêng, chỉ chạy khi tới lượt và không cộng giờ.",
    };
    if (game === "caro") {
      const badges = [
        { text: `Bàn ${state.size}×${state.size}` },
        {
          text: `${rules.exactLength ? "Đúng" : "Từ"} ${rules.winLength} quân thắng`,
          key: true,
          title: rules.exactLength
            ? "Nối dài hơn số quân này không được tính thắng."
            : "Nối đủ hoặc nhiều hơn số quân này được tính thắng.",
        },
        {
          text: `Chặn 2 đầu: ${rules.blockBothEnds ? "Không thắng" : "Vẫn thắng"}`,
        },
      ];
      if (rules.blockBothEnds)
        badges.push({
          text: `Mép bàn: ${rules.edgeBlocks ? "Tính chặn" : "Không tính chặn"}`,
        });
      return [...badges, clock];
    }
    if (game === "blokus")
      return [
        { text: "Duo · 14×14", key: true },
        { text: "21 quân/người" },
        { text: "Chạm góc · Không chạm cạnh" },
        clock,
      ];
    if (game === "walls")
      return [
        { text: "Bàn 9×9" },
        { text: `Tường dài ${rules.wallLength} ô`, key: true },
        {
          text:
            rules.wallLimit === 0
              ? "Không dùng tường"
              : `${rules.wallLimit} tường/người`,
        },
        clock,
      ];
    if (game === "battleship") {
      const modes = { small: "Nhỏ", medium: "Vừa", large: "Lớn" };
      const count = state.fleet.length;
      return [
        { text: `Cỡ ${modes[rules.mode] || "Vừa"}`, key: true },
        { text: `Bàn ${state.size}×${state.size}` },
        { text: `${count} thuyền/người` },
        {
          text: `Dài ${Math.min(...state.fleet)}–${Math.max(...state.fleet)} ô`,
        },
        { text: `Chuẩn bị ${count * 20}s` },
        clock,
      ];
    }
    return [];
  }
  function renderRules(game, state) {
    if (!state) return;
    const target = document.getElementById("rule-badges");
    if (!target) return;
    const badges = ruleBadges(game, state),
      key = JSON.stringify(badges);
    if (target.dataset.rulesKey === key) return;
    target.dataset.rulesKey = key;
    target.replaceChildren(
      ...badges.map((badge) => {
        const el = document.createElement("span");
        el.className = "rule-badge" + (badge.key ? " rule-badge-key" : "");
        el.textContent = badge.text;
        if (badge.title) el.title = badge.title;
        return el;
      }),
    );
  }
  return { renderRules };
})();
