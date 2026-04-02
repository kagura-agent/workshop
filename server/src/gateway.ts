import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';

/**
 * GatewayConnection — single shared WebSocket connection to OpenClaw Gateway.
 *
 * All agents share this connection. Each agent+room combination gets its own
 * session key: `agent:{agentId}:workshop:{roomId}`.
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
  private gatewayUrl: string;
  private authToken: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private pendingCallbacks = new Map<string, (data: any) => void>();
  private ownSessionKeys = new Set<string>();
  /** Track which sessions have already fired a typing event (reset on final). */
  private typingFired = new Set<string>();

  /** Callback for incoming agent messages. agentId + roomId parsed from sessionKey. */
  onMessage?: (agentId: string, roomId: string, content: string) => void;
  /** Callback for first delta — signals agent started typing. */
  onTyping?: (agentId: string, roomId: string) => void;
  onStatusChange?: (status: 'online' | 'connecting' | 'offline') => void;

  constructor(gatewayUrl: string, authToken: string) {
    this.gatewayUrl = gatewayUrl;
    this.authToken = authToken;
  }

  connect(): void {
    if (this.ws) return;

    this.connected = false;
    this.onStatusChange?.('connecting');
    console.log(`[gateway] connecting to ${this.gatewayUrl}`);

    this.ws = new WebSocket(this.gatewayUrl);

    this.ws.on('open', () => {
      console.log(`[gateway] WebSocket open, waiting for challenge…`);
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
      console.log(`[gateway] disconnected`);
      this.ws = null;
      this.connected = false;
      this.pendingCallbacks.clear();
      this.onStatusChange?.('offline');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error(`[gateway] error:`, err.message);
    });
  }

  /**
   * Send a chat message to a specific agent in a specific room.
   * Session key format: agent:{agentId}:workshop:{roomId}
   */
  sendChat(content: string, roomId: string, agentId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) {
      console.warn(`[gateway] cannot send: not connected`);
      return;
    }

    const id = uuid();
    const idempotencyKey = uuid();
    // Gateway internally prefixes session keys, so we send without the agent prefix
    const sessionKey = `agent:${agentId}:workshop:${roomId}`;

    // Track this session key so we only process events from our own sessions
    this.ownSessionKeys.add(sessionKey);

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

    this.pendingCallbacks.set(id, (resp: any) => {
      if (!resp.ok) {
        console.error(`[gateway] chat.send rejected for agent=${agentId} room=${roomId}:`, resp.error?.message ?? resp);
      }
    });

    this.ws.send(JSON.stringify(frame));
    console.log(`[gateway] → chat.send agent=${agentId} room=${roomId} session=${sessionKey}: "${content.slice(0, 80)}"`);
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
    this.typingFired.clear();
    this.onStatusChange?.('offline');
  }

  // ── protocol handling ──────────────────────────────────────────

  private handleFrame(data: any): void {
    const frameType = data?.type;

    if (frameType === 'event') {
      this.handleEvent(data);
      return;
    }

    if (frameType === 'res') {
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

    if (event === 'chat') {
      const sk = payload?.sessionKey ?? 'none';
      console.log(`[gateway] ← chat state=${payload?.state} session=${sk}`);
    }

    switch (event) {
      case 'connect.challenge':
        this.handleChallenge(payload);
        break;

      case 'chat': {
        const chatSessionKey = payload?.sessionKey;
        if (chatSessionKey && !this.ownSessionKeys.has(chatSessionKey)) {
          break;
        }
        this.handleChatEvent(payload);
        break;
      }

      case 'agent':
        // Ignored — chat events already handle responses (avoids duplicates)
        break;

      case 'tick':
        break;

      default:
        break;
    }
  }

  /**
   * Handle chat events. Parse agentId and roomId from sessionKey.
   * Format: agent:{agentId}:workshop:{roomId}
   */
  private handleChatEvent(payload: any): void {
    if (!payload) return;

    const state = payload.state;
    const sessionKey = payload.sessionKey as string | undefined;

    // Parse agentId and roomId from sessionKey
    const parsed = this.parseSessionKey(sessionKey);
    if (!parsed) return;

    const { agentId, roomId } = parsed;

    switch (state) {
      case 'delta': {
        // Fire typing callback once per response (not on every delta)
        const key = `${agentId}:${roomId}`;
        if (!this.typingFired.has(key)) {
          this.typingFired.add(key);
          this.onTyping?.(agentId, roomId);
        }
        break;
      }

      case 'final': {
        // Clear typing state for this agent+room
        this.typingFired.delete(`${agentId}:${roomId}`);
        const message = payload.message;
        const text = this.extractChatText(message);
        if (text) {
          console.log(`[gateway] ← chat final agent=${agentId} room=${roomId}: "${text.slice(0, 120)}${text.length > 120 ? '...' : ''}"`);
          this.onMessage?.(agentId, roomId, text);
        }
        break;
      }

      case 'error':
        console.error(`[gateway] chat error agent=${agentId} room=${roomId}:`, payload.errorMessage ?? 'Unknown');
        break;

      default:
        break;
    }
  }

  /**
   * Parse session key format: agent:{agentId}:workshop:{roomId}
   */
  private parseSessionKey(sessionKey: string | undefined): { agentId: string; roomId: string } | null {
    if (!sessionKey) return null;
    const match = sessionKey.match(/^agent:([^:]+):workshop:([^:]+)$/);
    if (!match) return null;
    return { agentId: match[1], roomId: match[2] };
  }

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
    console.log(`[gateway] received challenge (nonce: ${nonce})`);

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
          token: this.authToken,
        },
        role: 'operator',
        scopes: ['operator.admin', 'operator.write', 'operator.read'],
      },
    };

    this.pendingCallbacks.set(id, (resp: any) => {
      if (resp.ok) {
        console.log(`[gateway] connected`, JSON.stringify(resp.payload?.type ?? resp.payload));
        this.connected = true;
        this.onStatusChange?.('online');
      } else {
        console.error(`[gateway] connect rejected:`, resp.error?.message ?? resp);
        this.ws?.close();
      }
    });

    this.ws!.send(JSON.stringify(connectRequest));
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}
