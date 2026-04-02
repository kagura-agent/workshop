import { useEffect, useRef, useCallback, useState } from 'react';
import type { ServerMessage } from '../types';

type MessageHandler = (msg: ServerMessage) => void;

export function useWebSocket(url: string, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ws] connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        onMessage(msg);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      console.log('[ws] disconnected');
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [url]); // intentionally omit onMessage to avoid reconnects

  const send = useCallback((data: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  return { send, connected };
}
