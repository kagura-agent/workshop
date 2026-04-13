# Changelog

## [0.3.1] — 2026-04-13

### ✨ Rich Messages & Avatars

- **Markdown rendering** — chat messages now render GitHub-flavored markdown (code blocks, bold, italic, links, lists, tables, blockquotes) via `react-markdown` + `remark-gfm` (#27)
- **@mention + markdown integration** — mentions are highlighted correctly inside markdown content
- **Code block styling** — dark background (`bg-zinc-900`), horizontal scroll, monospace font
- **Agent avatar images** — agents with a URL avatar show their image; falls back to colored initial circle
- **17 new tests** — MessageContent component fully tested (markdown, mentions, links, avatars, edge cases)

## [0.3.0] — 2026-04-12

### 🏗️ Channel Autonomy

Workshop channels become autonomous: each channel has metadata, scheduling, task lifecycle, and cross-channel coordination — agents patrol, notify, and intervene without human prompting.

- **Channel metadata system** — type (daily/project/meta), positioning, guidelines, north star per channel
- **Channel settings panel** — UI for editing channel metadata; header shows type badge and positioning
- **TODO section linking** — global TODO + per-channel task sections with TodoPanel component
- **Pin sync** — pins synced from channel files; custom pins and message pinning in chat; Kanban view toggle
- **NorthStar integration** — per-channel north star displayed and enforced
- **Cron scheduling** — per-channel `cronSchedule` / `cronEnabled` with CronDashboard component
- **Task lifecycle states** — created → assigned → in-progress → review → done
- **Automated patrol** — agents patrol channels and post summaries to the control room
- **Cross-channel notifications** — channels can notify other channels of events
- **Real-time human intervention** — urgent intervention support during autonomous work

### Added
- **Runtime agent management** — register, update, and remove agents at runtime without server restart (#20)
- **WebSocket auto-reconnect** — automatic reconnection with exponential backoff on disconnect (#21, fixes #5)
- **@mention highlight** — mentioned agent names highlighted in messages (#16, fixes #4)

### Fixed
- **Security** — example config added, real config gitignored to prevent credential leaks

### Infrastructure
- **Comprehensive server-side test suite** — 49 tests covering server functionality (#22)
- **Star history chart** — added to docs

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
