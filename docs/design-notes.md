# Workshop — Design Notes

## Pain Points (from Luna's Discord experiment, 2026-04-02)

### P1: Hot-reload kills dispatcher session
- **Severity:** Critical
- **Trigger:** Agent updates OpenClaw config to add new channel → reload → session aborted
- **Impact:** Multi-step dispatch flow breaks at step 2 of N
- **Upstream:** openclaw#59372

### P2: No cross-session return path
- **Severity:** High
- **Trigger:** Task team completes work in task channel, no way to notify product channel
- **Impact:** Human must manually check each task channel
- **Upstream:** openclaw#59375

### P3: Token cost of multi-instance
- **Severity:** Medium
- **Each agent** is a separate OpenClaw instance with its own context window
- **Mitigation:** Agents are mostly idle (only activate on @-mention)

### P4: No cross-agent knowledge sharing
- **Severity:** Medium
- **leader learns** that dev-agent's tests failed → but dev-agent doesn't know why leader changed the spec
- **Shared workspace files** partially solve this, but no structured mechanism

## Design Principles

1. **Chat-native** — The chat platform IS the UI. No separate dashboard for the human.
2. **Visibility by default** — Every agent action happens in a place the human can see.
3. **Intervention without ceremony** — Human types in a channel, agents hear it. No special commands.
4. **Isolation by default, communication by intent** — Agents don't see everything. They communicate when needed, explicitly.
5. **Platform-agnostic core** — Works on Discord today, should work on Slack/Feishu tomorrow.
6. **Dogfood-driven** — We build what we need, then generalize.

## Open Questions

- [ ] Should Workshop be an OpenClaw plugin, a standalone service, or a layer on top?
- [ ] How to handle agent identity across platforms? (Same agent, different bot tokens per platform)
- [ ] Task persistence — where does task state live? (File, SQLite, Redis?)
- [ ] How much orchestration logic should live in the "leader" agent vs Workshop core?
- [ ] Can we reuse OpenClaw's `sessions_send` for cross-session messaging, or need something new?

## Competitive Landscape (as of 2026-04-02)

| Product | Orchestration | Chat-Native Visibility | Human Intervention |
|---------|:---:|:---:|:---:|
| CrewAI | ✅ Role-based crews | ❌ Dashboard | ⚠️ HITL callbacks |
| LangGraph | ✅ Graph-based flows | ❌ LangSmith dashboard | ⚠️ Checkpoints |
| AG2/AutoGen | ✅ Multi-agent chat | ⚠️ Terminal-based | ⚠️ Input prompts |
| OpenClaw (solo) | ✅ Subagents | ❌ Invisible to human | ❌ Can't reach subagents |
| Discord + OpenClaw (Luna's setup) | ❌ Manual | ✅ Channels | ✅ Just type |
| **Workshop (target)** | **✅** | **✅** | **✅** |
