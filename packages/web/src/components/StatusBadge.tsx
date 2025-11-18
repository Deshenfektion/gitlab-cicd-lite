import type { JobStatus, PipelineStatus } from '../api/types.js';

const STYLES: Record<string, string> = {
  pending: 'bg-status-pending/15 text-status-pending ring-status-pending/30',
  running: 'bg-status-running/15 text-status-running ring-status-running/30',
  success: 'bg-status-success/15 text-status-success ring-status-success/30',
  failed: 'bg-status-failed/15 text-status-failed ring-status-failed/30',
  canceled: 'bg-status-canceled/15 text-status-canceled ring-status-canceled/30',
  skipped: 'bg-status-skipped/15 text-status-skipped ring-status-skipped/30',
};

interface StatusBadgeProps {
  readonly status: JobStatus | PipelineStatus;
  readonly label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status] ?? STYLES.pending}`}
    >
      {status === 'running' ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {label ?? status}
    </span>
  );
}
