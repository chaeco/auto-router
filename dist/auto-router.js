import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { isRouteConfig } from './handler';
/**
 * Auto Router Loading Plugin
 * 自动路由加载插件
 *
 * File naming rules: [method]-[name].ts
 * 文件命名规则：[method]-[name].ts
 *
 * Validation rules:
 * 验证规则：
 *   ✅ File name must start with valid HTTP method (get-, post-, put-, delete-, patch-, head-, options-)
 *   文件名必须以有效的 HTTP 方法开头 (get-, post-, put-, delete-, patch-, head-, options-)
 *   ✅ Parameter format: [paramName] (must use brackets)
 *   参数格式：[paramName] （必须用方括号）
 *   ✅ Empty parameters not allowed [id] = valid, [] = invalid
 *   不允许空参数 [id] = valid, [] = invalid
 *   ✅ Only one default export allowed
 *   只能有一个默认导出
 *   ❌ Named exports not allowed
 *   不允许命名导出
 *   ✅ Default export must be a function or config object
 *   默认导出必须是一个函数或配置对象
 *   ✅ Function should be async
 *   函数应该是异步的 (async)
 *   ✅ Directory names cannot contain HTTP method keywords
 *   目录名中不能包含 HTTP 方法关键字
 *   ✅ Duplicate routes not allowed
 *   不允许重复的路由
 *
 * Single parameter examples:
 * 单参数示例：
 *   - post-login.ts                → POST /api/login
 *   - get-users.ts                 → GET /api/users
 *   - get-[id].ts                  → GET /api/:id
 *   - delete-[id].ts               → DELETE /api/:id
 *
 * Multiple parameters examples:
 * 多参数示例：
 *   - get-[userId]-posts.ts        → GET /api/:userId/posts
 *   - get-[userId]-[postId].ts     → GET /api/:userId/:postId
 *   - put-[userId]-profile.ts      → PUT /api/:userId/profile
 *
 * Nested directory examples:
 * 嵌套目录示例：
 *   - users/posts/get-[id].ts      → GET /api/users/posts/:id
 *
 * Permission authentication config examples (function exports only):
 * 权限认证配置示例（仅函数导出）：
 *   - Method 1: Pure function (using global default permission config)
 *   方式 1: 纯函数（使用全局默认权限配置）
 *     export default async (ctx) => { ... }
 *
 *   - Method 2: createHandler wrapper (when special permission config needed)
 *   方式 2: createHandler 包装（需要特殊权限配置时）
 *     export default createHandler(async (ctx) => { ... }, { requiresAuth: true })
 *
 * Global default config examples:
 * 全局默认配置示例：
 *   - Blacklist mode (public by default, mark routes that need auth):
 *   黑名单模式（默认公开，标记需要认证的接口）：
 *     app.extend(autoRouter({ dir: './controllers', defaultRequiresAuth: false }))
 *
 *   - Whitelist mode (protected by default, mark routes that are public):
 *   白名单模式（默认受保护，标记公开接口）：
 *     app.extend(autoRouter({ dir: './controllers', defaultRequiresAuth: true }))
 *
 * Force override examples (explicit, not dependent on defaultRequiresAuth):
 * 强制覆盖示例（显式声明，不依赖 defaultRequiresAuth 的值）：
 *   - Force public (always public regardless of defaultRequiresAuth):
 *   强制公开（无论 defaultRequiresAuth 是什么值，这些路由都公开）：
 *     app.extend(autoRouter({ dir: './controllers', forcePublic: ['/api/auth/login', '/api/public/*'] }))
 *
 *   - Force protected with method prefix (only POST /api/users is protected, GET remains public):
 *   带方法前缀的强制保护（只有 POST /api/users 受保护，GET 仍公开）：
 *     app.extend(autoRouter({ dir: './controllers', forceProtected: ['POST /api/users', '/api/admin/*'] }))
 *
 * forcePublic / forceProtected pattern formats:
 * forcePublic / forceProtected 规则格式：
 *   - Path only (all methods):  '/api/users', '/api/admin/*'
 *     仅路径（匹配所有方法）：'/api/users', '/api/admin/*'
 *   - Method + path:            'GET /api/users', 'POST /api/auth/login', 'DELETE /api/admin/*'
 *     方法 + 路径：'GET /api/users', 'POST /api/auth/login', 'DELETE /api/admin/*'
 *
 * Usage (recommended):
 * 使用方式（推荐）：
 *   app.extend(autoRouter({ dir: './controllers' }))
 */
