import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, resetDb, getDb } from '../db.js';

describe('db.ts - Schema initialization', () => {
  beforeEach(() => {
    initDb(':memory:');
  });

  afterEach(() => {
    resetDb();
  });

  it('creates all core tables', () => {
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain('agents');
    expect(names).toContain('channels');
    expect(names).toContain('channel_agents');
    expect(names).toContain('messages');
    expect(names).toContain('todo_items');
    expect(names).toContain('todo_history');
    expect(names).toContain('cron_executions');
    expect(names).toContain('north_stars');
    expect(names).toContain('pins');
    expect(names).toContain('patrol_config');
    expect(names).toContain('notifications');
  });

  it('channels table has v0.3 migration columns', () => {
    const db = getDb();
    const cols = db.prepare('PRAGMA table_info(channels)').all() as { name: string }[];
    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('type');
    expect(colNames).toContain('positioning');
    expect(colNames).toContain('guidelines');
    expect(colNames).toContain('north_star');
    expect(colNames).toContain('todo_section');
    expect(colNames).toContain('cron_schedule');
    expect(colNames).toContain('cron_enabled');
  });

  it('messages table has is_urgent column', () => {
    const db = getDb();
    const cols = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('is_urgent');
  });

  it('schema is idempotent (calling initDb twice does not error)', () => {
    // First init already happened in beforeEach
    // Second init should not throw
    expect(() => initDb(':memory:')).not.toThrow();

    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    expect(tables.length).toBeGreaterThan(0);
  });

  it('agents table has correct columns', () => {
    const db = getDb();
    const cols = db.prepare('PRAGMA table_info(agents)').all() as { name: string }[];
    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('avatar');
    expect(colNames).toContain('status');
  });

  it('channel_agents has require_mention column', () => {
    const db = getDb();
    const cols = db.prepare('PRAGMA table_info(channel_agents)').all() as { name: string }[];
    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('channel_id');
    expect(colNames).toContain('agent_id');
    expect(colNames).toContain('require_mention');
  });

  it('todo_items has all expected columns', () => {
    const db = getDb();
    const cols = db.prepare('PRAGMA table_info(todo_items)').all() as { name: string }[];
    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('section');
    expect(colNames).toContain('content');
    expect(colNames).toContain('status');
    expect(colNames).toContain('assigned_channel');
    expect(colNames).toContain('assigned_agent');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
  });

  it('notifications has all expected columns', () => {
    const db = getDb();
    const cols = db.prepare('PRAGMA table_info(notifications)').all() as { name: string }[];
    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('source_channel_id');
    expect(colNames).toContain('target_channel_id');
    expect(colNames).toContain('content');
    expect(colNames).toContain('trigger_type');
    expect(colNames).toContain('todo_item_id');
    expect(colNames).toContain('read');
  });
});
