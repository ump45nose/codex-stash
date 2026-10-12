import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = dirname(fileURLToPath(import.meta.url))
const outfile = join(root, '../dist/inject.js')

mkdirSync(dirname(outfile), { recursive: true })
await esbuild.build({
  entryPoints: [join(root, '../src/entry.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  outfile,
  legalComments: 'none',
  banner: {
    js: '/* codex-stash inject bundle. MIT. Does not modify Codex. */',
  },
})
