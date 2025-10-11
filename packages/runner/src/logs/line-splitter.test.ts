import { describe, expect, it } from 'vitest';
import { LineSplitter } from './line-splitter.js';

function collect(chunks: readonly string[], flush = true): string[] {
  const lines: string[] = [];
  const splitter = new LineSplitter((line) => lines.push(line));
  for (const chunk of chunks) {
    splitter.push(chunk);
  }
  if (flush) {
    splitter.flush();
  }
  return lines;
}

describe('LineSplitter', () => {
  it('emits one line per newline', () => {
    expect(collect(['a\nb\nc\n'])).toEqual(['a', 'b', 'c']);
  });

  it('joins a line that arrives across several chunks', () => {
    expect(collect(['he', 'llo wo', 'rld\n'])).toEqual(['hello world']);
  });

  it('holds an unterminated line until flush', () => {
    expect(collect(['partial'], false)).toEqual([]);
    expect(collect(['partial'])).toEqual(['partial']);
  });

  it('strips carriage returns from windows line endings', () => {
    expect(collect(['a\r\nb\r\n'])).toEqual(['a', 'b']);
  });

  it('keeps empty lines', () => {
    expect(collect(['a\n\nb\n'])).toEqual(['a', '', 'b']);
  });

  it('does nothing on flush when the buffer is empty', () => {
    expect(collect(['a\n'])).toEqual(['a']);
  });

  it('handles a chunk that is exactly a newline', () => {
    expect(collect(['\n'])).toEqual(['']);
  });
});
