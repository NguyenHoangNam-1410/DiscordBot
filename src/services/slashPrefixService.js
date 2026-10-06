const { ApplicationCommandOptionType: T, MessageFlags } = require("discord.js");
const { normalizeSearch } = require("../utils/text");

const ALIASES = {
  blackjack: "xidach",
  xi_dach: "xidach",
  mines: "domin",
  hardcore: "sinhton",
  hc: "sinhton",
  vuatiengviet: "vtv",
  vua: "vtv",
  vutiengviet: "vtv",
  trochoi: "huongdan",
  games: "huongdan",
  gamehelp: "huongdan",
  xucxacngam: "chinchiro",
  coquaynga: "coquay",
  cqn: "coquay",
};
const SUB_ALIASES = {
  sinhton: { start: "batdau", profile: "hoso", top: "xephang", rates: "tyle" },
  vtv: { start: "batdau", skip: "boqua", end: "ketthuc" },
};
const DEFAULT_SUBCOMMANDS = { sinhton: "batdau", vtv: "batdau" };
const normalize = (value) => normalizeSearch(String(value)).replace(/\s/g, "");
let registeredCommands;

function commandMap(message) {
  if (message.client?.commands?.size) return message.client.commands;
  registeredCommands ||= new Map(
    require("../commandRegistry")
      .loadCommands()
      .map((command) => [command.data.toJSON().name, command]),
  );
  return registeredCommands;
}

// Quotes keep multiword strings together, including named options such as ten="Tên món".
function tokenize(input) {
  const tokens = [];
  let token = "",
    quote = null,
    started = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      if (char === "\\" && [quote, "\\"].includes(input[i + 1]))
        token += input[++i];
      else if (char === quote) quote = null;
      else token += char;
    } else if (
      char === '"' ||
      (char === "'" && (!started || /[=:]$/.test(token)))
    ) {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) tokens.push(token);
      token = "";
      started = false;
    } else {
      token += char;
      started = true;
    }
  }
  if (quote) throw new Error("Thiếu dấu đóng ngoặc kép cho tham số.");
  if (started) tokens.push(token);
  return tokens;
}

function commandRoute(schema, tokens) {
  let definitions = schema.options || [];
  const path = [schema.name];
  let subcommand = null,
    group = null;
  while (
    definitions.some((option) =>
      [T.Subcommand, T.SubcommandGroup].includes(option.type),
    )
  ) {
    const raw = tokens[0];
    const name =
      SUB_ALIASES[schema.name]?.[normalize(raw || "")] ||
      normalize(raw || DEFAULT_SUBCOMMANDS[schema.name] || "");
    const selected = definitions.find((option) => option.name === name);
    if (!selected)
      return { path, definitions, error: "Chọn chức năng con của lệnh." };
    if (raw !== undefined) tokens.shift();
    path.push(selected.name);
    if (selected.type === T.SubcommandGroup) group = selected.name;
    else subcommand = selected.name;
    definitions = selected.options || [];
  }
  return { path, definitions, subcommand, group };
}

function usage(prefix, route) {
  const children = route.definitions.filter((option) =>
    [T.Subcommand, T.SubcommandGroup].includes(option.type),
  );
  if (children.length)
    return `Cách dùng: \`${prefix}${route.path.join(" ")} <chức năng>\`\n${children.map((option) => `• \`${option.name}\` — ${option.description}`).join("\n")}`.slice(
      0,
      1800,
    );
  const args = route.definitions
    .map((option) =>
      option.required ? `<${option.name}>` : `[${option.name}]`,
    )
    .join(" ");
  const choices = route.definitions
    .filter((option) => option.choices?.length)
    .map(
      (option) =>
        `• ${option.name}: ${option.choices.map((choice) => choice.value).join(" | ")}`,
    )
    .join("\n");
  return `Cách dùng: \`${prefix}${route.path.join(" ")}${args ? ` ${args}` : ""}\`${choices ? `\n${choices}` : ""}\nCó thể ghi \`ten_tham_so=giá_trị\` để bỏ qua tùy chọn không cần dùng; đặt chuỗi nhiều từ trong dấu \`"..."\`.`.slice(
    0,
    1800,
  );
}

