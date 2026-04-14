# Workshop — Project Configuration

## Team

| Role | Agent | Discord ID | Responsibilities |
|------|-------|------------|-----------------|
| PM / Lead | Kagura 🌸 | 1480846428266823803 | Design, assign, review, coordinate |
| Developer | Haru 🌱 | 1493517987230253097 | Implement features, fix bugs, create PRs |
| QA | Ren 🪷 | 1493518515276218368 | Test features, find bugs, write QA reports |
| Final Approver | Luna | 1359351419181863053 | Review PRs on GitHub, approve merge |

## Workflow

1. Kagura creates GitHub Issue (or picks from backlog)
2. Kagura assigns to @Haru with: issue link, base branch, scope, test command
3. Haru implements → pushes branch → opens PR → reports in #workshop
4. Kagura reviews PR diff (scope + quality)
5. Kagura assigns @Ren to test → Ren posts QA report
6. Kagura posts PR link for Luna → **waits for Luna's GitHub review**
7. Luna approves on GitHub → Kagura merges

**Luna is the final gate. No merge without her approval.**

## Current Priority: MVP (#35)

Strip to absolute minimum:
- ✅ Channel list + switching
- ✅ Chat (send message, agent replies via gateway)
- ✅ Per-channel agent configuration
- ❌ Remove: TODO Panel, Kanban, DM, Pin, North Star, Cron Dashboard, Patrol, Notifications

## Git Rules

- **Base branch:** always `main` unless explicitly stated
- **Branch naming:** `fix/<description>` or `feat/<description>`
- **One issue = one PR.** No scope creep.
- **Commit format:** `type: short description (#issue)`
- **Squash merge** via `gh pr merge --squash --delete-branch`

## Tech Stack

- **Server:** Node.js + Express + SQLite + WebSocket (`server/`)
- **Web:** React + Vite + Tailwind + shadcn/ui (`web/`)
- **Gateway:** OpenClaw gateway integration

## Test Commands

- Server: `cd server && npm test`
- Web: `cd web && npm test`
- Build: `cd web && npm run build`
- Full: `npm test` (root)

## Dev Environment

- Repo: `~/.openclaw/workspace/workshop/`
- Server runs on `:3100` (systemd: moltbook-api — note: shared service name)
- Web runs on `:5173` (systemd: moltbook-web — note: shared service name)
- Gateway: `ws://localhost:18789`

## Design Principles

- **Project is a first-class citizen** — TODO/tasks belong to Project, not Channel
- **Default 1:1:** creating a channel auto-creates a same-name Project
- **Independent surface layer** — Workshop is NOT an OpenClaw plugin, it's a standalone app
- **Agent API:** any framework's agent connects via API (like Discord Bot API)
- **Simple first, features later** — get basics rock-solid before adding anything
