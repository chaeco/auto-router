import { generateManifest } from '../build-worker-manifest.js'
import { createWorkerRouter, type WorkerManifestRoute, type WorkerRouteContext } from '../worker-manifest.js'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('Worker integration (end-to-end)', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'auto-router-integration-'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('generates manifest and routes requests correctly', async () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })

    // Create controller files
    writeFileSync(join(controllersDir, 'get-users.ts'), `
      export default async (ctx) => {
        return { users: ['Alice', 'Bob'] }
      }
    `)
    writeFileSync(join(controllersDir, 'get-[id].ts'), `
      export default async (ctx) => {
        return { id: ctx.params.id }
      }
    `)
    writeFileSync(join(controllersDir, 'post-users.ts'), `
      export default async (ctx) => {
        ctx.res.status = 201
        return { created: true }
      }
    `)

    // Generate manifest
    const manifestContent = generateManifest({
      controllersDir,
      outputFile,
      prefix: '/api',
      ext: 'ts'
    })

    // Write manifest and dynamically import handlers
    writeFileSync(outputFile, manifestContent, 'utf-8')

    // Manually construct routes array (simulating what the generated file exports)
    const getUsersHandler = async (ctx: WorkerRouteContext) => {
      return { users: ['Alice', 'Bob'] }
    }
    const getIdHandler = async (ctx: WorkerRouteContext) => {
      return { id: ctx.params.id }
    }
    const postUsersHandler = async (ctx: WorkerRouteContext) => {
      ctx.res.status = 201
      return { created: true }
    }

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/users', method: 'GET', handler: getUsersHandler },
      { pattern: '/api/users', method: 'POST', handler: postUsersHandler },
      { pattern: '/api/:id', method: 'GET', handler: getIdHandler },
    ]

    const router = createWorkerRouter({ routes })

    // Test GET /api/users
    const req1 = new Request('http://localhost/api/users', { method: 'GET' })
    const res1 = await router.fetch(req1, {}, {} as ExecutionContext)
    expect(res1.status).toBe(200)
    expect(res1.headers.get('content-type')).toBe('application/json')
    const body1 = await res1.json()
    expect(body1).toEqual({ users: ['Alice', 'Bob'] })

    // Test GET /api/:id
    const req2 = new Request('http://localhost/api/123', { method: 'GET' })
    const res2 = await router.fetch(req2, {}, {} as ExecutionContext)
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2).toEqual({ id: '123' })

    // Test POST /api/users
    const req3 = new Request('http://localhost/api/users', { method: 'POST' })
    const res3 = await router.fetch(req3, {}, {} as ExecutionContext)
    expect(res3.status).toBe(201)
    const body3 = await res3.json()
    expect(body3).toEqual({ created: true })

    // Verify manifest content structure
    expect(manifestContent).toContain('export const routes: WorkerManifestRoute[] = [')
    expect(manifestContent).toContain("{ pattern: '/api/users', method: 'GET'")
    expect(manifestContent).toContain("{ pattern: '/api/users', method: 'POST'")
    expect(manifestContent).toContain("{ pattern: '/api/:id', method: 'GET'")
  })

  it('handles nested routes end-to-end', async () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(join(controllersDir, 'admin'), { recursive: true })

    writeFileSync(join(controllersDir, 'admin', 'get-users.ts'), `
      export default async (ctx) => {
        return { admin: true, users: [] }
      }
    `)
    writeFileSync(join(controllersDir, 'get-health.ts'), `
      export default async (ctx) => {
        return { status: 'ok' }
      }
    `)

    const manifestContent = generateManifest({
      controllersDir,
      outputFile,
      prefix: '/api',
      ext: 'ts'
    })

    const adminUsersHandler = async () => ({ admin: true, users: [] })
    const healthHandler = async () => ({ status: 'ok' })

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/admin/users', method: 'GET', handler: adminUsersHandler },
      { pattern: '/api/health', method: 'GET', handler: healthHandler },
    ]

    const router = createWorkerRouter({ routes })

    const req1 = new Request('http://localhost/api/admin/users', { method: 'GET' })
    const res1 = await router.fetch(req1, {}, {} as ExecutionContext)
    expect(await res1.json()).toEqual({ admin: true, users: [] })

    const req2 = new Request('http://localhost/api/health', { method: 'GET' })
    const res2 = await router.fetch(req2, {}, {} as ExecutionContext)
    expect(await res2.json()).toEqual({ status: 'ok' })
  })

  it('handles dynamic segments with brackets end-to-end (case preserved)', async () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })

    writeFileSync(join(controllersDir, 'get-[userId]-[postId].ts'), `
      export default async (ctx) => {
        return { userId: ctx.params.userId, postId: ctx.params.postId }
      }
    `)

    const manifestContent = generateManifest({
      controllersDir,
      outputFile,
      prefix: '/api',
      ext: 'ts'
    })

    const handler = async (ctx: WorkerRouteContext) => {
      return { userId: ctx.params.userId, postId: ctx.params.postId }
    }

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/:userId/:postId', method: 'GET', handler },
    ]

    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/42/99', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)
    expect(await res.json()).toEqual({ userId: '42', postId: '99' })

    expect(manifestContent).toContain("{ pattern: '/api/:userId/:postId', method: 'GET'")
  })

  it('treats case-variant param patterns as duplicates (registered pattern keeps case)', async () => {
    // Only runs on case-sensitive filesystems (macOS/Windows fold the two
    // file names into one). 仅大小写敏感的文件系统上运行（macOS/Windows
    // 会把两个文件名折叠为一个）。
    const probe = join(testDir, 'case-probe')
    mkdirSync(probe, { recursive: true })
    writeFileSync(join(probe, 'probe-A.ts'), '')
    // On a case-insensitive FS, probe-a.ts resolves to the same file and
    // "exists"; on a case-sensitive FS it does not yet exist.
    // 大小写不敏感的 FS 上 probe-a.ts 会解析到同一文件而"存在"；大小写敏感
    // 的 FS 上它此时还不存在。
    const caseSensitive = !existsSync(join(probe, 'probe-a.ts'))
    rmSync(probe, { recursive: true, force: true })
    if (!caseSensitive) return

    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })

    writeFileSync(join(controllersDir, 'get-[userId].ts'), 'export default async (ctx) => {}')
    writeFileSync(join(controllersDir, 'get-[USERID].ts'), 'export default async (ctx) => {}')

    const manifestContent = generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    const importCount = (manifestContent.match(/import handler_/g) || []).length
    expect(importCount).toBe(1)
    const routeEntries = (manifestContent.match(/{ pattern:/g) || []).length
    expect(routeEntries).toBe(1)
    expect(manifestContent).toContain("{ pattern: '/api/:userId', method: 'GET'")
  })

  it('custom error handlers work with generated routes', async () => {
    const controllersDir = join(testDir, 'controllers')
    const outputFile = join(testDir, 'routes.ts')
    mkdirSync(controllersDir, { recursive: true })

    writeFileSync(join(controllersDir, 'get-error.ts'), `
      export default async () => {
        throw new Error('Intentional error')
      }
    `)

    generateManifest({ controllersDir, outputFile, prefix: '/api', ext: 'ts' })

    const errorHandler = async () => {
      throw new Error('Intentional error')
    }

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/error', method: 'GET', handler: errorHandler },
    ]

    let errorCaptured: unknown = null
    const customErrorHandler = (err: unknown) => {
      errorCaptured = err
      return new Response(JSON.stringify({ error: 'Custom error response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const router = createWorkerRouter({
      routes,
      onError: customErrorHandler
    })

    const req = new Request('http://localhost/api/error', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Custom error response' })
    expect(errorCaptured).toBeInstanceOf(Error)
    expect((errorCaptured as Error).message).toBe('Intentional error')
  })
})
