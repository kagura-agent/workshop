# Workshop

Multi-agent team orchestration — chat-native, human-visible, intervention-ready.

## The Problem

You want a team of AI agents working together. Current options:

| Approach | Orchestration | Visibility | Human Intervention |
|----------|:---:|:---:|:---:|
| CrewAI / LangGraph | ✅ | Dashboard only | ❌ Not in real-time |
| Discord + OpenClaw | ❌ Manual | ✅ Channels/threads | ✅ Just type |
| Single agent + subagents | ✅ Built-in | ❌ Invisible | ❌ Can't reach them |

**No existing product gives you all three.**

## What Workshop Does

Workshop is an orchestration layer that sits between your chat platform (Discord, Slack, Feishu) and your AI agents (OpenClaw, Claude Code, etc.).

It provides:

1. **Automatic task dispatch** — Tell your product agent "go build this", it creates a workspace, assembles the right team, and kicks things off
2. **Real-time visibility** — Every task runs in a visible channel/thread. You can watch agents work in real-time
3. **Human intervention** — Walk into any task workspace and talk. Change direction, give feedback, approve decisions. Agents hear you immediately
4. **Task lifecycle** — Tasks have states (created → in-progress → review → done). Completion notifications flow back to the originator automatically
5. **Cross-agent communication** — Agents can notify each other across task boundaries without shared session state

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Chat Platform               │
│        (Discord / Slack / Feishu)            │
│                                              │
│  #product ──── #task-001 ──── #task-002      │
│  (Luna +       (leader +      (leader +      │
│   luna-agent)   dev + pm)      tester)       │
│                  └─ thread      └─ thread    │
│                    (ACP code)    (test logs)  │
└──────────────┬──────────────────────────────┘
               │
     ┌─────────▼──────────┐
     │    Workshop Core    │
     │                     │
     │  • Task Registry    │  ← tracks task lifecycle across channels
     │  • Channel Manager  │  ← creates/configures channels without reload
     │  • Message Router   │  ← cross-session notifications
     │  • Team Templates   │  ← predefined team compositions
     │  • Event Bus        │  ← task state changes → notify subscribers
     └─────────┬──────────┘
               │
     ┌─────────▼──────────┐
     │   Agent Instances   │
     │                     │
     │  • luna-agent       │  (product + dispatch)
     │  • leader-agent     │  (coordination)
     │  • dev-agent        │  (implementation)
     │  • pm-agent         │  (requirements)
     │  • tester-agent     │  (quality)
     └────────────────────┘
```

## Core Concepts

### Task
A unit of work with a lifecycle: `created → assigned → in-progress → review → done | cancelled`. Each task gets a dedicated channel. Completion triggers a notification back to the originating channel.

### Team Template
A predefined set of agent roles for a type of work. E.g., "feature-dev" = leader + pm + dev + tester. Templates can be customized per project.

### Workspace
A channel (or set of channels/threads) dedicated to a task. Created automatically, archived on completion. The human can enter any workspace at any time.

### Message Router
The bridge between isolated agent sessions. Agents publish events ("task complete", "review needed", "blocked on X"), the router delivers them to subscribed sessions.

## Status

🚧 **Early exploration.** We're building this for ourselves (dogfooding), documenting as we go.

## Origin

Born from a real problem: Luna set up a multi-agent team on Discord using OpenClaw, and hit two walls:
1. Creating a new channel requires config reload, which kills the dispatcher agent's session
2. Task agents can't notify back to the originating channel when done

These aren't Discord problems or OpenClaw problems — they're **multi-agent orchestration problems** that no existing product solves well.

Upstream issues filed:
- [openclaw#59372](https://github.com/openclaw/openclaw/issues/59372) — Graceful config reload
- [openclaw#59375](https://github.com/openclaw/openclaw/issues/59375) — Cross-session task notification

## License

MIT
