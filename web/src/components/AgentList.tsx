import { useState } from 'react';
import type { Agent } from '../types';

interface AgentListProps {
  agents: Agent[];
  onRegisterAgent: (agent: { id: string; name: string; avatar?: string }) => void;
  onUpdateAgent: (id: string, updates: Partial<{ name: string; avatar: string }>) => void;
  onRemoveAgent: (id: string) => void;
}

export function AgentList({ agents, onRegisterAgent, onUpdateAgent, onRemoveAgent }: AgentListProps) {
  const online = agents.filter((a) => a.status === 'online');
  const offline = agents.filter((a) => a.status !== 'online');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newAvatar, setNewAvatar] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newId.trim() || !newName.trim()) return;
    onRegisterAgent({ id: newId.trim(), name: newName.trim(), avatar: newAvatar.trim() || undefined });
    setNewId('');
    setNewName('');
    setNewAvatar('');
    setShowAddForm(false);
  };

  const startEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setEditName(agent.name);
    setEditAvatar(agent.avatar ?? '');
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    onUpdateAgent(editingId, { name: editName.trim(), avatar: editAvatar.trim() });
    setEditingId(null);
  };

  const handleRemove = (id: string) => {
    onRemoveAgent(id);
    setConfirmRemoveId(null);
  };

  const renderAgent = (agent: Agent) => {
    const isOnline = agent.status === 'online';

    if (editingId === agent.id) {
      return (
        <div key={agent.id} className="mb-2 p-2 rounded bg-background border border-border">
          <input
            className="w-full mb-1 px-2 py-1 text-sm bg-background border border-border rounded"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Name"
          />
          <input
            className="w-full mb-1 px-2 py-1 text-sm bg-background border border-border rounded"
            value={editAvatar}
            onChange={(e) => setEditAvatar(e.target.value)}
            placeholder="Avatar URL"
          />
          <div className="flex gap-1">
            <button
              onClick={handleSaveEdit}
              className="text-xs px-2 py-0.5 bg-discord-blurple text-white rounded hover:opacity-90"
            >
              Save
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="text-xs px-2 py-0.5 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    if (confirmRemoveId === agent.id) {
      return (
        <div key={agent.id} className="mb-2 p-2 rounded bg-background border border-red-500/50">
          <div className="text-xs text-red-400 mb-1">Remove {agent.name}?</div>
          <div className="flex gap-1">
            <button
              onClick={() => handleRemove(agent.id)}
              className="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:opacity-90"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmRemoveId(null)}
              className="text-xs px-2 py-0.5 text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={agent.id} className="group flex items-center gap-2 py-1 mb-1">
        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-discord-online' : 'bg-discord-offline'}`} />
        <span className="text-sm text-muted-foreground flex-1">{agent.name}</span>
        <div className="hidden group-hover:flex gap-0.5">
          <button
            onClick={() => startEdit(agent)}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
            title="Edit"
          >
            &#9998;
          </button>
          <button
            onClick={() => setConfirmRemoveId(agent.id)}
            className="text-xs text-muted-foreground hover:text-red-400 px-1"
            title="Remove"
          >
            &times;
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-60 bg-card border-l border-border p-4">
      {online.length > 0 && (
        <>
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wide">
            Online — {online.length}
          </div>
          {online.map(renderAgent)}
        </>
      )}
      {offline.length > 0 && (
        <>
          <div
            className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wide"
            style={{ marginTop: online.length > 0 ? 16 : 0 }}
          >
            Offline — {offline.length}
          </div>
          {offline.map(renderAgent)}
        </>
      )}
      {agents.length === 0 && (
        <div className="text-muted-foreground text-[13px]">No agents connected</div>
      )}

      {/* Add agent form */}
      <div className="mt-4 pt-3 border-t border-border">
        {showAddForm ? (
          <div className="space-y-1">
            <input
              className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="Agent ID"
            />
            <input
              className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name"
            />
            <input
              className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
              value={newAvatar}
              onChange={(e) => setNewAvatar(e.target.value)}
              placeholder="Avatar URL (optional)"
            />
            <div className="flex gap-1">
              <button
                onClick={handleAdd}
                disabled={!newId.trim() || !newName.trim()}
                className="text-xs px-2 py-1 bg-discord-blurple text-white rounded hover:opacity-90 disabled:opacity-50"
              >
                Add Agent
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
          >
            + Add Agent
          </button>
        )}
      </div>
    </div>
  );
}
