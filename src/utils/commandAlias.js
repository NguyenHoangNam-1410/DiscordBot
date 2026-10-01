function remapOptions(interaction, { subcommand, optionNames = {} } = {}) {
  const original = interaction.options;
  const options = new Proxy(original, {
    get(target, property) {
      if (property === "getSubcommand" && subcommand) return () => subcommand;
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (property === "getFocused")
        return (...args) => {
          const focused = value.apply(target, args);
          if (!focused || typeof focused !== "object") return focused;
          const oldName = Object.keys(optionNames).find(
            (name) => optionNames[name] === focused.name,
          );
          return oldName ? { ...focused, name: oldName } : focused;
        };
      if (!String(property).startsWith("get")) return value.bind(target);
      return (name, ...args) =>
        value.call(target, optionNames[name] || name, ...args);
    },
  });
  return new Proxy(interaction, {
    get(target, property) {
      if (property === "options") return options;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function renamedOption(option, names = {}) {
  const next = { ...option, name: names[option.name] || option.name };
  if (option.options)
    next.options = option.options.map((child) => renamedOption(child, names));
  return next;
}

function commandData(name, description, options) {
  return { toJSON: () => ({ name, description, type: 1, options }) };
}

module.exports = { remapOptions, renamedOption, commandData };
