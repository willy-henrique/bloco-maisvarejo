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
    warmup: {
      clientFiles: [
        'index.tsx',
        'App.tsx',
        'contexts/UserContext.tsx',
        'services/firebase.ts',
        'services/firebaseAuth.ts',
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
      'react-router-dom',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'lucide-react',
    ],
    force: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
