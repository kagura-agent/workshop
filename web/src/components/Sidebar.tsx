import type { Room } from '../types';

interface SidebarProps {
  rooms: Room[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}

export function Sidebar({ rooms, activeRoomId, onSelectRoom }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">Workshop</div>
      <div className="room-list">
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
    </div>
  );
}
