const fs = require("fs");
const path = require("path");

/**
 * Loads every command module in ../commands.
 * Each command file must export { name, description, execute(ctx) }.
 * Returns a Map keyed by command name.
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

  return map;
}

module.exports = { loadCommands };
