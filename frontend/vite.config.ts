import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import { createOfferMeshMockPlugin, type MockScenario } from './mock/resultApiMock';

const useDevMock = process.env.OFFERMESH_DEV_MOCK === '1';
const mockScenario = process.env.OFFERMESH_DEV_MOCK_SCENARIO as MockScenario | undefined;

export default defineConfig(({ command }) => {
  const enableDevMock = command === 'serve' && useDevMock;

  return {
    define: {
      'import.meta.env.VITE_OFFERMESH_MOCK': JSON.stringify(enableDevMock),
      'import.meta.env.VITE_OFFERMESH_MOBILE_LIVE': JSON.stringify(process.env.OFFERMESH_MOBILE_DEMO==='1'&&process.env.OFFERMESH_RUNTIME_MODE==='live'),
      'import.meta.env.VITE_OFFERMESH_RUNTIME_MODE': JSON.stringify(process.env.OFFERMESH_RUNTIME_MODE ?? ''),
    },
    plugins: [react(), enableDevMock && createOfferMeshMockPlugin({ scenario: mockScenario })],
    server: {
      host: '127.0.0.1', port: 5173, strictPort: true,
      fs: process.env.OFFERMESH_MOBILE_DEMO === '1' ? {allow: [fileURLToPath(new URL('.',import.meta.url)),fileURLToPath(new URL('../contracts',import.meta.url))]} : undefined,
      proxy: enableDevMock ? undefined : {'/api': {target:process.env.OFFERMESH_API_ORIGIN ?? 'http://127.0.0.1:3201',changeOrigin:false}},
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