function rawOptions(definitions, tokens) {
  const named = new Map(),
    positional = [];
  const names = new Set(definitions.map((option) => option.name));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let assignment = token.match(/^([\p{L}\w-]+)([=:])(.*)$/u);
    // IDs and URLs may contain a colon; only known option names use name:value.
    if (assignment?.[2] === ":" && !names.has(normalize(assignment[1])))
      assignment = null;
    const flag = token.match(/^--([\p{L}\w-]+)$/u);
    if (!assignment && !flag) {
      positional.push(token);
      continue;
    }
    const name = normalize((assignment || flag)[1]);
    if (!names.has(name)) throw new Error(`Tham số không hợp lệ: ${name}.`);
    if (named.has(name)) throw new Error(`Tham số bị lặp: ${name}.`);
    const value = assignment ? assignment[3] : tokens[++i];
    if (value === undefined) throw new Error(`Thiếu giá trị cho ${name}.`);
    named.set(name, value);
  }
  const values = new Map();
  for (let index = 0; index < definitions.length; index++) {
    const option = definitions[index];
    let value = named.get(option.name);
    if (!named.has(option.name) && positional.length) {
      const isFinalText =
        option.type === T.String &&
        !option.choices?.length &&
        index === definitions.length - 1;
      value = isFinalText ? positional.splice(0).join(" ") : positional.shift();
    }
    if (value !== undefined) values.set(option.name, value);
    else if (option.required) throw new Error(`Thiếu tham số ${option.name}.`);
  }
  if (positional.length) throw new Error("Lệnh có tham số thừa.");
  return values;
}

