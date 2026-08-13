import type { AppLike } from './handler.js';
import { type IgnorePattern } from './ignore.js';
/** Single auto-router configuration options. */
export interface AutoRouterOptions {
    dir?: string;
    prefix?: string | string[];
    defaultRequiresAuth?: boolean;
    strict?: boolean;
    logging?: boolean;
    forcePublic?: string[];
    forceProtected?: string[];
    ignore?: IgnorePattern[];
    onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
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
export declare function autoRouter(options?: AutoRouterOptions | AutoRouterOptions[]): (app: AppLike) => Promise<void>;
//# sourceMappingURL=auto-router.d.ts.map