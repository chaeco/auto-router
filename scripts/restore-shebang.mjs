import { readFileSync, writeFileSync, chmodSync } from 'node:fs'

const FILE = 'dist/build-worker-manifest.js'
const SHEBANG = '#!/usr/bin/env node'

// Rollup strips shebangs. Re-add it after build (rollup-plugin-dts output for
// the same entry keeps the header in .d.ts, which is harmless).
const content = readFileSync(FILE, 'utf8')
if (!content.startsWith(SHEBANG)) {
  writeFileSync(FILE, `${SHEBANG}\n${content}`, 'utf8')
}
chmodSync(FILE, 0o755)
console.log('✅ shebang restored on dist/build-worker-manifest.js')
