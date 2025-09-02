const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const SEGMENT = /(\d+)(ms|s|m|h|d)/gy;

export class DurationParseError extends Error {
  constructor(readonly input: string) {
    super(`Invalid duration: "${input}"`);
    this.name = 'DurationParseError';
  }
}

export function parseDuration(input: string): number {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '');
  if (normalized.length === 0) {
    throw new DurationParseError(input);
  }

  SEGMENT.lastIndex = 0;
  let total = 0;
  let matched = 0;

  for (;;) {
    const match = SEGMENT.exec(normalized);
    if (match === null) {
      break;
    }
    const [, amount, unit] = match;
    total += Number(amount) * (UNIT_MS[unit as string] as number);
    matched = SEGMENT.lastIndex;
  }

  if (matched !== normalized.length || total <= 0) {
    throw new DurationParseError(input);
  }

  return total;
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  const units: Array<[string, number]> = [
    ['d', UNIT_MS.d as number],
    ['h', UNIT_MS.h as number],
    ['m', UNIT_MS.m as number],
    ['s', UNIT_MS.s as number],
  ];

  let remaining = Math.floor(ms / 1_000) * 1_000;
  const parts: string[] = [];

  for (const [suffix, size] of units) {
    const value = Math.floor(remaining / size);
    if (value > 0) {
      parts.push(`${value}${suffix}`);
      remaining -= value * size;
    }
  }

  return parts.join('');
}
