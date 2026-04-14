import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { MessageContent } from '@/components/MessageContent';
import type { Agent, Channel, Message } from '../types';

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  project: { label: 'Project', className: 'bg-discord-accent/20 text-discord-accent' },
  daily: { label: 'Daily', className: 'bg-green-400/20 text-green-400' },
  meta: { label: 'Meta', className: 'bg-yellow-400/20 text-yellow-400' },
};

interface ChatViewProps {
  channel: Channel | null;
  messages: Message[];
  channelAgents: Agent[];
  typingNames: string[];
  isPatrolChannel: boolean;
  onSendMessage: (content: string) => void;
  onEditChannel?: () => void;
  onOpenSettings?: () => void;
  onPatrolTrigger?: () => void;
}

export function ChatView({ channel, messages, channelAgents, typingNames, isPatrolChannel, onSendMessage, onEditChannel, onOpenSettings, onPatrolTrigger }: ChatViewProps) {
  const [input, setInput] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filter agents matching mention query
  const mentionCandidates = mentionQuery !== null
    ? channelAgents.filter(a =>
        a.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        a.id.toLowerCase().includes(mentionQuery.toLowerCase())
      )
    : [];

  // Reset index when candidates change
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  const insertMention = (agent: Agent) => {
    // Find the @ position before cursor
    const before = input.slice(0, cursorPos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) return;
    const after = input.slice(cursorPos);
    const newInput = before.slice(0, atIdx) + `@${agent.name} ` + after;
    setInput(newInput);
    setMentionQuery(null);
    // Focus back
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart ?? val.length;
    setInput(val);
    setCursorPos(pos);

    // Check if we're in a @mention context
    const before = val.slice(0, pos);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionCandidates.length > 0 && mentionQuery !== null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, mentionCandidates.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex]);
      } else if (e.key === 'Escape') {
        setMentionQuery(null);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mentionCandidates.length > 0 && mentionQuery !== null) return; // don't submit while picking
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
    setMentionQuery(null);
  };

  if (!channel) {
    return (
      <div className="flex-1 flex flex-col bg-muted">
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Select a channel to start chatting
        </div>
      </div>
    );
  }

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const channelName = channel.name;
  const badge = TYPE_BADGE[channel.type] ?? TYPE_BADGE.project;

  // Compute agent last active time
  const lastAgentMessage = [...messages].reverse().find(m => m.role === 'assistant');
  const agentLastActive = lastAgentMessage ? formatTime(lastAgentMessage.timestamp) : null;

  return (
    <div className="flex-1 flex flex-col bg-muted min-h-0">
      <div className="p-3 px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/60 text-xl">#</span>
          <span className="font-semibold">{channelName}</span>
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', badge.className)}>{badge.label}</span>
          {channel.positioning && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={channel.positioning}>
              — {channel.positioning}
            </span>
          )}
          {agentLastActive && (
            <span className="text-[10px] text-muted-foreground/60 ml-1">
              Agent active: {agentLastActive}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {isPatrolChannel && onPatrolTrigger && (
              <button
                className="cursor-pointer text-yellow-400 hover:text-yellow-300 text-sm px-1.5"
                onClick={onPatrolTrigger}
                title="Run patrol now"
              >
                &#128737;
              </button>
            )}
            {onOpenSettings && (
              <button
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={onOpenSettings}
                title="Channel settings"
              >
                &#9881;&#65039;
              </button>
            )}
            {onEditChannel && (
              <button
                className="cursor-pointer text-muted-foreground hover:text-foreground text-sm"
                onClick={onEditChannel}
                title="Edit channel members"
              >
                &#128101;
              </button>
            )}
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No messages yet. Say something!
            </div>
          )}
          {messages.map((msg) => {
            const senderAgent = channelAgents.find(a => a.id === msg.senderId);
            const avatarUrl = senderAgent?.avatar?.startsWith('http') ? senderAgent.avatar : null;
            return (
            <div
              key={msg.id}
              className={cn(
                'group flex gap-3 py-1 mb-2 relative',
                msg.isUrgent && 'border-l-2 border-red-500 pl-2'
              )}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={msg.senderName}
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
              ) : (
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold shrink-0 text-white',
                    msg.role === 'user' ? 'bg-discord-online' : 'bg-discord-accent'
                  )}
                >
                  {msg.senderName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="font-semibold text-sm">{msg.senderName}</span>
                  <span className="text-[11px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                  {msg.isUrgent && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 uppercase">Urgent</span>
                  )}
                </div>
                <MessageContent content={msg.content} agents={channelAgents} />
              </div>
            </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      <form className="p-4" onSubmit={handleSubmit}>
        {typingNames.length > 0 && (
          <div className="px-4 pb-1 text-xs text-muted-foreground animate-pulse">
            <span className="tracking-widest">•••</span>
            {' '}
            {typingNames.length === 1
              ? `${typingNames[0]} is typing...`
              : `${typingNames.join(', ')} are typing...`
            }
          </div>
        )}
        <div className="relative">
          {mentionCandidates.length > 0 && mentionQuery !== null && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-accent border border-border rounded-lg p-1 max-h-50 overflow-y-auto z-10 shadow-lg">
              {mentionCandidates.map((agent, i) => (
                <div
                  key={agent.id}
                  className={cn(
                    'flex items-center gap-2 py-2 px-3 rounded cursor-pointer text-sm hover:bg-muted',
                    i === mentionIndex && 'bg-muted'
                  )}
                  onClick={() => insertMention(agent)}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  <span className="text-lg w-6 text-center">{agent.avatar || agent.name.charAt(0)}</span>
                  <span className="text-foreground font-medium">{agent.name}</span>
                  <span className="text-muted-foreground text-xs ml-auto">@{agent.id}</span>
                </div>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${channelName} — type @ to mention`}
            className="w-full py-3 px-4 rounded-lg bg-card text-foreground text-sm outline-none border-none placeholder:text-muted-foreground/60"
          />
        </div>
      </form>
    </div>
  );
}
