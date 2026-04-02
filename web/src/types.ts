export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'connecting' | 'offline';
}

export interface Channel {
  id: string;
  name: string;
  agents: string[];
  agentConfigs?: { id: string; requireMention: boolean }[];
  createdAt: string;
  status: 'active' | 'completed' | 'archived';
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Messages from server
export type ServerMessage =
  | { type: 'message'; channelId: string; message: Message }
  | { type: 'typing'; channelId: string; agentId: string; agentName: string }
  | { type: 'channel_list'; channels: Channel[] }
  | { type: 'agent_list'; agents: Agent[] }
  | { type: 'channel_created'; channel: Channel }
  | { type: 'channel_updated'; channel: Channel }
  | { type: 'error'; message: string };

// Messages from client → server
export type ClientMessage =
  | { type: 'send_message'; channelId: string; content: string }
  | { type: 'create_channel'; name: string; agents: { id: string; requireMention: boolean }[] }
  | { type: 'update_channel'; channelId: string; agents: { id: string; requireMention: boolean }[] }
  | { type: 'list_channels' }
  | { type: 'list_agents' };

export interface CreateChannelDialogProps {
  agents: Agent[];
  onClose: () => void;
  onCreate: (name: string, agents: { id: string; requireMention: boolean }[]) => void;
  editChannel?: {
    id: string;
    name: string;
    agents: { id: string; requireMention: boolean }[];
  };
}
