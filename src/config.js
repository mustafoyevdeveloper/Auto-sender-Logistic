import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), "config.json");

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      "config.json topilmadi. config.example.json dan nusxa oling va API_ID, API_HASH to'ldiring."
    );
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const config = JSON.parse(raw);
  if (!config.API_ID || !config.API_HASH) {
    throw new Error("config.json da API_ID va API_HASH majburiy.");
  }
  return {
    apiId: Number(config.API_ID),
    apiHash: String(config.API_HASH).trim(),
    sessionFile: config.SESSION_FILE || "user.session",
    delayMinSec: Math.max(1, Number(config.DELAY_MIN_SEC) || 8),
    delayMaxSec: Math.max(2, Number(config.DELAY_MAX_SEC) || 15),
    batchDelaySec: Math.max(1, Number(config.BATCH_DELAY_SEC) || 10),
    logFile: config.LOG_FILE === false || config.LOG_FILE === "" ? false : (config.LOG_FILE || "userbot.log"),
    blacklistGroups: Array.isArray(config.BLACKLIST_GROUPS)
      ? config.BLACKLIST_GROUPS.map(String)
      : [],
    whitelistGroups: Array.isArray(config.WHITELIST_GROUPS)
      ? config.WHITELIST_GROUPS.map(String)
      : [],
  };
}
