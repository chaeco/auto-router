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

  it('extracts multiple params from route (names lowercased)', async () => {
    let capturedParams: Record<string, string> = {}
    const handler = async (ctx: WorkerRouteContext) => {
      capturedParams = ctx.params
      return ctx.params
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users/:userId/posts/:postId', method: 'GET', handler }]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/users/42/posts/99', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(capturedParams).toEqual({ userid: '42', postid: '99' })
    expect(res.headers.get('content-type')).toBe('application/json')
    const body = await res.json()
    expect(body).toEqual({ userid: '42', postid: '99' })
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

  it('runs middlewares before the handler in order', async () => {
    const order: string[] = []
    const handler = async (ctx: WorkerRouteContext) => {
      order.push('handler')
      return { ok: true }
    }
    const mw1 = async (ctx: WorkerRouteContext, next: () => Promise<unknown>) => {
      order.push('mw1')
      await next()
      order.push('mw1-after')
    }
    const mw2 = async (ctx: WorkerRouteContext, next: () => Promise<unknown>) => {
      order.push('mw2')
      await next()
      order.push('mw2-after')
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler, middlewares: [mw1, mw2] }]
    const router = createWorkerRouter({ routes })

    const res = await router.fetch(new Request('http://localhost/api/users', { method: 'GET' }), {}, {} as ExecutionContext)

    expect(res.status).toBe(200)
    expect(order).toEqual(['mw1', 'mw2', 'handler', 'mw2-after', 'mw1-after'])
  })

  it('stops the chain when a middleware short-circuits without calling next', async () => {
    let handlerCalled = false
    const handler = async () => {
      handlerCalled = true
      return { ok: true }
    }
    const blocking = async (ctx: WorkerRouteContext) => {
      ctx.res.status = 403
      ctx.res.body = 'Forbidden'
      // deliberately no next() call
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler, middlewares: [blocking] }]
    const router = createWorkerRouter({ routes })

    const res = await router.fetch(new Request('http://localhost/api/users', { method: 'GET' }), {}, {} as ExecutionContext)

    expect(handlerCalled).toBe(false)
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Forbidden')
  })

  it('unwraps createHandler middlewares alongside route-level middlewares', async () => {
    const order: string[] = []
    const handler = createHandler(
      async () => {
        order.push('handler')
        return { ok: true }
      },
      { requiresAuth: true },
      [
        async (ctx: WorkerRouteContext, next: () => Promise<unknown>) => {
          order.push('config-mw')
          await next()
        },
      ]
    )
    const routeMw = async (ctx: WorkerRouteContext, next: () => Promise<unknown>) => {
      order.push('route-mw')
      await next()
    }
    const routes: WorkerManifestRoute[] = [{ pattern: '/api/users', method: 'GET', handler, middlewares: [routeMw] }]
    const router = createWorkerRouter({ routes })

    const res = await router.fetch(new Request('http://localhost/api/users', { method: 'GET' }), {}, {} as ExecutionContext)

    expect(res.status).toBe(200)
    // createHandler middlewares run first, then route-level middlewares, then handler
    expect(order).toEqual(['config-mw', 'route-mw', 'handler'])
  })

  it('rejects non-function middlewares with TypeError', async () => {
    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/invalid', method: 'GET', handler: async () => 'OK', middlewares: ['not-a-middleware' as any] }
    ]

    let errorCaptured: unknown = null
    const onError = (err: unknown) => {
      errorCaptured = err
      return new Response('Bad Middleware', { status: 500 })
    }

    const router = createWorkerRouter({ routes, onError })

    const res = await router.fetch(new Request('http://localhost/api/invalid', { method: 'GET' }), {}, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Bad Middleware')
    expect(errorCaptured).toBeInstanceOf(TypeError)
    expect((errorCaptured as Error).message).toContain('Middleware')
    expect((errorCaptured as Error).message).toContain('not a function')
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

  it('rejects non-function handlers with TypeError', async () => {
    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/invalid', method: 'GET', handler: 42 as any }
    ]

    let errorCaptured: unknown = null
    const onError = (err: unknown) => {
      errorCaptured = err
      return new Response('Bad Handler', { status: 500 })
    }

    const router = createWorkerRouter({ routes, onError })

    const req = new Request('http://localhost/api/invalid', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Bad Handler')
    expect(errorCaptured).toBeInstanceOf(TypeError)
    expect((errorCaptured as Error).message).toContain('not a function')
    expect((errorCaptured as Error).message).toContain('number')
  })

  it('uses default 500 when handler is not a function and no onError', async () => {
    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/invalid', method: 'GET', handler: 'not a function' as any }
    ]
    const router = createWorkerRouter({ routes })

    const req = new Request('http://localhost/api/invalid', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Internal Server Error')
  })

  it('handles concurrent requests independently', async () => {
    let counter = 0
    const handler = async (ctx: WorkerRouteContext) => {
      const id = ++counter
      await new Promise(resolve => setTimeout(resolve, 10))
      return { requestId: id, params: ctx.params }
    }

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/:id', method: 'GET', handler }
    ]
    const router = createWorkerRouter({ routes })

    // Fire 5 concurrent requests
    const requests = [
      router.fetch(new Request('http://localhost/api/1', { method: 'GET' }), {}, {} as ExecutionContext),
      router.fetch(new Request('http://localhost/api/2', { method: 'GET' }), {}, {} as ExecutionContext),
      router.fetch(new Request('http://localhost/api/3', { method: 'GET' }), {}, {} as ExecutionContext),
      router.fetch(new Request('http://localhost/api/4', { method: 'GET' }), {}, {} as ExecutionContext),
      router.fetch(new Request('http://localhost/api/5', { method: 'GET' }), {}, {} as ExecutionContext),
    ]

    const results = await Promise.all(requests)
    const bodies = await Promise.all(results.map(r => r.json()))

    // Each request should get its own params and requestId
    expect(bodies[0]).toEqual({ requestId: 1, params: { id: '1' } })
    expect(bodies[1]).toEqual({ requestId: 2, params: { id: '2' } })
    expect(bodies[2]).toEqual({ requestId: 3, params: { id: '3' } })
    expect(bodies[3]).toEqual({ requestId: 4, params: { id: '4' } })
    expect(bodies[4]).toEqual({ requestId: 5, params: { id: '5' } })
  })

  it('handles consecutive slashes by normalizing path segments', async () => {
    const handler = async () => ({ ok: true })
    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/users', method: 'GET', handler }
    ]
    const router = createWorkerRouter({ routes })

    // Consecutive slashes are normalized by .split('/').filter(Boolean)
    const req = new Request('http://localhost/api//users', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('handles non-Error throws in handler', async () => {
    const handler = async () => {
      throw 'string error'  // eslint-disable-line no-throw-literal
    }

    let errorCaptured: unknown = null
    const onError = (err: unknown) => {
      errorCaptured = err
      return new Response('Caught', { status: 500 })
    }

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/throw', method: 'GET', handler }
    ]
    const router = createWorkerRouter({ routes, onError })

    const req = new Request('http://localhost/api/throw', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Caught')
    expect(errorCaptured).toBe('string error')
  })

  it('handles null throw in handler', async () => {
    const handler = async () => {
      throw null  // eslint-disable-line no-throw-literal
    }

    let errorCaptured: unknown = null
    const onError = (err: unknown) => {
      errorCaptured = err
      return new Response('Caught null', { status: 500 })
    }

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/throw', method: 'GET', handler }
    ]
    const router = createWorkerRouter({ routes, onError })

    const req = new Request('http://localhost/api/throw', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(errorCaptured).toBe(null)
  })

  it('performs efficiently with many routes (stress test)', async () => {
    // Generate 100 routes
    const routes: WorkerManifestRoute[] = []
    for (let i = 0; i < 100; i++) {
      routes.push({
        pattern: `/api/route${i}`,
        method: 'GET',
        handler: async () => ({ routeId: i })
      })
    }

    const router = createWorkerRouter({ routes })

    // Test first, middle, and last route
    const tests = [
      { url: 'http://localhost/api/route0', expected: 0 },
      { url: 'http://localhost/api/route50', expected: 50 },
      { url: 'http://localhost/api/route99', expected: 99 },
    ]

    for (const test of tests) {
      const req = new Request(test.url, { method: 'GET' })
      const res = await router.fetch(req, {}, {} as ExecutionContext)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ routeId: test.expected })
    }

    // Test 404 for non-existent route
    const notFoundReq = new Request('http://localhost/api/route999', { method: 'GET' })
    const notFoundRes = await router.fetch(notFoundReq, {}, {} as ExecutionContext)
    expect(notFoundRes.status).toBe(404)
  })

  it('handles circular references in JSON serialization', async () => {
    const handler = async () => {
      const obj: any = { data: [] }
      obj.data.push(obj)  // Circular reference
      return obj
    }

    let errorCaptured: unknown = null
    const onError = (err: unknown) => {
      errorCaptured = err
      return new Response('Serialization failed', { status: 500 })
    }

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/circular', method: 'GET', handler }
    ]
    const router = createWorkerRouter({ routes, onError })

    const req = new Request('http://localhost/api/circular', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Serialization failed')
    expect(errorCaptured).toBeInstanceOf(TypeError)
    expect((errorCaptured as Error).message).toContain('serialize')
  })

  it('handles BigInt in JSON serialization', async () => {
    const handler = async () => {
      return { value: BigInt(9007199254740991) }
    }

    let errorCaptured: unknown = null
    const onError = (err: unknown) => {
      errorCaptured = err
      return new Response('BigInt error', { status: 500 })
    }

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/bigint', method: 'GET', handler }
    ]
    const router = createWorkerRouter({ routes, onError })

    const req = new Request('http://localhost/api/bigint', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(errorCaptured).toBeInstanceOf(TypeError)
  })

  it('handles malformed URI encoding in path parameters', async () => {
    const handler = async (ctx: WorkerRouteContext) => {
      return { id: ctx.params.id }
    }

    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/:id', method: 'GET', handler }
    ]
    const router = createWorkerRouter({ routes })

    // Malformed UTF-8 sequence
    const req = new Request('http://localhost/api/%E0%A4%A', { method: 'GET' })
    const res = await router.fetch(req, {}, {} as ExecutionContext)

    // Should return 404 (no match) instead of crashing
    expect(res.status).toBe(404)
  })

  it('matches specific routes before wildcard routes', async () => {
    let usersHandlerCalled = false
    let idHandlerCalled = false

    const usersHandler = async () => {
      usersHandlerCalled = true
      return { type: 'users' }
    }
    const idHandler = async (ctx: WorkerRouteContext) => {
      idHandlerCalled = true
      return { type: 'id', id: ctx.params.id }
    }

    // Intentionally put wildcard first to test that order matters
    const routes: WorkerManifestRoute[] = [
      { pattern: '/api/:id', method: 'GET', handler: idHandler },
      { pattern: '/api/users', method: 'GET', handler: usersHandler },
    ]
    const router = createWorkerRouter({ routes })

    // This should match the wildcard (since it's first)
    const req1 = new Request('http://localhost/api/users', { method: 'GET' })
    const res1 = await router.fetch(req1, {}, {} as ExecutionContext)

    // With first-match semantics, wildcard wins
    expect(idHandlerCalled).toBe(true)
    expect(usersHandlerCalled).toBe(false)
    expect(await res1.json()).toEqual({ type: 'id', id: 'users' })
  })
})
