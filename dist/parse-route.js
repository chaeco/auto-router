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
 * Parameter names are normalized to lowercase — `[UserId]` becomes `:userid` —
 * so route patterns, `ctx.params` keys and duplicate-detection keys stay
 * consistent regardless of how the file was named. Hand-written patterns in
 * `staticAutoRouter` / `createWorkerRouter` are normalized the same way.
 * 参数名会被归一化为小写——`[UserId]` 变成 `:userid`——保证路由 pattern、
 * `ctx.params` 键名与去重键不受文件名大小写影响。`staticAutoRouter` /
 * `createWorkerRouter` 中手写的 pattern 同样会被归一化。
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
 * Normalize parameter names in a pattern to lowercase, in place. Accepts
 * file-name `[param]` form, directory `[param]` segments, and Express-style
 * `:param` segments — the two sources a pattern can come from.
 * 将 pattern 中的参数名归一化为小写（原地修改）。同时接受文件名 `[param]` 形式、
 * 目录 `[param]` 段和 Express 风格的 `:param` 段——pattern 的两种来源。
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
        .replace(/\[([A-Za-z0-9_]+)\]/g, (_m, name) => `:${name.toLowerCase()}`) // [param] → :param
        .replace(/-:/g, '/:') // -: → /: (dash before colon → slash)
        .replace(/:([A-Za-z0-9_]+)-/g, (_m, name) => `:${name.toLowerCase()}/`); // :param- → :param/ (colon segment before dash → slash after)
}
/**
 * Convert a directory segment that may contain `[param]` brackets to
 * an Express-style `:param` segment. Only the bracket substitution applies —
 * no hyphen-to-slash logic since directory names are single segments.
 */
export function parseDirSegment(segment) {
    validateDirSegment(segment);
    return segment.replace(/\[([A-Za-z0-9_]+)\]/g, (_m, name) => `:${name.toLowerCase()}`);
}
//# sourceMappingURL=parse-route.js.map