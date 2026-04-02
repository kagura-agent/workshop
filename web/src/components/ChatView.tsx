import { useState, useRef, useEffect } from 'react';
import type { Message } from '../types';

interface ChatViewProps {
  roomName: string | null;
  messages: Message[];
  onSendMessage: (content: string) => void;
}

export function ChatView({ roomName, messages, onSendMessage }: ChatViewProps) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  };

  if (!roomName) {
    return (
      <div className="chat-view">
        <div className="empty-state">Select a room to start chatting</div>
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

  return (
    <div className="chat-view">
      <div className="chat-header">{roomName}</div>
      <div className="message-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="empty-state">No messages yet. Say something!</div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="message">
            <div className={`message-avatar ${msg.role === 'user' ? 'user' : ''}`}>
              {msg.senderName.charAt(0).toUpperCase()}
            </div>
            <div className="message-body">
              <div className="message-header">
                <span className="message-sender">{msg.senderName}</span>
                <span className="message-time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="message-content">{msg.content}</div>
            </div>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message #${roomName}`}
        />
      </form>
    </div>
  );
}
