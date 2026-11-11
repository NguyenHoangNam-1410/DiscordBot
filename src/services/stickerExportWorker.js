"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const {
  createCanvas,
  GifEncoder,
  GifDisposal,
  LottieAnimation,
} = require("@napi-rs/canvas");
const MAX_PIXELS = 32_000_000;
function dimensions(w, h, frames) {
  if (
    ![w, h, frames].every(Number.isInteger) ||
    w < 1 ||
    h < 1 ||
    w > 512 ||
    h > 512 ||
    frames < 1 ||
    frames > 600 ||
    w * h * frames > MAX_PIXELS
  )
    throw Error("ANIMATION_LIMIT");
}
function pngInfo(data) {
  if (
    data.length < 33 ||
    data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    data.toString("ascii", 12, 16) !== "IHDR"
  )
    throw Error("INVALID_STICKER");
  let count = 1,
    controls = 0,
    ended = false;
  const w = data.readUInt32BE(16),
    h = data.readUInt32BE(20);
  dimensions(w, h, 1);
  for (let offset = 8; offset < data.length;) {
    if (offset + 12 > data.length) throw Error("INVALID_STICKER");
    const len = data.readUInt32BE(offset),
      type = data.toString("ascii", offset + 4, offset + 8);
    if (offset + 12 + len > data.length) throw Error("INVALID_STICKER");
    if (type === "acTL") {
      if (len !== 8) throw Error("INVALID_STICKER");
      count = data.readUInt32BE(offset + 8);
      dimensions(w, h, count);
    }
    if (type === "fcTL") {
      if (len !== 26 || ++controls > 600) throw Error("INVALID_STICKER");
      const fw = data.readUInt32BE(offset + 12),
        fh = data.readUInt32BE(offset + 16),
        x = data.readUInt32BE(offset + 20),
        y = data.readUInt32BE(offset + 24);
      if (!fw || !fh || fw + x > w || fh + y > h)
        throw Error("INVALID_STICKER");
    }
    offset += len + 12;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended || (controls && controls !== count))
    throw Error("INVALID_STICKER");
  return { w, h, count };
}
function apng(data) {
  const info = pngInfo(data);
  const UPNG = require("upng-js");
  const image = UPNG.decode(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  );
  const frames = UPNG.toRGBA8(image);
  dimensions(info.w, info.h, frames.length);
  if (frames.length !== info.count) throw Error("INVALID_STICKER");
  const delays = frames.map((_, i) =>
    Math.max(10, image.frames[i]?.delay ?? 100),
  );
  const duration = delays.reduce((a, b) => a + b, 0);
  if (duration > 20_000) throw Error("ANIMATION_LIMIT");
  // GIF players cannot reliably show very short frames. Sample at most 30 fps.
  const selected = [];
  let index = 0,
    boundary = delays[0];
  for (let at = 0; at < duration - 1e-6; at += 1000 / 30) {
    while (index + 1 < frames.length && at + 1e-6 >= boundary) {
      index++;
      boundary += delays[index];
    }
    if (selected.at(-1)?.index !== index) selected.push({ index, at });
  }
  if (selected.length > 1 && duration - selected.at(-1).at < 20) selected.pop();
  const encoder = new GifEncoder(info.w, info.h, { repeat: 0, quality: 10 });
  try {
    let written = 0;
    selected.forEach((frame, i) => {
      const end = Math.round((selected[i + 1]?.at ?? duration) / 10);
      encoder.addFrame(new Uint8Array(frames[frame.index]), info.w, info.h, {
        delay: Math.max(10, (end - written) * 10),
        disposal: GifDisposal.Background,
      });
      written = end;
    });
    return encoder.finish();
  } finally {
    encoder.dispose();
  }
}
function lottie(data) {
  const doc = JSON.parse(data.toString("utf8"));
  const duration = (doc.op - doc.ip) / doc.fr,
    fps = Math.min(30, doc.fr),
    count = Math.ceil(duration * fps - 1e-6);
  dimensions(doc.w, doc.h, count);
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 20 ||
    !Number.isFinite(fps) ||
    fps <= 0
  )
    throw Error("ANIMATION_LIMIT");
  // Discord stickers are self-contained vectors. Never resolve image/font paths.
  const pending = [doc];
  let nodes = 0;
  while (pending.length) {
    if (++nodes > 200_000) throw Error("ANIMATION_LIMIT");
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (
      typeof node.p === "string" ||
      (typeof node.u === "string" && node.u) ||
      (typeof node.fPath === "string" && node.fPath)
    )
      throw Error("EXTERNAL_ASSET");
    pending.push(
      ...Object.values(node).filter((v) => v && typeof v === "object"),
    );
  }
  const animation = LottieAnimation.loadFromData(JSON.stringify(doc));
  const canvas = createCanvas(doc.w, doc.h),
    ctx = canvas.getContext("2d"),
    encoder = new GifEncoder(doc.w, doc.h, { repeat: 0, quality: 10 });
  try {
    let written = 0;
    for (let i = 0; i < count; i++) {
      ctx.clearRect(0, 0, doc.w, doc.h);
      animation.seekTime(i / fps);
      animation.render(ctx);
      const end = Math.round(Math.min(duration, (i + 1) / fps) * 100);
      encoder.addFrame(canvas.data(), doc.w, doc.h, {
        delay: Math.max(10, (end - written) * 10),
        disposal: GifDisposal.Background,
      });
      written = end;
    }
    return encoder.finish();
  } finally {
    encoder.dispose();
  }
}
try {
  const data = Buffer.from(workerData.data);
  let result;
  if (workerData.format === 3) result = lottie(data);
  else if (workerData.format === 2) result = apng(data);
  else if (workerData.format === 1) {
    const info = pngInfo(data);
    if (info.count > 1) throw Error("INVALID_STICKER");
    result = data;
  } else if (workerData.format === 4) {
    if (!/^GIF8[79]a$/.test(data.toString("ascii", 0, 6)))
      throw Error("INVALID_STICKER");
    dimensions(data.readUInt16LE(6), data.readUInt16LE(8), 1);
    result = data;
  } else throw Error("UNSUPPORTED_STICKER");
  if (result.length > workerData.maxBytes) throw Error("FILE_TOO_LARGE");
  parentPort.postMessage({ data: result });
} catch (error) {
  parentPort.postMessage({
    error: [
      "ANIMATION_LIMIT",
      "INVALID_STICKER",
      "FILE_TOO_LARGE",
      "EXTERNAL_ASSET",
      "UNSUPPORTED_STICKER",
    ].includes(error.message)
      ? error.message
      : "CONVERSION_FAILED",
  });
}
