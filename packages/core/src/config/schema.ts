import { z } from 'zod';
import { RETRY_TRIGGERS } from './types.js';

const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/, 'must start with a letter or digit');

const duration = z
  .string()
  .regex(/^\s*(\d+\s*(ms|s|m|h|d)\s*)+$/i, 'must be a duration like "10m"');

const scriptSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)], {
  error: 'must be a command or a non-empty list of commands',
});

const retryTrigger = z.enum(RETRY_TRIGGERS);

const retryWhenSchema = z.union([retryTrigger, z.array(retryTrigger).min(1)], {
  error: `must be one of ${RETRY_TRIGGERS.join(', ')} or a list of them`,
});

const retrySchema = z.union(
  [
    z.int().min(0).max(10),
    z.strictObject({
      max: z.int().min(0).max(10),
      when: retryWhenSchema.optional(),
    }),
  ],
  {
    error: `must be a retry count, or a { max, when } object where when is one of ${RETRY_TRIGGERS.join(', ')}`,
  },
);

const artifactsSchema = z.strictObject({
  name: identifier.optional(),
  paths: z.array(z.string().min(1)).min(1),
  expire_in: duration.optional(),
});

const jobSchema = z.strictObject({
  stage: identifier.optional(),
  image: z.string().min(1).optional(),
  script: scriptSchema,
  needs: z
    .union([identifier, z.array(identifier)], {
      error: 'must be a job name or a list of job names',
    })
    .optional(),
  artifacts: artifactsSchema.optional(),
  retry: retrySchema.optional(),
  timeout: duration.optional(),
  allow_failure: z.boolean().optional(),
});

const defaultsSchema = z.strictObject({
  image: z.string().min(1).optional(),
  retry: retrySchema.optional(),
  timeout: duration.optional(),
  allow_failure: z.boolean().optional(),
});

export const rawConfigSchema = z.strictObject({
  stages: z.array(identifier).min(1).optional(),
  default: defaultsSchema.optional(),
  jobs: z.record(identifier, jobSchema),
});

export type RawConfig = z.infer<typeof rawConfigSchema>;
export type RawJob = z.infer<typeof jobSchema>;
export type RawArtifacts = z.infer<typeof artifactsSchema>;
export type RawRetry = z.infer<typeof retrySchema>;
