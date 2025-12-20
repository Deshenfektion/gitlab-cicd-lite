import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client.js';
import type { Artifact, LogLine } from '../api/types.js';
import { JobPanel } from '../components/JobPanel.js';
import { PipelineActions } from '../components/PipelineActions.js';
import { PipelineGraph } from '../components/PipelineGraph.js';
import { Spinner } from '../components/Spinner.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatDuration, formatTimestamp } from '../format.js';
import { usePolledResource } from '../hooks/usePolledResource.js';

const ACTIVE_POLL_MS = 1500;
const IDLE_POLL_MS = 15000;

export function PipelineDetailPage() {
  const { id = '' } = useParams();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [lines, setLines] = useState<readonly LogLine[]>([]);
  const [artifacts, setArtifacts] = useState<readonly Artifact[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [interval, setInterval_] = useState(ACTIVE_POLL_MS);

  const load = useCallback(() => api.getPipeline(id), [id]);
  const detail = usePolledResource(`pipeline:${id}`, load, interval);

  const pipeline = detail.data?.pipeline ?? null;
  const jobs = detail.data?.jobs ?? [];
  const active = pipeline?.status === 'running' || pipeline?.status === 'pending';

  useEffect(() => {
    setInterval_(active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
  }, [active]);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null;
  const selectedName = selectedJob?.name ?? null;

  useEffect(() => {
    if (selectedJobId === null && selectedJob !== null) {
      setSelectedJobId(selectedJob.id);
    }
  }, [selectedJob, selectedJobId]);

  useEffect(() => {
    if (selectedJob === null) {
      return;
    }

    let cancelled = false;
    const jobId = selectedJob.id;

    const load = async (): Promise<void> => {
      const [logs, artifactList] = await Promise.all([
        api.getJobLogs(jobId),
        api.listJobArtifacts(jobId),
      ]);
      if (!cancelled) {
        setLines(logs.lines);
        setArtifacts(artifactList.artifacts);
      }
    };

    void load().catch(() => undefined);

    if (selectedJob.status !== 'running') {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(() => void load().catch(() => undefined), ACTIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedJob?.id, selectedJob?.status, selectedJob?.attempt]);

  const runAction = async (label: string, action: () => Promise<unknown>): Promise<void> => {
    setPending(label);
    setActionError(null);
    try {
      await action();
      detail.refresh();
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : String(error));
    } finally {
      setPending(null);
    }
  };

  if (detail.loading && pipeline === null) {
    return <Spinner label="Loading pipeline" />;
  }

  if (pipeline === null) {
    return <p className="text-sm text-status-failed">{detail.error?.message ?? 'Not found'}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/pipelines" className="text-xs text-text-muted hover:text-text-primary">
            ← All pipelines
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{pipeline.name}</h1>
            <StatusBadge status={pipeline.status} />
          </div>
          <p className="mt-1 text-xs text-text-muted">
            created {formatTimestamp(pipeline.createdAt)} · ran for{' '}
            {formatDuration(pipeline.durationMs)}
          </p>
        </div>

        <PipelineActions
          pipeline={pipeline}
          busy={pending !== null}
          onStart={() => void runAction('start', () => api.startPipeline(pipeline.id))}
          onCancel={() => void runAction('cancel', () => api.cancelPipeline(pipeline.id))}
          onRetry={() => void runAction('retry', () => api.retryPipeline(pipeline.id))}
        />
      </div>

      {actionError === null ? null : (
        <p className="rounded-md border border-status-failed/30 bg-status-failed/10 px-3 py-2 text-sm text-status-failed">
          {actionError}
        </p>
      )}

      <PipelineGraph
        jobs={jobs}
        edges={detail.data?.edges ?? []}
        layers={detail.data?.layers ?? []}
        selected={selectedJob?.id ?? null}
        onSelect={setSelectedJobId}
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          {jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => setSelectedJobId(job.id)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                job.name === selectedName
                  ? 'bg-surface-raised'
                  : 'text-text-muted hover:bg-surface-raised/50'
              }`}
            >
              <span className="truncate">{job.name}</span>
              <StatusBadge status={job.status} />
            </button>
          ))}
        </nav>

        {selectedJob === null ? null : (
          <JobPanel
            job={selectedJob}
            lines={lines}
            artifacts={artifacts}
            retrying={pending === 'retry-job'}
            onRetry={() => void runAction('retry-job', () => api.retryJob(selectedJob.id))}
          />
        )}
      </div>

      {active ? <Spinner label="Polling for updates" /> : null}
    </div>
  );
}
