# @Mention Highlight in Message Content

**Issue:** #4  
**Date:** 2026-04-08  
**Status:** Design

## Problem

`@AgentName` appears as plain text in chat messages. It should be visually distinct, like Discord's mention highlighting.

## Solution

A `renderMessageContent(content, agents)` utility that parses `@mentions` in message text and renders matched agent names as styled inline spans.

## Parsing

- Regex: `/@(\w[\w-]*)/g` (same pattern the server uses in `router.ts:124`)
- For each `@word` match, check if `word` matches a known agent name or ID (case-insensitive)
- Matched mentions render as highlighted `<span>` elements
- Unmatched `@word` tokens render as plain text

### Match examples

| Input | Agent list | Result |
|-------|-----------|--------|
| `@Kagura` | [Kagura] | Highlighted |
| `@kagura` | [Kagura] | Highlighted (case-insensitive match on ID) |
| `@unknown` | [Kagura] | Plain text |
| `someone@email` | [Kagura] | Plain text (`@email` — no agent match) |
| `Hey @Kagura and @Anan` | [Kagura, Anan] | Both highlighted |

## Styling

Tailwind classes on the mention `<span>`:

```
text-discord-accent bg-discord-accent/15 rounded px-0.5 hover:bg-discord-accent/25 cursor-pointer
```

This gives: purple/blue text, subtle semi-transparent background, rounded corners, hover darkening. The `cursor-pointer` and hover state prepare for future click-to-scroll (not implemented now).

## File structure

### New file: `web/src/lib/mentions.tsx`

```tsx
export function renderMessageContent(
  content: string,
  agents: Agent[]
): React.ReactNode[]
```

- Builds a lookup Map from agent names/IDs (lowercased) to agent objects
- Iterates through regex matches, splitting content into text segments and mention spans
- Returns an array of React nodes

### Modified file: `web/src/components/ChatView.tsx`

- Import `renderMessageContent`
- Replace `{msg.content}` (line 153) with `{renderMessageContent(msg.content, channelAgents)}`
- `channelAgents` is already available as a prop — no new data plumbing needed

## Scope boundaries

**In scope:**
- Parse and highlight @mentions that match known agents
- Discord-like styling (colored text, subtle background, rounded)
- Hover state for future interactivity

**Out of scope:**
- Click-to-scroll to agent info (issue says "future")
- Self-mention / "you were mentioned" notifications
- Markdown rendering (separate UI polish item)
- Server-side changes (none needed)

## Testing

- Verify `@AgentName` highlights correctly for agents in the channel
- Verify unmatched `@words` remain plain text
- Verify messages with no mentions render unchanged
- Verify multiple mentions in one message all highlight
- Verify case-insensitive matching works
- Verify hover state visual feedback
