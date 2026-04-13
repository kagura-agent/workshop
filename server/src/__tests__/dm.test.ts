import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, seedTestData, teardownTestContext } from './helpers.js';
import { getDb } from '../db.js';

describe('Direct Messages', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext();
    seedTestData(ctx.db);
    ctx.router.registerAgent({ id: 'agent-1', name: 'Alice', status: 'online' });
    ctx.router.registerAgent({ id: 'agent-2', name: 'Bob', status: 'online' });
    // Add client so broadcast works
    (ctx.router as any).clients.add(ctx.mockWs);
  });

  afterEach(() => {
    teardownTestContext();
  });

  describe('send_dm', () => {
    it('stores a DM in the database and broadcasts dm_message', () => {
      ctx.clearSent();
      (ctx.router as any).handleSendDm(ctx.mockWs, 'agent-1', 'Hello Alice!');

      // Check database
      const db = getDb();
      const rows = db.prepare('SELECT * FROM direct_messages').all() as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].from_id).toBe('user');
      expect(rows[0].to_id).toBe('agent-1');
      expect(rows[0].content).toBe('Hello Alice!');
      expect(rows[0].read).toBe(0);

      // Check broadcast
      const dmMessages = ctx.sentOfType('dm_message');
      expect(dmMessages).toHaveLength(1);
      expect(dmMessages[0].message.fromId).toBe('user');
      expect(dmMessages[0].message.toId).toBe('agent-1');
      expect(dmMessages[0].message.content).toBe('Hello Alice!');
      expect(dmMessages[0].message.read).toBe(false);
    });

    it('stores multiple DMs to different agents', () => {
      (ctx.router as any).handleSendDm(ctx.mockWs, 'agent-1', 'Hello Alice!');
      (ctx.router as any).handleSendDm(ctx.mockWs, 'agent-2', 'Hello Bob!');

      const db = getDb();
      const rows = db.prepare('SELECT * FROM direct_messages ORDER BY timestamp ASC').all() as any[];
      expect(rows).toHaveLength(2);
      expect(rows[0].to_id).toBe('agent-1');
      expect(rows[1].to_id).toBe('agent-2');
    });
  });

  describe('list_dms', () => {
    it('returns messages between user and a specific agent', () => {
      // Insert some DMs
      const db = getDb();
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-1', 'user', 'agent-1', 'Hello', '2024-01-01T00:00:00Z', 0);
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-2', 'agent-1', 'user', 'Hi back', '2024-01-01T00:01:00Z', 0);
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-3', 'user', 'agent-2', 'Different agent', '2024-01-01T00:02:00Z', 0);

      ctx.clearSent();
      (ctx.router as any).handleListDms(ctx.mockWs, 'agent-1');

      const dmList = ctx.sentOfType('dm_list');
      expect(dmList).toHaveLength(1);
      expect(dmList[0].withId).toBe('agent-1');
      expect(dmList[0].messages).toHaveLength(2);
      // Should be ordered by timestamp ASC
      expect(dmList[0].messages[0].content).toBe('Hello');
      expect(dmList[0].messages[1].content).toBe('Hi back');
    });

    it('respects limit parameter', () => {
      const db = getDb();
      for (let i = 0; i < 5; i++) {
        db.prepare(
          "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(`dm-${i}`, 'user', 'agent-1', `msg ${i}`, `2024-01-01T00:0${i}:00Z`, 0);
      }

      ctx.clearSent();
      (ctx.router as any).handleListDms(ctx.mockWs, 'agent-1', 2);

      const dmList = ctx.sentOfType('dm_list');
      expect(dmList[0].messages).toHaveLength(2);
    });

    it('respects before parameter for pagination', () => {
      const db = getDb();
      for (let i = 0; i < 5; i++) {
        db.prepare(
          "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(`dm-${i}`, 'user', 'agent-1', `msg ${i}`, `2024-01-01T00:0${i}:00Z`, 0);
      }

      ctx.clearSent();
      (ctx.router as any).handleListDms(ctx.mockWs, 'agent-1', 100, '2024-01-01T00:03:00Z');

      const dmList = ctx.sentOfType('dm_list');
      // Should only include messages before the specified timestamp
      expect(dmList[0].messages).toHaveLength(3);
      expect(dmList[0].messages[2].content).toBe('msg 2');
    });
  });

  describe('dm_mark_read', () => {
    it('marks incoming DMs as read', () => {
      const db = getDb();
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-1', 'agent-1', 'user', 'Hello', '2024-01-01T00:00:00Z', 0);
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-2', 'agent-1', 'user', 'Are you there?', '2024-01-01T00:01:00Z', 0);
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-3', 'agent-2', 'user', 'From other agent', '2024-01-01T00:02:00Z', 0);

      ctx.clearSent();
      (ctx.router as any).handleDmMarkRead(ctx.mockWs, 'agent-1');

      // agent-1's messages should be read
      const dm1 = db.prepare('SELECT read FROM direct_messages WHERE id = ?').get('dm-1') as any;
      const dm2 = db.prepare('SELECT read FROM direct_messages WHERE id = ?').get('dm-2') as any;
      expect(dm1.read).toBe(1);
      expect(dm2.read).toBe(1);

      // agent-2's message should still be unread
      const dm3 = db.prepare('SELECT read FROM direct_messages WHERE id = ?').get('dm-3') as any;
      expect(dm3.read).toBe(0);
    });

    it('sends updated unread counts', () => {
      const db = getDb();
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-1', 'agent-1', 'user', 'Hello', '2024-01-01T00:00:00Z', 0);
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-2', 'agent-2', 'user', 'Hi', '2024-01-01T00:01:00Z', 0);

      ctx.clearSent();
      (ctx.router as any).handleDmMarkRead(ctx.mockWs, 'agent-1');

      const unread = ctx.sentOfType('dm_unread');
      expect(unread).toHaveLength(1);
      // Only agent-2 should have unread
      expect(unread[0].counts['agent-1']).toBeUndefined();
      expect(unread[0].counts['agent-2']).toBe(1);
    });
  });

  describe('dm_conversations', () => {
    it('lists all DM conversations with last message and unread count', () => {
      const db = getDb();
      // Conversation with agent-1
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-1', 'user', 'agent-1', 'Hello Alice', '2024-01-01T00:00:00Z', 1);
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-2', 'agent-1', 'user', 'Hi there', '2024-01-01T00:01:00Z', 0);
      // Conversation with agent-2
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-3', 'user', 'agent-2', 'Hey Bob', '2024-01-01T00:02:00Z', 1);

      ctx.clearSent();
      (ctx.router as any).handleDmConversations(ctx.mockWs);

      const convos = ctx.sentOfType('dm_conversations');
      expect(convos).toHaveLength(1);
      expect(convos[0].conversations).toHaveLength(2);

      // Ordered by last timestamp DESC
      const first = convos[0].conversations[0];
      expect(first.partnerId).toBe('agent-2');
      expect(first.partnerName).toBe('Bob');
      expect(first.lastMessage).toBe('Hey Bob');
      expect(first.unreadCount).toBe(0);

      const second = convos[0].conversations[1];
      expect(second.partnerId).toBe('agent-1');
      expect(second.partnerName).toBe('Alice');
      expect(second.lastMessage).toBe('Hi there');
      expect(second.unreadCount).toBe(1);
    });

    it('returns empty array when no conversations exist', () => {
      ctx.clearSent();
      (ctx.router as any).handleDmConversations(ctx.mockWs);

      const convos = ctx.sentOfType('dm_conversations');
      expect(convos).toHaveLength(1);
      expect(convos[0].conversations).toHaveLength(0);
    });
  });

  describe('sendDmUnread', () => {
    it('sends unread counts grouped by sender', () => {
      const db = getDb();
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-1', 'agent-1', 'user', 'Hello', '2024-01-01T00:00:00Z', 0);
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-2', 'agent-1', 'user', 'Another', '2024-01-01T00:01:00Z', 0);
      db.prepare(
        "INSERT INTO direct_messages (id, from_id, to_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('dm-3', 'agent-2', 'user', 'From Bob', '2024-01-01T00:02:00Z', 0);

      ctx.clearSent();
      (ctx.router as any).sendDmUnread(ctx.mockWs);

      const unread = ctx.sentOfType('dm_unread');
      expect(unread).toHaveLength(1);
      expect(unread[0].counts['agent-1']).toBe(2);
      expect(unread[0].counts['agent-2']).toBe(1);
    });
  });

  describe('direct_messages table', () => {
    it('exists with correct columns', () => {
      const db = getDb();
      const cols = db.prepare('PRAGMA table_info(direct_messages)').all() as { name: string }[];
      const colNames = cols.map(c => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('from_id');
      expect(colNames).toContain('to_id');
      expect(colNames).toContain('content');
      expect(colNames).toContain('timestamp');
      expect(colNames).toContain('read');
    });
  });
});
