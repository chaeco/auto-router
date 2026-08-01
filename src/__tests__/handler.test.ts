import { createHandler, isRouteConfig, type RouteMeta } from '../handler.js'

describe('createHandler', () => {
  it('should create a RouteConfig with handler and meta', () => {
    const handler = async () => { }
    const meta: RouteMeta = { requiresAuth: true, description: 'test' }

    const config = createHandler(handler, meta)

    expect(config.handler).toBe(handler)
    expect(config.meta).toEqual(meta)
    expect(isRouteConfig(config)).toBe(true)
  })

  it('should create a RouteConfig with undefined meta if not provided', () => {
    const handler = async () => { }

    const config = createHandler(handler)

    expect(config.handler).toBe(handler)
    expect(config.meta).toBeUndefined()
    expect(isRouteConfig(config)).toBe(true)
  })

  it('should normalize empty meta object {} to undefined', () => {
    const handler = async () => { }

    const config = createHandler(handler, {})

    expect(config.handler).toBe(handler)
    expect(config.meta).toBeUndefined()
    expect(isRouteConfig(config)).toBe(true)
  })

  it('should store middlewares passed as third argument', () => {
    const handler = async () => { }
    const middleware = async (_ctx: any, next: () => Promise<any>) => { await next() }

    const config = createHandler(handler, undefined, [middleware])

    expect(config.handler).toBe(handler)
    expect(config.meta).toBeUndefined()
    expect(config.middlewares).toEqual([middleware])
    expect(isRouteConfig(config)).toBe(true)
  })

  it('should normalize empty middlewares array [] to undefined', () => {
    const handler = async () => { }

    const config = createHandler(handler, undefined, [])

    expect(config.handler).toBe(handler)
    expect(config.middlewares).toBeUndefined()
    expect(isRouteConfig(config)).toBe(true)
  })

  it('should keep middlewares undefined when not provided', () => {
    const handler = async () => { }

    const config = createHandler(handler)

    expect(config.handler).toBe(handler)
    expect(config.middlewares).toBeUndefined()
  })

  it('should support meta and middlewares together', () => {
    const handler = async () => { }
    const middleware = async (_ctx: any, next: () => Promise<any>) => { await next() }
    const meta: RouteMeta = { requiresAuth: true }

    const config = createHandler(handler, meta, [middleware])

    expect(config.handler).toBe(handler)
    expect(config.meta).toEqual(meta)
    expect(config.middlewares).toEqual([middleware])
    expect(isRouteConfig(config)).toBe(true)
  })
})

describe('isRouteConfig', () => {
  it('should return true for objects created by createHandler', () => {
    const config = createHandler(async () => { })

    expect(isRouteConfig(config)).toBe(true)
  })

  it('should return false for plain objects', () => {
    const plain = { handler: async () => { }, meta: {} }

    expect(isRouteConfig(plain)).toBe(false)
  })

  it('should return false for non-objects', () => {
    expect(isRouteConfig(null)).toBe(false)
    expect(isRouteConfig(undefined)).toBe(false)
    expect(isRouteConfig('string')).toBe(false)
    expect(isRouteConfig(123)).toBe(false)
  })

  it('should return false for objects without __routeConfigBrand', () => {
    const obj = { handler: async () => { }, meta: {}, __routeConfigBrand: false }

    expect(isRouteConfig(obj)).toBe(false)
  })
})
