// 在 Node 环境里运行，生成 Worker 静态路由清单
// npx tsx example/worker-manifest-build.example.ts ./controllers ./example/generated-worker-routes.ts

import { readdirSync, statSync, writeFileSync } from 'fs'
import { join, resolve, relative } from 'path'
import { pathToFileURL } from 'url'

const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']

function extractRoute(file: string) {
  const base = file.replace(/\.(ts|js)$/, '')

  for (const m of METHODS) {
    if (base === m) {
      return { method: m, rest: '' }
    }

    if (base.startsWith(m + '-')) {
      return { method: m, rest: base.slice(m.length + 1) }
    }
  }

  return null
}

function toPattern(prefix: string, rest: string) {
  const p = '/' + rest
    .replace(/\[(\w+)\]/g, ':$1')
    .replace(/-:/g, '/:')
    .replace(/:(\w+)-/g, ':$1/')
    .replace(/\/+/g, '/')

  return (prefix + (p === '/' ? '' : p)).replace(/\/+/g, '/')
}

function scan(dir: string, prefix: string) {
  const entries: Array<{ method: string; pattern: string; fileUrl: string }> = []

  for (const file of readdirSync(dir)) {
    const full = join(dir, file)
    const stat = statSync(full)

    if (stat.isDirectory()) {
      entries.push(...scan(full, prefix + '/' + file))
      continue
    }

    if (!file.endsWith('.ts') && !file.endsWith('.js')) continue
    const meta = extractRoute(file)
    if (!meta) continue

    entries.push({
      method: meta.method.toUpperCase(),
      pattern: toPattern(prefix, meta.rest),
      fileUrl: pathToFileURL(full).href,
    })
  }

  return entries
}

const inputDir = resolve(process.argv[2] || './controllers')
const outFile = resolve(process.argv[3] || './example/generated-worker-routes.ts')
const entries = scan(inputDir, '')

const imports = entries.map((e, i) => `import handler${i} from '${e.fileUrl}'`).join('\n')
const list = entries.map((e, i) => `  { method: '${e.method}', pattern: '${e.pattern}', handler: handler${i} }`).join(',\n')
const code = `// Generated worker manifest\n${imports}\n\nexport const routes = [\n${list}\n]\n`

writeFileSync(outFile, code)
console.log(`Generated ${entries.length} routes -> ${outFile}`)
