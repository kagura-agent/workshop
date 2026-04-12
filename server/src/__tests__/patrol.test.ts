import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, resetDb, getDb } from '../db.js';
import { getPatrolConfig, setPatrolConfig, markPatrolFired } from '../patrol.js';

describe('patrol.ts - Patrol config', () => {
  beforeEach(() => {
    initDb(':memory:');
    // Patrol config requires a channel to exist for the FK
    const db = getDb();
    db.prepare(
      "INSERT INTO channels (id, name, created_at, type, positioning, guidelines, north_star) VALUES (?, ?, datetime('now'), 'meta', '', '', '')"
    ).run('control-channel', 'Control');
  });

  afterEach(() => {
    resetDb();
  });

  it('returns null when no patrol config exists', () => {
    const config = getPatrolConfig();
    expect(config).toBeNull();
  });

  it('creates patrol config with defaults', () => {
    const config = setPatrolConfig({ controlChannelId: 'control-channel' });

    expect(config.controlChannelId).toBe('control-channel');
    expect(config.schedule).toBe('0 */3 * * *');
    expect(config.enabled).toBe(false);
    expect(config.channelFilter).toEqual([]);
    expect(config.lastPatrolAt).toBeNull();
  });

  it('updates existing patrol config fields', () => {
    setPatrolConfig({ controlChannelId: 'control-channel' });

    const updated = setPatrolConfig({
      schedule: '0 * * * *',
      enabled: true,
      channelFilter: ['ch-1', 'ch-2'],
    });

    expect(updated.controlChannelId).toBe('control-channel');
    expect(updated.schedule).toBe('0 * * * *');
    expect(updated.enabled).toBe(true);
    expect(updated.channelFilter).toEqual(['ch-1', 'ch-2']);
  });

  it('markPatrolFired updates last_patrol_at', () => {
    setPatrolConfig({ controlChannelId: 'control-channel' });

    markPatrolFired();
    const config = getPatrolConfig();
    expect(config).not.toBeNull();
    expect(config!.lastPatrolAt).toBeTruthy();
  });

  it('partial update does not wipe other fields', () => {
    setPatrolConfig({
      controlChannelId: 'control-channel',
      schedule: '*/5 * * * *',
      enabled: true,
    });

    const updated = setPatrolConfig({ schedule: '*/10 * * * *' });
    expect(updated.schedule).toBe('*/10 * * * *');
    expect(updated.enabled).toBe(true);
    expect(updated.controlChannelId).toBe('control-channel');
  });
});
