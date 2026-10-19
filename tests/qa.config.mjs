import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Only this explicitly selected development config uses fixtures. Production
// builds continue to use vite.config.ts and the real authenticated backend.
export default defineConfig({
  define: { 'import.meta.env.VITE_QA_FIXTURES': '"true"', 'import.meta.env.VITE_APP_PREVIEW': '"true"' },
  plugins: [react(), {
    name: 'disposable-qa-fixtures',
    enforce: 'pre',
    async load(id) {
      const module = id.replaceAll('\\', '/').match(/\/src\/lib\/(backend|runtime|api)\.ts$/)?.[1]
      if (module) return readFile(fileURLToPath(new URL(`./fixtures/${module}.ts`, import.meta.url)), 'utf8')
    },
  }],
  envDir: fileURLToPath(new URL('./fixtures', import.meta.url)),
  cacheDir: 'node_modules/.vite-qa',
  build: { rollupOptions: { input: ['index.html', 'tests/fixtures/auth.html'] } },
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
})
