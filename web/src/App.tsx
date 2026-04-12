import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { AgentList } from './components/AgentList';
import { CreateChannelDialog } from './components/CreateChannelDialog';
import { ChannelSettingsPanel } from './components/ChannelSettingsPanel';
import { TodoPanel } from './components/TodoPanel';
import { useWebSocket } from './hooks/useWebSocket';
import type { Channel, Agent, Message, ServerMessage, TodoItem, NorthStar, Pin, PatrolConfig, Notification } from './types';

const WS_URL = `ws://${window.location.hostname}:3100`;

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [typing, setTyping] = useState<Record<string, Set<string>>>({});
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<boolean>(false);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [showTodoPanel, setShowTodoPanel] = useState(false);
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [northStars, setNorthStars] = useState<NorthStar[]>([]);
  const [pins, setPins] = useState<Record<string, Pin[]>>({});
  const [patrolConfig, setPatrolConfigState] = useState<PatrolConfig | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationBadges, setNotificationBadges] = useState<Record<string, number>>({});

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
      case 'channel_meta_updated':
        setChannels((prev) => prev.map((c) => c.id === msg.channel.id ? msg.channel : c));
        break;
      case 'todo_list':
        setTodoItems(msg.items);
        break;
      case 'todo_created':
        setTodoItems((prev) => [...prev, msg.item]);
        break;
      case 'todo_updated':
        setTodoItems((prev) => prev.map((t) => t.id === msg.item.id ? msg.item : t));
        break;
      case 'todo_deleted':
        setTodoItems((prev) => prev.filter((t) => t.id !== msg.id));
        break;
      case 'north_star':
        setNorthStars((prev) => {
          const idx = prev.findIndex((s) => s.scope === msg.star.scope);
          if (idx >= 0) return prev.map((s, i) => i === idx ? msg.star : s);
          return [...prev, msg.star];
        });
        break;
      case 'north_star_list':
        setNorthStars(msg.stars);
        break;
      case 'pin_list':
        setPins((prev) => ({ ...prev, [msg.channelId]: msg.pins }));
        break;
      case 'pin_updated':
        setPins((prev) => {
          const channelPins = prev[msg.channelId] || [];
          const idx = channelPins.findIndex((p) => p.id === msg.pin.id);
          const updated = idx >= 0
            ? channelPins.map((p, i) => i === idx ? msg.pin : p)
            : [...channelPins, msg.pin];
          return { ...prev, [msg.channelId]: updated };
        });
        break;
      case 'patrol_config':
        setPatrolConfigState(msg.config);
        break;
      case 'patrol_fired':
        console.log('[patrol] fired for', msg.controlChannelId);
        break;
      case 'notification':
        setNotifications((prev) => [...prev, msg.notification]);
        break;
      case 'notification_badge':
        setNotificationBadges((prev) => ({ ...prev, [msg.channelId]: msg.unreadCount }));
        break;
      case 'error':
        console.error('[workshop]', msg.message);
        break;
    }
  }, []);

  const { send, connected } = useWebSocket(WS_URL, handleMessage);

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

  const handleUpdateChannelMeta = (channelId: string, metadata: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'northStar' | 'todoSection' | 'cronSchedule' | 'cronEnabled'>>) => {
    send({ type: 'update_channel_meta', channelId, metadata });
  };

  const handleSetNorthStar = (scope: string, content: string) => {
    send({ type: 'north_star_set', scope, content });
  };

  const handlePatrolConfigSet = (config: Partial<PatrolConfig>) => {
    send({ type: 'patrol_config_set', config });
  };

  const handlePatrolTrigger = () => {
    send({ type: 'patrol_trigger' });
  };

  const handleNotificationMarkRead = (channelId: string) => {
    send({ type: 'notification_mark_read', channelId });
  };

  // Request pins when active channel changes
  useEffect(() => {
    if (activeChannelId && connected) {
      send({ type: 'pin_list', channelId: activeChannelId });
      if (notificationBadges[activeChannelId] > 0) {
        send({ type: 'notification_mark_read', channelId: activeChannelId });
      }
    }
  }, [activeChannelId, connected, send]);

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
    <div className="flex h-screen">
      <Sidebar
        channels={channels}
        agents={agents}
        activeChannelId={activeChannelId}
        notificationBadges={notificationBadges}
        patrolControlChannelId={patrolConfig?.controlChannelId ?? null}
        onSelectChannel={setActiveChannelId}
        onCreateChannel={handleCreateChannel}
        onOpenSettings={(channelId) => { setActiveChannelId(channelId); setShowChannelSettings(true); }}
      />
      <ChatView
        channel={activeChannel ?? null}
        messages={activeChannelId ? (messages[activeChannelId] || []) : []}
        channelAgents={channelAgents}
        typingNames={typingNames}
        pins={activeChannelId ? (pins[activeChannelId] || []) : []}
        notifications={notifications.filter(n => n.targetChannelId === activeChannelId)}
        isPatrolChannel={patrolConfig?.controlChannelId === activeChannelId}
        onSendMessage={handleSendMessage}
        onEditChannel={activeChannel ? handleEditChannel : undefined}
        onOpenSettings={activeChannel ? () => setShowChannelSettings(true) : undefined}
        onToggleTodo={() => setShowTodoPanel((v) => !v)}
        onPatrolTrigger={handlePatrolTrigger}
      />
      {showTodoPanel && (
        <TodoPanel
          items={todoItems}
          northStars={northStars}
          onClose={() => setShowTodoPanel(false)}
          onCreate={(section, content) => send({ type: 'todo_create', section, content })}
          onUpdate={(id, updates) => send({ type: 'todo_update', id, updates })}
          onDelete={(id) => send({ type: 'todo_delete', id })}
          onSetNorthStar={handleSetNorthStar}
        />
      )}
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
      {showChannelSettings && activeChannel && (
        <ChannelSettingsPanel
          channel={activeChannel}
          patrolConfig={patrolConfig}
          channels={channels}
          onClose={() => setShowChannelSettings(false)}
          onSave={(metadata) => {
            handleUpdateChannelMeta(activeChannel.id, metadata);
            setShowChannelSettings(false);
          }}
          onPatrolConfigSave={handlePatrolConfigSet}
        />
      )}
      {!connected && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded text-sm">
          Disconnected from server
        </div>
      )}
    </div>
  );
}
