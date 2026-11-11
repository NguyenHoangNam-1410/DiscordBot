"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createCanvas, GifEncoder, GifDisposal } = require("@napi-rs/canvas");
const UPNG = require("upng-js");
const { Collection, PermissionFlagsBits: F } = require("discord.js");
const {
  createStickerHandler,
  stickerSource,
  download,
  convertSticker,
} = require("../src/services/stickerStealService");
const A = "123456789012345678",
  B = "223456789012345678";
const pngCanvas = createCanvas(2, 2);
pngCanvas.getContext("2d").fillStyle = "red";
pngCanvas.getContext("2d").fillRect(0, 0, 1, 2);
const png = pngCanvas.toBuffer("image/png");
const red = new Uint8Array([
  255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0,
]);
const blue = new Uint8Array([
  0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 255, 255,
]);
const apngRed = new Uint8Array(8 * 8 * 4),
  apngBlue = new Uint8Array(8 * 8 * 4);
for (let y = 0; y < 8; y++)
  for (let x = 0; x < 8; x++) {
    const i = (y * 8 + x) * 4;
    if (x < 4) apngRed.set([255, 0, 0, 255], i);
    else apngBlue.set([0, 0, 255, 255], i);
  }
const apng = Buffer.from(
  UPNG.encode([apngRed.buffer, apngBlue.buffer], 8, 8, 0, [100, 200]),
);
const native = new GifEncoder(2, 2);
native.addFrame(red, 2, 2, { delay: 100, disposal: GifDisposal.Background });
native.addFrame(blue, 2, 2, { delay: 200, disposal: GifDisposal.Background });
const gif = native.finish();
native.dispose();
const lottieDoc = {
  v: "5.7.4",
  fr: 10,
  ip: 0,
  op: 2,
  w: 2,
  h: 2,
  layers: [
    {
      ty: 1,
      ind: 1,
      sw: 2,
      sh: 2,
      sc: "#ff0000",
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [0, 0, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ip: 0,
      op: 1,
      st: 0,
    },
  ],
};
const lottie = Buffer.from(JSON.stringify(lottieDoc));
// Independent GIF block + LZW decoder checks actual frame pixels/timing/transparency.
function gifFrames(data) {
  assert.match(data.toString("ascii", 0, 6), /^GIF8[79]a$/);
  let pos = 13;
  const readPalette = (size) => {
    const v = data.subarray(pos, pos + size * 3);
    pos += size * 3;
    return v;
  };
  const palette =
    data[10] & 128 ? readPalette(1 << ((data[10] & 7) + 1)) : null;
  const subblocks = () => {
    const blocks = [];
    while (data[pos]) {
      const n = data[pos++];
      blocks.push(data.subarray(pos, pos + n));
      pos += n;
    }
    pos++;
    return Buffer.concat(blocks);
  };
  let gce = { packed: 0, delay: 0, index: 0 };
  const frames = [];
  while (pos < data.length) {
    const marker = data[pos++];
    if (marker === 59) break;
    if (marker === 33) {
      const kind = data[pos++];
      if (kind === 249) {
        assert.equal(data[pos++], 4);
        gce = {
          packed: data[pos],
          delay: data.readUInt16LE(pos + 1) * 10,
          index: data[pos + 3],
        };
        pos += 5;
      } else subblocks();
      continue;
    }
    assert.equal(marker, 44);
    const w = data.readUInt16LE(pos + 4),
      h = data.readUInt16LE(pos + 6),
      flags = data[pos + 8];
    pos += 9;
    const colors = flags & 128 ? readPalette(1 << ((flags & 7) + 1)) : palette;
    const min = data[pos++],
      compressed = subblocks(),
      clear = 1 << min,
      end = clear + 1;
    let bits = 0,
      size = min + 1,
      dict = [],
      previous = null;
    const pixels = [];
    const reset = () => {
      dict = Array.from({ length: clear }, (_, i) => [i]);
      dict.push(null, null);
      size = min + 1;
      previous = null;
    };
    reset();
    while (bits + size <= compressed.length * 8) {
      let code = 0;
      for (let b = 0; b < size; b++)
        code |= ((compressed[(bits + b) >> 3] >> ((bits + b) & 7)) & 1) << b;
      bits += size;
      if (code === clear) {
        reset();
        continue;
      }
      if (code === end) break;
      const entry =
        dict[code] ||
        (code === dict.length && previous ? [...previous, previous[0]] : null);
      assert(entry, "valid GIF LZW code");
      pixels.push(...entry);
      if (previous && dict.length < 4096) {
        dict.push([...previous, entry[0]]);
        if (dict.length === 1 << size && size < 12) size++;
      }
      previous = entry;
    }
    assert.equal(pixels.length, w * h);
    const rgba = pixels.flatMap((i) =>
      gce.packed & 1 && i === gce.index
        ? [0, 0, 0, 0]
        : [...colors.subarray(i * 3, i * 3 + 3), 255],
    );
    frames.push({ ...gce, rgba });
    gce = { packed: 0, delay: 0, index: 0 };
  }
  return frames;
}
function message(overrides = {}) {
  const replies = [],
    sends = [],
    fetches = [];
  const all = [
    F.ViewChannel,
    F.SendMessages,
    F.SendMessagesInThreads,
    F.ReadMessageHistory,
    F.AttachFiles,
  ];
  const msg = {
    guildId: "g",
    channelId: "c",
    id: "command",
    content: "!steal",
    author: { id: "user", bot: false },
    guild: { maximumFileSize: 8 * 1024 * 1024, members: { me: { id: "bot" } } },
    reference: { messageId: "original", channelId: "c", type: 0 },
    channel: {
      isThread: () => false,
      permissionsFor: () => ({
        has: (bits) =>
          (Array.isArray(bits) ? bits : [bits]).every((b) => all.includes(b)),
      }),
      send: async (p) => {
        sends.push(p);
      },
    },
    fetchReference: async () => {
      fetches.push(1);
      return {
        stickers: new Collection([
          [A, { id: A, name: "Sticker mèo", format: 1 }],
        ]),
      };
    },
    reply: async (p) => {
      replies.push(p);
    },
    ...overrides,
  };
  return { msg, replies, sends, fetches, all };
}
const response = (data, status = 200, headers = {}) =>
  new Response(data, { status, headers });
const expectedError = (fn, code) =>
  assert.rejects(fn, (e) => e.message === code);
async function main() {
  const originalPrefix = process.env.COMMAND_PREFIX;
  process.env.COMMAND_PREFIX = "!";
  try {
    assert.equal(
      stickerSource({ id: A, format: 1, url: "http://127.0.0.1/" }).url,
      "https://cdn.discordapp.com/stickers/" + A + ".png",
    );
    assert.equal(
      stickerSource({ id: A, format: 4 }).url,
      "https://media.discordapp.net/stickers/" + A + ".gif",
    );
    assert.throws(
      () => stickerSource({ id: "../secrets", format: 1 }),
      /INVALID_STICKER/,
    );
    assert.throws(
      () => stickerSource({ id: A, format: 9 }),
      /UNSUPPORTED_STICKER/,
    );
    assert.deepEqual(await convertSticker(png, 1), png);
    assert.deepEqual(await convertSticker(gif, 4), gif);
    const animated = gifFrames(await convertSticker(apng, 2));
    assert.equal(animated.length, 2);
    assert.deepEqual(
      animated.map((f) => f.delay),
      [100, 200],
    );
    assert.deepEqual(animated[0].rgba, [...apngRed]);
    assert.deepEqual(animated[1].rgba, [...apngBlue]);
    assert(
      animated.every((f) => ((f.packed >> 2) & 7) === 2),
      "Clear old transparent pixels between full frames",
    );
    const vector = gifFrames(await convertSticker(lottie, 3));
    assert.equal(vector.length, 2);
    assert.deepEqual(vector[0].rgba.slice(0, 4), [255, 0, 0, 255]);
    assert(vector[1].rgba.every((n) => n === 0));
    assert.deepEqual(
      vector.map((f) => f.delay),
      [100, 100],
    );
    const precise = gifFrames(
      await convertSticker(
        Buffer.from(JSON.stringify({ ...lottieDoc, fr: 30, op: 30 })),
        3,
      ),
    );
    assert.equal(precise.length, 30);
    assert.equal(
      precise.reduce((n, f) => n + f.delay, 0),
      1000,
      "Centisecond quantization must preserve duration at 30 fps",
    );
    const fastPng = Buffer.from(
      UPNG.encode(
        Array.from({ length: 60 }, (_, i) =>
          i % 2 ? apngBlue.buffer : apngRed.buffer,
        ),
        8,
        8,
        0,
        Array(60).fill(17),
      ),
    );
    const fastGif = gifFrames(await convertSticker(fastPng, 2));
    assert(fastGif.length <= 30);
    assert.equal(
      fastGif.reduce((n, f) => n + f.delay, 0),
      1020,
    );
    const shortThenLong = Buffer.from(
      UPNG.encode([apngRed.buffer, apngBlue.buffer], 8, 8, 0, [10, 100]),
    );
    const timed = gifFrames(await convertSticker(shortThenLong, 2));
    assert.equal(timed.length, 2);
    assert.deepEqual(timed[1].rgba, [...apngBlue]);
    assert.equal(
      timed.reduce((n, f) => n + f.delay, 0),
      110,
    );
    const huge = Buffer.from(png);
    huge.writeUInt32BE(100_000, 16);
    await expectedError(() => convertSticker(huge, 2), "ANIMATION_LIMIT");
    await expectedError(
      () => convertSticker(Buffer.from("not an image"), 1),
      "INVALID_STICKER",
    );
    await expectedError(() => convertSticker(png, 1, 1), "FILE_TOO_LARGE");
    await expectedError(
      () =>
        convertSticker(
          Buffer.from(
            JSON.stringify({
              ...lottieDoc,
              assets: [{ p: "private.png", u: "/etc/" }],
            }),
          ),
          3,
        ),
      "EXTERNAL_ASSET",
    );
    await expectedError(
      () =>
        convertSticker(
          Buffer.from(JSON.stringify({ ...lottieDoc, op: 999999 })),
          3,
        ),
      "ANIMATION_LIMIT",
    );
    const success = message();
    const requested = [];
    const handle = createStickerHandler({
      fetcher: async (url, options) => {
        requested.push({ url, options });
        return response(png);
      },
    });
    assert.equal(await handle(success.msg), true);
    assert.equal(success.fetches.length, 1);
    assert.deepEqual(success.replies[0].files[0].attachment, png);
    assert.match(
      success.replies[0].files[0].name,
      /Sticker-mèo-123456789012345678\.png$/,
    );
    assert.deepEqual(success.replies[0].allowedMentions, {
      parse: [],
      repliedUser: false,
    });
    assert.equal(requested[0].options.redirect, "error");
    for (const overrides of [
      { content: "hello" },
      { content: "!stealth" },
      { author: { id: "bot", bot: true } },
      { webhookId: "webhook" },
      { guildId: null },
    ]) {
      const f = message(overrides);
      assert.equal(await createStickerHandler()(f.msg), false);
      assert.equal(f.replies.length, 0);
    }
    for (const overrides of [
      { reference: null },
      { content: "!steal other" },
      { reference: { messageId: A, channelId: "other" } },
      { reference: { messageId: A, type: 1 } },
    ]) {
      const f = message(overrides);
      assert.equal(await createStickerHandler()(f.msg), true);
      assert.match(f.replies[0].content, /reply/);
      assert.equal(f.fetches.length, 0);
    }
    const empty = message({
      fetchReference: async () => ({ stickers: new Collection() }),
    });
    await createStickerHandler()(empty.msg);
    assert.match(empty.replies[0].content, /không chứa sticker/);
    const deleted = message({
      fetchReference: async () => {
        throw { code: 10008 };
      },
    });
    await createStickerHandler()(deleted.msg);
    assert.match(deleted.replies[0].content, /xóa|không có quyền/);
    const noHistory = message();
    noHistory.all.splice(noHistory.all.indexOf(F.ReadMessageHistory), 1);
    await createStickerHandler()(noHistory.msg);
    assert.match(noHistory.sends[0].content, /Đọc lịch sử/);
    assert.equal(noHistory.fetches.length, 0);
    const noAttach = message();
    noAttach.all.splice(noAttach.all.indexOf(F.AttachFiles), 1);
    await createStickerHandler()(noAttach.msg);
    assert.match(noAttach.replies[0].content, /Đính kèm/);
    assert.equal(noAttach.fetches.length, 0);
    const noSend = message();
    noSend.all.splice(noSend.all.indexOf(F.SendMessages), 1);
    await createStickerHandler()(noSend.msg);
    assert.equal(noSend.replies.length, 0);
    const thread = message();
    thread.msg.channel.isThread = () => true;
    thread.all.splice(thread.all.indexOf(F.SendMessages), 1);
    await createStickerHandler({ fetcher: async () => response(png) })(
      thread.msg,
    );
    assert(thread.replies[0].files);
    process.env.COMMAND_PREFIX = "$.";
    const custom = message({ content: "$.StEaL" });
    await createStickerHandler({ fetcher: async () => response(png) })(
      custom.msg,
    );
    assert(custom.replies[0].files);
    process.env.COMMAND_PREFIX = "!";
    const mixed = message({
      fetchReference: async () => ({
        stickers: new Collection([
          [A, { id: A, name: "A", format: 1 }],
          [B, { id: B, name: "B", format: 2 }],
          [
            "323456789012345678",
            { id: "323456789012345678", name: "C", format: 3 },
          ],
        ]),
      }),
    });
    await createStickerHandler({
      fetcher: async (url) =>
        response(url.includes(B) ? apng : url.endsWith("json") ? lottie : png),
    })(mixed.msg);
    assert.deepEqual(
      mixed.replies[0].files.map((f) => f.name.split(".").at(-1)),
      ["png", "gif", "gif"],
    );
    let cancelled = false;
    await expectedError(
      () =>
        download(
          "https://cdn.discordapp.com/stickers/" + A + ".png",
          async () =>
            new Response(
              new ReadableStream({
                cancel() {
                  cancelled = true;
                },
              }),
              { headers: { "content-length": "999" } },
            ),
          10,
        ),
      "FILE_TOO_LARGE",
    );
    assert(cancelled);
    cancelled = false;
    await expectedError(
      () =>
        download(
          "https://cdn.discordapp.com/stickers/" + A + ".png",
          async () =>
            new Response(
              new ReadableStream({
                start(c) {
                  c.enqueue(new Uint8Array(11));
                },
                cancel() {
                  cancelled = true;
                },
              }),
            ),
          10,
        ),
      "FILE_TOO_LARGE",
    );
    assert(cancelled);
    await expectedError(
      () =>
        download(
          "https://cdn.discordapp.com/stickers/" + A + ".png",
          async () => response(null, 404),
        ),
      "DOWNLOAD_FAILED",
    );
    await expectedError(
      () =>
        download(
          "https://cdn.discordapp.com/stickers/" + A + ".png",
          async () => {
            throw Error("network secret");
          },
        ),
      "DOWNLOAD_FAILED",
    );
    const missing = message();
    await createStickerHandler({ fetcher: async () => response(null, 404) })(
      missing.msg,
    );
    assert.match(missing.replies[0].content, /Không tải được/);
    let clock = 0;
    const cooldown = createStickerHandler({
      fetcher: async () => response(png),
      now: () => clock,
    });
    const first = message();
    await cooldown(first.msg);
    await cooldown(first.msg);
    assert.match(first.replies[1].content, /đợi/);
    clock = 5001;
    await cooldown(first.msg);
    assert(first.replies[2].files);
    let release;
    const gate = new Promise((r) => (release = r));
    const limited = createStickerHandler({
      fetcher: async () => response(png),
      convert: async () => {
        await gate;
        return png;
      },
    });
    const a = message(),
      b = message({ author: { id: "b" } }),
      c = message({ author: { id: "c" } });
    const pa = limited(a.msg),
      pb = limited(b.msg);
    await limited(c.msg);
    assert.match(c.replies[0].content, /người khác/);
    release();
    await Promise.all([pa, pb]);
    const recovered = createStickerHandler({
      fetcher: async () => response(png),
      convert: async () => {
        throw Error("CONVERSION_FAILED");
      },
      now: () => clock,
    });
    const broken = message();
    await recovered(broken.msg);
    clock += 5001;
    await recovered(broken.msg);
    assert.equal(broken.fetches.length, 2);
    let uploads = 0;
    const warnings = [];
    const denied = message({
      reply: async (payload) => {
        if (payload.files) {
          uploads++;
          throw { code: 50013 };
        }
        denied.replies.push(payload);
      },
    });
    await createStickerHandler({ fetcher: async () => response(png) })(
      denied.msg,
      { warn: (...args) => warnings.push(args) },
    );
    assert.equal(uploads, 1);
    assert.match(denied.replies[0].content, /Không gửi được/);
    assert.equal(warnings.length, 1);
    const help = require("../src/commands/trogiup");
    assert(
      help
        .helpEmbed()
        .toJSON()
        .fields.some((f) => f.value.includes("!steal")),
    );
    for (const tab of Object.keys(help.PAGES)) {
      const embed = help.helpEmbed(tab).toJSON();
      assert(embed.fields.length <= 25);
      assert(
        (embed.title || "").length +
          (embed.description || "").length +
          embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0) <
          6000,
      );
    }
    const index = fs.readFileSync(require.resolve("../src/index.js"), "utf8");
    assert(index.includes("await handleStickerMessage(message, logger)"));
    assert(
      index.indexOf("await handleStickerMessage") >
        index.indexOf("if (messageCommandsEnabled)"),
    );
    console.log(
      JSON.stringify({
        ok: true,
        sticker:
          "reply/prefix routing, actual PNG/GIF export, APNG frame pixels/delays/transparency/disposal, Lottie animation, permissions/threads, no pings, CDN-only bounded downloads, worker limits, cooldown/concurrency/recovery",
      }),
    );
  } finally {
    if (originalPrefix === undefined) delete process.env.COMMAND_PREFIX;
    else process.env.COMMAND_PREFIX = originalPrefix;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
