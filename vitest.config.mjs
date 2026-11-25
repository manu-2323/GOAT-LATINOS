import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { runScripts: 'dangerously', url: 'https://manu-2323.github.io/GOAT-LATINOS/' } },
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js']
  }
});
