import { PassThrough, type Readable } from 'node:stream';
import type {
  ContainerHandle,
  CreateContainerSpec,
  DockerClient,
  ManagedContainer,
} from './client.js';
import { encodeDockerFrame, type DockerStreamType } from './demultiplex.js';

export interface FakeContainerScript {
  readonly output?: ReadonlyArray<[DockerStreamType, string]>;
  readonly exitCode?: number;
  readonly hangUntilStopped?: boolean;
}

export interface FakeDockerClientOptions {
  readonly images?: readonly string[];
  readonly script?: FakeContainerScript;
  readonly failOnCreate?: Error;
  readonly orphans?: readonly ManagedContainer[];
}

export class FakeDockerClient implements DockerClient {
  readonly created: CreateContainerSpec[] = [];
  readonly pulled: string[] = [];
  readonly removed: string[] = [];
  readonly stopped: string[] = [];

  private readonly images: Set<string>;
  private counter = 0;

  constructor(private readonly options: FakeDockerClientOptions = {}) {
    this.images = new Set(options.images ?? []);
  }

  async ping(): Promise<void> {}

  async hasImage(image: string): Promise<boolean> {
    return this.images.has(image);
  }

  async pullImage(image: string, onProgress: (message: string) => void): Promise<void> {
    this.pulled.push(image);
    onProgress(`Pulling from ${image}`);
    this.images.add(image);
  }

  async listManaged(labelKey: string): Promise<readonly ManagedContainer[]> {
    return (this.options.orphans ?? []).filter((container) => labelKey in container.labels);
  }

  async removeContainer(id: string): Promise<void> {
    this.removed.push(id);
  }

  async createContainer(spec: CreateContainerSpec): Promise<ContainerHandle> {
    if (this.options.failOnCreate !== undefined) {
      throw this.options.failOnCreate;
    }

    this.created.push(spec);
    this.counter += 1;

    const id = `container-${this.counter}`;
    const script = this.options.script ?? {};
    const stream = new PassThrough();
    let stopped = false;
    let onStopped: (() => void) | null = null;

    return {
      id,
      attach: async (): Promise<Readable> => stream,
      start: async (): Promise<void> => {
        for (const [type, text] of script.output ?? []) {
          stream.write(encodeDockerFrame(type, text));
        }
      },
      wait: async (): Promise<number> => {
        if (script.hangUntilStopped === true && !stopped) {
          await new Promise<void>((resolve) => {
            onStopped = resolve;
          });
          return 137;
        }
        return script.exitCode ?? 0;
      },
      stop: async (): Promise<void> => {
        stopped = true;
        this.stopped.push(id);
        onStopped?.();
      },
      remove: async (): Promise<void> => {
        this.removed.push(id);
        stream.end();
      },
    };
  }
}
