import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import * as schema from './schema';

// Default database path: ~/.cc-manager/sqlite.db
const defaultDbPath = join(homedir(), '.cc-manager', 'sqlite.db');
const dbPath = process.env.DATABASE_PATH || defaultDbPath;

// Ensure directory exists
mkdirSync(dirname(dbPath), { recursive: true });

// Initialize SQLite database using bun:sqlite
const sqlite = new Database(dbPath);

// Create Drizzle ORM instance with schema
export const db = drizzle({ client: sqlite, schema });
