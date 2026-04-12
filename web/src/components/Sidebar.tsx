import { useState } from 'react';
import { CreateChannelDialog } from './CreateChannelDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Channel, Agent } from '../types';

interface SidebarProps {
  channels: Channel[];
  agents: Agent[];
  activeChannelId: string | null;
  notificationBadges: Record<string, number>;
  patrolControlChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string, agents: { id: string; requireMention: boolean }[]) => void;
  onOpenSettings: (channelId: string) => void;
}

export function Sidebar({ channels, agents, activeChannelId, notificationBadges, patrolControlChannelId, onSelectChannel, onCreateChannel, onOpenSettings }: SidebarProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div className="w-60 bg-card border-r border-border flex flex-col">
      <div className="p-3 px-4 font-semibold text-sm border-b border-border">Workshop</div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            <span className="uppercase tracking-wide text-xs font-semibold text-muted-foreground">Channels</span>
            <button
              className="inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground text-lg leading-none cursor-pointer"
              onClick={() => setShowDialog(true)}
            >
              +
            </button>
          </div>
          {channels.length === 0 && (
            <div className="px-3 py-2 text-muted-foreground text-[13px]">
              No channels yet
            </div>
          )}
          {channels.map((channel) => (
            <div
              key={channel.id}
              className={cn(
                "group px-3 py-2 rounded cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground text-sm flex items-center gap-1.5 before:content-['#'] before:text-muted-foreground/60 before:font-semibold",
                channel.id === activeChannelId && 'bg-accent text-foreground'
              )}
              onClick={() => onSelectChannel(channel.id)}
            >
              <span className="flex-1 truncate">{channel.name}</span>
              {channel.id === patrolControlChannelId && (
                <span className="shrink-0 text-yellow-400/80 text-[11px]" title="Patrol control channel">&#128737;</span>
              )}
              {(notificationBadges[channel.id] ?? 0) > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1">
                  {notificationBadges[channel.id]}
                </span>
              )}
              {channel.cronEnabled && (
                <span className="shrink-0 text-muted-foreground/60 text-[11px]" title="Cron enabled">&#128339;</span>
              )}
              <button
                className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground cursor-pointer text-xs"
                onClick={(e) => { e.stopPropagation(); onOpenSettings(channel.id); }}
                title="Channel settings"
              >
                &#9881;
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
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
