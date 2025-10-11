const HEADER_SIZE = 8;

export type DockerStreamType = 'stdin' | 'stdout' | 'stderr';

const STREAM_TYPES: readonly DockerStreamType[] = ['stdin', 'stdout', 'stderr'];

export interface DockerFrame {
  readonly stream: DockerStreamType;
  readonly payload: Buffer;
}

export class DockerStreamDemultiplexer {
  private buffer: Buffer = Buffer.alloc(0);

  constructor(private readonly emit: (frame: DockerFrame) => void) {}

  push(chunk: Buffer): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

    for (;;) {
      if (this.buffer.length < HEADER_SIZE) {
        return;
      }

      const stream = STREAM_TYPES[this.buffer.readUInt8(0)];
      const length = this.buffer.readUInt32BE(4);

      if (stream === undefined) {
        throw new Error(`Unexpected docker stream type ${this.buffer.readUInt8(0)}`);
      }

      if (this.buffer.length < HEADER_SIZE + length) {
        return;
      }

      this.emit({
        stream,
        payload: this.buffer.subarray(HEADER_SIZE, HEADER_SIZE + length),
      });

      this.buffer = this.buffer.subarray(HEADER_SIZE + length);
    }
  }

  get pending(): number {
    return this.buffer.length;
  }
}

export function encodeDockerFrame(stream: DockerStreamType, payload: string): Buffer {
  const body = Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt8(STREAM_TYPES.indexOf(stream), 0);
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}
