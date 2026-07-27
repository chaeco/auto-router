/**
 * Convert a route name fragment (everything after `method-` in a file name)
 * to an Express-style path segment using three ordered regex passes.
 *
 * Pass order matters: step 2 must precede step 3 to avoid mis-converting
 * adjacent params like `[a]-[b]`.
 */
export declare function parseRouteName(rawName: string): string;
/**
 * Convert a directory segment that may contain `[param]` brackets to
 * an Express-style `:param` segment. Only the bracket substitution applies —
 * no hyphen-to-slash logic since directory names are single segments.
 */
export declare function parseDirSegment(segment: string): string;
//# sourceMappingURL=parse-route.d.ts.map