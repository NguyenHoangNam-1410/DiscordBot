"use strict";

(() => {
  const code = document.getElementById("pair-code");
  if (!code || document.getElementById("copy-pair-code")) return;
  const tools = document.createElement(
    /^H[1-6]$/.test(code.tagName) ? "div" : "span",
  );
  tools.className = "wg-pair-code-tools";
  code.before(tools);
  tools.append(code);
  const button = document.createElement("button");
  button.id = "copy-pair-code";
  button.type = "button";
  button.textContent = "Sao chép";
  button.setAttribute("aria-label", "Sao chép mã xác nhận");
  const status = document.createElement("span");
  status.id = "pair-copy-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  tools.append(button, status);
  let busy = false,
    revision = 0,
    resetTimer;
  const value = () => code.textContent.trim();
  const valid = () => /^[A-F0-9]{8}$/.test(value());
  function refresh() {
    revision++;
    clearTimeout(resetTimer);
    status.textContent = "";
    button.textContent = "Sao chép";
    button.disabled = busy || !valid();
  }
  new MutationObserver(refresh).observe(code, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  refresh();

  function legacyCopy(text) {
    const active = document.activeElement;
    const selection = window.getSelection();
    const ranges = [];
    for (let i = 0; i < (selection?.rangeCount || 0); i++)
      ranges.push(selection.getRangeAt(i).cloneRange());
    const input = document.createElement("textarea");
    input.className = "wg-pair-copy-input";
    input.value = text;
    input.readOnly = true;
    input.setAttribute("aria-label", "Mã xác nhận");
    (code.closest("dialog") || document.body).append(input);
    try {
      input.focus({ preventScroll: true });
      input.select();
      input.setSelectionRange(0, text.length);
      return document.execCommand("copy");
    } finally {
      input.remove();
      active?.focus({ preventScroll: true });
      if (selection) {
        selection.removeAllRanges();
        for (const range of ranges) selection.addRange(range);
      }
    }
  }

  button.addEventListener("click", async () => {
    if (busy || !valid()) return;
    clearTimeout(resetTimer);
    const text = value(),
      attempt = revision;
    busy = true;
    button.disabled = true;
    status.textContent = "";
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch {
          // Older browsers and denied clipboard permissions may allow manual copy.
        }
      }
      if (!copied && attempt === revision) copied = legacyCopy(text);
    } catch {
      copied = false;
    } finally {
      busy = false;
      button.disabled = !valid();
    }
    if (attempt !== revision) return;
    if (copied) {
      button.textContent = "Đã sao chép";
      status.textContent = "Đã sao chép mã xác nhận.";
      resetTimer = setTimeout(refresh, 2500);
    } else {
      status.textContent =
        "Không thể sao chép tự động. Hãy chọn và sao chép mã bên cạnh.";
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  });
})();
