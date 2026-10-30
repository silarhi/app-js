import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        form: 'src/form/index.ts',
        http: 'src/http/index.ts',
        listeners: 'src/listeners/index.ts',
        testing: 'src/testing/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
})
