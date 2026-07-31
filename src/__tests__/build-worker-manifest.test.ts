import { generateManifest } from '../build-worker-manifest.js'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, chmodSync, symlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('generateManifest', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'auto-router-test-'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('generates manifest for a plain filename', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain("import handler_get_users from")
    expect(manifest).toContain("/controllers/get-users'")
    expect(manifest).toContain("{ pattern: '/api/users', method: 'GET', handler: handler_get_users }")
  })

  it('generates manifest for a bracketed filename', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-[id].ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain("import handler_get_id from")
    expect(manifest).toContain("/controllers/get-[id]'")
    expect(manifest).toContain("{ pattern: '/api/:id', method: 'GET', handler: handler_get_id }")
  })

  it('generates manifest for a nested file', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(join(controllersDir, 'auth'), { recursive: true })
    writeFileSync(join(controllersDir, 'auth', 'post-login.ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain("import handler_auth_post_login from")
    expect(manifest).toContain("/controllers/auth/post-login'")
    expect(manifest).toContain("{ pattern: '/api/auth/login', method: 'POST', handler: handler_auth_post_login }")
  })

  it('sanitizes import identifiers', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(join(controllersDir, 'admin'), { recursive: true })
    writeFileSync(join(controllersDir, 'admin', 'get-user-posts.ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain('import handler_admin_get_user_posts from')
    expect(manifest).not.toContain('handler_admin_get_user-posts')
  })

  it('calculates correct relative import paths', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'src', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    mkdirSync(join(testDir, 'src'), { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain("import handler_get_users from")
    expect(manifest).toContain("/controllers/get-users'")
  })

  it('normalizes prefix by stripping trailing slash', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api/', ext: 'ts' })

    expect(manifest).toContain("{ pattern: '/api/users', method: 'GET'")
    expect(manifest).not.toContain('/api//users')
  })

  it('handles empty prefix', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '', ext: 'ts' })

    expect(manifest).toContain("{ pattern: '/users', method: 'GET'")
  })

  it('generates empty routes array for empty directory', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain('export const routes: WorkerManifestRoute[] = [')
    expect(manifest).toContain(']')
  })

  it('skips files with invalid method prefix', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'users-get.ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain('handler_get_users')
    expect(manifest).not.toContain('handler_users_get')
  })

  it('skips files with malformed parameter syntax', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-[id].ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-[a][b].ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-[].ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-[user-id].ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain("pattern: '/api/:id'")
    expect(manifest).not.toContain('get_[a][b]')
    expect(manifest).not.toContain('get_[user-id]')
  })

  it('skips duplicate routes and warns', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')
    mkdirSync(join(controllersDir, 'users'), { recursive: true })
    writeFileSync(join(controllersDir, 'users', 'get.ts'), 'export default async (ctx) => {}')

    const originalWarn = console.warn
    let warnCalled = false
    console.warn = (msg: string) => {
      if (msg.includes('Duplicate route skipped')) warnCalled = true
    }

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(warnCalled).toBe(true)
    const importCount = (manifest.match(/import handler_/g) || []).length
    expect(importCount).toBe(1) // Only 1 import (duplicate skipped)
    const routeEntries = (manifest.match(/{ pattern:/g) || []).length
    expect(routeEntries).toBe(1) // Only 1 route entry

    console.warn = originalWarn
  })

  it('sorts routes with specific paths before wildcards', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'post-users.ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-[id].ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    const lines = manifest.split('\n')
    const routeLines = lines.filter(line => line.includes("{ pattern:"))

    // Specific paths (/api/users) should come before wildcards (/api/:id)
    expect(routeLines[0]).toContain("'/api/users'")
    expect(routeLines[0]).toContain("'GET'")
    expect(routeLines[1]).toContain("'/api/users'")
    expect(routeLines[1]).toContain("'POST'")
    expect(routeLines[2]).toContain("'/api/:id'")
    expect(routeLines[2]).toContain("'GET'")
  })

  it('includes regenerate command in header comment', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain('// Regenerate: npx auto-router-build-manifest')
    expect(manifest).toContain('--prefix /api')
  })

  it('respects ext parameter for js files', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.js'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-posts.ts'), 'export default async (ctx) => {}')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'js' })

    expect(manifest).toContain('handler_get_users')
    expect(manifest).not.toContain('handler_get_posts')
  })

  it('skips broken symlinks silently', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-valid.ts'), 'export default async (ctx) => {}')

    // Create a broken symlink (pointing to non-existent target)
    try {
      symlinkSync('/nonexistent/target/file.ts', join(controllersDir, 'get-broken.ts'))
    } catch {
      // If symlink creation fails (e.g., Windows), skip this test
      return
    }

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain('handler_get_valid')
    expect(manifest).not.toContain('handler_get_broken')
    expect(manifest).toContain("{ pattern: '/api/valid', method: 'GET'")
  })

  it('skips unreadable subdirectories and continues scanning', () => {
    if (process.platform === 'win32') {
      // Permission tests don't work reliably on Windows
      return
    }

    const controllersDir = join(testDir, 'controllers')
    const secretSubDir = join(controllersDir, 'secret')
    const outputFile = join(testDir, 'output', 'routes.ts')

    mkdirSync(secretSubDir, { recursive: true })
    writeFileSync(join(secretSubDir, 'get-secret.ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-public.ts'), 'export default async (ctx) => {}')

    // Make the subdirectory unreadable
    try {
      chmodSync(secretSubDir, 0o000)
    } catch {
      return
    }

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    // Public route should be included, secret route should be skipped
    expect(manifest).toContain('handler_get_public')
    expect(manifest).not.toContain('handler_secret_get_secret')
    expect(manifest).toContain("{ pattern: '/api/public', method: 'GET'")

    // Restore permissions for cleanup
    try { chmodSync(secretSubDir, 0o755) } catch {}
  })

  it('silently skips .d.ts files', () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'output', 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })
    writeFileSync(join(controllersDir, 'get-users.ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'types.d.ts'), 'export type User = { id: string }')

    const manifest = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    expect(manifest).toContain('handler_get_users')
    expect(manifest).not.toContain('types.d.ts')
    expect(manifest).not.toContain('handler_types')
    const importCount = (manifest.match(/import handler_/g) || []).length
    expect(importCount).toBe(1)
  })
})
