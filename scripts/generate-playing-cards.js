"use strict";
// Usage: node scripts/generate-playing-cards.js [--all] --out=external-directory [--emoji-out=external-directory]
// Default produces only 3H for design review. --all produces 52 SVG/PNG pairs.
const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const WIDTH = 600;
const HEIGHT = 900;
const SUITS = {
  S: {
    name: "spades",
    color: "#22A447",
    shape:
      '<path d="M0 -108 C-28 -72 -112 -28 -112 28 C-112 91 -39 105 -13 57 C-15 88 -29 110 -43 120 H43 C29 110 15 88 13 57 C39 105 112 91 112 28 C112 -28 28 -72 0 -108Z"/>',
  },
  C: {
    name: "clubs",
    color: "#2474E8",
    shape:
      '<circle cx="0" cy="-58" r="61"/><circle cx="-62" cy="29" r="61"/><circle cx="62" cy="29" r="61"/><path d="M-14 20 H14 C12 77 27 105 46 120 H-46 C-27 105 -12 77 -14 20Z"/>',
  },
  D: {
    name: "diamonds",
    color: "#EF202B",
    shape: '<path d="M0 -120 L104 0 L0 120 L-104 0Z"/>',
  },
  H: {
    name: "hearts",
    color: "#EC4899",
    shape:
      '<path d="M0 -63 C-53 -156 -151 -106 -151 -17 C-151 62 -72 121 0 163 C72 121 151 62 151 -17 C151 -106 53 -156 0 -63Z" transform="translate(0,-23) scale(.82)"/>',
  },
};
const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
function svgCard(rank, suit) {
  const { color, shape, name } = SUITS[suit];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<title>${rank} of ${name}</title>
<rect width="600" height="900" fill="white"/>
<rect x="14" y="14" width="572" height="872" fill="none" stroke="${color}" stroke-width="28"/>
<text x="300" y="460" fill="${color}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${rank === "10" ? 360 : 490}">${rank}</text>
<g transform="translate(300,674) scale(1.48)" fill="${color}">${shape}</g>
</svg>\n`;
}
async function main() {
  const args = process.argv.slice(2);
  if (
    args.some(
      (a) =>
        a !== "--all" &&
        !a.startsWith("--out=") &&
        !a.startsWith("--emoji-out="),
    )
  ) {
    throw new Error(
      "Usage: node scripts/generate-playing-cards.js [--all] --out=external-directory [--emoji-out=external-directory]",
    );
  }
  const outArg = args.find((a) => a.startsWith("--out="));
  if (!outArg || !outArg.slice(6))
    throw new Error(
      "Provide --out=directory outside the worktree. Generated artwork is not deployed with the bot.",
    );
  const out = path.resolve(outArg.slice(6));
  const emojiArg = args.find((a) => a.startsWith("--emoji-out="));
  if (emojiArg && !emojiArg.slice(12))
    throw new Error("--emoji-out requires a directory.");
  const emojiOut = path.resolve(
    emojiArg ? emojiArg.slice(12) : path.join(out, "emojis"),
  );
  const worktree = path.resolve(__dirname, "..");
  for (const target of [out, emojiOut]) {
    const relative = path.relative(worktree, target);
    const outside =
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative);
    if (!outside)
      throw new Error(
        `Artwork directory must be outside the worktree: ${target}`,
      );
  }
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(emojiOut, { recursive: true });
  const cards = args.includes("--all")
    ? Object.keys(SUITS).flatMap((suit) => RANKS.map((rank) => [rank, suit]))
    : [["3", "H"]];
  for (const [rank, suit] of cards) {
    const svg = svgCard(rank, suit);
    const image = await loadImage(Buffer.from(svg));
    const canvas = createCanvas(WIDTH, HEIGHT);
    canvas.getContext("2d").drawImage(image, 0, 0, WIDTH, HEIGHT);
    const stem = path.join(out, `${rank}${suit}`);
    fs.writeFileSync(`${stem}.svg`, svg, "utf8");
    fs.writeFileSync(`${stem}.png`, canvas.toBuffer("image/png"));
    // Transparent square canvas preserves the 2:3 card ratio in Discord emojis.
    const emoji = createCanvas(128, 128);
    emoji
      .getContext("2d")
      .drawImage(
        image,
        (128 - (128 * WIDTH) / HEIGHT) / 2,
        0,
        (128 * WIDTH) / HEIGHT,
        128,
      );
    fs.writeFileSync(
      path.join(emojiOut, `${rank}${suit}.png`),
      emoji.toBuffer("image/png"),
    );
  }
  console.log(
    `Generated ${cards.length} cards (SVG + PNG, ${WIDTH}x${HEIGHT}) in ${out}`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
