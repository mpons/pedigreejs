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
            cssCodeSplit: true,
            assetsInlineLimit: 4096,
            lib: {
                entry: path.resolve(__dirname, 'src/index.ts'),
                name: 'pedigreejs',
                fileName: (format) => `pedigreejs.${format}.js`,
                formats: ['es', 'umd']
            },
            rollupOptions: {
                output: {
                    assetFileNames: 'assets/[name]-[hash][extname]',
                    exports: 'named',
                    globals: {
                        // Add any external dependencies here if needed
                    }
                }
            }
        },
        css: {
            preprocessorOptions: {
            }
        }
    }
})