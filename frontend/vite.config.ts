import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          // Manual chunk splitting for caching. Heavy visual dependencies (Framer Motion, Recharts, D3)
          // are lazy-loaded via React.lazy() at route level so they only download when the user navigates
          // to the relevant page.
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            framer: ['framer-motion'],
            charts: ['recharts', 'd3'],
            ui: ['lucide-react', 'class-variance-authority', 'clsx'],
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})