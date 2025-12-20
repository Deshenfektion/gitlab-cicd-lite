import { describe, expect, it } from 'vitest';
import type { Job } from '../api/types.js';
import { layout } from './PipelineGraph.js';

const job = (name: string, stage = 'test'): Job => ({
  id: `id-${name}`,
  name,
  stage,
  image: 'alpine:3.20',
  status: 'pending',
  attempt: 0,
  maxAttempts: 1,
  allowFailure: false,
  timeoutMs: 60_000,
  exitCode: null,
  failureReason: null,
  failureMessage: null,
  startedAt: null,
  finishedAt: null,
  durationMs: null,
});

describe('layout', () => {
  it('places each layer in its own column', () => {
    const { placements } = layout([job('a'), job('b')], [['a'], ['b']]);

    const a = placements.get('a');
    const b = placements.get('b');
    expect(a?.x).toBeLessThan(b?.x as number);
  });

  it('stacks the jobs of one layer vertically', () => {
    const { placements } = layout([job('a'), job('b')], [['a', 'b']]);

    expect(placements.get('a')?.x).toBe(placements.get('b')?.x);
    expect(placements.get('a')?.y).toBeLessThan(placements.get('b')?.y as number);
  });

  it('centres a short column against the tallest one', () => {
    const { placements, height } = layout(
      [job('solo'), job('a'), job('b'), job('c')],
      [['solo'], ['a', 'b', 'c']],
    );

    const solo = placements.get('solo')?.y as number;
    const first = placements.get('a')?.y as number;
    const last = placements.get('c')?.y as number;

    expect(solo).toBeGreaterThan(first);
    expect(solo).toBeLessThan(last);
    expect(height).toBeGreaterThan(0);
  });

  it('grows the canvas with the number of layers', () => {
    const narrow = layout([job('a')], [['a']]);
    const wide = layout([job('a'), job('b'), job('c')], [['a'], ['b'], ['c']]);

    expect(wide.width).toBeGreaterThan(narrow.width);
    expect(wide.height).toBe(narrow.height);
  });

  it('ignores layer entries without a matching job', () => {
    const { placements } = layout([job('a')], [['a', 'ghost']]);

    expect(placements.size).toBe(1);
    expect(placements.get('ghost')).toBeUndefined();
  });

  it('handles an empty pipeline without dividing by zero', () => {
    const { placements, height } = layout([], []);

    expect(placements.size).toBe(0);
    expect(Number.isFinite(height)).toBe(true);
  });
});
