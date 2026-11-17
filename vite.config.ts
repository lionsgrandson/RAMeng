import { execSync } from 'node:child_process'
import {readFileSync,existsSync} from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const version = process.env.RAMENG_APP_VERSION || execSync('git rev-parse --short=12 HEAD', {encoding:'utf8'}).trim()
const retainedDirectory = 'artifacts/release-assets'
const retainedNames: string[] = existsSync(`${retainedDirectory}/manifest.json`) ? JSON.parse(readFileSync(`${retainedDirectory}/manifest.json`,'utf8')) : []
export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  plugins: [react(), {name:'app-version',generateBundle(_options,bundle){
    this.emitFile({type:'asset',fileName:'app-version.json',source:JSON.stringify({version})})
    for (const name of retainedNames) {
      if (!/^[a-zA-Z0-9_-]+\.(js|css)$/.test(name)) throw Error('Invalid retained asset name')
      if (!bundle[`assets/${name}`]) this.emitFile({type:'asset',fileName:`assets/${name}`,source:readFileSync(`${retainedDirectory}/${name}`)})
    }
  }}],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
