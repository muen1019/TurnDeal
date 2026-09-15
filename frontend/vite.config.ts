import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

export default defineConfig(() => {
  return {
    define: {
      'import.meta.env.VITE_OFFERMESH_RUNTIME_MODE': JSON.stringify(process.env.OFFERMESH_RUNTIME_MODE ?? ''),
    },
    plugins: [react()],
    server: {
      host: '127.0.0.1', port: 5173, strictPort: true,
      fs: process.env.OFFERMESH_MOBILE_DEMO === '1' ? {allow: [fileURLToPath(new URL('.',import.meta.url)),fileURLToPath(new URL('../contracts',import.meta.url))]} : undefined,
      proxy: {'/api': {target:process.env.OFFERMESH_API_ORIGIN ?? 'http://127.0.0.1:3201',changeOrigin:false}},
    },
    build: {
      target: 'es2022',
      rollupOptions: {output: {manualChunks: {
        validation: ['ajv/dist/2020', 'ajv-formats'],
        motion: ['motion/react'],
      }}},
    },
  };
});
