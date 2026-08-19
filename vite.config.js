import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const STATIC_DIRS = ['assets', 'lib', 'public']
const DIST_DIRS = [
  'assets/LSEC/abecedario',
  'assets/LSEC/gestoswebm',
  'assets/textures',
  'lib',
  'public',
]

const MIME = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.task': 'application/octet-stream',
  '.txt': 'text/plain',
}

function serveRootStatics(staticDirs) {
  return {
    name: 'serve-root-statics',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0])
        const cleaned = url.replace(/^\/+/, '')
        const top = cleaned.split('/')[0]
        if (!staticDirs.includes(top)) return next()
        const file = path.join(ROOT, cleaned)
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
        const ext = path.extname(file).toLowerCase()
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      for (const d of DIST_DIRS) {
        const src = path.join(ROOT, d)
        if (!fs.existsSync(src)) continue
        fs.cpSync(src, path.join(ROOT, 'dist', d), {
          recursive: true,
          filter: (f) => !f.endsWith(':Zone.Identifier'),
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), serveRootStatics(STATIC_DIRS)],
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
})