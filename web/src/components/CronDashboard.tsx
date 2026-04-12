import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import type { Channel } from '../types';

interface CronDashboardProps {
  channels: Channel[];
  onTrigger: (channelId: string) => void;
  onClose: () => void;
}

function formatSchedule(schedule: string | null): string {
  if (!schedule) return '—';
  return schedule;
}

export function CronDashboard({ channels, onTrigger, onClose }: CronDashboardProps) {
  const cronChannels = channels.filter((c) => c.cronEnabled || c.cronSchedule);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-xl w-[640px] max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">&#128339;</span>
            <span className="font-semibold text-sm">Cron Dashboard</span>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground cursor-pointer text-lg leading-none"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {cronChannels.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <div className="text-3xl mb-3">&#128339;</div>
            <div className="font-medium mb-1">No cron channels configured</div>
            <div className="text-xs">Enable cron scheduling in channel settings to see channels here.</div>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left p-3 font-semibold">Channel</th>
                  <th className="text-left p-3 font-semibold">Schedule</th>
                  <th className="text-left p-3 font-semibold">Status</th>
                  <th className="text-right p-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {cronChannels.map((channel) => (
                  <tr key={channel.id} className="border-b border-border last:border-b-0 hover:bg-muted/50">
                    <td className="p-3">
                      <span className="text-muted-foreground/60 font-semibold mr-1">#</span>
                      {channel.name}
                    </td>
                    <td className="p-3">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{formatSchedule(channel.cronSchedule)}</code>
                    </td>
                    <td className="p-3">
                      {channel.cronEnabled ? (
                        <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onTrigger(channel.id)}
                      >
                        Trigger
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
