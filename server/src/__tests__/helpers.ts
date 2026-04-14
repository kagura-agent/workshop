import { vi } from 'vitest';
import type Database from 'better-sqlite3';
import { initDb, resetDb, getDb } from '../db.js';
import { Router } from '../router.js';
import type WebSocket from 'ws';

/**
 * Create a fresh in-memory database and Router for each test.
 * Returns the db instance, router, mock ws client, and helpers.
 */
export function createTestContext(): { db: Database.Database; router: Router; mockWs: WebSocket; sent: any[]; lastSent: () => any; sentOfType: (type: string) => any[]; clearSent: () => void } {
  const db = initDb(':memory:');

  // Mock WebSocket client
  const sent: any[] = [];
  const mockWs = {
    readyState: 1, // WebSocket.OPEN
    send: vi.fn((data: string) => {
      sent.push(JSON.parse(data));
    }),
    on: vi.fn(),
  } as unknown as WebSocket;

  const router = new Router();

  return {
    db,
    router,
    mockWs,
    sent,
    /** Get the last message sent to mockWs */
    lastSent: () => sent[sent.length - 1],
    /** Get all sent messages of a given type */
    sentOfType: (type: string) => sent.filter((m) => m.type === type),
    /** Reset sent messages */
    clearSent: () => { sent.length = 0; },
  };
}

/**
 * Seed common test data: agents, channels, channel_agents.
 */
export function seedTestData(db: ReturnType<typeof getDb>) {
  db.prepare('INSERT INTO agents (id, name, avatar, status) VALUES (?, ?, ?, ?)').run(
    'agent-1', 'Alice', null, 'online'
  );
  db.prepare('INSERT INTO agents (id, name, avatar, status) VALUES (?, ?, ?, ?)').run(
    'agent-2', 'Bob', null, 'online'
  );

  db.prepare(
    'INSERT INTO channels (id, name, created_at, type, positioning, guidelines, cron_schedule, cron_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('test-channel', 'Test Channel', new Date().toISOString(), 'project', 'test positioning', 'test guidelines', null, 0);

  db.prepare(
    'INSERT INTO channels (id, name, created_at, type, positioning, guidelines, cron_schedule, cron_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('other-channel', 'Other Channel', new Date().toISOString(), 'daily', '', '', null, 0);

  // agent-1 sees all, agent-2 requires mention
  db.prepare('INSERT INTO channel_agents (channel_id, agent_id, require_mention) VALUES (?, ?, ?)').run(
    'test-channel', 'agent-1', 0
  );
  db.prepare('INSERT INTO channel_agents (channel_id, agent_id, require_mention) VALUES (?, ?, ?)').run(
    'test-channel', 'agent-2', 1
  );
}

export function teardownTestContext() {
  resetDb();
}
