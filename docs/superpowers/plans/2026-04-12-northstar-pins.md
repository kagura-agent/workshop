# NorthStar & Pins Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add standalone north_stars table, pins table, pin sync logic, and frontend UI so channels can display pinned TODO sections and north star content.

**Architecture:** The server gets two new tables (north_stars, pins) with WebSocket message handlers following the existing TODO CRUD pattern. Pin sync logic auto-creates/updates pins when TODOs change or north stars are set. The frontend adds north star editing to TodoPanel and a pinned items bar below the channel header in ChatView.

**Tech Stack:** TypeScript, better-sqlite3, uuid, React, Tailwind CSS, shadcn/ui

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `server/src/db.ts` | Modify | Add `north_stars` and `pins` CREATE TABLE statements |
| `server/src/types.ts` | Modify | Add `NorthStar`, `Pin` interfaces + new message types |
| `server/src/router.ts` | Modify | Add handlers for north_star_get/set, pin_list, pin sync |
| `web/src/types.ts` | Modify | Add `NorthStar`, `Pin` interfaces + new message types |
| `web/src/App.tsx` | Modify | Wire north star + pin state, handle new server messages |
| `web/src/components/TodoPanel.tsx` | Modify | Add north star display/edit section at top |
| `web/src/components/ChatView.tsx` | Modify | Add pinned items bar below channel header |

---

### Task 1: Add north_stars and pins tables to database

**Files:**
- Modify: `server/src/db.ts:80-113`

- [ ] **Step 1: Add table creation SQL**

In `server/src/db.ts`, after the existing `d.exec()` block that creates `todo_items`, `todo_history`, and `cron_executions` (line 81-113), add two new tables inside the same `d.exec()` call:

Add this SQL before the closing `);` on line 113:

```sql

    CREATE TABLE IF NOT EXISTS north_stars (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'global',
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pins (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );
```

The final `d.exec()` block (lines 81-113) should contain all six `CREATE TABLE IF NOT EXISTS` statements: `todo_items`, `todo_history`, `cron_executions`, `north_stars`, `pins`.

- [ ] **Step 2: Verify compilation**

Run: `cd /home/kagura/.openclaw/workspace/workshop/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/db.ts
git commit -m "feat(§2): add north_stars and pins tables"
```

---

### Task 2: Add NorthStar and Pin types to server

**Files:**
- Modify: `server/src/types.ts:14-68` (after TodoItem, before ClientMessage)

- [ ] **Step 1: Add NorthStar and Pin interfaces**

In `server/src/types.ts`, after the `TodoItem` interface (after line 42), add:

```typescript
export interface NorthStar {
  id: string;
  scope: 'global' | string; // 'global' or channel ID
  content: string;
  updatedAt: string;
}

export interface Pin {
  id: string;
  channelId: string;
  type: 'todo_section' | 'north_star' | 'custom';
  sourceId: string; // section name or north_star.id
  content: string;  // rendered snapshot
  updatedAt: string;
}
```

- [ ] **Step 2: Add new ClientMessage types**

In `server/src/types.ts`, add these variants to the `ClientMessage` union (after the `cron_history` line, before the closing semicolon at line 68):

```typescript
  | { type: 'north_star_get'; scope?: string }
  | { type: 'north_star_set'; scope: string; content: string }
  | { type: 'pin_list'; channelId: string }
```

- [ ] **Step 3: Add new ServerMessage types**

In `server/src/types.ts`, add these variants to the `ServerMessage` union (after the `cron_history` line, before `error`):

```typescript
  | { type: 'north_star'; star: NorthStar }
  | { type: 'pin_list'; channelId: string; pins: Pin[] }
  | { type: 'pin_updated'; channelId: string; pin: Pin }
```

- [ ] **Step 4: Verify compilation**

Run: `cd /home/kagura/.openclaw/workspace/workshop/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(§2): add NorthStar and Pin types to server"
```

---

### Task 3: Add NorthStar and Pin types to frontend

**Files:**
- Modify: `web/src/types.ts:37-88`

- [ ] **Step 1: Add NorthStar and Pin interfaces**

