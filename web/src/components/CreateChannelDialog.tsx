import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { CreateChannelDialogProps } from '../types';

export function CreateChannelDialog({ agents, onClose, onCreate, editChannel }: CreateChannelDialogProps) {
  const isEdit = !!editChannel;

  const [name, setName] = useState(() => {
    if (editChannel) return editChannel.name.replace(/^#/, '');
    return '';
  });

  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    if (editChannel) {
      const sel: Record<string, boolean> = {};
      for (const a of editChannel.agents) sel[a.id] = true;
      return sel;
    }
    return {};
  });

  const [requireMention, setRequireMention] = useState<Record<string, boolean>>(() => {
    if (editChannel) {
      const rm: Record<string, boolean> = {};
      for (const a of editChannel.agents) {
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
      onCreate(editChannel!.name, agentConfigs);
    } else {
      const trimmed = name.trim();
      if (!trimmed) return;
      const channelName = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
      onCreate(channelName, agentConfigs);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Channel' : 'Create Channel'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide">Channel Name</Label>
            <div className="flex items-center gap-1 bg-background rounded-md border border-input px-3">
              <span className="text-muted-foreground text-base font-semibold">#</span>
              <Input
                className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="new-channel"
                autoFocus={!isEdit}
                disabled={isEdit}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide">Agents</Label>
            <div className="rounded-md overflow-hidden border border-input">
              {agents.map(agent => (
                <div key={agent.id} className="flex items-center justify-between px-3 py-2 bg-background border-b border-input last:border-b-0">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={!!selected[agent.id]}
                      onCheckedChange={() => toggleAgent(agent.id)}
                    />
                    <span className="text-lg">{agent.avatar || agent.name.charAt(0)}</span>
                    <span>{agent.name}</span>
                  </label>
                  {selected[agent.id] && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Only when @mentioned</span>
                      <Switch
                        checked={!!requireMention[agent.id]}
                        onCheckedChange={() => toggleMention(agent.id)}
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-discord-online hover:bg-discord-online/90 text-white"
            onClick={handleSubmit}
            disabled={!isEdit && !name.trim()}
          >
            {isEdit ? 'Save' : 'Create Channel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
