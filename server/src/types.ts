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
export type TodoStatus = 'pending' | 'in_progress' | 'review' | 'done';

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
  northStar: string;
  todoSection: string | null;
  cronSchedule: string | null;
  cronEnabled: boolean;
}

export interface TodoItem {
  id: string;
  section: string;
  content: string;
  status: TodoStatus;
  assignedChannel: string | null;
  assignedAgent: string | null;
  createdAt: string;
  updatedAt: string;
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
  | { type: 'create_channel'; name: string; agents: { id: string; requireMention: boolean }[]; metadata?: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'northStar' | 'todoSection' | 'cronSchedule' | 'cronEnabled'>> }
  | { type: 'update_channel'; channelId: string; agents: { id: string; requireMention: boolean }[] }
  | { type: 'update_channel_meta'; channelId: string; metadata: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'northStar' | 'todoSection' | 'cronSchedule' | 'cronEnabled'>> }
  | { type: 'list_channels' }
  | { type: 'list_agents' }
  | { type: 'todo_list' }
  | { type: 'todo_create'; section: string; content: string; assignedChannel?: string; assignedAgent?: string }
  | { type: 'todo_update'; id: string; updates: Partial<Pick<TodoItem, 'content' | 'status' | 'section' | 'assignedChannel' | 'assignedAgent'>> }
  | { type: 'todo_delete'; id: string };

// WebSocket protocol: server → client
export type ServerMessage =
  | { type: 'message'; channelId: string; message: Message }
  | { type: 'typing'; channelId: string; agentId: string; agentName: string }
  | { type: 'channel_list'; channels: Channel[] }
  | { type: 'agent_list'; agents: Agent[] }
  | { type: 'channel_created'; channel: Channel }
  | { type: 'channel_updated'; channel: Channel }
  | { type: 'channel_meta_updated'; channel: Channel }
  | { type: 'todo_list'; items: TodoItem[] }
  | { type: 'todo_created'; item: TodoItem }
  | { type: 'todo_updated'; item: TodoItem }
  | { type: 'todo_deleted'; id: string }
  | { type: 'error'; message: string };
