import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { attachRooms } from './server/rooms.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'forma-rooms',
      configureServer({ httpServer }) {
        if (httpServer) attachRooms(httpServer);
      },
      configurePreviewServer({ httpServer }) {
        attachRooms(httpServer);
      },
    },
  ],
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
