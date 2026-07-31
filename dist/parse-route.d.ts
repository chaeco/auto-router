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
/**
 * Normalize parameter names in a pattern to lowercase, in place. Accepts
 * file-name `[param]` form, directory `[param]` segments, and Express-style
 * `:param` segments — the two sources a pattern can come from.
 * 将 pattern 中的参数名归一化为小写（原地修改）。同时接受文件名 `[param]` 形式、
 * 目录 `[param]` 段和 Express 风格的 `:param` 段——pattern 的两种来源。
 */
export declare function normalizeParamNames(pattern: string): string;
/**
 * Validate a route-name fragment (everything after `method-` in a file name).
 * Throws on malformed `[param]` syntax.
 * 校验路由名片段（文件名中 `method-` 之后的部分），遇到非法 `[param]` 语法时抛错。
 */
export declare function validateRouteName(rawName: string): void;
/**
 * Validate a directory segment (single path segment, at most one `[param]`).
 * Throws on malformed bracket syntax or empty brackets.
 * 校验目录段（单个路径段，至多一个 `[param]`），非法括号语法或空括号时抛错。
 */
export declare function validateDirSegment(segment: string): void;
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