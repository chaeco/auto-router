// Worker 兼容：基于静态清单的路由分发
// 在构建阶段生成 manifest，运行时只做查找与调用
export function createWorkerRouter(options) {
    const { routes, notFound, onError } = options;
    const sortedRoutes = [...routes].sort((a, b) => {
        const aw = a.pattern.includes(':') ? 1 : 0;
        const bw = b.pattern.includes(':') ? 1 : 0;
        return aw - bw;
    });
    return {
        fetch: async (req, env, ctx) => {
            try {
                const url = new URL(req.url);
                const method = req.method.toUpperCase();
                const pathname = url.pathname;
                const matched = findRoute(sortedRoutes, method, pathname);
                if (!matched) {
                    if (notFound) {
                        return await notFound(createWorkerContext(req, env, ctx, {}));
                    }
                    return new Response('Not Found', { status: 404 });
                }
                const { route, params } = matched;
                const result = await route.handler(createWorkerContext(req, env, ctx, params));
                return normalizeWorkerResponse(result);
            }
            catch (err) {
                if (onError) {
                    return await onError(err, req);
                }
                console.error('Worker route error:', err);
                return new Response('Internal Server Error', { status: 500 });
            }
        },
    };
}
function findRoute(routes, method, pathname) {
    for (const route of routes) {
        if (route.method !== method)
            continue;
        const params = matchPattern(route.pattern, pathname);
        if (params) {
            return { route, params };
        }
    }
    return null;
}
function matchPattern(pattern, pathname) {
    const patternSegments = pattern.split('/').filter(Boolean);
    const pathnameSegments = pathname.split('/').filter(Boolean);
    if (patternSegments.length !== pathnameSegments.length)
        return null;
    const params = {};
    for (let i = 0; i < patternSegments.length; i++) {
        const ps = patternSegments[i];
        const vs = pathnameSegments[i];
        if (ps.startsWith(':')) {
            params[ps.slice(1)] = vs;
        }
        else if (ps !== vs) {
            return null;
        }
    }
    return params;
}
function createWorkerContext(req, env, ctx, params) {
    return {
        req,
        env,
        ctx,
        params,
        res: {
            status: 200,
            headers: new Headers(),
            body: undefined,
        },
    };
}
function normalizeWorkerResponse(result) {
    if (result instanceof Response)
        return result;
    const body = result === undefined ? null : result;
    return Response.json(body);
}
//# sourceMappingURL=worker-manifest.js.map