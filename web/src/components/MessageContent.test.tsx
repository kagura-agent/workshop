import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageContent } from './MessageContent';
import type { Agent } from '../types';

const agents: Agent[] = [
  { id: 'kagura', name: 'Kagura', status: 'online' },
  { id: 'anan', name: 'Anan', avatar: '🤖', status: 'online' },
  { id: 'img-agent', name: 'ImgBot', avatar: 'https://example.com/avatar.png', status: 'online' },
];

describe('MessageContent', () => {
  describe('markdown rendering', () => {
    it('renders bold text', () => {
      render(<MessageContent content="This is **bold** text" agents={[]} />);
      const bold = document.querySelector('strong');
      expect(bold).not.toBeNull();
      expect(bold!.textContent).toBe('bold');
    });

    it('renders italic text', () => {
      render(<MessageContent content="This is *italic* text" agents={[]} />);
      const italic = document.querySelector('em');
      expect(italic).not.toBeNull();
      expect(italic!.textContent).toBe('italic');
    });

    it('renders inline code', () => {
      render(<MessageContent content="Use `console.log`" agents={[]} />);
      const code = document.querySelector('code');
      expect(code).not.toBeNull();
      expect(code!.textContent).toBe('console.log');
    });

    it('renders fenced code blocks with dark background', () => {
      render(
        <MessageContent
          content={'```js\nconst x = 1;\n```'}
          agents={[]}
        />
      );
      const pre = document.querySelector('pre');
      expect(pre).not.toBeNull();
      expect(pre!.className).toContain('bg-zinc-900');
      expect(pre!.className).toContain('overflow-x-auto');
    });

    it('renders unordered lists', () => {
      render(<MessageContent content={"- item one\n- item two"} agents={[]} />);
      const items = document.querySelectorAll('li');
      expect(items.length).toBe(2);
    });

    it('renders tables with GFM', () => {
      render(
        <MessageContent
          content={"| A | B |\n|---|---|\n| 1 | 2 |"}
          agents={[]}
        />
      );
      const table = document.querySelector('table');
      expect(table).not.toBeNull();
    });
  });

  describe('@mention integration', () => {
    it('highlights a known agent mention', () => {
      render(<MessageContent content="Hey @Kagura check this" agents={agents} />);
      const mention = document.querySelector('.mention');
      expect(mention).not.toBeNull();
      expect(mention!.textContent).toBe('@Kagura');
    });

    it('does not highlight unknown mentions', () => {
      render(<MessageContent content="Hey @stranger" agents={agents} />);
      const mention = document.querySelector('.mention');
      expect(mention).toBeNull();
    });

    it('renders markdown around mentions', () => {
      render(<MessageContent content="**bold** @Kagura *italic*" agents={agents} />);
      expect(document.querySelector('strong')).not.toBeNull();
      expect(document.querySelector('.mention')).not.toBeNull();
      expect(document.querySelector('em')).not.toBeNull();
    });

    it('renders multiple mentions', () => {
      render(<MessageContent content="@Kagura and @Anan" agents={agents} />);
      const mentions = document.querySelectorAll('.mention');
      expect(mentions.length).toBe(2);
    });
  });

  describe('link rendering', () => {
    it('renders links with target=_blank', () => {
      render(
        <MessageContent
          content="Visit [here](https://example.com)"
          agents={[]}
        />
      );
      const link = document.querySelector('a');
      expect(link).not.toBeNull();
      expect(link!.getAttribute('target')).toBe('_blank');
      expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('renders auto-linked URLs with GFM', () => {
      render(
        <MessageContent content="Go to https://example.com" agents={[]} />
      );
      const link = document.querySelector('a');
      expect(link).not.toBeNull();
      expect(link!.getAttribute('href')).toBe('https://example.com');
    });
  });

  describe('avatar rendering', () => {
    it('shows image avatar when agent has http URL', () => {
      const agent = agents.find(a => a.id === 'img-agent')!;
      expect(agent.avatar?.startsWith('http')).toBe(true);
    });

    it('falls back to initial when no avatar URL', () => {
      const agent = agents.find(a => a.id === 'kagura')!;
      expect(agent.avatar?.startsWith('http')).toBeFalsy();
      // Fallback is first character
      expect(agent.name.charAt(0).toUpperCase()).toBe('K');
    });

    it('falls back to initial when avatar is emoji (not URL)', () => {
      const agent = agents.find(a => a.id === 'anan')!;
      expect(agent.avatar?.startsWith('http')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns null for empty content', () => {
      const { container } = render(<MessageContent content="" agents={agents} />);
      expect(container.innerHTML).toBe('');
    });

    it('handles content with only a mention', () => {
      render(<MessageContent content="@Kagura" agents={agents} />);
      const mention = document.querySelector('.mention');
      expect(mention).not.toBeNull();
      expect(mention!.textContent).toBe('@Kagura');
    });
  });
});
