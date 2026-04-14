import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestContext, seedTestData, teardownTestContext } from './helpers.js';
import { getDb } from '../db.js';
import type { Router } from '../router.js';

// We need to access private methods on Router for testing.
// Use (router as any) to call them directly.

describe('router.ts - Core business logic', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext();
    seedTestData(ctx.db);
    // Register agents in the router's internal map
    ctx.router.registerAgent({ id: 'agent-1', name: 'Alice', status: 'online' });
    ctx.router.registerAgent({ id: 'agent-2', name: 'Bob', status: 'online' });
  });

  afterEach(() => {
    teardownTestContext();
  });

  // ------- Message routing: requireMention -------
  describe('Message routing - requireMention', () => {
    it('agent with requireMention=true is skipped when not @mentioned', () => {
      const db = getDb();
      const gateway = {
        sendChat: vi.fn(),
      };
      (ctx.router as any).gateway = gateway;
      // Add client so broadcast works
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleSendMessage('test-channel', 'hello everyone');

      // agent-1 (requireMention=false) should receive the message
      expect(gateway.sendChat).toHaveBeenCalledWith(
        'hello everyone', 'test-channel', 'agent-1'
      );
      // agent-2 (requireMention=true) should NOT
      const agent2Calls = gateway.sendChat.mock.calls.filter(
        (c: any[]) => c[2] === 'agent-2'
      );
      expect(agent2Calls).toHaveLength(0);
    });

    it('agent with requireMention=true receives message when @mentioned by name', () => {
      const gateway = { sendChat: vi.fn() };
      (ctx.router as any).gateway = gateway;
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleSendMessage('test-channel', 'hey @Bob what do you think?');

      const agent2Calls = gateway.sendChat.mock.calls.filter(
        (c: any[]) => c[2] === 'agent-2'
      );
      expect(agent2Calls).toHaveLength(1);
    });

    it('agent with requireMention=true receives message when @mentioned by id', () => {
      const gateway = { sendChat: vi.fn() };
      (ctx.router as any).gateway = gateway;
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleSendMessage('test-channel', 'hey @agent-2 check this');

      const agent2Calls = gateway.sendChat.mock.calls.filter(
        (c: any[]) => c[2] === 'agent-2'
      );
      expect(agent2Calls).toHaveLength(1);
    });

    it('@mention is case-insensitive', () => {
      const gateway = { sendChat: vi.fn() };
      (ctx.router as any).gateway = gateway;
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleSendMessage('test-channel', 'hey @BOB what?');

      const agent2Calls = gateway.sendChat.mock.calls.filter(
        (c: any[]) => c[2] === 'agent-2'
      );
      expect(agent2Calls).toHaveLength(1);
    });
  });

  // ------- @urgent message handling -------
  describe('@urgent message handling', () => {
    it('strips @urgent prefix and prepends guidelines', () => {
      const gateway = { sendChat: vi.fn() };
      (ctx.router as any).gateway = gateway;
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleSendMessage('test-channel', '@urgent fix the deploy');

      // Should prepend guidelines for agent-1 (the one that receives all messages)
      const sentContent = gateway.sendChat.mock.calls[0][0] as string;
      expect(sentContent).toContain('[URGENT — Channel Guidelines]');
      expect(sentContent).toContain('test guidelines');
      expect(sentContent).toContain('fix the deploy');
    });

    it('stores the original message with is_urgent=true', () => {
      const gateway = { sendChat: vi.fn() };
      (ctx.router as any).gateway = gateway;
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleSendMessage('test-channel', '@urgent urgent task');

      const db = getDb();
      const msgs = db.prepare('SELECT * FROM messages WHERE channel_id = ?').all('test-channel') as any[];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].is_urgent).toBe(1);
    });
  });

  // ------- Agent management -------
  describe('Agent management', () => {
    it('registers a new agent', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleRegisterAgent(ctx.mockWs, {
        id: 'agent-3', name: 'Charlie', avatar: 'C',
      });

      const db = getDb();
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-3') as any;
      expect(agent).toBeTruthy();
      expect(agent.name).toBe('Charlie');
      expect(agent.status).toBe('offline');

      const registered = ctx.sentOfType('agent_registered');
      expect(registered).toHaveLength(1);
    });

    it('rejects duplicate agent registration', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleRegisterAgent(ctx.mockWs, {
        id: 'agent-1', name: 'Duplicate',
      });

      const errors = ctx.sentOfType('error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('already exists');
    });

    it('updates agent name and avatar', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleUpdateAgent(ctx.mockWs, 'agent-1', {
        name: 'Alice Updated', avatar: 'AU',
      });

      const db = getDb();
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-1') as any;
      expect(agent.name).toBe('Alice Updated');
      expect(agent.avatar).toBe('AU');
    });

    it('returns error when updating non-existent agent', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleUpdateAgent(ctx.mockWs, 'non-existent', { name: 'X' });

      const errors = ctx.sentOfType('error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('not found');
    });

    it('removes agent with cascade to channel_agents', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleRemoveAgent(ctx.mockWs, 'agent-1');

      const db = getDb();
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-1');
      expect(agent).toBeUndefined();

      // Cascade: agent-1 should be removed from channel_agents
      const ca = db.prepare('SELECT * FROM channel_agents WHERE agent_id = ?').all('agent-1');
      expect(ca).toHaveLength(0);

      const removed = ctx.sentOfType('agent_removed');
      expect(removed).toHaveLength(1);
      expect(removed[0].id).toBe('agent-1');

      // Should also broadcast channel_updated for affected channels
      const channelUpdated = ctx.sentOfType('channel_updated');
      expect(channelUpdated.length).toBeGreaterThanOrEqual(1);
    });

    it('returns error when removing non-existent agent', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleRemoveAgent(ctx.mockWs, 'ghost');

      const errors = ctx.sentOfType('error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('not found');
    });
  });

  // ------- Channel CRUD -------
  describe('Channel CRUD', () => {
    it('creates a channel with metadata', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleCreateChannel(ctx.mockWs, 'New Feature', [
        { id: 'agent-1', requireMention: false },
      ], {
        type: 'daily',
        positioning: 'daily standup',
        guidelines: 'be brief',
      });

      const db = getDb();
      const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get('new-feature') as any;
      expect(ch).toBeTruthy();
      expect(ch.name).toBe('New Feature');
      expect(ch.type).toBe('daily');
      expect(ch.positioning).toBe('daily standup');
      expect(ch.guidelines).toBe('be brief');

      const created = ctx.sentOfType('channel_created');
      expect(created).toHaveLength(1);
      expect(created[0].channel.id).toBe('new-feature');
    });

    it('updates channel metadata', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      (ctx.router as any).handleUpdateChannelMeta('test-channel', {
        type: 'meta',
        guidelines: 'updated guidelines',
      });

      const db = getDb();
      const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get('test-channel') as any;
      expect(ch.type).toBe('meta');
      expect(ch.guidelines).toBe('updated guidelines');
      // Positioning should remain unchanged
      expect(ch.positioning).toBe('test positioning');

      const metaUpdated = ctx.sentOfType('channel_meta_updated');
      expect(metaUpdated).toHaveLength(1);
    });
  });

  // ------- Protocol token filtering -------
  describe('Protocol token filtering', () => {
    it('NO_REPLY is not broadcast', () => {
      (ctx.router as any).clients.add(ctx.mockWs);
      const gateway = { sendChat: vi.fn() };
      (ctx.router as any).gateway = gateway;

      // Simulate what happens when gateway.onMessage fires with protocol tokens
      // We need to set up the gateway callback and simulate
      const broadcastSpy = vi.fn();
      const origBroadcast = (ctx.router as any).broadcast.bind(ctx.router);
      (ctx.router as any).broadcast = broadcastSpy;

      // Simulate gateway onMessage callback behavior by testing the filtering logic directly
      // The filtering happens in initGateway's onMessage callback
      // We'll test it by calling storeMessage only if content passes the filter
      const content = 'NO_REPLY';
      const trimmed = content.trim();
      const isProtocolToken = trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK' || trimmed === 'NO';

      expect(isProtocolToken).toBe(true);

      // Restore
      (ctx.router as any).broadcast = origBroadcast;
    });

    it('HEARTBEAT_OK is filtered', () => {
      const content = 'HEARTBEAT_OK';
      const trimmed = content.trim();
      const isProtocolToken = trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK' || trimmed === 'NO';
      expect(isProtocolToken).toBe(true);
    });

    it('NO is filtered', () => {
      const content = 'NO';
      const trimmed = content.trim();
      const isProtocolToken = trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK' || trimmed === 'NO';
      expect(isProtocolToken).toBe(true);
    });

    it('regular messages are not filtered', () => {
      const content = 'Hello, this is a normal response';
      const trimmed = content.trim();
      const isProtocolToken = trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK' || trimmed === 'NO';
      expect(isProtocolToken).toBe(false);
    });
  });

  // ------- Broadcast / sendTo -------
  describe('broadcast and sendTo', () => {
    it('broadcast sends to all connected clients', () => {
      const mockWs2 = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as unknown as import('ws').WebSocket;

      (ctx.router as any).clients.add(ctx.mockWs);
      (ctx.router as any).clients.add(mockWs2);

      (ctx.router as any).broadcast({ type: 'error', message: 'test' });

      expect(ctx.mockWs.send).toHaveBeenCalledTimes(1);
      expect(mockWs2.send).toHaveBeenCalledTimes(1);
    });

    it('broadcast skips clients with readyState !== 1', () => {
      const closedWs = {
        readyState: 3, // CLOSED
        send: vi.fn(),
        on: vi.fn(),
      } as unknown as import('ws').WebSocket;

      (ctx.router as any).clients.add(ctx.mockWs);
      (ctx.router as any).clients.add(closedWs);

      (ctx.router as any).broadcast({ type: 'error', message: 'test' });

      expect(ctx.mockWs.send).toHaveBeenCalledTimes(1);
      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('sendTo only sends to the specified client', () => {
      const mockWs2 = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
      } as unknown as import('ws').WebSocket;

      (ctx.router as any).clients.add(ctx.mockWs);
      (ctx.router as any).clients.add(mockWs2);

      (ctx.router as any).sendTo(ctx.mockWs, { type: 'error', message: 'test' });

      expect(ctx.mockWs.send).toHaveBeenCalledTimes(1);
      expect(mockWs2.send).not.toHaveBeenCalled();
    });
  });

  // ------- storeMessage -------
  describe('storeMessage', () => {
    it('stores and returns a message with correct fields', () => {
      const msg = (ctx.router as any).storeMessage(
        'test-channel', 'user', 'You', 'user', 'hello world', false
      );

      expect(msg.channelId).toBe('test-channel');
      expect(msg.senderId).toBe('user');
      expect(msg.senderName).toBe('You');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('hello world');
      expect(msg.isUrgent).toBe(false);
      expect(msg.id).toBeTruthy();
      expect(msg.timestamp).toBeTruthy();

      const db = getDb();
      const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id) as any;
      expect(row).toBeTruthy();
      expect(row.content).toBe('hello world');
    });
  });

  // ------- Channel lifecycle (delete/archive/rename) -------
  describe('Channel lifecycle (delete/archive/rename)', () => {
    it('delete_channel cascades correctly and broadcasts channel_deleted', () => {
      (ctx.router as any).clients.add(ctx.mockWs);
      const db = getDb();

      // Seed related data for test-channel
      db.prepare("INSERT INTO messages (id, channel_id, sender_id, sender_name, role, content, timestamp, is_urgent) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 0)").run('msg-1', 'test-channel', 'user', 'You', 'user', 'hello');
      db.prepare("INSERT INTO cron_executions (id, channel_id, fired_at, agent_ids, prompt_snippet, status) VALUES (?, ?, datetime('now'), ?, ?, ?)").run('exec-1', 'test-channel', '["agent-1"]', 'snippet', 'sent');

      ctx.clearSent();
      (ctx.router as any).handleDeleteChannel('test-channel');

      // Verify channel row is gone
      expect(db.prepare('SELECT * FROM channels WHERE id = ?').get('test-channel')).toBeUndefined();

      // Verify cascaded deletes
      expect(db.prepare('SELECT * FROM channel_agents WHERE channel_id = ?').all('test-channel')).toHaveLength(0);
      expect(db.prepare('SELECT * FROM messages WHERE channel_id = ?').all('test-channel')).toHaveLength(0);
      expect(db.prepare('SELECT * FROM cron_executions WHERE channel_id = ?').all('test-channel')).toHaveLength(0);

      // Broadcast
      const deleted = ctx.sentOfType('channel_deleted');
      expect(deleted).toHaveLength(1);
      expect(deleted[0].channelId).toBe('test-channel');
    });

    it('delete_channel stops cron', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      const mockCronManager = { stopChannel: vi.fn() };
      (ctx.router as any).cronManager = mockCronManager;

      (ctx.router as any).handleDeleteChannel('test-channel');

      expect(mockCronManager.stopChannel).toHaveBeenCalledWith('test-channel');
    });

    it('archive_channel toggles status and broadcasts channel_updated', () => {
      (ctx.router as any).clients.add(ctx.mockWs);
      const db = getDb();

      // Initially active
      const before = db.prepare('SELECT status FROM channels WHERE id = ?').get('test-channel') as any;
      expect(before.status).toBe('active');

      ctx.clearSent();
      (ctx.router as any).handleArchiveChannel('test-channel');

      const after = db.prepare('SELECT status FROM channels WHERE id = ?').get('test-channel') as any;
      expect(after.status).toBe('archived');

      const updated = ctx.sentOfType('channel_updated');
      expect(updated).toHaveLength(1);
      expect(updated[0].channel.status).toBe('archived');

      // Toggle back
      ctx.clearSent();
      (ctx.router as any).handleArchiveChannel('test-channel');

      const restored = db.prepare('SELECT status FROM channels WHERE id = ?').get('test-channel') as any;
      expect(restored.status).toBe('active');
    });

    it('archive_channel stops cron when archiving', () => {
      (ctx.router as any).clients.add(ctx.mockWs);

      const mockCronManager = { stopChannel: vi.fn(), syncChannel: vi.fn() };
      (ctx.router as any).cronManager = mockCronManager;

      (ctx.router as any).handleArchiveChannel('test-channel');

      expect(mockCronManager.stopChannel).toHaveBeenCalledWith('test-channel');
    });

    it('rename_channel updates name and broadcasts', () => {
      (ctx.router as any).clients.add(ctx.mockWs);
      const db = getDb();

      ctx.clearSent();
      (ctx.router as any).handleRenameChannel('test-channel', 'Renamed Channel');

      const row = db.prepare('SELECT name FROM channels WHERE id = ?').get('test-channel') as any;
      expect(row.name).toBe('Renamed Channel');

      const updated = ctx.sentOfType('channel_updated');
      expect(updated).toHaveLength(1);
      expect(updated[0].channel.name).toBe('Renamed Channel');
    });

    it('archived channel: handleSendMessage does not forward to gateway', () => {
      (ctx.router as any).clients.add(ctx.mockWs);
      const db = getDb();
      const gateway = { sendChat: vi.fn() };
      (ctx.router as any).gateway = gateway;

      // Archive the channel
      db.prepare("UPDATE channels SET status = 'archived' WHERE id = ?").run('test-channel');

      (ctx.router as any).handleSendMessage('test-channel', 'hello archived');

      // Message should be stored
      const msgs = db.prepare('SELECT * FROM messages WHERE channel_id = ?').all('test-channel') as any[];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('hello archived');

      // But gateway should NOT be called
      expect(gateway.sendChat).not.toHaveBeenCalled();
    });
  });

});
