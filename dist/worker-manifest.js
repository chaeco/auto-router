import { isRouteConfig } from './handler.js';
import { normalizeParamNames } from './parse-route.js';
function matchRoute(pattern, pathname) {
    const patternSegs = pattern.split('/').filter(Boolean);
    const pathSegs = pathname.split('/').filter(Boolean);
    if (patternSegs.length !== pathSegs.length)
        return null;
    const params = {};
    for (let i = 0; i < patternSegs.length; i++) {
        const ps = patternSegs[i];
        const vs = pathSegs[i];
        if (ps.startsWith(':')) {
            // decodeURIComponent can throw URIError on malformed sequences
            // Return null (no match) instead of crashing the entire request
            try {
                params[ps.slice(1)] = decodeURIComponent(vs);
            }
            catch {
                return null;
            }
        }
        else if (ps !== vs) {
            return null;
        }
    }
    return { params };
}
export function createWorkerRouter(options) {
    const { routes, notFound, onError } = options;
    // Unwrap createHandler results once at construction time, and normalize
    // parameter names to lowercase so `:UserId` and `:userId` are the same
    // param — keeps ctx.params keys consistent across hand-written patterns.
    // 构造时解包 createHandler 结果，并将参数名归一化为小写，使 `:UserId` 与
    // `:userId` 视为同一参数——保证手写 pattern 的 ctx.params 键名一致。
    const resolved = routes.map(route => {
        let handler = route.handler;
        let middlewares = route.middlewares;
        if (isRouteConfig(handler)) {
            // createHandler middlewares run before route-level middlewares
            // createHandler 中间件先于路由级中间件执行
            middlewares = (handler.middlewares ?? []).concat(route.middlewares ?? []);
            handler = handler.handler;
        }
        return { pattern: normalizeParamNames(route.pattern), method: route.method.toUpperCase(), handler, middlewares };
    });
    return {
        async fetch(req, env, ctx) {
            const url = new URL(req.url);
            const pathname = url.pathname;
            let matched = null;
            for (const route of resolved) {
                if (route.method !== req.method.toUpperCase())
                    continue;
                const result = matchRoute(route.pattern, pathname);
                if (result) {
                    matched = { handler: route.handler, middlewares: route.middlewares, params: result.params };
                    break;
                }
            }
            if (!matched) {
                if (notFound)
                    return notFound(req, env, ctx);
                return new Response('Not Found', { status: 404 });
            }
            const routeCtx = {
                req,
                env,
                ctx,
                params: matched.params,
                res: { status: 200, headers: {}, body: null },
            };
            let result;
            try {
                // Runtime validation: handler must be a function
                // (generateManifest guarantees this for CLI-generated manifests,
                // but hand-written manifests or dynamic routes may violate this)
                if (typeof matched.handler !== 'function') {
                    throw new TypeError(`Handler for ${req.method} ${pathname} is not a function (got ${typeof matched.handler})`);
                }
                const middlewares = matched.middlewares ?? [];
                for (const middleware of middlewares) {
                    if (typeof middleware !== 'function') {
                        throw new TypeError(`Middleware for ${req.method} ${pathname} is not a function (got ${typeof middleware})`);
                    }
                }
                // Koa-style chain: each middleware receives (ctx, next); the last next
                // invokes the route handler. A middleware that short-circuits (no next
                // call, e.g. zodValidator on a 400) stops the chain without the handler.
                // Koa 风格中间件链：每个中间件接收 (ctx, next)，最后的 next 调用路由 handler；
                // 短路中间件（不调用 next，如 zodValidator 校验失败时）会终止链路，不再执行 handler。
                const dispatch = async (i) => {
                    if (i === middlewares.length) {
                        return matched.handler(routeCtx);
                    }
                    const middleware = middlewares[i];
                    return middleware(routeCtx, () => dispatch(i + 1));
                };
                result = await dispatch(0);
                // Response serialization precedence
                if (result instanceof Response)
                    return result;
                if (result !== undefined && result !== null) {
                    // JSON.stringify can throw on circular references, BigInt, etc.
                    // We catch it here to route through onError
                    let jsonString;
                    try {
                        jsonString = JSON.stringify(result);
                    }
                    catch (stringifyErr) {
                        throw new TypeError(`Failed to serialize response as JSON: ${stringifyErr instanceof Error ? stringifyErr.message : String(stringifyErr)}`);
                    }
                    return new Response(jsonString, {
                        status: routeCtx.res.status,
                        headers: { 'Content-Type': 'application/json', ...routeCtx.res.headers },
                    });
                }
                return new Response(routeCtx.res.body, {
                    status: routeCtx.res.status,
                    headers: routeCtx.res.headers,
                });
            }
            catch (err) {
                if (onError)
                    return onError(err, req, env, ctx);
                return new Response('Internal Server Error', { status: 500 });
            }
        },
    };
}
//# sourceMappingURL=worker-manifest.js.map