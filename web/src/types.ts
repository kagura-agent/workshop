export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'connecting' | 'offline';
}

export type ChannelType = 'daily' | 'project' | 'meta';

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
  cronSchedule: string | null;
  cronEnabled: boolean;
}

export interface CronExecution {
  id: string;
  channelId: string;
  firedAt: string;
  agentIds: string[];
  promptSnippet: string;
  status: string;
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
  | { type: 'cron_fired'; channelId: string; execution: CronExecution }
  | { type: 'cron_history'; channelId: string; executions: CronExecution[] }
  | { type: 'patrol_config'; config: PatrolConfig | null }
  | { type: 'patrol_fired'; controlChannelId: string }
  | { type: 'channel_deleted'; channelId: string }
  | { type: 'agent_registered'; agent: Agent }
  | { type: 'agent_updated'; agent: Agent }
  | { type: 'agent_removed'; id: string }
  | { type: 'error'; message: string };

// Messages from client → server
export type ClientMessage =
  | { type: 'send_message'; channelId: string; content: string }
  | { type: 'create_channel'; name: string; agents: { id: string; requireMention: boolean }[] }
  | { type: 'update_channel'; channelId: string; agents: { id: string; requireMention: boolean }[] }
  | { type: 'update_channel_meta'; channelId: string; metadata: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'cronSchedule' | 'cronEnabled'>> }
  | { type: 'list_channels' }
  | { type: 'list_agents' }
  | { type: 'cron_trigger'; channelId: string }
  | { type: 'cron_history'; channelId: string }
  | { type: 'patrol_config_get' }
  | { type: 'patrol_config_set'; config: Partial<PatrolConfig> }
  | { type: 'patrol_trigger' }
  | { type: 'delete_channel'; channelId: string }
  | { type: 'archive_channel'; channelId: string }
  | { type: 'rename_channel'; channelId: string; name: string }
  | { type: 'register_agent'; agent: { id: string; name: string; avatar?: string } }
  | { type: 'update_agent'; id: string; updates: Partial<{ name: string; avatar: string }> }
  | { type: 'remove_agent'; id: string };

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

