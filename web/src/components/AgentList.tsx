import type { Agent } from '../types';

interface AgentListProps {
  agents: Agent[];
}

export function AgentList({ agents }: AgentListProps) {
  const online = agents.filter((a) => a.status === 'online');
  const offline = agents.filter((a) => a.status !== 'online');

  return (
    <div className="w-60 bg-card border-l border-border p-4">
      {online.length > 0 && (
        <>
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wide">
            Online — {online.length}
          </div>
          {online.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 py-1 mb-1">
              <div className="w-2 h-2 rounded-full bg-discord-online" />
              <span className="text-sm text-muted-foreground">{agent.name}</span>
            </div>
          ))}
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
          {offline.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 py-1 mb-1">
              <div className="w-2 h-2 rounded-full bg-discord-offline" />
              <span className="text-sm text-muted-foreground">{agent.name}</span>
            </div>
          ))}
        </>
      )}
      {agents.length === 0 && (
        <div className="text-muted-foreground text-[13px]">No agents connected</div>
      )}
    </div>
  );
}
