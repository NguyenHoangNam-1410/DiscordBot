const { createCanvas, loadImage } = require("@napi-rs/canvas");

const WIDTH = 1000;
const HEIGHT = 340;
const AVATAR_FETCH_TIMEOUT_MS = 3_000;

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

function drawBackground(ctx, accent) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#090b10");
  gradient.addColorStop(0.65, "#151922");
  gradient.addColorStop(1, accent);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = `${accent}33`;
  ctx.lineWidth = 2;
  for (let x = -HEIGHT; x < WIDTH; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, HEIGHT);
    ctx.lineTo(x + HEIGHT, 0);
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, WIDTH, 7);
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
    ctx.fillStyle = accent;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = '700 58px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      String(displayName).trim().slice(0, 1).toUpperCase() || "?",
      x,
      y + 2,
    );
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawStat(ctx, x, y, label, value, accent) {
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = '600 13px "Segoe UI", sans-serif';
  ctx.fillText(label.toUpperCase(), x, y);
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 24px "Segoe UI", sans-serif';
  ctx.fillText(String(value), x, y + 31);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y + 41, 34, 3);
}

function drawSurvivalFrame(ctx, frame) {
  if (!frame) return;
  ctx.save();
  const metal = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  frame.colors.forEach((color, index) =>
    metal.addColorStop(index / (frame.colors.length - 1), color),
  );
  ctx.strokeStyle = metal;
  ctx.lineWidth = 9;
  roundedRect(ctx, 7, 7, WIDTH - 14, HEIGHT - 14, 22);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = frame.colors[1];
  roundedRect(ctx, 15, 15, WIDTH - 30, HEIGHT - 30, 16);
  ctx.stroke();
  if (frame.id === "survival_diamond") {
    for (const [x, y] of [
      [22, 22],
      [WIDTH - 22, 22],
      [22, HEIGHT - 22],
      [WIDTH - 22, HEIGHT - 22],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x + 9, y);
      ctx.lineTo(x, y + 10);
      ctx.lineTo(x - 9, y);
      ctx.closePath();
      ctx.fillStyle = "#eaffff";
      ctx.fill();
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

  drawBackground(ctx, accent);
  roundedRect(ctx, 34, 34, 220, 272, 18);
  ctx.fillStyle = "rgba(4,6,10,.65)";
  ctx.fill();
  roundedRect(ctx, 282, 34, 684, 272, 18);
  ctx.fillStyle = "rgba(4,6,10,.7)";
  ctx.fill();
  await drawAvatar(ctx, avatarUrl, displayName, accent);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 22px "Segoe UI", sans-serif';
  ctx.fillText(fitText(ctx, displayName, 188), 144, 259);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.font = '14px "Segoe UI", sans-serif';
  ctx.fillText(fitText(ctx, `@${username}`, 180), 144, 283);
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.font = '800 21px "Segoe UI", sans-serif';
  ctx.fillText(
    fitText(ctx, `SERVER • ${String(serverName).toUpperCase()}`, 470),
    320,
    76,
  );
  ctx.fillStyle = "#ffffff";
  ctx.font = '800 32px "Segoe UI", sans-serif';
  ctx.fillText(fitText(ctx, displayName, 430), 320, 111);
  roundedRect(ctx, 810, 58, 112, 38, 12);
  ctx.fillStyle = `${accent}22`;
  ctx.fill();
  ctx.strokeStyle = `${accent}99`;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = '800 18px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(`#${rank}`, 866, 83);
  ctx.textAlign = "left";

  drawStat(
    ctx,
    320,
    153,
    "Số dư",
    `${Number(account.balance).toLocaleString("vi-VN")} xu`,
    accent,
  );
  drawStat(ctx, 530, 153, "Tổng số ván", account.games_played, accent);
  drawStat(ctx, 690, 153, "Cấp độ", level, accent);
  drawStat(
    ctx,
    855,
    153,
    "Kim cương",
    Number(progress.diamonds || 0).toLocaleString("vi-VN"),
    accent,
  );

  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = '600 13px "Segoe UI", sans-serif';
  ctx.fillText(
    `SINH TỒN • TẦNG CAO NHẤT ${Number(appearance.bestFloor || 0).toLocaleString("vi-VN")}${appearance.frame ? ` • ${appearance.frame.name.toUpperCase()}` : ""}`,
    320,
    225,
  );
  ctx.fillText(`TIẾN ĐỘ CẤP ${level}`, 320, 258);
  roundedRect(ctx, 420, 246, 430, 16, 8);
  ctx.fillStyle = "rgba(255,255,255,.1)";
  ctx.fill();
  const barWidth = (430 * expPercent) / 100;
  if (barWidth > 0) {
    roundedRect(ctx, 420, 246, barWidth, 16, 8);
    ctx.fillStyle = accent;
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 14px "Segoe UI", sans-serif';
  ctx.textAlign = "right";
  ctx.fillText(
    `${experience.toLocaleString("vi-VN")} / ${target.toLocaleString("vi-VN")} EXP`,
    920,
    259,
  );
  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillText(`Màu hồ sơ: ${appearance.color.name}`, 952, 291);
  drawSurvivalFrame(ctx, appearance.frame);
  return canvas.encode("png");
}

module.exports = { WIDTH, HEIGHT, AVATAR_FETCH_TIMEOUT_MS, renderProfileCard };
