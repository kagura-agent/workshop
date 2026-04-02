import WebSocket from 'ws';
import type { Agent } from './types.js';

/**
 * GatewayConnection — maintains a WebSocket connection to one OpenClaw Gateway.
 *
 * MVP scaffold: connection lifecycle only, message handling is stubbed.
 */
export class GatewayConnection {
  private ws: WebSocket | null = null;
  private agent: Agent;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  onMessage?: (agentId: string, data: unknown) => void;
  onStatusChange?: (agentId: string, status: Agent['status']) => void;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  get agentId(): string {
    return this.agent.id;
  }

  connect(): void {
    if (this.ws) return;

    this.setStatus('connecting');
    console.log(`[gateway] connecting to ${this.agent.name} at ${this.agent.gatewayUrl}`);

    this.ws = new WebSocket(this.agent.gatewayUrl, {
      headers: { authorization: `Bearer ${this.agent.authToken}` },
    });

    this.ws.on('open', () => {
      console.log(`[gateway] connected to ${this.agent.name}`);
      this.setStatus('online');
    });

    this.ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        this.onMessage?.(this.agent.id, data);
      } catch {
        // ignore non-JSON
      }
    });

    this.ws.on('close', () => {
      console.log(`[gateway] disconnected from ${this.agent.name}`);
      this.ws = null;
      this.setStatus('offline');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error(`[gateway] error for ${this.agent.name}:`, err.message);
    });
  }

  /**
   * Send a chat message to the agent via gateway's chat.send method.
   */
  sendChat(content: string, sessionId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[gateway] cannot send to ${this.agent.name}: not connected`);
      return;
    }

    this.ws.send(JSON.stringify({
      method: 'chat.send',
      params: {
        message: content,
        ...(sessionId ? { sessionId } : {}),
      },
    }));
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('offline');
  }

  private setStatus(status: Agent['status']): void {
    this.agent.status = status;
    this.onStatusChange?.(this.agent.id, status);
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}
