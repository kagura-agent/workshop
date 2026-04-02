import { useState } from 'react';
import { CreateChannelDialog } from './CreateChannelDialog';
import type { Channel, Agent } from '../types';

interface SidebarProps {
  channels: Channel[];
  agents: Agent[];
  activeChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string, agents: { id: string; requireMention: boolean }[]) => void;
}

export function Sidebar({ channels, agents, activeChannelId, onSelectChannel, onCreateChannel }: SidebarProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div className="sidebar">
      <div className="sidebar-header">Workshop</div>
      <div className="channel-list">
        <div className="channel-list-header">
          <span className="channel-list-title">Channels</span>
          <button className="channel-add-btn" onClick={() => setShowDialog(true)}>+</button>
        </div>
        {channels.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
            No channels yet
          </div>
        )}
        {channels.map((channel) => (
          <div
            key={channel.id}
            className={`channel-item ${channel.id === activeChannelId ? 'active' : ''}`}
            onClick={() => onSelectChannel(channel.id)}
          >
            {channel.name}
          </div>
        ))}
      </div>
      {showDialog && (
        <CreateChannelDialog
          agents={agents}
          onClose={() => setShowDialog(false)}
          onCreate={(name, agentConfigs) => {
            onCreateChannel(name, agentConfigs);
            setShowDialog(false);
          }}
        />
      )}
    </div>
  );
}
