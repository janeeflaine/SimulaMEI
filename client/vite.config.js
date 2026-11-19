import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                // Cada arquivo de CSS do site sai separado (css-<caminho>-<hash>.css), para o
                // src/utils/cssOrder.js pôr cada um no lugar certo da ordem quando a página chega.
                manualChunks(id) {
                    const m = id.replace(/\\/g, '/').match(/\/src\/(.+)\.css$/)
                    if (m) return 'css-' + m[1].replace(/\//g, '-')
                },
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
            }
        }
    }
})
