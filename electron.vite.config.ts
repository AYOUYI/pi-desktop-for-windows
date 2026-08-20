import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: { index: resolve(__dirname, 'src/main/index.ts') },
				// ESM main process: the pi SDK is ESM-only, so the entry must be .mjs
				// and pi stays externalized (resolved from node_modules at runtime).
				output: {
					format: 'es',
					entryFileNames: '[name].mjs',
					chunkFileNames: '[name].mjs'
				}
			}
		}
	},
	preload: {
		plugins: [externalizeDepsPlugin()]
	},
	renderer: {
		root: resolve(__dirname, 'src/renderer'),
		plugins: [react()]
	}
})
