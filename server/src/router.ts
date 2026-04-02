import { v4 as uuid } from 'uuid';
import type WebSocket from 'ws';
import { getDb } from './db.js';
import { GatewayConnection } from './gateway.js';
import type { ClientMessage, ServerMessage, Message, Room, Agent } from './types.js';

/**
 * Router — bridges frontend WebSocket clients with OpenClaw Gateway connections.
 */
export class Router {
  private clients = new Set<WebSocket>();
  private gateways = new Map<string, GatewayConnection>(); // agentId → connection

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

  addGateway(agent: Agent): void {
    const gw = new GatewayConnection(agent);

    gw.onMessage = (agentId, content: string) => {
      // content is the actual message text (already extracted by GatewayConnection)
      if (!content) return;

      console.log(`[msg] agent=${agentId} replied: "${content.slice(0, 120)}${content.length > 120 ? '...' : ''}"`);

      // Find rooms this agent is in and broadcast
      const db = getDb();
      const rooms = db.prepare(
        'SELECT room_id FROM room_agents WHERE agent_id = ?'
      ).all(agentId) as { room_id: string }[];

      for (const { room_id } of rooms) {
        const msg = this.storeMessage(room_id, agentId, agent.name, 'assistant', content);
        this.broadcast({ type: 'message', roomId: room_id, message: msg });
      }
    };

    gw.onStatusChange = (agentId, status) => {
      // Update agent status in DB
      const db = getDb();
      db.prepare('UPDATE agents SET status = ? WHERE id = ?').run(status, agentId);
    };

    this.gateways.set(agent.id, gw);
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

    // Forward to all agents in the room
    const db = getDb();
    const roomAgents = db.prepare(
      'SELECT agent_id FROM room_agents WHERE room_id = ?'
    ).all(roomId) as { agent_id: string }[];

    for (const { agent_id } of roomAgents) {
      const gw = this.gateways.get(agent_id);
      if (gw) {
        console.log(`[msg] forwarding to agent=${agent_id}`);
        gw.sendChat(content, roomId);
      } else {
        console.warn(`[msg] no gateway for agent=${agent_id}`);
      }
    }
  }

  private handleListRooms(ws: WebSocket): void {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM rooms').all() as any[];
    const rooms: Room[] = rows.map((r) => {
      // Also fetch agent IDs for each room
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
      gatewayUrl: r.gateway_url,
      authToken: r.auth_token,
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

  /**
   * Send message history for all rooms to a newly connected client.
   */
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
      if (client.readyState === 1) { // WebSocket.OPEN
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
