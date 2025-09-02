import { describe, expect, it } from 'vitest';
import { DurationParseError, formatDuration, parseDuration } from './duration.js';

describe('parseDuration', () => {
  it('parses single unit durations', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('10m')).toBe(600_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('7d')).toBe(604_800_000);
    expect(parseDuration('250ms')).toBe(250);
  });

  it('accumulates compound durations', () => {
    expect(parseDuration('1h30m')).toBe(5_400_000);
    expect(parseDuration('1d12h')).toBe(129_600_000);
  });

  it('ignores surrounding whitespace and casing', () => {
    expect(parseDuration('  15M ')).toBe(900_000);
    expect(parseDuration('1h 30m')).toBe(5_400_000);
  });

  it('rejects malformed input', () => {
    for (const input of ['', '  ', '10', 'm', '10x', '1h30', 'abc', '-5m', '0s']) {
      expect(() => parseDuration(input)).toThrow(DurationParseError);
    }
  });

  it('does not treat minutes and milliseconds as the same unit', () => {
    expect(parseDuration('5ms')).not.toBe(parseDuration('5m'));
  });
});

describe('formatDuration', () => {
  it('renders the largest units first', () => {
    expect(formatDuration(5_400_000)).toBe('1h30m');
    expect(formatDuration(90_000)).toBe('1m30s');
    expect(formatDuration(604_800_000)).toBe('7d');
  });

  it('keeps sub second values in milliseconds', () => {
    expect(formatDuration(250)).toBe('250ms');
  });

  it('round trips through parseDuration', () => {
    for (const value of [1_000, 90_000, 5_400_000, 604_800_000]) {
      expect(parseDuration(formatDuration(value))).toBe(value);
    }
  });
});
