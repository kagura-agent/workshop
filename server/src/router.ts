import { v4 as uuid } from 'uuid';
import type WebSocket from 'ws';
import { getDb } from './db.js';
import { GatewayConnection } from './gateway.js';
import type { ClientMessage, ServerMessage, Message, Channel, Agent, TodoItem } from './types.js';

/**
 * Router — bridges frontend WebSocket clients with a single shared OpenClaw Gateway connection.
 */
export class Router {
  private clients = new Set<WebSocket>();
  private gateway: GatewayConnection | null = null;
  private agents = new Map<string, Agent>(); // agentId → agent metadata

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`[ws] client connected (total: ${this.clients.size})`);

    // Immediately send current channels and agents so the UI populates on load
    this.handleListChannels(ws);
    this.handleListAgents(ws);
    this.handleTodoList(ws);

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
      case 'todo_list':
        this.handleTodoList(ws);
        break;
      case 'todo_create':
        this.handleTodoCreate(msg.section, msg.content, msg.assignedChannel, msg.assignedAgent);
        break;
      case 'todo_update':
        this.handleTodoUpdate(msg.id, msg.updates);
        break;
      case 'todo_delete':
        this.handleTodoDelete(msg.id);
        break;
      default:
        this.sendTo(ws, { type: 'error', message: 'Unknown message type' });
    }
  }

  private handleSendMessage(channelId: string, content: string): void {
    // Store human message
    const msg = this.storeMessage(channelId, 'user', 'You', 'user', content);
    console.log(`[msg] user → channel=${channelId}: "${content.slice(0, 80)}"`);
    this.broadcast({ type: 'message', channelId, message: msg });

    if (!this.gateway) {
      console.warn(`[msg] no gateway connection`);
      return;
    }

    // Parse @mentions from message (case-insensitive)
    const mentionPattern = /@(\w[\w-]*)/g;
    const mentions = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = mentionPattern.exec(content)) !== null) {
      mentions.add(match[1].toLowerCase());
    }

    // Forward to agents based on requireMention rules
    const db = getDb();
    const channelAgents = db.prepare(
      'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
    ).all(channelId) as { agent_id: string; require_mention: number }[];

    const hasMentions = mentions.size > 0;

    for (const { agent_id, require_mention } of channelAgents) {
      const agent = this.agents.get(agent_id);
      const agentName = agent?.name?.toLowerCase() ?? '';
      const mentioned = mentions.has(agent_id.toLowerCase()) || mentions.has(agentName);

      if (require_mention && !mentioned) {
        // Agent requires mention but wasn't mentioned — skip
        console.log(`[msg] skipping agent=${agent_id} channel=${channelId} (requireMention=true, not mentioned)`);
        continue;
      }

      if (require_mention && mentioned) {
        console.log(`[msg] forwarding to agent=${agent_id} channel=${channelId} (mentioned)`);
      } else {
        console.log(`[msg] forwarding to agent=${agent_id} channel=${channelId} (requireMention=false, sees all)`);
      }

      this.gateway.sendChat(content, channelId, agent_id);
    }
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
        northStar: r.north_star ?? '',
        todoSection: r.todo_section ?? null,
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
    metadata?: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'northStar' | 'todoSection' | 'cronSchedule' | 'cronEnabled'>>,
  ): void {
    const db = getDb();
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const now = new Date().toISOString();

    const channelType = metadata?.type ?? 'project';
    const positioning = metadata?.positioning ?? '';
    const guidelines = metadata?.guidelines ?? '';
    const northStar = metadata?.northStar ?? '';
    const todoSection = metadata?.todoSection ?? null;
    const cronSchedule = metadata?.cronSchedule ?? null;
    const cronEnabled = metadata?.cronEnabled ? 1 : 0;

    db.prepare(
      'INSERT INTO channels (id, name, created_at, type, positioning, guidelines, north_star, todo_section, cron_schedule, cron_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name, now, channelType, positioning, guidelines, northStar, todoSection, cronSchedule, cronEnabled);

    for (const agent of agents) {
      db.prepare(
        'INSERT OR IGNORE INTO channel_agents (channel_id, agent_id, require_mention) VALUES (?, ?, ?)'
      ).run(id, agent.id, agent.requireMention ? 1 : 0);
    }

    const agentIds = agents.map(a => a.id);
    const agentConfigs = agents.map(a => ({ id: a.id, requireMention: a.requireMention }));
    const channel: Channel = {
      id, name, agents: agentIds, agentConfigs, createdAt: now, status: 'active',
      type: channelType, positioning, guidelines, northStar, todoSection, cronSchedule,
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
      northStar: row.north_star ?? '', todoSection: row.todo_section ?? null,
      cronSchedule: row.cron_schedule ?? null, cronEnabled: !!row.cron_enabled,
    };
    this.broadcast({ type: 'channel_updated', channel });
  }

  private handleUpdateChannelMeta(
    channelId: string,
    metadata: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'northStar' | 'todoSection' | 'cronSchedule' | 'cronEnabled'>>,
  ): void {
    const db = getDb();
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    if (!row) return;

    const updates: string[] = [];
    const values: any[] = [];

    if (metadata.type !== undefined) { updates.push('type = ?'); values.push(metadata.type); }
    if (metadata.positioning !== undefined) { updates.push('positioning = ?'); values.push(metadata.positioning); }
    if (metadata.guidelines !== undefined) { updates.push('guidelines = ?'); values.push(metadata.guidelines); }
    if (metadata.northStar !== undefined) { updates.push('north_star = ?'); values.push(metadata.northStar); }
    if (metadata.todoSection !== undefined) { updates.push('todo_section = ?'); values.push(metadata.todoSection); }
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
      guidelines: updated.guidelines ?? '', northStar: updated.north_star ?? '',
      todoSection: updated.todo_section ?? null, cronSchedule: updated.cron_schedule ?? null,
      cronEnabled: !!updated.cron_enabled,
    };
    this.broadcast({ type: 'channel_meta_updated', channel });
  }

  // --- Todo handlers ---

  private handleTodoList(ws: WebSocket): void {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM todo_items ORDER BY created_at ASC').all() as any[];
    const items: TodoItem[] = rows.map(this.mapTodoRow);
    this.sendTo(ws, { type: 'todo_list', items });
  }

  private handleTodoCreate(section: string, content: string, assignedChannel?: string, assignedAgent?: string): void {
    const db = getDb();
    const id = uuid();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO todo_items (id, section, content, status, assigned_channel, assigned_agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, section, content, 'pending', assignedChannel ?? null, assignedAgent ?? null, now, now);

    const item: TodoItem = { id, section, content, status: 'pending', assignedChannel: assignedChannel ?? null, assignedAgent: assignedAgent ?? null, createdAt: now, updatedAt: now };
    this.broadcast({ type: 'todo_created', item });
  }

  private handleTodoUpdate(id: string, updates: Partial<Pick<TodoItem, 'content' | 'status' | 'section' | 'assignedChannel' | 'assignedAgent'>>): void {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as any;
    if (!existing) return;

    const now = new Date().toISOString();
    const sqlUpdates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    const fieldMap: Record<string, string> = {
      content: 'content', status: 'status', section: 'section',
      assignedChannel: 'assigned_channel', assignedAgent: 'assigned_agent',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      const val = (updates as any)[key];
      if (val !== undefined) {
        // Write audit trail
        db.prepare(
          'INSERT INTO todo_history (id, todo_id, field, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(uuid(), id, key, String(existing[col] ?? ''), String(val ?? ''), now);
        sqlUpdates.push(`${col} = ?`);
        values.push(val);
      }
    }

    values.push(id);
    db.prepare(`UPDATE todo_items SET ${sqlUpdates.join(', ')} WHERE id = ?`).run(...values);

    const row = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as any;
    this.broadcast({ type: 'todo_updated', item: this.mapTodoRow(row) });
  }

  private handleTodoDelete(id: string): void {
    const db = getDb();
    db.prepare('DELETE FROM todo_history WHERE todo_id = ?').run(id);
    db.prepare('DELETE FROM todo_items WHERE id = ?').run(id);
    this.broadcast({ type: 'todo_deleted', id });
  }

  private mapTodoRow(r: any): TodoItem {
    return {
      id: r.id,
      section: r.section,
      content: r.content,
      status: r.status,
      assignedChannel: r.assigned_channel,
      assignedAgent: r.assigned_agent,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
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
        };
        this.sendTo(ws, { type: 'message', channelId, message: msg });
      }
    }
  }

  private storeMessage(
    channelId: string, senderId: string, senderName: string,
    role: 'user' | 'assistant', content: string
  ): Message {
    const db = getDb();
    const id = uuid();
    const timestamp = new Date().toISOString();

    db.prepare(
      'INSERT INTO messages (id, channel_id, sender_id, sender_name, role, content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, channelId, senderId, senderName, role, content, timestamp);

    return { id, channelId, senderId, senderName, role, content, timestamp };
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
