# Workshop — Implementation Notes

Last updated: 2026-04-02

## Gateway Protocol (learned by trial and error)

### Connection Handshake

Workshop connects to OpenClaw Gateway via a **single shared WebSocket**. All agents share this connection. The protocol:

1. **Open WS** to `ws://localhost:18789` (no auth headers)
2. **Receive** `{ type: "event", event: "connect.challenge", payload: { nonce } }`
3. **Send** connect request:
```json
{
  "type": "req",
  "id": "<uuid>",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "openclaw-tui",
      "displayName": "Workshop",
      "version": "0.1.0",
      "platform": "linux",
      "mode": "ui"
    },
    "caps": [],
    "auth": { "token": "<gateway-token>" },
    "role": "operator",
    "scopes": ["operator.admin", "operator.write", "operator.read"]
  }
}
```
4. **Receive** `{ type: "res", id, ok: true, payload: { type: "hello-ok" } }`

### ⚠️ Client Identity Matters

**Must use `client.id: "openclaw-tui"` + `mode: "ui"`.**

Why: Gateway has a scope authorization system. Clients without device identity get their self-declared scopes **cleared** unless they're recognized as Control UI clients. Only `openclaw-tui` and `openclaw-control-ui` are treated as Control UI.

Using `client.id: "cli"` + `mode: "backend"` → scopes get cleared → `chat.send` rejected with `missing scope: operator.write`.

### ⚠️ Gateway Config Required

Add to `~/.openclaw/openclaw.json`:
```json
{
  "gateway": {
    "controlUi": {
      "allowInsecureAuth": true
    }
  }
}
```

This allows localhost HTTP (non-HTTPS) connections to retain scopes without device identity. Without this, TUI-identity connections get rejected with "control ui requires device identity".

**Do NOT use `dangerouslyDisableDeviceAuth: true`** — it breaks the browser Control UI's normal auth flow.

### Sending Messages (Multi-Agent)

When a user sends a message in a room, Workshop sends a **separate `chat.send`** for each agent in the room:

```json
{
  "type": "req",
  "id": "<uuid>",
  "method": "chat.send",
  "params": {
    "sessionKey": "agent:<agentId>:workshop:<roomId>",
    "message": "<content>",
    "idempotencyKey": "<uuid>"
  }
}
```

Each agent gets its own session key, so agents maintain **independent conversation contexts**. For example, in room `#product` with agents `kagura` and `anan`:
- `agent:kagura:workshop:product` — Kagura's session
- `agent:anan:workshop:product` — Anan's session

Response: `{ type: "res", id, ok: true, payload: { ... } }`

### Session Key Format

**`agent:{agentId}:workshop:{roomId}`**

Workshop sends the full session key directly. Events come back with the same key. Workshop parses `agentId` and `roomId` from the session key to route responses to the correct room and tag them with the correct agent name/avatar.

### Receiving Agent Responses

Gateway broadcasts **two types of events** for the same agent response:

#### 1. `"chat"` events (for TUI/Control UI clients)
```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "...",
    "sessionKey": "agent:kagura:workshop:product",
    "state": "delta" | "final" | "error",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "..." }],
      "timestamp": 1234567890
    }
  }
}
```

