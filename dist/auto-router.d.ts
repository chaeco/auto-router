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
/** Single auto-router configuration options. */
export interface AutoRouterOptions {
    dir?: string;
    prefix?: string | string[];
    defaultRequiresAuth?: boolean;
    strict?: boolean;
    logging?: boolean;
    forcePublic?: string[];
    forceProtected?: string[];
    onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
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
export declare function autoRouter(options?: AutoRouterOptions | AutoRouterOptions[]): (app: any) => Promise<void>;
//# sourceMappingURL=auto-router.d.ts.map