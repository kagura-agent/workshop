import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageContent } from '@/components/MessageContent';
import type { Agent, Channel, Message, Pin, Notification, TodoItem, TodoStatus } from '../types';
import { ChannelTodoPanel } from '@/components/ChannelTodoPanel';

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
  pins: Pin[];
  notifications: Notification[];
  isPatrolChannel: boolean;
  onSendMessage: (content: string) => void;
  onEditChannel?: () => void;
  onOpenSettings?: () => void;
  onToggleTodo?: () => void;
  onPatrolTrigger?: () => void;
  onPinCreate?: (channelId: string, content: string, label?: string) => void;
  onPinMessage?: (channelId: string, messageId: string) => void;
  onPinDelete?: (pinId: string) => void;
  channelTodoItems?: TodoItem[];
  onChannelTodoCreate?: (channelId: string, content: string, status?: TodoStatus) => void;
  onChannelTodoUpdate?: (id: string, updates: Partial<Pick<TodoItem, 'content' | 'status' | 'section' | 'assignedChannel' | 'assignedAgent'>>) => void;
  onChannelTodoDelete?: (id: string) => void;
  onChannelTodoRefresh?: (channelId: string) => void;
}

export function ChatView({ channel, messages, channelAgents, typingNames, pins, notifications, isPatrolChannel, onSendMessage, onEditChannel, onOpenSettings, onToggleTodo, onPatrolTrigger, onPinCreate, onPinMessage, onPinDelete, channelTodoItems, onChannelTodoCreate, onChannelTodoUpdate, onChannelTodoDelete, onChannelTodoRefresh }: ChatViewProps) {
  const [input, setInput] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const [expandedPinId, setExpandedPinId] = useState<string | null>(null);
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinFormContent, setPinFormContent] = useState('');
  const [pinFormLabel, setPinFormLabel] = useState('');
  const [showChannelTodos, setShowChannelTodos] = useState(false);
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
            {onToggleTodo && (
              <button
                className="cursor-pointer text-muted-foreground hover:text-foreground text-sm px-1.5"
                onClick={onToggleTodo}
                title="Toggle TODO panel"
              >
                &#9745;
              </button>
            )}
            {onChannelTodoCreate && (
              <button
                className={cn(
                  'cursor-pointer text-sm px-1.5',
                  showChannelTodos ? 'text-blue-400 hover:text-blue-300' : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setShowChannelTodos((v) => !v)}
                title="Toggle channel tasks"
              >
                &#9744;
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
      {/* Pinned items bar */}
      {(pins.length > 0 || onPinCreate) && channel && (
        <div className="px-4 py-1.5 border-b border-border bg-card/50">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] text-muted-foreground shrink-0">Pinned:</span>
            {pins.map((pin) => {
              const label = pin.type === 'north_star' ? 'North Star'
                : pin.type === 'message' ? '\ud83d\udccc Message'
                : pin.type === 'custom' ? (pin.sourceId !== 'custom' ? `\ud83d\udcdd ${pin.sourceId}` : '\ud83d\udcdd Custom')
                : pin.sourceId;
              const isExpanded = expandedPinId === pin.id;
              const colorClass = pin.type === 'north_star'
                ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30'
                : pin.type === 'message'
                ? 'bg-purple-400/10 text-purple-400 border-purple-400/30'
                : pin.type === 'custom'
                ? 'bg-green-400/10 text-green-400 border-green-400/30'
                : 'bg-blue-400/10 text-blue-400 border-blue-400/30';
              return (
                <span
                  key={pin.id}
                  className={cn(
                    'group shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border',
                    colorClass,
                    isExpanded && 'ring-1 ring-offset-1 ring-offset-background ring-foreground/20'
                  )}
                >
                  <button
                    className="cursor-pointer"
                    onClick={() => setExpandedPinId(isExpanded ? null : pin.id)}
                    title={pin.content.slice(0, 100)}
                  >
                    {label}
                  </button>
                  {onPinDelete && (
                    <button
                      className="cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-current hover:text-foreground ml-0.5 text-[10px] leading-none"
                      onClick={(e) => { e.stopPropagation(); onPinDelete(pin.id); }}
                      title="Unpin"
                    >
                      &#10005;
                    </button>
                  )}
                </span>
              );
            })}
            {onPinCreate && !showPinForm && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setShowPinForm(true)}
              >
                + Pin
              </Button>
            )}
            {showPinForm && (
              <form
                className="shrink-0 inline-flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pinFormContent.trim() && channel) {
                    onPinCreate!(channel.id, pinFormContent.trim(), pinFormLabel.trim() || undefined);
                    setPinFormContent('');
                    setPinFormLabel('');
                    setShowPinForm(false);
                  }
                }}
              >
                <input
                  type="text"
                  value={pinFormLabel}
                  onChange={(e) => setPinFormLabel(e.target.value)}
                  placeholder="Label"
                  className="w-16 px-1.5 py-0.5 rounded bg-muted text-[11px] outline-none border border-border"
                  autoFocus
                />
                <input
                  type="text"
                  value={pinFormContent}
                  onChange={(e) => setPinFormContent(e.target.value)}
                  placeholder="Content"
                  className="w-32 px-1.5 py-0.5 rounded bg-muted text-[11px] outline-none border border-border"
                />
                <Button type="submit" variant="ghost" size="sm" className="h-5 px-1.5 text-[11px]">Add</Button>
                <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[11px] text-muted-foreground" onClick={() => setShowPinForm(false)}>&#10005;</Button>
              </form>
            )}
          </div>
          {expandedPinId && (() => {
            const pin = pins.find((p) => p.id === expandedPinId);
            if (!pin) return null;
            return (
              <div className="mt-1.5 p-2 rounded bg-muted text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                {pin.content || '(empty)'}
              </div>
            );
          })()}
        </div>
      )}
      {showChannelTodos && channel && onChannelTodoCreate && onChannelTodoUpdate && onChannelTodoDelete && (
        <ChannelTodoPanel
          channelId={channel.id}
          items={channelTodoItems || []}
          onClose={() => setShowChannelTodos(false)}
          onCreate={onChannelTodoCreate}
          onUpdate={onChannelTodoUpdate}
          onDelete={onChannelTodoDelete}
        />
      )}
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
              {onPinMessage && channel && (
                <button
                  className="cursor-pointer absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground text-sm"
                  onClick={() => onPinMessage(channel.id, msg.id)}
                  title="Pin this message"
                >
                  &#128204;
                </button>
              )}
            </div>
            );
          })}
          {notifications.filter(n => !n.read).map((notif) => (
            <div key={notif.id} className="flex gap-3 py-1 mb-2 border-l-2 border-blue-400 pl-2 bg-blue-400/5 rounded-r">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold shrink-0 bg-blue-500 text-white">
                &#8644;
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-blue-400">Cross-post</span>
                  <span className="text-[10px] text-muted-foreground">
                    from #{notif.sourceChannelId}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatTime(notif.createdAt)}</span>
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {notif.content}
                </div>
              </div>
            </div>
          ))}
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
