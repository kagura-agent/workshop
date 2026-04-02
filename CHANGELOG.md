# Changelog

## [0.2.0] — 2026-04-02

### ✨ Multi-Agent Chat

Workshop now supports multiple agents in the same room, each with independent sessions — just like Discord bots.

#### Added
- **Multi-agent support** — register multiple agents sharing a single gateway connection, each with independent sessions and context
- **`requireMention` routing** — agents with `requireMention: true` only receive messages when @mentioned; agents with `requireMention: false` see everything and decide when to respond
- **@mention autocomplete** — type `@` in the chat input to see a popup of agents in the current room, with keyboard navigation (↑↓ Enter/Tab/Esc)
- **Multiple rooms** — configure rooms with different agent combinations (`#product`, `#dev`, `#war-room`)
- **Silent token filtering** — `NO_REPLY` and `HEARTBEAT_OK` protocol tokens are filtered and never shown in chat
- **Discord bot model research** — `docs/research/discord-bot-model.md` documenting the three-layer permission system (Scopes → Permissions → Intents)

#### Fixed
- Gateway authentication with `openclaw-tui` client identity (scope permissions)
- Session key routing (`agent:<agentId>:workshop:<roomId>`)
- Duplicate message filtering (listen to `chat` events only, not `agent`)

#### Architecture
- Shared gateway connection — one WebSocket, multiple agents via session key prefixes
- SQLite persistence (rooms, agents, messages, room-agent membership with `require_mention`)
- Backward-compatible config: room agents can be strings or `{ id, requireMention }` objects

## [0.1.0] — 2026-04-02

### 🏗️ Foundation

- Initial scaffold: Node.js server + React frontend
- Single-agent chat via OpenClaw Gateway WebSocket protocol
- Challenge → connect → hello-ok authentication flow
- SQLite message persistence
- Discord-like UI layout (sidebar, chat, agent list)
- Structured logging with `[ws]`/`[msg]`/`[gateway]` prefixes
