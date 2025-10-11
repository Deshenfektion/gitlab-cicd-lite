import { describe, expect, it } from 'vitest';
import { DockerStreamDemultiplexer, encodeDockerFrame, type DockerFrame } from './demultiplex.js';

function collect(chunks: readonly Buffer[]): Array<[string, string]> {
  const frames: DockerFrame[] = [];
  const demultiplexer = new DockerStreamDemultiplexer((frame) => frames.push(frame));
  for (const chunk of chunks) {
    demultiplexer.push(chunk);
  }
  return frames.map((frame) => [frame.stream, frame.payload.toString('utf8')]);
}

describe('DockerStreamDemultiplexer', () => {
  it('separates stdout from stderr', () => {
    const chunk = Buffer.concat([
      encodeDockerFrame('stdout', 'building\n'),
      encodeDockerFrame('stderr', 'warning\n'),
    ]);

    expect(collect([chunk])).toEqual([
      ['stdout', 'building\n'],
      ['stderr', 'warning\n'],
    ]);
  });

  it('reassembles a frame split across chunks', () => {
    const frame = encodeDockerFrame('stdout', 'hello world');
    const chunks = [frame.subarray(0, 3), frame.subarray(3, 10), frame.subarray(10)];

    expect(collect(chunks)).toEqual([['stdout', 'hello world']]);
  });

  it('waits for an incomplete header', () => {
    const frames: DockerFrame[] = [];
    const demultiplexer = new DockerStreamDemultiplexer((frame) => frames.push(frame));
    demultiplexer.push(encodeDockerFrame('stdout', 'x').subarray(0, 4));

    expect(frames).toEqual([]);
    expect(demultiplexer.pending).toBe(4);
  });

  it('handles several frames arriving in one chunk', () => {
    const chunk = Buffer.concat([
      encodeDockerFrame('stdout', 'a'),
      encodeDockerFrame('stdout', 'b'),
      encodeDockerFrame('stdout', 'c'),
    ]);

    expect(collect([chunk]).map(([, payload]) => payload)).toEqual(['a', 'b', 'c']);
  });

  it('supports empty payloads', () => {
    expect(collect([encodeDockerFrame('stdout', '')])).toEqual([['stdout', '']]);
  });

  it('preserves multi byte characters that straddle a chunk boundary', () => {
    const frame = encodeDockerFrame('stdout', 'ümlaut');
    expect(collect([frame.subarray(0, 9), frame.subarray(9)])).toEqual([['stdout', 'ümlaut']]);
  });

  it('rejects an unknown stream type', () => {
    const broken = encodeDockerFrame('stdout', 'x');
    broken.writeUInt8(7, 0);

    const demultiplexer = new DockerStreamDemultiplexer(() => {});
    expect(() => demultiplexer.push(broken)).toThrow(/Unexpected docker stream type 7/);
  });

  it('leaves nothing pending once every frame is consumed', () => {
    const demultiplexer = new DockerStreamDemultiplexer(() => {});
    demultiplexer.push(encodeDockerFrame('stdout', 'done\n'));
    expect(demultiplexer.pending).toBe(0);
  });
});
