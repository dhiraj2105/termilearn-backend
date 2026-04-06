import { appendFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

const timestamp = () => new Date().toISOString();
const logDir = process.env.LOG_DIR || path.resolve(process.cwd(), "logs");
const logFile = path.join(logDir, "backend.log");

if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const writeLog = (entry) => {
  try {
    appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
  } catch (err) {
    console.error("[LOGGER] Failed to write log file:", err);
  }
};

const buildLog = (level, args) => {
  const timestampValue = timestamp();
  const messageParts = [];
  const meta = [];

  args.forEach((arg) => {
    if (
      typeof arg === "string" ||
      typeof arg === "number" ||
      typeof arg === "boolean"
    ) {
      messageParts.push(arg);
    } else if (arg instanceof Error) {
      messageParts.push(arg.message);
      meta.push({ name: arg.name, stack: arg.stack });
    } else {
      try {
        meta.push(arg);
      } catch {
        meta.push({ value: String(arg) });
      }
    }
  });

  const entry = {
    timestamp: timestampValue,
    level,
    message: messageParts.join(" "),
    meta: meta.length ? meta : undefined,
  };

  writeLog(entry);
  return entry;
};

export const info = (...args) => {
  const entry = buildLog("INFO", args);
  console.log(`[INFO] [${entry.timestamp}]`, ...args);
};

export const warn = (...args) => {
  const entry = buildLog("WARN", args);
  console.warn(`[WARN] [${entry.timestamp}]`, ...args);
};

export const error = (...args) => {
  const entry = buildLog("ERROR", args);
  console.error(`[ERROR] [${entry.timestamp}]`, ...args);
};

export const debug = (...args) => {
  if (process.env.NODE_ENV !== "production") {
    const entry = buildLog("DEBUG", args);
    console.debug(`[DEBUG] [${entry.timestamp}]`, ...args);
  }
};
