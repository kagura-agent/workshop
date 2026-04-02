import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { AgentList } from './components/AgentList';
import { useWebSocket } from './hooks/useWebSocket';
import type { Room, Agent, Message, ServerMessage } from './types';

const WS_URL = `ws://${window.location.hostname}:3100`;

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'room_list':
        setRooms(msg.rooms);
        break;
      case 'agent_list':
        setAgents(msg.agents);
        break;
      case 'message':
        setMessages((prev) => ({
          ...prev,
          [msg.roomId]: [...(prev[msg.roomId] || []), msg.message],
        }));
        break;
      case 'room_created':
        setRooms((prev) => [...prev, msg.room]);
        break;
      case 'error':
        console.error('[workshop]', msg.message);
        break;
    }
  }, []);

  const { send, connected } = useWebSocket(WS_URL, handleMessage);

  // Request initial data on connect
  // (in a real app we'd do this on the 'open' event; good enough for scaffold)

  const handleSendMessage = (content: string) => {
    if (!activeRoomId) return;
    send({ type: 'send_message', roomId: activeRoomId, content });
  };

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  return (
    <div className="app">
      <Sidebar
        rooms={rooms}
        activeRoomId={activeRoomId}
        onSelectRoom={setActiveRoomId}
      />
      <ChatView
        roomName={activeRoom?.name ?? null}
        messages={activeRoomId ? (messages[activeRoomId] || []) : []}
        onSendMessage={handleSendMessage}
      />
      <AgentList agents={agents} />
      {!connected && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ed4245',
          color: 'white',
          padding: '8px 16px',
          borderRadius: 4,
          fontSize: 13,
        }}>
          Disconnected from server
        </div>
      )}
    </div>
  );
}
