// Composed once by ../runtime/index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { crypto, fairInt, fairStateContext } = dependencies;

  function nextFair(maximum, context) {
    const state = fairStateContext.getStore();
    if (!state?.fair?.serverSeed) return null;
    const value = fairInt(
      state.fair.serverSeed,
      `hardcore:${context}`,
      state.fairCounter || 0,
      maximum,
    );
    state.fairCounter = (state.fairCounter || 0) + 1;
    return value;
  }

  function randomFloat() {
    const value = nextFair(1_000_000, "float");
    return (value ?? crypto.randomInt(1_000_000)) / 1_000_000;
  }

  function randomInt(min, max) {
    const value = nextFair(max - min + 1, "int");
    return min + (value ?? crypto.randomInt(max - min + 1));
  }

  function pick(items) {
    const value = nextFair(items.length, "pick");
    return items[value ?? crypto.randomInt(items.length)];
  }
  return { nextFair, randomFloat, randomInt, pick };
};
