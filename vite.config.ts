import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        copyPublicDir: false,
        lib: {
            entry: path.resolve(__dirname, 'src/lib/barcode-scanner.ts'),
            formats: ['es'],
        },
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
    worker: {
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
})
