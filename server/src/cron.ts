import * as cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';
import { getPatrolConfig, assemblePatrolPrompt, markPatrolFired } from './patrol.js';
import type { Channel, Agent, CronExecution, PatrolConfig } from './types.js';

export type SendChatFn = (content: string, channelId: string, agentId: string) => void;

/**
 * ChannelCronManager — schedules and executes cron jobs for channels.
 *
 * Each channel with cronEnabled + cronSchedule gets a node-cron ScheduledTask.
 * On fire: assembles a context prompt from channel metadata, TODO items, and
 * recent messages, then sends it to every non-requireMention agent.
 */
export class ChannelCronManager {
  private tasks = new Map<string, ScheduledTask>();
  private patrolTask: ScheduledTask | null = null;
  private sendChat: SendChatFn;
  private agents: Map<string, Agent>;

  constructor(sendChat: SendChatFn, agents: Map<string, Agent>) {
    this.sendChat = sendChat;
    this.agents = agents;
  }

  /** Sync a single channel — start, restart, or stop its cron task. */
  syncChannel(channel: Channel): void {
    // Always clear existing task first
    const existing = this.tasks.get(channel.id);
    if (existing) {
      existing.stop();
      this.tasks.delete(channel.id);
    }

    if (!channel.cronEnabled || !channel.cronSchedule) return;

    if (!cron.validate(channel.cronSchedule)) {
      console.warn(`[cron] invalid schedule for channel=${channel.id}: "${channel.cronSchedule}"`);
      return;
    }

    const task = cron.schedule(channel.cronSchedule, () => {
      this.executeCron(channel.id);
    });

    this.tasks.set(channel.id, task);
    console.log(`[cron] scheduled channel=${channel.id} schedule="${channel.cronSchedule}"`);
  }

  /** Execute cron for a channel: assemble prompt, send to agents, log execution. */
  executeCron(channelId: string): void {
    const db = getDb();

    // Load channel from DB
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    if (!row) {
      console.warn(`[cron] channel not found: ${channelId}`);
      return;
    }

    const channel: Channel = {
      id: row.id,
      name: row.name,
      agents: [],
      createdAt: row.created_at,
      status: row.status,
      type: row.type ?? 'project',
      positioning: row.positioning ?? '',
      guidelines: row.guidelines ?? '',
      northStar: row.north_star ?? '',
      todoSection: row.todo_section ?? null,
      cronSchedule: row.cron_schedule ?? null,
      cronEnabled: !!row.cron_enabled,
    };

    // Load TODO items matching todoSection
    let todoContext = '';
    if (channel.todoSection) {
      const todos = db.prepare(
        "SELECT * FROM todo_items WHERE section = ? AND status != 'done' ORDER BY created_at ASC"
      ).all(channel.todoSection) as any[];

      if (todos.length > 0) {
        const todoLines = todos.map(
          (t: any) => `- [${t.status}] ${t.content}`
        );
        todoContext = `\n\n## Active TODO items (section: ${channel.todoSection})\n${todoLines.join('\n')}`;
      }
    }

    // Load last 10 messages
    const recentMessages = db.prepare(
      'SELECT * FROM messages WHERE channel_id = ? ORDER BY timestamp DESC LIMIT 10'
    ).all(channelId) as any[];

    let messageContext = '';
    if (recentMessages.length > 0) {
      const msgLines = recentMessages.reverse().map(
        (m: any) => `[${m.sender_name}]: ${m.content.slice(0, 200)}`
      );
      messageContext = `\n\n## Recent messages\n${msgLines.join('\n')}`;
    }

    // Assemble the prompt
    const parts: string[] = [
      `[CRON] Scheduled check-in for #${channel.name}.`,
    ];

    if (channel.positioning) parts.push(`\nChannel purpose: ${channel.positioning}`);
    if (channel.northStar) parts.push(`North star: ${channel.northStar}`);
    if (channel.guidelines) parts.push(`\nGuidelines:\n${channel.guidelines}`);
    if (todoContext) parts.push(todoContext);
    if (messageContext) parts.push(messageContext);

    parts.push('\n\nPlease review the above context and provide your update or take action as appropriate.');

    const prompt = parts.join('\n');

    // Load channel agents — send to non-requireMention agents only
    const channelAgents = db.prepare(
      'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
    ).all(channelId) as { agent_id: string; require_mention: number }[];

    const targetAgents = channelAgents.filter(a => !a.require_mention);

    if (targetAgents.length === 0) {
      console.log(`[cron] channel=${channelId} has no non-requireMention agents, skipping`);
      return;
    }

    console.log(`[cron] firing channel=${channelId} → ${targetAgents.length} agent(s)`);

    // Send to each agent
    for (const { agent_id } of targetAgents) {
      this.sendChat(prompt, channelId, agent_id);
    }

    // Log execution
    const executionId = uuid();
    const now = new Date().toISOString();
    const agentIds = targetAgents.map(a => a.agent_id);

    db.prepare(
      'INSERT INTO cron_executions (id, channel_id, fired_at, agent_ids, prompt_snippet, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(executionId, channelId, now, JSON.stringify(agentIds), prompt.slice(0, 500), 'sent');

    console.log(`[cron] logged execution=${executionId} channel=${channelId}`);
  }

  /** Manually trigger a cron execution for a channel. */
  triggerChannel(channelId: string): void {
    console.log(`[cron] manual trigger for channel=${channelId}`);
    this.executeCron(channelId);
  }

  /** Get execution history for a channel. */
  getHistory(channelId: string, limit = 20): CronExecution[] {
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM cron_executions WHERE channel_id = ? ORDER BY fired_at DESC LIMIT ?'
    ).all(channelId, limit) as any[];

    return rows.map((r: any) => ({
      id: r.id,
      channelId: r.channel_id,
      firedAt: r.fired_at,
      agentIds: JSON.parse(r.agent_ids),
      promptSnippet: r.prompt_snippet,
      status: r.status,
    }));
  }

