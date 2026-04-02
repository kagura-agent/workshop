# Workshop — Development Guide

## Project Structure

```
workshop/
├── server/           # Node.js WebSocket server
│   ├── src/          # TypeScript source
│   ├── dist/         # Compiled JS (git-ignored)
│   └── workshop.db   # SQLite database (git-ignored)
├── web/              # React frontend (Vite)
│   ├── src/
│   └── dist/         # Build output (git-ignored)
├── docs/             # Design & implementation docs
│   ├── architecture.md
│   ├── design-notes.md
│   └── implementation.md
├── workshop.json     # Agent & room config
├── README.md
└── CONTRIBUTING.md   # This file
```

## Dev Setup

```bash
# Install dependencies
cd server && npm install
cd ../web && npm install

# Compile server
cd server && npx tsc

# Start everything (recommended — auto-restarts on crash)
./scripts/supervise.sh

# Open http://localhost:5173
```

⚠️ **Do NOT start services with plain `&` or `disown` from exec sessions.**
Use `setsid` or the supervisor script. See README for details.

## Build & Run

```bash
# Compile server TypeScript
cd server && npx tsc

# Always compile before running — don't run ts files directly
node server/dist/index.js > /tmp/workshop-server.log 2>&1 &
```

## Code Conventions

### TypeScript
- Strict mode (`"strict": true` in tsconfig)
- No `any` in new code unless interfacing with untyped external protocols (gateway events)
- Prefer `interface` over `type` for object shapes
- Use `const` by default, `let` when reassignment needed

### Naming
- Files: `kebab-case.ts`
- Interfaces/Types: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

### Error Handling
- Gateway protocol errors: log with `console.error()`, don't crash
- WebSocket disconnections: auto-reconnect (5s delay)
- SQLite errors: crash fast — data integrity matters

### Logging
All server logs use prefixed format for easy grep:
- `[ws]` — Browser WebSocket connections
- `[ws:in]` — Incoming messages from browsers
- `[msg]` — Message routing (user→agent, agent→browser)
- `[gateway]` — OpenClaw Gateway protocol
- `[workshop]` — Server lifecycle (startup, config, shutdown)

Example: `console.log(\`[gateway] ← chat final from \${agent.name}: "\${text.slice(0, 120)}"\`);`

### Frontend
- Functional components only
- Custom hooks for WebSocket logic (`useWebSocket`)
- Plain CSS, dark theme — no CSS frameworks
- No state management library for MVP (props + hooks)

## Git Workflow

### Branches
- `main` — stable, deployable. **No direct pushes.**
- Feature branches: `feat/<name>`, `fix/<name>`, `docs/<name>`

### Pull Request Flow
All changes go through PRs:

```bash
# 1. Create branch from issue
git checkout -b fix/issue-2-setsid

# 2. Make changes, commit
git add -A && git commit -m "fix: use setsid to prevent exec session cleanup kills"

# 3. Push and create PR — use "Fixes #N" to auto-close issue on merge
git push -u origin fix/issue-2-setsid
gh pr create --title "fix: use setsid for process supervisor" --body "Fixes #2"

# 4. Merge (squash preferred for clean history)
gh pr merge --squash
```

**Why?** Even for solo dev:
- Every issue has a traceable PR
- `Fixes #N` auto-closes issues on merge
- PR history = changelog
- Ready for contributors from day one

### Commit Messages
Format: `<type>: <description>`

Types:
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that doesn't add/fix functionality
- `chore:` — Build, deps, config

Examples:
```
feat: streaming delta display in chat view
fix: duplicate messages from agent/chat event overlap
docs: update implementation.md with reconnect protocol
refactor: extract gateway auth into separate module
```

### What to Commit
- Source code changes
- Documentation updates
- Config schema changes

### What NOT to Commit
- `server/dist/` (compiled JS)
- `server/workshop.db` (runtime data)
- `web/dist/` (build output)
- `node_modules/`
- `/tmp/*.log`

## Testing

### E2E Test (manual)
```bash
# From server directory:
NODE_PATH=./node_modules node /tmp/workshop-e2e-test.cjs
```

Verifies: connect → send message → receive agent reply.

### Testing Checklist (before push)
1. `cd server && npx tsc` — compiles without errors
2. Server starts and connects to gateway (`hello-ok` in log)
3. Send message from browser → agent replies (check server log)
4. No duplicate messages in frontend

### Future: Automated Tests
- [ ] Server unit tests (Vitest)
- [ ] Gateway mock for offline testing
- [ ] Frontend component tests

## Architecture Decisions

Document significant decisions in `docs/` with context:
- **What** was decided
- **Why** (what alternatives were considered)
- **When** (date, so we know if context has changed)

Already documented in `docs/implementation.md`:
- Gateway client identity choice (`openclaw-tui`)
- Event handling strategy (`chat` vs `agent` events)
- Session key dual-tracking

## Debugging

### Server not responding
```bash
# Check if server is running
lsof -i :3100

# Check gateway connection
grep "hello-ok\|rejected\|error" /tmp/workshop-server.log

# Check for scope issues
grep "missing scope" /tmp/workshop-server.log
```

### Messages not arriving
```bash
# Check message flow in log
grep "\[msg\]\|\[gateway\]" /tmp/workshop-server.log | tail -20
```

### Session issues
```bash
# Find workshop session in OpenClaw
python3 -c "
import json
with open('$HOME/.openclaw/agents/kagura/sessions/sessions.json') as f:
    for k, v in json.load(f).items():
        if 'workshop' in k:
            print(k, v.get('sessionId'))
"
```

## Dependencies

### Server
- `ws` — WebSocket server + client
- `better-sqlite3` — SQLite database
- `uuid` — Message/request IDs
- `typescript` — Build toolchain

### Frontend
- `react` + `react-dom` — UI
- `vite` — Dev server + build
- `typescript` — Type checking

**Policy:** Minimize dependencies. No ORMs, no CSS frameworks, no state management libraries for MVP.
