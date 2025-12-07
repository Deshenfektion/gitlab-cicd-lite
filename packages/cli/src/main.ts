import { ArgumentError, USAGE, parseArgs } from './args.js';
import { execute } from './commands.js';

const io = {
  write: (text: string): void => {
    process.stdout.write(text);
  },
  writeError: (text: string): void => {
    process.stderr.write(text);
  },
  colour: process.stdout.isTTY === true && process.env.NO_COLOR === undefined,
};

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    io.write(USAGE);
    return argv.length === 0 ? 2 : 0;
  }

  try {
    return await execute(parseArgs(argv), io);
  } catch (error) {
    if (error instanceof ArgumentError) {
      io.writeError(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    io.writeError(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

process.exitCode = await main();
