import { isRouteConfig } from './handler';
const HTTP_METHODS_UPPER = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
function matchesFilter(routePath, routeMethod, pattern) {
    let patternMethod;
    let pathPattern = pattern;
    const spaceIndex = pattern.indexOf(' ');
    if (spaceIndex !== -1) {
        const maybeMethod = pattern.slice(0, spaceIndex).toUpperCase();
        if (HTTP_METHODS_UPPER.includes(maybeMethod)) {
            patternMethod = maybeMethod;
            pathPattern = pattern.slice(spaceIndex + 1);
        }
    }
    if (patternMethod && patternMethod !== routeMethod.toUpperCase()) {
        return false;
    }
    const isWildcard = pathPattern.endsWith('/*');
    const basePattern = isWildcard ? pathPattern.slice(0, -2) : pathPattern;
    if (isWildcard) {
        return routePath.startsWith(basePattern + '/');
    }
    return routePath === basePattern;
}
function resolveAuth(options) {
    const { routePath, method, routeMeta, defaultRequiresAuth, forcePublic, forceProtected } = options;
    const matchedPublicPattern = forcePublic?.find((pattern) => matchesFilter(routePath, method, pattern));
    const matchedProtectedPattern = forceProtected?.find((pattern) => matchesFilter(routePath, method, pattern));
    if (routeMeta?.requiresAuth !== undefined) {
        return { requiresAuth: routeMeta.requiresAuth, matchedPublicPattern, matchedProtectedPattern };
    }
    if (matchedProtectedPattern) {
        return { requiresAuth: true, matchedPublicPattern, matchedProtectedPattern };
    }
    if (matchedPublicPattern) {
        return { requiresAuth: false, matchedPublicPattern, matchedProtectedPattern };
    }
    return { requiresAuth: defaultRequiresAuth, matchedPublicPattern, matchedProtectedPattern };
}
/** Static router plugin for runtimes without filesystem access. */
export function staticAutoRouter(options) {
    const { routes, defaultRequiresAuth = false, forcePublic, forceProtected, logging = true, onLog, } = options;
    const log = (level, message) => {
        if (onLog) {
            onLog(level, message);
            return;
        }
        if (!logging)
            return;
        if (level === 'info')
            console.log(message);
        else if (level === 'warn')
            console.warn(message);
        else
            console.error(message);
    };
    return async function (app) {
        if (!app) {
            throw new Error('Static auto-router plugin requires an application instance');
        }
        if (!app.$routes) {
            app.$routes = { publicRoutes: [], protectedRoutes: [], all: [] };
        }
        if (!app.$registeredRoutes) {
            app.$registeredRoutes = new Set();
        }
        const registeredRoutes = app.$registeredRoutes;
        const matchedForcePublicPatterns = new Set();
        const matchedForceProtectedPatterns = new Set();
        const overriddenByMeta = [];
        const conflictRoutes = [];
        log('info', `🔄 Loading ${routes.length} static routes`);
        for (const { method, path: routePath, handler: rawHandler } of routes) {
            const normalizedMethod = method.toLowerCase();
            const routeKey = `${normalizedMethod.toUpperCase()} ${routePath}`;
            if (registeredRoutes.has(routeKey)) {
                log('error', `❌ Duplicate route: ${routeKey} — skipped`);
                continue;
            }
            registeredRoutes.add(routeKey);
            let handler = rawHandler;
            let routeMeta;
            if (handler === undefined || handler === null) {
                log('error', `❌ Skip route ${routePath}: handler is null/undefined`);
                continue;
            }
            if (isRouteConfig(handler)) {
                routeMeta = handler.meta;
                handler = handler.handler;
            }
            else if (typeof handler === 'function') {
            }
            else if (typeof handler === 'object' && handler !== null && typeof handler.handler === 'function') {
                routeMeta = handler.meta;
                handler = handler.handler;
            }
            else {
                log('error', `❌ Skip route ${routePath}: invalid handler type (expected function or createHandler result)`);
                continue;
            }
            const authResult = resolveAuth({
                routePath,
                method: normalizedMethod,
                routeMeta,
                defaultRequiresAuth,
                forcePublic,
                forceProtected,
            });
            if (authResult.matchedPublicPattern)
                matchedForcePublicPatterns.add(authResult.matchedPublicPattern);
            if (authResult.matchedProtectedPattern)
                matchedForceProtectedPatterns.add(authResult.matchedProtectedPattern);
            if (routeMeta?.requiresAuth !== undefined) {
                if (authResult.matchedProtectedPattern) {
                    overriddenByMeta.push({ route: routePath, pattern: authResult.matchedProtectedPattern, type: 'forceProtected' });
                }
                else if (authResult.matchedPublicPattern) {
                    overriddenByMeta.push({ route: routePath, pattern: authResult.matchedPublicPattern, type: 'forcePublic' });
                }
            }
            else if (authResult.matchedPublicPattern && authResult.matchedProtectedPattern) {
                conflictRoutes.push({
                    route: routePath,
                    publicPattern: authResult.matchedPublicPattern,
                    protectedPattern: authResult.matchedProtectedPattern,
                });
            }
            const authMark = authResult.requiresAuth ? ' 🔒' : '';
            log('info', `✅ ${normalizedMethod.toUpperCase().padEnd(7)} ${routePath}${authMark}`);
            const routeInfo = { method: normalizedMethod.toUpperCase(), path: routePath, requiresAuth: authResult.requiresAuth };
            if (routeMeta) {
                routeInfo.meta = routeMeta;
            }
            app.$routes.all.push(routeInfo);
            if (authResult.requiresAuth) {
                app.$routes.protectedRoutes.push({ method: normalizedMethod.toUpperCase(), path: routePath });
            }
            else {
                app.$routes.publicRoutes.push({ method: normalizedMethod.toUpperCase(), path: routePath });
            }
            app[normalizedMethod](routePath, handler);
        }
        for (const { route, publicPattern, protectedPattern } of conflictRoutes) {
            log('warn', `⚠️  Route "${route}" matched both forcePublic ("${publicPattern}") and forceProtected ("${protectedPattern}") — forceProtected wins`);
        }
        for (const { route, pattern, type } of overriddenByMeta) {
            log('warn', `⚠️  ${type} pattern "${pattern}" matched "${route}" but has no effect — route has explicit createHandler meta`);
        }
        if (forcePublic) {
            for (const pattern of forcePublic) {
                if (!matchedForcePublicPatterns.has(pattern)) {
                    log('warn', `⚠️  forcePublic pattern "${pattern}" did not match any registered route (check for typos or outdated config)`);
                }
            }
        }
        if (forceProtected) {
            for (const pattern of forceProtected) {
                if (!matchedForceProtectedPatterns.has(pattern)) {
                    log('warn', `⚠️  forceProtected pattern "${pattern}" did not match any registered route (check for typos or outdated config)`);
                }
            }
        }
        log('info', `📋 Registered routes:`);
        if (app.$routes.all.length === 0) {
            log('warn', `⚠️  No routes registered!`);
        }
        else {
            log('info', `   Total: ${app.$routes.all.length}`);
            log('info', `   Public: ${app.$routes.publicRoutes.length}`);
            log('info', `   Protected: ${app.$routes.protectedRoutes.length}`);
        }
    };
}
//# sourceMappingURL=static-router.js.map