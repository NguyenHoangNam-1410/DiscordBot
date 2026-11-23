"use strict";
// True 2D terrain shared by the server and the browser. Each column stores its
// solid runs as a flat, sorted list [top, bottom, top, bottom, ...] (y grows
// downwards, bottom exclusive), so craters can leave caves, tunnels and
// overhangs instead of only lowering a heightmap.
((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GunnyTerrain = api;
})(globalThis, () => {
  const BODY = 28;
  const column = (cols, x) =>
    x >= 0 && x < cols.length ? cols[Math.floor(x)] : null;
  function solid(cols, x, y) {
    const runs = column(cols, x);
    if (!runs) return false;
    for (let i = 0; i < runs.length; i += 2)
      if (y >= runs[i] && y < runs[i + 1]) return true;
    return false;
  }
  function fromHeights(heights, height) {
    return heights.map((h) => (h > 0 ? [height - h, height] : []));
  }
  const clone = (cols) => cols.map((runs) => runs.slice());
  function normalize(runs) {
    const pairs = [];
    for (let i = 0; i < runs.length; i += 2)
      if (runs[i + 1] - runs[i] >= 1) pairs.push([runs[i], runs[i + 1]]);
    pairs.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [top, bottom] of pairs) {
      if (out.length && top <= out[out.length - 1])
        out[out.length - 1] = Math.max(out[out.length - 1], bottom);
      else out.push(top, bottom);
    }
    return out;
  }
  function addRun(cols, x, top, bottom) {
    if (x < 0 || x >= cols.length || bottom <= top) return;
    cols[x] = normalize([...cols[x], Math.round(top), Math.round(bottom)]);
  }
  function removeRun(cols, x, top, bottom) {
    if (x < 0 || x >= cols.length || bottom <= top) return;
    const runs = cols[x],
      out = [];
    for (let i = 0; i < runs.length; i += 2) {
      const a = runs[i],
        b = runs[i + 1];
      if (bottom <= a || top >= b) out.push(a, b);
      else {
        if (top > a) out.push(a, top);
        if (bottom < b) out.push(bottom, b);
      }
    }
    cols[x] = out;
  }
  // Carving a circle hollows every column it crosses, including ground under
  // and above the blast, which is what lets shots dig tunnels.
  function carve(cols, cx, cy, r) {
    if (!(r > 0)) return cols;
    for (
      let x = Math.max(0, Math.floor(cx - r));
      x <= Math.min(cols.length - 1, Math.ceil(cx + r));
      x++
    ) {
      const d = x + 0.5 - cx;
      if (Math.abs(d) > r) continue;
      const half = Math.sqrt(r * r - d * d);
      removeRun(cols, x, Math.round(cy - half), Math.round(cy + half));
    }
    return cols;
  }
  function addEllipse(cols, cx, cy, rx, ry) {
    for (
      let x = Math.max(0, Math.floor(cx - rx));
      x <= Math.min(cols.length - 1, Math.ceil(cx + rx));
      x++
    ) {
      const d = (x + 0.5 - cx) / rx;
      if (Math.abs(d) > 1) continue;
      const half = ry * Math.sqrt(1 - d * d);
      addRun(cols, x, cy - half, cy + half);
    }
    return cols;
  }
  // First surface a body standing at y would rest on: the top of the run that
  // contains y, otherwise the next run below. null means a bottomless column.
  function support(cols, x, y) {
    const runs = column(cols, x);
    if (!runs) return null;
    for (let i = 0; i < runs.length; i += 2) {
      if (y >= runs[i] && y < runs[i + 1]) return runs[i];
      if (runs[i] > y) return runs[i];
    }
    return null;
  }
  // Like support() but only accepts a surface within `range` pixels, used to
  // read the slope under a fighter without snapping to a far-away ledge.
  function surfaceNear(cols, x, y, range = 40) {
    const runs = column(cols, x);
    if (!runs) return y;
    let best = null;
    for (let i = 0; i < runs.length; i += 2) {
      const top = runs[i];
      if (
        Math.abs(top - y) <= range &&
        (best === null || Math.abs(top - y) < Math.abs(best - y))
      )
        best = top;
    }
    return best ?? y;
  }
  function topSurface(cols, x) {
    const runs = column(cols, x);
    return runs && runs.length ? runs[0] : null;
  }
  function headroom(cols, x, y, height = BODY) {
    for (let yy = y - height; yy < y; yy += 2)
      if (solid(cols, x, yy)) return false;
    return !solid(cols, x, y - 1);
  }
  // One column of walking, shared by the server and the browser's prediction:
  // climb steps up to `climb`, never into a wall or under a low ceiling, drop
  // off ledges onto the ground below. Returns the next {x, y} or null.
  function step(cols, f, sign, others = [], climb = 16) {
    const x = f.x + sign;
    if (x < 16 || x > cols.length - 17) return null;
    const y = support(cols, x, f.y - 1);
    if (y === null || f.y - y > climb || !headroom(cols, x, y)) return null;
    if (others.some((o) => Math.abs(x - o.x) < 34 && Math.abs(y - o.y) < 40))
      return null;
    return { x, y };
  }
  return Object.freeze({
    BODY,
    step,
    solid,
    fromHeights,
    clone,
    carve,
    addEllipse,
    addRun,
    removeRun,
    support,
    surfaceNear,
    topSurface,
    headroom,
  });
});
