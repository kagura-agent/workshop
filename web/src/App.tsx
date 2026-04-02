import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { AgentList } from './components/AgentList';
import { CreateChannelDialog } from './components/CreateChannelDialog';
import { useWebSocket } from './hooks/useWebSocket';
import type { Room, Agent, Message, ServerMessage } from './types';

const WS_URL = `ws://${window.location.hostname}:3100`;

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [typing, setTyping] = useState<Record<string, Set<string>>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState<boolean>(false);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'room_list':
        setRooms(msg.rooms);
        break;
      case 'agent_list':
        setAgents(msg.agents);
        break;
      case 'typing':
        setTyping((prev) => {
          const room = new Set(prev[msg.roomId] || []);
          room.add(msg.agentName);
          return { ...prev, [msg.roomId]: room };
        });
        // Auto-clear after 30s safety net
        setTimeout(() => {
          setTyping((prev) => {
            const room = new Set(prev[msg.roomId] || []);
            room.delete(msg.agentName);
            return { ...prev, [msg.roomId]: room };
          });
        }, 30000);
        break;
      case 'message':
        setMessages((prev) => ({
          ...prev,
          [msg.roomId]: [...(prev[msg.roomId] || []), msg.message],
        }));
        // Clear typing for this agent when their message arrives
        if (msg.message.role === 'assistant') {
          setTyping((prev) => {
            const room = new Set(prev[msg.roomId] || []);
            room.delete(msg.message.senderName);
            return { ...prev, [msg.roomId]: room };
          });
        }
        break;
      case 'room_created':
        setRooms((prev) => [...prev, msg.room]);
        break;
      case 'room_updated':
        setRooms((prev) => prev.map((r) => r.id === msg.room.id ? msg.room : r));
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

  const handleCreateRoom = (name: string, agentConfigs: { id: string; requireMention: boolean }[]) => {
    send({ type: 'create_room', name, agents: agentConfigs });
  };

  const handleUpdateRoom = (roomId: string, agentConfigs: { id: string; requireMention: boolean }[]) => {
    send({ type: 'update_room', roomId, agents: agentConfigs });
  };

  const handleEditRoom = () => {
    if (!activeRoomId) return;
    setEditingRoom(true);
  };

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const roomAgents = activeRoom
    ? agents.filter(a => activeRoom.agents.includes(a.id))
    : [];
  const typingNames = activeRoomId
    ? Array.from(typing[activeRoomId] || [])
    : [];

  return (
    <div className="app">
      <Sidebar
        rooms={rooms}
        agents={agents}
        activeRoomId={activeRoomId}
        onSelectRoom={setActiveRoomId}
        onCreateRoom={handleCreateRoom}
      />
      <ChatView
        roomName={activeRoom?.name ?? null}
        messages={activeRoomId ? (messages[activeRoomId] || []) : []}
        roomAgents={roomAgents}
        typingNames={typingNames}
        onSendMessage={handleSendMessage}
        onEditRoom={activeRoom ? handleEditRoom : undefined}
      />
      <AgentList agents={agents} />
      {editingRoom && activeRoom && (
        <CreateChannelDialog
          agents={agents}
          onClose={() => setEditingRoom(false)}
          onCreate={(_name, agentConfigs) => {
            handleUpdateRoom(activeRoom.id, agentConfigs);
            setEditingRoom(false);
          }}
          editRoom={{
            id: activeRoom.id,
            name: activeRoom.name,
            agents: activeRoom.agentConfigs ?? activeRoom.agents.map(id => ({ id, requireMention: false })),
          }}
        />
      )}
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
