import { createWorkerRouter, type WorkerManifestRoute, type WorkerRouteContext } from '../worker-manifest.js'
import { createHandler } from '../handler.js'

describe('createWorkerRouter', () => {
  it('returns an object with a fetch function', () => {
    const router = createWorkerRouter({ routes: [] })
    expect(router).toHaveProperty('fetch')
    expect(typeof router.fetch).toBe('function')
  })

  it('matches exact route and calls handler', async () => {
    let called = false
    const handler = async (ctx: WorkerRouteContext) => {
      called = true
      ctx.res.body = 'OK'
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(called).toBe(true)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('OK')
  })

  it('extracts single param from route', async () => {
    let capturedParams: Record<string, string> = {}
    const handler = async (ctx: WorkerRouteContext) => {
      capturedParams = ctx.params
      ctx.res.body = JSON.stringify(ctx.params)
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users/:id', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users/123', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(capturedParams).toEqual({ id: '123' })
    expect(await res.text()).toBe('{"id":"123"}')
  })

  it('extracts multiple params from route', async () => {
    let capturedParams: Record<string, string> = {}
    const handler = async (ctx: WorkerRouteContext) => {
      capturedParams = ctx.params
      return ctx.params
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users/:userId/posts/:postId', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users/42/posts/99', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(capturedParams).toEqual({ userId: '42', postId: '99' })
    expect(res.headers.get('content-type')).toBe('application/json')
    const body = await res.json()
    expect(body).toEqual({ userId: '42', postId: '99' })
  })

  it('falls through on method mismatch', async () => {
    let getCalled = false
    let postCalled = false
    const getHandler = async () => { getCalled = true; return 'GET' }
    const postHandler = async () => { postCalled = true; return 'POST' }
    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/users', method: 'GET', handler: getHandler },
      { pattern: '/api/users', method: 'POST', handler: postHandler },
    ]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users', { method: 'POST' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(getCalled).toBe(false)
    expect(postCalled).toBe(true)
    expect(await res.json()).toBe('POST')
  })

  it('calls notFound when no route matches', async () => {
    let notFoundCalled = false
    const notFound = () => { notFoundCalled = true; return new Response('Custom 404', { status: 404 }) }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler: async () => 'OK' }]
    const router = createWorkerRouter({ routes, notFound })

    const req = new Request('http://localhost/api/unknown', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(notFoundCalled).toBe(true)
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Custom 404')
  })

  it('uses default 404 when notFound not provided', async () => {
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler: async () => 'OK' }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/unknown', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Not Found')
  })

  it('calls onError when handler throws', async () => {
    const handler = async () => {
      throw new Error('Handler error')
    }
    let onErrorCalled = false
    const onError = () => { onErrorCalled = true; return new Response('Custom 500', { status: 500 }) }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler }]
    const router = createWorkerRouter({ routes, onError })

    const req = new Request('http://localhost/api/users', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(onErrorCalled).toBe(true)
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Custom 500')
  })

  it('uses default 500 when onError not provided', async () => {
    const handler = async () => {
      throw new Error('Handler error')
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Internal Server Error')
  })

  it('returns handler result directly when it is a Response', async () => {
    const handler = async () => new Response('Custom Response', { status: 201, headers: { 'X-Custom': 'value' } })
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'POST', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users', { method: 'POST' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(201)
    expect(res.headers.get('X-Custom')).toBe('value')
    expect(await res.text()).toBe('Custom Response')
  })

  it('serializes non-Response return value as JSON', async () => {
    const handler = async () => ({ success: true, data: [1, 2, 3] })
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/data', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/data', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    const body = await res.json()
    expect(body).toEqual({ success: true, data: [1, 2, 3] })
  })

  it('serializes ctx.res when handler returns undefined', async () => {
    const handler = async (ctx: WorkerRouteContext) => {
      ctx.res.status = 201
      ctx.res.headers['X-Custom'] = 'header'
      ctx.res.body = 'Created'
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'POST', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users', { method: 'POST' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(201)
    expect(res.headers.get('X-Custom')).toBe('header')
    expect(await res.text()).toBe('Created')
  })

  it('unwraps createHandler result', async () => {
    const handler = createHandler(
      async (ctx: WorkerRouteContext) => {
        return { unwrapped: true }
      },
      { requiresAuth: true }
    )
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/protected', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/protected', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ unwrapped: true })
  })

  it('matches methods case-insensitively', async () => {
    let called = false
    const handler = async () => { called = true; return 'OK' }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'get', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(called).toBe(true)
    expect(await res.json()).toBe('OK')
  })

  it('decodes URI components in params', async () => {
    let capturedParams: Record<string, string> = {}
    const handler = async (ctx: WorkerRouteContext) => {
      capturedParams = ctx.params
      return ctx.params
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users/:name', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users/John%20Doe', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(capturedParams).toEqual({ name: 'John Doe' })
  })

  it('ignores query strings when matching routes', async () => {
    let called = false
    const handler = async () => { called = true; return 'OK' }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users?page=1&limit=10', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(called).toBe(true)
    expect(await res.json()).toBe('OK')
  })

  it('handles trailing slashes correctly', async () => {
    let called = false
    const handler = async () => { called = true; return 'OK' }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users/', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(called).toBe(true)
    expect(await res.json()).toBe('OK')
  })

  it('rejects routes with segment count mismatch', async () => {
    const handler = async () => 'OK'
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users/:id', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req1 = new Request('http://localhost/api/users', { method: 'GET' })
    const res1 = await router.fetch(req1, {}, {} as ExecutionContext)
    expect(res1.status).toBe(404)

    const req2 = new Request('http://localhost/api/users/123/extra', { method: 'GET' })
    const res2 = await router.fetch(req2, {}, {} as ExecutionContext)
    expect(res2.status).toBe(404)
  })

  it('works with custom TEnv type', async () => {
    interface CustomEnv {
      DATABASE_URL: string
      KV: { get: (key: string) => Promise<string | null> }
    }

    let capturedEnv: CustomEnv | null = null
    const handler = async (ctx: WorkerRouteContext<CustomEnv>) => {
      capturedEnv = ctx.env
      return { dbUrl: ctx.env.DATABASE_URL }
    }

    const routes: WorkerManifestRoute<CustomEnv>[] = [
      { pattern: '/api/config', method: 'GET', handler }
    ]
    const router = createWorkerRouter<CustomEnv>({ routes })

    const mockEnv: CustomEnv = {
      DATABASE_URL: 'postgres://localhost',
      KV: { get: async () => null }
    }

    const req = new Request('http://localhost/api/config', { method: 'GET' })
    const res = await router.fetch(req, mockEnv, {} as ExecutionContext)

    expect(capturedEnv).toBe(mockEnv)
    const body = await res.json()
    expect(body).toEqual({ dbUrl: 'postgres://localhost' })
  })
})
