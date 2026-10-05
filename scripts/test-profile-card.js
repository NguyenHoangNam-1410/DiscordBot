const assert = require("node:assert/strict");
const canvasModule = require("@napi-rs/canvas");

// Ghi lại mọi chữ được vẽ để kiểm tra nhãn và thứ tự chỉ số.
const drawn = [];
const originalCreateCanvas = canvasModule.createCanvas;
canvasModule.createCanvas = (...args) => {
  const canvas = originalCreateCanvas(...args); const ctx = canvas.getContext("2d"); const fillText = ctx.fillText.bind(ctx);
  ctx.fillText = (text, x, y, ...rest) => { drawn.push({ text: String(text), x, y }); return fillText(text, x, y, ...rest); };
  return canvas;
};
const { renderProfileCard, WIDTH, HEIGHT } = require("../src/services/profileCardService");

const ACCENT = "#ef4444";
const FRAMES = {
  silver: { id: "survival_silver", name: "Khung Bạc", colors: ["#687481", "#f3f7fc", "#a7b3c0", "#ffffff", "#687481"] },
  gold: { id: "survival_gold", name: "Khung Vàng", colors: ["#926213", "#ffec9b", "#d6a72f", "#fff4b8", "#926213"] },
  diamond: { id: "survival_diamond", name: "Khung Kim cương", colors: ["#528cc7", "#efffff", "#82e9f5", "#e6ceff", "#528cc7"] },
};
const render = (frame) => renderProfileCard({ displayName: "Silv", username: "silvchan", avatarUrl: null, account: { balance: 1764178, games_played: 187 }, rank: 5,
  appearance: { color: { name: "Đỏ Rực", value: ACCENT }, frame, bestFloor: 368 }, progress: { level: 4, experience: 547, diamonds: 500 }, xpTarget: 800, serverName: "Genshin Impact Việt Nam" });
const pixels = async (png) => { const image = await canvasModule.loadImage(png); const canvas = originalCreateCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, WIDTH, HEIGHT).data; };
const isAccent = (data, x, y) => { const i = (y * WIDTH + x) * 4; return data[i] > 150 && data[i + 1] < 100 && data[i + 2] < 100; };
const borderPoints = (thickness) => { const points = [];
  for (let t = 0; t < thickness; t += 1) { for (let x = 0; x < WIDTH; x += 7) points.push([x, t], [x, HEIGHT - 1 - t]); for (let y = 0; y < HEIGHT; y += 7) points.push([t, y], [WIDTH - 1 - t, y]); }
  return points; };

