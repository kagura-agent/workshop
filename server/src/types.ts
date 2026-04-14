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
  isUrgent: boolean;
}

export interface DirectMessage {
  id: string;
  fromId: string;
  toId: string;
  content: string;
  timestamp: string;
  read: boolean;
}

export interface DmConversation {
  partnerId: string;
  partnerName: string;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
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
  | { type: 'todo_delete'; id: string }
  | { type: 'cron_trigger'; channelId: string }
  | { type: 'cron_history'; channelId: string }
  | { type: 'north_star_get'; scope?: string }
  | { type: 'north_star_set'; scope: string; content: string }
  | { type: 'pin_list'; channelId: string }
  | { type: 'pin_create'; channelId: string; content: string; label?: string }
  | { type: 'pin_message'; channelId: string; messageId: string }
  | { type: 'pin_delete'; pinId: string }
  | { type: 'patrol_config_get' }
  | { type: 'patrol_config_set'; config: Partial<PatrolConfig> }
  | { type: 'patrol_trigger' }
  | { type: 'notification_mark_read'; channelId: string }
  | { type: 'delete_channel'; channelId: string }
  | { type: 'archive_channel'; channelId: string }
  | { type: 'rename_channel'; channelId: string; name: string }
  | { type: 'register_agent'; agent: { id: string; name: string; avatar?: string } }
  | { type: 'update_agent'; id: string; updates: Partial<{ name: string; avatar: string }> }
  | { type: 'remove_agent'; id: string }
  | { type: 'send_dm'; toId: string; content: string }
  | { type: 'list_dms'; withId: string; limit?: number; before?: string }
  | { type: 'dm_mark_read'; withId: string }
  | { type: 'dm_conversations' }
  | { type: 'channel_todo_list'; channelId: string }
  | { type: 'channel_todo_create'; channelId: string; content: string; status?: TodoStatus };

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
  | { type: 'cron_fired'; channelId: string; execution: CronExecution }
  | { type: 'cron_history'; channelId: string; executions: CronExecution[] }
  | { type: 'north_star'; star: NorthStar }
  | { type: 'north_star_list'; stars: NorthStar[] }
  | { type: 'pin_list'; channelId: string; pins: Pin[] }
  | { type: 'pin_updated'; channelId: string; pin: Pin }
  | { type: 'pin_deleted'; channelId: string; pinId: string }
  | { type: 'patrol_config'; config: PatrolConfig | null }
  | { type: 'patrol_fired'; controlChannelId: string }
  | { type: 'notification'; notification: Notification }
  | { type: 'notification_badge'; channelId: string; unreadCount: number }
  | { type: 'channel_deleted'; channelId: string }
  | { type: 'agent_registered'; agent: Agent }
  | { type: 'agent_updated'; agent: Agent }
  | { type: 'agent_removed'; id: string }
  | { type: 'dm_typing'; agentId: string; agentName: string }
  | { type: 'dm_message'; message: DirectMessage }
  | { type: 'dm_list'; withId: string; messages: DirectMessage[] }
  | { type: 'dm_conversations'; conversations: DmConversation[] }
  | { type: 'dm_unread'; counts: Record<string, number> }
  | { type: 'channel_todo_list'; channelId: string; items: TodoItem[] }
  | { type: 'error'; message: string };

export interface NorthStar {
  id: string;
  scope: 'global' | string;  // 'global' or channel ID
  content: string;
  updatedAt: string;
}

export type PinType = 'todo_section' | 'north_star' | 'custom' | 'message';

export interface Pin {
  id: string;
  channelId: string;
  type: PinType;
  sourceId: string;           // todo section name or north star ID
  content: string;            // rendered snapshot
  updatedAt: string;
}

export interface CronExecution {
  id: string;
  channelId: string;
  firedAt: string;
  agentIds: string[];
  promptSnippet: string;
  status: string;
}

export interface PatrolConfig {
  controlChannelId: string;
  schedule: string;
  enabled: boolean;
  lastPatrolAt: string | null;
  channelFilter: string[];
}

export type NotificationTrigger = 'todo_change' | 'agent_crosspost' | 'patrol';

export interface Notification {
  id: string;
  sourceChannelId: string;
  targetChannelId: string;
  content: string;
  trigger: NotificationTrigger;
  todoItemId: string | null;
  createdAt: string;
  read: boolean;
}
