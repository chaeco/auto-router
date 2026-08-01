import { isRouteConfig, type AppLike, type RouteInfo, type RouteMiddleware } from './handler.js'
import { resolveAuth, ForcePatternTracker, type LogFn } from './auth-resolver.js'
import { validateRouteName, normalizeParamNames } from './parse-route.js'

/** Static route entry — callers statically import handlers and declare method/path. */
export interface StaticRoute {
  /** HTTP method, e.g. 'get', 'post', 'put', 'delete', 'patch'. */
  method: string
  /** Full route path, e.g. '/api/v1/auth/login'. */
  path: string
  /** Route handler function or createHandler return value. */
  handler: unknown
}

/** staticAutoRouter configuration. */
export interface StaticAutoRouterOptions {
  /** Static route list. */
  routes: StaticRoute[]
  /** Global default auth requirement. */
  defaultRequiresAuth?: boolean
  /** Routes forced public. */
  forcePublic?: string[]
  /** Routes forced protected. */
  forceProtected?: string[]
  /** Whether to print registration logs. */
  logging?: boolean
  /** Custom log sink. */
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
}

/** Static router plugin for runtimes without filesystem access. */
export function staticAutoRouter(options: StaticAutoRouterOptions) {
  const {
    routes,
    defaultRequiresAuth = false,
    forcePublic,
    forceProtected,
    logging = true,
    onLog,
  } = options

  const log: LogFn = (level, message) => {
    if (onLog) {
      onLog(level, message)
      return
    }

    if (!logging) return

    switch (level) {
      case 'info':
        console.log(message)
        break
      case 'warn':
        console.warn(message)
        break
      case 'error':
        console.error(message)
        break
    }
  }

  return async function (app: AppLike) {
    if (!app) {
      throw new Error('Static auto-router plugin requires an application instance')
    }

    if (!app.$routes) {
      app.$routes = { publicRoutes: [], protectedRoutes: [], all: [] }
    }

    if (!app.$registeredRoutes) {
      app.$registeredRoutes = new Set()
    }

    const registeredRoutes: Set<string> = app.$registeredRoutes
    const tracker = new ForcePatternTracker()

    log('info', `🔄 Loading ${routes.length} static routes`)

    const routeLogLines: Array<{ path: string; method: string; line: string }> = []

    for (const { method, path: routePath, handler: rawHandler } of routes) {
      const normalizedMethod = method.toLowerCase()

      // Reject routes whose path uses the file-name [param] syntax — static routes
      // must be written in Express-style `:param` form directly.
      if (routePath.includes('[') || routePath.includes(']')) {
        try {
          validateRouteName(routePath)
        } catch (err) {
          log('error', `❌ Skip route ${routePath}: ${err instanceof Error ? err.message : String(err)}`)
          continue
        }
        log(
          'error',
          `❌ Skip route ${routePath}: use Express-style :param (e.g. '/users/:id') — file-name [param] syntax is not valid in static routes`
        )
        continue
      }

      const routeKey = `${normalizedMethod.toUpperCase()} ${normalizeParamNames(routePath)}`

      if (registeredRoutes.has(routeKey)) {
        log('error', `❌ Duplicate route: ${routeKey} — skipped`)
        continue
      }
      registeredRoutes.add(routeKey)

      let handler = rawHandler
      let routeMeta: { requiresAuth?: boolean } | undefined
      let routeMiddlewares: RouteMiddleware[] | undefined

      if (handler === undefined || handler === null) {
        log('error', `❌ Skip route ${routePath}: handler is null/undefined`)
        continue
      }

      if (isRouteConfig(handler)) {
        routeMeta = handler.meta
        routeMiddlewares = handler.middlewares
        handler = handler.handler
      } else if (typeof handler === 'function') {
        // handler is a plain function — no op needed
      } else if (typeof handler === 'object' && handler !== null && typeof (handler as Record<string, unknown>).handler === 'function') {
        const raw = handler as { handler: Function; meta?: { requiresAuth?: boolean }; middlewares?: RouteMiddleware[] }
        routeMeta = raw.meta
        routeMiddlewares = raw.middlewares
        handler = raw.handler
      } else {
        log('error', `❌ Skip route ${routePath}: invalid handler type (expected function or createHandler result)`)
        continue
      }

      const authResult = resolveAuth({
        routePath,
        method: normalizedMethod,
        routeMeta,
        defaultRequiresAuth,
        forcePublic,
        forceProtected,
      })

      tracker.addMatch(authResult.matchedPublicPattern, authResult.matchedProtectedPattern)

      if (routeMeta?.requiresAuth !== undefined) {
        if (authResult.matchedProtectedPattern) {
          tracker.addOverride(routePath, authResult.matchedProtectedPattern, 'forceProtected')
        } else if (authResult.matchedPublicPattern) {
          tracker.addOverride(routePath, authResult.matchedPublicPattern, 'forcePublic')
        }
      } else if (authResult.matchedPublicPattern && authResult.matchedProtectedPattern) {
        tracker.addConflict(routePath, authResult.matchedPublicPattern, authResult.matchedProtectedPattern)
      }

      const authMark = authResult.requiresAuth ? ' 🔒' : ''
      routeLogLines.push({
        path: routePath,
        method: normalizedMethod.toUpperCase(),
        line: `✅ ${normalizedMethod.toUpperCase().padEnd(7)} ${routePath}${authMark}`,
      })

      const routeInfo: RouteInfo = { method: normalizedMethod.toUpperCase(), path: routePath, requiresAuth: authResult.requiresAuth }
      if (routeMeta) {
        routeInfo.meta = routeMeta
      }
      app.$routes.all.push(routeInfo)
      if (authResult.requiresAuth) {
        app.$routes.protectedRoutes.push({ method: normalizedMethod.toUpperCase(), path: routePath })
      } else {
        app.$routes.publicRoutes.push({ method: normalizedMethod.toUpperCase(), path: routePath })
      }

      (app as Record<string, Function>)[normalizedMethod](routePath, ...(routeMiddlewares ?? []), handler)
    }

    routeLogLines.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
    for (const { line } of routeLogLines) {
      log('info', line)
    }

    tracker.logWarnings(log, forcePublic, forceProtected)

    log('info', `📋 Registered routes:`)
    if (app.$routes.all.length === 0) {
      log('warn', `⚠️  No routes registered!`)
    } else {
      log('info', `   Total: ${app.$routes.all.length}`)
      log('info', `   Public: ${app.$routes.publicRoutes.length}`)
      log('info', `   Protected: ${app.$routes.protectedRoutes.length}`)
    }
  }
}