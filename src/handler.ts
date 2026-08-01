/**
 * Route handler type
 *
 * Supports both single-context and dual-parameter frameworks via two generic params.
 *
 * - Single-context (default, TRes = void): (ctx: TCtx) => any
 *  适用于：Hoa、Koa、Fastify 等单 context 框架
 * - Dual-parameter (TRes provided): (req: TCtx, res: TRes) => any
 *  适用于：Express 等 (req, res) 双参数框架
 *
 * @example Hoa / Koa style:    RouteHandler<HoaContext>
 * @example Express style:      RouteHandler<express.Request, express.Response>
 * @example Fastify style:      RouteHandler<FastifyRequest>
 * @example Generic (any):      RouteHandler  (default TCtx = any, TRes = void)
 */
export type RouteHandler<TCtx = any, TRes = void> =
  [TRes] extends [void]
  ? (ctx: TCtx) => Promise<any> | any
  : (req: TCtx, res: TRes) => Promise<any> | any

/**
 * Route-level middleware type
 *
 * Follows the Koa-style `(ctx, next)` signature that Hoa uses for middleware,
 * so framework middleware like `@hoajs/zod`'s `zodValidator()` can be attached
 * to a single route via `createHandler`'s third argument.
 */
export type RouteMiddleware<TCtx = any> = (ctx: TCtx, next: () => Promise<any> | any) => Promise<any> | any

/**
 * Route metadata interface
 * Used to define additional properties of routes, such as permission authentication requirements
 */
export interface RouteMeta {
  /**
   * Whether JWT authentication is required (default: false)
   * true: This interface requires a valid JWT token
   * false: This interface is public, no JWT authentication required
   */
  requiresAuth?: boolean

  /** Route description */
  description?: string

  /** Other custom metadata */
  [key: string]: unknown
}

/** Route information interface */
export interface RouteInfo {
  method: string
  path: string
  requiresAuth?: boolean
  /** Route metadata provided via createHandler (summary, tags, description, etc.) */
  meta?: RouteMeta
}

/** Application routes registry interface */
export interface AppRoutesRegistry {
  publicRoutes: Array<{ method: string; path: string }>
  protectedRoutes: Array<{ method: string; path: string }>
  all: RouteInfo[]
}

/** Minimal application interface that auto-router attaches to. */
export interface AppLike {
  $routes?: AppRoutesRegistry
  $registeredRoutes?: Set<string>
  [method: string]: unknown
}

/**
 * Route handler configuration interface
 * Only supports return value of createHandler function
 */
export interface RouteConfig<TCtx = any, TRes = void> {
  handler: RouteHandler<TCtx, TRes>
  meta?: RouteMeta
  /** Route-level middleware chain, registered before the handler */
  middlewares?: RouteMiddleware<TCtx>[]
}

/**
 * Create a route configuration with optional metadata and middleware.
 *
 * Supports three usage patterns:
 * 1. Pure function (recommended for most routes):
 *    export default async (ctx) => { ctx.body = { success: true } }
 *
 * 2. createHandler wrapper (for routes that need metadata):
 *    export default createHandler(async (ctx) => { ... }, { requiresAuth: true })
 *
 * 3. createHandler with route-level middlewares (e.g. @hoajs/zod):
 *    export default createHandler(async (ctx) => { ... }, { requiresAuth: true }, [zodValidator(...)])
 */
export function createHandler<TCtx = any, TRes = void>(
  handler: RouteHandler<TCtx, TRes>,
  meta?: RouteMeta,
  middlewares?: RouteMiddleware<TCtx>[]
): RouteConfig<TCtx, TRes> {
  const config: RouteConfig<TCtx, TRes> & { __routeConfigBrand: true } = {
    handler,
    // Normalize empty object {} to undefined so callers can safely use `if (config.meta)`
    meta: (meta && Object.keys(meta).length > 0) ? meta : undefined,
    // Normalize empty array [] to undefined so callers can safely use `if (config.middlewares)`
    middlewares: (middlewares && middlewares.length > 0) ? middlewares : undefined,
    __routeConfigBrand: true,
  }
  return config
}

/** Check if a value is a RouteConfig object created by createHandler(). */
export function isRouteConfig(obj: unknown): obj is RouteConfig {
  return !!(
    obj &&
    typeof obj === 'object' &&
    'handler' in obj &&
    typeof (obj as Record<string, unknown>).handler === 'function' &&
    (obj as Record<string, unknown>).__routeConfigBrand === true
  )
}