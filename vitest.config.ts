import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
    env: {
      WMS_DB_PATH: ':memory:',
    },
  },
})
