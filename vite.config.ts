import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { sealFirebaseAiBrowser, TRANSPORT_ID } from './scripts/req211-pin-browser-sdk.mjs';

function sealContestSdk(): Plugin {
  let build = false;
  let inspected = false;
  return {
    name: 'req211-pin-firebase-ai-browser-transport',
    enforce: 'pre',
    configResolved(config) { build = config.command === 'build'; },
    resolveId(id) {
      if (id === TRANSPORT_ID) return fileURLToPath(new URL('./src/firebase/req211Egress.ts', import.meta.url));
    },
    transform(code, id) {
      const clean = id.replace(/\\/g, '/').split('?')[0];
      if (!clean.includes('/node_modules/@firebase/ai/dist/')) return;
      if (!clean.endsWith('/esm/index.esm.js')) throw new Error('REQ211_UNEXPECTED_FIREBASE_AI_ENTRY');
      inspected = true;
      return {code: sealFirebaseAiBrowser(code), map: null};
    },
    buildEnd(error) {
      if (build && !error && !inspected) throw new Error('REQ211_FIREBASE_AI_TRANSPORT_NOT_SEALED');
    },
  };
}
export default defineConfig({
  plugins: [sealContestSdk(), react(), tailwindcss()],
  optimizeDeps: {exclude: ['firebase/ai', '@firebase/ai']},
  server: {port: 5173, strictPort: true},
  preview: {port: 4173, strictPort: true},
});
