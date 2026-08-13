#!/usr/bin/env node

import { readdirSync, statSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve, relative, dirname } from 'path'
import { HTTP_METHODS } from './constants.js'
import { validateFileName } from './validation.js'
import { parseRouteName, parseDirectorySegment, normalizeParamNames } from './parse-route.js'
import { compileIgnorePatterns, isIgnored, type CompiledIgnorePattern, type IgnorePattern } from './ignore.js'

interface RouteEntry {
  method: string
  pattern: string
  filePath: string
  importPath: string
  importId: string
}

interface GenerateManifestOptions {
  controllersDir: string
  outputFile: string
  prefix: string
  ext: string
  /** Regex patterns (string source or RegExp) matched against entry basenames to skip. */
  ignore?: IgnorePattern[]
}

function sanitizeIdentifier(path: string): string {
  return (
    'handler_' +
    path
      .replace(/\.(ts|js)$/, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
  )
}

function scanDirectory(
  dirPath: string,
  basePath: string,
  controllersRoot: string,
  ext: string,
  ignore: CompiledIgnorePattern[],
  routes: RouteEntry[]
): void {
  const files = readdirSync(dirPath)

  for (const file of files) {
    const filePath = join(dirPath, file)
    let fileStat: ReturnType<typeof statSync>
    try {
      fileStat = statSync(filePath)
    } catch {
      continue
    }

    // Skip ignored entries before validation — a matched folder is skipped
    // whole (no recursion), a matched file silently. The entry's kind decides
    // which patterns apply (file / dir / both).
    if (isIgnored(file, fileStat.isDirectory(), ignore)) continue

    if (fileStat.isDirectory()) {
      let dirSegment: string
      try {
        dirSegment = parseDirectorySegment(file)
      } catch {
        continue
      }
      try {
        scanDirectory(filePath, basePath ? `${basePath}/${dirSegment}` : `/${dirSegment}`, controllersRoot, ext, ignore, routes)
      } catch {
        // Skip unreadable subdirectories
      }
    } else if ((file.endsWith(`.${ext}`) && !file.endsWith('.d.ts')) || (ext === 'js' && file.endsWith('.js'))) {
      const validation = validateFileName(file)
      if (!validation.valid) continue

      const method = validation.method!
      const nameWithoutExt = file.replace(/\.(ts|js)$/, '')

      let routeName = ''
      if (nameWithoutExt !== method) {
        routeName = nameWithoutExt.substring(method.length + 1)
      }

      routeName = parseRouteName(routeName)

      let fullPath: string
      if (routeName) {
        fullPath = basePath ? `${basePath}/${routeName}` : `/${routeName}`
      } else {
        fullPath = basePath
      }

      fullPath = fullPath.replace(/\/+/g, '/')

      const relativeFromRoot = relative(controllersRoot, filePath)
      const importId = sanitizeIdentifier(relativeFromRoot)

      routes.push({
        method: method.toUpperCase(),
        pattern: fullPath,
        filePath,
        importPath: relativeFromRoot.replace(/\.(ts|js)$/, ''),
        importId,
      })
    }
  }
}

export function generateManifest(options: GenerateManifestOptions): string {
  const { controllersDir, outputFile, prefix, ext } = options

  const ignore = compileIgnorePatterns(options.ignore)
  const routes: RouteEntry[] = []
  const fullDir = resolve(controllersDir)

  try {
    scanDirectory(fullDir, '', fullDir, ext, ignore, routes)
  } catch (err: unknown) {
    throw new Error(`Failed to scan directory: ${err instanceof Error ? err.message : String(err)}`)
  }

  const normalizedPrefix = prefix.length > 1 && prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  for (const route of routes) {
    route.pattern = normalizedPrefix ? `${normalizedPrefix}${route.pattern}`.replace(/\/+/g, '/') : route.pattern
  }

  // Sort routes: specific paths before wildcards, then alphabetically
  // This prevents '/api/:id' from hijacking '/api/users'
  routes.sort((a, b) => {
    const aHasParam = a.pattern.includes(':')
    const bHasParam = b.pattern.includes(':')

    if (aHasParam && !bHasParam) return 1
    if (!aHasParam && bHasParam) return -1

    return a.pattern.localeCompare(b.pattern) || a.method.localeCompare(b.method)
  })

  // Detect duplicates — param-name casing is folded for the key
  const seen = new Set<string>()
  const uniqueRoutes: RouteEntry[] = []
  for (const route of routes) {
    const key = `${route.method} ${normalizeParamNames(route.pattern)}`
    if (seen.has(key)) {
      console.warn(`⚠️  Duplicate route skipped: ${key}`)
      continue
    }
    seen.add(key)
    uniqueRoutes.push(route)
  }

  const outputDir = dirname(resolve(outputFile))
  const imports: string[] = []
  for (const route of uniqueRoutes) {
    const absoluteController = resolve(controllersDir, route.importPath)
    const relativeImport = relative(outputDir, absoluteController).replace(/\\/g, '/')
    const importLine = `import ${route.importId} from './${relativeImport}'`
    imports.push(importLine)
  }

  const routeEntries = uniqueRoutes
    .map(r => `  { pattern: '${r.pattern}', method: '${r.method}', handler: ${r.importId} },`)
    .join('\n')

  const extFlag = ext !== 'ts' ? ` --ext ${ext}` : ''
  // Only "both"-targeted string patterns round-trip through `--ignore` — a bare
  // string is shorthand for both, while RegExp or file/dir-scoped entries carry
  // info the flag cannot express, so they are omitted from the regenerate hint.
  const ignoreFlags = (options.ignore ?? [])
    .map(entry => {
      if (typeof entry === 'string') return ` --ignore '${entry}'`
      if (entry instanceof RegExp) return ''
      if (typeof entry.pattern !== 'string' || (entry.type ?? 'both') !== 'both') return ''
      return ` --ignore '${entry.pattern}'`
    })
    .join('')
  const regenerateCmd = `npx auto-router-build-manifest ${controllersDir} ${outputFile} --prefix ${prefix}${extFlag}${ignoreFlags}`

  return `// AUTO-GENERATED by @chaeco/auto-router build-worker-manifest
// Do not edit manually.
// Regenerate: ${regenerateCmd}

import type { WorkerManifestRoute } from '@chaeco/auto-router/worker-manifest'
${imports.join('\n')}

export const routes: WorkerManifestRoute[] = [
${routeEntries}
]
`
}

function parseArgs(argv: string[]): {
  controllersDir: string
  outputFile: string
  prefix: string
  ext: string
  ignore: string[]
} | null {
  const positional: string[] = []
  let prefix = '/api'
  let ext = 'ts'
  const ignore: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--prefix') {
      prefix = argv[++i] || '/api'
    } else if (arg === '--ext') {
      ext = argv[++i] || 'ts'
    } else if (arg === '--ignore') {
      const pattern = argv[++i]
      if (pattern === undefined) {
        console.error('Error: --ignore requires a regex pattern')
        return null
      }
      ignore.push(pattern)
    } else if (!arg.startsWith('--')) {
      positional.push(arg)
    }
  }

  if (positional.length < 2) {
    console.error('Usage: auto-router-build-manifest <controllersDir> <outputFile> [--prefix /api] [--ext ts] [--ignore <regex>]...')
    return null
  }

  return {
    controllersDir: positional[0],
    outputFile: positional[1],
    prefix,
    ext,
    ignore,
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  if (!args) process.exit(1)

  try {
    const manifest = generateManifest(args)
    const outputPath = resolve(args.outputFile)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, manifest, 'utf-8')
    console.log(`✅ Generated: ${outputPath}`)
  } catch (err: unknown) {
    console.error(`❌ Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}