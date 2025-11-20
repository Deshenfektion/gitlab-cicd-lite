import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client.js';
import type { ConfigIssue } from '../api/types.js';

const TEMPLATE = `stages: [build, test]

default:
  image: alpine:3.20

jobs:
  build:
    stage: build
    script:
      - mkdir -p dist
      - echo "built at $(date)" > dist/info.txt
    artifacts:
      paths: [dist]

  test:
    stage: test
    needs: [build]
    script:
      - cat dist/info.txt

  lint:
    stage: test
    needs: [build]
    allow_failure: true
    script:
      - echo "linting"
`;

export function NewPipelinePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [config, setConfig] = useState(TEMPLATE);
  const [issues, setIssues] = useState<readonly ConfigIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (start: boolean): Promise<void> => {
    setSubmitting(true);
    setError(null);
    setIssues([]);

    try {
      const created = await api.createPipeline({
        config,
        ...(name.trim().length > 0 ? { name: name.trim() } : {}),
      });

      if (start) {
        await api.startPipeline(created.pipeline.id);
      }

      navigate(`/pipelines/${created.pipeline.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setIssues(caught.issues);
      } else {
        setError(String(caught));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">New pipeline</h1>

      <div>
        <label
          htmlFor="name"
          className="mb-1 block text-xs uppercase tracking-wide text-text-muted"
        >
          Name
        </label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="optional"
          className="w-full max-w-sm rounded-md border border-border-subtle bg-surface-sunken px-3 py-2 text-sm outline-none focus:border-status-running"
        />
      </div>

      <div>
        <label
          htmlFor="config"
          className="mb-1 block text-xs uppercase tracking-wide text-text-muted"
        >
          Configuration
        </label>
        <textarea
          id="config"
          value={config}
          onChange={(event) => setConfig(event.target.value)}
          spellCheck={false}
          rows={22}
          className="w-full rounded-md border border-border-subtle bg-surface-sunken p-3 font-mono text-xs leading-relaxed outline-none focus:border-status-running"
        />
      </div>

      {error === null ? null : (
        <div className="rounded-md border border-status-failed/30 bg-status-failed/10 px-3 py-2 text-sm">
          <p className="font-medium text-status-failed">{error}</p>
          {issues.length === 0 ? null : (
            <ul className="mt-2 space-y-1">
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`} className="font-mono text-xs">
                  <span className="text-status-failed/80">{issue.path}</span>
                  <span className="text-text-muted"> — {issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit(true)}
          className="rounded-md bg-status-running/20 px-3 py-1.5 text-sm font-medium text-status-running ring-1 ring-status-running/30 ring-inset hover:bg-status-running/30 disabled:opacity-40"
        >
          Create and run
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit(false)}
          className="rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-border-subtle ring-inset hover:bg-surface-raised/70 disabled:opacity-40"
        >
          Create only
        </button>
      </div>
    </div>
  );
}
