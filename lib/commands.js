const fs = require("fs");
const path = require("path");

/**
 * Loads every command module in ../commands.
 * Each command file must export { name, description, execute(ctx) }.
 * It can also export `aliases: ["other", "names"]` — extra names that run the
 * same command (ctx.commandName tells it which name was typed).
 * Returns a Map keyed by command name (aliases point at the same module).
 */
function loadCommands() {
  const commandsDir = path.join(__dirname, "..", "commands");
  const map = new Map();

  for (const file of fs.readdirSync(commandsDir)) {
    if (!file.endsWith(".js")) continue;
    const cmd = require(path.join(commandsDir, file));
    if (!cmd?.name || typeof cmd.execute !== "function") {
      console.warn(`Skipping invalid command file: ${file}`);
      continue;
    }
    map.set(cmd.name.toLowerCase(), cmd);
  }

  // Aliases are added after every real name so they can never replace a command.
  for (const cmd of new Set(map.values())) {
    for (const alias of cmd.aliases || []) {
      const key = String(alias).toLowerCase();
      if (map.has(key)) {
        console.warn(`Alias "${key}" for "${cmd.name}" skipped — a command with that name already exists.`);
        continue;
      }
      map.set(key, cmd);
    }
  }

  return map;
}

module.exports = { loadCommands };
