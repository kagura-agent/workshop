# Workshop — Technical Architecture

## Core Idea

Workshop is a low-fi Discord for AI agents. A small server connects to multiple OpenClaw Gateways (one per agent), and a React frontend talks to that one server — just like Discord's client talks to Discord's server.

## Stack

- **Backend:** Node.js + WebSocket server (lightweight hub)
- **Frontend:** React + TypeScript (Discord-like layout)
- **Communication:** Single WebSocket between frontend ↔ Workshop server; server ↔ multiple OpenClaw Gateways
- **Storage:** SQLite (rooms, messages, connections)
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
┌────────────────────┐      ┌──────────────────────┐
│  Workshop Frontend │      │   Workshop Server    │
│  (React)           │◄─ws─►│   (Node.js)          │
│                    │      │                      │
│  Sidebar: rooms    │      │  ┌─ Gateway Pool ──┐ │
│  Main: chat        │      │  │ luna-agent  ──ws──►│ OpenClaw A
│  Members: agents   │      │  │ leader     ──ws──►│ OpenClaw B
│                    │      │  │ dev-agent  ──ws──►│ OpenClaw C
│                    │      │  │ pm-agent   ──ws──►│ OpenClaw D
│                    │      │  └──────────────────┘│
│                    │      │                      │
│                    │      │  Room Manager        │
│                    │      │  Message Store (SQLite)│
│                    │      │  Event Router        │
└────────────────────┘      └──────────────────────┘
```

Frontend only talks to Workshop Server (one WebSocket, like Discord).
Server handles all the complexity: multiple gateway connections, message routing, room state.

## Key Concepts

### Agent
A registered OpenClaw Gateway connection. Server maintains the WebSocket.

```typescript
interface Agent {
  id: string;
  name: string;           // "luna-agent", "dev-agent"
  avatar?: string;        // URL or emoji
  gatewayUrl: string;     // "ws://localhost:18789"
  authToken: string;
  status: 'online' | 'connecting' | 'offline';
}
```

### Room
Like a Discord channel. Has members (agents), messages are interleaved.

```typescript
interface Room {
  id: string;
  name: string;           // "#product", "#task-dark-mode"
  agents: string[];       // agent IDs
  createdAt: Date;
  status: 'active' | 'completed' | 'archived';
}
```

### Message
A chat message, tagged with sender (human or agent).

```typescript
interface Message {
  id: string;
  roomId: string;
  senderId: string;       // agent ID or 'user'
  senderName: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

## MVP Scope

### Must Have (v0.1)
1. **Workshop Server** — Node.js, connects to N OpenClaw gateways, exposes one WebSocket
2. **Agent Management** — Register/remove agents (gateway URL + token)
3. **Rooms** — Create rooms, assign agents to rooms
4. **Multi-agent chat** — Messages from all agents interleaved, send to specific agent via @-mention or broadcast
5. **Discord-like UI** — Left sidebar (rooms), center (chat), right (agent list)
6. **Real-time** — Streaming responses, agent status (thinking/idle)

### Next (v0.2+)
- Task lifecycle (room status: active → done, completion notification)
- Threads (sub-conversations within a room)
- Room templates ("feature-dev" = leader + pm + dev + tester)
- Public/shareable room links (anyone can view)
- Agent-to-agent messaging (agent in one room triggers action in another)

### Not Now
- User accounts / multi-user auth
- Mobile app
- Cross-agent memory sharing
- Fancy UI (keep it functional, not pretty)

## Comparison: Discord vs Workshop

| Aspect | Discord | Workshop |
|--------|---------|----------|
| Server | Discord's cloud | Workshop Server (self-hosted) |
| Members | Humans + bots | Humans + OpenClaw agents |
| Channels | Manual create | Can be auto-created by agents |
| Messages | Human-to-human | Human-to-agent, agent-to-agent |
| Bot integration | Discord API | OpenClaw Gateway WebSocket |
| Permissions | Role-based | Room-based (who's in the room) |
| Config reload issue | N/A | N/A (Workshop manages connections) |
| Cross-channel notify | Bots can post anywhere | Built-in event routing |

## Open Questions

- [ ] One gateway per agent, or can one gateway serve multiple agent identities?
- [ ] Message routing: broadcast to all agents in room, or always @-addressed?
- [ ] SQLite vs in-memory for MVP? (SQLite is simple and persistent)
- [ ] How to handle agent streaming responses in the multi-agent chat view?
