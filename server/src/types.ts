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

export type ChannelType = 'daily' | 'project' | 'meta';

export interface Channel {
  id: string;
  name: string;
  agents: string[]; // agent IDs
  agentConfigs?: { id: string; requireMention: boolean }[];
  createdAt: string;
  status: 'active' | 'completed' | 'archived';
  // v0.3 metadata
  type: ChannelType;
  positioning: string;
  guidelines: string;
  cronSchedule: string | null;
  cronEnabled: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;    // agent ID or 'user'
  senderName: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isUrgent: boolean;
}

// WebSocket protocol: client → server
export type ClientMessage =
  | { type: 'send_message'; channelId: string; content: string }
  | { type: 'join_channel'; channelId: string }
  | { type: 'create_channel'; name: string; agents: { id: string; requireMention: boolean }[]; metadata?: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'cronSchedule' | 'cronEnabled'>> }
  | { type: 'update_channel'; channelId: string; agents: { id: string; requireMention: boolean }[] }
  | { type: 'update_channel_meta'; channelId: string; metadata: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'cronSchedule' | 'cronEnabled'>> }
  | { type: 'list_channels' }
  | { type: 'list_agents' }
  | { type: 'delete_channel'; channelId: string }
  | { type: 'archive_channel'; channelId: string }
  | { type: 'rename_channel'; channelId: string; name: string }
  | { type: 'register_agent'; agent: { id: string; name: string; avatar?: string } }
  | { type: 'update_agent'; id: string; updates: Partial<{ name: string; avatar: string }> }
  | { type: 'remove_agent'; id: string };

// WebSocket protocol: server → client
export type ServerMessage =
  | { type: 'message'; channelId: string; message: Message }
  | { type: 'typing'; channelId: string; agentId: string; agentName: string }
  | { type: 'channel_list'; channels: Channel[] }
  | { type: 'agent_list'; agents: Agent[] }
  | { type: 'channel_created'; channel: Channel }
  | { type: 'channel_updated'; channel: Channel }
  | { type: 'channel_meta_updated'; channel: Channel }
  | { type: 'channel_deleted'; channelId: string }
  | { type: 'agent_registered'; agent: Agent }
  | { type: 'agent_updated'; agent: Agent }
  | { type: 'agent_removed'; id: string }
  | { type: 'error'; message: string };
