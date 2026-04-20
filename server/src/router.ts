import { v4 as uuid } from 'uuid';
import type WebSocket from 'ws';
import { getDb } from './db.js';
import { GatewayConnection } from './gateway.js';
import { ChannelCronManager } from './cron.js';
import type { ClientMessage, ServerMessage, Message, Channel, Agent } from './types.js';

/**
 * Router — bridges frontend WebSocket clients with a single shared OpenClaw Gateway connection.
 */
export class Router {
  private clients = new Set<WebSocket>();
  private gateway: GatewayConnection | null = null;
  private agents = new Map<string, Agent>(); // agentId → agent metadata
  private cronManager: ChannelCronManager | null = null;

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`[ws] client connected (total: ${this.clients.size})`);

    // Immediately send current channels and agents so the UI populates on load
    this.handleListChannels(ws);
    this.handleListAgents(ws);

    // Send message history for all active channels
    this.sendAllChannelHistory(ws);
    ws.on('message', (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        console.log(`[ws:in] ${msg.type}`, msg.type === 'send_message' ? `channel=${msg.channelId} content="${msg.content?.slice(0, 80)}"` : '');
        this.handleClientMessage(ws, msg);
      } catch {
        console.warn('[ws:in] invalid JSON from client');
        this.sendTo(ws, { type: 'error', message: 'Invalid JSON' });
      }
    });

    ws.on('close', () => {
      console.log('[ws] client disconnected');
      this.clients.delete(ws);
    });
  }

  /** Register agent metadata (for looking up name/avatar on incoming messages). */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  /** Initialize the single shared gateway connection. */
  initGateway(gatewayUrl: string, authToken: string): void {
    const gw = new GatewayConnection(gatewayUrl, authToken);

    gw.onTyping = (agentId: string, channelId: string) => {
      const agent = this.agents.get(agentId);
      const agentName = agent?.name ?? agentId;
      this.broadcast({ type: 'typing', channelId, agentId, agentName });
    };

    gw.onMessage = (agentId: string, channelId: string, content: string) => {
      if (!content) return;

      // Filter OpenClaw protocol tokens — these are not real messages
      const trimmed = content.trim();
      if (trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK' || trimmed === 'NO') {
        console.log(`[msg] agent=${agentId} channel=${channelId} silent (${trimmed}), not broadcasting`);
        return;
      }

      const agent = this.agents.get(agentId);
      const senderName = agent?.name ?? agentId;

      console.log(`[msg] agent=${agentId} channel=${channelId} replied: "${content.slice(0, 120)}${content.length > 120 ? '...' : ''}"`);

      const msg = this.storeMessage(channelId, agentId, senderName, 'assistant', content);
      this.broadcast({ type: 'message', channelId, message: msg });
    };

    gw.onStatusChange = (status) => {
      // Update all agents' status in DB
      const db = getDb();
      for (const [agentId, agent] of this.agents) {
        agent.status = status;
        db.prepare('UPDATE agents SET status = ? WHERE id = ?').run(status, agentId);
      }
    };

    this.gateway = gw;
    gw.connect();
  }

  /** Initialize the cron manager — call after gateway is ready. */
  initCron(): void {
    if (!this.gateway) {
      console.warn('[cron] cannot init: no gateway');
      return;
    }

    this.cronManager = new ChannelCronManager(
      (content, channelId, agentId) => this.gateway!.sendChat(content, channelId, agentId),
      this.agents,
    );

    this.cronManager.syncAllFromDb();
    console.log('[cron] manager initialized');
  }

  private handleClientMessage(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'send_message':
        this.handleSendMessage(msg.channelId, msg.content);
        break;
      case 'list_channels':
        this.handleListChannels(ws);
        break;
      case 'list_agents':
        this.handleListAgents(ws);
        break;
      case 'create_channel':
        this.handleCreateChannel(ws, msg.name, msg.agents, msg.metadata);
        break;
      case 'update_channel':
        this.handleUpdateChannel(msg.channelId, msg.agents);
        break;
      case 'update_channel_meta':
        this.handleUpdateChannelMeta(msg.channelId, msg.metadata);
        break;
      case 'register_agent':
        this.handleRegisterAgent(ws, msg.agent);
        break;
      case 'update_agent':
        this.handleUpdateAgent(ws, msg.id, msg.updates);
        break;
      case 'remove_agent':
        this.handleRemoveAgent(ws, msg.id);
        break;
      case 'delete_channel':
        this.handleDeleteChannel(msg.channelId);
        break;
      case 'archive_channel':
        this.handleArchiveChannel(msg.channelId);
        break;
      case 'rename_channel':
        this.handleRenameChannel(msg.channelId, msg.name);
        break;
      default:
        this.sendTo(ws, { type: 'error', message: 'Unknown message type' });
    }
  }

  private handleSendMessage(channelId: string, content: string): void {
    // Check for @urgent prefix
    const urgentPattern = /^@urgent\s+/i;
    const isUrgent = urgentPattern.test(content);
    const messageContent = isUrgent ? content.replace(urgentPattern, '') : content;

    if (isUrgent) {
      console.log(`[msg] URGENT message in channel=${channelId}`);
    }

    // Store human message
    const msg = this.storeMessage(channelId, 'user', 'You', 'user', content, isUrgent);
    console.log(`[msg] user → channel=${channelId}: "${content.slice(0, 80)}"`);
    this.broadcast({ type: 'message', channelId, message: msg });

    // Skip forwarding to gateway if channel is archived (still stored for history)
    const channelRow = getDb().prepare('SELECT status FROM channels WHERE id = ?').get(channelId) as any;
    if (channelRow?.status === 'archived') {
      console.log(`[msg] channel=${channelId} is archived, skipping gateway forward`);
      return;
    }

    if (!this.gateway) {
      console.warn(`[msg] no gateway connection`);
      return;
    }

    // For urgent messages: prepend channel guidelines to give agent context
    let sendContent = content;
    if (isUrgent) {
      const db = getDb();
      const row = db.prepare('SELECT guidelines FROM channels WHERE id = ?').get(channelId) as any;
      if (row?.guidelines) {
        sendContent = `[URGENT — Channel Guidelines]\n${row.guidelines}\n\n[Urgent Message]\n${messageContent}`;
      }

      // Reset cron timer so the next cron doesn't fire too soon
      if (this.cronManager) {
        this.cronManager.resetTimer(channelId);
      }
    }

    // Parse @mentions from message (case-insensitive)
    const mentionPattern = /@(\w[\w-]*)/g;
    const mentions = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = mentionPattern.exec(content)) !== null) {
      const name = match[1].toLowerCase();
      if (name === 'urgent') continue;
      mentions.add(name);
    }

    // Forward to agents based on requireMention rules
    const db = getDb();
    const channelAgents = db.prepare(
      'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
    ).all(channelId) as { agent_id: string; require_mention: number }[];

    for (const { agent_id, require_mention } of channelAgents) {
      const agent = this.agents.get(agent_id);
      const agentName = agent?.name?.toLowerCase() ?? '';
      const mentioned = mentions.has(agent_id.toLowerCase()) || mentions.has(agentName);

      if (require_mention && !mentioned) {
        console.log(`[msg] skipping agent=${agent_id} channel=${channelId} (requireMention=true, not mentioned)`);
        continue;
      }

      if (require_mention && mentioned) {
        console.log(`[msg] forwarding to agent=${agent_id} channel=${channelId} (mentioned)`);
      } else {
        console.log(`[msg] forwarding to agent=${agent_id} channel=${channelId} (requireMention=false, sees all)`);
      }

      this.gateway.sendChat(sendContent, channelId, agent_id);
    }
  }

  private handleDeleteChannel(channelId: string): void {
    const db = getDb();

    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    if (!row) return;

    // Cascade delete related data
    db.prepare('DELETE FROM channel_agents WHERE channel_id = ?').run(channelId);
    db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);
    db.prepare('DELETE FROM cron_executions WHERE channel_id = ?').run(channelId);

    // Stop cron
    if (this.cronManager) {
      this.cronManager.stopChannel(channelId);
    }

    // Delete channel row
    db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);

    this.broadcast({ type: 'channel_deleted', channelId });
  }

  private handleArchiveChannel(channelId: string): void {
    const db = getDb();

    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    if (!row) return;

    const newStatus = row.status === 'archived' ? 'active' : 'archived';
    db.prepare('UPDATE channels SET status = ? WHERE id = ?').run(newStatus, channelId);

    if (newStatus === 'archived' && this.cronManager) {
      this.cronManager.stopChannel(channelId);
    }

    if (newStatus === 'active' && this.cronManager) {
      // Re-sync cron if channel has cron settings
      const updated = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
      if (updated.cron_enabled && updated.cron_schedule) {
        const agents = db.prepare(
          'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
        ).all(channelId) as { agent_id: string; require_mention: number }[];
        const channel: Channel = {
          id: updated.id, name: updated.name,
          agents: agents.map(a => a.agent_id),
          agentConfigs: agents.map(a => ({ id: a.agent_id, requireMention: !!a.require_mention })),
          createdAt: updated.created_at, status: updated.status,
          type: updated.type ?? 'project', positioning: updated.positioning ?? '',
          guidelines: updated.guidelines ?? '',
          cronSchedule: updated.cron_schedule ?? null,
          cronEnabled: !!updated.cron_enabled,
        };
        this.cronManager.syncChannel(channel);
      }
    }

    // Broadcast channel_updated with the full channel
    const updated = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    const agents = db.prepare(
      'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
    ).all(channelId) as { agent_id: string; require_mention: number }[];
    const channel: Channel = {
      id: updated.id, name: updated.name,
      agents: agents.map(a => a.agent_id),
      agentConfigs: agents.map(a => ({ id: a.agent_id, requireMention: !!a.require_mention })),
      createdAt: updated.created_at, status: updated.status,
      type: updated.type ?? 'project', positioning: updated.positioning ?? '',
      guidelines: updated.guidelines ?? '',
      cronSchedule: updated.cron_schedule ?? null,
      cronEnabled: !!updated.cron_enabled,
    };
    this.broadcast({ type: 'channel_updated', channel });
  }

  private handleRenameChannel(channelId: string, name: string): void {
    const db = getDb();

    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    if (!row) return;

    db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(name, channelId);

    // Broadcast channel_updated
    const agents = db.prepare(
      'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
    ).all(channelId) as { agent_id: string; require_mention: number }[];
    const channel: Channel = {
      id: row.id, name,
      agents: agents.map(a => a.agent_id),
      agentConfigs: agents.map(a => ({ id: a.agent_id, requireMention: !!a.require_mention })),
      createdAt: row.created_at, status: row.status,
      type: row.type ?? 'project', positioning: row.positioning ?? '',
      guidelines: row.guidelines ?? '',
      cronSchedule: row.cron_schedule ?? null,
      cronEnabled: !!row.cron_enabled,
    };
    this.broadcast({ type: 'channel_updated', channel });
  }

  private handleListChannels(ws: WebSocket): void {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM channels').all() as any[];
    const channels: Channel[] = rows.map((r) => {
      const agents = db.prepare(
        'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
      ).all(r.id) as { agent_id: string; require_mention: number }[];

      return {
        id: r.id,
        name: r.name,
        agents: agents.map((a) => a.agent_id),
        agentConfigs: agents.map((a) => ({ id: a.agent_id, requireMention: !!a.require_mention })),
        createdAt: r.created_at,
        status: r.status,
        type: r.type ?? 'project',
        positioning: r.positioning ?? '',
        guidelines: r.guidelines ?? '',
        cronSchedule: r.cron_schedule ?? null,
        cronEnabled: !!r.cron_enabled,
      };
    });
    this.sendTo(ws, { type: 'channel_list', channels });
  }

  private handleListAgents(ws: WebSocket): void {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM agents').all() as any[];
    const agents: Agent[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      avatar: r.avatar,
      status: r.status as Agent['status'],
    }));
    this.sendTo(ws, { type: 'agent_list', agents });
  }

  private handleCreateChannel(
    _ws: WebSocket,
    name: string,
    agents: { id: string; requireMention: boolean }[],
    metadata?: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'cronSchedule' | 'cronEnabled'>>,
  ): void {
    const db = getDb();
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const now = new Date().toISOString();

    const channelType = metadata?.type ?? 'project';
    const positioning = metadata?.positioning ?? '';
    const guidelines = metadata?.guidelines ?? '';
    const cronSchedule = metadata?.cronSchedule ?? null;
    const cronEnabled = metadata?.cronEnabled ? 1 : 0;

    db.prepare(
      'INSERT INTO channels (id, name, created_at, type, positioning, guidelines, cron_schedule, cron_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name, now, channelType, positioning, guidelines, cronSchedule, cronEnabled);

    for (const agent of agents) {
      db.prepare(
        'INSERT OR IGNORE INTO channel_agents (channel_id, agent_id, require_mention) VALUES (?, ?, ?)'
      ).run(id, agent.id, agent.requireMention ? 1 : 0);
    }

    const agentIds = agents.map(a => a.id);
    const agentConfigs = agents.map(a => ({ id: a.id, requireMention: a.requireMention }));
    const channel: Channel = {
      id, name, agents: agentIds, agentConfigs, createdAt: now, status: 'active',
      type: channelType, positioning, guidelines, cronSchedule,
      cronEnabled: !!cronEnabled,
    };
    this.broadcast({ type: 'channel_created', channel });
  }

  private handleUpdateChannel(channelId: string, agents: { id: string; requireMention: boolean }[]): void {
    const db = getDb();

    // Delete all existing channel_agents for this channel
    db.prepare('DELETE FROM channel_agents WHERE channel_id = ?').run(channelId);

    // Re-insert with new agent list
    for (const agent of agents) {
      db.prepare(
        'INSERT INTO channel_agents (channel_id, agent_id, require_mention) VALUES (?, ?, ?)'
      ).run(channelId, agent.id, agent.requireMention ? 1 : 0);
    }

    // Fetch the updated channel
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    if (!row) return;

    const agentIds = agents.map(a => a.id);
    const agentConfigs = agents.map(a => ({ id: a.id, requireMention: a.requireMention }));
    const channel: Channel = {
      id: row.id, name: row.name, agents: agentIds, agentConfigs, createdAt: row.created_at, status: row.status,
      type: row.type ?? 'project', positioning: row.positioning ?? '', guidelines: row.guidelines ?? '',
      cronSchedule: row.cron_schedule ?? null, cronEnabled: !!row.cron_enabled,
    };
    this.broadcast({ type: 'channel_updated', channel });
  }

  private handleUpdateChannelMeta(
    channelId: string,
    metadata: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'cronSchedule' | 'cronEnabled'>>,
  ): void {
    const db = getDb();
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    if (!row) return;

    const updates: string[] = [];
    const values: any[] = [];

    if (metadata.type !== undefined) { updates.push('type = ?'); values.push(metadata.type); }
    if (metadata.positioning !== undefined) { updates.push('positioning = ?'); values.push(metadata.positioning); }
    if (metadata.guidelines !== undefined) { updates.push('guidelines = ?'); values.push(metadata.guidelines); }
    if (metadata.cronSchedule !== undefined) { updates.push('cron_schedule = ?'); values.push(metadata.cronSchedule); }
    if (metadata.cronEnabled !== undefined) { updates.push('cron_enabled = ?'); values.push(metadata.cronEnabled ? 1 : 0); }

    if (updates.length === 0) return;

    values.push(channelId);
    db.prepare(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Re-fetch for broadcast
    const updated = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    const agents = db.prepare(
      'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
    ).all(channelId) as { agent_id: string; require_mention: number }[];

    const channel: Channel = {
      id: updated.id, name: updated.name,
      agents: agents.map(a => a.agent_id),
      agentConfigs: agents.map(a => ({ id: a.agent_id, requireMention: !!a.require_mention })),
      createdAt: updated.created_at, status: updated.status,
      type: updated.type ?? 'project', positioning: updated.positioning ?? '',
      guidelines: updated.guidelines ?? '',
      cronSchedule: updated.cron_schedule ?? null,
      cronEnabled: !!updated.cron_enabled,
    };
    this.broadcast({ type: 'channel_meta_updated', channel });

    // Sync cron schedule if cron settings changed
    if (this.cronManager && (metadata.cronSchedule !== undefined || metadata.cronEnabled !== undefined)) {
      this.cronManager.syncChannel(channel);
    }
  }

  private sendAllChannelHistory(ws: WebSocket): void {
    const db = getDb();
    const channels = db.prepare('SELECT id FROM channels').all() as { id: string }[];

    for (const { id: channelId } of channels) {
      const rows = db.prepare(
        'SELECT * FROM messages WHERE channel_id = ? ORDER BY timestamp ASC LIMIT 200'
      ).all(channelId) as any[];

      for (const r of rows) {
        const msg: Message = {
          id: r.id,
          channelId: r.channel_id,
          senderId: r.sender_id,
          senderName: r.sender_name,
          role: r.role,
          content: r.content,
          timestamp: r.timestamp,
          isUrgent: !!r.is_urgent,
        };
        this.sendTo(ws, { type: 'message', channelId, message: msg });
      }
    }
  }

  private storeMessage(
    channelId: string, senderId: string, senderName: string,
    role: 'user' | 'assistant', content: string, isUrgent = false
  ): Message {
    const db = getDb();
    const id = uuid();
    const timestamp = new Date().toISOString();

    db.prepare(
      'INSERT INTO messages (id, channel_id, sender_id, sender_name, role, content, timestamp, is_urgent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, channelId, senderId, senderName, role, content, timestamp, isUrgent ? 1 : 0);

    return { id, channelId, senderId, senderName, role, content, timestamp, isUrgent };
  }

  // --- Runtime agent management ---

  private handleRegisterAgent(ws: WebSocket, agentData: { id: string; name: string; avatar?: string }): void {
    const db = getDb();

    // Validate unique ID
    const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(agentData.id);
    if (existing || this.agents.has(agentData.id)) {
      this.sendTo(ws, { type: 'error', message: `Agent with id '${agentData.id}' already exists` });
      return;
    }

    const agent: Agent = {
      id: agentData.id,
      name: agentData.name,
      avatar: agentData.avatar,
      status: 'offline',
    };

    db.prepare('INSERT INTO agents (id, name, avatar, status) VALUES (?, ?, ?, ?)').run(
      agent.id, agent.name, agent.avatar ?? null, agent.status,
    );
    this.agents.set(agent.id, agent);

    this.broadcast({ type: 'agent_registered', agent });
  }

  private handleUpdateAgent(ws: WebSocket, id: string, updates: Partial<{ name: string; avatar: string }>): void {
    const db = getDb();

    const agent = this.agents.get(id);
    if (!agent) {
      this.sendTo(ws, { type: 'error', message: `Agent '${id}' not found` });
      return;
    }

    const sqlUpdates: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      agent.name = updates.name;
      sqlUpdates.push('name = ?');
      values.push(updates.name);
    }
    if (updates.avatar !== undefined) {
      agent.avatar = updates.avatar;
      sqlUpdates.push('avatar = ?');
      values.push(updates.avatar);
    }

    if (sqlUpdates.length === 0) return;

    values.push(id);
    db.prepare(`UPDATE agents SET ${sqlUpdates.join(', ')} WHERE id = ?`).run(...values);

    this.broadcast({ type: 'agent_updated', agent });
  }

  private handleRemoveAgent(ws: WebSocket, id: string): void {
    const db = getDb();

    const agent = this.agents.get(id);
    if (!agent) {
      this.sendTo(ws, { type: 'error', message: `Agent '${id}' not found` });
      return;
    }

    // Find channels that will be affected by the removal
    const affectedChannels = db.prepare(
      'SELECT DISTINCT channel_id FROM channel_agents WHERE agent_id = ?'
    ).all(id) as { channel_id: string }[];

    // Cascade: remove from channel_agents
    db.prepare('DELETE FROM channel_agents WHERE agent_id = ?').run(id);

    // Remove the agent itself
    db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    this.agents.delete(id);

    this.broadcast({ type: 'agent_removed', id });

    // Broadcast channel_updated for each affected channel so UIs refresh membership
    for (const { channel_id } of affectedChannels) {
      const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id) as any;
      if (!row) continue;

      const agents = db.prepare(
        'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
      ).all(channel_id) as { agent_id: string; require_mention: number }[];

      const channel: Channel = {
        id: row.id, name: row.name,
        agents: agents.map(a => a.agent_id),
        agentConfigs: agents.map(a => ({ id: a.agent_id, requireMention: !!a.require_mention })),
        createdAt: row.created_at, status: row.status,
        type: row.type ?? 'project', positioning: row.positioning ?? '',
        guidelines: row.guidelines ?? '',
        cronSchedule: row.cron_schedule ?? null,
        cronEnabled: !!row.cron_enabled,
      };
      this.broadcast({ type: 'channel_updated', channel });
    }
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }
}
