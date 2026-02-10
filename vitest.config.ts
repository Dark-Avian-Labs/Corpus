import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Increase timeout for DB-related tests
    testTimeout: 10_000,
  },
});
