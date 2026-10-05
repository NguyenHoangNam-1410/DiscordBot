const path = require("node:path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const WIDTH = 1000;
const HEIGHT = 340;
const AVATAR_FETCH_TIMEOUT_MS = 3_000;

// Font đóng gói kèm bot (Noto, giấy phép OFL) để thẻ hiển thị giống nhau trên mọi máy chủ: Noto Sans cho chữ Latin/tiếng Việt,
// Noto Sans Math cho chữ kiểu toán học như 𝓞𝓰𝓰𝔂, Noto Sans Symbols 2 cho ký hiệu. Thiếu font hệ thống không còn làm hiện ô vuông.
const FONT_DIR = path.join(__dirname, "../../assets/fonts");
const BUNDLED_FONTS = [
  ["NotoSans-Regular.ttf", "Noto Sans"],
  ["NotoSans-Bold.ttf", "Noto Sans"],
  ["NotoSansMath-Regular.ttf", "Noto Sans Math"],
  ["NotoSansSymbols2-Regular.ttf", "Noto Sans Symbols 2"],
];
for (const [file, family] of BUNDLED_FONTS) {
  try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, file), family);
  } catch {
    // Không có file font thì vẫn vẽ được bằng font hệ thống.
  }
}
const FONT_FAMILY =
  '"Noto Sans", "Noto Sans Math", "Noto Sans Symbols 2", "Segoe UI", sans-serif';

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  const value = String(text);
  if (ctx.measureText(value).width <= maxWidth) return value;
  let output = value;
  while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth)
    output = output.slice(0, -1);
  return `${output}…`;
}

