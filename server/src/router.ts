import { v4 as uuid } from 'uuid';
import type WebSocket from 'ws';
import { getDb } from './db.js';
import { GatewayConnection } from './gateway.js';
import { ChannelCronManager } from './cron.js';
import { getPatrolConfig, setPatrolConfig } from './patrol.js';
import type { ClientMessage, ServerMessage, Message, Channel, Agent, TodoItem, CronExecution, NorthStar, Pin, PatrolConfig, Notification, NotificationTrigger } from './types.js';

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
    this.handleTodoList(ws);
    this.handleNorthStarGet(ws); // send all north stars

    // Send message history for all active channels
    this.sendAllChannelHistory(ws);
    this.sendAllNotificationBadges(ws);
    this.handlePatrolConfigGet(ws);

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

      // Parse @notify cross-posts in agent responses
      this.parseNotifyCommands(channelId, content);
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
      case 'cron_trigger':
        this.handleCronTrigger(ws, msg.channelId);
        break;
      case 'cron_history':
        this.handleCronHistory(ws, msg.channelId);
        break;
      case 'north_star_get':
        this.handleNorthStarGet(ws, msg.scope);
        break;
      case 'north_star_set':
        this.handleNorthStarSet(msg.scope, msg.content);
        break;
      case 'pin_list':
        this.handlePinList(ws, msg.channelId);
        break;
      case 'pin_create':
        this.handlePinCreate(msg.channelId, msg.content, msg.label);
        break;
      case 'pin_message':
        this.handlePinMessage(msg.channelId, msg.messageId);
        break;
      case 'pin_delete':
        this.handlePinDelete(msg.pinId);
        break;
      case 'patrol_config_get':
        this.handlePatrolConfigGet(ws);
        break;
      case 'patrol_config_set':
        this.handlePatrolConfigSet(msg.config);
        break;
      case 'patrol_trigger':
        this.handlePatrolTrigger();
        break;
      case 'notification_mark_read':
        this.handleNotificationMarkRead(msg.channelId);
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
      if (name === 'urgent' || name === 'notify') continue;
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

    // Sync cron schedule if cron settings changed
    if (this.cronManager && (metadata.cronSchedule !== undefined || metadata.cronEnabled !== undefined)) {
      this.cronManager.syncChannel(channel);
    }
  }

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
    this.syncTodoSectionPins(section);
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
    this.syncTodoSectionPins(row.section);

    // §5: Notify other channels linked to this section when status changes
    if (updates.status && updates.status !== existing.status) {
      const section = row.section;
      const linkedChannels = db.prepare(
        'SELECT id, name FROM channels WHERE todo_section = ?'
      ).all(section) as any[];

      const sourceChannelId = row.assigned_channel || (linkedChannels[0]?.id ?? '');

      for (const ch of linkedChannels) {
        if (ch.id === sourceChannelId) continue;
        this.postNotification(
          sourceChannelId,
          ch.id,
          `TODO [${section}] "${row.content.slice(0, 60)}": ${existing.status} → ${updates.status}`,
          'todo_change',
          row.id,
        );
      }
    }
  }

  private handleTodoDelete(id: string): void {
    const db = getDb();
    const existing = db.prepare('SELECT section FROM todo_items WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM todo_history WHERE todo_id = ?').run(id);
    db.prepare('DELETE FROM todo_items WHERE id = ?').run(id);
    this.broadcast({ type: 'todo_deleted', id });
    if (existing) {
      this.syncTodoSectionPins(existing.section);
    }
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

  // --- North Star handlers ---

  private handleNorthStarGet(ws: WebSocket, scope?: string): void {
    const db = getDb();
    if (scope) {
      const row = db.prepare('SELECT * FROM north_stars WHERE scope = ?').get(scope) as any;
      if (row) {
        this.sendTo(ws, { type: 'north_star', star: this.mapNorthStarRow(row) });
      } else {
        // Return empty star for the requested scope
        this.sendTo(ws, { type: 'north_star', star: { id: '', scope, content: '', updatedAt: '' } });
      }
    } else {
      const rows = db.prepare('SELECT * FROM north_stars ORDER BY updated_at DESC').all() as any[];
      const stars: NorthStar[] = rows.map(this.mapNorthStarRow);
      this.sendTo(ws, { type: 'north_star_list', stars });
    }
  }

  private handleNorthStarSet(scope: string, content: string): void {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM north_stars WHERE scope = ?').get(scope) as any;
    const now = new Date().toISOString();

    let star: NorthStar;
    if (existing) {
      db.prepare('UPDATE north_stars SET content = ?, updated_at = ? WHERE scope = ?').run(content, now, scope);
      star = { id: existing.id, scope, content, updatedAt: now };
    } else {
      const id = uuid();
      db.prepare('INSERT INTO north_stars (id, scope, content, updated_at) VALUES (?, ?, ?, ?)').run(id, scope, content, now);
      star = { id, scope, content, updatedAt: now };
    }

    this.broadcast({ type: 'north_star', star });

    // Pin sync: update all pins referencing this north star
    this.syncNorthStarPins(star);
  }

  private handlePinList(ws: WebSocket, channelId: string): void {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM pins WHERE channel_id = ? ORDER BY updated_at DESC').all(channelId) as any[];
    const pins: Pin[] = rows.map(this.mapPinRow);
    this.sendTo(ws, { type: 'pin_list', channelId, pins });
  }

  private handlePinCreate(channelId: string, content: string, label?: string): void {
    const db = getDb();
    const id = uuid();
    const now = new Date().toISOString();
    const sourceId = label || 'custom';

    db.prepare(
      'INSERT INTO pins (id, channel_id, type, source_id, content, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, channelId, 'custom', sourceId, content, now);

    const pin: Pin = { id, channelId, type: 'custom', sourceId, content, updatedAt: now };
    this.broadcast({ type: 'pin_updated', channelId, pin });
  }

  private handlePinMessage(channelId: string, messageId: string): void {
    const db = getDb();
    const msgRow = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as any;
    if (!msgRow) return;

    const id = uuid();
    const now = new Date().toISOString();
    const content = msgRow.content.length > 200 ? msgRow.content.slice(0, 200) + '...' : msgRow.content;

    db.prepare(
      'INSERT INTO pins (id, channel_id, type, source_id, content, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, channelId, 'message', messageId, content, now);

    const pin: Pin = { id, channelId, type: 'message', sourceId: messageId, content, updatedAt: now };
    this.broadcast({ type: 'pin_updated', channelId, pin });
  }

  private handlePinDelete(pinId: string): void {
    const db = getDb();
    const row = db.prepare('SELECT * FROM pins WHERE id = ?').get(pinId) as any;
    if (!row) return;

    const channelId = row.channel_id;
    db.prepare('DELETE FROM pins WHERE id = ?').run(pinId);
    this.broadcast({ type: 'pin_deleted', channelId, pinId });
  }

  /** Pin sync: when a north star changes, update/create pins in relevant channels. */
  private syncNorthStarPins(star: NorthStar): void {
    const db = getDb();
    const now = new Date().toISOString();

    // Find existing pins referencing this north star
    const existingPins = db.prepare(
      "SELECT * FROM pins WHERE type = 'north_star' AND source_id = ?"
    ).all(star.id) as any[];

    for (const pinRow of existingPins) {
      db.prepare('UPDATE pins SET content = ?, updated_at = ? WHERE id = ?').run(star.content, now, pinRow.id);
      const pin: Pin = { id: pinRow.id, channelId: pinRow.channel_id, type: 'north_star', sourceId: star.id, content: star.content, updatedAt: now };
      this.broadcast({ type: 'pin_updated', channelId: pin.channelId, pin });
    }

    // If scope is a channel ID, auto-create a pin in that channel if none exists
    if (star.scope !== 'global') {
      const channelRow = db.prepare('SELECT id FROM channels WHERE id = ?').get(star.scope);
      if (channelRow) {
        const existing = db.prepare(
          "SELECT * FROM pins WHERE channel_id = ? AND type = 'north_star' AND source_id = ?"
        ).get(star.scope, star.id);
        if (!existing) {
          const pinId = uuid();
          db.prepare('INSERT INTO pins (id, channel_id, type, source_id, content, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
            pinId, star.scope, 'north_star', star.id, star.content, now
          );
          const pin: Pin = { id: pinId, channelId: star.scope, type: 'north_star', sourceId: star.id, content: star.content, updatedAt: now };
          this.broadcast({ type: 'pin_updated', channelId: star.scope, pin });
        }
      }
    }

    // Auto-create pin for global north star in all channels that don't have one
    if (star.scope === 'global') {
      const channels = db.prepare('SELECT id FROM channels').all() as { id: string }[];
      for (const ch of channels) {
        const existing = db.prepare(
          "SELECT * FROM pins WHERE channel_id = ? AND type = 'north_star' AND source_id = ?"
        ).get(ch.id, star.id);
        if (!existing) {
          const pinId = uuid();
          db.prepare('INSERT INTO pins (id, channel_id, type, source_id, content, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
            pinId, ch.id, 'north_star', star.id, star.content, now
          );
          const pin: Pin = { id: pinId, channelId: ch.id, type: 'north_star', sourceId: star.id, content: star.content, updatedAt: now };
          this.broadcast({ type: 'pin_updated', channelId: ch.id, pin });
        }
      }
    }
  }

  /** Pin sync: when a TODO item changes, update pins for its section. */
  private syncTodoSectionPins(section: string): void {
    const db = getDb();
    const now = new Date().toISOString();

    // Render the section content: list all items in this section
    const items = db.prepare('SELECT * FROM todo_items WHERE section = ? ORDER BY created_at ASC').all(section) as any[];
    const rendered = items.map((r: any) => `[${r.status}] ${r.content}`).join('\n');

    // Find existing pins for this section
    const existingPins = db.prepare(
      "SELECT * FROM pins WHERE type = 'todo_section' AND source_id = ?"
    ).all(section) as any[];

    for (const pinRow of existingPins) {
      db.prepare('UPDATE pins SET content = ?, updated_at = ? WHERE id = ?').run(rendered, now, pinRow.id);
      const pin: Pin = { id: pinRow.id, channelId: pinRow.channel_id, type: 'todo_section', sourceId: section, content: rendered, updatedAt: now };
      this.broadcast({ type: 'pin_updated', channelId: pin.channelId, pin });
    }

    // Auto-create pins in channels whose todoSection matches
    const matchingChannels = db.prepare('SELECT id FROM channels WHERE todo_section = ?').all(section) as { id: string }[];
    for (const ch of matchingChannels) {
      const existing = db.prepare(
        "SELECT * FROM pins WHERE channel_id = ? AND type = 'todo_section' AND source_id = ?"
      ).get(ch.id, section);
      if (!existing) {
        const pinId = uuid();
        db.prepare('INSERT INTO pins (id, channel_id, type, source_id, content, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
          pinId, ch.id, 'todo_section', section, rendered, now
        );
        const pin: Pin = { id: pinId, channelId: ch.id, type: 'todo_section', sourceId: section, content: rendered, updatedAt: now };
        this.broadcast({ type: 'pin_updated', channelId: ch.id, pin });
      }
    }
  }

  private mapNorthStarRow(r: any): NorthStar {
    return { id: r.id, scope: r.scope, content: r.content, updatedAt: r.updated_at };
  }

  private mapPinRow(r: any): Pin {
    return { id: r.id, channelId: r.channel_id, type: r.type, sourceId: r.source_id, content: r.content, updatedAt: r.updated_at };
  }

  // --- Cron handlers ---

  private handleCronTrigger(ws: WebSocket, channelId: string): void {
    if (!this.cronManager) {
      this.sendTo(ws, { type: 'error', message: 'Cron manager not initialized' });
      return;
    }

    this.cronManager.triggerChannel(channelId);

    // Return the latest execution
    const executions = this.cronManager.getHistory(channelId, 1);
    if (executions.length > 0) {
      this.broadcast({ type: 'cron_fired', channelId, execution: executions[0] });
    }
  }

  private handleCronHistory(ws: WebSocket, channelId: string): void {
    if (!this.cronManager) {
      this.sendTo(ws, { type: 'cron_history', channelId, executions: [] });
      return;
    }

    const executions = this.cronManager.getHistory(channelId);
    this.sendTo(ws, { type: 'cron_history', channelId, executions });
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

  // --- Patrol handlers ---

  private handlePatrolConfigGet(ws: WebSocket): void {
    const config = getPatrolConfig();
    this.sendTo(ws, { type: 'patrol_config', config });
  }

  private handlePatrolConfigSet(updates: Partial<PatrolConfig>): void {
    const config = setPatrolConfig(updates);
    this.broadcast({ type: 'patrol_config', config });

    if (this.cronManager) {
      this.cronManager.syncPatrol(config);
    }
  }

  private handlePatrolTrigger(): void {
    if (!this.cronManager) return;
    this.cronManager.executePatrol();

    const config = getPatrolConfig();
    if (config) {
      this.broadcast({ type: 'patrol_fired', controlChannelId: config.controlChannelId });
    }
  }

  // --- Notification handlers ---

  /** Create and broadcast a notification. */
  private postNotification(
    sourceChannelId: string,
    targetChannelId: string,
    content: string,
    trigger: 'todo_change' | 'agent_crosspost' | 'patrol',
    todoItemId?: string,
  ): void {
    const db = getDb();
    const id = uuid();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO notifications (id, source_channel_id, target_channel_id, content, trigger_type, todo_item_id, created_at, read) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
    ).run(id, sourceChannelId, targetChannelId, content, trigger, todoItemId ?? null, now);

    const notification: Notification = {
      id, sourceChannelId, targetChannelId, content, trigger,
      todoItemId: todoItemId ?? null, createdAt: now, read: false,
    };

    this.broadcast({ type: 'notification', notification });
    this.broadcastNotificationBadge(targetChannelId);
  }

  private handleNotificationMarkRead(channelId: string): void {
    const db = getDb();
    db.prepare('UPDATE notifications SET read = 1 WHERE target_channel_id = ? AND read = 0').run(channelId);
    this.broadcastNotificationBadge(channelId);
  }

  private broadcastNotificationBadge(channelId: string): void {
    const db = getDb();
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM notifications WHERE target_channel_id = ? AND read = 0'
    ).get(channelId) as any;
    this.broadcast({ type: 'notification_badge', channelId, unreadCount: row?.cnt ?? 0 });
  }

  /** Send notification badges for all channels to a newly connected client. */
  private sendAllNotificationBadges(ws: WebSocket): void {
    const db = getDb();
    const rows = db.prepare(
      'SELECT target_channel_id, COUNT(*) as cnt FROM notifications WHERE read = 0 GROUP BY target_channel_id'
    ).all() as any[];

    for (const row of rows) {
      this.sendTo(ws, { type: 'notification_badge', channelId: row.target_channel_id, unreadCount: row.cnt });
    }
  }

  /** Parse @notify #channel-name: message patterns in agent responses. */
  private parseNotifyCommands(sourceChannelId: string, content: string): void {
    const pattern = /@notify\s+#([\w-]+):\s*(.+?)(?=@notify\s+#|$)/gs;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const targetName = match[1];
      const notifyContent = match[2].trim();

      const db = getDb();
      const targetChannel = db.prepare(
        "SELECT id FROM channels WHERE LOWER(name) = LOWER(?)"
      ).get(targetName) as any;

      if (!targetChannel) {
        console.warn(`[notify] target channel not found: #${targetName}`);
        continue;
      }

      if (targetChannel.id === sourceChannelId) continue;

      console.log(`[notify] #${sourceChannelId} → #${targetChannel.id}: "${notifyContent.slice(0, 80)}"`);
      this.postNotification(sourceChannelId, targetChannel.id, notifyContent, 'agent_crosspost');
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
