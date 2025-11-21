import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolvePackage = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@cicd/core': resolvePackage('core'),
      '@cicd/runner': resolvePackage('runner'),
      '@cicd/server': resolvePackage('server'),
      '@cicd/cli': resolvePackage('cli'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
