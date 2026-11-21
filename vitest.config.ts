import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@firebase/ai': path.resolve(__dirname, 'node_modules/@firebase/ai/dist/esm/index.esm.js'),
    },
  },
  test: {
    server: {
      deps: {
        inline: [/[/\\]node_modules[/\\](?:firebase|@firebase)[/\\]/],
      },
    },
  },
});
