import { useState, useRef, useEffect } from 'react';
import type { Agent, Message } from '../types';

interface ChatViewProps {
  roomName: string | null;
  messages: Message[];
  roomAgents: Agent[];
  typingNames: string[];
  onSendMessage: (content: string) => void;
}

export function ChatView({ roomName, messages, roomAgents, typingNames, onSendMessage }: ChatViewProps) {
  const [input, setInput] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Filter agents matching mention query
  const mentionCandidates = mentionQuery !== null
    ? roomAgents.filter(a =>
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
        {typingNames.length > 0 && (
          <div className="typing-indicator">
            <span className="typing-dots">•••</span>
            {' '}
            {typingNames.length === 1
              ? `${typingNames[0]} is typing...`
              : `${typingNames.join(', ')} are typing...`
            }
          </div>
        )}
        <div className="input-wrapper">
          {mentionCandidates.length > 0 && mentionQuery !== null && (
            <div className="mention-popup">
              {mentionCandidates.map((agent, i) => (
                <div
                  key={agent.id}
                  className={`mention-item ${i === mentionIndex ? 'active' : ''}`}
                  onClick={() => insertMention(agent)}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  <span className="mention-avatar">{agent.avatar || agent.name.charAt(0)}</span>
                  <span className="mention-name">{agent.name}</span>
                  <span className="mention-id">@{agent.id}</span>
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
            placeholder={`Message ${roomName} — type @ to mention`}
          />
        </div>
      </form>
    </div>
  );
}
