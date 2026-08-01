/**
 * Shared auth resolution and force-pattern tracking for auto-router.
 */
import { matchesFilter } from './matches-filter.js';
/**
 * Resolve the `requiresAuth` state for a single route.
 *
 * Priority: explicit meta > forceProtected > forcePublic > defaultRequiresAuth
 */
export function resolveAuth(options) {
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
export class ForcePatternTracker {
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
//# sourceMappingURL=auth-resolver.js.map