  /** Stop all cron tasks (for graceful shutdown). */
  stopAll(): void {
    for (const [channelId, task] of this.tasks) {
      task.stop();
      console.log(`[cron] stopped channel=${channelId}`);
    }
    this.tasks.clear();
    if (this.patrolTask) {
      this.patrolTask.stop();
      this.patrolTask = null;
      console.log('[cron] stopped patrol');
    }
  }

  /** Sync all channels from DB on startup. */
  syncAllFromDb(): void {
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM channels WHERE cron_enabled = 1 AND cron_schedule IS NOT NULL'
    ).all() as any[];

    for (const row of rows) {
      const agents = db.prepare(
        'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
      ).all(row.id) as { agent_id: string; require_mention: number }[];

      const channel: Channel = {
        id: row.id,
        name: row.name,
        agents: agents.map(a => a.agent_id),
        agentConfigs: agents.map(a => ({ id: a.agent_id, requireMention: !!a.require_mention })),
        createdAt: row.created_at,
        status: row.status,
        type: row.type ?? 'project',
        positioning: row.positioning ?? '',
        guidelines: row.guidelines ?? '',
        northStar: row.north_star ?? '',
        todoSection: row.todo_section ?? null,
        cronSchedule: row.cron_schedule ?? null,
        cronEnabled: !!row.cron_enabled,
      };

      this.syncChannel(channel);
    }

    console.log(`[cron] synced ${rows.length} channel(s) from DB`);

    // Sync patrol
    const patrolConfig = getPatrolConfig();
    if (patrolConfig) {
      this.syncPatrol(patrolConfig);
    }
  }

  /** Sync patrol cron job from config. Call when patrol config changes. */
  syncPatrol(config: PatrolConfig): void {
    if (this.patrolTask) {
      this.patrolTask.stop();
      this.patrolTask = null;
    }

    if (!config.enabled || !config.schedule || !config.controlChannelId) return;

    if (!cron.validate(config.schedule)) {
      console.warn(`[cron] invalid patrol schedule: "${config.schedule}"`);
      return;
    }

    this.patrolTask = cron.schedule(config.schedule, () => {
      this.executePatrol();
    });

    console.log(`[cron] patrol scheduled: "${config.schedule}" → #${config.controlChannelId}`);
  }

  /** Execute patrol: assemble prompt and send to control channel agents. */
  executePatrol(): void {
    const config = getPatrolConfig();
    if (!config || !config.controlChannelId) {
      console.warn('[cron] patrol: no config');
      return;
    }

    const prompt = assemblePatrolPrompt(config.controlChannelId, config.lastPatrolAt, config.channelFilter);
    markPatrolFired();

    const db = getDb();
    const channelAgents = db.prepare(
      'SELECT agent_id, require_mention FROM channel_agents WHERE channel_id = ?'
    ).all(config.controlChannelId) as { agent_id: string; require_mention: number }[];

    const targets = channelAgents.filter(a => !a.require_mention);
    if (targets.length === 0) {
      console.log('[cron] patrol: no non-requireMention agents in control channel');
      return;
    }

    console.log(`[cron] patrol firing → ${targets.length} agent(s) in #${config.controlChannelId}`);

    for (const { agent_id } of targets) {
      this.sendChat(prompt, config.controlChannelId, agent_id);
    }

    // Log as a cron execution
    const executionId = uuid();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO cron_executions (id, channel_id, fired_at, agent_ids, prompt_snippet, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(executionId, config.controlChannelId, now, JSON.stringify(targets.map(a => a.agent_id)), prompt.slice(0, 500), 'sent');
  }

  /** Reset cron timer for a channel (for @urgent intervention). */
  resetTimer(channelId: string): void {
    const existing = this.tasks.get(channelId);
    if (!existing) return;

    const db = getDb();
    const row = db.prepare('SELECT cron_schedule, cron_enabled FROM channels WHERE id = ?').get(channelId) as any;
    if (!row || !row.cron_enabled || !row.cron_schedule) return;

    existing.stop();
    const task = cron.schedule(row.cron_schedule, () => {
      this.executeCron(channelId);
    });
    this.tasks.set(channelId, task);
    console.log(`[cron] timer reset for channel=${channelId}`);
  }
}
