export type LogFn = (level: 'info' | 'warn' | 'error', message: string) => void;
export interface AuthResolutionOptions {
    routePath: string;
    method: string;
    routeMeta?: {
        requiresAuth?: boolean;
    };
    defaultRequiresAuth: boolean;
    forcePublic?: string[];
    forceProtected?: string[];
    /** Optional prefix for candidate path generation (file-based routes only). */
    prefix?: string;
}
export interface AuthResolutionResult {
    requiresAuth: boolean;
    matchedPublicPattern?: string;
    matchedProtectedPattern?: string;
}
/**
 * Resolve the `requiresAuth` state for a single route.
 *
 * Priority: explicit meta > forceProtected > forcePublic > defaultRequiresAuth
 */
export declare function resolveAuth(options: AuthResolutionOptions): AuthResolutionResult;
/**
 * Track forcePublic/forceProtected pattern matches, conflicts, and overrides,
 * then emit structured warnings at the end of route registration.
 */
export declare class ForcePatternTracker {
    readonly matchedForcePublicPatterns: Set<string>;
    readonly matchedForceProtectedPatterns: Set<string>;
    readonly overriddenByMeta: Array<{
        route: string;
        pattern: string;
        type: 'forcePublic' | 'forceProtected';
    }>;
    readonly conflictRoutes: Array<{
        route: string;
        publicPattern: string;
        protectedPattern: string;
    }>;
    /** Record a forcePublic/forceProtected pattern match. */
    addMatch(publicPattern?: string, protectedPattern?: string): void;
    /** Record a conflict where both forcePublic and forceProtected matched the same route. */
    addConflict(route: string, publicPattern: string, protectedPattern: string): void;
    /** Record an override where explicit createHandler meta overrode a force pattern. */
    addOverride(route: string, pattern: string, type: 'forcePublic' | 'forceProtected'): void;
    /** Emit warnings for conflicts, overrides, and unmatched patterns. */
    logWarnings(log: LogFn, forcePublic?: string[], forceProtected?: string[]): void;
}
//# sourceMappingURL=auth-resolver.d.ts.map