In `web/src/types.ts`, after the `CronExecution` interface (after line 46), add:

```typescript
export interface NorthStar {
  id: string;
  scope: 'global' | string;
  content: string;
  updatedAt: string;
}

export interface Pin {
  id: string;
  channelId: string;
  type: 'todo_section' | 'north_star' | 'custom';
  sourceId: string;
  content: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add new ServerMessage types**

In `web/src/types.ts`, add these to the `ServerMessage` union (after the `cron_history` line, before `error`):

```typescript
  | { type: 'north_star'; star: NorthStar }
  | { type: 'pin_list'; channelId: string; pins: Pin[] }
  | { type: 'pin_updated'; channelId: string; pin: Pin }
```

- [ ] **Step 3: Add new ClientMessage types**

In `web/src/types.ts`, add these to the `ClientMessage` union (after `cron_history`):

```typescript
  | { type: 'north_star_get'; scope?: string }
  | { type: 'north_star_set'; scope: string; content: string }
  | { type: 'pin_list'; channelId: string }
```

- [ ] **Step 4: Verify compilation**

Run: `cd /home/kagura/.openclaw/workspace/workshop/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add web/src/types.ts
git commit -m "feat(§2): add NorthStar and Pin types to frontend"
```

---

### Task 4: Add north_star_get, north_star_set, and pin_list handlers to router

**Files:**
- Modify: `server/src/router.ts`

- [ ] **Step 1: Update imports**

In `server/src/router.ts` line 6, add `NorthStar` and `Pin` to the import:

```typescript
import type { ClientMessage, ServerMessage, Message, Channel, Agent, TodoItem, CronExecution, NorthStar, Pin } from './types.js';
```

- [ ] **Step 2: Add cases to handleClientMessage switch**

In `server/src/router.ts`, in the `handleClientMessage` switch (around line 109-149), add these cases before the `default` case:

```typescript
      case 'north_star_get':
        this.handleNorthStarGet(ws, msg.scope);
        break;
      case 'north_star_set':
        this.handleNorthStarSet(msg.scope, msg.content);
        break;
      case 'pin_list':
        this.handlePinList(ws, msg.channelId);
        break;
```

- [ ] **Step 3: Add handleNorthStarGet method**

Add this method after `handleCronHistory` (around line 451):

```typescript
  private handleNorthStarGet(ws: WebSocket, scope?: string): void {
    const db = getDb();
    const s = scope ?? 'global';
    const row = db.prepare('SELECT * FROM north_stars WHERE scope = ?').get(s) as any;
    if (row) {
      const star: NorthStar = {
        id: row.id,
        scope: row.scope,
        content: row.content,
        updatedAt: row.updated_at,
      };
      this.sendTo(ws, { type: 'north_star', star });
    } else {
      // Return empty north star
      const star: NorthStar = { id: '', scope: s, content: '', updatedAt: '' };
      this.sendTo(ws, { type: 'north_star', star });
    }
  }
```

- [ ] **Step 4: Add handleNorthStarSet method**

Add this method after `handleNorthStarGet`:

```typescript
  private handleNorthStarSet(scope: string, content: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id FROM north_stars WHERE scope = ?').get(scope) as any;

    let star: NorthStar;
    if (existing) {
      db.prepare('UPDATE north_stars SET content = ?, updated_at = ? WHERE scope = ?').run(content, now, scope);
      star = { id: existing.id, scope, content, updatedAt: now };
    } else {
      const id = uuid();
      db.prepare('INSERT INTO north_stars (id, scope, content, updated_at) VALUES (?, ?, ?, ?)').run(id, scope, content, now);
      star = { id, scope, content, updatedAt: now };
    }

    this.broadcast({ type: 'north_star', star });

    // Pin sync: update any pins referencing this north star
    this.syncNorthStarPins(star);
  }
