// Vector ornaments are rendered on demand; no per-class image assets are deployed.
const TAU = Math.PI * 2;
function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
function motif(ctx, type, light, accent, index) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#161c28";
  ctx.fillStyle = light;
  if (type === "arrows") {
    polygon(ctx, [
      [0, -101],
      [-5, -92],
      [-2, -93],
      [-2, -85],
      [2, -85],
      [2, -93],
      [5, -92],
    ]);
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.moveTo(-5, -88);
    ctx.lineTo(0, -85);
    ctx.lineTo(5, -88);
    ctx.stroke();
  } else if (type === "axes") {
    ctx.strokeStyle = light;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -85);
    ctx.lineTo(5, -99);
    ctx.moveTo(5, -85);
    ctx.lineTo(-5, -99);
    ctx.stroke();
    ctx.strokeStyle = "#161c28";
    ctx.lineWidth = 1;
    polygon(ctx, [
      [-5, -101],
      [-9, -96],
      [-8, -91],
      [-2, -96],
    ]);
    polygon(ctx, [
      [5, -101],
      [9, -96],
      [8, -91],
      [2, -96],
    ]);
    ctx.fillStyle = accent;
    polygon(ctx, [
      [0, -95],
      [-3, -91],
      [0, -87],
      [3, -91],
    ]);
  } else if (type === "blades") {
    ctx.beginPath();
    ctx.moveTo(-9, -94);
    ctx.bezierCurveTo(-2, -103, 8, -101, 10, -92);
    ctx.bezierCurveTo(4, -97, 0, -93, -5, -85);
    ctx.lineTo(-3, -94);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    polygon(ctx, [
      [0, -97],
      [-2, -94],
      [0, -91],
      [2, -94],
    ]);
  } else if (type === "stars") {
    const points = [];
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12;
      const r = i % 2 ? 2.5 : 7;
      points.push([Math.sin(a) * r, -94 + Math.cos(a) * r]);
    }
    polygon(ctx, points);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -94, 2, 0, TAU);
    ctx.fill();
  } else if (type === "leaves") {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -88);
    ctx.quadraticCurveTo(0, -94, 9, -96);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = light;
      ctx.strokeStyle = "#263325";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-3, -91);
      ctx.quadraticCurveTo(side * 11, -100, side * 6, -100);
      ctx.quadraticCurveTo(side * 1, -102, -3, -91);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3, -93);
      ctx.quadraticCurveTo(side * 11, -85, side * 8, -85);
      ctx.quadraticCurveTo(side * 1, -84, 3, -93);
      ctx.fill();
      ctx.stroke();
    }
  } else if (type === "bones") {
    if (index % 2) {
      ctx.strokeStyle = light;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-6, -90);
      ctx.lineTo(6, -96);
      ctx.stroke();
      for (const x of [-6, 6])
        for (const dy of [-1.5, 1.5]) {
          ctx.fillStyle = light;
          ctx.beginPath();
          ctx.arc(x, -93 - x / 2 + dy, 2, 0, TAU);
          ctx.fill();
        }
    } else {
      ctx.beginPath();
      ctx.ellipse(0, -95, 6, 5, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-3.5, -93, 7, 6);
      ctx.fillStyle = "#34263e";
      for (const x of [-2.5, 2.5]) {
        ctx.beginPath();
        ctx.arc(x, -95, 1.6, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = accent;
      polygon(ctx, [
        [0, -93],
        [-1, -91],
        [1, -91],
      ]);
      ctx.strokeStyle = "#665b53";
      ctx.lineWidth = 0.8;
      for (const x of [-2, 0, 2]) {
        ctx.beginPath();
        ctx.moveTo(x, -89);
        ctx.lineTo(x, -87);
        ctx.stroke();
      }
    }
  } else if (type === "shields") {
    ctx.fillStyle = accent;
    polygon(ctx, [
      [0, -101],
      [-7, -98],
      [-6, -91],
      [0, -85],
      [6, -91],
      [7, -98],
    ]);
    ctx.fillStyle = light;
    polygon(ctx, [
      [0, -99],
      [-5, -96],
      [-4, -92],
      [0, -88],
      [4, -92],
      [5, -96],
    ]);
    ctx.strokeStyle = "#76633c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -97);
    ctx.lineTo(0, -90);
    ctx.moveTo(-3, -94);
    ctx.lineTo(3, -94);
    ctx.stroke();
  }
}
function drawAvatarRing(ctx, ring, x = 142, y = 145) {
  if (!ring) return;
  const [dark, light, accent] = ring.colors;
  ctx.save();
  ctx.translate(x, y);
  // Keep decorations off the avatar itself and within the existing profile panel.
  ctx.beginPath();
  ctx.arc(0, 0, 103, 0, TAU);
  ctx.arc(0, 0, 83, 0, TAU, true);
  ctx.clip("evenodd");
  ctx.lineWidth = 20;
  ctx.strokeStyle = "#10141e";
  ctx.beginPath();
  ctx.arc(0, 0, 91, 0, TAU);
  ctx.stroke();
  const metal = ctx.createLinearGradient(-100, -100, 100, 100);
  metal.addColorStop(0, dark);
  metal.addColorStop(0.25, light);
  metal.addColorStop(0.43, dark);
  metal.addColorStop(0.7, accent);
  metal.addColorStop(1, dark);
  ctx.strokeStyle = metal;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(0, 0, 91, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = light;
  ctx.lineWidth = 0.9;
  for (const radius of [84.5, 98]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();
  }
  // Class-specific linework beneath eight ornaments.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  if (ring.motif === "leaves") {
    for (const radius of [88, 94]) {
      ctx.beginPath();
      for (let n = 0; n <= 180; n++) {
        const a = (n * TAU) / 180;
        const r = radius + Math.sin(a * 12) * 2;
        const px = Math.sin(a) * r,
          py = -Math.cos(a) * r;
        n ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  } else {
    ctx.setLineDash(ring.motif === "stars" ? [2, 5] : [9, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 91, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * TAU) / 8);
    motif(ctx, ring.motif, light, accent, i);
    ctx.restore();
  }
  ctx.restore();
}
module.exports = { drawAvatarRing };
