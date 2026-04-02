import { WebSocketServer } from 'ws';
import { getDb, close } from './db.js';
import { Router } from './router.js';

const PORT = Number(process.env.PORT) || 3100;

// Initialize database
getDb();

const wss = new WebSocketServer({ port: PORT });
const router = new Router();

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
