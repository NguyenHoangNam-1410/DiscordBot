"use strict";

const assert = require("node:assert/strict");
const { calculatePayouts, estimatePayout } = require("../src/payments/payout");
const sides = ["BLG", "GENG"];
const wallet = (userId, side, amount) => ({ userId, side, amount });
const amounts = (result) =>
  Object.fromEntries(result.payouts.map((row) => [row.userId, row.payout]));

const example = [
  wallet("large", "BLG", 20000),
  wallet("small", "BLG", 10000),
  wallet("opponent", "GENG", 30000),
];
const split = calculatePayouts(example, sides, "BLG");
assert.deepEqual(amounts(split), { large: 40000, small: 20000, opponent: 0 });
assert.equal(split.totalPool, 60000);
assert.equal(split.mode, "split");
assert.equal(estimatePayout(example, sides, "large").profit, 20000);
assert.equal(estimatePayout(example, sides, "unknown"), null);
assert.deepEqual(amounts(calculatePayouts(example, sides, "GENG")), {
  large: 0,
  small: 0,
  opponent: 60000,
});

for (const occupiedSide of sides) {
  const onlyOneSide = [
    wallet("one", occupiedSide, 20000),
    wallet("two", occupiedSide, 10000),
  ];
  for (const winner of sides) {
    const refund = calculatePayouts(onlyOneSide, sides, winner);
    assert.equal(refund.mode, "refund");
    assert.deepEqual(amounts(refund), { one: 20000, two: 10000 });
    assert(refund.payouts.every((row) => row.profit === 0));
  }
}
assert.deepEqual(calculatePayouts([], sides, "BLG").payouts, []);

const fractions = [
  wallet("a", "BLG", 1),
  wallet("b", "BLG", 1),
  wallet("c", "BLG", 1),
  wallet("opponent", "GENG", 2),
];
assert.deepEqual(amounts(calculatePayouts(fractions, sides, "BLG")), {
  a: 2,
  b: 2,
  c: 1,
  opponent: 0,
});
const uneven = [
  wallet("small", "BLG", 1),
  wallet("large", "BLG", 2),
  wallet("opponent", "GENG", 1),
];
assert.deepEqual(amounts(calculatePayouts(uneven, sides, "BLG")), {
  small: 1,
  large: 3,
  opponent: 0,
});
const huge = [
  wallet("large", "BLG", 2_000_000_000_000_000),
  wallet("small", "BLG", 1_000_000_000_000_000),
  wallet("opponent", "GENG", 3_000_000_000_000_000),
];
assert.deepEqual(amounts(calculatePayouts(huge, sides, "BLG")), {
  large: 4_000_000_000_000_000,
  small: 2_000_000_000_000_000,
  opponent: 0,
});
for (const invalid of [
  0,
  -1,
  0.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
])
  assert.throws(() =>
    calculatePayouts([wallet("one", "BLG", invalid)], sides, "BLG"),
  );
assert.throws(() =>
  calculatePayouts(
    [wallet("same", "BLG", 1), wallet("same", "GENG", 1)],
    sides,
    "BLG",
  ),
);
assert.throws(() => calculatePayouts(example, sides, "LG"));
assert.throws(() => calculatePayouts(example, ["BLG", "BLG"], "BLG"));
assert.throws(
  () =>
    calculatePayouts(
      [wallet("one", "BLG", Number.MAX_SAFE_INTEGER), wallet("two", "GENG", 1)],
      sides,
      "BLG",
    ),
  RangeError,
);

let seed = 20261115;
const random = (max) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed >>> 8) % max;
};
let splitChecks = 0,
  refundChecks = 0;
for (let trial = 0; trial < 500; trial++) {
  const wallets = Array.from({ length: 1 + random(30) }, (_, i) =>
    wallet(`user-${i}`, sides[random(2)], 1 + random(50000)),
  );
  const pot = wallets.reduce((sum, row) => sum + row.amount, 0);
  for (const winner of sides) {
    const result = calculatePayouts(wallets, sides, winner);
    if (result.mode === "split") splitChecks++;
    else refundChecks++;
    assert.equal(
      result.payouts.reduce((sum, row) => sum + row.payout, 0),
      pot,
      "all deposited money is allocated",
    );
    const reversed = amounts(
      calculatePayouts([...wallets].reverse(), sides, winner),
    );
    for (const row of result.payouts) {
      assert(Number.isSafeInteger(row.payout));
      assert.equal(
        row.payout,
        reversed[row.userId],
        "callback/input order cannot change rounding allocation",
      );
      if (result.mode === "refund") assert.equal(row.payout, row.stake);
      else if (row.side === winner)
        assert(row.payout >= row.stake, "winner always recovers principal");
      else assert.equal(row.payout, 0);
    }
    const winners = result.payouts
      .filter((row) => row.side === winner)
      .sort((a, b) => a.stake - b.stake);
    for (let i = 1; i < winners.length; i++)
      if (winners[i].stake > winners[i - 1].stake)
        assert(
          winners[i].payout >= winners[i - 1].payout,
          "larger stake cannot receive less",
        );
  }
}
assert(splitChecks > 500, "randomized checks exercise both funded sides");
assert(refundChecks > 0, "randomized checks also cover refunds");
console.log(
  JSON.stringify({
    ok: true,
    payouts:
      "proportional pooled payouts including principal, either empty side refunds everyone, whole-VND largest remainders, BigInt arithmetic, 1000 randomized outcome checks",
  }),
);
