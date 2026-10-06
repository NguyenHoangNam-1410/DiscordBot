"use strict";
process.env.DB_BACKUP_DISCORD_USER_ID = "";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork } = require("node:child_process");
const { EventEmitter } = require("node:events");
const Database = require("better-sqlite3");
if (process.argv[2] === "--worker") {
  process.env.DISCORD_TOKEN = "test-placeholder";
  process.env.ENABLE_MESSAGE_COMMANDS = "false";
  function stub(file, exports) {
    const id = require.resolve(file);
    require.cache[id] = { id, filename: id, loaded: true, exports };
  }
  const { db } = require("../src/db");
  db.exec(
    "CREATE TABLE shutdown_probe(value INTEGER); INSERT INTO shutdown_probe VALUES(1)",
  );
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let client,
    executions = 0;
  const realDiscord = require("discord.js");
  class FakeClient extends EventEmitter {
    constructor() {
      super();
      client = this;
      this.rest = new EventEmitter();
    }
    async login() {
      // Intentionally never emit ClientReady: backup must not depend on Discord connectivity.
      queueMicrotask(() =>
        this.emit(realDiscord.Events.InteractionCreate, interaction("first")),
      );
    }
    async destroy() {
      process.send({ event: "destroyed" });
    }
  }
  stub("discord.js", { ...realDiscord, Client: FakeClient });
  const interaction = (id) => ({
    id,
    guildId: "test",
    user: { id: "test" },
    commandName: "probe",
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isModalSubmit: () => false,
    reply: async () => {},
    followUp: async () => {},
  });
  stub("../src/commandRegistry", {
    loadCommands: () => [
      {
        data: { toJSON: () => ({ name: "probe" }) },
        execute: async () => {
          executions++;
          process.send({ event: "action_started" });
          await gate;
          db.prepare("UPDATE shutdown_probe SET value=99").run();
        },
      },
    ],
  });
  stub("../src/componentRouter", {
    routeComponentInteraction: async () => false,
  });
  for (const [file, method] of [
    ["prefixCommandService", "handlePrefixMessage"],
    ["gameMessageService", "handleGameMessage"],
    ["gamePrefixService", "handleGamePrefix"],
    ["multiplayerGameService", "resumeOpenRounds"],
    ["horseRaceService", "resumeHorseRaces"],
  ])
    stub("../src/services/" + file, { [method]: async () => false });
  const services = [
    ["economyService", "startEconomyMaintenance"],
    ["blackjackDuelService", "startBlackjackDuelMaintenance"],
    ["blackjackService", "startBlackjackTableMaintenance"],
    ["pokerService", "startPokerMaintenance"],
    ["timedChallengeService", "startTimedChallengeMaintenance"],
    ["commerceMaintenanceService", "startCommerceMaintenance"],
    ["staleSessionService", "startStaleSessionMaintenance"],
  ];
  for (const [file, method] of services)
    stub("../src/services/" + file, { [method]: () => null });
  require("../src/index");
  process.on("message", (message) => {
    if (message === "shutdown") {
      process.emit("SIGTERM");
      client.emit(
        realDiscord.Events.InteractionCreate,
        interaction("after-shutdown"),
      );
      process.send({ event: "shutdown_requested" });
    } else if (message === "release") {
      assert.equal(executions, 1, "shutdown accepted a new action");
      release();
    }
  });
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bot-shutdown-"));
  assert.equal(
    path.dirname(path.resolve(directory)),
    path.resolve(os.tmpdir()),
  );
  assert(path.basename(directory).startsWith("bot-shutdown-"));
  let child;
  async function main() {
    const env = {
      ...process.env,
      DB_PATH: path.join(directory, "database.sqlite"),
      DB_BACKUP_DIR: path.join(directory, "backups"),
      LOG_DIR: path.join(directory, "logs"),
    };
    const messages = [],
      output = [];
    await new Promise((resolve, reject) => {
      child = fork(__filename, ["--worker"], {
        env,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              "shutdown worker timed out: " +
                JSON.stringify(messages) +
                "\n" +
                output.join(""),
            ),
          ),
        10_000,
      );
      child.stdout.on("data", (data) => output.push(String(data)));
      child.stderr.on("data", (data) => output.push(String(data)));
      child.on("message", (message) => {
        messages.push(message.event);
        if (message.event === "action_started") child.send("shutdown");
        if (message.event === "shutdown_requested") child.send("release");
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code !== 0) reject(new Error(output.join("") || "shutdown failed"));
        else resolve();
      });
    });
    child = null;
    assert.deepEqual(messages, [
      "action_started",
      "shutdown_requested",
      "destroyed",
    ]);
    const files = fs
      .readdirSync(env.DB_BACKUP_DIR)
      .filter((name) => name.endsWith(".sqlite"));
    assert(
      files.length >= 2,
      "startup/final backup not created without ClientReady",
    );
    const restored = new Database(
      path.join(env.DB_BACKUP_DIR, files.sort().at(-1)),
      { readonly: true },
    );
    assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(
      restored.prepare("SELECT value FROM shutdown_probe").get().value,
      99,
    );
    restored.close();
    const live = new Database(env.DB_PATH, { readonly: true });
    assert.equal(
      live.prepare("SELECT value FROM shutdown_probe").get().value,
      99,
    );
    live.close();
    console.log(
      JSON.stringify({
        ok: true,
        shutdown: [
          "backup begins without Discord ready",
          "shutdown blocks new actions",
          "in-flight action commits before final snapshot",
          "database/Discord close cleanly",
        ],
      }),
    );
  }
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (child && child.exitCode === null) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGKILL");
        await exited;
      }
      fs.rmSync(directory, { recursive: true, force: true });
    });
}
