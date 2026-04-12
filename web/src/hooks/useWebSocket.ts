import { useEffect, useRef, useCallback, useState } from 'react';
import type { ServerMessage } from '../types';

type MessageHandler = (msg: ServerMessage) => void;

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 30000;

function getBackoff(attempt: number): number {
  return Math.min(BACKOFF_BASE * Math.pow(2, attempt), BACKOFF_MAX);
}

export function useWebSocket(url: string, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Keep the callback ref current without triggering reconnects
  onMessageRef.current = onMessage;

  // Track whether the hook is still mounted and whether disconnect was intentional
  const mountedRef = useRef(true);
  const intentionalCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedOnceRef = useRef(false);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Clean up previous connection if any
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      console.log('[ws] connected');
      const wasReconnect = hasConnectedOnceRef.current;
      hasConnectedOnceRef.current = true;
      setStatus('connected');
      setReconnectAttempt(0);
      if (wasReconnect) {
        console.log('[ws] reconnected — re-fetching state');
      }
      // Server sends channel_list and agent_list on connect,
      // so reconnect automatically re-fetches state.
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch {
        // ignore
      }
    };

    ws.onerror = (event) => {
      console.warn('[ws] error', event);
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;

      console.log('[ws] disconnected');

      if (intentionalCloseRef.current) {
        setStatus('disconnected');
        return;
      }

      // Start reconnecting
      setStatus('reconnecting');
      setReconnectAttempt((prev) => {
        const attempt = prev;
        const delay = getBackoff(attempt);
        console.log(`[ws] reconnecting in ${delay}ms (attempt ${attempt + 1})`);

        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, delay);

        return attempt + 1;
      });
    };
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    intentionalCloseRef.current = false;
    hasConnectedOnceRef.current = false;
    setReconnectAttempt(0);

    connect();

    return () => {
      mountedRef.current = false;
      intentionalCloseRef.current = true;

      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  return { send, connected: status === 'connected', status, reconnectAttempt };
}
