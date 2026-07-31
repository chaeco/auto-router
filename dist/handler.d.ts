/**
 * Route handler type
 * 路由处理器类型
 *
 * Supports both single-context and dual-parameter frameworks via two generic params.
 * 通过两个泛型参数同时支持单 context 框架和双参数框架。
 *
 * - Single-context (default, TRes = void): (ctx: TCtx) => any
 *   适用于：Hoa、Koa、Fastify 等单 context 框架
 * - Dual-parameter (TRes provided): (req: TCtx, res: TRes) => any
 *   适用于：Express 等 (req, res) 双参数框架
 *
 * @example Hoa / Koa style:    RouteHandler<HoaContext>
 * @example Express style:      RouteHandler<express.Request, express.Response>
 * @example Fastify style:      RouteHandler<FastifyRequest>
 * @example Generic (any):      RouteHandler  (default TCtx = any, TRes = void)
 */
export type RouteHandler<TCtx = any, TRes = void> = [
    TRes
] extends [void] ? (ctx: TCtx) => Promise<any> | any : (req: TCtx, res: TRes) => Promise<any> | any;
/**
 * Route-level middleware type
 * 路由级中间件类型
 *
 * Follows the Koa-style `(ctx, next)` signature that Hoa uses for middleware,
 * so framework middleware like `@hoajs/zod`'s `zodValidator()` can be attached
 * to a single route via `createHandler`'s third argument.
 * 采用 Hoa / Koa 风格 `(ctx, next)` 签名，使框架中间件（如 `@hoajs/zod` 的 `zodValidator()`）
 * 可以通过 `createHandler` 的第三参数挂载到单条路由上。
 */
export type RouteMiddleware<TCtx = any> = (ctx: TCtx, next: () => Promise<any> | any) => Promise<any> | any;
/**
 * Route metadata interface
 * 路由元数据接口
 * Used to define additional properties of routes, such as permission authentication requirements
 * 用于定义路由的额外属性，如权限认证要求
 */
export interface RouteMeta {
    /**
     * Whether JWT authentication is required (default: false)
     * 是否需要 JWT 认证（默认：false）
     * true: This interface requires a valid JWT token
     * true: 该接口需要提供有效的 JWT token
     * false: This interface is public, no JWT authentication required
     * false: 该接口是公开的，无需 JWT 认证
     */
    requiresAuth?: boolean;
    /**
     * Route description
     * 路由描述
     */
    description?: string;
    /**
     * Other custom metadata
     * 其他自定义元数据
     */
    [key: string]: unknown;
}
/**
 * Route information interface
 * 路由信息接口
 */
export interface RouteInfo {
    method: string;
    path: string;
    requiresAuth?: boolean;
    /** Route metadata provided via createHandler (summary, tags, description, etc.) */
    meta?: RouteMeta;
}
/**
 * Application routes registry interface
 * 应用路由注册表接口
 */
export interface AppRoutesRegistry {
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
/**
 * Route handler configuration interface
 * 路由处理器配置接口
 * Only supports return value of createHandler function
 * 仅支持 createHandler 函数返回值
 */
export interface RouteConfig<TCtx = any, TRes = void> {
    /**
     * Route handler function
     * 路由处理器函数
     */
    handler: RouteHandler<TCtx, TRes>;
    /**
     * Route metadata
     * 路由元数据
     */
    meta?: RouteMeta;
    /**
     * Route-level middleware chain, registered before the handler
     * 路由级中间件链，注册在 handler 之前
     * e.g. `zodValidator` from `@hoajs/zod`, `auth` middleware, etc.
     * 例如 `@hoajs/zod` 的 `zodValidator`、鉴权中间件等
     */
    middlewares?: RouteMiddleware<TCtx>[];
}
/**
 * Export convenient tool, only supports two usage patterns:
 * 导出便捷工具，仅支持两种用法：
 *
 * Usage 1: Pure function (recommended for most routes)
 * 用法 1：纯函数（推荐大多数路由）
 *    export default async (ctx) => {
 *      ctx.body = { success: true }
 *    }
 *
 * Usage 2: createHandler wrapper (for routes that need metadata)
 * 用法 2：createHandler 包装（需要元数据的路由）
 *    export default createHandler(async (ctx) => {
 *      ctx.body = { success: true }
 *    }, { requiresAuth: true })
 *
 * Usage 3: createHandler with route-level middlewares (e.g. @hoajs/zod)
 * 用法 3：createHandler + 路由级中间件（如 @hoajs/zod）
 *    export default createHandler(
 *      async (ctx) => {
 *        ctx.body = { success: true }
 *      },
 *      { requiresAuth: true },
 *      [zodValidator({ body: LoginSchema })]
 *    )
 */
export declare function createHandler<TCtx = any, TRes = void>(handler: RouteHandler<TCtx, TRes>, meta?: RouteMeta, middlewares?: RouteMiddleware<TCtx>[]): RouteConfig<TCtx, TRes>;
/**
 * Check if it's a route configuration object
 * 检查是否为路由配置对象
 * Must be an object returned by createHandler(), not a plain object
 * 必须是 createHandler() 返回的对象，而不是普通对象
 */
export declare function isRouteConfig(obj: unknown): obj is RouteConfig;
//# sourceMappingURL=handler.d.ts.map