```

- [ ] **Step 5: Add handlePinList method**

Add this method after `handleNorthStarSet`:

```typescript
  private handlePinList(ws: WebSocket, channelId: string): void {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM pins WHERE channel_id = ? ORDER BY updated_at DESC').all(channelId) as any[];
    const pins: Pin[] = rows.map(this.mapPinRow);
    this.sendTo(ws, { type: 'pin_list', channelId, pins });
  }

  private mapPinRow(r: any): Pin {
    return {
      id: r.id,
      channelId: r.channel_id,
      type: r.type,
      sourceId: r.source_id,
      content: r.content,
      updatedAt: r.updated_at,
    };
  }
```

- [ ] **Step 6: Verify compilation**

Run: `cd /home/kagura/.openclaw/workspace/workshop/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add server/src/router.ts
git commit -m "feat(§2): add north_star_get/set and pin_list handlers"
```

---

### Task 5: Add pin sync logic to router

**Files:**
- Modify: `server/src/router.ts`

- [ ] **Step 1: Add syncNorthStarPins method**

Add after `mapPinRow`:

```typescript
  /** When a north star changes, update/create pins in channels that reference it. */
  private syncNorthStarPins(star: NorthStar): void {
    const db = getDb();
    const now = new Date().toISOString();

    // Find existing pins of type 'north_star' referencing this star's scope
    const existingPins = db.prepare(
      "SELECT * FROM pins WHERE type = 'north_star' AND source_id = ?"
    ).all(star.scope) as any[];

    for (const row of existingPins) {
      db.prepare('UPDATE pins SET content = ?, updated_at = ? WHERE id = ?').run(star.content, now, row.id);
      const pin: Pin = { id: row.id, channelId: row.channel_id, type: 'north_star', sourceId: star.scope, content: star.content, updatedAt: now };
      this.broadcast({ type: 'pin_updated', channelId: row.channel_id, pin });
    }

    // For global north star, auto-create a pin in every active channel if none exists
    if (star.scope === 'global' && star.content) {
      const channels = db.prepare("SELECT id FROM channels WHERE status = 'active'").all() as { id: string }[];
      const pinnedChannelIds = new Set(existingPins.map((r: any) => r.channel_id));
      for (const ch of channels) {
        if (!pinnedChannelIds.has(ch.id)) {
          const pinId = uuid();
          db.prepare('INSERT INTO pins (id, channel_id, type, source_id, content, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
            pinId, ch.id, 'north_star', star.scope, star.content, now
          );
          const pin: Pin = { id: pinId, channelId: ch.id, type: 'north_star', sourceId: star.scope, content: star.content, updatedAt: now };
          this.broadcast({ type: 'pin_updated', channelId: ch.id, pin });
        }
      }
    }
  }
```

- [ ] **Step 2: Add syncTodoSectionPins method**

Add after `syncNorthStarPins`:

```typescript
  /** When TODO items change, update pins for channels whose todoSection matches. */
  private syncTodoSectionPins(section: string): void {
    const db = getDb();
    const now = new Date().toISOString();

    // Find channels linked to this section
    const channels = db.prepare('SELECT id FROM channels WHERE todo_section = ?').all(section) as { id: string }[];
    if (channels.length === 0) return;

    // Render section content: list of TODO items in this section
    const todos = db.prepare('SELECT content, status FROM todo_items WHERE section = ? ORDER BY created_at ASC').all(section) as { content: string; status: string }[];
    const rendered = todos.map((t) => `[${t.status}] ${t.content}`).join('\n');

    for (const ch of channels) {
      // Find existing pin for this section in this channel
      const existing = db.prepare(
        "SELECT * FROM pins WHERE channel_id = ? AND type = 'todo_section' AND source_id = ?"
      ).get(ch.id, section) as any;

      if (existing) {
        db.prepare('UPDATE pins SET content = ?, updated_at = ? WHERE id = ?').run(rendered, now, existing.id);
        const pin: Pin = { id: existing.id, channelId: ch.id, type: 'todo_section', sourceId: section, content: rendered, updatedAt: now };
        this.broadcast({ type: 'pin_updated', channelId: ch.id, pin });
      } else {
        // Auto-create pin
        const pinId = uuid();
        db.prepare('INSERT INTO pins (id, channel_id, type, source_id, content, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
          pinId, ch.id, 'todo_section', section, rendered, now
        );
        const pin: Pin = { id: pinId, channelId: ch.id, type: 'todo_section', sourceId: section, content: rendered, updatedAt: now };
        this.broadcast({ type: 'pin_updated', channelId: ch.id, pin });
      }
    }
  }