/** Valid HTTP methods (uppercase) used for method-prefix pattern parsing */
// 用于方法前缀规则解析的有效 HTTP 方法列表（大写）
const HTTP_METHODS_UPPER = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
/**
 * Match a route against a filter pattern.
 * 匹配路由和过滤规则。
 *
 * Pattern formats / 规则格式：
 * - Path only (matches all methods): '/api/users', '/api/admin/*'
 *   仅路径（匹配所有方法）：'/api/users', '/api/admin/*'
 * - Method + path (matches specific method): 'GET /api/users', 'POST /api/auth/login', 'GET /api/admin/*'
 *   方法 + 路径（匹配特定方法）：'GET /api/users', 'POST /api/auth/login'
 *
 * Path matching rules / 路径匹配规则：
 * - Exact match (with or without prefix): '/users' matches '/api/users'
 *   精确匹配（带或不带前缀）：'/users' 匹配 '/api/users'
 * - Wildcard suffix: '/api/admin/*' matches '/api/admin/foo' and '/api/admin/foo/bar' but NOT '/api/admin' itself
 *   通配符后缀：'/api/admin/*' 匹配 '/api/admin/foo' 及其子路径，不匹配 '/api/admin' 本身
 */
function matchesFilter(routePath, routeMethod, pattern, prefix) {
    // Parse optional method prefix from pattern, e.g. 'GET /api/users'
    // 解析 pattern 中可选的方法前缀，如 'GET /api/users'
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
    // If a method is specified in the pattern, it must match the route method
    // 如果 pattern 中指定了方法，必须与路由方法匹配
    if (patternMethod && patternMethod !== routeMethod.toUpperCase()) {
        return false;
    }
    const isWildcard = pathPattern.endsWith('/*');
    const basePattern = isWildcard ? pathPattern.slice(0, -2) : pathPattern;
    // Candidate paths: full path and path without prefix
    // 候选路径：完整路径和去掉前缀的路径
    const candidatePaths = [routePath];
    if (prefix && routePath.startsWith(prefix)) {
        const stripped = routePath.slice(prefix.length) || '/';
        candidatePaths.push(stripped);
    }
    for (const candidate of candidatePaths) {
        if (isWildcard) {
            // '/*' only matches sub-paths, NOT the base path itself
            // e.g. '/api/admin/*' matches '/api/admin/foo' but NOT '/api/admin'
            // '/api/admin/*' 只匹配子路径，不匹配 '/api/admin' 本身
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
// Internal loading function
// 内部加载函数
async function loadRoutes(app, options) {
    const { dir, prefix, defaultRequiresAuth, strict, logging, forcePublic, forceProtected, onLog } = options;
    const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    // Track which forcePublic/forceProtected patterns actually matched at least one route
    // 追踪哪些 forcePublic/forceProtected 规则实际命中了路由
    const matchedForcePublicPatterns = new Set();
    const matchedForceProtectedPatterns = new Set();
    // Track routes where forcePublic/forceProtected matched but was overridden by explicit createHandler meta
    // 追踪规则命中但被 createHandler 显式 meta 覆盖的路由
    const overriddenByMeta = [];
    // Track routes where both forcePublic and forceProtected matched (conflict)
    // 追踪同时被 forcePublic 和 forceProtected 命中的路由（冲突）
    const conflictRoutes = [];
    // Helper function for logging
    // 日志输出辅助函数
    const log = (level, message) => {
        if (onLog) {
            // Custom logger takes over entirely — skip default console output
            // 自定义日志接管，不再重复输出到控制台
            onLog(level, message);
            return;
        }
        // Default console output
        // 默认控制台输出
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
    const importPromises = []; // Collect all import promises
    // 收集所有导入 Promise
    // Initialize app's route metadata storage (only once)
    // 初始化应用的路由元数据存储（仅一次）
    if (!app.$routes) {
        app.$routes = {
            publicRoutes: [],
            protectedRoutes: [],
            all: [],
        };
    }
    // Initialize registered routes set (shared across all autoRouter calls)
    // 初始化已注册路由集合（在所有 autoRouter 调用间共享）
    if (!app.$registeredRoutes) {
        app.$registeredRoutes = new Set();
    }
    const registeredRoutes = app.$registeredRoutes; // For detecting duplicate routes
    // 用于检测重复路由
    // Validation function
    // 验证函数
    function validateFileName(fileName) {
        const nameWithoutExt = fileName.replace(/\.(ts|js)$/, '');
        // Check if file name is exactly a HTTP method (e.g., get.ts, post.ts)
        // 检查文件名是否恰好是 HTTP 方法（例如：get.ts, post.ts）
        if (methods.includes(nameWithoutExt)) {
            return { valid: true, method: nameWithoutExt };
        }
        // Check if starts with valid HTTP method followed by dash
        // 检查是否以有效的 HTTP 方法开头，后跟连字符
        let method;
        for (const m of methods) {
            if (nameWithoutExt.startsWith(m + '-')) {
                method = m;
                break;
            }
        }
        if (!method) {
            return {
                valid: false,
                error: `File name must be a valid HTTP method or start with method- (${methods.join('|')})`,
                // 文件名必须是有效的 HTTP 方法或以 method- 开头 (${methods.join('|')})
            };
        }
        // Check parameter format
        // 检查参数格式
        const hasInvalidParams = /\[\]/.test(nameWithoutExt);
        if (hasInvalidParams) {
            return {
                valid: false,
                error: 'Empty parameters not allowed [], use [id] instead of []',
                // 不允许空参数 [], 例如：[id] 而不是 []
            };
        }
        return { valid: true, method };
    }
    // Validate directory name (receives only the single directory segment, not a full path)
    // 验证目录名（只接收单个目录段，而非完整路径）
    function validateDirPath(dirName) {
        if (methods.includes(dirName.toLowerCase())) {
            log('warn', `⚠️  Warning: Directory name "${dirName}" is an HTTP method keyword, consider renaming`);
            // 警告: 目录名 "${dirName}" 是 HTTP 方法关键字，建议重命名
        }
    }
    // Recursively scan directory
    // 递归扫描目录
    function scanDir(dirPath, basePath = '') {
        const files = readdirSync(dirPath);
        for (const file of files) {
            const filePath = join(dirPath, file);
            let stat;
            try {
                stat = statSync(filePath);
            }
            catch (err) {
                // Broken symlink, race-condition deletion, permission denied, etc.
                // 断开的符号链接、竞态删除、权限拒绝等
                log('warn', `⚠️  Skip entry (stat failed): ${filePath}`);
                log('warn', `   ⚠️  ${err.message}`);
                continue;
            }
            if (stat.isDirectory()) {
                // Validate directory name (only the new segment, not the full absolute path)
                // 验证目录名（只检查新增的这一段，而非完整绝对路径）
                validateDirPath(file);
                // Recursively scan subdirectory
                // 递归扫描子目录
                try {
                    scanDir(filePath, basePath ? `${basePath}/${file}` : `/${file}`);
                }
                catch (err) {
                    // Subdirectory unreadable (permission denied, etc.) — skip it, continue scanning siblings
                    // 子目录不可读（权限拒绝等）—跳过，继续扫描同级其他文件
                    log('warn', `⚠️  Skip directory (scan failed): ${filePath}`);
                    log('warn', `   ⚠️  ${err.message}`);
                }
            }
            else if ((file.endsWith('.ts') && !file.endsWith('.d.ts')) || file.endsWith('.js')) {
                // Validate filename
                // 验证文件名
                const validation = validateFileName(file);
                if (!validation.valid) {
                    log('error', `❌ Skip file: ${filePath}`);
                    // 跳过文件: ${filePath}
                    log('error', `   ❌ ${validation.error}`);
                    continue; // Skip this file only, continue scanning remaining files in the directory
                    // 只跳过此文件，继续扫描目录中的其余文件
                }
                const method = validation.method;
                const nameWithoutExt = file.replace(/\.(ts|js)$/, '');
                // If file name is exactly the HTTP method, routeName is empty
                // 如果文件名恰好是 HTTP 方法，routeName 为空
                let routeName = '';
                if (nameWithoutExt !== method) {
                    // Extract route name after "method-"
                    // 提取 "method-" 之后的路由名称
                    routeName = nameWithoutExt.substring(method.length + 1);
                }
                // Process dynamic parameters [id] -> :id, and -[param] -> /:param
                // 处理动态参数 [id] -> :id，以及 -[param] -> /:param
                // Examples:
                // 例如：
                // - [id] -> :id
                // - [userId]-[postId] -> :userId/:postId
                // - [userId]-posts -> :userId/posts
                routeName = routeName
                    .replace(/\[(\w+)\]/g, ':$1') // [param] -> :param
                    // [param] -> :param
                    .replace(/-:/g, '/:') // -: -> /: (handle parameter connectors)
                    .replace(/:(\w+)-/g, ':$1/'); // :- -> :/ (handle parameter suffixes)
                // -: -> /:（处理参数之间的连接符）
                // :- -> :/（处理参数后的连接符）
                // Build full route path
                // 构建完整路由路径
                let fullPath;
                if (routeName) {
                    // Has route name: basePath + routeName
                    // 有路由名：basePath + routeName
                    fullPath = basePath ? `${basePath}/${routeName}` : `/${routeName}`;
                }
                else {
                    // No route name (method-only file): use basePath
                    // 无路由名（仅方法名文件）：使用 basePath
                    fullPath = basePath;
                }
                fullPath = fullPath.replace(/\/+/g, '/'); // Remove double slashes
                // 移除双斜杠
                // Detect duplicate routes
                // 检测重复路由
                const routePath = prefix
                    ? `${prefix}${fullPath}`.replace(/\/+/g, '/') // Normalize any double slashes from prefix
                    : fullPath; // 归一化来自 prefix 的多余斜杠
                const routeKey = `${method.toUpperCase()} ${routePath}`;
                if (registeredRoutes.has(routeKey)) {
                    log('error', `❌ Skip file: ${filePath}`);
                    // 跳过文件: ${filePath}
                    log('error', `   ❌ Duplicate route: ${routeKey}`);
                    // 路由重复: ${routeKey}
                    continue; // Skip this file only, continue scanning remaining files
                    // 只跳过此文件，继续扫描目录中的其余文件
                }
                registeredRoutes.add(routeKey);
                // Dynamically import and register route - using file:// URL
                // 动态导入并注册路由 - 使用 file:// URL
                const absolutePath = resolve(filePath);
                const fileUrl = pathToFileURL(absolutePath).href;
                const importPromise = import(fileUrl)
                    .then(module => {
                    let handler = module.default;
                    let routeMeta;
                    // Skip if no default export
                    // 没有默认导出则跳过
                    if (handler === undefined || handler === null) {
                        return;
                    }
                    // Catch unexpected falsy values (false, 0, '') that are clearly not handlers
                    // 捕获明显不是 handler 的意外 falsy 值（false、0、''）
                    if (!handler) {
                        log('error', `❌ Failed to load route: ${filePath}`);
                        log('error', `   ❌ Default export is a falsy non-null value (${JSON.stringify(handler)}), expected a function or createHandler result`);
                        return;
                    }
                    // Strict mode check: in strict mode, only allow functions or createHandler objects
                    // 严格模式检查：在严格模式下，只允许函数或 createHandler 对象
                    if (strict && typeof handler !== 'function' && !isRouteConfig(handler)) {
                        log('error', `❌ Failed to load route: ${filePath}`);
                        // 加载路由失败: ${filePath}
                        log('error', `   ❌ In strict mode, only functions or createHandler results are allowed`);
                        // 严格模式下，只允许导出函数或 createHandler 结果
                        log('error', `   ❌ Current export type: ${typeof handler}`);
                        // 当前导出类型: ${typeof handler}
                        log('error', `   ❌ Correct ways:`);
                        // 正确的方式：
                        log('error', `      ✅ export default async (ctx) => { ... }`);
                        log('error', `      ✅ export default createHandler(async (ctx) => { ... }, meta)`);
                        log('error', `      ❌ Not supported: export default { handler, meta }`);
                        log('error', `      💡 Tip: You can set strict: false to disable strict checking`);
                        // 提示: 可以设置 strict: false 来禁用严格检查
                        return;
                    }
                    // Validation rule: each file can only have one export (only default export)
                    // 验证规则：每个文件只能有一个导出（只能有默认导出）
                    const namedExports = Object.keys(module).filter(key => key !== 'default');
                    if (namedExports.length > 0) {
                        log('error', `❌ Failed to load route: ${filePath}`);
                        // 加载路由失败: ${filePath}
                        log('error', `   ❌ File can only have default export, named exports are not allowed`);
                        // 文件只能有默认导出，不允许命名导出
                        log('error', `   ❌ Detected named exports: ${namedExports.join(', ')}`);
                        // 检测到的命名导出: ${namedExports.join(', ')}
                        return;
                    }
                    // Check export method
                    // 检查导出方式
                    // strict mode (default): only allow two ways
                    // strict 模式（默认）：只允许两种方式
                    // 1. Pure function (async function or arrow function)
                    // 1. 纯函数（async function 或 arrow function）
                    // 2. createHandler wrapped RouteConfig object
                    // 2. createHandler 包装的 RouteConfig 对象
                    // Check if it's a createHandler wrapped object
                    // 检查是否为 createHandler 包装的对象
                    if (isRouteConfig(handler)) {
                        // Way 2: createHandler wrapped { handler, meta }
                        // 方式 2: createHandler 包装 { handler, meta }
                        routeMeta = handler.meta;
                        handler = handler.handler;
                    }
                    else if (typeof handler === 'function') {
                        // Way 1: Pure function - normal
                        // 方式 1: 纯函数 - 正常
                        // routeMeta remains undefined, use global default
                        // routeMeta 保持 undefined，使用全局默认值
                    }
                    else if (typeof handler === 'object' && handler !== null) {
                        // Detected plain object export
                        // 检测到普通对象导出
                        // Note: strict mode is already handled above by the early check — if we reach here,
                        // strict must be false (non-strict mode).
                        // 注意：严格模式已在上方的提前检查中处理，执行到此处时 strict 一定为 false（非严格模式）。
                        if (typeof handler.handler === 'function') {
                            // Non-strict mode: allow ordinary object export, show warning
                            // 非严格模式：允许普通对象导出，显示警告
                            log('warn', `⚠️  Warning: ${filePath}`);
                            // 警告: ${filePath}
                            log('warn', `   ⚠️  Detected non-recommended export method (non-strict mode)`);
                            // 检测到非推荐的导出方式（非严格模式）
                            routeMeta = handler.meta;
                            handler = handler.handler;
                            // handler is now a valid function; fall through to route registration
                            // handler 现在是有效函数，继续执行路由注册
                        }
                        else {
                            log('error', `❌ Failed to load route: ${filePath}`);
                            // 加载路由失败: ${filePath}
                            log('error', `   ❌ Exported object must contain handler function`);
                            // 导出的对象必须包含 handler 函数
                            return;
                        }
                    }
                    else {
                        // Unsupported export type (e.g. number, string, null)
                        // 不支持的导出类型（如 number、string、null）
                        const handlerType = typeof handler;
                        log('error', `❌ Failed to load route: ${filePath}`);
                        // 加载路由失败: ${filePath}
                        log('error', `   ❌ Unsupported export type: ${handlerType}`);
                        // 不支持的导出类型: ${handlerType}
                        log('error', `   ❌ Only the following ways are allowed:`);
                        // 只允许以下方式：
                        log('error', `      ✅ export default async (ctx) => { ... }`);
                        log('error', `      ✅ export default createHandler(async (ctx) => { ... }, meta)`);
                        return;
                    }
                    // Output route information, including permission mark
                    // 输出路由信息，包括权限标记
                    // Priority: explicit meta > forceProtected/forcePublic > defaultRequiresAuth
                    // 优先级：显式 meta > forceProtected/forcePublic > defaultRequiresAuth
                    const matchedPublicPattern = forcePublic?.find(p => matchesFilter(routePath, method, p, prefix));
                    const matchedProtectedPattern = forceProtected?.find(p => matchesFilter(routePath, method, p, prefix));
                    // Detect conflict: same route matched by both forcePublic and forceProtected
                    // 检测冲突：同一路由同时被 forcePublic 和 forceProtected 命中
                    if (matchedPublicPattern && matchedProtectedPattern) {
                        conflictRoutes.push({
                            route: routePath,
                            publicPattern: matchedPublicPattern,
                            protectedPattern: matchedProtectedPattern,
                        });
                    }
                    if (matchedPublicPattern)
                        matchedForcePublicPatterns.add(matchedPublicPattern);
                    if (matchedProtectedPattern)
                        matchedForceProtectedPatterns.add(matchedProtectedPattern);
                    let requiresAuth;
                    if (routeMeta?.requiresAuth !== undefined) {
                        // Explicit meta always wins
                        // 显式 meta 优先级最高
                        requiresAuth = routeMeta.requiresAuth;
                        // Warn for the pattern that would have applied had there been no explicit meta:
                        // forceProtected beats forcePublic in conflict, so only warn about forceProtected
                        // when both match; otherwise warn about whichever one matched.
                        // 警告"如果没有 explicit meta 才会生效的那条规则"：
                        // 两者都命中时 forceProtected 赢得冲突，forcePublic 本已落败，无需重复警告。
                        if (matchedProtectedPattern) {
                            overriddenByMeta.push({ route: routePath, pattern: matchedProtectedPattern, type: 'forceProtected' });
                        }
                        else if (matchedPublicPattern) {
                            overriddenByMeta.push({ route: routePath, pattern: matchedPublicPattern, type: 'forcePublic' });
                        }
                    }
                    else if (matchedPublicPattern && matchedProtectedPattern) {
                        // Conflict: forceProtected wins (safer default)
                        // 冲突时：forceProtected 优先（更安全）
                        requiresAuth = true;
                    }
                    else if (matchedProtectedPattern) {
                        requiresAuth = true;
                    }
                    else if (matchedPublicPattern) {
                        requiresAuth = false;
                    }
                    else {
                        requiresAuth = defaultRequiresAuth;
                    }
                    const authMark = requiresAuth ? ' 🔒' : '';
                    log('info', `✅ ${method.toUpperCase().padEnd(7)} ${routePath}${authMark}`);
                    // Collect route metadata to application instance
                    // 收集路由元数据到应用实例
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
                    app[method](routePath, handler);
                })
                    .catch(err => {
                    log('error', `❌ Failed to load route: ${filePath}`);
                    // 加载路由失败: ${filePath}
                    log('error', `   ❌ ${err.message}`);
                });
                importPromises.push(importPromise);
            }
        }
    }
    log('info', `🔄 Scanning controller directory: ${dir}`);
    // 扫描控制器目录: ${dir}
    const fullDir = resolve(dir);
    try {
        scanDir(fullDir);
    }
    catch (err) {
        // Directory does not exist or is not readable
        // 目录不存在或无法读取
        log('error', `❌ Failed to scan directory: ${fullDir}`);
        log('error', `   ❌ ${err.message}`);
        return;
    }
    // Wait for all imports to complete
    // 等待所有导入完成
    await Promise.all(importPromises);
    // Validate forcePublic / forceProtected pattern reasonableness
    // 校验 forcePublic / forceProtected 规则合理性
    // Warn about conflict routes (matched by both forcePublic and forceProtected)
    // 警告：同时被 forcePublic 和 forceProtected 命中的路由（冲突，forceProtected 优先）
    for (const { route, publicPattern, protectedPattern } of conflictRoutes) {
        log('warn', `⚠️  Route "${route}" matched both forcePublic ("${publicPattern}") and forceProtected ("${protectedPattern}") — forceProtected wins`
        // 路由 "${route}" 同时被 forcePublic 和 forceProtected 命中 — forceProtected 优先
        );
    }
    // Warn about patterns overridden by explicit createHandler meta
    // 警告：规则命中了路由，但被 createHandler 显式 meta 覆盖
    for (const { route, pattern, type } of overriddenByMeta) {
        log('warn', `⚠️  ${type} pattern "${pattern}" matched "${route}" but has no effect — route has explicit createHandler meta`
        // ${type} 规则 "${pattern}" 命中了 "${route}"，但该路由已通过 createHandler 显式设置权限，此规则对其无效
        );
    }
    // Warn about forcePublic patterns that never matched any route
    // 警告：从未命中任何路由的 forcePublic 规则
    if (forcePublic) {
        for (const pattern of forcePublic) {
            if (!matchedForcePublicPatterns.has(pattern)) {
                log('warn', `⚠️  forcePublic pattern "${pattern}" did not match any registered route (check for typos or outdated config)`
                // forcePublic 规则 "${pattern}" 未命中任何已注册路由（请检查是否有拼写错误或配置已过期）
                );
            }
        }
    }
    // Warn about forceProtected patterns that never matched any route
    // 警告：从未命中任何路由的 forceProtected 规则
    if (forceProtected) {
        for (const pattern of forceProtected) {
            if (!matchedForceProtectedPatterns.has(pattern)) {
                log('warn', `⚠️  forceProtected pattern "${pattern}" did not match any registered route (check for typos or outdated config)`
                // forceProtected 规则 "${pattern}" 未命中任何已注册路由（请检查是否有拼写错误或配置已过期）
                );
            }
        }
    }
    // Output summary after all routes are loaded
    // 所有路由加载完成后输出总结
    log('info', `📋 Registered routes:`);
    // 注册的路由:
    if (app.$routes.all.length === 0) {
        log('warn', `⚠️  No routes registered!`);
        // 没有注册任何路由!
    }
    else {
        log('info', `   Total: ${app.$routes.all.length}`);
        // 总计: ${app.$routes.all.length}
        log('info', `   Public: ${app.$routes.publicRoutes.length}`);
        // 公开: ${app.$routes.publicRoutes.length}
        log('info', `   Protected: ${app.$routes.protectedRoutes.length}`);
        // 受保护: ${app.$routes.protectedRoutes.length}
    }
}
/**
 * Auto router plugin - factory function
 * 自动路由插件 - 工厂函数
 * Used as application extension
 * 用作应用扩展
 *
 * Supports both single configuration and merged configuration (array)
 * 支持单个配置和合并式配置（数组）
 *
 * Options description:
 * 选项说明：
 *   - dir: Controller directory path (default: './controllers')
 *   dir: 控制器目录路径（默认：'./controllers'）
 *   - prefix: API route prefix, supports string or array (default: '/api')
 *   prefix: API 路由前缀，支持字符串或数组（默认：'/api'）
 *   - defaultRequiresAuth: Global default permission requirement (default: false)
 *   defaultRequiresAuth: 全局默认权限要求（默认：false）
 *     - false: All interfaces are public by default, unless explicitly set requiresAuth: true
 *     false: 所有接口默认为公开，除非显式设置 requiresAuth: true
 *     - true: All interfaces are protected by default, unless explicitly set requiresAuth: false
 *     true: 所有接口默认为受保护，除非显式设置 requiresAuth: false
 *   - forcePublic: Routes always treated as public, regardless of defaultRequiresAuth
 *   forcePublic: 强制公开的路由列表，无论 defaultRequiresAuth 的值，这些路由始终为公开
 *     - Supports exact paths (with or without prefix) and wildcard suffix /*
 *     支持精确路径（带或不带前缀）及通配符后缀 /*
 *     - Priority: createHandler explicit meta > forceProtected/forcePublic > defaultRequiresAuth
 *     优先级：createHandler 显式 meta > forceProtected/forcePublic > defaultRequiresAuth
 *   - forceProtected: Routes always treated as protected, regardless of defaultRequiresAuth
 *   forceProtected: 强制保护的路由列表，无论 defaultRequiresAuth 的值，这些路由始终受保护
 *     - Same pattern rules as forcePublic
 *     与 forcePublic 相同的路径匹配规则
 *     - When a route matches both forcePublic and forceProtected, forceProtected wins
 *     当路由同时命中 forcePublic 和 forceProtected 时，forceProtected 优先
 *   - strict: Strict mode (default: true)
 *   strict: 严格模式（默认：true）
 *     - true: Only allow pure function and createHandler export methods, prohibit other object exports
 *     true: 只允许纯函数和 createHandler 导出方式，禁止其他对象导出
 *     - false: Allow ordinary object { handler, meta } export method, but will show warning
 *     false: 允许普通对象 { handler, meta } 的导出方式，但会显示警告
 *   - logging: Whether to output route registration logs (default: true)
 *   logging: 是否输出路由注册日志（默认：true）
 *     - true: All log levels (info / warn / error) are printed to console
 *     true: 所有日志级别（info / warn / error）均输出到控制台
 *     - false: All console output is suppressed; use onLog if you still need error/warn
 *     false: 完全静默，若仍需警告/错误信息请配合 onLog 使用
 *   - onLog: Custom logging callback for integration with own logging systems
 *   onLog: 自定义日志输出回调，方便集成自己的日志系统
 *
 * Usage:
 * 使用方式:
 *   // Custom logging - 自定义日志
 *   app.extend(autoRouter({
 *     dir: './controllers',
 *     onLog: (level, msg) => myLogger[level](msg)
 *   }))
 *
 *   // Single configuration - 单个配置
 *   app.extend(autoRouter({ dir: './controllers' }))
 *
 *   // Multiple prefixes - 多个前缀
 *   app.extend(autoRouter({ dir: './controllers', prefix: ['/api', '/v1'] }))
 *
 *   // Merged configuration - 合并式配置
 *   app.extend(autoRouter([
 *     { dir: './controllers/admin', prefix: '/api/admin', defaultRequiresAuth: false },
 *     { dir: './controllers/client', prefix: '/api/client', defaultRequiresAuth: true }
 *   ]))
 *
 *   // Whitelist mode - protected by default, mark public interfaces
 *   白名单模式 - 默认受保护，标记公开接口
 *   app.extend(autoRouter({ dir: './controllers', defaultRequiresAuth: true }))
 *
 *   // Disable strict mode - allow all export methods (not recommended)
 *   禁用严格模式 - 允许所有导出方式（不推荐）
 *   app.extend(autoRouter({ dir: './controllers', strict: false }))
 *
 *   // Disable logging - quiet mode
 *   禁用日志输出 - 静默模式
 *   app.extend(autoRouter({ dir: './controllers', logging: false }))
 */
export function autoRouter(options = {}) {
    // Convert to array for unified processing
    // 转换为数组以统一处理
    const optionsArray = Array.isArray(options) ? options : [options];
    // Expand configurations with multiple prefixes
    // 展开具有多个前缀的配置
    const expandedOptionsArray = [];
    for (const opt of optionsArray) {
        const prefixes = Array.isArray(opt.prefix)
            ? opt.prefix
            : [opt.prefix !== undefined ? opt.prefix : '/api'];
        for (const prefix of prefixes) {
            // Normalize prefix: remove trailing slash (except bare "/")
            // 归一化前缀：去掉末尾斜杠（根路径 "/" 除外）
            const normalizedPrefix = prefix.length > 1 && prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
            expandedOptionsArray.push({
                dir: opt.dir || './controllers',
                prefix: normalizedPrefix,
                defaultRequiresAuth: opt.defaultRequiresAuth ?? false,
                strict: opt.strict ?? true,
                logging: opt.logging ?? true,
                forcePublic: opt.forcePublic,
                forceProtected: opt.forceProtected,
                onLog: opt.onLog,
            });
        }
    }
    return async function (app) {
        // app.extend(fn) 会直接调用 fn(app)
        if (!app) {
            throw new Error('Auto-router plugin requires an application instance');
        }
        // Load routes for all configurations sequentially
        // 依次加载所有配置的路由
        for (const finalOptions of expandedOptionsArray) {
            await loadRoutes(app, finalOptions);
        }
    };
}
//# sourceMappingURL=auto-router.js.map