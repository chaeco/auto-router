import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { isRouteConfig } from './handler.js';
import { validateFileName, isHttpMethodKeyword } from './validation.js';
import { resolveAuth, ForcePatternTracker } from './auth-resolver.js';
import { parseRouteName, parseDirectorySegment, normalizeParamNames } from './parse-route.js';
function createLogger(onLog, logging) {
    return (level, message) => {
        if (onLog) {
            onLog(level, message);
            return;
        }
        if (!logging)
            return;
        switch (level) {
            case 'info':
                console.log(message);
                break;
            case 'warn':
                console.warn(message);
                break;
            case 'error':
                console.error(message);
                break;
        }
    };
}
export async function loadRoutes(app, options) {
    const { dir, prefix, defaultRequiresAuth, strict, forcePublic, forceProtected } = options;
    const log = createLogger(options.onLog, options.logging);
    const tracker = new ForcePatternTracker();
    const importPromises = [];
    const routeLogLines = [];
    if (!app.$routes) {
        app.$routes = {
            publicRoutes: [],
            protectedRoutes: [],
            all: [],
        };
    }
    if (!app.$registeredRoutes) {
        app.$registeredRoutes = new Set();
    }
    const registeredRoutes = app.$registeredRoutes;
    function scanDirectory(dirPath, basePath = '') {
        const files = readdirSync(dirPath);
        for (const file of files) {
            const filePath = join(dirPath, file);
            let fileStat;
            try {
                fileStat = statSync(filePath);
            }
            catch (err) {
                log('warn', `⚠️  Skip entry (stat failed): ${filePath}`);
                log('warn', `   ⚠️  ${err instanceof Error ? err.message : String(err)}`);
                continue;
            }
            if (fileStat.isDirectory()) {
                if (isHttpMethodKeyword(file)) {
                    log('warn', `⚠️  Warning: Directory name "${file}" is an HTTP method keyword, consider renaming`);
                }
                let dirSegment;
                try {
                    dirSegment = parseDirectorySegment(file);
                }
                catch (err) {
                    log('error', `❌ Skip directory: ${filePath}`);
                    log('error', `   ❌ ${err instanceof Error ? err.message : String(err)}`);
                    continue;
                }
                try {
                    scanDirectory(filePath, basePath ? `${basePath}/${dirSegment}` : `/${dirSegment}`);
                }
                catch (err) {
                    log('warn', `⚠️  Skip directory (scan failed): ${filePath}`);
                    log('warn', `   ⚠️  ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            else if ((file.endsWith('.ts') && !file.endsWith('.d.ts')) || file.endsWith('.js')) {
                const validation = validateFileName(file);
                if (!validation.valid) {
                    log('error', `❌ Skip file: ${filePath}`);
                    log('error', `   ❌ ${validation.error}`);
                    continue;
                }
                const method = validation.method;
                const nameWithoutExt = file.replace(/\.(ts|js)$/, '');
                let routeName = '';
                if (nameWithoutExt !== method) {
                    routeName = nameWithoutExt.substring(method.length + 1);
                }
                routeName = parseRouteName(routeName);
                let fullPath;
                if (routeName) {
                    fullPath = basePath ? `${basePath}/${routeName}` : `/${routeName}`;
                }
                else {
                    fullPath = basePath;
                }
                fullPath = fullPath.replace(/\/+/g, '/');
                // Detect duplicate routes — param-name casing is folded for the key,
                // so `get-[userId].ts` and `get-[UserID].ts` are treated as the same route.
                const routePath = prefix
                    ? `${prefix}${fullPath}`.replace(/\/+/g, '/')
                    : fullPath;
                const routeKey = `${method.toUpperCase()} ${normalizeParamNames(routePath)}`;
                if (registeredRoutes.has(routeKey)) {
                    log('error', `❌ Skip file: ${filePath}`);
                    log('error', `   ❌ Duplicate route: ${routeKey}`);
                    continue;
                }
                registeredRoutes.add(routeKey);
                const absolutePath = resolve(filePath);
                const fileUrl = pathToFileURL(absolutePath).href;
                const importPromise = (async () => {
                    try {
                        const module = await import(fileUrl);
                        let handler = module.default;
                        let routeMeta;
                        let middlewares;
                        if (handler === undefined || handler === null) {
                            return;
                        }
                        if (!handler) {
                            log('error', `❌ Failed to load route: ${filePath}`);
                            log('error', `   ❌ Default export is a falsy non-null value (${JSON.stringify(handler)}), expected a function or createHandler result`);
                            return;
                        }
                        if (strict && typeof handler !== 'function' && !isRouteConfig(handler)) {
                            log('error', `❌ Failed to load route: ${filePath}`);
                            log('error', `   ❌ In strict mode, only functions or createHandler results are allowed`);
                            log('error', `   ❌ Current export type: ${typeof handler}`);
                            log('error', `   ❌ Correct ways:`);
                            log('error', `      ✅ export default async (ctx) => { ... }`);
                            log('error', `      ✅ export default createHandler(async (ctx) => { ... }, meta)`);
                            log('error', `      ❌ Not supported: export default { handler, meta }`);
                            log('error', `      💡 Tip: You can set strict: false to disable strict checking`);
                            return;
                        }
                        const namedExports = Object.keys(module).filter(key => key !== 'default');
                        if (namedExports.length > 0) {
                            log('error', `❌ Failed to load route: ${filePath}`);
                            log('error', `   ❌ File can only have default export, named exports are not allowed`);
                            log('error', `   ❌ Detected named exports: ${namedExports.join(', ')}`);
                            return;
                        }
                        if (isRouteConfig(handler)) {
                            routeMeta = handler.meta;
                            middlewares = handler.middlewares;
                            handler = handler.handler;
                        }
                        else if (typeof handler === 'function') {
                            // routeMeta remains undefined, use global default
                        }
                        else if (typeof handler === 'object' && handler !== null) {
                            if (typeof handler.handler === 'function') {
                                log('warn', `⚠️  Warning: ${filePath}`);
                                log('warn', `   ⚠️  Detected non-recommended export method (non-strict mode)`);
                                routeMeta = handler.meta;
                                middlewares = handler.middlewares;
                                handler = handler.handler;
                            }
                            else {
                                log('error', `❌ Failed to load route: ${filePath}`);
                                log('error', `   ❌ Exported object must contain handler function`);
                                return;
                            }
                        }
                        else {
                            const handlerType = typeof handler;
                            log('error', `❌ Failed to load route: ${filePath}`);
                            log('error', `   ❌ Unsupported export type: ${handlerType}`);
                            log('error', `   ❌ Only the following ways are allowed:`);
                            log('error', `      ✅ export default async (ctx) => { ... }`);
                            log('error', `      ✅ export default createHandler(async (ctx) => { ... }, meta)`);
                            return;
                        }
                        const authResult = resolveAuth({
                            routePath,
                            method,
                            routeMeta,
                            defaultRequiresAuth,
                            forcePublic,
                            forceProtected,
                            prefix,
                        });
                        tracker.addMatch(authResult.matchedPublicPattern, authResult.matchedProtectedPattern);
                        if (authResult.matchedPublicPattern && authResult.matchedProtectedPattern) {
                            tracker.addConflict(routePath, authResult.matchedPublicPattern, authResult.matchedProtectedPattern);
                        }
                        if (routeMeta?.requiresAuth !== undefined) {
                            if (authResult.matchedProtectedPattern) {
                                tracker.addOverride(routePath, authResult.matchedProtectedPattern, 'forceProtected');
                            }
                            else if (authResult.matchedPublicPattern) {
                                tracker.addOverride(routePath, authResult.matchedPublicPattern, 'forcePublic');
                            }
                        }
                        const requiresAuth = authResult.requiresAuth;
                        const authMark = requiresAuth ? ' 🔒' : '';
                        routeLogLines.push({
                            path: routePath,
                            method: method.toUpperCase(),
                            line: `✅ ${method.toUpperCase().padEnd(7)} ${routePath}${authMark}`,
                        });
                        const routeInfo = { method: method.toUpperCase(), path: routePath, requiresAuth };
                        if (routeMeta) {
                            routeInfo.meta = routeMeta;
                        }
                        app.$routes.all.push(routeInfo);
                        if (requiresAuth) {
                            app.$routes.protectedRoutes.push({ method: method.toUpperCase(), path: routePath });
                        }
                        else {
                            app.$routes.publicRoutes.push({ method: method.toUpperCase(), path: routePath });
                        }
                        app[method](routePath, ...(middlewares ?? []), handler);
                    }
                    catch (err) {
                        log('error', `❌ Failed to load route: ${filePath}`);
                        log('error', `   ❌ ${err instanceof Error ? err.message : String(err)}`);
                    }
                })();
                importPromises.push(importPromise);
            }
        }
    }
    log('info', `🔄 Scanning controller directory: ${dir}`);
    const fullDir = resolve(dir);
    try {
        scanDirectory(fullDir);
    }
    catch (err) {
        log('error', `❌ Failed to scan directory: ${fullDir}`);
        log('error', `   ❌ ${err instanceof Error ? err.message : String(err)}`);
        return;
    }
    await Promise.all(importPromises);
    routeLogLines.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    for (const { line } of routeLogLines) {
        log('info', line);
    }
    tracker.logWarnings(log, forcePublic, forceProtected);
    log('info', `📋 Registered routes:`);
    if (app.$routes.all.length === 0) {
        log('warn', `⚠️  No routes registered!`);
    }
    else {
        log('info', `   Total: ${app.$routes.all.length}`);
        log('info', `   Public: ${app.$routes.publicRoutes.length}`);
        log('info', `   Protected: ${app.$routes.protectedRoutes.length}`);
    }
}
//# sourceMappingURL=load-routes.js.map