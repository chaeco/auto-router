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
export const HTTP_METHODS_UPPER = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
export function matchesFilter(routePath, routeMethod, pattern, prefix) {
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
//# sourceMappingURL=matches-filter.js.map