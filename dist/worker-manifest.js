import { isRouteConfig } from './handler.js';
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
            params[ps.slice(1)] = decodeURIComponent(vs);
        }
        else if (ps !== vs) {
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
        if (isRouteConfig(handler)) {
            handler = handler.handler;
        }
        return { pattern: route.pattern, method: route.method.toUpperCase(), handler };
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
                    matched = { handler: route.handler, params: result.params };
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
                result = await matched.handler(routeCtx);
            }
            catch (err) {
                if (onError)
                    return onError(err, req, env, ctx);
                return new Response('Internal Server Error', { status: 500 });
            }
            // Response serialization precedence
            if (result instanceof Response)
                return result;
            if (result !== undefined && result !== null) {
                return new Response(JSON.stringify(result), {
                    status: routeCtx.res.status,
                    headers: { 'Content-Type': 'application/json', ...routeCtx.res.headers },
                });
            }
            return new Response(routeCtx.res.body, {
                status: routeCtx.res.status,
                headers: routeCtx.res.headers,
            });
        },
    };
}
//# sourceMappingURL=worker-manifest.js.map