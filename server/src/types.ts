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
  northStar: string;
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
  | { type: 'create_channel'; name: string; agents: { id: string; requireMention: boolean }[]; metadata?: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'northStar' | 'cronSchedule' | 'cronEnabled'>> }
  | { type: 'update_channel'; channelId: string; agents: { id: string; requireMention: boolean }[] }
  | { type: 'update_channel_meta'; channelId: string; metadata: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'northStar' | 'cronSchedule' | 'cronEnabled'>> }
  | { type: 'list_channels' }
  | { type: 'list_agents' }
  | { type: 'cron_trigger'; channelId: string }
  | { type: 'cron_history'; channelId: string }
  | { type: 'north_star_get'; scope?: string }
  | { type: 'north_star_set'; scope: string; content: string }
  | { type: 'patrol_config_get' }
  | { type: 'patrol_config_set'; config: Partial<PatrolConfig> }
  | { type: 'patrol_trigger' }
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
  | { type: 'cron_fired'; channelId: string; execution: CronExecution }
  | { type: 'cron_history'; channelId: string; executions: CronExecution[] }
  | { type: 'north_star'; star: NorthStar }
  | { type: 'north_star_list'; stars: NorthStar[] }
  | { type: 'patrol_config'; config: PatrolConfig | null }
  | { type: 'patrol_fired'; controlChannelId: string }
  | { type: 'channel_deleted'; channelId: string }
  | { type: 'agent_registered'; agent: Agent }
  | { type: 'agent_updated'; agent: Agent }
  | { type: 'agent_removed'; id: string }
  | { type: 'error'; message: string };

export interface NorthStar {
  id: string;
  scope: 'global' | string;  // 'global' or channel ID
  content: string;
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
