import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Channel, ChannelType } from '../types';

interface ChannelSettingsPanelProps {
  channel: Channel;
  onClose: () => void;
  onSave: (metadata: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'cronSchedule' | 'cronEnabled'>>) => void;
  onDeleteChannel?: (channelId: string) => void;
  onArchiveChannel?: (channelId: string) => void;
  onRenameChannel?: (channelId: string, name: string) => void;
}

const CHANNEL_TYPES: { value: ChannelType; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'daily', label: 'Daily' },
  { value: 'meta', label: 'Meta' },
];

export function ChannelSettingsPanel({ channel, onClose, onSave, onDeleteChannel, onArchiveChannel, onRenameChannel }: ChannelSettingsPanelProps) {
  const [type, setType] = useState<ChannelType>(channel.type);
  const [positioning, setPositioning] = useState(channel.positioning);
  const [guidelines, setGuidelines] = useState(channel.guidelines);
  const [renameName, setRenameName] = useState(channel.name);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSave = () => {
    onSave({
      type,
      positioning,
      guidelines,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-[480px] max-h-[80vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">Channel Settings — #{channel.name}</h2>
          <button className="text-muted-foreground hover:text-foreground cursor-pointer text-lg" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Channel Type</Label>
            <div className="flex gap-2">
              {CHANNEL_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer border ${
                    type === ct.value
                      ? 'bg-discord-accent text-white border-discord-accent'
                      : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                  }`}
                  onClick={() => setType(ct.value)}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Positioning</Label>
            <textarea
              value={positioning}
              onChange={(e) => setPositioning(e.target.value)}
              placeholder="What is this channel about?"
              className="w-full py-2 px-3 rounded-md bg-muted text-foreground text-sm border border-border resize-none min-h-[60px] placeholder:text-muted-foreground/60 outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Guidelines</Label>
            <textarea
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              placeholder="Rules and guidelines for agents in this channel"
              className="w-full py-2 px-3 rounded-md bg-muted text-foreground text-sm border border-border resize-none min-h-[80px] placeholder:text-muted-foreground/60 outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Channel Management */}
          <div className="space-y-3 pt-3 border-t border-border">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Channel Management</Label>

            {/* Rename */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Rename Channel</Label>
              <div className="flex gap-2">
                <Input
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  className="bg-muted text-sm flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={!renameName.trim() || renameName === channel.name}
                  onClick={() => {
                    onRenameChannel?.(channel.id, renameName.trim());
                  }}
                >
                  Save
                </Button>
              </div>
            </div>

            {/* Archive / Unarchive */}
            <Button
              variant="outline"
              size="sm"
              className={`text-xs w-full ${channel.status === 'archived' ? 'text-green-400 border-green-400/40 hover:bg-green-400/10' : 'text-blue-400 border-blue-400/40 hover:bg-blue-400/10'}`}
              onClick={() => onArchiveChannel?.(channel.id)}
            >
              {channel.status === 'archived' ? 'Unarchive Channel' : 'Archive Channel'}
            </Button>

            {/* Delete */}
            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs w-full text-red-400 border-red-400/40 hover:bg-red-400/10"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete Channel
              </Button>
            ) : (
              <div className="space-y-2 p-2 rounded border border-red-400/40 bg-red-400/5">
                <p className="text-xs text-red-400">Type <strong>{channel.name}</strong> to confirm deletion:</p>
                <Input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={channel.name}
                  className="bg-muted text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs flex-1"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirm(''); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs flex-1 text-red-400 border-red-400/40 hover:bg-red-400/10"
                    disabled={deleteConfirm !== channel.name}
                    onClick={() => {
                      onDeleteChannel?.(channel.id);
                      onClose();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}
