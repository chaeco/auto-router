import { isRouteConfig } from './handler.js';
function matchRoute(pattern, pathname) {
    const patternSegments = pattern.split('/').filter(Boolean);
    const pathSegments = pathname.split('/').filter(Boolean);
    if (patternSegments.length !== pathSegments.length)
        return null;
    const params = {};
    for (let i = 0; i < patternSegments.length; i++) {
        const patternSegment = patternSegments[i];
        const valueSegment = pathSegments[i];
        if (patternSegment.startsWith(':')) {
            // decodeURIComponent can throw URIError on malformed sequences
            // Return null (no match) instead of crashing the entire request
            try {
                params[patternSegment.slice(1)] = decodeURIComponent(valueSegment);
            }
            catch {
                return null;
            }
        }
        else if (patternSegment !== valueSegment) {
            return null;
        }
    }
    return { params };
}
export function createWorkerRouter(options) {
    const { routes, notFound, onError } = options;
    // Unwrap createHandler results once at construction time
    const resolved = routes.map(route => {
        let handler = route.handler;
        let middlewares = route.middlewares;
        if (isRouteConfig(handler)) {
            // createHandler middlewares run before route-level middlewares
            middlewares = (handler.middlewares ?? []).concat(route.middlewares ?? []);
            handler = handler.handler;
        }
        return { pattern: route.pattern, method: route.method.toUpperCase(), handler, middlewares };
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
                // invokes the route handler. A short-circuiting middleware (no next call)
                // stops the chain without the handler.
                const dispatch = async (i) => {
                    if (i === middlewares.length) {
                        return matched.handler(routeCtx);
                    }
                    const middleware = middlewares[i];
                    return middleware(routeCtx, () => dispatch(i + 1));
                };
                result = await dispatch(0);
                if (result instanceof Response)
                    return result;
                if (result !== undefined && result !== null) {
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