```

- [ ] **Step 3: Wire pin sync into existing TODO handlers**

Add `this.syncTodoSectionPins(section)` at the end of these existing methods:

**In `handleTodoCreate`** (around line 370, after the `this.broadcast` call):
```typescript
    this.syncTodoSectionPins(section);
```

**In `handleTodoUpdate`** (around line 403, after the `this.broadcast` call):
```typescript
    const updatedRow = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as any;
    if (updatedRow) {
      this.syncTodoSectionPins(updatedRow.section);
    }
```
Note: the `updatedRow` fetch already exists on line 402 as `const row = ...`. Reuse that variable — add `this.syncTodoSectionPins(row.section);` after the broadcast on line 403.

**In `handleTodoDelete`** (around line 410, before the DELETE statements): Capture the section first, then sync after delete:
```typescript
    const existing = db.prepare('SELECT section FROM todo_items WHERE id = ?').get(id) as any;
    // ... existing delete statements ...
    if (existing) {
      this.syncTodoSectionPins(existing.section);
    }
```

- [ ] **Step 4: Send pin list on client connect**

In `addClient()` method (around line 24, after `this.handleTodoList(ws);`), we do NOT send all pins on connect since pins are per-channel. Instead, we'll request them when the user views a channel (handled in frontend Task 7).

No change needed here — the frontend will send `pin_list` when switching channels.

- [ ] **Step 5: Verify compilation**

Run: `cd /home/kagura/.openclaw/workspace/workshop/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add server/src/router.ts
git commit -m "feat(§2): add pin sync logic for TODO sections and north stars"
```

---

### Task 6: Wire north star and pin state in App.tsx

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add imports and state**

In `web/src/App.tsx`, update the import on line 9 to include new types:

```typescript
import type { Channel, Agent, Message, ServerMessage, TodoItem, NorthStar, Pin } from './types';
```

Add new state after `todoItems` state (line 22):

```typescript
  const [northStar, setNorthStar] = useState<NorthStar | null>(null);
  const [channelPins, setChannelPins] = useState<Record<string, Pin[]>>({});
```

- [ ] **Step 2: Add message handlers**

In the `handleMessage` callback, add these cases before the `error` case (before line 82):

```typescript
      case 'north_star':
        setNorthStar(msg.star);
        break;
      case 'pin_list':
        setChannelPins((prev) => ({ ...prev, [msg.channelId]: msg.pins }));
        break;
      case 'pin_updated':
        setChannelPins((prev) => {
          const existing = prev[msg.channelId] || [];
          const idx = existing.findIndex((p) => p.id === msg.pin.id);
          const updated = idx >= 0
            ? existing.map((p) => p.id === msg.pin.id ? msg.pin : p)
            : [...existing, msg.pin];
          return { ...prev, [msg.channelId]: updated };
        });
        break;
```

- [ ] **Step 3: Request north star and pins on connect and channel switch**

After the `useWebSocket` hook (line 88), add an effect to request global north star on connect and pins when channel changes:

```typescript
  // Request global north star on connect
  useEffect(() => {
    if (connected) {
      send({ type: 'north_star_get' });
    }
  }, [connected, send]);

  // Request pins when active channel changes
  useEffect(() => {
    if (connected && activeChannelId) {
      send({ type: 'pin_list', channelId: activeChannelId });
    }
  }, [connected, activeChannelId, send]);
