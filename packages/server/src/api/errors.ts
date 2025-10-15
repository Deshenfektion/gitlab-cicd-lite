import { ConfigError } from '@cicd/core';
import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (message: string): HttpError => new HttpError(404, message);
export const badRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, message, details);
export const conflict = (message: string): HttpError => new HttpError(409, message);

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof ConfigError) {
    response.status(422).json({ error: error.message, issues: error.issues });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message, details: error.details });
    return;
  }

  response.status(500).json({ error: error instanceof Error ? error.message : 'internal error' });
}
