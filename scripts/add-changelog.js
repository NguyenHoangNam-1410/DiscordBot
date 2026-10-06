const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const {
  sortedEntries,
  validateEntries,
} = require("../src/services/changelogService");

const catalogPath = path.resolve(__dirname, "../src/changelog.json");

function parseArguments(args) {
  const options = { changes: [] };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      !["--title", "--change", "--commit"].includes(flag) ||
      typeof value !== "string" ||
      !value.trim()
    )
      throw new Error(
        "Dùng --title <tiêu đề> --change <nội dung> [--change ...] [--commit <SHA>].",
      );
    if (flag === "--change") options.changes.push(value.trim());
    else {
      const key = flag.slice(2);
      if (options[key]) throw new Error("Không lặp tùy chọn " + flag);
      options[key] = value.trim();
    }
  }
  if (!options.title || !options.changes.length)
    throw new Error("Cần tiêu đề và ít nhất một nội dung thay đổi.");
  if (options.commit && !/^[a-f0-9]{7,40}$/.test(options.commit))
    throw new Error("--commit cần SHA Git, không dùng tên nhánh.");
  return options;
}

function createEntry(
  options,
  now = new Date(),
  readCommit = (ref) =>
    execFileSync("git", ["show", "-s", "--format=%H%n%cI", ref], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    }).trim(),
) {
  const auditedAt = now.toISOString();
  const entry = {
    id: randomUUID(),
    updatedAt: auditedAt,
    auditedAt,
    title: options.title,
    changes: options.changes,
  };
  if (options.commit) {
    const [commit, updatedAt] = readCommit(options.commit).split(/\r?\n/);
    entry.commit = commit;
    entry.updatedAt = updatedAt;
    entry.id = commit;
  }
  validateEntries([entry]);
  return entry;
}

function appendEntry(entries, entry) {
  if (
    entry.commit &&
    entries.some((previous) => previous.commit === entry.commit)
  )
    throw new Error("Commit này đã có trong changelog.");
  return sortedEntries([...entries, entry]);
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const entry = createEntry(options);
    const entries = appendEntry(
      JSON.parse(fs.readFileSync(catalogPath, "utf8")),
      entry,
    );
    // In-place write preserves ownership of the existing catalog.
    fs.writeFileSync(
      catalogPath,
      JSON.stringify(entries, null, 2) + "\n",
      "utf8",
    );
    console.log("Đã ghi changelog: " + entry.title + " · " + entry.updatedAt);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { parseArguments, createEntry, appendEntry };
