"use strict";
// Roster 2 mechanics are distinct from the immutable roster 1 implementation.
const rows = [
  [
    "butcher",
    "The Butcher",
    "physical",
    "The Hunt",
    [
      [3, 3, 0.08, 0.04],
      [3, 4, 0.1, 0.05],
      [2, 5, 0.12, 0.06],
    ],
  ],
  [
    "machine",
    "Infernal Machine",
    "magic",
    "Reactor Heat",
    [
      [4, 100, 0.08, 15],
      [3, 100, 0.1, 20],
      [3, 100, 0.12, 25],
    ],
  ],
  [
    "assur",
    "Assur",
    "magic",
    "Rune of Damnation",
    [
      [4, 3, 0.06, 4],
      [3, 3, 0.08, 4],
      [2, 3, 0.1, 3],
    ],
  ],
  [
    "control",
    "Master Control System",
    "magic",
    "Plasma Frequency",
    [
      [4, 2, 0.06, 2],
      [3, 2, 0.08, 2],
      [2, 2, 0.1, 2],
    ],
  ],
  [
    "necrobot",
    "Necrobot Alpha",
    "mixed",
    "Modular Body",
    [
      [5, 3, 0.15, 3],
      [4, 3, 0.2, 3],
      [3, 3, 0.25, 3],
    ],
  ],
  [
    "quov",
    "Quov Tsin",
    "magic",
    "Elemental Convergence",
    [
      [4, 3, 0.65, 15],
      [3, 3, 0.7, 20],
      [2, 3, 0.7, 25],
    ],
  ],
  [
    "lucion",
    "Lucion",
    "magic",
    "Brain Control",
    [
      [4, 3, 0.06, 3],
      [3, 3, 0.08, 3],
      [2, 3, 0.1, 2],
    ],
  ],
  [
    "bul_kathos",
    "Bul-Kathos",
    "physical",
    "Weapon Clash",
    [
      [4, 2, 0.15, 2],
      [3, 2, 0.2, 2],
      [2, 2, 0.25, 2],
    ],
  ],
  [
    "giyua",
    "Spirit of Giyua",
    "magic",
    "Spirit Nests",
    [
      [5, 3, 0.08, 1],
      [4, 3, 0.1, 1],
      [3, 4, 0.12, 1],
    ],
  ],
  [
    "riftwalker",
    "Ascendant Riftwalker",
    "mixed",
    "Rift Echo",
    [
      [4, 3, 0.04, 0.04],
      [3, 3, 0.05, 0.05],
      [3, 3, 0.06, 0.06],
    ],
  ],
  [
    "gharbad",
    "Gharbad the Weak",
    "physical",
    "False Surrender",
    [
      [4, 2, 0.08, 0.05],
      [3, 2, 0.1, 0.05],
      [2, 2, 0.12, 0.05],
    ],
  ],
  [
    "phoboss",
    "Phoboss",
    "magic",
    "Lucid Nightmare",
    [
      [5, 5, 0.06, 0.04],
      [4, 5, 0.08, 0.05],
      [3, 5, 0.1, 0.06],
    ],
  ],
  [
    "anomaly",
    "Unstable Anomaly",
    "mixed",
    "Matter/Energy/Void Core",
    [
      [4, 3, 0.06, 2],
      [3, 3, 0.08, 2],
      [2, 3, 0.1, 2],
    ],
  ],
  [
    "zakarum",
    "Zakarum Avatar",
    "magic",
    "Divine Halo",
    [
      [5, 3, 0.08, 2],
      [4, 3, 0.1, 2],
      [3, 3, 0.12, 2],
    ],
  ],
  [
    "justicar",
    "The Justicar",
    "mixed",
    "Court of Angiris",
    [
      [3, 3, 0.15, 3],
      [3, 3, 0.2, 3],
      [3, 3, 0.25, 3],
    ],
  ],
  [
    "uldyssian",
    "Uldyssian the Tainted",
    "mixed",
    "Corrupted Memory",
    [
      [4, 4, 0.08, 4],
      [4, 4, 0.1, 4],
      [4, 4, 0.12, 4],
    ],
  ],
  [
    "lazarus",
    "Archbishop Lazarus",
    "magic",
    "Black Hand Totems",
    [
      [6, 3, 0.02, 3],
      [5, 3, 0.03, 3],
      [4, 3, 0.04, 3],
    ],
  ],
  [
    "xazax",
    "Xazax",
    "magic",
    "Hell Portal Network",
    [
      [5, 3, 0.08, 1],
      [4, 3, 0.1, 1],
      [3, 4, 0.12, 1],
    ],
  ],
  [
    "samael",
    "Samael",
    "mixed",
    "Living Pentagram",
    [
      [4, 5, 0.12, 1],
      [3, 5, 0.16, 1],
      [2, 5, 0.2, 1],
    ],
  ],
  [
    "death_projector",
    "Death Projector",
    "magic",
    "Rotating Beam",
    [
      [4, 3, 1.2, 1],
      [3, 3, 1.35, 1],
      [2, 3, 1.5, 2],
    ],
  ],
  [
    "akarat",
    "Akarat, the False Prophet",
    "magic",
    "Three Apostles",
    [
      [5, 3, 0.08, 3],
      [4, 3, 0.1, 3],
      [3, 3, 0.12, 3],
    ],
  ],
  [
    "buyard",
    "Buyard Cholik",
    "magic",
    "Circle of Fire",
    [
      [5, 100, 0.04, 20],
      [4, 100, 0.05, 25],
      [3, 100, 0.06, 30],
    ],
  ],
  [
    "bartuc",
    "Bartuc, Warlord of Blood",
    "mixed",
    "Blood Tether",
    [
      [5, 5, 0.1, 0.04],
      [4, 6, 0.12, 0.05],
      [3, 7, 0.14, 0.06],
    ],
  ],
  [
    "jitan",
    "Lord Aldric Jitan",
    "physical",
    "Fortress Runes",
    [
      [4, 3, 0.06, 2],
      [3, 3, 0.08, 2],
      [2, 3, 0.1, 1],
    ],
  ],
  [
    "greater_riftwalker",
    "Greater Riftwalker",
    "mixed",
    "Inside/Outside the Storm",
    [
      [4, 2, 1.2, 1],
      [3, 2, 1.3, 1],
      [2, 2, 1.4, 1],
    ],
  ],
  [
    "athulua",
    "Athulua",
    "physical",
    "Hunter's Mark",
    [
      [4, 3, 1.2, 1],
      [3, 3, 1.35, 1],
      [2, 3, 1.5, 2],
    ],
  ],
  [
    "lilith",
    "Lilith",
    "mixed",
    "Blood Bargain",
    [
      [5, 3, 0.15, 0.05],
      [4, 3, 0.2, 0.05],
      [3, 3, 0.25, 0.05],
    ],
  ],
  [
    "nemesis",
    "Nemesis",
    "mixed",
    "Mirror Arsenal",
    [
      [4, 2, 0.15, 2],
      [3, 2, 0.2, 2],
      [2, 2, 0.25, 2],
    ],
  ],
  [
    "azmodan",
    "Azmodan",
    "magic",
    "Fireblood Mark",
    [
      [3, 3, 0.08, 1],
      [3, 3, 0.1, 1],
      [3, 3, 0.12, 1],
    ],
  ],
  [
    "dark_star_dragon",
    "Dark Star Dragon",
    "magic",
    "Death Beam & Cover",
    [
      [4, 3, 1.3, 3],
      [3, 3, 1.5, 2],
      [3, 3, 1.7, 2],
    ],
  ],
  [
    "juris_khan",
    "Juris Khan",
    "magic",
    "Bridge of Ureh",
    [
      [5, 3, 0.08, 1],
      [4, 3, 0.1, 1],
      [3, 3, 0.12, 1],
    ],
  ],
  [
    "manoruk",
    "Manoruk",
    "magic",
    "Legion Formation",
    [
      [6, 3, 0.08, 2],
      [5, 3, 0.1, 2],
      [4, 3, 0.12, 2],
    ],
  ],
  [
    "baal",
    "Baal, Lord of Destruction",
    "mixed",
    "Worldstone Corruption",
    [
      [4, 5, 0.08, 3],
      [3, 5, 0.1, 4],
      [2, 5, 0.12, 5],
    ],
  ],
  [
    "belial",
    "Belial, Lord of Lies",
    "magic",
    "Three Lies",
    [
      [4, 5, 0.04, 2],
      [3, 5, 0.05, 2],
      [2, 5, 0.06, 2],
    ],
  ],
  [
    "astrogha",
    "Astrogha",
    "magic",
    "Totem Web",
    [
      [6, 3, 0.02, 3],
      [5, 3, 0.03, 3],
      [4, 3, 0.04, 3],
    ],
  ],
  [
    "atanna",
    "Atanna Khan",
    "mixed",
    "Dream Queue",
    [
      [4, 3, 0.08, 3],
      [3, 3, 0.1, 3],
      [3, 3, 0.12, 3],
    ],
  ],
  [
    "inarius",
    "Inarius",
    "magic",
    "Lilith's Ritual",
    [
      [5, 3, 0.04, 3],
      [4, 3, 0.05, 3],
      [3, 3, 0.06, 2],
    ],
  ],
  [
    "sescheron",
    "Sescheron's Destroyer",
    "physical",
    "Engine of Ruin",
    [
      [5, 5, 0.04, 2],
      [4, 5, 0.05, 2],
      [3, 5, 0.06, 2],
    ],
  ],
  [
    "nithogur",
    "Nithogur",
    "magic",
    "Time Anchor",
    [
      [5, 8, 0.02, 1],
      [4, 10, 0.025, 1],
      [3, 12, 0.03, 1],
    ],
  ],
];
const freeze = (x) => {
  if (x && typeof x === "object") {
    Object.values(x).forEach(freeze);
    Object.freeze(x);
  }
  return x;
};
const POOL = freeze(
  rows.map(([id, name, damageType, mechanic, depths]) => ({
    id,
    name,
    damageType,
    mechanic,
    depths: depths.map(([cycle, cap, power, amount], i) => ({
      cycle,
      cap,
      power,
      amount,
      hp: ["assur", "inarius"].includes(id)
        ? [0.9, 0.95, 1][i]
        : [0.9, 1, 1.15][i],
      damage: ["assur", "inarius"].includes(id)
        ? [0.9, 1, 1.05][i]
        : [0.9, 1.12, 1.15][i],
    })),
  })),
);
const FIXED = freeze([
  {
    id: "kabraxis",
    name: "Kabraxis, Keeper of the Seals",
    damageType: "mixed",
    mechanic: "Corrupted Seals",
    floor: 666,
    depths: [
      { cycle: 3, cap: 5, power: 0.05, amount: 3, hp: 1.15, damage: 1.15 },
    ],
  },
  {
    id: "deimoss",
    name: "Deimoss the Fleshweaver",
    damageType: "mixed",
    mechanic: "Dimensional Collapse",
    floor: 999,
    depths: [
      { cycle: 3, cap: 3, power: 0.25, amount: 3, hp: 1.15, damage: 1.15 },
    ],
  },
]);
const CATALOG = Object.fromEntries([...POOL, ...FIXED].map((d) => [d.id, d]));
const depth = (floor) => (floor < 350 ? 1 : floor < 700 ? 2 : 3);
const config = (id, floor) =>
  CATALOG[id].depths[(FIXED.some((d) => d.id === id) ? 1 : depth(floor)) - 1];
function choose(s, rng) {
  if (s.floor === 666 || s.floor === 999)
    return { ...FIXED.find((d) => d.floor === s.floor), rosterVersion: 2 };
  const d = POOL[Math.min(POOL.length - 1, Math.floor(rng() * POOL.length))];
  s.bossHistory ||= [];
  s.bossHistory.push({ id: d.id, floor: s.floor });
  return { ...d, rosterVersion: 2 };
}
function validateCatalog() {
  if (POOL.length !== 39 || new Set(Object.keys(CATALOG)).size !== 41)
    throw Error("INVALID_BOSS_CATALOG");
  for (const d of POOL)
    for (const [i, c] of d.depths.entries())
      if (
        d.depths.length !== 3 ||
        Math.abs(c.hp - 1) > [0.1, 0.12, 0.15][i] + 1e-9 ||
        Math.abs(c.damage - 1) > [0.1, 0.12, 0.15][i] + 1e-9 ||
        c.cycle < 2 ||
        c.cap < 1 ||
        !Object.values(c).every(Number.isFinite)
      )
        throw Error("INVALID_BOSS_DEPTH");
}
validateCatalog();
module.exports = {
  POOL,
  FIXED,
  CATALOG,
  depth,
  config,
  choose,
  validateCatalog,
};
