import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig(async () => ({
    plugins: [react(), tailwindcss()],
    // Only the SPA entry is an app page; docs and retained reference HTML are not entries.
    optimizeDeps: {
        entries: ['index.html'],
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: 'ws',
                  host,
                  port: 1421,
              }
            : undefined,
        watch: {
            // 3. tell Vite to ignore watching `src-tauri`
            ignored: ['**/src-tauri/**'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('/node_modules/youtubei.js/dist/src/utils/javascript/')) {
                        return 'youtubei-javascript'
                    }
                    if (id.includes('/node_modules/youtubei.js/')) return 'youtubei'
                    if (id.includes('/node_modules/@bufbuild/protobuf/')) return 'youtube-protobuf'
                    if (id.includes('/node_modules/meriyah/')) return 'youtube-parser'
                    if (id.includes('/node_modules/fflate/')) return 'youtube-compression'
                },
            },
        },
    },
}))
