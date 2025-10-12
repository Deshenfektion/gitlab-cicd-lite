import type { Readable } from 'node:stream';
import Docker from 'dockerode';
import type { ContainerHandle, CreateContainerSpec, DockerClient } from './client.js';

interface PullProgress {
  status?: string;
  id?: string;
}

export class DockerodeClient implements DockerClient {
  private readonly docker: Docker;

  constructor(options: Docker.DockerOptions = {}) {
    this.docker = new Docker(options);
  }

  async ping(): Promise<void> {
    await this.docker.ping();
  }

  async hasImage(image: string): Promise<boolean> {
    try {
      await this.docker.getImage(image).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async pullImage(image: string, onProgress: (message: string) => void): Promise<void> {
    const stream = await this.docker.pull(image);

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (error: Error | null) => (error === null ? resolve() : reject(error)),
        (event: PullProgress) => {
          if (event.status !== undefined) {
            onProgress(event.id === undefined ? event.status : `${event.status} ${event.id}`);
          }
        },
      );
    });
  }

  async createContainer(spec: CreateContainerSpec): Promise<ContainerHandle> {
    const container = await this.docker.createContainer({
      Image: spec.image,
      Cmd: [...spec.command],
      WorkingDir: spec.workingDir,
      Env: [...spec.env],
      Labels: { ...spec.labels },
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      HostConfig: {
        Binds: [...spec.binds],
        AutoRemove: false,
        NetworkMode: 'bridge',
      },
    });

    return {
      id: container.id,
      attach: async (): Promise<Readable> =>
        (await container.attach({
          stream: true,
          stdout: true,
          stderr: true,
        })) as unknown as Readable,
      start: async (): Promise<void> => {
        await container.start();
      },
      wait: async (): Promise<number> => {
        const result = (await container.wait()) as { StatusCode: number };
        return result.StatusCode;
      },
      stop: async (timeoutSeconds: number): Promise<void> => {
        await container.stop({ t: timeoutSeconds });
      },
      remove: async (): Promise<void> => {
        await container.remove({ force: true, v: true });
      },
    };
  }
}
