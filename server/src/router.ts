import { v4 as uuid } from 'uuid';
import type WebSocket from 'ws';
import { getDb } from './db.js';
import { GatewayConnection } from './gateway.js';
import type { ClientMessage, ServerMessage, Message, Room, Agent } from './types.js';

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

    // Immediately send current rooms and agents so the UI populates on load
    this.handleListRooms(ws);
    this.handleListAgents(ws);

    // Send message history for all active rooms
    this.sendAllRoomHistory(ws);

    ws.on('message', (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        console.log(`[ws:in] ${msg.type}`, msg.type === 'send_message' ? `room=${msg.roomId} content="${msg.content?.slice(0, 80)}"` : '');
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

    gw.onMessage = (agentId: string, roomId: string, content: string) => {
      if (!content) return;

      // Filter OpenClaw protocol tokens — these are not real messages
      const trimmed = content.trim();
      if (trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK') {
        console.log(`[msg] agent=${agentId} room=${roomId} silent (${trimmed}), not broadcasting`);
        return;
      }

      const agent = this.agents.get(agentId);
      const senderName = agent?.name ?? agentId;

      console.log(`[msg] agent=${agentId} room=${roomId} replied: "${content.slice(0, 120)}${content.length > 120 ? '...' : ''}"`);

      const msg = this.storeMessage(roomId, agentId, senderName, 'assistant', content);
      this.broadcast({ type: 'message', roomId, message: msg });
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
        this.handleSendMessage(msg.roomId, msg.content);
        break;
      case 'list_rooms':
        this.handleListRooms(ws);
        break;
      case 'list_agents':
        this.handleListAgents(ws);
        break;
      case 'create_room':
        this.handleCreateRoom(ws, msg.name, msg.agentIds);
        break;
      default:
        this.sendTo(ws, { type: 'error', message: 'Unknown message type' });
    }
  }

  private handleSendMessage(roomId: string, content: string): void {
    // Store human message
    const msg = this.storeMessage(roomId, 'user', 'You', 'user', content);
    console.log(`[msg] user → room=${roomId}: "${content.slice(0, 80)}"`);
    this.broadcast({ type: 'message', roomId, message: msg });

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
    const roomAgents = db.prepare(
      'SELECT agent_id, require_mention FROM room_agents WHERE room_id = ?'
    ).all(roomId) as { agent_id: string; require_mention: number }[];

    const hasMentions = mentions.size > 0;

    for (const { agent_id, require_mention } of roomAgents) {
      const agent = this.agents.get(agent_id);
      const agentName = agent?.name?.toLowerCase() ?? '';
      const mentioned = mentions.has(agent_id.toLowerCase()) || mentions.has(agentName);

      if (hasMentions) {
        // Message has @mentions — only send to mentioned agents
        if (!mentioned) {
          console.log(`[msg] skipping agent=${agent_id} room=${roomId} (message has @mentions, this agent not mentioned)`);
          continue;
        }
        console.log(`[msg] forwarding to agent=${agent_id} room=${roomId} (mentioned)`);
      } else if (require_mention) {
        // No @mentions in message, agent requires mention — skip
        console.log(`[msg] skipping agent=${agent_id} room=${roomId} (requireMention=true, no mentions in message)`);
        continue;
      } else {
        // No @mentions, agent doesn't require mention — send
        console.log(`[msg] forwarding to agent=${agent_id} room=${roomId} (requireMention=false, broadcast)`);
      }

      this.gateway.sendChat(content, roomId, agent_id);
    }
  }

  private handleListRooms(ws: WebSocket): void {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM rooms').all() as any[];
    const rooms: Room[] = rows.map((r) => {
      const agents = db.prepare(
        'SELECT agent_id FROM room_agents WHERE room_id = ?'
      ).all(r.id) as { agent_id: string }[];

      return {
        id: r.id,
        name: r.name,
        agents: agents.map((a) => a.agent_id),
        createdAt: r.created_at,
        status: r.status,
      };
    });
    this.sendTo(ws, { type: 'room_list', rooms });
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

  private handleCreateRoom(ws: WebSocket, name: string, agentIds: string[]): void {
    const db = getDb();
    const id = uuid();
    const now = new Date().toISOString();

    db.prepare('INSERT INTO rooms (id, name, created_at) VALUES (?, ?, ?)').run(id, name, now);

    for (const agentId of agentIds) {
      db.prepare('INSERT OR IGNORE INTO room_agents (room_id, agent_id) VALUES (?, ?)').run(id, agentId);
    }

    const room: Room = { id, name, agents: agentIds, createdAt: now, status: 'active' };
    this.sendTo(ws, { type: 'room_created', room });
  }

  private sendAllRoomHistory(ws: WebSocket): void {
    const db = getDb();
    const rooms = db.prepare('SELECT id FROM rooms').all() as { id: string }[];

    for (const { id: roomId } of rooms) {
      const rows = db.prepare(
        'SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp ASC LIMIT 200'
      ).all(roomId) as any[];

      for (const r of rows) {
        const msg: Message = {
          id: r.id,
          roomId: r.room_id,
          senderId: r.sender_id,
          senderName: r.sender_name,
          role: r.role,
          content: r.content,
          timestamp: r.timestamp,
        };
        this.sendTo(ws, { type: 'message', roomId, message: msg });
      }
    }
  }

  private storeMessage(
    roomId: string, senderId: string, senderName: string,
    role: 'user' | 'assistant', content: string
  ): Message {
    const db = getDb();
    const id = uuid();
    const timestamp = new Date().toISOString();

    db.prepare(
      'INSERT INTO messages (id, room_id, sender_id, sender_name, role, content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, roomId, senderId, senderName, role, content, timestamp);

    return { id, roomId, senderId, senderName, role, content, timestamp };
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
