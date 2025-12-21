import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
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
 * Usage (recommended):
 * 使用方式（推荐）：
 *   app.extend(autoRouter({ dir: './controllers' }))
 */
// Internal loading function
// 内部加载函数
async function loadRoutes(app, options = { dir: './controllers', prefix: '/api', defaultRequiresAuth: false, strict: true }) {
    const { dir, prefix, defaultRequiresAuth, strict } = options;
    const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    const registeredRoutes = new Set(); // For detecting duplicate routes
    // 用于检测重复路由
    const importPromises = []; // Collect all import promises
    // 收集所有导入 Promise
    // Initialize app's route metadata storage
    // 初始化应用的路由元数据存储
    if (!app.$routes) {
        app.$routes = {
            publicRoutes: [],
            protectedRoutes: [],
            all: [],
        };
    }
    // Validation function
    // 验证函数
    function validateFileName(fileName) {
        const nameWithoutExt = fileName.replace(/\.(ts|js)$/, '');
        // Check if starts with valid HTTP method
        // 检查是否以有效的 HTTP 方法开头
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
                error: `File name must start with valid HTTP method (${methods.join('|')})`,
                // 文件名必须以有效的 HTTP 方法开头 (${methods.join('|')})
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
    // Validate directory name
    // 验证目录名
    function validateDirPath(dirPath) {
        const pathParts = dirPath.split(/(\/|\\)/).filter(p => p && p !== '/' && p !== '\\');
        for (const part of pathParts) {
            if (methods.includes(part.toLowerCase())) {
                console.warn(`⚠️  Warning: Directory name "${part}" contains HTTP method keyword, consider renaming`);
                // 警告: 目录名 "${part}" 包含 HTTP 方法关键字，建议重命名
            }
        }
        return true;
    }
    // Recursively scan directory
    // 递归扫描目录
    function scanDir(dirPath, basePath = '') {
        const files = readdirSync(dirPath);
        for (const file of files) {
            const filePath = join(dirPath, file);
            const stat = statSync(filePath);
            if (stat.isDirectory()) {
                // Validate directory name
                // 验证目录名
                validateDirPath(filePath);
                // Recursively scan subdirectory
                // 递归扫描子目录
                scanDir(filePath, basePath ? `${basePath}/${file}` : `/${file}`);
            }
            else if (file.endsWith('.ts') || file.endsWith('.js')) {
                // Validate filename
                // 验证文件名
                const validation = validateFileName(file);
                if (!validation.valid) {
                    console.error(`❌ Skip file: ${filePath}`);
                    // 跳过文件: ${filePath}
                    console.error(`   ❌ ${validation.error}`);
                    return;
                }
                const method = validation.method;
                let routeName = file.replace(/\.(ts|js)$/, '').substring(method.length + 1);
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
                    .replace(/-:/g, '/:'); // -: -> /: (handle parameter connectors)
                // -: -> /:（处理参数之间的连接符）
                // Build full route path
                // 构建完整路由路径
                let fullPath = basePath;
                if (routeName) {
                    fullPath = `${basePath}/${routeName}`;
                }
                fullPath = fullPath.replace(/\/+/g, '/'); // Remove double slashes
                // 移除双斜杠
                if (!fullPath.startsWith('/')) {
                    fullPath = `/${fullPath}`;
                }
                // Detect duplicate routes
                // 检测重复路由
                const routePath = prefix ? `${prefix}${fullPath}` : fullPath;
                const routeKey = `${method.toUpperCase()} ${routePath}`;
                if (registeredRoutes.has(routeKey)) {
                    console.error(`❌ Skip file: ${filePath}`);
                    // 跳过文件: ${filePath}
                    console.error(`   ❌ Duplicate route: ${routeKey}`);
                    // 路由重复: ${routeKey}
                    return;
                }
                registeredRoutes.add(routeKey);
                // Dynamically import and register route - using file:// URL
                // 动态导入并注册路由 - 使用 file:// URL
                const absolutePath = resolve(filePath);
                const fileUrl = new URL(`file://${absolutePath}`).href;
                const importPromise = import(fileUrl)
                    .then(module => {
                    let handler = module.default;
                    let routeMeta;
                    // Skip if no default export
                    // 没有默认导出则跳过
                    if (!handler) {
                        return;
                    }
                    // Strict mode check: in strict mode, only allow functions or createHandler objects
                    // 严格模式检查：在严格模式下，只允许函数或 createHandler 对象
                    if (strict && typeof handler !== 'function' && !isRouteConfig(handler)) {
                        console.error(`❌ Failed to load route: ${filePath}`);
                        // 加载路由失败: ${filePath}
                        console.error(`   ❌ In strict mode, only functions or createHandler results are allowed`);
                        // 严格模式下，只允许导出函数或 createHandler 结果
                        console.error(`   ❌ Current export type: ${typeof handler}`);
                        // 当前导出类型: ${typeof handler}
                        console.error(`   ❌ Correct ways:`);
                        // 正确的方式：
                        console.error(`      ✅ export default async (ctx) => { ... }`);
                        console.error(`      ✅ export default createHandler(async (ctx) => { ... }, meta)`);
                        console.error(`      ❌ Not supported: export default { handler, meta }`);
                        console.error(`      💡 Tip: You can set strict: false to disable strict checking`);
                        // 提示: 可以设置 strict: false 来禁用严格检查
                        return;
                    }
                    // Validation rule: each file can only have one export (only default export)
                    // 验证规则：每个文件只能有一个导出（只能有默认导出）
                    const namedExports = Object.keys(module).filter(key => key !== 'default');
                    if (namedExports.length > 0) {
                        console.error(`❌ Failed to load route: ${filePath}`);
                        // 加载路由失败: ${filePath}
                        console.error(`   ❌ File can only have default export, named exports are not allowed`);
                        // 文件只能有默认导出，不允许命名导出
                        console.error(`   ❌ Detected named exports: ${namedExports.join(', ')}`);
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
                        // Validate handler must be a function
                        // 验证 handler 必须是函数
                        if (typeof handler !== 'function') {
                            console.error(`❌ Failed to load route: ${filePath}`);
                            // 加载路由失败: ${filePath}
                            console.error(`   ❌ createHandler's first parameter must be a function`);
                            // createHandler 的第一个参数必须是函数
                            return;
                        }
                    }
                    else if (typeof handler === 'function') {
                        // Way 1: Pure function - normal
                        // 方式 1: 纯函数 - 正常
                        // routeMeta remains undefined, use global default
                        // routeMeta 保持 undefined，使用全局默认值
                    }
                    else if (typeof handler === 'object' && handler !== null) {
                        // Detected object export
                        // 检测到对象导出
                        if (typeof handler.handler === 'function') {
                            // This is the export method of ordinary object { handler, meta }
                            // 这是普通对象 { handler, meta } 的导出方式
                            if (strict) {
                                console.error(`❌ Failed to load route: ${filePath}`);
                                // 加载路由失败: ${filePath}
                                console.error(`   ❌ In strict mode, exporting object { handler, meta } is not allowed`);
                                // 严格模式下，不允许导出对象 { handler, meta }
                                console.error(`   ❌ Only the following two ways are allowed:`);
                                // 只允许以下两种方式：
                                console.error(`      ✅ Way 1: export default async (ctx) => { ... }`);
                                console.error(`      ✅ Way 2: export default createHandler(async (ctx) => { ... }, meta)`);
                                console.error(`      ❌ Not supported: export default { handler, meta }`);
                                console.error(`      💡 Tip: You can set strict: false to disable strict checking`);
                                // 提示: 可以设置 strict: false 来禁用严格检查
                                return;
                            }
                            else {
                                // Non-strict mode: allow ordinary object export, show warning
                                // 非严格模式：允许普通对象导出，显示警告
                                console.warn(`⚠️  Warning: ${filePath}`);
                                // 警告: ${filePath}
                                console.warn(`   ⚠️  Detected non-recommended export method (non-strict mode)`);
                                // 检测到非推荐的导出方式（非严格模式）
                                routeMeta = handler.meta;
                                handler = handler.handler;
                            }
                        }
                        else {
                            console.error(`❌ Failed to load route: ${filePath}`);
                            // 加载路由失败: ${filePath}
                            console.error(`   ❌ Exported object must contain handler function`);
                            // 导出的对象必须包含 handler 函数
                            return;
                        }
                        const handlerType = typeof handler;
                        console.error(`❌ Failed to load route: ${filePath}`);
                        // 加载路由失败: ${filePath}
                        console.error(`   ❌ Unsupported export type: ${handlerType}`);
                        // 不支持的导出类型: ${handlerType}
                        console.error(`   ❌ Only the following ways are allowed:`);
                        // 只允许以下方式：
                        console.error(`      ✅ export default async (ctx) => { ... }`);
                        console.error(`      ✅ export default createHandler(async (ctx) => { ... }, meta)`);
                        return;
                    }
                    // Output route information, including permission mark
                    // 输出路由信息，包括权限标记
                    // If requiresAuth is not explicitly set, use global default
                    // 如果没有明确设置 requiresAuth，则使用全局默认值
                    const requiresAuth = routeMeta?.requiresAuth !== undefined ? routeMeta.requiresAuth : defaultRequiresAuth;
                    const authMark = requiresAuth ? ' 🔒' : '';
                    console.log(`✅ ${method.toUpperCase().padEnd(6)} ${routePath}${authMark}`);
                    // Collect route metadata to application instance
                    // 收集路由元数据到应用实例
                    const routeInfo = { method: method.toUpperCase(), path: routePath, requiresAuth };
                    app.$routes?.all.push(routeInfo);
                    if (requiresAuth) {
                        app.$routes?.protectedRoutes.push({ method: method.toUpperCase(), path: routePath });
                    }
                    else {
                        app.$routes?.publicRoutes.push({ method: method.toUpperCase(), path: routePath });
                    }
                    app[method](routePath, handler);
                })
                    .catch(err => {
                    console.error(`❌ Failed to load route: ${filePath}`);
                    // 加载路由失败: ${filePath}
                    console.error(`   ❌ ${err.message}`);
                });
                importPromises.push(importPromise);
            }
        }
    }
    console.log(`🔄 Scanning controller directory: ${dir}`);
    // 扫描控制器目录: ${dir}
    const fullDir = resolve(dir);
    scanDir(fullDir);
    // Wait for all imports to complete
    // 等待所有导入完成
    await Promise.all(importPromises);
}
/**
 * Auto router plugin - factory function
 * 自动路由插件 - 工厂函数
 * Used as application extension
 * 用作应用扩展
 *
 * Options description:
 * 选项说明：
 *   - dir: Controller directory path (default: './controllers')
 *   dir: 控制器目录路径（默认：'./controllers'）
 *   - prefix: API route prefix (default: '/api')
 *   prefix: API 路由前缀（默认：'/api'）
 *   - defaultRequiresAuth: Global default permission requirement (default: false)
 *   defaultRequiresAuth: 全局默认权限要求（默认：false）
 *     - false: All interfaces are public by default, unless explicitly set requiresAuth: true
 *     false: 所有接口默认为公开，除非显式设置 requiresAuth: true
 *     - true: All interfaces are protected by default, unless explicitly set requiresAuth: false
 *     true: 所有接口默认为受保护，除非显式设置 requiresAuth: false
 *   - strict: Strict mode (default: true)
 *   strict: 严格模式（默认：true）
 *     - true: Only allow pure function and createHandler export methods, prohibit other object exports
 *     true: 只允许纯函数和 createHandler 导出方式，禁止其他对象导出
 *     - false: Allow ordinary object { handler, meta } export method, but will show warning
 *     false: 允许普通对象 { handler, meta } 的导出方式，但会显示警告
 *
 * Usage:
 * 使用方式:
 *   // Strict mode (recommended) - only allow function exports
 *   严格模式（推荐）- 只允许函数导出
 *   app.extend(autoRouter({ dir: './controllers' }))
 *
 *   // Whitelist mode - protected by default, mark public interfaces
 *   白名单模式 - 默认受保护，标记公开接口
 *   app.extend(autoRouter({ dir: './controllers', defaultRequiresAuth: true }))
 *
 *   // Disable strict mode - allow all export methods (not recommended)
 *   禁用严格模式 - 允许所有导出方式（不推荐）
 *   app.extend(autoRouter({ dir: './controllers', strict: false }))
 */
export function autoRouter(options = {}) {
    const finalOptions = {
        dir: options.dir || './controllers',
        prefix: options.prefix || '/api',
        defaultRequiresAuth: options.defaultRequiresAuth ?? false,
        strict: options.strict ?? true,
    };
    return function (app) {
        // app.extend(fn) 会直接调用 fn(app)
        if (!app) {
            throw new Error('Auto-router plugin requires an application instance');
        }
        return loadRoutes(app, finalOptions);
    };
}
// 为向后兼容性，添加静态方法
Object.assign(autoRouter, {
    load: loadRoutes,
});
//# sourceMappingURL=auto-router.js.map