```

Note: `useEffect` needs to be imported — it's already imported on line 1 (`useState, useCallback`). Add `useEffect`:

```typescript
import { useState, useCallback, useEffect } from 'react';
```

- [ ] **Step 4: Pass north star to TodoPanel**

Update the TodoPanel rendering (around line 141-148) to pass north star props:

```typescript
      {showTodoPanel && (
        <TodoPanel
          items={todoItems}
          northStar={northStar}
          onClose={() => setShowTodoPanel(false)}
          onCreate={(section, content) => send({ type: 'todo_create', section, content })}
          onUpdate={(id, updates) => send({ type: 'todo_update', id, updates })}
          onDelete={(id) => send({ type: 'todo_delete', id })}
          onSetNorthStar={(content) => send({ type: 'north_star_set', scope: 'global', content })}
        />
      )}
```

- [ ] **Step 5: Pass pins to ChatView**

Update the ChatView rendering (around line 130-139) to pass pins:

```typescript
      <ChatView
        channel={activeChannel ?? null}
        messages={activeChannelId ? (messages[activeChannelId] || []) : []}
        channelAgents={channelAgents}
        typingNames={typingNames}
        pins={activeChannelId ? (channelPins[activeChannelId] || []) : []}
        onSendMessage={handleSendMessage}
        onEditChannel={activeChannel ? handleEditChannel : undefined}
        onOpenSettings={activeChannel ? () => setShowChannelSettings(true) : undefined}
        onToggleTodo={() => setShowTodoPanel((v) => !v)}
      />
```

- [ ] **Step 6: Verify compilation**

Run: `cd /home/kagura/.openclaw/workspace/workshop/web && npx tsc --noEmit`
Expected: Errors about missing props on TodoPanel and ChatView (expected — we'll fix in Tasks 7-8)

- [ ] **Step 7: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(§2): wire north star and pin state in App"
```

---

### Task 7: Add north star display/edit to TodoPanel

**Files:**
- Modify: `web/src/components/TodoPanel.tsx`

- [ ] **Step 1: Update props interface and imports**

In `web/src/components/TodoPanel.tsx`, update the import on line 6:

```typescript
import type { TodoItem, TodoStatus, NorthStar } from '../types';
```

Update `TodoPanelProps` (line 8-14) to add north star props:

```typescript
interface TodoPanelProps {
  items: TodoItem[];
  northStar: NorthStar | null;
  onClose: () => void;
  onCreate: (section: string, content: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<TodoItem, 'content' | 'status' | 'section' | 'assignedChannel' | 'assignedAgent'>>) => void;
  onDelete: (id: string) => void;
  onSetNorthStar: (content: string) => void;
}
```

- [ ] **Step 2: Add north star state and destructure new props**

Update the component function signature (line 30):

```typescript
export function TodoPanel({ items, northStar, onClose, onCreate, onUpdate, onDelete, onSetNorthStar }: TodoPanelProps) {
```

Add state for editing north star after `newContent` state (line 32):

```typescript
  const [editingNorthStar, setEditingNorthStar] = useState(false);
  const [northStarDraft, setNorthStarDraft] = useState(northStar?.content ?? '');
```

- [ ] **Step 3: Add north star section to the panel**

In the JSX, after the header `<div>` (after line 62, the closing `</div>` of the header), add the north star section before the `<ScrollArea>`:

```tsx
      {/* North Star */}
      <div className="p-3 border-b border-border">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center justify-between">
          <span>North Star</span>
          <button
            className="text-muted-foreground hover:text-foreground cursor-pointer text-xs"
            onClick={() => {
              if (editingNorthStar) {
                onSetNorthStar(northStarDraft);
                setEditingNorthStar(false);
              } else {
                setNorthStarDraft(northStar?.content ?? '');
                setEditingNorthStar(true);
              }
            }}
          >
            {editingNorthStar ? 'Save' : 'Edit'}
          </button>
        </div>
        {editingNorthStar ? (
          <textarea
            value={northStarDraft}
            onChange={(e) => setNorthStarDraft(e.target.value)}
            className="w-full bg-muted text-xs p-2 rounded resize-none h-16 outline-none"
            placeholder="What's the overarching goal?"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSetNorthStar(northStarDraft);
                setEditingNorthStar(false);
              }
            }}
          />
        ) : (
          <div className="text-xs text-foreground/80 whitespace-pre-wrap">
            {northStar?.content || <span className="text-muted-foreground italic">No north star set</span>}
          </div>
        )}
      </div>
```

