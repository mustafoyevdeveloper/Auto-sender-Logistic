import fs from "fs";
import path from "path";

const FILE = path.resolve(process.cwd(), "blacklist_auto.json");

function read() {
  if (!fs.existsSync(FILE)) return [];
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function write(arr) {
  fs.writeFileSync(FILE, JSON.stringify([...new Set(arr)], null, 2), "utf8");
}

export function loadAutoBlacklist() {
  return new Set(read());
}

export function addToAutoBlacklist(dialog) {
  const byId = (e) => (e && e.id != null ? String(e.id) : "");
  const byTitle = (e) => (e && e.title ? String(e.title) : "");
  const id = byId(dialog.entity);
  const title = byTitle(dialog.entity);
  const current = read();
  if (id && !current.includes(id)) current.push(id);
  if (title && !current.includes(title)) current.push(title);
  write(current);
}
