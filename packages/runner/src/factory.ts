import type { JobExecutor } from '@cicd/core';
import { ArtifactCoordinator } from './artifacts/coordinator.js';
import { FilesystemArtifactStore } from './artifacts/filesystem-store.js';
import type { DockerClient } from './docker/client.js';
import { DockerodeClient } from './docker/dockerode-client.js';
import { DockerExecutor } from './executors/docker.js';
import { ShellExecutor } from './executors/shell.js';
import { WorkspaceManager } from './workspace.js';

export const EXECUTOR_KINDS = ['docker', 'shell'] as const;

export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];

export interface ExecutorConfig {
  readonly kind: ExecutorKind;
  readonly workspaceRoot: string;
  readonly artifactRoot: string;
  readonly dockerSocket?: string;
}

export function isExecutorKind(value: string): value is ExecutorKind {
  return (EXECUTOR_KINDS as readonly string[]).includes(value);
}

export function createDockerClient(config: ExecutorConfig): DockerClient | null {
  if (config.kind !== 'docker') {
    return null;
  }
  return config.dockerSocket === undefined
    ? new DockerodeClient()
    : new DockerodeClient({ socketPath: config.dockerSocket });
}

export function createExecutor(config: ExecutorConfig): JobExecutor {
  const workspaces = new WorkspaceManager(config.workspaceRoot);
  const artifacts = new ArtifactCoordinator(new FilesystemArtifactStore(config.artifactRoot));

  if (config.kind === 'shell') {
    return new ShellExecutor({ workspaces, artifacts });
  }

  return new DockerExecutor({
    client: createDockerClient(config) as DockerClient,
    workspaces,
    artifacts,
  });
}
