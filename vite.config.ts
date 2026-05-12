import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    watch: {
      ignored: ['**/dist/**', '**/dist-ssr/**', '**/docs/**', '**/.tmp/**'],
    },
    // Warmup apenas dos arquivos leves do caminho crítico (login + layout)
    warmup: {
      clientFiles: [
        'index.tsx',
        'contexts/UserContext.tsx',
        'components/Auth/UserLogin.tsx',
        'components/Layout/Sidebar.tsx',
      ],
    },
  },
  plugins: [
    react(),
    {
      name: 'mavo-block-build-output-in-dev',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/dist/')) {
            res.statusCode = 404;
            res.end('Build output is not served by the dev server.');
            return;
          }
          next();
        });
      },
    },
  ],
  optimizeDeps: {
    entries: ['index.tsx'],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      // Firebase e lucide pré-bundleados separados (evita re-parse na inicialização)
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'lucide-react',
    ],
    force: false,
  },
  build: {
    rollupOptions: {
      output: {
        // Separa Firebase e lucide em chunks próprios para melhor cache
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules/lucide-react')) return 'lucide';
          if (id.includes('node_modules/react-dom')) return 'react-dom';
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
