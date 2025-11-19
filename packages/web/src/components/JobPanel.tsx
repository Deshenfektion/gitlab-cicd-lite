import { api } from '../api/client.js';
import type { Artifact, Job, LogLine } from '../api/types.js';
import { formatBytes, formatDuration, formatTimestamp } from '../format.js';
import { LogViewer } from './LogViewer.js';
import { StatusBadge } from './StatusBadge.js';

interface JobPanelProps {
  readonly job: Job;
  readonly lines: readonly LogLine[];
  readonly artifacts: readonly Artifact[];
  readonly retrying: boolean;
  onRetry(): void;
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

export function JobPanel({ job, lines, artifacts, retrying, onRetry }: JobPanelProps) {
  const isRunning = job.status === 'running';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">{job.name}</h2>
          <StatusBadge status={job.status} />
          {job.allowFailure ? (
            <span className="text-xs text-text-muted">allowed to fail</span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onRetry}
          disabled={retrying || isRunning}
          className="rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border-subtle ring-inset hover:bg-surface-raised/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {retrying ? 'Retrying…' : 'Retry job'}
        </button>
      </div>

      {job.failureMessage === null ? null : (
        <div className="rounded-lg border border-status-failed/30 bg-status-failed/10 px-3 py-2 text-sm text-status-failed">
          <span className="font-medium">{job.failureReason ?? 'failure'}</span>
          <span className="ml-2 text-status-failed/80">{job.failureMessage}</span>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Detail label="Stage" value={job.stage} />
        <Detail label="Image" value={job.image} />
        <Detail label="Attempt" value={`${job.attempt} / ${job.maxAttempts}`} />
        <Detail label="Duration" value={formatDuration(job.durationMs)} />
        <Detail label="Exit code" value={job.exitCode === null ? '—' : String(job.exitCode)} />
        <Detail label="Started" value={formatTimestamp(job.startedAt)} />
        <Detail label="Finished" value={formatTimestamp(job.finishedAt)} />
        <Detail label="Timeout" value={formatDuration(job.timeoutMs)} />
      </dl>

      <div>
        <h3 className="mb-2 text-xs uppercase tracking-wide text-text-muted">Output</h3>
        <LogViewer lines={lines} live={isRunning} />
      </div>

      <div>
        <h3 className="mb-2 text-xs uppercase tracking-wide text-text-muted">Artifacts</h3>
        {artifacts.length === 0 ? (
          <p className="text-sm text-text-muted">This job published no artifacts.</p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {artifacts.map((artifact) => (
              <li key={artifact.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{artifact.name}</p>
                  <p className="text-xs text-text-muted">
                    {formatBytes(artifact.sizeBytes)} · expires{' '}
                    {formatTimestamp(artifact.expiresAt)}
                  </p>
                </div>
                {artifact.expired ? (
                  <span className="text-xs text-text-muted">expired</span>
                ) : (
                  <a
                    href={api.artifactDownloadUrl(artifact)}
                    className="rounded-md px-2.5 py-1 text-sm text-status-running ring-1 ring-status-running/30 ring-inset hover:bg-status-running/10"
                  >
                    Download
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
