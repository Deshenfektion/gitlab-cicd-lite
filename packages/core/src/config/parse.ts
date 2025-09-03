import { parse as parseYaml, YAMLParseError } from 'yaml';
import type { ZodError } from 'zod';
import { ConfigError } from './errors.js';
import { rawConfigSchema, type RawConfig } from './schema.js';

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return '<root>';
  }
  return path
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : String(segment)))
    .join('.')
    .replace(/\.\[/g, '[');
}

function toConfigError(error: ZodError): ConfigError {
  const issues = error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
  return new ConfigError(`Invalid pipeline configuration (${issues.length} issue(s))`, issues);
}

export function parseConfig(source: string): RawConfig {
  let document: unknown;

  try {
    document = parseYaml(source);
  } catch (error) {
    if (error instanceof YAMLParseError) {
      const line = error.linePos?.[0]?.line ?? 0;
      throw ConfigError.of(`line ${line}`, error.message);
    }
    throw error;
  }

  if (document === null || document === undefined) {
    throw ConfigError.of('<root>', 'configuration is empty');
  }

  const result = rawConfigSchema.safeParse(document);
  if (!result.success) {
    throw toConfigError(result.error);
  }

  return result.data;
}
