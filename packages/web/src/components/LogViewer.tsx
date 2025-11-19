import { useEffect, useRef, useState } from 'react';
import type { LogLine } from '../api/types.js';

interface LogViewerProps {
  readonly lines: readonly LogLine[];
  readonly live: boolean;
}

export function LogViewer({ lines, live }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || !follow) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [lines, follow]);

  const onScroll = (): void => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 24;
    setFollow(atBottom);
  };

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-sunken px-4 py-8 text-center text-sm text-text-muted">
        {live ? 'Waiting for output…' : 'This job produced no output.'}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="max-h-96 overflow-y-auto rounded-lg border border-border-subtle bg-surface-sunken p-3 font-mono text-xs leading-relaxed"
      >
        {lines.map((line) => (
          <div key={line.seq} className="flex gap-3">
            <span className="w-8 shrink-0 select-none text-right text-text-muted/50">
              {line.seq}
            </span>
            <span
              className={`whitespace-pre-wrap break-all ${
                line.stream === 'stderr' ? 'text-status-failed' : 'text-text-primary'
              }`}
            >
              {line.message}
            </span>
          </div>
        ))}
      </div>

      {follow ? null : (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="absolute right-3 bottom-3 rounded-md bg-surface-raised px-2.5 py-1 text-xs text-text-muted ring-1 ring-border-subtle hover:text-text-primary"
        >
          Follow output
        </button>
      )}
    </div>
  );
}
