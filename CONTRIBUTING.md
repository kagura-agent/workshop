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

## Test Requirements

### Unit Tests
- Server: `cd server && npm test`
- Web: `cd web && npm test`
- Build: `cd web && npm run build`
- Full: `npm test` (root)

### 实机测试（必须）

**每个 PR 必须包含实机测试截图。** Unit test 通过不够 — 必须启动实际应用，在浏览器里操作验证。

QA (Ren) 的职责：
1. 启动 server + web（`npm run dev:server` + `npm run dev:web`）
2. 在浏览器里实际操作测试功能
3. 截图关键页面/交互
4. 截图贴到 PR comment 里（⚠️ **不要 commit 截图到代码库** — 二进制文件会撑大 git history）
5. 没有截图 = 没有测试 = 不能 merge

截图上传方式（不占 repo 空间）：
- 用 `gh issue comment` 或 GitHub web UI 上传图片，拿到 `user-images.githubusercontent.com` URL
- 然后用该 URL 贴到 PR comment 的 markdown 里

截图要求：
- 修复前 vs 修复后（如果是 bug fix）
- 正常功能截图（如果是新功能）
- 边界情况截图（如果有）

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
