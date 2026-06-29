import { jest } from '@jest/globals'
import { staticAutoRouter } from '../static-router'
import { createHandler } from '../handler'

describe('staticAutoRouter', () => {
  const handler = async () => {}

  it('should register static routes', async () => {
    const mockApp: any = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      $routes: undefined,
    }

    const router = staticAutoRouter({
      routes: [
        { method: 'get', path: '/api/users', handler },
        { method: 'post', path: '/api/login', handler },
      ],
      prefix: '/api',
    })
    await router(mockApp)

    expect(mockApp.get).toHaveBeenCalledWith('/api/users', handler)
    expect(mockApp.post).toHaveBeenCalledWith('/api/login', handler)
    expect(mockApp.$routes!.all).toHaveLength(2)
  })

  it('should throw error if app is not provided', async () => {
    const router = staticAutoRouter({ routes: [] })
    await expect(router(null)).rejects.toThrow('Static auto-router plugin requires an application instance')
  })

  it('should handle defaultRequiresAuth: true', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/users', handler }],
      defaultRequiresAuth: true,
    })(mockApp)

    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1)
    expect(mockApp.$routes!.publicRoutes).toHaveLength(0)
  })

  it('should handle defaultRequiresAuth: false', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/users', handler }],
      defaultRequiresAuth: false,
    })(mockApp)

    expect(mockApp.$routes!.publicRoutes).toHaveLength(1)
    expect(mockApp.$routes!.protectedRoutes).toHaveLength(0)
  })

  it('should enforce forceProtected override', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/profile', handler }],
      defaultRequiresAuth: false,
      forceProtected: ['/api/profile'],
    })(mockApp)

    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1)
    expect(mockApp.$routes!.publicRoutes).toHaveLength(0)
  })

  it('should enforce forcePublic override', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/docs', handler }],
      defaultRequiresAuth: true,
      forcePublic: ['/api/docs'],
    })(mockApp)

    expect(mockApp.$routes!.publicRoutes).toHaveLength(1)
    expect(mockApp.$routes!.protectedRoutes).toHaveLength(0)
  })

  it('should warn when route matches both forcePublic and forceProtected (forceProtected wins)', async () => {
    const mockApp: any = { get: jest.fn(), $routes: { publicRoutes: [], protectedRoutes: [], all: [] } }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/auth', handler }],
      forcePublic: ['/api/auth'],
      forceProtected: ['/api/auth'],
    })(mockApp)

    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('matched both forcePublic'))

    warnSpy.mockRestore()
  })

  it('should detect duplicate routes', async () => {
    const mockApp: any = { get: jest.fn(), $routes: { publicRoutes: [], protectedRoutes: [], all: [] } }
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const router = staticAutoRouter({
      routes: [
        { method: 'get', path: '/api/users', handler },
        { method: 'get', path: '/api/users', handler: async () => {} },
      ],
    })
    await router(mockApp)

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate route'))
    expect(mockApp.get).toHaveBeenCalledTimes(1)

    errorSpy.mockRestore()
  })

  it('should detect duplicate routes across two staticAutoRouter calls', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/users', handler }],
    })(mockApp)

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/users', handler: async () => {} }],
    })(mockApp)

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate route'))
    expect(mockApp.get).toHaveBeenCalledTimes(1)

    errorSpy.mockRestore()
  })

  it('should skip null/undefined handler', async () => {
    const mockApp: any = { get: jest.fn(), $routes: { publicRoutes: [], protectedRoutes: [], all: [] } }
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await staticAutoRouter({
      routes: [
        { method: 'get', path: '/api/test', handler: undefined },
      ],
    })(mockApp)

    expect(mockApp.get).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('null/undefined'))

    errorSpy.mockRestore()
  })

  it('should reject invalid handler type', async () => {
    const mockApp: any = { get: jest.fn(), $routes: { publicRoutes: [], protectedRoutes: [], all: [] } }
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await staticAutoRouter({
      routes: [
        { method: 'get', path: '/api/test', handler: 'not-a-function' as any },
      ],
    })(mockApp)

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('invalid handler type'))

    errorSpy.mockRestore()
  })

  it('should accept createHandler result', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [
        { method: 'get', path: '/api/secure', handler: createHandler(handler, { requiresAuth: true }) },
      ],
    })(mockApp)

    expect(mockApp.get).toHaveBeenCalledWith('/api/secure', handler)
    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1)
  })

  it('should accept plain object with handler in non-strict mode', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [
        {
          method: 'get',
          path: '/api/test',
          handler: { handler, meta: { requiresAuth: false } },
        },
      ],
    })(mockApp)

    expect(mockApp.get).toHaveBeenCalledWith('/api/test', handler)
    expect(mockApp.$routes!.publicRoutes).toHaveLength(1)
  })

  it('should call onLog callback', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const onLog = jest.fn()

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/users', handler }],
      onLog,
    })(mockApp)

    expect(onLog).toHaveBeenCalledWith('info', expect.stringContaining('Loading'))
    expect(onLog).toHaveBeenCalledWith('info', expect.stringContaining('✅ GET'))
    expect(onLog).toHaveBeenCalledWith('info', expect.stringContaining('Registered routes'))
  })

  it('should respect logging: false', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/users', handler }],
      logging: false,
    })(mockApp)

    expect(logSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('should warn when forcePublic pattern never matches any route', async () => {
    const mockApp: any = { get: jest.fn(), $routes: { publicRoutes: [], protectedRoutes: [], all: [] } }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/users', handler }],
      forcePublic: ['/api/nonexistent'],
    })(mockApp)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('forcePublic pattern "/api/nonexistent" did not match'))

    warnSpy.mockRestore()
  })

  it('should warn when forceProtected pattern never matches any route', async () => {
    const mockApp: any = { get: jest.fn(), $routes: { publicRoutes: [], protectedRoutes: [], all: [] } }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/users', handler }],
      forceProtected: ['/api/nonexistent'],
    })(mockApp)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('forceProtected pattern "/api/nonexistent" did not match'))

    warnSpy.mockRestore()
  })

  it('should warn when createHandler explicit meta overrides forceProtected', async () => {
    const mockApp: any = { get: jest.fn(), $routes: { publicRoutes: [], protectedRoutes: [], all: [] } }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    await staticAutoRouter({
      routes: [
        { method: 'get', path: '/api/open', handler: createHandler(handler, { requiresAuth: false }) },
      ],
      forceProtected: ['/api/open'],
    })(mockApp)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('has no effect'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('forceProtected'))

    warnSpy.mockRestore()
  })

  it('should warn when createHandler explicit meta overrides forcePublic', async () => {
    const mockApp: any = { get: jest.fn(), $routes: { publicRoutes: [], protectedRoutes: [], all: [] } }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    await staticAutoRouter({
      routes: [
        { method: 'get', path: '/api/secure', handler: createHandler(handler, { requiresAuth: true }) },
      ],
      forcePublic: ['/api/secure'],
    })(mockApp)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('has no effect'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('forcePublic'))

    warnSpy.mockRestore()
  })

  it('should match wildcard forceProtected pattern', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [{ method: 'get', path: '/api/admin/users', handler }],
      defaultRequiresAuth: false,
      forceProtected: ['/api/admin/*'],
    })(mockApp)

    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1)
  })

  it('should match method-prefix forceProtected pattern', async () => {
    const mockApp: any = { get: jest.fn(), post: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [
        { method: 'get', path: '/api/users', handler },
        { method: 'post', path: '/api/users', handler },
      ],
      defaultRequiresAuth: false,
      forceProtected: ['POST /api/users'],
    })(mockApp)

    const pub = mockApp.$routes!.publicRoutes
    const prot = mockApp.$routes!.protectedRoutes
    expect(pub.some((r: any) => r.method === 'GET')).toBe(true)
    expect(prot.some((r: any) => r.method === 'POST')).toBe(true)
  })

  it('should handle delete method route registration', async () => {
    const mockApp: any = { delete: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [{ method: 'delete', path: '/api/users/:id', handler }],
    })(mockApp)

    expect(mockApp.delete).toHaveBeenCalledWith('/api/users/:id', handler)
  })

  it('should handle patch method route registration', async () => {
    const mockApp: any = { patch: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [{ method: 'patch', path: '/api/users/:id', handler }],
    })(mockApp)

    expect(mockApp.patch).toHaveBeenCalledWith('/api/users/:id', handler)
  })

  it('should handle put method route registration', async () => {
    const mockApp: any = { put: jest.fn(), $routes: undefined }

    await staticAutoRouter({
      routes: [{ method: 'put', path: '/api/users/:id', handler }],
    })(mockApp)

    expect(mockApp.put).toHaveBeenCalledWith('/api/users/:id', handler)
  })
})