async function fetchAvatar(avatarUrl) {
  if (!avatarUrl) return null;
  try {
    const response = await fetch(avatarUrl, {
      signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

// Nền tối pha nhẹ màu hồ sơ; chữ sáng dịu và màu nhấn được cân độ tương phản.
function parseHex(color) {
  const hex = String(color).replace("#", "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex.slice(0, 6);
  const value = Number.parseInt(full, 16);
  return Number.isFinite(value) ? [(value >> 16) & 255, (value >> 8) & 255, value & 255] : [100, 116, 139];
}
function toHex(rgb) {
  return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}
function mix(color, other, amount) {
  const from = parseHex(color);
  const to = parseHex(other);
  return toHex(from.map((v, i) => v + (to[i] - v) * amount));
}
function luminance(color) {
  const [r, g, b] = parseHex(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Giữ màu nhấn dễ đọc trên nền tối, giảm chói với màu quá sáng và nâng màu quá tối.
function strongAccent(accent) {
  let color = accent;
  for (let i = 0; i < 16 && luminance(color) < 0.3; i += 1)
    color = mix(color, "#cbd5e1", 0.12);
  for (let i = 0; i < 16 && luminance(color) > 0.65; i += 1)
    color = mix(color, "#94a3b8", 0.12);
  return color;
}
const INK = "#e2e8f0";
const INK_SOFT = "#94a3b8";

function drawBackground(ctx, accent) {
  ctx.fillStyle = mix(accent, "#0b101b", 0.93);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, WIDTH, 7);
}

function drawPanel(ctx, x, y, width, height, radius, alpha) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.28)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = `rgba(30,41,59,${alpha})`;
  ctx.fill();
  ctx.restore();
}

async function drawAvatar(ctx, avatarUrl, displayName, accent) {
  const x = 142;
  const y = 145;
  const radius = 82;
  const avatar = await fetchAvatar(avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  if (avatar)
    ctx.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
  else {
    ctx.fillStyle = mix(accent, "#111827", 0.8);
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = strongAccent(accent);
    ctx.font = `700 58px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      Array.from(String(displayName).trim())[0]?.toUpperCase() || "?",
      x,
      y + 2,
    );
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = mix(strongAccent(accent), "#64748b", 0.55);
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 14;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawStat(ctx, x, y, label, value, accent) {
  ctx.fillStyle = INK_SOFT;
  ctx.font = `600 13px ${FONT_FAMILY}`;
  ctx.fillText(label.toUpperCase(), x, y);
  ctx.fillStyle = INK;
  ctx.font = `700 24px ${FONT_FAMILY}`;
  ctx.fillText(String(value), x, y + 31);
  ctx.fillStyle = strongAccent(accent);
  ctx.fillRect(x, y + 41, 34, 3);
}

// Độ dày khung: phủ kín toàn bộ mép thẻ (kể cả bốn góc) để không lộ màu hồ sơ ở viền.
const FRAME_THICKNESS = 7.5;
// Các chi tiết trang trí co giãn theo độ dày khung (thiết kế gốc dày 15px).
const FRAME_SCALE = FRAME_THICKNESS / 15;

function metalGradient(ctx, frame) {
  const metal = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  frame.colors.forEach((color, index) =>
    metal.addColorStop(index / (frame.colors.length - 1), color),
  );
  return metal;
}

// Nền thẻ: có khung thì tô kim loại kín cả canvas rồi chỉ vẽ nền hồ sơ bên trong khung.
function drawCardBackground(ctx, accent, frame) {
  if (!frame) return drawBackground(ctx, accent);
  ctx.fillStyle = metalGradient(ctx, frame);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  roundedRect(
    ctx,
    FRAME_THICKNESS,
    FRAME_THICKNESS,
    WIDTH - FRAME_THICKNESS * 2,
    HEIGHT - FRAME_THICKNESS * 2,
    14 * FRAME_SCALE + 4,
  );
  ctx.clip();
  drawBackground(ctx, accent);
  ctx.restore();
  return undefined;
}

// Chi tiết trang trí đè lên khung (đã được tô kín ở drawCardBackground).
function drawSurvivalFrame(ctx, frame) {
  if (!frame) return;
  ctx.save();
  const bevel = frame.colors[frame.colors.length - 1];
  ctx.lineWidth = 1;
  ctx.strokeStyle = bevel;
  ctx.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = frame.colors[1];
  roundedRect(
    ctx,
    FRAME_THICKNESS - 0.75,
    FRAME_THICKNESS - 0.75,
    WIDTH - (FRAME_THICKNESS - 0.75) * 2,
    HEIGHT - (FRAME_THICKNESS - 0.75) * 2,
    15 * FRAME_SCALE + 4,
  );
  ctx.stroke();
  if (frame.id === "survival_diamond") {
    const reach = 10 * FRAME_SCALE + 1;
    const edge = FRAME_THICKNESS / 2 + 0.5;
    for (const [x, y] of [
      [edge, edge],
      [WIDTH - edge, edge],
      [edge, HEIGHT - edge],
      [WIDTH - edge, HEIGHT - edge],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y - reach);
      ctx.lineTo(x + reach * 0.9, y);
      ctx.lineTo(x, y + reach);
      ctx.lineTo(x - reach * 0.9, y);
      ctx.closePath();
      ctx.fillStyle = "#eaffff";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = frame.colors[1];
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function renderProfileCard({
  displayName,
  username,
  avatarUrl,
  account,
  rank,
  appearance,
  progress = {},
  xpTarget = 200,
  serverName = "Server hiện tại",
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const accent = appearance.color.value;
  const level = Math.max(1, Number(progress.level) || 1);
  const experience = Math.max(0, Number(progress.experience) || 0);
  const target = Math.max(1, Number(xpTarget) || 200);
  const expPercent = Math.max(0, Math.min(100, (experience / target) * 100));

  drawCardBackground(ctx, accent, appearance.frame);
  drawPanel(ctx, 34, 34, 220, 272, 18, 0.72);
  drawPanel(ctx, 282, 34, 684, 272, 18, 0.62);
  await drawAvatar(ctx, avatarUrl, displayName, accent);

  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `700 22px ${FONT_FAMILY}`;
  ctx.fillText(fitText(ctx, displayName, 188), 144, 259);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `14px ${FONT_FAMILY}`;
  ctx.fillText(fitText(ctx, `@${username}`, 180), 144, 283);
  ctx.textAlign = "left";

  ctx.fillStyle = INK_SOFT;
  ctx.font = `800 21px ${FONT_FAMILY}`;
  ctx.fillText(
    fitText(ctx, `SERVER • ${String(serverName).toUpperCase()}`, 470),
    320,
    76,
  );
  ctx.fillStyle = INK;
  ctx.font = `800 32px ${FONT_FAMILY}`;
  ctx.fillText(fitText(ctx, displayName, 430), 320, 111);
  roundedRect(ctx, 810, 58, 112, 38, 12);
  ctx.fillStyle = "rgba(15,23,42,.85)";
  ctx.fill();
  ctx.strokeStyle = mix(strongAccent(accent), "#475569", 0.45);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = strongAccent(accent);
  ctx.font = `800 18px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText(`#${rank}`, 866, 83);
  ctx.textAlign = "left";

  // Thứ tự: Xu → Kim cương → Cấp độ → Tầng sinh tồn (tầng cao nhất đã đạt).
  drawStat(
    ctx,
    320,
    153,
    "Xu",
    Number(account.balance).toLocaleString("vi-VN"),
    accent,
  );
  drawStat(
    ctx,
    530,
    153,
    "Kim cương",
    Number(progress.diamonds || 0).toLocaleString("vi-VN"),
    accent,
  );
  drawStat(ctx, 690, 153, "Cấp độ", level, accent);
  drawStat(
    ctx,
    815,
    153,
    "Tầng sinh tồn",
    Number(appearance.bestFloor || 0).toLocaleString("vi-VN"),
    accent,
  );

  ctx.fillStyle = INK_SOFT;
  ctx.font = `600 13px ${FONT_FAMILY}`;
  ctx.fillText(`TIẾN ĐỘ CẤP ${level}`, 320, 258);
  roundedRect(ctx, 420, 246, 430, 16, 8);
  ctx.fillStyle = "rgba(148,163,184,.16)";
  ctx.fill();
  const barWidth = (430 * expPercent) / 100;
  if (barWidth > 0) {
    roundedRect(ctx, 420, 246, barWidth, 16, 8);
    ctx.fillStyle = strongAccent(accent);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  ctx.font = `700 14px ${FONT_FAMILY}`;
  ctx.textAlign = "right";
  ctx.fillText(
    `${experience.toLocaleString("vi-VN")} / ${target.toLocaleString("vi-VN")} EXP`,
    920,
    259,
  );
  drawSurvivalFrame(ctx, appearance.frame);
  return canvas.encode("png");
}

module.exports = { WIDTH, HEIGHT, AVATAR_FETCH_TIMEOUT_MS, renderProfileCard };
