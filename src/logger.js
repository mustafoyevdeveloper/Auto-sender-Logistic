import fs from "fs";
import path from "path";

/**
 * Log: faylga yozish (agar logFilePath berilsa) va konsolga chiqarish.
 * logFilePath = false yoki "" bo'lsa — faqat konsolga yozadi, faylga saqlamaydi.
 */
export function createLogger(logFilePath) {
  const file = logFilePath ? path.resolve(process.cwd(), logFilePath) : null;

  function formatLine(level, groupName, status, detail = "") {
    const ts = new Date().toISOString();
    const parts = [ts, level, groupName ?? "-", status, detail].filter(Boolean);
    return parts.join(" | ") + "\n";
  }

  function writeToFile(line) {
    if (file) fs.appendFileSync(file, line);
  }

  return {
    success(groupName, detail = "") {
      const line = formatLine("INFO", groupName, "success", detail);
      writeToFile(line);
      console.log("[OK]", groupName, detail || "");
    },
    error(groupName, detail = "") {
      const line = formatLine("ERROR", groupName, "error", detail);
      writeToFile(line);
      console.error("[ERR]", groupName, detail || "");
    },
    info(msg) {
      const line = formatLine("INFO", "-", "-", msg);
      writeToFile(line);
      console.log("[INFO]", msg);
    },
    getFilePath: () => file,
  };
}
