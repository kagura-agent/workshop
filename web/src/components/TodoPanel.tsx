import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { TodoItem, TodoStatus, NorthStar } from '../types';

interface TodoPanelProps {
  items: TodoItem[];
  northStars: NorthStar[];
  onClose: () => void;
  onCreate: (section: string, content: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<TodoItem, 'content' | 'status' | 'section' | 'assignedChannel' | 'assignedAgent'>>) => void;
  onDelete: (id: string) => void;
  onSetNorthStar: (scope: string, content: string) => void;
}

type ViewMode = 'list' | 'kanban';

const STATUS_CYCLE: TodoStatus[] = ['pending', 'in_progress', 'review', 'done'];

const STATUS_CONFIG: Record<TodoStatus, { label: string; color: string; bg: string; headerBg: string }> = {
  pending: { label: 'Pending', color: 'text-muted-foreground', bg: 'bg-muted-foreground/20', headerBg: 'bg-muted-foreground/10' },
  in_progress: { label: 'In Progress', color: 'text-blue-400', bg: 'bg-blue-400/20', headerBg: 'bg-blue-400/10' },
  review: { label: 'Review', color: 'text-yellow-400', bg: 'bg-yellow-400/20', headerBg: 'bg-yellow-400/10' },
  done: { label: 'Done', color: 'text-green-400', bg: 'bg-green-400/20', headerBg: 'bg-green-400/10' },
};

function isStale(updatedAt: string): boolean {
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(updatedAt).getTime() > threeDays;
}

