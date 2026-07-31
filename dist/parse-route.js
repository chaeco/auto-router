/**
 * Route-name validation and conversion.
 *
 * `validateRouteName` / `validateDirSegment` reject malformed `[param]`
 * syntax (empty brackets, unpaired brackets, params glued to static text
 * without a `-` separator, non-ASCII or hyphenated parameter names) so
 * callers can skip the offending file instead of silently registering a
 * broken route. `parseRouteName` / `parseDirSegment` run the conversion and
 * throw on invalid input.
 *
 * Parameter names keep their original casing — `[userId]` registers as
 * `:userId` and `ctx.params.userId` reads the same way a hand-written
 * Express route would. Duplicate detection is case-insensitive on param
 * names via `normalizeParamNames`, so `:UserId` and `:userid` are treated
 * as the same route.
 * 参数名保留原始大小写——`[userId]` 注册为 `:userId`，`ctx.params.userId`
 * 与手写 Express 路由的读法一致。去重通过 `normalizeParamNames` 对参数名
 * 大小写不敏感，使 `:UserId` 与 `:userid` 视为同一条路由。
 */
// Route-name grammar: the route name is a `-`-joined sequence of static
// text segments and `[param]` tokens, alternating. Static text may contain
// hyphens (as literal `-` joins and inside static names like `user-info`)
// but never brackets; params are single non-empty `[param]` tokens.
// 路由名文法：路由名是静态文本段与 `[param]` 记号用 `-` 连接而成的序列，
// 二者交替出现。静态文本可含连字符（作为字面 `-` 连接或静态名如 `user-info`），
// 但不可含方括号；参数必须是单个非空的 `[param]` 记号。
const SEGMENT = '([^\\[\\]]+|\\[[^\\[\\]]+\\])';
const ROUTE_NAME_PATTERN = new RegExp(`^${SEGMENT}(-${SEGMENT})*$`);
// A directory segment is either pure static text or a single whole-segment
// `[param]` — a param must span the entire segment, never glue to static text.
// 目录段要么是纯静态文本，要么是独占整个段的单个 `[param]`，不允许与静态文本粘连。
const DIR_PARAM_PATTERN = /^\[[^\[\]\s]+\]$/;
// ASCII-only content for parameter names — `\w` in JS would otherwise let
// `[用户名]` slip through, so params must stay ASCII-safe in file names.
// 参数名仅允许 ASCII：JS 的 `\w` 会匹配非 ASCII 字母，若不加限制 `[用户名]` 会漏网。
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
 * 将路由 pattern 归一化用于去重——参数名折叠为小写，使 `:UserId` 与 `:userid`
 * 视为同一条路由（二者匹配相同的 URL）。*注册的* pattern 保留原始大小写，
 * 此函数仅用于构造比较键。
 */
export function normalizeParamNames(pattern) {
    return pattern
        .replace(/\[([^\]]+)\]/g, (_, name) => `[${name.toLowerCase()}]`)
        .replace(/:([^/]+)/g, (_, name) => `:${name.toLowerCase()}`);
}
/**
 * Validate a route-name fragment (everything after `method-` in a file name).
 * Throws on malformed `[param]` syntax.
 * 校验路由名片段（文件名中 `method-` 之后的部分），遇到非法 `[param]` 语法时抛错。
 */
export function validateRouteName(rawName) {
    if (rawName.includes('[]')) {
        throw new Error('Empty parameters not allowed [], use [id] instead of []');
    }
    if (!rawName.includes('[') && !rawName.includes(']')) {
        return; // Pure static name — nothing to validate
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
 * 校验目录段（单个路径段，至多一个 `[param]`），非法括号语法或空括号时抛错。
 */
export function validateDirSegment(segment) {
    if (!segment.includes('[') && !segment.includes(']')) {
        return; // Pure static name — nothing to validate
    }
    if (!DIR_PARAM_PATTERN.test(segment)) {
        throw new Error(`Invalid parameter syntax in directory "${segment}": a parameter must be a single [id] segment`);
    }
    const name = segment.slice(1, -1);
    if (!ASCII_PARAM.test(name)) {
        throw new Error(`Invalid parameter name "${name}" in directory "${segment}": only ASCII letters, digits and underscore allowed`);
    }
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
        .replace(/\[([A-Za-z0-9_]+)\]/g, ':$1') // [param] → :param
        .replace(/-:/g, '/:') // -: → /: (dash before colon → slash)
        .replace(/:([A-Za-z0-9_]+)-/g, ':$1/'); // :param- → :param/ (colon segment before dash → slash after)
}
/**
 * Convert a directory segment that may contain `[param]` brackets to
 * an Express-style `:param` segment. Only the bracket substitution applies —
 * no hyphen-to-slash logic since directory names are single segments.
 */
export function parseDirSegment(segment) {
    validateDirSegment(segment);
    return segment.replace(/\[([A-Za-z0-9_]+)\]/g, ':$1');
}
//# sourceMappingURL=parse-route.js.map