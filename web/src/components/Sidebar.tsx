import { useState } from 'react';
import { CreateChannelDialog } from './CreateChannelDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Channel, Agent } from '../types';

interface SidebarProps {
  channels: Channel[];
  agents: Agent[];
  activeChannelId: string | null;
  patrolControlChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string, agents: { id: string; requireMention: boolean }[]) => void;
  onOpenSettings: (channelId: string) => void;
  onOpenCronDashboard: () => void;
  dmUnread: Record<string, number>;
  activeDmPartnerId: string | null;
  onSelectDm: (partnerId: string) => void;
}

export function Sidebar({ channels, agents, activeChannelId, patrolControlChannelId, onSelectChannel, onCreateChannel, onOpenSettings, onOpenCronDashboard, dmUnread, activeDmPartnerId, onSelectDm }: SidebarProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const activeChannels = channels.filter((c) => c.status !== 'archived');
  const archivedChannels = channels.filter((c) => c.status === 'archived');

  return (
    <div className="w-60 bg-card border-r border-border flex flex-col">
      <div className="p-3 px-4 font-semibold text-sm border-b border-border flex items-center justify-between">
        <span>Workshop</span>
        <button
          className="inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground text-sm leading-none cursor-pointer"
          onClick={onOpenCronDashboard}
          title="Cron Dashboard"
        >
          &#128339;
        </button>
      </div>
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
          {activeChannels.length === 0 && archivedChannels.length === 0 && (
            <div className="px-3 py-2 text-muted-foreground text-[13px]">
              No channels yet
            </div>
          )}
          {activeChannels.map((channel) => (
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

          {/* Archived channels section */}
          {archivedChannels.length > 0 && (
            <div className="mt-2">
              <button
                className="flex items-center gap-1 px-3 py-1.5 w-full text-left uppercase tracking-wide text-xs font-semibold text-muted-foreground/60 hover:text-muted-foreground cursor-pointer"
                onClick={() => setShowArchived((v) => !v)}
              >
                <span className="text-[10px]">{showArchived ? '\u25BC' : '\u25B6'}</span>
                Archived ({archivedChannels.length})
              </button>
              {showArchived && archivedChannels.map((channel) => (
                <div
                  key={channel.id}
                  className={cn(
                    "group px-3 py-2 rounded cursor-pointer text-muted-foreground/50 hover:bg-accent hover:text-muted-foreground text-sm flex items-center gap-1.5 before:content-['#'] before:text-muted-foreground/30 before:font-semibold",
                    channel.id === activeChannelId && 'bg-accent text-muted-foreground'
                  )}
                  onClick={() => onSelectChannel(channel.id)}
                >
                  <span className="flex-1 truncate">{channel.name}</span>
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-foreground cursor-pointer text-xs"
                    onClick={(e) => { e.stopPropagation(); onOpenSettings(channel.id); }}
                    title="Channel settings"
                  >
                    &#9881;
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Direct Messages section */}
          {agents.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <span className="uppercase tracking-wide text-xs font-semibold text-muted-foreground">Direct Messages</span>
              </div>
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={cn(
                    "px-3 py-2 rounded cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground text-sm flex items-center gap-2",
                    agent.id === activeDmPartnerId && 'bg-accent text-foreground'
                  )}
                  onClick={() => onSelectDm(agent.id)}
                >
                  <span className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    agent.status === 'online' ? 'bg-green-500' : agent.status === 'connecting' ? 'bg-yellow-500' : 'bg-muted-foreground/40'
                  )} />
                  <span className="flex-1 truncate">{agent.name}</span>
                  {(dmUnread[agent.id] ?? 0) > 0 && (
                    <span className="shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1">
                      {dmUnread[agent.id]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
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