async function optionValue(message, option, raw) {
  let value = raw;
  if (option.choices?.length) {
    const alias =
      option.name === "chedochoi" && normalize(raw) === "banbe"
        ? "nguoichoi"
        : option.name === "chedo" && raw === "six+"
          ? "sixplus"
          : raw;
    const choice = option.choices.find(
      (item) =>
        normalize(item.value) === normalize(alias) ||
        normalize(item.name) === normalize(alias),
    );
    if (!choice)
      throw new Error(
        `${option.name} phải là: ${option.choices.map((item) => item.value).join(", ")}.`,
      );
    value = choice.value;
  }
  if ([T.Integer, T.Number].includes(option.type)) {
    const text = String(value);
    if (
      !(
        option.type === T.Integer
          ? /^[+-]?\d+$/
          : /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/
      ).test(text)
    )
      throw new Error(
        `${option.name} phải là ${option.type === T.Integer ? "số nguyên" : "số"}.`,
      );
    value = Number(text.replace(",", "."));
    if (
      !Number.isFinite(value) ||
      (option.type === T.Integer && !Number.isSafeInteger(value)) ||
      (option.min_value !== undefined && value < option.min_value) ||
      (option.max_value !== undefined && value > option.max_value)
    )
      throw new Error(
        `${option.name} ngoài giới hạn${option.min_value !== undefined ? `; tối thiểu ${option.min_value}` : ""}${option.max_value !== undefined ? `; tối đa ${option.max_value}` : ""}.`,
      );
  } else if (option.type === T.Boolean) {
    const text = normalize(value);
    if (
      ![
        "true",
        "false",
        "1",
        "0",
        "yes",
        "no",
        "on",
        "off",
        "bat",
        "tat",
      ].includes(text)
    )
      throw new Error(`${option.name} phải là true hoặc false.`);
    value = ["true", "1", "yes", "on", "bat"].includes(text);
  } else if ([T.User, T.Channel, T.Role, T.Mentionable].includes(option.type)) {
    const id = String(value)
      .match(/^(?:<@!?(\d+)>|<#(\d+)>|<@&(\d+)>|(\d+))$/)
      ?.slice(1)
      .find(Boolean);
    if (!id) throw new Error(`${option.name}: dùng mention hoặc ID Discord.`);
    if (
      option.type === T.Role ||
      (option.type === T.Mentionable && String(value).startsWith("<@&"))
    )
      value = await message.guild.roles.fetch(id).catch(() => null);
    else if (option.type === T.Channel)
      value = await message.guild.channels.fetch(id).catch(() => null);
    else {
      const member =
        message.mentions?.members?.get(id) ||
        (await message.guild.members.fetch(id).catch(() => null));
      value = member?.user;
      if (!value && option.type === T.Mentionable)
        value = await message.guild.roles.fetch(id).catch(() => null);
    }
    if (!value) throw new Error(`Không tìm thấy ${option.name} trong server.`);
    if (
      option.channel_types?.length &&
      !option.channel_types.includes(value.type)
    )
      throw new Error(`${option.name} không đúng loại kênh được phép.`);
  } else if (option.type === T.String) {
    value = String(value);
    const length = [...value].length;
    if (
      (option.min_length !== undefined && length < option.min_length) ||
      (option.max_length !== undefined && length > option.max_length)
    )
      throw new Error(`${option.name} có độ dài không hợp lệ.`);
  } else if (option.type === T.Attachment) {
    value = message.attachments?.get(String(value));
    if (!value)
      throw new Error(`Đính kèm tệp và nhập ID tệp cho ${option.name}.`);
  }
  return value;
}

function messageInteraction(message, options = {}) {
  const values = options.values || new Map();
  for (const name of [
    "strings",
    "integers",
    "numbers",
    "booleans",
    "users",
    "channels",
    "roles",
  ]) {
    for (const [key, value] of Object.entries(options[name] || {}))
      values.set(key, value);
  }
  const get = (name, required = false) => {
    const value = values.get(name);
    if (value === undefined && required)
      throw new Error(`Missing required option: ${name}`);
    return value ?? null;
  };
  const clean = (payload) => {
    const result =
      typeof payload === "string" ? { content: payload } : { ...payload };
    if (result.flags !== undefined) {
      const flags =
        Number(result.flags?.bitfield ?? result.flags) &
        ~MessageFlags.Ephemeral;
      if (flags) result.flags = flags;
      else delete result.flags;
    }
    delete result.withResponse;
    delete result.fetchReply;
    delete result.ephemeral;
    result.allowedMentions ||= { parse: [], repliedUser: false };
    return result;
  };
  return {
    id: message.id,
    commandName: options.commandName,
    guildId: message.guildId,
    channelId: message.channelId,
    channel: message.channel,
    guild: message.guild,
    client: message.client,
    user: message.author,
    member: message.member,
    memberPermissions: message.member?.permissions,
    appPermissions: message.guild?.members?.me?.permissionsIn?.(
      message.channel,
    ),
    createdTimestamp: message.createdTimestamp,
    replied: false,
    deferred: false,
    lastReply: null,
    isMessagePrefix: true,
    options: {
      getSubcommand: () => options.subcommand || null,
      getSubcommandGroup: () => options.group || null,
      getString: get,
      getInteger: get,
      getNumber: get,
      getBoolean: get,
      getUser: get,
      getChannel: get,
      getRole: get,
      getMentionable: get,
      getAttachment: get,
      getMember: (name) =>
        message.guild?.members?.cache?.get(get(name)?.id) || null,
      get: (name, required) => {
        const value = get(name, required);
        return value === null ? null : { name, value: value?.id || value };
      },
    },
    async reply(payload) {
      this.lastReply = await message.reply(clean(payload));
      this.replied = true;
      return { resource: { message: this.lastReply } };
    },
    async deferReply() {
      this.deferred = true;
      await message.channel?.sendTyping?.().catch(() => {});
    },
    async editReply(payload) {
      if (this.lastReply)
        this.lastReply = await this.lastReply.edit(clean(payload));
      else this.lastReply = await message.reply(clean(payload));
      this.replied = true;
      return this.lastReply;
    },
    async fetchReply() {
      return this.lastReply;
    },
    async deleteReply() {
      if (this.lastReply) await this.lastReply.delete();
      this.lastReply = null;
    },
    async followUp(payload) {
      return message.reply(clean(payload));
    },
  };
}

async function handleSlashPrefix(message) {
  if (!message.guildId || message.author?.bot) return false;
  const prefix = process.env.COMMAND_PREFIX || "!";
  const content = String(message.content || "").trim();
  if (!content.startsWith(prefix)) return false;
  const body = content.slice(prefix.length).trim();
  const first = body.match(/^\S+/)?.[0] || "";
  const name = ALIASES[normalize(first)] || normalize(first);
  const command = commandMap(message).get(name);
  if (!command) return false;
  // Retain the historical !sinhton <xu> <class> shortcut handled by gamePrefixService.
  if (
    name === "sinhton" &&
    /^\s*[+-]?\d+(?:\s|$)/.test(body.slice(first.length))
  )
    return false;
  const schema = command.data.toJSON();
  let route = { path: [name], definitions: schema.options || [] };
  let parsed;
  try {
    const tokens = tokenize(body.slice(first.length));
    route = commandRoute(schema, tokens);
    if (route.error) throw new Error(route.error);
    const raw = rawOptions(route.definitions, tokens),
      values = new Map();
    for (const option of route.definitions) {
      if (raw.has(option.name))
        values.set(
          option.name,
          await optionValue(message, option, raw.get(option.name)),
        );
    }
    parsed = { ...route, commandName: name, values };
  } catch (error) {
    await message.reply({
      content: `${error.message}\n${usage(prefix, route)}`.slice(0, 2000),
      allowedMentions: { parse: [], repliedUser: false },
    });
    return true;
  }
  const interaction = messageInteraction(message, parsed);
  try {
    await command.execute(interaction);
  } catch (error) {
    await interaction
      .followUp({ content: "Có lỗi khi xử lý lệnh." })
      .catch(() => {});
    throw error;
  }
  return true;
}

module.exports = { handleSlashPrefix, messageInteraction };