- [ ] **Step 4: Verify compilation**

Run: `cd /home/kagura/.openclaw/workspace/workshop/web && npx tsc --noEmit`
Expected: May still error on ChatView pins prop — that's Task 8

- [ ] **Step 5: Commit**

```bash
git add web/src/components/TodoPanel.tsx
git commit -m "feat(§2): add north star display/edit to TodoPanel"
```

---

### Task 8: Add pinned items bar to ChatView

**Files:**
- Modify: `web/src/components/ChatView.tsx`

- [ ] **Step 1: Update imports and props**

In `web/src/components/ChatView.tsx`, update the import on line 5:

```typescript
import type { Agent, Channel, Message, Pin } from '../types';
```

Update `ChatViewProps` (line 13-22) to add `pins`:

```typescript
interface ChatViewProps {
  channel: Channel | null;
  messages: Message[];
  channelAgents: Agent[];
  typingNames: string[];
  pins: Pin[];
  onSendMessage: (content: string) => void;
  onEditChannel?: () => void;
  onOpenSettings?: () => void;
  onToggleTodo?: () => void;
}
```

Update the destructured props in the function signature (line 24):

```typescript
export function ChatView({ channel, messages, channelAgents, typingNames, pins, onSendMessage, onEditChannel, onOpenSettings, onToggleTodo }: ChatViewProps) {
```

- [ ] **Step 2: Add expanded pin state**

After the `inputRef` state (line 30), add:

```typescript
  const [expandedPinId, setExpandedPinId] = useState<string | null>(null);
```

- [ ] **Step 3: Add pinned items bar in JSX**

After the channel header `<div>` (after line 171, the closing `</div>` of the header section), add the pins bar:

```tsx
      {pins.length > 0 && (
        <div className="px-4 py-1.5 border-b border-border bg-card/50 flex items-center gap-2 overflow-x-auto">
          {pins.map((pin) => (
            <button
              key={pin.id}
              className={cn(
                'shrink-0 px-2 py-1 rounded text-[11px] cursor-pointer border transition-colors',
                pin.type === 'north_star'
                  ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/20'
                  : 'bg-discord-accent/10 border-discord-accent/30 text-discord-accent hover:bg-discord-accent/20',
                expandedPinId === pin.id && 'ring-1 ring-foreground/20'
              )}
              onClick={() => setExpandedPinId(expandedPinId === pin.id ? null : pin.id)}
            >
              {pin.type === 'north_star' ? '★ North Star' : `📌 ${pin.sourceId}`}
            </button>
          ))}
        </div>
      )}
      {expandedPinId && (() => {
        const pin = pins.find((p) => p.id === expandedPinId);
        if (!pin) return null;
        return (
          <div className="px-4 py-2 border-b border-border bg-card/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-muted-foreground">
                {pin.type === 'north_star' ? 'North Star' : `TODO: ${pin.sourceId}`}
              </span>
              <button
                className="text-muted-foreground hover:text-foreground cursor-pointer text-xs"
                onClick={() => setExpandedPinId(null)}
              >
                &times;
              </button>
            </div>
            <div className="text-xs text-foreground/80 whitespace-pre-wrap">{pin.content || 'Empty'}</div>
          </div>
        );
      })()}
```

- [ ] **Step 4: Verify full compilation**

Run: `cd /home/kagura/.openclaw/workspace/workshop/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ChatView.tsx
git commit -m "feat(§2): add pinned items bar to ChatView"
```

---

### Task 9: Full build verification

**Files:** None (verification only)

- [ ] **Step 1: Compile server**

Run: `cd /home/kagura/.openclaw/workspace/workshop/server && npx tsc`
Expected: Clean compilation, no errors

- [ ] **Step 2: Build frontend**

Run: `cd /home/kagura/.openclaw/workspace/workshop/web && npx vite build`
Expected: Build succeeds with output bundle

- [ ] **Step 3: Final commit**

If any compilation fixes were needed, commit them:

```bash
git add -A
git commit -m "feat(v0.3 §2): NorthStar and Pins integration complete"
```
