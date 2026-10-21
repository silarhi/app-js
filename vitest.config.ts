import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: false,
        include: ['test/**/*.test.ts'],
        coverage: {
            include: ['src/**'],
        },
    },
})
