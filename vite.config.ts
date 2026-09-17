import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve, relative } from 'path'
import { readdirSync, statSync } from 'fs'

// Recursively discover every .html entry point so new SEO pages
// (services/*, locations/*, blog/*) are built automatically.
function findHtmlEntries(dir: string, root = dir): Record<string, string> {
  const skip = new Set(['node_modules', 'dist', '.git', 'public', 'src', 'scripts'])
  const entries: Record<string, string> = {}
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) {
      if (skip.has(name)) continue
      Object.assign(entries, findHtmlEntries(full, root))
    } else if (name.endsWith('.html')) {
      const key = relative(root, full).replace(/\.html$/, '').replace(/[\\/]/g, '-')
      entries[key] = full
    }
  }
  return entries
}

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    rollupOptions: {
      input: findHtmlEntries(__dirname),
    },
  },
})

