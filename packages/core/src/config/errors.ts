export interface ConfigIssue {
  readonly path: string;
  readonly message: string;
}

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(message: string, issues: readonly ConfigIssue[] = []) {
    super(message);
    this.name = 'ConfigError';
    this.issues = issues;
  }

  static of(path: string, message: string): ConfigError {
    return new ConfigError(message, [{ path, message }]);
  }

  format(): string {
    if (this.issues.length === 0) {
      return this.message;
    }
    return this.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
  }
}
