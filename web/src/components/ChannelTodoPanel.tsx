import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { TodoItem, TodoStatus } from '../types';

interface ChannelTodoPanelProps {
  channelId: string;
  items: TodoItem[];
  onClose: () => void;
  onCreate: (channelId: string, content: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<TodoItem, 'content' | 'status' | 'section' | 'assignedChannel' | 'assignedAgent'>>) => void;
  onDelete: (id: string) => void;
}

const STATUS_CYCLE: TodoStatus[] = ['pending', 'in_progress', 'review', 'done'];

const STATUS_CONFIG: Record<TodoStatus, { label: string; color: string; bg: string; headerBg: string }> = {
  pending: { label: 'Pending', color: 'text-muted-foreground', bg: 'bg-muted-foreground/20', headerBg: 'bg-muted-foreground/10' },
  in_progress: { label: 'In Progress', color: 'text-blue-400', bg: 'bg-blue-400/20', headerBg: 'bg-blue-400/10' },
  review: { label: 'Review', color: 'text-yellow-400', bg: 'bg-yellow-400/20', headerBg: 'bg-yellow-400/10' },
  done: { label: 'Done', color: 'text-green-400', bg: 'bg-green-400/20', headerBg: 'bg-green-400/10' },
};

export function ChannelTodoPanel({ channelId, items, onClose, onCreate, onUpdate, onDelete }: ChannelTodoPanelProps) {
  const [newContent, setNewContent] = useState('');

  const columns = new Map<TodoStatus, TodoItem[]>();
  for (const status of STATUS_CYCLE) {
    columns.set(status, []);
  }
  for (const item of items) {
    columns.get(item.status)!.push(item);
  }

  const handleAdd = () => {
    const content = newContent.trim();
    if (!content) return;
    onCreate(channelId, content);
    setNewContent('');
  };

  const cycleStatus = (item: TodoItem) => {
    const idx = STATUS_CYCLE.indexOf(item.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    onUpdate(item.id, { status: next });
  };

  return (
    <div className="border-b border-border bg-card/50">
      <div className="p-2 px-4 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channel Tasks ({items.length})</span>
        <button className="text-muted-foreground hover:text-foreground cursor-pointer text-sm leading-none" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto min-h-0">
        {STATUS_CYCLE.map((status) => {
          const cfg = STATUS_CONFIG[status];
          const colItems = columns.get(status) || [];
          return (
            <div key={status} className="flex-1 min-w-[120px] flex flex-col min-h-0">
              <div className={cn('rounded-t px-2 py-1 flex items-center gap-1.5', cfg.headerBg)}>
                <span className={cn('text-[10px] font-semibold', cfg.color)}>{cfg.label}</span>
                <span className="text-[9px] text-muted-foreground">{colItems.length}</span>
              </div>
              <ScrollArea className="flex-1 border border-t-0 border-border rounded-b max-h-[150px]">
                <div className="p-1 space-y-1">
                  {colItems.length === 0 && (
                    <div className="text-muted-foreground text-[9px] text-center py-2">Empty</div>
                  )}
                  {colItems.map((item) => (
                    <div
                      key={item.id}
                      className="group bg-muted/50 rounded p-1.5 text-[11px] hover:bg-muted"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className={cn('flex-1 break-words', item.status === 'done' && 'line-through text-muted-foreground')}>
                          {item.content}
                        </span>
                        <button
                          className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive cursor-pointer text-[9px]"
                          onClick={() => onDelete(item.id)}
                          title="Delete"
                        >
                          &times;
                        </button>
                      </div>
                      <div className="mt-1 flex items-center">
                        <button
                          className={cn('px-1 py-0.5 rounded text-[8px] font-medium cursor-pointer', cfg.bg, cfg.color)}
                          onClick={() => cycleStatus(item)}
                          title="Click to advance status"
                        >
                          {cfg.label}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-2">
        <div className="flex gap-1.5">
          <Input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="New channel task..."
            className="bg-muted text-xs h-7"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleAdd}>Add</Button>
        </div>
      </div>
    </div>
  );
}
