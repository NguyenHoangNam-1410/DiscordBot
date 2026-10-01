const crypto = require("node:crypto");

function commitment(serverSeed) {
  return crypto.createHash("sha256").update(String(serverSeed)).digest("hex");
}
function createFairness() {
  const serverSeed = crypto.randomBytes(32).toString("hex");
  return {
    algorithm: "HMAC-SHA256",
    commit: commitment(serverSeed),
    serverSeed,
  };
}
function fairInt(serverSeed, context, counter, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new Error("INVALID_FAIR_MAXIMUM");
  const digest = crypto
    .createHmac("sha256", String(serverSeed))
    .update(`${context}:${counter}`)
    .digest();
  return Number(digest.readBigUInt64BE(0) % BigInt(maximum));
}
function fairShuffle(values, serverSeed, context = "shuffle") {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = fairInt(
      serverSeed,
      context,
      output.length - index,
      index + 1,
    );
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}
function verifyFairness(fair) {
  return Boolean(
    fair?.serverSeed &&
    fair?.commit &&
    commitment(fair.serverSeed) === fair.commit,
  );
}

function createFairRng(serverSeed, namespace = "game", startCounter = 0) {
  let counter = startCounter;
  return {
    int(maximum, context = "roll") {
      return fairInt(serverSeed, `${namespace}:${context}`, counter++, maximum);
    },
    float(context = "roll") {
      return this.int(1_000_000, context) / 1_000_000;
    },
    pick(values, context = "pick") {
      return values[this.int(values.length, context)];
    },
    get counter() {
      return counter;
    },
  };
}

module.exports = {
  commitment,
  createFairness,
  fairInt,
  fairShuffle,
  createFairRng,
  verifyFairness,
};
