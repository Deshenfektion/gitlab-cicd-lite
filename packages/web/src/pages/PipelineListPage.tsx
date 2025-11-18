import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { EmptyState } from '../components/EmptyState.js';
import { Spinner } from '../components/Spinner.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { formatDuration, formatRelative } from '../format.js';
import { usePolledResource } from '../hooks/usePolledResource.js';

export function PipelineListPage() {
  const { data, error, loading } = usePolledResource('pipelines', () => api.listPipelines(), 3000);

  if (loading && data === null) {
    return <Spinner label="Loading pipelines" />;
  }

  if (error !== null && data === null) {
    return <p className="text-sm text-status-failed">{error.message}</p>;
  }

  const pipelines = data?.pipelines ?? [];

  if (pipelines.length === 0) {
    return (
      <EmptyState
        title="No pipelines yet"
        description="Create a pipeline from a YAML configuration to get started."
        action={
          <Link
            to="/pipelines/new"
            className="rounded-md bg-status-running/20 px-3 py-1.5 text-sm font-medium text-status-running ring-1 ring-status-running/30 ring-inset hover:bg-status-running/30"
          >
            New pipeline
          </Link>
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-raised text-xs uppercase tracking-wide text-text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Pipeline</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Duration</th>
            <th className="px-4 py-2.5 font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {pipelines.map((pipeline) => (
            <tr key={pipeline.id} className="hover:bg-surface-raised/60">
              <td className="px-4 py-3">
                <Link
                  to={`/pipelines/${pipeline.id}`}
                  className="font-medium hover:text-status-running"
                >
                  {pipeline.name}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-text-muted">
                  {pipeline.id.slice(0, 8)}
                </p>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={pipeline.status} />
              </td>
              <td className="px-4 py-3 text-text-muted">{formatDuration(pipeline.durationMs)}</td>
              <td className="px-4 py-3 text-text-muted">{formatRelative(pipeline.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