#### 2. `"agent"` events (broadcast to all clients)
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "...",
    "sessionKey": "agent:kagura:workshop:product",
    "stream": "assistant" | "lifecycle" | "tool",
    "data": { "text": "...", "delta": true|false }
  }
}
```

**Workshop uses `"chat"` events only** to avoid duplicates. `"agent"` events are ignored (they overlap with `chat` events for our sessions).

- `state: "delta"` — streaming partial text (don't store, can display for live typing)
- `state: "final"` — complete message text (store and broadcast to frontend)
- `state: "error"` — error from agent

### Other Events

- `"tick"` — keepalive, ignore
- `"health"` — gateway health status
- `"heartbeat"` — agent heartbeat

### Session Storage

Workshop sessions are stored in OpenClaw's normal session system:
- Session key: `agent:{agentId}:workshop:{roomId}`
- Channel: `webchat`
- Session file: `~/.openclaw/agents/{agentId}/sessions/<uuid>.jsonl`
- Visible in Control UI alongside Feishu/Discord sessions

## Server Architecture

```
workshop/server/
├── src/
│   ├── index.ts      — Entry: loads config, starts WS server, inits gateway
│   ├── db.ts         — SQLite: agents, rooms, room_agents, messages
│   ├── router.ts     — Message routing: frontend ↔ gateway (single connection)
│   ├── gateway.ts    — Shared gateway connection: auth, send, receive
│   └── types.ts      — TypeScript interfaces
├── dist/             — Compiled JS (run with `node dist/index.js`)
└── workshop.db       — SQLite database (auto-created)
```

### Config: `workshop.json`

```json
{
  "gateway": {
    "url": "ws://localhost:18789",
    "token": "<gateway-auth-token>"
  },
  "agents": [
    { "id": "kagura", "name": "Kagura", "avatar": "🌸" },
    { "id": "anan", "name": "Anan", "avatar": "🤖" },
    { "id": "ruantang", "name": "Ruantang", "avatar": "🍮" }
  ],
  "rooms": [
    { "id": "product", "name": "#product", "agents": ["kagura", "anan"] },
    { "id": "dev", "name": "#dev", "agents": ["kagura", "ruantang"] },
    { "id": "war-room", "name": "#war-room", "agents": ["kagura", "anan", "ruantang"] }
  ]
}
```

Gateway URL and token are shared across all agents. Each agent is metadata only (id, name, avatar). Rooms define which agents participate.

### Message Flow (Multi-Agent)

```
Browser → WS → Workshop Server → WS → OpenClaw Gateway → Agent 1
                                   └→ (same WS)          → Agent 2
                                                            │ │
Browser ← WS ← Workshop Server ← WS ← OpenClaw Gateway ←──┘ │
Browser ← WS ← Workshop Server ← WS ← OpenClaw Gateway ←────┘
```

1. User sends `{ type: "send_message", roomId, content }` via WebSocket
2. Server stores message in SQLite, broadcasts to all connected browsers
3. Server loops over room's agents, sends `chat.send` for **each** with unique session key
4. Gateway runs each agent independently, streams `chat` events back
5. Server parses `agentId` from event's `sessionKey`, looks up agent name/avatar
6. Server stores agent message, broadcasts to browsers with correct sender info

### Logging

Server has structured logging for debugging:
- `[ws]` — Client connections/disconnections
- `[ws:in]` — Incoming WebSocket messages from browsers
- `[msg]` — Message routing (user→room→agent, agent→room→browsers)
- `[gateway]` — Gateway protocol (connect, send, receive)

Logs go to stdout, redirect to `/tmp/workshop-server.log` in production.

## Frontend

```
workshop/web/
├── src/
│   ├── main.tsx
│   ├── App.tsx         — Discord-like layout
│   ├── components/
│   │   ├── Sidebar.tsx    — Room list
│   │   ├── ChatView.tsx   — Message list + input
│   │   └── AgentList.tsx  — Members panel
│   ├── hooks/
│   │   └── useWebSocket.ts — WS connection to server
│   └── types.ts
└── index.html
```

Dev server: `npx vite --host 0.0.0.0` on port 5173.

## Running

```bash
# Terminal 1: Server
cd workshop && node server/dist/index.js

# Terminal 2: Frontend
cd workshop/web && npx vite --host 0.0.0.0

# Open http://localhost:5173 in browser
```

## Bugs Fixed (2026-04-02)

### 1. Scope authorization rejected
- **Symptom:** `chat.send rejected: missing scope: operator.write`
- **Root cause:** Gateway clears self-declared scopes for clients without device identity, unless client is recognized as Control UI
- **Fix:** Use `client.id: "openclaw-tui"` + gateway config `allowInsecureAuth: true`

### 2. Agent events not received
- **Symptom:** Gateway sends response, Workshop doesn't log any events
- **Root cause:** Workshop listened for `event: "chat"` but the code originally had `case 'chat':` — which was actually correct, but was changed to `case 'agent':` during debugging
- **Fix:** Listen for `event: "chat"` (TUI format), ignore `event: "agent"` (broadcast format) to avoid duplicates

### 3. Session key mismatch
- **Symptom:** Events received but filtered out by `ownSessionKeys` check
- **Root cause:** Workshop stores `workshop:product`, Gateway returns `agent:kagura:workshop:product`
- **Fix:** Store both formats in `ownSessionKeys`

### 4. Duplicate messages
- **Symptom:** Same agent response appears 2-3 times in frontend
- **Root cause:** Both `chat` and `agent` events processed, plus `delta` events treated as final
- **Fix:** Only process `chat` events; only emit on `state: "final"`, skip `state: "delta"`
