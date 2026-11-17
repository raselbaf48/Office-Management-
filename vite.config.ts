import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'firestore-enterprise-c050-guard',
        transform(code, id) {
          if (id.includes('firebase')) {
            let nextCode = code;
            if (nextCode.includes('49232')) {
              nextCode = nextCode.replace(
                /__PRIVATE_hardAssert\(!!([a-zA-Z0-9_$]+),\s*49232\),\s*SnapshotVersion\.fromTimestamp\(fromTimestamp\(\1\)\)/g,
                '($1 ? SnapshotVersion.fromTimestamp(fromTimestamp($1)) : SnapshotVersion.min())'
              );
            }
            if (nextCode.includes('HTTP error has no status')) {
              nextCode = nextCode.replace(
                /if\s*\(void 0\s*===\s*([a-zA-Z0-9_$]+)\)\s*return\s+[a-zA-Z0-9_$]+\("RPC_ERROR",\s*"HTTP error has no status"\),\s*([a-zA-Z0-9_$.]+);/g,
                'if (void 0 === $1) return $2;'
              );
            }
            if (nextCode !== code) {
              return { code: nextCode, map: null };
            }
          }
          return null;
        },
      },
    ],
    base: '/',
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: {
      'process.env': {},
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        stream: path.resolve(__dirname, 'src/utils/streamShim.ts'),
      },
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    optimizeDeps: {
      entries: ['index.html'],
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore/lite',
        'lucide-react',
        'motion/react',
        'i18next',
        'react-i18next',
        'i18next-browser-languagedetector',
        'recharts',
        'papaparse',
        'xlsx',
        'xlsx-js-style',
        'docx',
        'file-saver',
        'jszip',
        '@capacitor/core',
        '@capacitor/app',
        '@capacitor/browser',
      ],
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
      ws: false,
      watch: null,
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
                return 'vendor-react';
              }
              if (id.includes('xlsx') || id.includes('xlsx-js-style')) {
                return 'vendor-excel';
              }
              if (id.includes('docx') || id.includes('mammoth') || id.includes('pdf-parse')) {
                return 'vendor-docs';
              }
              if (id.includes('tesseract')) {
                return 'vendor-ocr';
              }
              if (id.includes('html2canvas') || id.includes('html-to-image')) {
                return 'vendor-canvas';
              }
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('papaparse')) {
                return 'vendor-csv';
              }
            }
          },
        },
      },
    },
  };
});
