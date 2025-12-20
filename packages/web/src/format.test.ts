import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatRelative, formatTimestamp } from './format.js';

describe('formatDuration', () => {
  it('renders sub second values in milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(250)).toBe('250ms');
  });

  it('renders seconds', () => {
    expect(formatDuration(1_000)).toBe('1s');
    expect(formatDuration(45_000)).toBe('45s');
  });

  it('renders minutes and seconds', () => {
    expect(formatDuration(90_000)).toBe('1m 30s');
  });

  it('drops seconds once the duration passes an hour', () => {
    expect(formatDuration(5_400_000)).toBe('1h 30m');
  });

  it('renders a dash for an unknown duration', () => {
    expect(formatDuration(null)).toBe('—');
  });
});

describe('formatBytes', () => {
  it('keeps small values in bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('steps up through the units', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('stops at gigabytes', () => {
    expect(formatBytes(5 * 1024 ** 4)).toBe('5120.0 GB');
  });
});

describe('formatRelative', () => {
  it('describes recent timestamps loosely', () => {
    expect(formatRelative(Date.now() - 5_000)).toBe('just now');
    expect(formatRelative(Date.now() - 120_000)).toBe('2m ago');
    expect(formatRelative(Date.now() - 7_200_000)).toBe('2h ago');
    expect(formatRelative(Date.now() - 3 * 86_400_000)).toBe('3d ago');
  });
});

describe('formatTimestamp', () => {
  it('renders a dash for a missing timestamp', () => {
    expect(formatTimestamp(null)).toBe('—');
  });

  it('renders something for a real timestamp', () => {
    expect(formatTimestamp(Date.UTC(2025, 10, 20, 12, 30))).not.toBe('—');
  });
});
