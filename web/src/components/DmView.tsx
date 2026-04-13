import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { MessageContent } from '@/components/MessageContent';
import type { Agent, DirectMessage } from '../types';

interface DmViewProps {
  partnerId: string;
  partnerAgent: Agent | null;
  messages: DirectMessage[];
  onSendMessage: (content: string) => void;
  onMarkRead: () => void;
}

export function DmView({ partnerId, partnerAgent, messages, onSendMessage, onMarkRead }: DmViewProps) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark as read on focus
  useEffect(() => {
    onMarkRead();
  }, [partnerId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const partnerName = partnerAgent?.name ?? partnerId;
  const avatarUrl = partnerAgent?.avatar?.startsWith('http') ? partnerAgent.avatar : null;

  return (
    <div className="flex-1 flex flex-col bg-muted">
      <div className="p-3 px-4 border-b border-border">
        <div className="flex items-center gap-2">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={partnerName}
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold bg-discord-accent text-white">
              {partnerName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-semibold">{partnerName}</span>
          {partnerAgent && (
            <span className={cn(
              'w-2 h-2 rounded-full',
              partnerAgent.status === 'online' ? 'bg-green-500' : partnerAgent.status === 'connecting' ? 'bg-yellow-500' : 'bg-muted-foreground/40'
            )} />
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4" ref={listRef}>
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No messages yet. Start a conversation!
            </div>
          )}
          {messages.map((msg) => {
            const isUser = msg.fromId === 'user';
            const senderName = isUser ? 'You' : partnerName;
            const senderAvatarUrl = isUser ? null : avatarUrl;
            return (
              <div key={msg.id} className="flex gap-3 py-1 mb-2">
                {senderAvatarUrl ? (
                  <img
                    src={senderAvatarUrl}
                    alt={senderName}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold shrink-0 text-white',
                      isUser ? 'bg-discord-online' : 'bg-discord-accent'
                    )}
                  >
                    {senderName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="font-semibold text-sm">{senderName}</span>
                    <span className="text-[11px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                  </div>
                  <MessageContent content={msg.content} agents={[]} />
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <form className="p-4" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${partnerName}`}
          className="w-full py-3 px-4 rounded-lg bg-card text-foreground text-sm outline-none border-none placeholder:text-muted-foreground/60"
        />
      </form>
    </div>
  );
}
