import type { Readable } from 'node:stream';

export interface ContainerHandle {
  readonly id: string;
  attach(): Promise<Readable>;
  start(): Promise<void>;
  wait(): Promise<number>;
  stop(timeoutSeconds: number): Promise<void>;
  remove(): Promise<void>;
}

export interface CreateContainerSpec {
  readonly image: string;
  readonly command: readonly string[];
  readonly workingDir: string;
  readonly env: readonly string[];
  readonly binds: readonly string[];
  readonly labels: Readonly<Record<string, string>>;
}

export interface DockerClient {
  ping(): Promise<void>;
  hasImage(image: string): Promise<boolean>;
  pullImage(image: string, onProgress: (message: string) => void): Promise<void>;
  createContainer(spec: CreateContainerSpec): Promise<ContainerHandle>;
}
