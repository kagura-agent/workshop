import { useState } from 'react';
import { CreateChannelDialog } from './CreateChannelDialog';
import type { Room, Agent } from '../types';

interface SidebarProps {
  rooms: Room[];
  agents: Agent[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onCreateRoom: (name: string, agents: { id: string; requireMention: boolean }[]) => void;
}

export function Sidebar({ rooms, agents, activeRoomId, onSelectRoom, onCreateRoom }: SidebarProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div className="sidebar">
      <div className="sidebar-header">Workshop</div>
      <div className="room-list">
        <div className="room-list-header">
          <span className="room-list-title">Rooms</span>
          <button className="room-add-btn" onClick={() => setShowDialog(true)}>+</button>
        </div>
        {rooms.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
            No rooms yet
          </div>
        )}
        {rooms.map((room) => (
          <div
            key={room.id}
            className={`room-item ${room.id === activeRoomId ? 'active' : ''}`}
            onClick={() => onSelectRoom(room.id)}
          >
            {room.name}
          </div>
        ))}
      </div>
      {showDialog && (
        <CreateChannelDialog
          agents={agents}
          onClose={() => setShowDialog(false)}
          onCreate={(name, agentConfigs) => {
            onCreateRoom(name, agentConfigs);
            setShowDialog(false);
          }}
        />
      )}
    </div>
  );
}