(async () => {
  const plain = await pixels(await render(null));
  const at = (data, x, y) => { const i = (y * WIDTH + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  // Khung phải bọc kín toàn bộ mép (kể cả bốn góc), không lộ màu hồ sơ ở viền
  for (const [name, frame] of Object.entries(FRAMES)) {
    const data = await pixels(await render(frame));
    // Khung mỏng ~7,5px: từ độ sâu 10px trở vào thẻ giống hệt thẻ không khung (nền hồ sơ)
    for (const [x, y] of [[500, 10], [500, 12], [10, 170], [12, 170], [WIDTH - 11, 170], [WIDTH - 13, 170], [500, HEIGHT - 11]])
      assert.deepEqual(at(data, x, y), at(plain, x, y), `${name}: khung phải mỏng, điểm (${x},${y}) vẫn còn khung`);
    assert.notDeepEqual(at(data, 500, 3), at(plain, 500, 3), `${name}: viền ngoài phải là khung kim loại`);
    const leaked = borderPoints(6).filter(([x, y]) => isAccent(data, x, y));
    assert.equal(leaked.length, 0, `${name}: lộ màu hồ sơ ở ${leaked.length} điểm viền, ví dụ ${JSON.stringify(leaked.slice(0, 3))}`);
    for (const [x, y] of [[0, 0], [WIDTH - 1, 0], [0, HEIGHT - 1], [WIDTH - 1, HEIGHT - 1]]) assert(!isAccent(data, x, y), `${name}: góc (${x},${y}) lộ màu hồ sơ`);
  }
  // Không có khung thì vẫn có vạch màu hồ sơ ở mép trên (đối chứng để chắc phép kiểm tra có tác dụng)
  assert(borderPoints(5).some(([x, y]) => isAccent(plain, x, y)), "không khung: vạch màu hồ sơ phải còn");
  // Giao diện dark: nền và panel tối để không chói, giữ màu hồ sơ làm điểm nhấn
  const lightness = ([r, g, b]) => (r + g + b) / 3;
  for (const [x, y] of [[300, 20], [650, 320], [140, 330]]) assert(lightness(at(plain, x, y)) < 60, `nền thẻ phải tối tại (${x},${y})`);
  // Nền một màu phẳng, không gradient hay đường trang trí: các điểm trống ngoài panel giống hệt nhau
  const flat = at(plain, 300, 20);
  for (const [x, y] of [[990, 330], [10, 330], [650, 336], [6, 150], [995, 150], [500, 12], [10, 12]]) assert.deepEqual(at(plain, x, y), flat, `nền phải là một màu phẳng, điểm (${x},${y}) khác`);

  // Nhãn và thứ tự chỉ số: Xu → Kim cương → Cấp độ → Tầng sinh tồn
  drawn.length = 0; await render(FRAMES.silver);
  const labels = ["XU", "KIM CƯƠNG", "CẤP ĐỘ", "TẦNG SINH TỒN"];
  const stats = labels.map((label) => drawn.find((item) => item.text === label));
  assert(stats.every(Boolean), `thiếu nhãn: ${stats.map((item, index) => (item ? "" : labels[index])).join(",")}`);
  assert(stats.every((item, index) => index === 0 || item.x > stats[index - 1].x), "thứ tự từ trái sang phải phải là Xu, Kim cương, Cấp độ, Tầng sinh tồn");
  assert(stats.every((item) => item.y === stats[0].y), "các chỉ số nằm cùng một hàng");
  const valueUnder = (label) => drawn.find((item) => item.x === label.x && item.y === label.y + 31)?.text;
  assert.deepEqual(stats.map(valueUnder), ["1.764.178", "500", "4", "368"], "giá trị tương ứng, Xu không kèm đơn vị");
  const all = drawn.map((item) => item.text).join("|");
  for (const removed of ["SỐ DƯ", "TỔNG SỐ VÁN", "TẦNG CAO NHẤT", "SINH TỒN •", "KHUNG BẠC"]) assert(!all.includes(removed), `phải bỏ "${removed}"`);
  assert(!drawn.some((item) => /\bxu$/i.test(item.text) && /\d/.test(item.text)), "không còn đơn vị xu sau số");
  assert(drawn.some((item) => item.text === "TIẾN ĐỘ CẤP 4") && drawn.some((item) => /547 \/ 800 EXP/.test(item.text)), "thanh tiến độ cấp giữ nguyên");
  assert(drawn.some((item) => item.text === "#5"), "hạng giữ nguyên");
  // Tầng sinh tồn chưa chơi = 0
  drawn.length = 0; await renderProfileCard({ displayName: "A", username: "a", account: { balance: 0 }, rank: 1, appearance: { color: { name: "x", value: ACCENT }, frame: null }, progress: {} });
  assert(drawn.some((item) => item.text === "0" && item.y === stats[0].y + 31 && item.x === 815), "tầng sinh tồn mặc định 0");
  console.log(JSON.stringify({ ok: true, profileCard: true }));
})().catch((error) => { console.error(error); process.exitCode = 1; });

{
  const { GlobalFonts } = require("@napi-rs/canvas");
  const families = GlobalFonts.families.map((item) => item.family);
  for (const family of ["Noto Sans", "Noto Sans Math", "Noto Sans Symbols 2"]) assert(families.includes(family), `thiếu font đóng gói: ${family}`);
  const { createCanvas } = require("@napi-rs/canvas");
  const ctx = createCanvas(200, 80).getContext("2d");
  ctx.font = '700 40px "Noto Sans", "Noto Sans Math", "Noto Sans Symbols 2"';
  assert(ctx.measureText("𝓞𝓰𝓰𝔂").width > 60, "ký tự toán học in nghiêng phải có glyph, không phải ô vuông trống");
}
