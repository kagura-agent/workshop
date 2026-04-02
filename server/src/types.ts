export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  gatewayUrl: string;
  authToken: string;
  status: 'online' | 'connecting' | 'offline';
}

export interface Room {
  id: string;
  name: string;
  agents: string[]; // agent IDs
  createdAt: string;
  status: 'active' | 'completed' | 'archived';
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;    // agent ID or 'user'
  senderName: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// WebSocket protocol: client → server
export type ClientMessage =
  | { type: 'send_message'; roomId: string; content: string }
  | { type: 'join_room'; roomId: string }
  | { type: 'create_room'; name: string; agentIds: string[] }
  | { type: 'list_rooms' }
  | { type: 'list_agents' };

// WebSocket protocol: server → client
export type ServerMessage =
  | { type: 'message'; roomId: string; message: Message }
  | { type: 'room_list'; rooms: Room[] }
  | { type: 'agent_list'; agents: Agent[] }
  | { type: 'room_created'; room: Room }
  | { type: 'error'; message: string };
