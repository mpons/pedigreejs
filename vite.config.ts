import { defineConfig } from 'vite'
import * as path from 'node:path'
import commonjs from 'vite-plugin-commonjs'
export default defineConfig(() => {
    return {
        plugins: [commonjs()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        build: {
            outDir: './dist',
            emptyOutDir: true,
        },
    }
})