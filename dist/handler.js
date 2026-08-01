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
export function createHandler(handler, meta, middlewares) {
    const config = {
        handler,
        // Normalize empty object {} to undefined so callers can safely use `if (config.meta)`
        meta: (meta && Object.keys(meta).length > 0) ? meta : undefined,
        // Normalize empty array [] to undefined so callers can safely use `if (config.middlewares)`
        middlewares: (middlewares && middlewares.length > 0) ? middlewares : undefined,
        __routeConfigBrand: true,
    };
    return config;
}
/** Check if a value is a RouteConfig object created by createHandler(). */
export function isRouteConfig(obj) {
    return !!(obj &&
        typeof obj === 'object' &&
        'handler' in obj &&
        typeof obj.handler === 'function' &&
        obj.__routeConfigBrand === true);
}
//# sourceMappingURL=handler.js.map