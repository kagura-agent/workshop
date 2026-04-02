export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'connecting' | 'offline';
}

export interface ChannelAgent {
  id: string;
  requireMention: boolean;
}

export interface Channel {
  id: string;
  name: string;
  agents: string[]; // agent IDs
  agentConfigs?: { id: string; requireMention: boolean }[];
  createdAt: string;
  status: 'active' | 'completed' | 'archived';
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;    // agent ID or 'user'
  senderName: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// WebSocket protocol: client → server
export type ClientMessage =
  | { type: 'send_message'; channelId: string; content: string }
  | { type: 'join_channel'; channelId: string }
  | { type: 'create_channel'; name: string; agents: { id: string; requireMention: boolean }[] }
  | { type: 'update_channel'; channelId: string; agents: { id: string; requireMention: boolean }[] }
  | { type: 'list_channels' }
  | { type: 'list_agents' };

// WebSocket protocol: server → client
export type ServerMessage =
  | { type: 'message'; channelId: string; message: Message }
  | { type: 'typing'; channelId: string; agentId: string; agentName: string }
  | { type: 'channel_list'; channels: Channel[] }
  | { type: 'agent_list'; agents: Agent[] }
  | { type: 'channel_created'; channel: Channel }
  | { type: 'channel_updated'; channel: Channel }
  | { type: 'error'; message: string };
