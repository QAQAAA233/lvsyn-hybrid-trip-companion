import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const stub = (name: string) => fileURLToPath(new URL('./'+name, import.meta.url));
export default defineConfig({
  cacheDir:'.vite-fixture-disconnect',
  resolve:{alias:[
    {find:/^firebase\/(app|app-check|ai)$/, replacement:stub('sdk-fixture.ts')},
    {find:/^(\.\/|\.\.\/firebase\/)req211Egress$/, replacement:stub('egress-fixture.ts')},
  ]},
});
