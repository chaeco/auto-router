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
export declare const HTTP_METHODS_UPPER: readonly ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
export declare function matchesFilter(routePath: string, routeMethod: string, pattern: string, prefix?: string): boolean;
//# sourceMappingURL=matches-filter.d.ts.map