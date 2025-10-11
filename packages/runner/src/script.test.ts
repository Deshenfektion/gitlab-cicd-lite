import { describe, expect, it } from 'vitest';
import { buildShellScript, shellQuote } from './script.js';

describe('shellQuote', () => {
  it('wraps a plain value in single quotes', () => {
    expect(shellQuote('npm ci')).toBe("'npm ci'");
  });

  it('escapes embedded single quotes', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});

describe('buildShellScript', () => {
  it('aborts on the first failure', () => {
    expect(buildShellScript(['true']).split('\n')[0]).toBe('set -e');
  });

  it('prints every command before running it', () => {
    expect(buildShellScript(['echo hi'])).toBe(
      ['set -e', "printf '%s\\n' '$ echo hi'", 'echo hi', ''].join('\n'),
    );
  });

  it('keeps the command order', () => {
    const script = buildShellScript(['first', 'second']);
    expect(script.indexOf('first')).toBeLessThan(script.indexOf('second'));
  });

  it('produces a valid script for an empty job', () => {
    expect(buildShellScript([])).toBe('set -e\n');
  });
});
