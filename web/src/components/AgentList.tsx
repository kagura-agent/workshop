import type { Agent } from '../types';

interface AgentListProps {
  agents: Agent[];
}

export function AgentList({ agents }: AgentListProps) {
  const online = agents.filter((a) => a.status === 'online');
  const offline = agents.filter((a) => a.status !== 'online');

  return (
    <div className="agent-list">
      {online.length > 0 && (
        <>
          <div className="agent-list-header">Online — {online.length}</div>
          {online.map((agent) => (
            <div key={agent.id} className="agent-item">
              <div className="agent-status online" />
              <span className="agent-name">{agent.name}</span>
            </div>
          ))}
        </>
      )}
      {offline.length > 0 && (
        <>
          <div className="agent-list-header" style={{ marginTop: online.length > 0 ? 16 : 0 }}>
            Offline — {offline.length}
          </div>
          {offline.map((agent) => (
            <div key={agent.id} className="agent-item">
              <div className="agent-status" />
              <span className="agent-name">{agent.name}</span>
            </div>
          ))}
        </>
      )}
      {agents.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No agents connected</div>
      )}
    </div>
  );
}
