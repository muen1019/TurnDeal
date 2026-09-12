import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createOfferMeshMockPlugin, type MockScenario } from './mock/resultApiMock';

const useDevMock = process.env.OFFERMESH_DEV_MOCK === '1';
const mockScenario = process.env.OFFERMESH_DEV_MOCK_SCENARIO as MockScenario | undefined;

export default defineConfig(({ command }) => {
  const enableDevMock = command === 'serve' && useDevMock;

  return {
    define: {
      'import.meta.env.VITE_OFFERMESH_MOCK': JSON.stringify(enableDevMock),
    },
    plugins: [react(), enableDevMock && createOfferMeshMockPlugin({ scenario: mockScenario })],
    server: {
      host: '127.0.0.1', port: 5173, strictPort: true,
      proxy: enableDevMock ? undefined : {'/api': process.env.OFFERMESH_API_ORIGIN ?? 'http://127.0.0.1:3201'},
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
