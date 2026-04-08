# @Mention Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `@AgentName` mentions in chat messages with Discord-like highlight styling (colored text, subtle background).

**Architecture:** A pure function `renderMessageContent(content, agents)` parses `@word` tokens from message text, matches them against known agent names/IDs, and returns React nodes with highlighted spans for matches. The function lives in `web/src/lib/mentions.tsx` and is called from `ChatView.tsx` where message content is rendered.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest (new dev dependency for testing)

**Spec:** `docs/superpowers/specs/2026-04-08-mention-highlight-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `web/src/lib/mentions.tsx` | Create | `renderMessageContent()` — parses content, returns React nodes |
| `web/src/lib/mentions.test.tsx` | Create | Unit tests for mention parsing and rendering |
| `web/src/components/ChatView.tsx` | Modify | Call `renderMessageContent()` instead of raw `{msg.content}` |
| `web/package.json` | Modify | Add `vitest` + `@testing-library/react` dev deps |
| `web/vite.config.ts` | Modify | Add vitest config via `/// <reference>` |

---

### Task 1: Set up Vitest

**Files:**
- Modify: `web/package.json`
- Modify: `web/vite.config.ts`

- [ ] **Step 1: Install vitest and testing-library**

```bash
cd web && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add test config to vite.config.ts**

Add the vitest reference and test config to `web/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3100',
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to the `"scripts"` section of `web/package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest runs**

```bash
cd web && npx vitest run
```

Expected: `No test files found` (no tests yet, but vitest itself works).

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/vite.config.ts
git commit -m "chore: add vitest + testing-library to web"
```

---

### Task 2: Write failing tests for renderMessageContent

**Files:**
- Create: `web/src/lib/mentions.test.tsx`

The test file tests the pure function `renderMessageContent`. We use `@testing-library/react` `render` to test the React output.

- [ ] **Step 1: Write the test file**

Create `web/src/lib/mentions.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && npx vitest run src/lib/mentions.test.tsx
```

Expected: FAIL — `Cannot find module './mentions'`

- [ ] **Step 3: Commit failing tests**

```bash
git add web/src/lib/mentions.test.tsx
git commit -m "test: add failing tests for renderMessageContent (#4)"
```

---

### Task 3: Implement renderMessageContent

**Files:**
- Create: `web/src/lib/mentions.tsx`

- [ ] **Step 1: Create the mentions module**

Create `web/src/lib/mentions.tsx`:

```tsx
import type { Agent } from '../types';

/**
 * Parse message content and render @mentions as highlighted spans.
 * Matches @word tokens against known agent names and IDs (case-insensitive).
 */
export function renderMessageContent(
  content: string,
  agents: Agent[]
): React.ReactNode[] {
  if (!content) return [];

  // Build lookup: lowercase name/id → true
  const knownNames = new Set<string>();
  for (const agent of agents) {
    knownNames.add(agent.name.toLowerCase());
    knownNames.add(agent.id.toLowerCase());
  }

  const mentionPattern = /@(\w[\w-]*)/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(content)) !== null) {
    const word = match[1];
    const isAgent = knownNames.has(word.toLowerCase());

    // Push text before this match
    if (match.index > lastIndex) {
      result.push(content.slice(lastIndex, match.index));
    }

    if (isAgent) {
      result.push(
        <span
          key={match.index}
          className="mention text-discord-accent bg-discord-accent/15 rounded px-0.5 hover:bg-discord-accent/25 cursor-pointer"
        >
          {match[0]}
        </span>
      );
    } else {
      // Not a known agent — render as plain text
      result.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text after last match
  if (lastIndex < content.length) {
    result.push(content.slice(lastIndex));
  }

  return result;
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd web && npx vitest run src/lib/mentions.test.tsx
```

Expected: All 8 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/mentions.tsx
git commit -m "feat: implement renderMessageContent for @mention highlighting (#4)"
```

---

### Task 4: Integrate into ChatView

**Files:**
- Modify: `web/src/components/ChatView.tsx:1-4` (add import)
- Modify: `web/src/components/ChatView.tsx:153` (replace msg.content rendering)

- [ ] **Step 1: Add import to ChatView.tsx**

At the top of `web/src/components/ChatView.tsx`, add:

```tsx
import { renderMessageContent } from '@/lib/mentions';
```

- [ ] **Step 2: Replace plain text with parsed mentions**

In `web/src/components/ChatView.tsx`, find line 153:

```tsx
{msg.content}
```

Replace with:

```tsx
{renderMessageContent(msg.content, channelAgents)}
```

This is inside the message content `<div>` at line 153. The `channelAgents` prop is already available.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/ChatView.tsx
git commit -m "feat: integrate @mention highlighting into ChatView (#4)"
```

---

### Task 5: Manual verification and final commit

- [ ] **Step 1: Run all tests**

```bash
cd web && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Build check**

```bash
cd web && npx vite build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual smoke test (if server available)**

Start the dev server and verify:
1. Send a message with `@Kagura` — should show purple text with subtle background
2. Send `@unknown` — should render as plain text
3. Send `@Kagura and @Anan` — both should highlight
4. Hover over a mention — background should darken slightly

- [ ] **Step 4: Final commit if any tweaks were needed**

If any adjustments were needed during manual testing, commit them:

```bash
git add -A
git commit -m "fix: adjustments from manual @mention highlight testing (#4)"
```
