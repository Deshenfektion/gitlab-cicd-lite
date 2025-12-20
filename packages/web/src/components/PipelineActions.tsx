import type { Pipeline } from '../api/types.js';

interface PipelineActionsProps {
  readonly pipeline: Pipeline;
  readonly busy: boolean;
  onStart(): void;
  onCancel(): void;
  onRetry(): void;
}

const PRIMARY =
  'rounded-md bg-status-running/20 px-3 py-1.5 text-sm font-medium text-status-running ring-1 ring-status-running/30 ring-inset hover:bg-status-running/30 disabled:opacity-40';

const SECONDARY =
  'rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border-subtle ring-inset hover:bg-surface-raised/70 disabled:opacity-40';

export function PipelineActions({
  pipeline,
  busy,
  onStart,
  onCancel,
  onRetry,
}: PipelineActionsProps) {
  const retryable = pipeline.status === 'failed' || pipeline.status === 'canceled';

  return (
    <div className="flex gap-2">
      {pipeline.status === 'pending' ? (
        <button type="button" onClick={onStart} disabled={busy} className={PRIMARY}>
          Run pipeline
        </button>
      ) : null}

      {pipeline.status === 'running' ? (
        <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY}>
          Cancel
        </button>
      ) : null}

      {retryable ? (
        <button type="button" onClick={onRetry} disabled={busy} className={SECONDARY}>
          Retry failed jobs
        </button>
      ) : null}
    </div>
  );
}
