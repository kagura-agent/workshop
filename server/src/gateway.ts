import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';
import type { Agent } from './types.js';

/**
 * GatewayConnection — maintains a WebSocket connection to one OpenClaw Gateway.
 *
 * Implements the OpenClaw Gateway challenge-response auth protocol:
 * 1. Open WS (no auth headers)
 * 2. Receive { type:"event", event:"connect.challenge", payload:{ nonce } }
 * 3. Send { type:"req", id, method:"connect", params:{ ... auth:{ token } } }
 * 4. Receive { type:"res", id, ok:true, payload:{ type:"hello-ok", ... } }
 * 5. Now can send chat.send requests and receive chat events
 */
export class GatewayConnection {
  private ws: WebSocket | null = null;
  private agent: Agent;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false; // true after successful connect handshake
  private pendingCallbacks = new Map<string, (data: any) => void>();
  private ownSessionKeys = new Set<string>(); // session keys created by Workshop

  onMessage?: (agentId: string, content: string) => void;
  onStatusChange?: (agentId: string, status: Agent['status']) => void;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  get agentId(): string {
    return this.agent.id;
  }

  connect(): void {
    if (this.ws) return;

    this.connected = false;
    this.setStatus('connecting');
    console.log(`[gateway] connecting to ${this.agent.name} at ${this.agent.gatewayUrl}`);

    // No auth headers — the protocol uses challenge-response over the WS channel
    this.ws = new WebSocket(this.agent.gatewayUrl);

    this.ws.on('open', () => {
      console.log(`[gateway] WebSocket open to ${this.agent.name}, waiting for challenge…`);
    });

    this.ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        this.handleFrame(data);
      } catch {
        // ignore non-JSON
      }
    });

    this.ws.on('close', () => {
      console.log(`[gateway] disconnected from ${this.agent.name}`);
      this.ws = null;
      this.connected = false;
      this.pendingCallbacks.clear();
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
  sendChat(content: string, roomId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) {
      console.warn(`[gateway] cannot send to ${this.agent.name}: not connected`);
      return;
    }

    const id = uuid();
    const idempotencyKey = uuid();
    // sessionKey: use "main" or a room-scoped key
    const sessionKey = roomId ? `workshop:${roomId}` : 'main';

    // Track this session key so we only process events from our own sessions
    // Gateway prefixes with "agent:{agentId}:" internally
    this.ownSessionKeys.add(sessionKey);
    this.ownSessionKeys.add(`agent:${this.agent.id}:${sessionKey}`);

    const frame = {
      type: 'req',
      id,
      method: 'chat.send',
      params: {
        sessionKey,
        message: content,
        idempotencyKey,
      },
    };

    // Register callback to handle the ack response
    this.pendingCallbacks.set(id, (resp: any) => {
      if (!resp.ok) {
        console.error(`[gateway] chat.send rejected by ${this.agent.name}:`, resp.error?.message ?? resp);
      }
    });

    this.ws.send(JSON.stringify(frame));
    console.log(`[gateway] → chat.send to ${this.agent.name} session=${sessionKey}: "${content.slice(0, 80)}"`);
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
    this.connected = false;
    this.pendingCallbacks.clear();
    this.ownSessionKeys.clear();
    this.setStatus('offline');
  }

  // ── protocol handling ──────────────────────────────────────────

  private handleFrame(data: any): void {
    const frameType = data?.type;

    if (frameType === 'event') {
      this.handleEvent(data);
      return;
    }

    if (frameType === 'res') {
      // Response to one of our requests
      const id = data?.id;
      if (id && this.pendingCallbacks.has(id)) {
        const cb = this.pendingCallbacks.get(id)!;
        this.pendingCallbacks.delete(id);
        cb(data);
      }
      return;
    }
  }

  private handleEvent(frame: any): void {
    const { event, payload } = frame;

    // Debug: log chat/agent events with session info
    if (event === 'chat') {
      const sk = payload?.sessionKey ?? 'none';
      console.log(`[gateway] ← chat state=${payload?.state} session=${sk}`);
    }

    switch (event) {
      case 'connect.challenge':
        this.handleChallenge(payload);
        break;

      case 'chat': {
        // Chat events from gateway (TUI/Control UI format): { runId, sessionKey, state, message }
        const chatSessionKey = payload?.sessionKey;
        if (chatSessionKey && !this.ownSessionKeys.has(chatSessionKey)) {
          break;
        }
        console.log(`[gateway] ← chat event: state=${payload?.state} session=${chatSessionKey}`);
        this.handleChatEvent(payload);
        break;
      }

      case 'agent': {
        // Agent events (broadcast format) — skip text processing to avoid duplicates
        // (chat events already handle the response)
        break;
      }

      case 'tick':
        // keepalive, ignore
        break;

      default:
        // Unknown event, log for debugging
        // console.log(`[gateway] ${this.agent.name} event: ${event}`);
        break;
    }
  }

  /**
   * Handle chat events (TUI/Control UI format).
   * Format: { runId, sessionKey, state: "delta"|"final"|"error", message: { role, content, timestamp } }
   */
  private handleChatEvent(payload: any): void {
    if (!payload) return;

    const state = payload.state;

    switch (state) {
      case 'delta': {
        // Streaming delta
        const message = payload.message;
        const text = this.extractChatText(message);
        if (text) {
          console.log(`[gateway] ← chat delta from ${this.agent.name}: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);
          // Don't emit deltas as messages yet - wait for final
        }
        break;
      }

      case 'final': {
        const message = payload.message;
        const text = this.extractChatText(message);
        if (text) {
          console.log(`[gateway] ← chat final from ${this.agent.name}: "${text.slice(0, 120)}${text.length > 120 ? '...' : ''}"`);
          this.onMessage?.(this.agent.id, text);
        }
        break;
      }

      case 'error': {
        console.error(`[gateway] ${this.agent.name} chat error:`, payload.errorMessage ?? 'Unknown');
        break;
      }

      default:
        console.log(`[gateway] ← chat state=${state} from ${this.agent.name}`);
        break;
    }
  }

  /**
   * Handle agent events (broadcast format).
   * Format: { runId, sessionKey, stream: "assistant"|"lifecycle"|"tool", data: { text, delta, phase, ... } }
   */
  private handleAgentEvent(payload: any): void {
    if (!payload) return;

    const stream = payload.stream;
    const data = payload.data;

    switch (stream) {
      case 'assistant': {
        const text = data?.text;
        if (text && typeof text === 'string') {
          const isDelta = data?.delta === true;
          if (!isDelta) {
            console.log(`[gateway] ← agent final from ${this.agent.name}: "${text.slice(0, 120)}${text.length > 120 ? '...' : ''}"`);
            this.onMessage?.(this.agent.id, text);
          }
        }
        break;
      }

      case 'lifecycle': {
        const phase = data?.phase;
        console.log(`[gateway] ← lifecycle from ${this.agent.name}: phase=${phase}`);
        break;
      }

      default:
        break;
    }
  }

  /**
   * Extract plain text from a chat message object.
   */
  private extractChatText(message: any): string {
    if (!message) return '';
    if (typeof message.text === 'string') return message.text;
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: any) => b.text)
        .join('');
    }
    return '';
  }

  private handleChallenge(payload: any): void {
    const nonce = payload?.nonce;
    console.log(`[gateway] received challenge from ${this.agent.name} (nonce: ${nonce})`);

    const id = uuid();
    const connectRequest = {
      type: 'req',
      id,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-tui',
          displayName: 'Workshop',
          version: '0.1.0',
          platform: 'linux',
          mode: 'ui',
        },
        caps: [],
        auth: {
          token: this.agent.authToken,
        },
        role: 'operator',
        scopes: ['operator.admin', 'operator.write', 'operator.read'],
      },
    };

    // Register callback for the connect response
    this.pendingCallbacks.set(id, (resp: any) => {
      if (resp.ok) {
        console.log(`[gateway] connected to ${this.agent.name}`, JSON.stringify(resp.payload?.type ?? resp.payload));
        this.connected = true;
        this.setStatus('online');
      } else {
        console.error(`[gateway] connect rejected by ${this.agent.name}:`, resp.error?.message ?? resp);
        this.ws?.close();
      }
    });

    this.ws!.send(JSON.stringify(connectRequest));
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
