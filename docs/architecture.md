# Workshop — Technical Architecture

## Core Idea

Workshop is a React web app that connects to multiple OpenClaw Gateway instances simultaneously. Each gateway connection represents one agent. The UI arranges these into rooms (channels) where humans and agents interact.

## Stack

- **Frontend:** React + TypeScript
- **Communication:** WebSocket (OpenClaw Gateway protocol)
- **State:** Local (no backend needed for MVP)
- **Build:** Vite

## How It Connects to OpenClaw

OpenClaw Gateway exposes a WebSocket API with these key methods:

### Chat
- `chat.send` — Send a message to an agent
- `chat.history` — Load conversation history
- `chat.abort` — Cancel an in-progress agent run

### Sessions
- `sessions.subscribe` — Get real-time updates on session state
- `sessions.compact` — Compact session history
- `sessions.delete` — Delete a session
- `sessions.patch` — Update session metadata
- `sessions.usage` — Get token usage stats
- `sessions.reset` — Reset a session

### Other
- `cron.list/add/remove/run/update` — Manage scheduled tasks
- `config.apply/set` — Update configuration
- `logs.tail` — Stream logs
- `models.list` — List available models
- `skills.status/update` — Manage skills

### Auth
- Token-based: `connect.params.auth.token`
- Password-based: `connect.params.auth.password`
- Device pairing for new connections

## Architecture

```
┌──────────────────────────────────────────┐
│            Workshop (React App)           │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │         Connection Manager          │ │
│  │  gateway-1 (luna-agent)    ──ws──►  │ │ OpenClaw Gateway A
│  │  gateway-2 (leader-agent)  ──ws──►  │ │ OpenClaw Gateway B
│  │  gateway-3 (dev-agent)     ──ws──►  │ │ OpenClaw Gateway C
│  │  gateway-4 (pm-agent)      ──ws──►  │ │ ...
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │           Room Manager              │ │
│  │  #product  → [luna-agent]           │ │
│  │  #task-001 → [leader, dev, pm]      │ │
│  │  #task-002 → [leader, tester]       │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │              UI Layer               │ │
│  │  Sidebar: room list                 │ │
│  │  Main: chat messages (multi-agent)  │ │
│  │  Thread: sub-conversations          │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

## Key Concepts

### Connection
A WebSocket connection to one OpenClaw Gateway instance. Each connection = one agent.

```typescript
interface AgentConnection {
  id: string;
  name: string;           // "luna-agent", "dev-agent"
  gatewayUrl: string;     // "ws://localhost:18789"
  authToken: string;
  status: 'connected' | 'connecting' | 'disconnected';
}
```

### Room
A logical grouping of agent connections. Messages from all agents in a room are interleaved in one chat view.

```typescript
interface Room {
  id: string;
  name: string;           // "#product", "#task-dark-mode"
  agents: string[];       // connection IDs
  messages: Message[];
  createdAt: Date;
  status: 'active' | 'completed' | 'archived';
}
```

### Message
A chat message, tagged with which agent it came from.

```typescript
interface Message {
  id: string;
  roomId: string;
  agentId: string;        // which connection sent/received this
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

## MVP Scope

### Must Have (Day 1)
1. **Connect to multiple OpenClaw gateways** — Add/remove connections via settings
2. **Rooms** — Create rooms, assign agents to rooms
3. **Multi-agent chat** — See messages from all agents in a room, send messages (broadcasts to all agents or @-specific agent)
4. **Real-time** — WebSocket streaming, see agent responses as they come

### Nice to Have (Day 2+)
- Task lifecycle (room status: active → done)
- Threads (sub-conversations within a room)
- @-mention routing (message goes to specific agent only)
- Agent status indicators (thinking, idle, error)
- Room templates ("feature-dev" = leader + pm + dev + tester)
- Public/shareable room links

### Not Now
- Own backend (everything is client-side connecting to OpenClaw gateways)
- User accounts / auth (single user for now)
- Mobile app
- Cross-agent memory sharing

## OpenClaw Control UI Reference

OpenClaw's built-in UI (Vite + Lit):
- Source: `openclaw/ui/` 
- Stack: Lit web components (not React)
- Connects to one gateway only
- Single chat view, no rooms/channels concept
- Manages cron, config, sessions, skills

We're not forking it — we're building a different product that talks to the same API.

## Open Questions

- [ ] Can one Gateway serve multiple "sessions" (e.g., different channel contexts) or do we need one Gateway per agent?
- [ ] How to handle message routing when user sends to a room with multiple agents — broadcast or addressed?
- [ ] Should rooms persist across browser reloads? (localStorage for MVP)
- [ ] How to display agent identity (name, avatar) in the chat — pull from gateway or configure in Workshop?
