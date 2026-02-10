import fs from "fs";
import path from "path";
import { StringSession } from "telegram/sessions/index.js";

const DEFAULT_NAME = "user.session";

/**
 * Sessiya fayldan o'qiydi yoki bo'sh qator qaytaradi.
 * @param {string} sessionFileName - config.json dagi SESSION_FILE
 * @returns {StringSession}
 */
export function loadSession(sessionFileName = DEFAULT_NAME) {
  const file = path.resolve(process.cwd(), sessionFileName);
  let sessionString = "";
  if (fs.existsSync(file)) {
    try {
      sessionString = fs.readFileSync(file, "utf8").trim();
    } catch (_) {
      sessionString = "";
    }
  }
  return new StringSession(sessionString);
}

/**
 * Sessiya qatorini faylga yozadi.
 * @param {string} sessionString - client.session.save() dan olingan
 * @param {string} sessionFileName
 */
export function saveSession(sessionString, sessionFileName = DEFAULT_NAME) {
  const file = path.resolve(process.cwd(), sessionFileName);
  fs.writeFileSync(file, sessionString, "utf8");
}
