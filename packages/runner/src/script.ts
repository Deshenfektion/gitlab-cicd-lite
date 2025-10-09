export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildShellScript(commands: readonly string[]): string {
  const lines = ['set -e'];

  for (const command of commands) {
    lines.push(`printf '%s\\n' ${shellQuote(`$ ${command}`)}`);
    lines.push(command);
  }

  return `${lines.join('\n')}\n`;
}
