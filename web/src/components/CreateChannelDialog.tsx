import { useState, useEffect } from 'react';
import type { CreateChannelDialogProps } from '../types';

export function CreateChannelDialog({ agents, onClose, onCreate, editRoom }: CreateChannelDialogProps) {
  const isEdit = !!editRoom;

  const [name, setName] = useState(() => {
    if (editRoom) return editRoom.name.replace(/^#/, '');
    return '';
  });

  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    if (editRoom) {
      const sel: Record<string, boolean> = {};
      for (const a of editRoom.agents) sel[a.id] = true;
      return sel;
    }
    return {};
  });

  const [requireMention, setRequireMention] = useState<Record<string, boolean>>(() => {
    if (editRoom) {
      const rm: Record<string, boolean> = {};
      for (const a of editRoom.agents) {
        if (a.requireMention) rm[a.id] = true;
      }
      return rm;
    }
    return {};
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const toggleAgent = (id: string) => {
    setSelected(prev => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) {
        setRequireMention(rm => { const n = { ...rm }; delete n[id]; return n; });
      }
      return next;
    });
  };

  const toggleMention = (id: string) => {
    setRequireMention(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = () => {
    const agentConfigs = agents
      .filter(a => selected[a.id])
      .map(a => ({ id: a.id, requireMention: !!requireMention[a.id] }));

    if (isEdit) {
      onCreate(editRoom!.name, agentConfigs);
    } else {
      const trimmed = name.trim();
      if (!trimmed) return;
      const channelName = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
      onCreate(channelName, agentConfigs);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? 'Edit Channel' : 'Create Channel'}</h2>

        <label className="modal-label">Channel Name</label>
        <div className="modal-input-wrapper">
          <span className="modal-input-prefix">#</span>
          <input
            className="modal-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="new-channel"
            autoFocus={!isEdit}
            disabled={isEdit}
          />
        </div>

        <label className="modal-label">Agents</label>
        <div className="modal-agent-list">
          {agents.map(agent => (
            <div key={agent.id} className="modal-agent-row">
              <label className="modal-agent-check">
                <input
                  type="checkbox"
                  checked={!!selected[agent.id]}
                  onChange={() => toggleAgent(agent.id)}
                />
                <span className="modal-agent-avatar">{agent.avatar || agent.name.charAt(0)}</span>
                <span className="modal-agent-name">{agent.name}</span>
              </label>
              {selected[agent.id] && (
                <label className="modal-mention-toggle">
                  <span className="modal-mention-label">Only when @mentioned</span>
                  <button
                    type="button"
                    className={`toggle-switch ${requireMention[agent.id] ? 'active' : ''}`}
                    onClick={() => toggleMention(agent.id)}
                  >
                    <span className="toggle-knob" />
                  </button>
                </label>
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn modal-btn-create"
            onClick={handleSubmit}
            disabled={!isEdit && !name.trim()}
          >
            {isEdit ? 'Save' : 'Create Channel'}
          </button>
        </div>
      </div>
    </div>
  );
}
