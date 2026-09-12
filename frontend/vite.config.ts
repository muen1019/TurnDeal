import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: {'/api': process.env.OFFERMESH_API_ORIGIN ?? 'http://127.0.0.1:3201'},
  },
  build: {
    target: 'es2022',
    rollupOptions: {output: {manualChunks: {
      validation: ['ajv/dist/2020', 'ajv-formats'],
      motion: ['motion/react'],
    }}},
  },
});
