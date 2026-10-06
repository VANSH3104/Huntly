import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import path from "node:path";
import fs from "node:fs";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

export function getDatabase(dbPath?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;

  const resolvedPath = dbPath ?? process.env["DATABASE_PATH"] ?? "./agentforge.db";
  const absolutePath = path.resolve(resolvedPath);
  const dir = path.dirname(absolutePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _sqlite = new Database(absolutePath);

  // Enable WAL mode for better performance
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("synchronous = NORMAL");
  _sqlite.pragma("foreign_keys = ON");
  _sqlite.pragma("cache_size = -32000"); // 32MB cache

  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function closeDatabase(): void {
  _sqlite?.close();
  _sqlite = null;
  _db = null;
}

export type DB = ReturnType<typeof getDatabase>;
