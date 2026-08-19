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
type RouteHandler<TCtx = any, TRes = void> = [
    TRes
] extends [void] ? (ctx: TCtx) => Promise<any> | any : (req: TCtx, res: TRes) => Promise<any> | any;
/**
 * Route-level middleware type
 *
 * Follows the Koa-style `(ctx, next)` signature that Hoa uses for middleware,
 * so framework middleware like `@hoajs/zod`'s `zodValidator()` can be attached
 * to a single route via `createHandler`'s third argument.
 */
type RouteMiddleware<TCtx = any> = (ctx: TCtx, next: () => Promise<any> | any) => Promise<any> | any;
/**
 * Route metadata interface
 * Used to define additional properties of routes, such as permission authentication requirements
 */
interface RouteMeta {
    /**
     * Whether JWT authentication is required (default: false)
     * true: This interface requires a valid JWT token
     * false: This interface is public, no JWT authentication required
     */
    requiresAuth?: boolean;
    /** Route description */
    description?: string;
    /** Other custom metadata */
    [key: string]: unknown;
}
/** Route information interface */
interface RouteInfo {
    method: string;
    path: string;
    requiresAuth?: boolean;
    /** Route metadata provided via createHandler (summary, tags, description, etc.) */
    meta?: RouteMeta;
}
/** Application routes registry interface */
interface AppRoutesRegistry {
    publicRoutes: Array<{
        method: string;
        path: string;
    }>;
    protectedRoutes: Array<{
        method: string;
        path: string;
    }>;
    all: RouteInfo[];
}
/** Minimal application interface that auto-router attaches to. */
interface AppLike {
    $routes?: AppRoutesRegistry;
    $registeredRoutes?: Set<string>;
    [method: string]: unknown;
}
/**
 * Route handler configuration interface
 * Only supports return value of createHandler function
 */
interface RouteConfig<TCtx = any, TRes = void> {
    handler: RouteHandler<TCtx, TRes>;
    meta?: RouteMeta;
    /** Route-level middleware chain, registered before the handler */
    middlewares?: RouteMiddleware<TCtx>[];
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
declare function createHandler<TCtx = any, TRes = void>(handler: RouteHandler<TCtx, TRes>, meta?: RouteMeta, middlewares?: RouteMiddleware<TCtx>[]): RouteConfig<TCtx, TRes>;
/** Check if a value is a RouteConfig object created by createHandler(). */
declare function isRouteConfig(obj: unknown): obj is RouteConfig;

/**
 * Ignore-pattern helpers shared by the auto-router scanner and the
 * worker-manifest builder.
 *
 * Patterns are matched against each directory entry's basename — a file or
 * folder name. Each pattern can target files, folders, or both (`type`), so
 * `{ pattern: '^__', type: 'dir' }` skips `__`-prefixed folders at any depth
 * without touching `__`-prefixed files. A bare string / RegExp is shorthand
 * for `type: 'both'`.
 */
type IgnoreTarget = 'file' | 'dir' | 'both';
interface IgnorePatternEntry {
    /** Regex source string or RegExp instance, matched against the entry name. */
    pattern: string | RegExp;
    /** Which entry kinds this pattern applies to. Defaults to 'both'. */
    type?: IgnoreTarget;
}
type IgnorePattern = string | RegExp | IgnorePatternEntry;

/** Single auto-router configuration options. */
interface AutoRouterOptions {
    dir?: string;
    prefix?: string | string[];
    defaultRequiresAuth?: boolean;
    strict?: boolean;
    logging?: boolean;
    forcePublic?: string[];
    forceProtected?: string[];
    ignore?: IgnorePattern[];
    onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
}
/**
 * Auto router plugin - factory function
 *
 * Supports both single configuration and merged configuration (array)
 *
 * Options:
 *   - dir: Controller directory path (default: './controllers')
 *   - prefix: API route prefix, supports string or array (default: '/api')
 *   - defaultRequiresAuth: Global default permission requirement (default: false)
 *     false: All interfaces are public by default, unless explicitly set requiresAuth: true
 *     true: All interfaces are protected by default, unless explicitly set requiresAuth: false
 *   - forcePublic: Routes always treated as public, regardless of defaultRequiresAuth
 *     Supports exact paths (with or without prefix) and wildcard suffix /*
 *     Priority: createHandler explicit meta > forceProtected/forcePublic > defaultRequiresAuth
 *   - forceProtected: Routes always treated as protected, regardless of defaultRequiresAuth
 *     Same pattern rules as forcePublic
 *     When a route matches both forcePublic and forceProtected, forceProtected wins
 *   - strict: Strict mode (default: true)
 *     true: Only allow pure function and createHandler export methods
 *     false: Allow ordinary object { handler, meta } export method, but will show warning
 *   - logging: Whether to output route registration logs (default: true)
 *   - ignore: File/folder names to skip during scanning, matched as regex
 *     patterns against each entry's basename (e.g. '^__' skips `__`-prefixed
 *     files AND folders at any depth). Accepts regex strings, RegExp instances,
 *     or { pattern, type: 'file' | 'dir' | 'both' } objects to scope a pattern
 *     to files, folders, or both (a bare string / RegExp means both).
 *   - onLog: Custom logging callback for integration with own logging systems
 *
 * Usage:
 *   // Single configuration
 *   app.extend(autoRouter({ dir: './controllers' }))
 *
 *   // Multiple prefixes
 *   app.extend(autoRouter({ dir: './controllers', prefix: ['/api', '/v1'] }))
 *
 *   // Merged configuration
 *   app.extend(autoRouter([
 *     { dir: './controllers/admin', prefix: '/api/admin', defaultRequiresAuth: false },
 *     { dir: './controllers/client', prefix: '/api/client', defaultRequiresAuth: true }
 *   ]))
 */
declare function autoRouter(options?: AutoRouterOptions | AutoRouterOptions[]): (app: AppLike) => Promise<void>;

/** Static route entry — callers statically import handlers and declare method/path. */
interface StaticRoute {
    /** HTTP method, e.g. 'get', 'post', 'put', 'delete', 'patch'. */
    method: string;
    /** Full route path, e.g. '/api/v1/auth/login'. */
    path: string;
    /** Route handler function or createHandler return value. */
    handler: unknown;
}
/** staticAutoRouter configuration. */
interface StaticAutoRouterOptions {
    /** Static route list. */
    routes: StaticRoute[];
    /** Global default auth requirement. */
    defaultRequiresAuth?: boolean;
    /** Routes forced public. */
    forcePublic?: string[];
    /** Routes forced protected. */
    forceProtected?: string[];
    /** Whether to print registration logs. */
    logging?: boolean;
    /** Custom log sink. */
    onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
}
/** Static router plugin for runtimes without filesystem access. */
declare function staticAutoRouter(options: StaticAutoRouterOptions): (app: AppLike) => Promise<void>;

export { autoRouter, createHandler, isRouteConfig, staticAutoRouter };
export type { AppLike, AppRoutesRegistry, AutoRouterOptions, IgnorePattern, IgnorePatternEntry, IgnoreTarget, RouteConfig, RouteHandler, RouteInfo, RouteMeta, RouteMiddleware, StaticAutoRouterOptions, StaticRoute };