export function TodoPanel({ items, northStars, onClose, onCreate, onUpdate, onDelete, onSetNorthStar }: TodoPanelProps) {
  const [newSection, setNewSection] = useState('default');
  const [newContent, setNewContent] = useState('');
  const [editingNorthStar, setEditingNorthStar] = useState(false);
  const [northStarDraft, setNorthStarDraft] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const globalStar = northStars.find((s) => s.scope === 'global');

  // Group by section (for list view)
  const sections = new Map<string, TodoItem[]>();
  for (const item of items) {
    const list = sections.get(item.section) || [];
    list.push(item);
    sections.set(item.section, list);
  }

  // Group by status (for kanban view)
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
    onCreate(newSection, content);
    setNewContent('');
  };

  const cycleStatus = (item: TodoItem) => {
    const idx = STATUS_CYCLE.indexOf(item.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    onUpdate(item.id, { status: next });
  };

  return (
    <div className={cn(
      'bg-card border-l border-border flex flex-col shrink-0 transition-[width] duration-200',
      viewMode === 'kanban' ? 'w-[800px]' : 'w-72'
    )}>
      <div className="p-3 px-4 font-semibold text-sm border-b border-border flex items-center justify-between">
        <span>TODO</span>
        <div className="flex items-center gap-1">
          <button
            className={cn(
              'px-1.5 py-0.5 rounded text-xs cursor-pointer',
              viewMode === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            &#9776;
          </button>
          <button
            className={cn(
              'px-1.5 py-0.5 rounded text-xs cursor-pointer',
              viewMode === 'kanban' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setViewMode('kanban')}
            title="Kanban view"
          >
            &#8862;
          </button>
          <button className="text-muted-foreground hover:text-foreground cursor-pointer text-lg leading-none ml-2" onClick={onClose}>
            &times;
          </button>
        </div>
      </div>

      {/* North Star section */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-yellow-400">North Star</span>
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => {
              if (editingNorthStar) {
                onSetNorthStar('global', northStarDraft);
                setEditingNorthStar(false);
              } else {
                setNorthStarDraft(globalStar?.content ?? '');
                setEditingNorthStar(true);
              }
            }}
          >
            {editingNorthStar ? 'Save' : 'Edit'}
          </button>
        </div>
        {editingNorthStar ? (
          <textarea
            className="w-full bg-muted text-xs p-2 rounded resize-none min-h-[48px] outline-none"
            value={northStarDraft}
            onChange={(e) => setNorthStarDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                onSetNorthStar('global', northStarDraft);
                setEditingNorthStar(false);
              }
            }}
            placeholder="Set a global north star..."
          />
        ) : (
          <div className="text-xs text-muted-foreground whitespace-pre-wrap">
            {globalStar?.content || 'No north star set'}
          </div>
        )}
      </div>

      {/* List view */}
      {viewMode === 'list' && (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-4">
            {sections.size === 0 && (
              <div className="text-muted-foreground text-xs text-center py-4">No todo items yet</div>
            )}
            {Array.from(sections.entries()).map(([section, sectionItems]) => (
              <div key={section}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{section}</div>
                <div className="space-y-1">
                  {sectionItems.map((item) => {
                    const cfg = STATUS_CONFIG[item.status];
                    const stale = item.status !== 'done' && isStale(item.updatedAt);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'group flex items-start gap-2 p-2 rounded text-sm hover:bg-muted',
                          stale && 'border-l-2 border-orange-400'
                        )}
                      >
                        <button
                          className={cn('shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer', cfg.bg, cfg.color)}
                          onClick={() => cycleStatus(item)}
                          title={`Status: ${cfg.label} — click to cycle`}
                        >
                          {cfg.label}
                        </button>
                        <span className={cn('flex-1 break-words', item.status === 'done' && 'line-through text-muted-foreground')}>
                          {item.content}
                        </span>
                        <button
                          className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive cursor-pointer text-xs"
                          onClick={() => onDelete(item.id)}
                          title="Delete"
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Kanban view */}
      {viewMode === 'kanban' && (
        <div className="flex-1 flex gap-2 p-3 overflow-x-auto min-h-0">
          {STATUS_CYCLE.map((status) => {
            const cfg = STATUS_CONFIG[status];
            const colItems = columns.get(status) || [];
            return (
              <div key={status} className="flex-1 min-w-[160px] flex flex-col min-h-0">
                <div className={cn('rounded-t px-2 py-1.5 flex items-center gap-2', cfg.headerBg)}>
                  <span className={cn('text-xs font-semibold', cfg.color)}>{cfg.label}</span>
                  <span className="text-[10px] text-muted-foreground">{colItems.length}</span>
                </div>
                <ScrollArea className="flex-1 border border-t-0 border-border rounded-b">
                  <div className="p-1.5 space-y-1.5">
                    {colItems.length === 0 && (
                      <div className="text-muted-foreground text-[10px] text-center py-3">Empty</div>
                    )}
                    {colItems.map((item) => {
                      const stale = item.status !== 'done' && isStale(item.updatedAt);
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'group bg-muted/50 rounded p-2 text-xs hover:bg-muted',
                            stale && 'border-l-2 border-orange-400'
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className={cn('flex-1 break-words', item.status === 'done' && 'line-through text-muted-foreground')}>
                              {item.content}
                            </span>
                            <button
                              className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive cursor-pointer text-[10px]"
                              onClick={() => onDelete(item.id)}
                              title="Delete"
                            >
                              &times;
                            </button>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <button
                              className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer', cfg.bg, cfg.color)}
                              onClick={() => cycleStatus(item)}
                              title="Click to advance status"
                            >
                              {cfg.label}
                            </button>
                            <span className="text-[9px] text-muted-foreground/70 bg-muted-foreground/10 px-1 py-0.5 rounded">
                              {item.section}
                            </span>
                            {stale && (
                              <span className="text-[9px] text-orange-400" title="Stale — no update in 3+ days">&#9888;</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      )}

      <div className="p-3 border-t border-border space-y-2">
        <Input
          value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          placeholder="Section"
          className="bg-muted text-xs h-7"
        />
        <div className="flex gap-1.5">
          <Input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="New todo..."
            className="bg-muted text-xs h-7"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleAdd}>Add</Button>
        </div>
      </div>
    </div>
  );
}
