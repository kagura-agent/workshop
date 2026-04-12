export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'connecting' | 'offline';
}

export type ChannelType = 'daily' | 'project' | 'meta';
export type TodoStatus = 'pending' | 'in_progress' | 'review' | 'done';

export interface Channel {
  id: string;
  name: string;
  agents: string[];
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

export interface CronExecution {
  id: string;
  channelId: string;
  firedAt: string;
  agentIds: string[];
  promptSnippet: string;
  status: string;
}

export interface NorthStar {
  id: string;
  scope: 'global' | string;
  content: string;
  updatedAt: string;
}

export type PinType = 'todo_section' | 'north_star' | 'custom';

export interface Pin {
  id: string;
  channelId: string;
  type: PinType;
  sourceId: string;
  content: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isUrgent: boolean;
}

// Messages from server
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
  | { type: 'patrol_config'; config: PatrolConfig | null }
  | { type: 'patrol_fired'; controlChannelId: string }
  | { type: 'notification'; notification: Notification }
  | { type: 'notification_badge'; channelId: string; unreadCount: number }
  | { type: 'error'; message: string };

// Messages from client → server
export type ClientMessage =
  | { type: 'send_message'; channelId: string; content: string }
  | { type: 'create_channel'; name: string; agents: { id: string; requireMention: boolean }[] }
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
  | { type: 'patrol_config_get' }
  | { type: 'patrol_config_set'; config: Partial<PatrolConfig> }
  | { type: 'patrol_trigger' }
  | { type: 'notification_mark_read'; channelId: string };

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
