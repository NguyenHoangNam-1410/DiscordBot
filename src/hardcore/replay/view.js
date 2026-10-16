"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { gzipSync } = require("node:zlib"),
  { randomBytes } = require("node:crypto");
function html(data) {
  const nonce = randomBytes(18).toString("base64");
  const content = gzipSync(Buffer.from(JSON.stringify(data)), {
    level: 9,
  }).toString("base64");
  const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8"),
    js = fs.readFileSync(path.join(__dirname, "client.js"), "utf8");
  return Buffer.from(
    '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-' +
      nonce +
      "'; style-src 'nonce-" +
      nonce +
      "'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'\"><title>Sinh tồn · Replay</title><style nonce=\"" +
      nonce +
      '">' +
      css +
      '</style></head><body><main><header><span class="eyebrow">SINH TỒN / REPLAY OFFLINE</span><h1>Mỗi lựa chọn, một dấu vết.</h1><p id="summary">Đang mở replay…</p><p id="warning" class="notice" hidden></p></header><nav aria-label="Điều khiển replay"><label>Xem theo<select id="mode"><option value="turn">Lượt</option><option value="floor">Tầng</option></select></label><form id="jump"><label id="inputLabel" for="position">Nhập lượt</label><div><input id="position" type="number" min="0" step="1" required inputmode="numeric"><button type="submit">Đi tới</button></div></form><div class="steps"><button id="prev" type="button">← Trước</button><button id="next" type="button">Sau →</button></div><label class="timeline">Tiến trình<input id="timeline" type="range" min="0" max="0" value="0" aria-label="Tiến trình replay"></label></nav><p id="message" role="status" aria-live="polite"></p><section class="heading"><h2 id="stepTitle"></h2><span id="progress" class="badge"></span></section><div id="scene" class="scene"><section class="card"><div class="card-head"><h3 id="playerName">Nhân vật</h3><span id="timestamp" class="badge action"></span></div><div id="resources"></div><dl id="stats" class="stats"></dl></section><section class="card"><h3 id="encounterName">Đối thủ / Phòng</h3><p id="encounterMeta"></p><div id="enemyResources"></div><dl id="enemyStats" class="stats"></dl><p id="context" class="muted"></p></section><section class="card log"><h3>Diễn biến lượt</h3><div id="log"></div><section class="change-section"><h4>Thay đổi chỉ số</h4><div id="changes" class="changes"></div></section></section><div class="collections"><section class="card"><div class="card-head"><h3>Trang bị</h3><div class="pager"><button id="itemsPrev" type="button" aria-label="Trang bị trước">←</button><span id="itemsPage" class="page-count"></span><button id="itemsNext" type="button" aria-label="Trang bị sau">→</button></div></div><div id="items"></div></section><section class="card"><div class="card-head"><h3>Rift</h3><div class="pager"><button id="riftsPrev" type="button" aria-label="Rift trước">←</button><span id="riftsPage" class="page-count"></span><button id="riftsNext" type="button" aria-label="Rift sau">→</button></div></div><div id="rifts"></div></section><section class="card"><div class="card-head"><h3>Hiệu ứng</h3><div class="pager"><button id="effectsPrev" type="button" aria-label="Hiệu ứng trước">←</button><span id="effectsPage" class="page-count"></span><button id="effectsNext" type="button" aria-label="Hiệu ứng sau">→</button></div></div><div id="effects"></div></section></div></div><footer>Snapshot tại thời điểm chơi · Không tính lại bằng luật game hiện tại · Mũi tên ← / → để chuyển bước</footer><noscript>Cần bật JavaScript để xem replay offline.</noscript></main><script nonce="' +
      nonce +
      '" id="replay-data" type="application/octet-stream">' +
      content +
      '</script><script nonce="' +
      nonce +
      '">' +
      js +
      "</script></body></html>",
    "utf8",
  );
}
module.exports = { html };
