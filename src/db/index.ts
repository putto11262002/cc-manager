import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

// Initialize SQLite database using bun:sqlite
const sqlite = new Database('sqlite.db');

// Create Drizzle ORM instance with schema
export const db = drizzle({ client: sqlite, schema });
