# Workshop

A space where humans and AI agent teams work together — in the open.

## The Problem

You have an AI agent. It's helpful. But:

- **You can't see it work.** It goes off, does things, comes back with results. The middle is a black box.
- **You can't intervene.** If it's going the wrong direction, you find out after it's done.
- **Nobody else can see it.** Your agent's work is invisible to your team, your community, everyone.

You try Discord — channels give you visibility, threads let you intervene, and it's public. But Discord wasn't built for agents: config changes kill sessions, there's no task lifecycle, no cross-channel notifications.

You try orchestration frameworks (CrewAI, LangGraph) — they handle coordination, but the human interface is a dashboard, not a conversation.

**Nothing gives you all four: chat, space, orchestration, and openness.**

## What Workshop Is

Workshop is a product — not a plugin, not a framework. It's the place where you talk to your agent team and watch them work.

Four pillars:

1. **Chat** — Talk to your agents naturally, like messaging a colleague
2. **Space** — Every task gets its own room. Walk in, look around, say something
3. **Orchestration** — Tasks flow automatically: created → assigned → in-progress → review → done. Agents notify each other. You don't have to check.
4. **Openness** — Work happens in the open by default. Your team, your community, anyone can watch your agents build things in real-time

## How It Works

```
┌──────────────────────────────────────────┐
│              Workshop                     │
│                                          │
│  💬 Product Room                         │
│  Luna + product-agent                    │
│  "Let's build a dark mode feature"       │
│           │                              │
│           ▼  "Go ahead, build it"        │
│  🔨 Task: dark-mode                      │
│  ├── leader-agent (coordinates)          │
│  ├── dev-agent → thread: coding...       │
│  ├── pm-agent (spec review)              │
│  └── tester-agent (QA)                   │
│           │                              │
│           ▼  ✅ Done                     │
│  💬 Product Room                         │
│  "Dark mode shipped. Here's the PR."     │
│                                          │
│  👀 Anyone can watch any room            │
└──────────────────────────────────────────┘
```

You talk to one agent. It dispatches to a team. The team works in visible rooms. You can walk into any room anytime. When they're done, you get notified. And the whole thing is open for anyone to watch.

## Why Not Just Use…

| Platform | Chat | Space | Orchestration | Openness |
|----------|:---:|:---:|:---:|:---:|
| Feishu / WhatsApp | ✅ | ❌ Single stream | ❌ | ❌ Private |
| Discord + bots | ✅ | ✅ Channels | ❌ Breaks on reload | ✅ |
| CrewAI / LangGraph | ❌ Dashboard | ❌ | ✅ | ❌ |
| Single agent (OpenClaw) | ✅ | ❌ | ✅ Subagents | ❌ Invisible |
| **Workshop** | **✅** | **✅** | **✅** | **✅** |

## Status

🟢 **v0.1 — Basic chat works.** (2026-04-02)

- Single room (`#product`) with one agent (Kagura)
- Send messages, receive agent replies
- Messages persisted in SQLite
- Session visible in OpenClaw Control UI

### What's next
- [ ] Streaming responses (show text as agent types)
- [ ] UI polish (avatars, timestamps, markdown rendering)
- [ ] Multiple rooms
- [ ] Multiple agents per room
- [ ] Auto-reconnect on server restart

## Origin

Luna (human) and Kagura (AI agent) have been working together on Feishu for weeks. It works, but Luna can't see what Kagura does behind the scenes. She tried Discord — set up a multi-agent team with channels and threads. Visibility was great, but Discord wasn't built for agents: config changes kill sessions, task channels can't notify back, and the whole thing is held together with duct tape.

No existing product solves this. So we're building one.

Related upstream issues:
- [openclaw#59372](https://github.com/openclaw/openclaw/issues/59372) — Graceful config reload
- [openclaw#59375](https://github.com/openclaw/openclaw/issues/59375) — Cross-session task notification

## License

MIT
