import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderMessageContent } from './mentions';
import type { Agent } from '../types';

const agents: Agent[] = [
  { id: 'kagura', name: 'Kagura', status: 'online' },
  { id: 'anan', name: 'Anan', avatar: '🤖', status: 'online' },
  { id: 'ruantang', name: 'Ruantang', status: 'offline' },
];

function Wrapper({ content }: { content: string }) {
  return <div data-testid="msg">{renderMessageContent(content, agents)}</div>;
}

describe('renderMessageContent', () => {
  it('returns plain text when no mentions exist', () => {
    render(<Wrapper content="Hello everyone" />);
    const msg = screen.getByTestId('msg');
    expect(msg.textContent).toBe('Hello everyone');
    expect(msg.querySelector('.mention')).toBeNull();
  });

  it('highlights a single @mention matching agent name', () => {
    render(<Wrapper content="Hey @Kagura what do you think?" />);
    const mention = screen.getByText('@Kagura');
    expect(mention.tagName).toBe('SPAN');
    expect(mention.classList.contains('mention')).toBe(true);
  });

  it('highlights a mention matching agent ID (lowercase)', () => {
    render(<Wrapper content="ping @kagura" />);
    const mention = screen.getByText('@kagura');
    expect(mention.classList.contains('mention')).toBe(true);
  });

  it('does not highlight unmatched @words', () => {
    render(<Wrapper content="email me at @unknown" />);
    const msg = screen.getByTestId('msg');
    expect(msg.querySelector('.mention')).toBeNull();
    expect(msg.textContent).toBe('email me at @unknown');
  });

  it('highlights multiple mentions in one message', () => {
    render(<Wrapper content="@Kagura and @Anan please review" />);
    const mentions = document.querySelectorAll('.mention');
    expect(mentions.length).toBe(2);
    expect(mentions[0].textContent).toBe('@Kagura');
    expect(mentions[1].textContent).toBe('@Anan');
  });

  it('handles mention at start and end of message', () => {
    render(<Wrapper content="@Kagura" />);
    const mention = screen.getByText('@Kagura');
    expect(mention.classList.contains('mention')).toBe(true);
  });

  it('preserves surrounding text around mentions', () => {
    render(<Wrapper content="Hello @Kagura, welcome!" />);
    const msg = screen.getByTestId('msg');
    expect(msg.textContent).toBe('Hello @Kagura, welcome!');
    const mentions = msg.querySelectorAll('.mention');
    expect(mentions.length).toBe(1);
  });

  it('returns empty array for empty string', () => {
    render(<Wrapper content="" />);
    const msg = screen.getByTestId('msg');
    expect(msg.textContent).toBe('');
  });
});
