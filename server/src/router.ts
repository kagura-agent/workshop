import { v4 as uuid } from 'uuid';
import type WebSocket from 'ws';
import { getDb } from './db.js';
import { GatewayConnection } from './gateway.js';
import type { ClientMessage, ServerMessage, Message, Channel, Agent } from './types.js';

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
        this.handleCreateChannel(ws, msg.name, msg.agents);
        break;
      case 'update_channel':
        this.handleUpdateChannel(msg.channelId, msg.agents);
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

  private handleCreateChannel(_ws: WebSocket, name: string, agents: { id: string; requireMention: boolean }[]): void {
    const db = getDb();
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const now = new Date().toISOString();

    db.prepare('INSERT INTO channels (id, name, created_at) VALUES (?, ?, ?)').run(id, name, now);

    for (const agent of agents) {
      db.prepare(
        'INSERT OR IGNORE INTO channel_agents (channel_id, agent_id, require_mention) VALUES (?, ?, ?)'
      ).run(id, agent.id, agent.requireMention ? 1 : 0);
    }

    const agentIds = agents.map(a => a.id);
    const agentConfigs = agents.map(a => ({ id: a.id, requireMention: a.requireMention }));
    const channel: Channel = { id, name, agents: agentIds, agentConfigs, createdAt: now, status: 'active' };
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
    const channel: Channel = { id: row.id, name: row.name, agents: agentIds, agentConfigs, createdAt: row.created_at, status: row.status };
    this.broadcast({ type: 'channel_updated', channel });
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
