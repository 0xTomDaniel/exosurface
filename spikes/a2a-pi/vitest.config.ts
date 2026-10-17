import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/*.int.test.ts'], testTimeout: 20000, fileParallelism: false } });
