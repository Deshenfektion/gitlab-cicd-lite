import { api } from '../api/client.js';
import { Spinner } from '../components/Spinner.js';
import { formatRelative } from '../format.js';
import { usePolledResource } from '../hooks/usePolledResource.js';

export function RunnersPage() {
  const { data, loading } = usePolledResource('runners', () => api.listRunners(), 5000);

  if (loading && data === null) {
    return <Spinner label="Loading runners" />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Runners</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {(data?.runners ?? []).map((runner) => (
          <div key={runner.id} className="rounded-lg border border-border-subtle p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{runner.name}</p>
              <span
                className={`inline-flex items-center gap-1.5 text-xs ${
                  runner.status === 'online' ? 'text-status-success' : 'text-text-muted'
                }`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {runner.status}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-muted">Executor</dt>
                <dd className="mt-0.5 font-mono text-xs">{runner.executor}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-muted">Concurrency</dt>
                <dd className="mt-0.5">{runner.concurrency}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-muted">Active</dt>
                <dd className="mt-0.5">{runner.activePipelines} pipelines</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-muted">Last seen</dt>
                <dd className="mt-0.5">{formatRelative(runner.lastSeenAt)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
