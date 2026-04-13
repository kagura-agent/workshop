import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DmView } from './DmView';
import type { Agent, DirectMessage } from '../types';

const mockAgent: Agent = {
  id: 'agent-1',
  name: 'Alice',
  status: 'online',
};

const mockMessages: DirectMessage[] = [
  { id: 'dm-1', fromId: 'user', toId: 'agent-1', content: 'Hello Alice!', timestamp: '2024-01-01T00:00:00Z', read: true },
  { id: 'dm-2', fromId: 'agent-1', toId: 'user', content: 'Hi there!', timestamp: '2024-01-01T00:01:00Z', read: true },
  { id: 'dm-3', fromId: 'user', toId: 'agent-1', content: 'How are you?', timestamp: '2024-01-01T00:02:00Z', read: true },
];

describe('DmView', () => {
  it('renders partner name in header', () => {
    render(
      <DmView
        partnerId="agent-1"
        partnerAgent={mockAgent}
        messages={[]}
        onSendMessage={vi.fn()}
        onMarkRead={vi.fn()}
      />
    );
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('renders messages with correct sender names', () => {
    render(
      <DmView
        partnerId="agent-1"
        partnerAgent={mockAgent}
        messages={mockMessages}
        onSendMessage={vi.fn()}
        onMarkRead={vi.fn()}
      />
    );
    // "You" should appear for user messages, "Alice" for agent messages
    const yous = screen.getAllByText('You');
    expect(yous.length).toBe(2);
    // Alice appears in header + in messages
    const alices = screen.getAllByText('Alice');
    expect(alices.length).toBeGreaterThanOrEqual(2); // header + message(s)
  });

  it('renders message content', () => {
    render(
      <DmView
        partnerId="agent-1"
        partnerAgent={mockAgent}
        messages={mockMessages}
        onSendMessage={vi.fn()}
        onMarkRead={vi.fn()}
      />
    );
    expect(screen.getByText('Hello Alice!')).toBeTruthy();
    expect(screen.getByText('Hi there!')).toBeTruthy();
    expect(screen.getByText('How are you?')).toBeTruthy();
  });

  it('shows empty state when no messages', () => {
    render(
      <DmView
        partnerId="agent-1"
        partnerAgent={mockAgent}
        messages={[]}
        onSendMessage={vi.fn()}
        onMarkRead={vi.fn()}
      />
    );
    expect(screen.getByText('No messages yet. Start a conversation!')).toBeTruthy();
  });

  it('calls onSendMessage when form is submitted', () => {
    const onSendMessage = vi.fn();
    render(
      <DmView
        partnerId="agent-1"
        partnerAgent={mockAgent}
        messages={[]}
        onSendMessage={onSendMessage}
        onMarkRead={vi.fn()}
      />
    );
    const input = screen.getByPlaceholderText('Message Alice');
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('does not submit empty messages', () => {
    const onSendMessage = vi.fn();
    render(
      <DmView
        partnerId="agent-1"
        partnerAgent={mockAgent}
        messages={[]}
        onSendMessage={onSendMessage}
        onMarkRead={vi.fn()}
      />
    );
    const input = screen.getByPlaceholderText('Message Alice');
    fireEvent.submit(input.closest('form')!);
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('calls onMarkRead on mount', () => {
    const onMarkRead = vi.fn();
    render(
      <DmView
        partnerId="agent-1"
        partnerAgent={mockAgent}
        messages={[]}
        onSendMessage={vi.fn()}
        onMarkRead={onMarkRead}
      />
    );
    expect(onMarkRead).toHaveBeenCalled();
  });

  it('uses partnerId as name when no agent provided', () => {
    render(
      <DmView
        partnerId="unknown-agent"
        partnerAgent={null}
        messages={[]}
        onSendMessage={vi.fn()}
        onMarkRead={vi.fn()}
      />
    );
    expect(screen.getByText('unknown-agent')).toBeTruthy();
  });
});
