import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  // MediaPipe ships its own wasm loader; keep Vite's dep optimizer away from it.
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
});
