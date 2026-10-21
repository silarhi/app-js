import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: { index: 'src/index.ts', form: 'src/form/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
})
