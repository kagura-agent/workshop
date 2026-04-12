# Task: Implement v0.3 Phase 1

Read `docs/v0.3-architecture.md` for the full spec. Read existing code in `server/src/` and `web/src/`.

## What to implement

### §1: Channel Metadata
- Add new columns to channels table (type, positioning, guidelines, north_star, todo_section, cron_schedule, cron_enabled)
- Use try/catch ALTER TABLE for safe migration in db.ts initSchema
- Update types.ts Channel interface
- Add update_channel_meta message type
- Update router.ts: handleListChannels returns new fields, new handleUpdateChannelMeta, handleCreateChannel accepts metadata
- Update web/src/types.ts to match
- UI: channel settings panel (gear icon), channel type badge in header

### §7: Task Lifecycle  
- Create todo_items table (id, section, content, status, assigned_channel, assigned_agent, created_at, updated_at)
- Create todo_history table
- Add todo CRUD WebSocket messages (todo_list, todo_create, todo_update, todo_delete)
- Implement handlers in router.ts
- UI: TODO sidebar panel with items grouped by section, status badges, add/delete, stale indicator

## Constraints
- Keep v0.2 behavior working
- Verify: `npx tsc --noEmit` and `cd web && npm run build`
