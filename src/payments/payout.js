"use strict";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
function money(value) {
  if (value < 0n || value > MAX_SAFE)
    throw new RangeError("Payout exceeds safe integer range");
  return Number(value);
}

// Pure calculation only. Monetary amounts are whole VND; no bank transfer is initiated.
function calculatePayouts(wallets, sides, winner) {
  if (
    !Array.isArray(sides) ||
    sides.length !== 2 ||
    new Set(sides).size !== 2 ||
    !sides.includes(winner)
  )
    throw new Error("Invalid winning side");
  const seen = new Set();
  const pools = new Map(sides.map((side) => [side, 0n]));
  const rows = wallets.map((wallet) => {
    if (
      typeof wallet.userId !== "string" ||
      !wallet.userId ||
      seen.has(wallet.userId) ||
      !pools.has(wallet.side) ||
      !Number.isSafeInteger(wallet.amount) ||
      wallet.amount <= 0
    )
      throw new Error("Invalid confirmed betting wallet");
    seen.add(wallet.userId);
    const stake = BigInt(wallet.amount);
    pools.set(wallet.side, pools.get(wallet.side) + stake);
    return {
      userId: wallet.userId,
      side: wallet.side,
      stake,
      payout: 0n,
      remainder: 0n,
    };
  });
  const total = [...pools.values()].reduce((sum, amount) => sum + amount, 0n);
  money(total);
  const winningPool = pools.get(winner);
  const losingPool = total - winningPool;
  const refund = [...pools.values()].some((amount) => amount === 0n);
  if (refund) {
    for (const row of rows) row.payout = row.stake;
  } else {
    const winners = rows.filter((row) => row.side === winner);
    let allocated = 0n;
    for (const row of winners) {
      const profitNumerator = losingPool * row.stake;
      row.payout = row.stake + profitNumerator / winningPool;
      row.remainder = profitNumerator % winningPool;
      allocated += row.payout;
    }
    const remainderOrder = [...winners].sort((a, b) => {
      if (a.remainder !== b.remainder)
        return a.remainder > b.remainder ? -1 : 1;
      return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
    });
    const leftover = Number(total - allocated); // Always fewer than the number of winners.
    for (let index = 0; index < leftover; index++)
      remainderOrder[index].payout++;
  }
  return {
    mode: refund ? "refund" : "split",
    winner,
    totalPool: money(total),
    winningPool: money(winningPool),
    losingPool: money(losingPool),
    payouts: rows.map((row) => ({
      userId: row.userId,
      side: row.side,
      stake: money(row.stake),
      payout: money(row.payout),
      profit: Number(row.payout - row.stake),
    })),
  };
}

function estimatePayout(wallets, sides, userId) {
  const own = wallets.find((wallet) => wallet.userId === userId);
  if (!own) return null;
  const result = calculatePayouts(wallets, sides, own.side);
  const payout = result.payouts.find((row) => row.userId === userId);
  return {
    ...payout,
    mode: result.mode,
    totalPool: result.totalPool,
    winningPool: result.winningPool,
  };
}

module.exports = { calculatePayouts, estimatePayout };
