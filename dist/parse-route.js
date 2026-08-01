/**
 * Route-name validation and conversion.
 *
 * Parameter names keep their original casing — `[userId]` registers as
 * `:userId` and `ctx.params.userId` reads the same way a hand-written
 * Express route would. Duplicate detection is case-insensitive on param
 * names via `normalizeParamNames`, so `:UserId` and `:userid` are treated
 * as the same route.
 */
// Route-name grammar: the route name is a `-`-joined sequence of static
// text segments and `[param]` tokens, alternating. Static text may contain
// hyphens (as literal `-` joins and inside static names like `user-info`)
// but never brackets; params are single non-empty `[param]` tokens.
const SEGMENT = '([^\\[\\]]+|\\[[^\\[\\]]+\\])';
const ROUTE_NAME_PATTERN = new RegExp(`^${SEGMENT}(-${SEGMENT})*$`);
// A directory segment is either pure static text or a single whole-segment
// `[param]` — a param must span the entire segment, never glue to static text.
const DIR_PARAM_PATTERN = /^\[[^\[\]\s]+\]$/;
// ASCII-only content for parameter names — `\w` in JS would otherwise let
// `[用户名]` slip through, so params must stay ASCII-safe in file names.
const ASCII_PARAM = /^[A-Za-z0-9_]+$/;
/** Extract every `[param]` token's content, or empty if the name has none. */
function paramTokens(name) {
    return (name.match(/\[([^\[\]]+)\]/g) ?? []).map((token) => token.slice(1, -1));
}
/**
 * Normalize a route pattern for duplicate detection — parameter names are
 * folded to lowercase so `:UserId` and `:userid` are treated as the same
 * route (they match the same URLs). The *registered* pattern keeps its
 * original casing; this is only used to build a comparison key.
 */
export function normalizeParamNames(pattern) {
    return pattern
        .replace(/\[([^\]]+)\]/g, (_, name) => `[${name.toLowerCase()}]`)
        .replace(/:([^/]+)/g, (_, name) => `:${name.toLowerCase()}`);
}
/**
 * Validate a route-name fragment (everything after `method-` in a file name).
 * Throws on malformed `[param]` syntax.
 */
export function validateRouteName(rawName) {
    if (rawName.includes('[]')) {
        throw new Error('Empty parameters not allowed [], use [id] instead of []');
    }
    // A leading or trailing dash means an empty path segment at the boundary —
    // almost always a typo (`users-` intended as `users/[id]`, or `-a` as `a`).
    if (rawName.startsWith('-') || rawName.endsWith('-')) {
        throw new Error(`Invalid route name "${rawName}": must not start or end with "-" — use [id] for a dynamic segment`);
    }
    if (!rawName.includes('[') && !rawName.includes(']')) {
        return;
    }
    if (!ROUTE_NAME_PATTERN.test(rawName)) {
        throw new Error(`Invalid parameter syntax in "${rawName}": params ([id]) and static text must alternate, joined by "-"`);
    }
    for (const name of paramTokens(rawName)) {
        if (!ASCII_PARAM.test(name)) {
            throw new Error(`Invalid parameter name "${name}" in "${rawName}": only ASCII letters, digits and underscore allowed`);
        }
    }
}
/**
 * Validate a directory segment (single path segment, at most one `[param]`).
 * Throws on malformed bracket syntax or empty brackets.
 */
export function validateDirectorySegment(segment) {
    if (!segment.includes('[') && !segment.includes(']')) {
        return;
    }
    if (DIR_PARAM_PATTERN.test(segment)) {
        const name = segment.slice(1, -1);
        if (!ASCII_PARAM.test(name)) {
            throw new Error(`Invalid parameter name "${name}" in directory "${segment}": only ASCII letters, digits and underscore allowed`);
        }
        return;
    }
    const paramContent = segment.slice(segment.indexOf('[') + 1, segment.indexOf(']'));
    if (paramContent.includes(' ') || paramContent === '') {
        throw new Error(`Invalid parameter syntax in directory "${segment}": a parameter must be a single [id] segment without spaces`);
    }
    throw new Error(`Invalid parameter syntax in directory "${segment}": a parameter must be a single [id] segment`);
}
/**
 * Convert a route name fragment (everything after `method-` in a file name)
 * to an Express-style path segment using three ordered regex passes.
 *
 * Pass order matters: step 2 must precede step 3 to avoid mis-converting
 * adjacent params like `[a]-[b]`.
 */
export function parseRouteName(rawName) {
    validateRouteName(rawName);
    return rawName
        .replace(/\[([A-Za-z0-9_]+)\]/g, ':$1')
        .replace(/-:/g, '/:')
        .replace(/:([A-Za-z0-9_]+)-/g, ':$1/');
}
/**
 * Convert a directory segment that may contain `[param]` brackets to
 * an Express-style `:param` segment. Only the bracket substitution applies —
 * no hyphen-to-slash logic since directory names are single segments.
 */
export function parseDirectorySegment(segment) {
    validateDirectorySegment(segment);
    return segment.replace(/\[([A-Za-z0-9_]+)\]/g, ':$1');
}
//# sourceMappingURL=parse-route.js.map