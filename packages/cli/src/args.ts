export interface ParsedArgs {
  readonly command: string;
  readonly file: string;
  readonly executor: 'docker' | 'shell';
  readonly concurrency: number;
  readonly verbose: boolean;
  readonly dataDir: string;
}

export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgumentError';
  }
}

const DEFAULT_EXECUTOR: ParsedArgs['executor'] = 'docker';
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_DATA_DIR = '.cicd';

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;

  if (command === undefined || command.startsWith('-')) {
    throw new ArgumentError('a command is required');
  }

  let file = '.ci.yml';
  let executor: ParsedArgs['executor'] = DEFAULT_EXECUTOR;
  let concurrency = DEFAULT_CONCURRENCY;
  let verbose = false;
  let dataDir = DEFAULT_DATA_DIR;
  let positional = 0;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] as string;

    if (!token.startsWith('-')) {
      if (positional > 0) {
        throw new ArgumentError(`unexpected argument "${token}"`);
      }
      file = token;
      positional += 1;
      continue;
    }

    const value = (): string => {
      const next = rest[index + 1];
      if (next === undefined) {
        throw new ArgumentError(`${token} requires a value`);
      }
      index += 1;
      return next;
    };

    switch (token) {
      case '--executor': {
        const kind = value();
        if (kind !== 'docker' && kind !== 'shell') {
          throw new ArgumentError(`unknown executor "${kind}"`);
        }
        executor = kind;
        break;
      }
      case '--concurrency': {
        const parsed = Number.parseInt(value(), 10);
        if (Number.isNaN(parsed) || parsed < 1) {
          throw new ArgumentError('--concurrency must be a positive integer');
        }
        concurrency = parsed;
        break;
      }
      case '--data-dir':
        dataDir = value();
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      default:
        throw new ArgumentError(`unknown option "${token}"`);
    }
  }

  return { command, file, executor, concurrency, verbose, dataDir };
}

export const USAGE = `Usage: cicd <command> [file] [options]

Commands:
  run [file]        Run a pipeline locally (default file: .ci.yml)
  validate [file]   Parse and validate a pipeline without running it
  graph [file]      Print the execution layers of a pipeline

Options:
  --executor <kind>    docker (default) or shell
  --concurrency <n>    Maximum jobs running at once (default: 4)
  --data-dir <path>    Where workspaces and artifacts are written (default: .cicd)
  -v, --verbose        Print job output as it is produced
`;
