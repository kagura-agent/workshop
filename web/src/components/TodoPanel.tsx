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

const STATUS_CYCLE: TodoStatus[] = ['pending', 'in_progress', 'review', 'done'];

const STATUS_CONFIG: Record<TodoStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-muted-foreground', bg: 'bg-muted-foreground/20' },
  in_progress: { label: 'In Progress', color: 'text-blue-400', bg: 'bg-blue-400/20' },
  review: { label: 'Review', color: 'text-yellow-400', bg: 'bg-yellow-400/20' },
  done: { label: 'Done', color: 'text-green-400', bg: 'bg-green-400/20' },
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

  const globalStar = northStars.find((s) => s.scope === 'global');

  // Group by section
  const sections = new Map<string, TodoItem[]>();
  for (const item of items) {
    const list = sections.get(item.section) || [];
    list.push(item);
    sections.set(item.section, list);
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
    <div className="w-72 bg-card border-l border-border flex flex-col shrink-0">
      <div className="p-3 px-4 font-semibold text-sm border-b border-border flex items-center justify-between">
        <span>TODO</span>
        <button className="text-muted-foreground hover:text-foreground cursor-pointer text-lg leading-none" onClick={onClose}>
          &times;
        </button>
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
