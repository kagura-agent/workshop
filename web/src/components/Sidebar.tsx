import { useState } from 'react';
import { CreateChannelDialog } from './CreateChannelDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
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
                "px-3 py-2 rounded cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground text-sm flex items-center gap-1.5 before:content-['#'] before:text-muted-foreground/60 before:font-semibold",
                channel.id === activeChannelId && 'bg-accent text-foreground'
              )}
              onClick={() => onSelectChannel(channel.id)}
            >
              {channel.name}
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
