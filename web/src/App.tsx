import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { AgentList } from './components/AgentList';
import { CreateChannelDialog } from './components/CreateChannelDialog';
import { useWebSocket } from './hooks/useWebSocket';
import type { Channel, Agent, Message, ServerMessage } from './types';

const WS_URL = `ws://${window.location.hostname}:3100`;

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [typing, setTyping] = useState<Record<string, Set<string>>>({});
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<boolean>(false);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'channel_list':
        setChannels(msg.channels);
        break;
      case 'agent_list':
        setAgents(msg.agents);
        break;
      case 'typing':
        setTyping((prev) => {
          const channel = new Set(prev[msg.channelId] || []);
          channel.add(msg.agentName);
          return { ...prev, [msg.channelId]: channel };
        });
        // Auto-clear after 30s safety net
        setTimeout(() => {
          setTyping((prev) => {
            const channel = new Set(prev[msg.channelId] || []);
            channel.delete(msg.agentName);
            return { ...prev, [msg.channelId]: channel };
          });
        }, 30000);
        break;
      case 'message':
        setMessages((prev) => ({
          ...prev,
          [msg.channelId]: [...(prev[msg.channelId] || []), msg.message],
        }));
        // Clear typing for this agent when their message arrives
        if (msg.message.role === 'assistant') {
          setTyping((prev) => {
            const channel = new Set(prev[msg.channelId] || []);
            channel.delete(msg.message.senderName);
            return { ...prev, [msg.channelId]: channel };
          });
        }
        break;
      case 'channel_created':
        setChannels((prev) => [...prev, msg.channel]);
        break;
      case 'channel_updated':
        setChannels((prev) => prev.map((c) => c.id === msg.channel.id ? msg.channel : c));
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
    if (!activeChannelId) return;
    send({ type: 'send_message', channelId: activeChannelId, content });
  };

  const handleCreateChannel = (name: string, agentConfigs: { id: string; requireMention: boolean }[]) => {
    send({ type: 'create_channel', name, agents: agentConfigs });
  };

  const handleUpdateChannel = (channelId: string, agentConfigs: { id: string; requireMention: boolean }[]) => {
    send({ type: 'update_channel', channelId, agents: agentConfigs });
  };

  const handleEditChannel = () => {
    if (!activeChannelId) return;
    setEditingChannel(true);
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const channelAgents = activeChannel
    ? agents.filter(a => activeChannel.agents.includes(a.id))
    : [];
  const typingNames = activeChannelId
    ? Array.from(typing[activeChannelId] || [])
    : [];

  return (
    <div className="app">
      <Sidebar
        channels={channels}
        agents={agents}
        activeChannelId={activeChannelId}
        onSelectChannel={setActiveChannelId}
        onCreateChannel={handleCreateChannel}
      />
      <ChatView
        channelName={activeChannel?.name ?? null}
        messages={activeChannelId ? (messages[activeChannelId] || []) : []}
        channelAgents={channelAgents}
        typingNames={typingNames}
        onSendMessage={handleSendMessage}
        onEditChannel={activeChannel ? handleEditChannel : undefined}
      />
      <AgentList agents={agents} />
      {editingChannel && activeChannel && (
        <CreateChannelDialog
          agents={agents}
          onClose={() => setEditingChannel(false)}
          onCreate={(_name, agentConfigs) => {
            handleUpdateChannel(activeChannel.id, agentConfigs);
            setEditingChannel(false);
          }}
          editChannel={{
            id: activeChannel.id,
            name: activeChannel.name,
            agents: activeChannel.agentConfigs ?? activeChannel.agents.map(id => ({ id, requireMention: false })),
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
