import { readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { pathToFileURL } from 'url';

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
function createHandler(handler, meta, middlewares) {
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
function isRouteConfig(obj) {
    return !!(obj &&
        typeof obj === 'object' &&
        'handler' in obj &&
        typeof obj.handler === 'function' &&
        obj.__routeConfigBrand === true);
}

/** Shared HTTP method constants. */
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

/**
 * Route-name validation and conversion.
 *
 * Parameter names keep their original casing — `[userId]` registers as
 * `:userId` and `ctx.params.userId` reads the same way a hand-written
 * Express route would. Duplicate detection is case-insensitive on param
 * names via `normalizeParamNames`, so `:UserId` and `:userid` are treated
 * as the same route.
 */
// Route-name grammar: the route name is a `-`-joined sequence of static
// text segments and `[param]` tokens, alternating. Static text may contain
// hyphens (as literal `-` joins and inside static names like `user-info`)
// but never brackets; params are single non-empty `[param]` tokens.
const SEGMENT = '([^\\[\\]]+|\\[[^\\[\\]]+\\])';
const ROUTE_NAME_PATTERN = new RegExp(`^${SEGMENT}(-${SEGMENT})*$`);
// A directory segment is either pure static text or a single whole-segment
// `[param]` — a param must span the entire segment, never glue to static text.
const DIR_PARAM_PATTERN = /^\[[^\[\]\s]+\]$/;
// ASCII-only content for parameter names — `\w` in JS would otherwise let
// `[用户名]` slip through, so params must stay ASCII-safe in file names.
const ASCII_PARAM = /^[A-Za-z0-9_]+$/;
/** Extract every `[param]` token's content, or empty if the name has none. */
function paramTokens(name) {
    return (name.match(/\[([^\[\]]+)\]/g) ?? []).map((token) => token.slice(1, -1));
}
/**
 * Normalize a route pattern for duplicate detection — parameter names are
 * folded to lowercase so `:UserId` and `:userid` are treated as the same
 * route (they match the same URLs). The *registered* pattern keeps its
 * original casing; this is only used to build a comparison key.
 */
function normalizeParamNames(pattern) {
    return pattern
        .replace(/\[([^\]]+)\]/g, (_, name) => `[${name.toLowerCase()}]`)
        .replace(/:([^/]+)/g, (_, name) => `:${name.toLowerCase()}`);
}
/**
 * Validate a route-name fragment (everything after `method-` in a file name).
 * Throws on malformed `[param]` syntax.
 */
function validateRouteName(rawName) {
    if (rawName.includes('[]')) {
        throw new Error('Empty parameters not allowed [], use [id] instead of []');
    }
    // A leading or trailing dash means an empty path segment at the boundary —
    // almost always a typo (`users-` intended as `users/[id]`, or `-a` as `a`).
    if (rawName.startsWith('-') || rawName.endsWith('-')) {
        throw new Error(`Invalid route name "${rawName}": must not start or end with "-" — use [id] for a dynamic segment`);
    }
    if (!rawName.includes('[') && !rawName.includes(']')) {
        return;
    }
    if (!ROUTE_NAME_PATTERN.test(rawName)) {
        throw new Error(`Invalid parameter syntax in "${rawName}": params ([id]) and static text must alternate, joined by "-"`);
    }
    for (const name of paramTokens(rawName)) {
        if (!ASCII_PARAM.test(name)) {
            throw new Error(`Invalid parameter name "${name}" in "${rawName}": only ASCII letters, digits and underscore allowed`);
        }
    }
}
/**
 * Validate a directory segment (single path segment, at most one `[param]`).
 * Throws on malformed bracket syntax or empty brackets.
 */
function validateDirectorySegment(segment) {
    if (!segment.includes('[') && !segment.includes(']')) {
        return;
    }
    if (DIR_PARAM_PATTERN.test(segment)) {
        const name = segment.slice(1, -1);
        if (!ASCII_PARAM.test(name)) {
            throw new Error(`Invalid parameter name "${name}" in directory "${segment}": only ASCII letters, digits and underscore allowed`);
        }
        return;
    }
    const paramContent = segment.slice(segment.indexOf('[') + 1, segment.indexOf(']'));
    if (paramContent.includes(' ') || paramContent === '') {
        throw new Error(`Invalid parameter syntax in directory "${segment}": a parameter must be a single [id] segment without spaces`);
    }
    throw new Error(`Invalid parameter syntax in directory "${segment}": a parameter must be a single [id] segment`);
}
/**
 * Convert a route name fragment (everything after `method-` in a file name)
 * to an Express-style path segment using three ordered regex passes.
 *
 * Pass order matters: step 2 must precede step 3 to avoid mis-converting
 * adjacent params like `[a]-[b]`.
 */
function parseRouteName(rawName) {
    validateRouteName(rawName);
    return rawName
        .replace(/\[([A-Za-z0-9_]+)\]/g, ':$1')
        .replace(/-:/g, '/:')
        .replace(/:([A-Za-z0-9_]+)-/g, ':$1/');
}
/**
 * Convert a directory segment that may contain `[param]` brackets to
 * an Express-style `:param` segment. Only the bracket substitution applies —
 * no hyphen-to-slash logic since directory names are single segments.
 */
function parseDirectorySegment(segment) {
    validateDirectorySegment(segment);
    return segment.replace(/\[([A-Za-z0-9_]+)\]/g, ':$1');
}

/**
 * Shared file-name and directory-name validation for auto-router.
 */
/**
 * Validate a route file name.
 *
 * Accepts:
 * - Exact HTTP method (e.g. `get.ts`, `post.ts`)
 * - Method-prefixed with dash (e.g. `get-users.ts`, `post-[id].ts`)
 * Rejects:
 * - Wrong-cased method prefix (e.g. `GET-users.ts`, `Post-users.ts`)
 * - Malformed [param] syntax (e.g. `get-[].ts`, `get-[a][b].ts`)
 * - Unknown file names
 */
function validateFileName(fileName) {
    const nameWithoutExt = fileName.replace(/\.(ts|js)$/, '');
    if (HTTP_METHODS.includes(nameWithoutExt)) {
        return { valid: true, method: nameWithoutExt };
    }
    let matchedMethod;
    for (const method of HTTP_METHODS) {
        if (nameWithoutExt.startsWith(method + '-')) {
            matchedMethod = method;
            break;
        }
    }
    if (!matchedMethod) {
        const wrongCasedMethod = HTTP_METHODS.find(method => nameWithoutExt.toLowerCase().startsWith(method + '-'));
        if (wrongCasedMethod) {
            return {
                valid: false,
                error: `File name uses "${nameWithoutExt.slice(0, wrongCasedMethod.length)}" — HTTP method prefix must be lowercase, e.g. "${wrongCasedMethod}-..."`,
            };
        }
        return {
            valid: false,
            error: `File name must be a valid HTTP method or start with method- (${HTTP_METHODS.join('|')})`,
        };
    }
    const routeName = nameWithoutExt === matchedMethod ? '' : nameWithoutExt.substring(matchedMethod.length + 1);
    if (routeName) {
        try {
            validateRouteName(routeName);
        }
        catch (err) {
            return {
                valid: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    return { valid: true, method: matchedMethod };
}
/** Check whether a directory name is an HTTP method keyword (case-insensitive). */
function isHttpMethodKeyword(name) {
    return HTTP_METHODS.includes(name.toLowerCase());
}

/**
 * Match a route against a filter pattern.
 *
 * Pattern formats:
 * - Path only (matches all methods): '/api/users', '/api/admin/*'
 * - Method + path (matches specific method): 'GET /api/users', 'POST /api/auth/login'
 *
 * Path matching rules:
 * - Exact match (with or without prefix): '/users' matches '/api/users'
 * - Wildcard suffix: '/api/admin/*' matches '/api/admin/foo' and '/api/admin/foo/bar' but NOT '/api/admin' itself
 */
const HTTP_METHODS_UPPER = HTTP_METHODS.map(m => m.toUpperCase());
function matchesFilter(routePath, routeMethod, pattern, prefix) {
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
    const candidatePaths = [routePath];
    if (prefix && routePath.startsWith(prefix)) {
        const stripped = routePath.slice(prefix.length) || '/';
        candidatePaths.push(stripped);
    }
    for (const candidate of candidatePaths) {
        if (isWildcard) {
            if (candidate.startsWith(basePattern + '/')) {
                return true;
            }
        }
        else {
            if (candidate === basePattern) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Shared auth resolution and force-pattern tracking for auto-router.
 */
/**
 * Resolve the `requiresAuth` state for a single route.
 *
 * Priority: explicit meta > forceProtected > forcePublic > defaultRequiresAuth
 */
function resolveAuth(options) {
    const { routePath, method, routeMeta, defaultRequiresAuth, forcePublic, forceProtected, prefix } = options;
    const matchedPublicPattern = forcePublic?.find(pattern => matchesFilter(routePath, method, pattern, prefix));
    const matchedProtectedPattern = forceProtected?.find(pattern => matchesFilter(routePath, method, pattern, prefix));
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
/**
 * Track forcePublic/forceProtected pattern matches, conflicts, and overrides,
 * then emit structured warnings at the end of route registration.
 */
class ForcePatternTracker {
    constructor() {
        this.matchedForcePublicPatterns = new Set();
        this.matchedForceProtectedPatterns = new Set();
        this.overriddenByMeta = [];
        this.conflictRoutes = [];
    }
    /** Record a forcePublic/forceProtected pattern match. */
    addMatch(publicPattern, protectedPattern) {
        if (publicPattern)
            this.matchedForcePublicPatterns.add(publicPattern);
        if (protectedPattern)
            this.matchedForceProtectedPatterns.add(protectedPattern);
    }
    /** Record a conflict where both forcePublic and forceProtected matched the same route. */
    addConflict(route, publicPattern, protectedPattern) {
        this.conflictRoutes.push({ route, publicPattern, protectedPattern });
    }
    /** Record an override where explicit createHandler meta overrode a force pattern. */
    addOverride(route, pattern, type) {
        this.overriddenByMeta.push({ route, pattern, type });
    }
    /** Emit warnings for conflicts, overrides, and unmatched patterns. */
    logWarnings(log, forcePublic, forceProtected) {
        for (const { route, publicPattern, protectedPattern } of this.conflictRoutes) {
            log('warn', `⚠️  Route "${route}" matched both forcePublic ("${publicPattern}") and forceProtected ("${protectedPattern}") — forceProtected wins`);
        }
        for (const { route, pattern, type } of this.overriddenByMeta) {
            log('warn', `⚠️  ${type} pattern "${pattern}" matched "${route}" but has no effect — route has explicit createHandler meta`);
        }
        if (forcePublic) {
            for (const pattern of forcePublic) {
                if (!this.matchedForcePublicPatterns.has(pattern)) {
                    log('warn', `⚠️  forcePublic pattern "${pattern}" did not match any registered route (check for typos or outdated config)`);
                }
            }
        }
        if (forceProtected) {
            for (const pattern of forceProtected) {
                if (!this.matchedForceProtectedPatterns.has(pattern)) {
                    log('warn', `⚠️  forceProtected pattern "${pattern}" did not match any registered route (check for typos or outdated config)`);
                }
            }
        }
    }
}

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
function describe(entry) {
    if (typeof entry === 'string')
        return entry;
    if (entry instanceof RegExp)
        return entry.toString();
    return typeof entry.pattern === 'string' ? entry.pattern : String(entry.pattern);
}
/**
 * Compile user-provided ignore patterns into `CompiledIgnorePattern` instances.
 * Throws with a clear message (index + source) when a pattern is not a string /
 * RegExp, its `type` is invalid, or a string is not valid regex.
 */
function compileIgnorePatterns(patterns) {
    if (!patterns || patterns.length === 0)
        return [];
    return patterns.map((raw, index) => {
        let pattern;
        let target;
        if (typeof raw === 'string' || raw instanceof RegExp) {
            pattern = raw;
            target = 'both';
        }
        else {
            // Runtime JS can pass anything; give a clear error instead of a confusing
            // TypeError (e.g. `null`) or a silent no-op before the pattern check.
            if (!raw || typeof raw !== 'object') {
                throw new Error(`Invalid ignore entry at index ${index}: expected a string, RegExp, or { pattern, type } object`);
            }
            pattern = raw.pattern;
            target = raw.type ?? 'both';
        }
        if (typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
            throw new Error(`Invalid ignore entry at index ${index}: "pattern" must be a string or RegExp`);
        }
        if (target !== 'file' && target !== 'dir' && target !== 'both') {
            throw new Error(`Invalid ignore type at index ${index}: "${String(target)}" — expected "file", "dir" or "both"`);
        }
        if (typeof pattern === 'string') {
            try {
                pattern = new RegExp(pattern);
            }
            catch (err) {
                throw new Error(`Invalid ignore pattern at index ${index} ("${describe(raw)}"): ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        return { regex: pattern, target };
    });
}
/**
 * Returns true when `entryName` matches any ignore pattern that applies to the
 * entry kind (`isDirectory`). `lastIndex` is reset first so a `/g`- or
 * `/y`-flagged pattern supplied by the caller cannot carry state between calls
 * and produce alternating results.
 */
function isIgnored(entryName, isDirectory, patterns) {
    for (const { regex, target } of patterns) {
        const applies = target === 'both' || (target === 'file' && !isDirectory) || (target === 'dir' && isDirectory);
        if (!applies)
            continue;
        regex.lastIndex = 0;
        if (regex.test(entryName))
            return true;
    }
    return false;
}

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
async function loadRoutes(app, options) {
    const { dir, prefix, defaultRequiresAuth, strict, forcePublic, forceProtected, ignore } = options;
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
            // Skip ignored entries before validation — a matched folder is skipped
            // whole (no recursion), a matched file silently (no error log). The
            // entry's kind decides which patterns apply (file / dir / both).
            if (isIgnored(file, fileStat.isDirectory(), ignore))
                continue;
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
                        if (routeMeta?.requiresAuth !== undefined) {
                            // Explicit createHandler meta wins over any force pattern — report the
                            // override, not a "both matched" conflict (matches staticAutoRouter).
                            if (authResult.matchedProtectedPattern) {
                                tracker.addOverride(routePath, authResult.matchedProtectedPattern, 'forceProtected');
                            }
                            else if (authResult.matchedPublicPattern) {
                                tracker.addOverride(routePath, authResult.matchedPublicPattern, 'forcePublic');
                            }
                        }
                        else if (authResult.matchedPublicPattern && authResult.matchedProtectedPattern) {
                            tracker.addConflict(routePath, authResult.matchedPublicPattern, authResult.matchedProtectedPattern);
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
function autoRouter(options = {}) {
    const optionsArray = Array.isArray(options) ? options : [options];
    const expandedOptionsArray = [];
    for (const config of optionsArray) {
        // Compile once per config — shared by every prefix the config expands into.
        const ignore = compileIgnorePatterns(config.ignore);
        const prefixes = Array.isArray(config.prefix)
            ? config.prefix
            : [config.prefix !== undefined ? config.prefix : '/api'];
        for (const prefix of prefixes) {
            const normalizedPrefix = prefix.length > 1 && prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
            expandedOptionsArray.push({
                dir: config.dir || './controllers',
                prefix: normalizedPrefix,
                defaultRequiresAuth: config.defaultRequiresAuth ?? false,
                strict: config.strict ?? true,
                logging: config.logging ?? true,
                forcePublic: config.forcePublic,
                forceProtected: config.forceProtected,
                ignore,
                onLog: config.onLog,
            });
        }
    }
    return async function (app) {
        if (!app) {
            throw new Error('Auto-router plugin requires an application instance');
        }
        for (const finalOptions of expandedOptionsArray) {
            await loadRoutes(app, finalOptions);
        }
    };
}

/** Static router plugin for runtimes without filesystem access. */
function staticAutoRouter(options) {
    const { routes, defaultRequiresAuth = false, forcePublic, forceProtected, logging = true, onLog, } = options;
    const log = (level, message) => {
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
        const tracker = new ForcePatternTracker();
        log('info', `🔄 Loading ${routes.length} static routes`);
        const routeLogLines = [];
        for (const { method, path: routePath, handler: rawHandler } of routes) {
            const normalizedMethod = method.toLowerCase();
            // Reject routes whose path uses the file-name [param] syntax — static routes
            // must be written in Express-style `:param` form directly.
            if (routePath.includes('[') || routePath.includes(']')) {
                try {
                    validateRouteName(routePath);
                }
                catch (err) {
                    log('error', `❌ Skip route ${routePath}: ${err instanceof Error ? err.message : String(err)}`);
                    continue;
                }
                log('error', `❌ Skip route ${routePath}: use Express-style :param (e.g. '/users/:id') — file-name [param] syntax is not valid in static routes`);
                continue;
            }
            const routeKey = `${normalizedMethod.toUpperCase()} ${normalizeParamNames(routePath)}`;
            if (registeredRoutes.has(routeKey)) {
                log('error', `❌ Duplicate route: ${routeKey} — skipped`);
                continue;
            }
            registeredRoutes.add(routeKey);
            let handler = rawHandler;
            let routeMeta;
            let routeMiddlewares;
            if (handler === undefined || handler === null) {
                log('error', `❌ Skip route ${routePath}: handler is null/undefined`);
                continue;
            }
            if (isRouteConfig(handler)) {
                routeMeta = handler.meta;
                routeMiddlewares = handler.middlewares;
                handler = handler.handler;
            }
            else if (typeof handler === 'function') ;
            else if (typeof handler === 'object' && handler !== null && typeof handler.handler === 'function') {
                const raw = handler;
                routeMeta = raw.meta;
                routeMiddlewares = raw.middlewares;
                handler = raw.handler;
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
            tracker.addMatch(authResult.matchedPublicPattern, authResult.matchedProtectedPattern);
            if (routeMeta?.requiresAuth !== undefined) {
                if (authResult.matchedProtectedPattern) {
                    tracker.addOverride(routePath, authResult.matchedProtectedPattern, 'forceProtected');
                }
                else if (authResult.matchedPublicPattern) {
                    tracker.addOverride(routePath, authResult.matchedPublicPattern, 'forcePublic');
                }
            }
            else if (authResult.matchedPublicPattern && authResult.matchedProtectedPattern) {
                tracker.addConflict(routePath, authResult.matchedPublicPattern, authResult.matchedProtectedPattern);
            }
            const authMark = authResult.requiresAuth ? ' 🔒' : '';
            routeLogLines.push({
                path: routePath,
                method: normalizedMethod.toUpperCase(),
                line: `✅ ${normalizedMethod.toUpperCase().padEnd(7)} ${routePath}${authMark}`,
            });
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
            app[normalizedMethod](routePath, ...(routeMiddlewares ?? []), handler);
        }
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
    };
}

export { autoRouter, createHandler, isRouteConfig, staticAutoRouter };
//# sourceMappingURL=index.js.map
