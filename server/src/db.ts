import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'workshop.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

/**
 * Initialize a database at the given path (or ':memory:' for in-memory).
 * Replaces the singleton so that getDb() returns this instance.
 * Used by tests to avoid touching the production database file.
 */
export function initDb(dbPath: string): Database.Database {
  if (db) {
    db.close();
  }
  db = new Database(dbPath);
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  initSchema();
  return db;
}

/** Reset the singleton (close if open). Used by tests for cleanup. */
export function resetDb(): void {
  if (db) {
    db.close();
    (db as any) = undefined!;
  }
}

/** Check if a column exists in a table using pragma table_info. */
function hasColumn(d: Database.Database, table: string, column: string): boolean {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function initSchema(): void {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      status TEXT NOT NULL DEFAULT 'offline'
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS channel_agents (
      channel_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      require_mention INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (channel_id, agent_id),
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );
  `);

  // v0.3 §1: Channel metadata columns
  const channelMigrations: [string, string][] = [
    ['type', "ALTER TABLE channels ADD COLUMN type TEXT NOT NULL DEFAULT 'project'"],
    ['positioning', "ALTER TABLE channels ADD COLUMN positioning TEXT NOT NULL DEFAULT ''"],
    ['guidelines', "ALTER TABLE channels ADD COLUMN guidelines TEXT NOT NULL DEFAULT ''"],
    ['north_star', "ALTER TABLE channels ADD COLUMN north_star TEXT NOT NULL DEFAULT ''"],
    ['todo_section', 'ALTER TABLE channels ADD COLUMN todo_section TEXT'],
    ['cron_schedule', 'ALTER TABLE channels ADD COLUMN cron_schedule TEXT'],
    ['cron_enabled', 'ALTER TABLE channels ADD COLUMN cron_enabled INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [col, sql] of channelMigrations) {
    if (!hasColumn(d, 'channels', col)) {
      d.exec(sql);
    }
  }

  // v0.3 §7: Todo items table
  d.exec(`
    CREATE TABLE IF NOT EXISTS todo_items (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_channel TEXT,
      assigned_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (assigned_channel) REFERENCES channels(id)
    );

    CREATE TABLE IF NOT EXISTS todo_history (
      id TEXT PRIMARY KEY,
      todo_id TEXT NOT NULL,
      field TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (todo_id) REFERENCES todo_items(id)
    );

    CREATE TABLE IF NOT EXISTS cron_executions (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      fired_at TEXT NOT NULL DEFAULT (datetime('now')),
      agent_ids TEXT NOT NULL DEFAULT '[]',
      prompt_snippet TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );

    CREATE TABLE IF NOT EXISTS north_stars (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'global',
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pins (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );
  `);

  // v0.3 §4: Patrol config
  d.exec(`
    CREATE TABLE IF NOT EXISTS patrol_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      control_channel_id TEXT NOT NULL,
      schedule TEXT NOT NULL DEFAULT '0 */3 * * *',
      enabled INTEGER NOT NULL DEFAULT 0,
      last_patrol_at TEXT,
      channel_filter TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (control_channel_id) REFERENCES channels(id)
    );
  `);

  // v0.3 §5: Notifications
  d.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      source_channel_id TEXT NOT NULL,
      target_channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      todo_item_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (source_channel_id) REFERENCES channels(id),
      FOREIGN KEY (target_channel_id) REFERENCES channels(id)
    );
  `);

  // v0.3 §6: Urgent flag on messages
  if (!hasColumn(d, 'messages', 'is_urgent')) {
    d.exec("ALTER TABLE messages ADD COLUMN is_urgent INTEGER NOT NULL DEFAULT 0");
  }

  // Direct messages
  d.exec(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      read INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_dm_participants ON direct_messages(from_id, to_id);
  `);
}

export function close(): void {
  if (db) {
    db.close();
  }
}
