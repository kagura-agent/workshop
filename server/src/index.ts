import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, close } from './db.js';
import { Router } from './router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3100;

// Initialize database
getDb();

const wss = new WebSocketServer({ port: PORT });
const router = new Router();

// ── Load workshop.json config ────────────────────────────────────
const configPath = path.join(__dirname, '..', '..', 'workshop.json');
try {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw);
  console.log(`[workshop] loaded config from ${configPath}`);

  const db = getDb();

  // Register agents (metadata only — no per-agent gateway)
  if (Array.isArray(config.agents)) {
    for (const a of config.agents) {
      db.prepare(
        `INSERT OR REPLACE INTO agents (id, name, avatar, status)
         VALUES (?, ?, ?, 'offline')`
      ).run(a.id, a.name, a.avatar ?? '');

      router.registerAgent({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        status: 'offline',
      });

      console.log(`[workshop] registered agent: ${a.name} (${a.id})`);
    }
  }

  // Create channels
  if (Array.isArray(config.channels)) {
    for (const c of config.channels) {
      const now = new Date().toISOString();
      db.prepare(
        `INSERT OR IGNORE INTO channels (id, name, created_at, status)
         VALUES (?, ?, ?, 'active')`
      ).run(c.id, c.name, now);

      if (Array.isArray(c.agents)) {
        for (const entry of c.agents) {
          // Support both string ("kagura") and object ({ id: "kagura", requireMention: true })
          const agentId = typeof entry === 'string' ? entry : entry.id;
          const requireMention = typeof entry === 'string' ? false : !!entry.requireMention;

          db.prepare(
            `INSERT OR IGNORE INTO channel_agents (channel_id, agent_id, require_mention) VALUES (?, ?, ?)`
          ).run(c.id, agentId, requireMention ? 1 : 0);
        }
      }

      const agentIds = Array.isArray(c.agents)
        ? c.agents.map((e: any) => typeof e === 'string' ? e : e.id)
        : [];
      console.log(`[workshop] created channel: ${c.name} (${c.id}) with agents: ${agentIds.join(', ')}`);
    }
  }

  // Connect single shared gateway
  if (config.gateway?.url && config.gateway?.token) {
    router.initGateway(config.gateway.url, config.gateway.token);
    console.log(`[workshop] gateway: ${config.gateway.url}`);
  } else {
    console.warn(`[workshop] no gateway config found`);
  }

  // Initialize cron scheduler after gateway
  router.initCron();
} catch (err: any) {
  console.warn(`[workshop] could not load config: ${err.message}`);
}

// ── WebSocket server ─────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[server] client connected');
  router.addClient(ws);
});

wss.on('listening', () => {
  console.log(`[workshop] server listening on ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[workshop] shutting down...');
  wss.close();
  close();
  process.exit(0);
});
