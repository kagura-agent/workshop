export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'connecting' | 'offline';
}

export interface Room {
  id: string;
  name: string;
  agents: string[];
  createdAt: string;
  status: 'active' | 'completed' | 'archived';
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Messages from server
export type ServerMessage =
  | { type: 'message'; roomId: string; message: Message }
  | { type: 'room_list'; rooms: Room[] }
  | { type: 'agent_list'; agents: Agent[] }
  | { type: 'room_created'; room: Room }
  | { type: 'error'; message: string };
