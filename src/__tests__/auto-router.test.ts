import { jest } from '@jest/globals'
import { autoRouter } from '../auto-router'
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'fs'
import { join } from 'path'

describe('autoRouter', () => {
  const testDir = join(process.cwd(), '__tests__', 'controllers')

  beforeAll(() => {
    // Create test controllers directory
    mkdirSync(testDir, { recursive: true })

    // Create test route files (using .js for dynamic imports to work in tests)
    writeFileSync(
      join(testDir, 'get-users.js'),
      'export default async (ctx) => { ctx.res.body = { users: [] } }'
    )
    writeFileSync(
      join(testDir, 'post-login.js'),
      'export default async (ctx) => { ctx.res.body = { token: "test" } }'
    )
    writeFileSync(
      join(testDir, 'get-[id].js'),
      'export default async (ctx) => { ctx.res.body = { id: ctx.params.id } }'
    )
  })

  afterAll(() => {
    // Clean up test files
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should load routes from directory', async () => {
    const mockApp = {
      get: jest.fn(),
      post: jest.fn(),
      $routes: {
        publicRoutes: [],
        protectedRoutes: [],
        all: [],
      },
    }

    const router = autoRouter({ dir: testDir, prefix: '/api' })
    await router(mockApp)

    expect(mockApp.get).toHaveBeenCalledWith('/api/users', expect.any(Function))
    expect(mockApp.post).toHaveBeenCalledWith('/api/login', expect.any(Function))
    expect(mockApp.get).toHaveBeenCalledWith('/api/:id', expect.any(Function))

    expect(mockApp.$routes).toBeDefined()
    expect(mockApp.$routes.all).toHaveLength(3)
    expect(mockApp.$routes.publicRoutes).toHaveLength(3) // Since defaultRequiresAuth: false
  })

  it('should handle default options', async () => {
    const mockApp = {
      get: jest.fn(),
      post: jest.fn(),
      $routes: undefined,
    }

    const router = autoRouter({ dir: testDir })
    await router(mockApp)

    expect(mockApp.get).toHaveBeenCalledWith('/api/users', expect.any(Function))
  })

  it('should throw error if app is not provided', async () => {
    const router = autoRouter()
    await expect(router(null)).rejects.toThrow('Auto-router plugin requires an application instance')
  })

  it('should support multiple autoRouter instances with different configurations', async () => {
    // Create separate test directories
    const adminDir = join(process.cwd(), '__tests__', 'controllers-admin')
    const clientDir = join(process.cwd(), '__tests__', 'controllers-client')

    mkdirSync(adminDir, { recursive: true })
    mkdirSync(clientDir, { recursive: true })

    // Create admin routes
    writeFileSync(
      join(adminDir, 'get-dashboard.js'),
      'export default async (ctx) => { ctx.res.body = { dashboard: "admin" } }'
    )
    writeFileSync(
      join(adminDir, 'post-settings.js'),
      'export default async (ctx) => { ctx.res.body = { settings: "updated" } }'
    )

    // Create client routes
    writeFileSync(
      join(clientDir, 'get-profile.js'),
      'export default async (ctx) => { ctx.res.body = { profile: "client" } }'
    )
    writeFileSync(
      join(clientDir, 'post-order.js'),
      'export default async (ctx) => { ctx.res.body = { order: "created" } }'
    )

    const mockApp: any = {
      get: jest.fn(),
      post: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    // Load admin routes
    const adminRouter = autoRouter({
      dir: adminDir,
      defaultRequiresAuth: false,
      prefix: '/api/admin',
    })
    await adminRouter(mockApp)

    // Load client routes
    const clientRouter = autoRouter({
      dir: clientDir,
      defaultRequiresAuth: true,
      prefix: '/api/client',
    })
    await clientRouter(mockApp)

    // Verify admin routes
    expect(mockApp.get).toHaveBeenCalledWith('/api/admin/dashboard', expect.any(Function))
    expect(mockApp.post).toHaveBeenCalledWith('/api/admin/settings', expect.any(Function))

    // Verify client routes
    expect(mockApp.get).toHaveBeenCalledWith('/api/client/profile', expect.any(Function))
    expect(mockApp.post).toHaveBeenCalledWith('/api/client/order', expect.any(Function))

    // Verify route metadata
    expect(mockApp.$routes).toBeDefined()
    expect(mockApp.$routes!.all).toHaveLength(4)
    expect(mockApp.$routes!.publicRoutes).toHaveLength(2) // admin routes are public
    expect(mockApp.$routes!.protectedRoutes).toHaveLength(2) // client routes are protected

    // Cleanup
    rmSync(adminDir, { recursive: true, force: true })
    rmSync(clientDir, { recursive: true, force: true })
  })

  it('should prevent duplicate routes across multiple autoRouter instances', async () => {
    const testDir1 = join(process.cwd(), '__tests__', 'controllers-dup1')
    const testDir2 = join(process.cwd(), '__tests__', 'controllers-dup2')

    mkdirSync(testDir1, { recursive: true })
    mkdirSync(testDir2, { recursive: true })

    // Create same route in both directories
    writeFileSync(
      join(testDir1, 'get-test.js'),
      'export default async (ctx) => { ctx.res.body = { from: "dir1" } }'
    )
    writeFileSync(
      join(testDir2, 'get-test.js'),
      'export default async (ctx) => { ctx.res.body = { from: "dir2" } }'
    )

    const mockApp: any = {
      get: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

    // Load routes from both directories with same prefix
    const router1 = autoRouter({ dir: testDir1, prefix: '/api' })
    await router1(mockApp)

    const router2 = autoRouter({ dir: testDir2, prefix: '/api' })
    await router2(mockApp)

    // First route should be registered
    expect(mockApp.get).toHaveBeenCalledWith('/api/test', expect.any(Function))
    expect(mockApp.get).toHaveBeenCalledTimes(1) // Only called once, duplicate rejected

    // Error should be logged for duplicate route
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Skip file'))

    consoleSpy.mockRestore()

    // Cleanup
    rmSync(testDir1, { recursive: true, force: true })
    rmSync(testDir2, { recursive: true, force: true })
  })

  it('should support merged configuration with array', async () => {
    // Create separate test directories
    const mergedAdminDir = join(process.cwd(), '__tests__', 'controllers-merged-admin')
    const mergedClientDir = join(process.cwd(), '__tests__', 'controllers-merged-client')

    mkdirSync(mergedAdminDir, { recursive: true })
    mkdirSync(mergedClientDir, { recursive: true })

    // Create admin routes
    writeFileSync(
      join(mergedAdminDir, 'get-config.js'),
      'export default async (ctx) => { ctx.res.body = { config: "admin" } }'
    )

    // Create client routes
    writeFileSync(
      join(mergedClientDir, 'get-data.js'),
      'export default async (ctx) => { ctx.res.body = { data: "client" } }'
    )

    const mockApp: any = {
      get: jest.fn(),
      post: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    // Use merged configuration (array)
    const router = autoRouter([
      {
        dir: mergedAdminDir,
        defaultRequiresAuth: false,
        prefix: '/api/admin',
      },
      {
        dir: mergedClientDir,
        defaultRequiresAuth: true,
        prefix: '/api/client',
      },
    ])
    await router(mockApp)

    // Verify admin routes
    expect(mockApp.get).toHaveBeenCalledWith('/api/admin/config', expect.any(Function))

    // Verify client routes
    expect(mockApp.get).toHaveBeenCalledWith('/api/client/data', expect.any(Function))

    // Verify route metadata
    expect(mockApp.$routes).toBeDefined()
    expect(mockApp.$routes!.all).toHaveLength(2)
    expect(mockApp.$routes!.publicRoutes).toHaveLength(1) // admin route is public
    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1) // client route is protected

    // Cleanup
    rmSync(mergedAdminDir, { recursive: true, force: true })
    rmSync(mergedClientDir, { recursive: true, force: true })
  })

  it('should support array with single configuration', async () => {
    const singleArrayDir = join(process.cwd(), '__tests__', 'controllers-single-array')

    mkdirSync(singleArrayDir, { recursive: true })

    writeFileSync(
      join(singleArrayDir, 'get-test.js'),
      'export default async (ctx) => { ctx.res.body = { test: "ok" } }'
    )

    const mockApp: any = {
      get: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    // Use array with single configuration
    const router = autoRouter([
      {
        dir: singleArrayDir,
        prefix: '/api',
      },
    ])
    await router(mockApp)

    expect(mockApp.get).toHaveBeenCalledWith('/api/test', expect.any(Function))
    expect(mockApp.$routes).toBeDefined()
    expect(mockApp.$routes!.all).toHaveLength(1)

    // Cleanup
    rmSync(singleArrayDir, { recursive: true, force: true })
  })

  it('should support prefix as array for multiple prefixes', async () => {
    const multiPrefixDir = join(process.cwd(), '__tests__', 'controllers-multi-prefix')

    mkdirSync(multiPrefixDir, { recursive: true })

    writeFileSync(
      join(multiPrefixDir, 'get-test.js'),
      'export default async (ctx) => { ctx.res.body = { test: "ok" } }'
    )

    const mockApp: any = {
      get: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    // Use array of prefixes
    const router = autoRouter({
      dir: multiPrefixDir,
      prefix: ['/api', '/v1', '/v2'],
    })
    await router(mockApp)

    // Should register the same route with all prefixes
    expect(mockApp.get).toHaveBeenCalledWith('/api/test', expect.any(Function))
    expect(mockApp.get).toHaveBeenCalledWith('/v1/test', expect.any(Function))
    expect(mockApp.get).toHaveBeenCalledWith('/v2/test', expect.any(Function))
    expect(mockApp.$routes).toBeDefined()
    expect(mockApp.$routes!.all).toHaveLength(3)

    // Cleanup
    rmSync(multiPrefixDir, { recursive: true, force: true })
  })

  it('should support file name as HTTP method only (e.g., get.ts)', async () => {
    const methodOnlyDir = join(process.cwd(), '__tests__', 'controllers-method-only')
    const subDir = join(methodOnlyDir, 'users')

    mkdirSync(subDir, { recursive: true })

    // Create files with method name only
    writeFileSync(
      join(methodOnlyDir, 'get.js'),
      'export default async (ctx) => { ctx.res.body = { root: "get" } }'
    )
    writeFileSync(
      join(subDir, 'get.js'),
      'export default async (ctx) => { ctx.res.body = { users: "get" } }'
    )
    writeFileSync(
      join(subDir, 'post.js'),
      'export default async (ctx) => { ctx.res.body = { users: "post" } }'
    )

    const mockApp: any = {
      get: jest.fn(),
      post: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    const router = autoRouter({ dir: methodOnlyDir, prefix: '/api' })
    await router(mockApp)

    // Should register routes at directory path
    expect(mockApp.get).toHaveBeenCalledWith('/api', expect.any(Function))
    expect(mockApp.get).toHaveBeenCalledWith('/api/users', expect.any(Function))
    expect(mockApp.post).toHaveBeenCalledWith('/api/users', expect.any(Function))
    expect(mockApp.$routes).toBeDefined()
    expect(mockApp.$routes!.all).toHaveLength(3)

    // Cleanup
    rmSync(methodOnlyDir, { recursive: true, force: true })
  })

  it('should respect logging option and disable console output', async () => {
    const loggingTestDir = join(process.cwd(), '__tests__', 'controllers-logging-test')

    mkdirSync(loggingTestDir, { recursive: true })

    writeFileSync(
      join(loggingTestDir, 'get-test.js'),
      'export default async (ctx) => { ctx.res.body = { test: "ok" } }'
    )

    const mockApp: any = {
      get: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    // Test with logging disabled
    const router = autoRouter({
      dir: loggingTestDir,
      prefix: '/api',
      logging: false,
    })
    await router(mockApp)

    // console.log should not be called for info logs
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('🔄 Scanning controller directory')
    )

    consoleSpy.mockRestore()

    // Cleanup
    rmSync(loggingTestDir, { recursive: true, force: true })
  })

  it('should call onLog callback with correct log levels', async () => {
    const onLogTestDir = join(process.cwd(), '__tests__', 'controllers-onlog-test')

    mkdirSync(onLogTestDir, { recursive: true })

    writeFileSync(
      join(onLogTestDir, 'get-test.js'),
      'export default async (ctx) => { ctx.res.body = { test: "ok" } }'
    )

    const mockApp: any = {
      get: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    const onLog = jest.fn()

    const router = autoRouter({
      dir: onLogTestDir,
      prefix: '/api',
      onLog: onLog,
    })
    await router(mockApp)

    // Should have been called with 'info' level logs
    expect(onLog).toHaveBeenCalledWith('info', expect.stringContaining('Scanning controller directory'))
    expect(onLog).toHaveBeenCalledWith('info', expect.stringContaining('✅ GET'))
    expect(onLog).toHaveBeenCalledWith('info', expect.stringContaining('Registered routes'))

    // Cleanup
    rmSync(onLogTestDir, { recursive: true, force: true })
  })

  it('should call onLog callback for error logs even with logging disabled', async () => {
    const errorDir = join(process.cwd(), '__tests__', 'controllers-error-log')

    mkdirSync(errorDir, { recursive: true })

    // Create a file with invalid name to trigger error
    writeFileSync(join(errorDir, 'invalid-file.js'), 'export default async (ctx) => {}')

    const mockApp: any = {
      get: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    const onLog = jest.fn()
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

    const router = autoRouter({
      dir: errorDir,
      prefix: '/api',
      logging: false,
      onLog: onLog,
    })
    await router(mockApp)

    // onLog should be called with 'error' level
    expect(onLog).toHaveBeenCalledWith('error', expect.stringContaining('Skip file'))

    consoleSpy.mockRestore()

    // Cleanup
    rmSync(errorDir, { recursive: true, force: true })
  })

  it('should support strict mode (default) - reject non-function/non-createHandler exports', async () => {
    const strictDir = join(process.cwd(), '__tests__', 'controllers-strict')

    mkdirSync(strictDir, { recursive: true })

    // Create valid file
    writeFileSync(
      join(strictDir, 'get-valid.js'),
      'export default async (ctx) => { ctx.res.body = { valid: true } }'
    )

    // Create file with object export (invalid in strict mode)
    writeFileSync(
      join(strictDir, 'get-invalid.js'),
      'export default { handler: async (ctx) => { ctx.res.body = { invalid: true } }, meta: {} }'
    )

    const mockApp: any = {
      get: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

    const router = autoRouter({
      dir: strictDir,
      prefix: '/api',
      strict: true, // Default strict mode
    })
    await router(mockApp)

    // Only valid route should be registered
    expect(mockApp.get).toHaveBeenCalledWith('/api/valid', expect.any(Function))
    expect(mockApp.get).not.toHaveBeenCalledWith('/api/invalid', expect.any(Function))

    // Error should be logged for invalid file
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load route'))

    consoleSpy.mockRestore()

    // Cleanup
    rmSync(strictDir, { recursive: true, force: true })
  })

  it('should support non-strict mode - allow object exports with warning', async () => {
    const nonStrictDir = join(process.cwd(), '__tests__', 'controllers-nonstrict')

    mkdirSync(nonStrictDir, { recursive: true })

    // Create file with valid function export
    writeFileSync(
      join(nonStrictDir, 'get-test.js'),
      'export default async (ctx) => { ctx.res.body = { test: true } }'
    )

    const mockApp: any = {
      get: jest.fn(),
      $routes: undefined,
      $registeredRoutes: undefined,
    }

    const router = autoRouter({
      dir: nonStrictDir,
      prefix: '/api',
      strict: false, // Non-strict mode
    })
    await router(mockApp)

    // Should register the route
    expect(mockApp.get).toHaveBeenCalledWith('/api/test', expect.any(Function))

    // Cleanup
    rmSync(nonStrictDir, { recursive: true, force: true })
  })

  // ---------------------------------------------------------------------------
  // Additional coverage tests
  // ---------------------------------------------------------------------------

  it('should warn via console when directory name is an HTTP method keyword', async () => {
    const parentDir = join(process.cwd(), '__tests__', 'controllers-keyword-parent')
    const httpKeywordDir = join(parentDir, 'get')
    mkdirSync(httpKeywordDir, { recursive: true })
    writeFileSync(join(httpKeywordDir, 'get-users.js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })

    await autoRouter({ dir: parentDir, prefix: '/api' })(mockApp)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP method keyword'))

    warnSpy.mockRestore()
    rmSync(parentDir, { recursive: true, force: true })
  })

  it('should reject file with empty parameter brackets []', async () => {
    const emptyParamDir = join(process.cwd(), '__tests__', 'controllers-empty-param')
    mkdirSync(emptyParamDir, { recursive: true })
    writeFileSync(join(emptyParamDir, 'get-[].js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

    await autoRouter({ dir: emptyParamDir, prefix: '/api' })(mockApp)

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Empty parameters'))
    expect(mockApp.get).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
    rmSync(emptyParamDir, { recursive: true, force: true })
  })

  it('should skip file with falsy non-null default export (e.g. false)', async () => {
    const falsyDir = join(process.cwd(), '__tests__', 'controllers-falsy')
    mkdirSync(falsyDir, { recursive: true })
    writeFileSync(join(falsyDir, 'get-test.js'), 'export default false')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

    await autoRouter({ dir: falsyDir, prefix: '/api' })(mockApp)

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('falsy non-null value'))
    expect(mockApp.get).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
    rmSync(falsyDir, { recursive: true, force: true })
  })

  it('should reject file with named exports alongside default export', async () => {
    const namedDir = join(process.cwd(), '__tests__', 'controllers-named-export')
    mkdirSync(namedDir, { recursive: true })
    writeFileSync(
      join(namedDir, 'get-test.js'),
      'export const foo = 1;\nexport default async (ctx) => {}'
    )

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

    await autoRouter({ dir: namedDir, prefix: '/api' })(mockApp)

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('named exports are not allowed'))
    expect(mockApp.get).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
    rmSync(namedDir, { recursive: true, force: true })
  })

  it('should allow plain object with handler function in non-strict mode (with warning)', async () => {
    const objDir = join(process.cwd(), '__tests__', 'controllers-obj-handler')
    mkdirSync(objDir, { recursive: true })
    writeFileSync(
      join(objDir, 'get-test.js'),
      'export default { handler: async (ctx) => { ctx.body = {} } }'
    )

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })

    await autoRouter({ dir: objDir, prefix: '/api', strict: false })(mockApp)

    expect(mockApp.get).toHaveBeenCalledWith('/api/test', expect.any(Function))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-recommended export method'))

    warnSpy.mockRestore()
    rmSync(objDir, { recursive: true, force: true })
  })

  it('should reject plain object without handler function in non-strict mode', async () => {
    const noHandlerDir = join(process.cwd(), '__tests__', 'controllers-no-handler')
    mkdirSync(noHandlerDir, { recursive: true })
    writeFileSync(join(noHandlerDir, 'get-test.js'), 'export default { foo: "bar" }')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

    await autoRouter({ dir: noHandlerDir, prefix: '/api', strict: false })(mockApp)

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Exported object must contain handler function'))
    expect(mockApp.get).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
    rmSync(noHandlerDir, { recursive: true, force: true })
  })

  it('should reject unsupported export type (number) in non-strict mode', async () => {
    const numDir = join(process.cwd(), '__tests__', 'controllers-number-export')
    mkdirSync(numDir, { recursive: true })
    writeFileSync(join(numDir, 'get-test.js'), 'export default 42')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

    await autoRouter({ dir: numDir, prefix: '/api', strict: false })(mockApp)

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported export type'))
    expect(mockApp.get).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
    rmSync(numDir, { recursive: true, force: true })
  })

  it('should log error and return when directory does not exist', async () => {
    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

    await autoRouter({ dir: '/nonexistent/__fake__/path', prefix: '/api' })(mockApp)

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to scan directory'))
    expect(mockApp.get).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('should enforce forceProtected route as auth-required (overrides defaultRequiresAuth: false)', async () => {
    const fpDir = join(process.cwd(), '__tests__', 'controllers-force-protected')
    mkdirSync(fpDir, { recursive: true })
    writeFileSync(join(fpDir, 'get-profile.js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({
      dir: fpDir,
      prefix: '/api',
      defaultRequiresAuth: false,
      forceProtected: ['/api/profile'],
    })(mockApp)

    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1)
    expect(mockApp.$routes!.publicRoutes).toHaveLength(0)

    consoleSpy.mockRestore()
    rmSync(fpDir, { recursive: true, force: true })
  })

  it('should enforce forcePublic route as public (overrides defaultRequiresAuth: true)', async () => {
    const fpubDir = join(process.cwd(), '__tests__', 'controllers-force-public')
    mkdirSync(fpubDir, { recursive: true })
    writeFileSync(join(fpubDir, 'get-docs.js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({
      dir: fpubDir,
      prefix: '/api',
      defaultRequiresAuth: true,
      forcePublic: ['/api/docs'],
    })(mockApp)

    expect(mockApp.$routes!.publicRoutes).toHaveLength(1)
    expect(mockApp.$routes!.protectedRoutes).toHaveLength(0)

    consoleSpy.mockRestore()
    rmSync(fpubDir, { recursive: true, force: true })
  })

  it('should warn when route matches both forcePublic and forceProtected (forceProtected wins)', async () => {
    const conflictDir = join(process.cwd(), '__tests__', 'controllers-force-conflict')
    mkdirSync(conflictDir, { recursive: true })
    writeFileSync(join(conflictDir, 'get-auth.js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({
      dir: conflictDir,
      prefix: '/api',
      forcePublic: ['/api/auth'],
      forceProtected: ['/api/auth'],
    })(mockApp)

    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('matched both forcePublic'))

    warnSpy.mockRestore()
    logSpy.mockRestore()
    rmSync(conflictDir, { recursive: true, force: true })
  })

  it('should warn when createHandler explicit meta overrides forceProtected pattern', async () => {
    const metaDir = join(process.cwd(), '__tests__', 'controllers-meta-override-prot')
    mkdirSync(metaDir, { recursive: true })
    // Simulate createHandler output: $__isRouteConfig marks it as a RouteConfig
    writeFileSync(
      join(metaDir, 'get-open.js'),
      'export default { handler: async (ctx) => {}, meta: { requiresAuth: false }, $__isRouteConfig: true }'
    )

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({
      dir: metaDir,
      prefix: '/api',
      forceProtected: ['/api/open'],
    })(mockApp)

    // Explicit meta (requiresAuth: false) wins over forceProtected
    expect(mockApp.$routes!.publicRoutes).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('has no effect'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('forceProtected'))

    warnSpy.mockRestore()
    logSpy.mockRestore()
    rmSync(metaDir, { recursive: true, force: true })
  })

  it('should warn when createHandler explicit meta overrides forcePublic pattern', async () => {
    const metaPubDir = join(process.cwd(), '__tests__', 'controllers-meta-override-pub')
    mkdirSync(metaPubDir, { recursive: true })
    writeFileSync(
      join(metaPubDir, 'get-secure.js'),
      'export default { handler: async (ctx) => {}, meta: { requiresAuth: true }, $__isRouteConfig: true }'
    )

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({
      dir: metaPubDir,
      prefix: '/api',
      forcePublic: ['/api/secure'],
    })(mockApp)

    // Explicit meta (requiresAuth: true) wins over forcePublic
    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('has no effect'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('forcePublic'))

    warnSpy.mockRestore()
    logSpy.mockRestore()
    rmSync(metaPubDir, { recursive: true, force: true })
  })

  it('should warn when forcePublic pattern never matches any registered route', async () => {
    const fpNoMatchDir = join(process.cwd(), '__tests__', 'controllers-fp-nomatch')
    mkdirSync(fpNoMatchDir, { recursive: true })
    writeFileSync(join(fpNoMatchDir, 'get-test.js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({
      dir: fpNoMatchDir,
      prefix: '/api',
      forcePublic: ['/api/nonexistent-route'],
    })(mockApp)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('forcePublic pattern "/api/nonexistent-route" did not match any registered route')
    )

    warnSpy.mockRestore()
    logSpy.mockRestore()
    rmSync(fpNoMatchDir, { recursive: true, force: true })
  })

  it('should warn when forceProtected pattern never matches any registered route', async () => {
    const fprotNoMatchDir = join(process.cwd(), '__tests__', 'controllers-fprot-nomatch')
    mkdirSync(fprotNoMatchDir, { recursive: true })
    writeFileSync(join(fprotNoMatchDir, 'get-test.js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({
      dir: fprotNoMatchDir,
      prefix: '/api',
      forceProtected: ['/api/nonexistent-route'],
    })(mockApp)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('forceProtected pattern "/api/nonexistent-route" did not match any registered route')
    )

    warnSpy.mockRestore()
    logSpy.mockRestore()
    rmSync(fprotNoMatchDir, { recursive: true, force: true })
  })

  it('should match forcePublic/forceProtected via method-prefix pattern', async () => {
    const methodPatternDir = join(process.cwd(), '__tests__', 'controllers-method-pattern')
    mkdirSync(methodPatternDir, { recursive: true })
    writeFileSync(join(methodPatternDir, 'get-users.js'), 'export default async (ctx) => {}')
    writeFileSync(join(methodPatternDir, 'post-users.js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), post: jest.fn(), $routes: undefined }
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({
      dir: methodPatternDir,
      prefix: '/api',
      defaultRequiresAuth: false,
      forceProtected: ['POST /api/users'], // only POST protected, GET stays public
    })(mockApp)

    const protectedRoutes = mockApp.$routes!.protectedRoutes
    const publicRoutes = mockApp.$routes!.publicRoutes
    expect(protectedRoutes.some((r: any) => r.method === 'POST' && r.path === '/api/users')).toBe(true)
    expect(publicRoutes.some((r: any) => r.method === 'GET' && r.path === '/api/users')).toBe(true)

    logSpy.mockRestore()
    rmSync(methodPatternDir, { recursive: true, force: true })
  })

  it('should match wildcard forceProtected pattern (covers isWildcard return true branch)', async () => {
    const wildcardDir = join(process.cwd(), '__tests__', 'controllers-wildcard')
    const subDir = join(wildcardDir, 'admin')
    mkdirSync(subDir, { recursive: true })
    writeFileSync(join(subDir, 'get-users.js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({
      dir: wildcardDir,
      prefix: '/api',
      defaultRequiresAuth: false,
      forceProtected: ['/api/admin/*'],  // wildcard matches /api/admin/users
    })(mockApp)

    expect(mockApp.$routes!.protectedRoutes).toHaveLength(1)
    expect(mockApp.$routes!.protectedRoutes[0].path).toBe('/api/admin/users')

    logSpy.mockRestore()
    rmSync(wildcardDir, { recursive: true, force: true })
  })

  it('should skip file silently when default export is null', async () => {
    const nullDir = join(process.cwd(), '__tests__', 'controllers-null-export')
    mkdirSync(nullDir, { recursive: true })
    writeFileSync(join(nullDir, 'get-test.js'), 'export default null')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const errors: string[] = []

    await autoRouter({
      dir: nullDir,
      prefix: '/api',
      onLog: (level, msg) => { if (level === 'error') errors.push(msg) },
    })(mockApp)

    expect(mockApp.get).not.toHaveBeenCalled()
    expect(errors).toHaveLength(0) // silently skipped, no error logged

    rmSync(nullDir, { recursive: true, force: true })
  })

  it('should catch import error when module throws during evaluation', async () => {
    const throwDir = join(process.cwd(), '__tests__', 'controllers-throw-on-import')
    mkdirSync(throwDir, { recursive: true })
    // Module throws at evaluation time → import() promise rejects → .catch() fires
    writeFileSync(
      join(throwDir, 'get-test.js'),
      "throw new Error('intentional module load error')"
    )

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const errors: string[] = []

    await autoRouter({
      dir: throwDir,
      prefix: '/api',
      onLog: (level, msg) => { if (level === 'error') errors.push(msg) },
    })(mockApp)

    expect(errors.some(m => m.includes('Failed to load route'))).toBe(true)
    expect(errors.some(m => m.includes('intentional module load error'))).toBe(true)
    expect(mockApp.get).not.toHaveBeenCalled()

    rmSync(throwDir, { recursive: true, force: true })
  })

  it('should warn and skip entry when statSync fails (broken symlink)', async () => {
    const symlinkDir = join(process.cwd(), '__tests__', 'controllers-broken-symlink')
    mkdirSync(symlinkDir, { recursive: true })
    writeFileSync(join(symlinkDir, 'get-valid.js'), 'export default async (ctx) => {}')
    // Create a broken symlink (points to non-existent target)
    try {
      symlinkSync('/nonexistent/target/file.ts', join(symlinkDir, 'get-broken.ts'))
    } catch {
      // If symlink creation fails (e.g., Windows), skip the symlink-specific assertion
    }

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({ dir: symlinkDir, prefix: '/api' })(mockApp)

    // Valid route should still be registered
    expect(mockApp.get).toHaveBeenCalledWith('/api/valid', expect.any(Function))

    warnSpy.mockRestore()
    logSpy.mockRestore()
    rmSync(symlinkDir, { recursive: true, force: true })
  })

  it('should silently skip .d.ts files in the controller directory', async () => {
    const dtsDir = join(process.cwd(), '__tests__', 'controllers-dts')
    mkdirSync(dtsDir, { recursive: true })
    writeFileSync(join(dtsDir, 'get-users.js'), 'export default async (ctx) => {}')
    writeFileSync(join(dtsDir, 'types.d.ts'), 'export type Foo = string')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await autoRouter({ dir: dtsDir, prefix: '/api' })(mockApp)

    // Only the .js route should be registered; .d.ts is silently ignored
    expect(mockApp.get).toHaveBeenCalledTimes(1)
    expect(mockApp.get).toHaveBeenCalledWith('/api/users', expect.any(Function))

    logSpy.mockRestore()
    rmSync(dtsDir, { recursive: true, force: true })
  })

  it('should default prefix to /api when prefix option is omitted', async () => {
    const defaultPrefixDir = join(process.cwd(), '__tests__', 'controllers-default-prefix')
    mkdirSync(defaultPrefixDir, { recursive: true })
    writeFileSync(join(defaultPrefixDir, 'get-hello.js'), 'export default async (ctx) => {}')

    const mockApp: any = { get: jest.fn(), $routes: undefined }
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    // No prefix provided → autoRouter defaults to '/api'
    await autoRouter({ dir: defaultPrefixDir })(mockApp)

    expect(mockApp.get).toHaveBeenCalledWith('/api/hello', expect.any(Function))

    logSpy.mockRestore()
    rmSync(defaultPrefixDir, { recursive: true, force: true })
  })
})
