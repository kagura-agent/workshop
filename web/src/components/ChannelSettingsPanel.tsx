import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Channel, ChannelType, CronExecution, PatrolConfig } from '../types';

interface ChannelSettingsPanelProps {
  channel: Channel;
  patrolConfig: PatrolConfig | null;
  channels: Channel[];
  onClose: () => void;
  onSave: (metadata: Partial<Pick<Channel, 'type' | 'positioning' | 'guidelines' | 'cronSchedule' | 'cronEnabled'>>) => void;
  onCronTrigger?: (channelId: string) => void;
  cronHistory?: CronExecution[];
  onPatrolConfigSave?: (config: Partial<PatrolConfig>) => void;
  onDeleteChannel?: (channelId: string) => void;
  onArchiveChannel?: (channelId: string) => void;
  onRenameChannel?: (channelId: string, name: string) => void;
}

const CHANNEL_TYPES: { value: ChannelType; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'daily', label: 'Daily' },
  { value: 'meta', label: 'Meta' },
];

export function ChannelSettingsPanel({ channel, patrolConfig, channels, onClose, onSave, onCronTrigger, cronHistory, onPatrolConfigSave, onDeleteChannel, onArchiveChannel, onRenameChannel }: ChannelSettingsPanelProps) {
  const [type, setType] = useState<ChannelType>(channel.type);
  const [positioning, setPositioning] = useState(channel.positioning);
  const [guidelines, setGuidelines] = useState(channel.guidelines);
  const [cronSchedule, setCronSchedule] = useState(channel.cronSchedule ?? '');
  const [cronEnabled, setCronEnabled] = useState(channel.cronEnabled);
  const [renameName, setRenameName] = useState(channel.name);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Patrol state
  const [patrolSchedule, setPatrolSchedule] = useState(patrolConfig?.schedule ?? '0 */3 * * *');
  const [patrolEnabled, setPatrolEnabled] = useState(patrolConfig?.enabled ?? false);
  const [patrolFilter, setPatrolFilter] = useState<string[]>(patrolConfig?.channelFilter ?? []);
  const isControlChannel = patrolConfig?.controlChannelId === channel.id;

  const handleSave = () => {
    onSave({
      type,
      positioning,
      guidelines,
      cronSchedule: cronSchedule || null,
      cronEnabled,
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

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cron Schedule</Label>
            <Input
              value={cronSchedule}
              onChange={(e) => setCronSchedule(e.target.value)}
              placeholder="e.g. 0 9 * * 1-5"
              className="bg-muted text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cron Enabled</Label>
            <Switch checked={cronEnabled} onCheckedChange={setCronEnabled} />
          </div>

          {/* Cron status + Run Now */}
          {channel.cronSchedule && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${channel.cronEnabled ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                  <span className="text-xs text-muted-foreground">
                    {channel.cronEnabled ? 'Cron active' : 'Cron paused'}
                  </span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{channel.cronSchedule}</code>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => onCronTrigger?.(channel.id)}
                >
                  Run Now
                </Button>
              </div>

              {cronHistory && cronHistory.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Recent executions</span>
                  <div className="max-h-[120px] overflow-y-auto space-y-1">
                    {cronHistory.slice(0, 5).map((exec) => (
                      <div key={exec.id} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500/80" />
                        <span className="font-mono">{new Date(exec.firedAt).toLocaleString()}</span>
                        <span className="text-muted-foreground/60">
                          {exec.agentIds.length} agent{exec.agentIds.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Patrol settings — show for meta channels or current control channel */}
          {(channel.type === 'meta' || isControlChannel) && (
            <div className="space-y-3 pt-3 border-t border-border">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <span>&#128737;</span> Patrol Settings
              </Label>

              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Patrol Schedule</Label>
                  <Input
                    value={patrolSchedule}
                    onChange={(e) => setPatrolSchedule(e.target.value)}
                    placeholder="e.g. 0 */3 * * *"
                    className="bg-muted text-sm"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Patrol Enabled</Label>
                  <Switch checked={patrolEnabled} onCheckedChange={setPatrolEnabled} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Channel Filter (empty = all)</Label>
                  <div className="space-y-1 max-h-[100px] overflow-y-auto">
                    {channels.filter(c => c.id !== channel.id).map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={patrolFilter.includes(c.id)}
                          onChange={(e) => {
                            setPatrolFilter(prev =>
                              e.target.checked
                                ? [...prev, c.id]
                                : prev.filter(id => id !== c.id)
                            );
                          }}
                          className="rounded"
                        />
                        #{c.name}
                      </label>
                    ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs w-full"
                  onClick={() => {
                    onPatrolConfigSave?.({
                      controlChannelId: channel.id,
                      schedule: patrolSchedule,
                      enabled: patrolEnabled,
                      channelFilter: patrolFilter,
                    });
                  }}
                >
                  Save Patrol Config
                </Button>
              </div>
            </div>
          )}

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
