import { loadRoutes } from './load-routes.js';
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
export function autoRouter(options = {}) {
    const optionsArray = Array.isArray(options) ? options : [options];
    const expandedOptionsArray = [];
    for (const config of optionsArray) {
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
//# sourceMappingURL=auto-router.js.map