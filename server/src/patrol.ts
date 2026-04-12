import { getDb } from './db.js';
import type { PatrolConfig } from './types.js';

/** Read patrol config from DB. Returns null if no config exists. */
export function getPatrolConfig(): PatrolConfig | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM patrol_config WHERE id = 'default'").get() as any;
  if (!row) return null;
  return {
    controlChannelId: row.control_channel_id,
    schedule: row.schedule,
    enabled: !!row.enabled,
    lastPatrolAt: row.last_patrol_at,
    channelFilter: JSON.parse(row.channel_filter || '[]'),
  };
}

/** Upsert patrol config. Returns the updated config. */
export function setPatrolConfig(updates: Partial<PatrolConfig>): PatrolConfig {
  const db = getDb();
  const existing = getPatrolConfig();

  if (!existing) {
    const controlChannelId = updates.controlChannelId ?? '';
    const schedule = updates.schedule ?? '0 */3 * * *';
    const enabled = updates.enabled ? 1 : 0;
    const channelFilter = JSON.stringify(updates.channelFilter ?? []);
    db.prepare(
      "INSERT INTO patrol_config (id, control_channel_id, schedule, enabled, channel_filter) VALUES ('default', ?, ?, ?, ?)"
    ).run(controlChannelId, schedule, enabled, channelFilter);
  } else {
    const sets: string[] = [];
    const vals: any[] = [];
    if (updates.controlChannelId !== undefined) { sets.push('control_channel_id = ?'); vals.push(updates.controlChannelId); }
    if (updates.schedule !== undefined) { sets.push('schedule = ?'); vals.push(updates.schedule); }
    if (updates.enabled !== undefined) { sets.push('enabled = ?'); vals.push(updates.enabled ? 1 : 0); }
    if (updates.channelFilter !== undefined) { sets.push('channel_filter = ?'); vals.push(JSON.stringify(updates.channelFilter)); }
    if (sets.length > 0) {
      vals.push('default');
      db.prepare(`UPDATE patrol_config SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
  }

  return getPatrolConfig()!;
}

/** Mark last patrol time as now. */
export function markPatrolFired(): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE patrol_config SET last_patrol_at = ? WHERE id = 'default'").run(now);
}

/**
 * Assemble the patrol prompt that summarizes all channel activity.
 * Called by cron manager when the patrol job fires.
 */
export function assemblePatrolPrompt(controlChannelId: string, lastPatrolAt: string | null, channelFilter: string[]): string {
  const db = getDb();

  // Get active channels (filtered or all)
  let channels: any[];
  if (channelFilter.length > 0) {
    const placeholders = channelFilter.map(() => '?').join(', ');
    channels = db.prepare(
      `SELECT * FROM channels WHERE id IN (${placeholders}) AND status = 'active'`
    ).all(...channelFilter) as any[];
  } else {
    channels = db.prepare("SELECT * FROM channels WHERE status = 'active'").all() as any[];
  }

  const parts: string[] = [
    '[Channel Patrol]',
    '',
    `Summarize the status of all channels since last patrol (${lastPatrolAt ?? 'never'}).`,
    '',
    '## Channel Activity',
  ];

  for (const ch of channels) {
    if (ch.id === controlChannelId) continue;

    // Message count since last patrol
    let messageCount = 0;
    if (lastPatrolAt) {
      const row = db.prepare(
        'SELECT COUNT(*) as cnt FROM messages WHERE channel_id = ? AND timestamp > ?'
      ).get(ch.id, lastPatrolAt) as any;
      messageCount = row?.cnt ?? 0;
    } else {
      const row = db.prepare(
        'SELECT COUNT(*) as cnt FROM messages WHERE channel_id = ?'
      ).get(ch.id) as any;
      messageCount = row?.cnt ?? 0;
    }

    // Last activity timestamp
    const lastMsg = db.prepare(
      'SELECT timestamp FROM messages WHERE channel_id = ? ORDER BY timestamp DESC LIMIT 1'
    ).get(ch.id) as any;
    const lastActivity = lastMsg?.timestamp ?? 'none';

    // TODO stats for this channel's section
    let todoSummary = 'No linked section';
    if (ch.todo_section) {
      const stats = db.prepare(
        'SELECT status, COUNT(*) as cnt FROM todo_items WHERE section = ? GROUP BY status'
      ).all(ch.todo_section) as any[];
      const m: Record<string, number> = {};
      for (const s of stats) m[s.status] = s.cnt;
      todoSummary = `${m.pending ?? 0} pending / ${m.in_progress ?? 0} in progress / ${m.done ?? 0} done`;
    }

    // Last 3 messages
    const recent = db.prepare(
      'SELECT sender_name, content FROM messages WHERE channel_id = ? ORDER BY timestamp DESC LIMIT 3'
    ).all(ch.id) as any[];

    parts.push(`### #${ch.name} (${ch.type ?? 'project'})`);
    parts.push(`- Messages since last patrol: ${messageCount}`);
    parts.push(`- Last activity: ${lastActivity}`);
    parts.push(`- TODO items: ${todoSummary}`);

    if (recent.length > 0) {
      parts.push('- Recent:');
      for (const m of recent.reverse()) {
        parts.push(`  [${m.sender_name}]: ${m.content.slice(0, 100)}`);
      }
    }
    parts.push('');
  }

  // Global TODO status
  const allStats = db.prepare(
    'SELECT section, status, COUNT(*) as cnt FROM todo_items GROUP BY section, status'
  ).all() as any[];

  if (allStats.length > 0) {
    parts.push('## Global TODO Status');
    const sections = new Map<string, Record<string, number>>();
    for (const row of allStats as any[]) {
      if (!sections.has(row.section)) sections.set(row.section, {});
      sections.get(row.section)![row.status] = row.cnt;
    }
    for (const [section, stats] of sections) {
      const line = Object.entries(stats).map(([s, c]) => `${c} ${s}`).join(', ');
      parts.push(`- **${section}**: ${line}`);
    }
    parts.push('');
  }

  parts.push('---');
  parts.push('Provide a concise status update. Flag anything that looks stuck, overdue, or needs attention.');

  return parts.join('\n');
}
