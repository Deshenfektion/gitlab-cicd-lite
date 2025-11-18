import { useMemo } from 'react';
import type { Job, JobEdge } from '../api/types.js';

const NODE_WIDTH = 168;
const NODE_HEIGHT = 44;
const COLUMN_GAP = 72;
const ROW_GAP = 18;
const PADDING = 16;

const STATUS_STROKE: Record<string, string> = {
  pending: 'var(--color-status-pending)',
  running: 'var(--color-status-running)',
  success: 'var(--color-status-success)',
  failed: 'var(--color-status-failed)',
  canceled: 'var(--color-status-canceled)',
  skipped: 'var(--color-status-skipped)',
};

interface Placement {
  readonly job: Job;
  readonly x: number;
  readonly y: number;
}

interface PipelineGraphProps {
  readonly jobs: readonly Job[];
  readonly edges: readonly JobEdge[];
  readonly layers: readonly (readonly string[])[];
  readonly selected: string | null;
  onSelect(jobId: string): void;
}

function layout(
  jobs: readonly Job[],
  layers: readonly (readonly string[])[],
): { placements: Map<string, Placement>; width: number; height: number } {
  const byName = new Map(jobs.map((job) => [job.name, job]));
  const placements = new Map<string, Placement>();
  const tallest = Math.max(1, ...layers.map((layer) => layer.length));
  const height = tallest * NODE_HEIGHT + (tallest - 1) * ROW_GAP + PADDING * 2;

  layers.forEach((layer, column) => {
    const columnHeight = layer.length * NODE_HEIGHT + (layer.length - 1) * ROW_GAP;
    const top = (height - columnHeight) / 2;

    layer.forEach((name, row) => {
      const job = byName.get(name);
      if (job === undefined) {
        return;
      }
      placements.set(name, {
        job,
        x: PADDING + column * (NODE_WIDTH + COLUMN_GAP),
        y: top + row * (NODE_HEIGHT + ROW_GAP),
      });
    });
  });

  const width =
    PADDING * 2 + layers.length * NODE_WIDTH + Math.max(0, layers.length - 1) * COLUMN_GAP;

  return { placements, width, height };
}

function edgePath(from: Placement, to: Placement): string {
  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + NODE_HEIGHT / 2;
  const midX = startX + (endX - startX) / 2;

  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

export function PipelineGraph({ jobs, edges, layers, selected, onSelect }: PipelineGraphProps) {
  const { placements, width, height } = useMemo(() => layout(jobs, layers), [jobs, layers]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-sunken p-2">
      <svg width={width} height={height} role="img" aria-label="Pipeline dependency graph">
        <g>
          {edges.map((edge) => {
            const from = placements.get(edge.from);
            const to = placements.get(edge.to);
            if (from === undefined || to === undefined) {
              return null;
            }
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={edgePath(from, to)}
                fill="none"
                stroke="var(--color-border-subtle)"
                strokeWidth={1.5}
              />
            );
          })}
        </g>

        {[...placements.values()].map(({ job, x, y }) => (
          <g
            key={job.id}
            transform={`translate(${x}, ${y})`}
            className="cursor-pointer"
            onClick={() => onSelect(job.id)}
          >
            <rect
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={8}
              fill="var(--color-surface-raised)"
              stroke={selected === job.id ? 'var(--color-text-primary)' : STATUS_STROKE[job.status]}
              strokeWidth={selected === job.id ? 2 : 1.5}
            />
            <circle cx={16} cy={NODE_HEIGHT / 2} r={4} fill={STATUS_STROKE[job.status]} />
            <text x={30} y={19} fill="var(--color-text-primary)" fontSize={12} fontWeight={500}>
              {job.name.length > 16 ? `${job.name.slice(0, 15)}…` : job.name}
            </text>
            <text x={30} y={33} fill="var(--color-text-muted)" fontSize={10}>
              {job.stage}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
