import { basename } from 'node:path';
import { FilesystemArtifactStore } from '@cicd/runner';
import { Router } from 'express';
import type { AppContext } from '../context.js';
import type { ArtifactRecord } from '../repositories/artifacts.js';
import { notFound } from './errors.js';

export interface ArtifactDto {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly expired: boolean;
  readonly downloadUrl: string;
}

export function serializeArtifact(record: ArtifactRecord): ArtifactDto {
  return {
    id: record.id,
    jobId: record.jobId,
    jobName: record.jobName,
    name: record.name,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    expired: record.expiresAt <= Date.now(),
    downloadUrl: `/api/artifacts/${record.id}/download`,
  };
}

export function createArtifactRouter(context: AppContext): Router {
  const store = new FilesystemArtifactStore(context.config.artifactRoot);
  const router = Router();

  router.get('/:id', (request, response) => {
    const artifact = context.artifacts.findById(request.params.id);
    if (artifact === null) {
      throw notFound(`artifact ${request.params.id} not found`);
    }
    response.json({ artifact: serializeArtifact(artifact) });
  });

  router.get('/:id/download', (request, response, next) => {
    const artifact = context.artifacts.findById(request.params.id);
    if (artifact === null) {
      next(notFound(`artifact ${request.params.id} not found`));
      return;
    }

    response.setHeader('Content-Type', 'application/gzip');
    response.setHeader('Content-Length', artifact.sizeBytes);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${artifact.jobName}-${artifact.name}.tar.gz"`,
    );

    const stream = store.read(artifact.path);
    stream.on('error', () => {
      next(notFound(`artifact ${basename(artifact.path)} is no longer available`));
    });
    stream.pipe(response);
  });

  return router;
}
