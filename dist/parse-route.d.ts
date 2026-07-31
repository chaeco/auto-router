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
/**
 * Normalize a route pattern for duplicate detection — parameter names are
 * folded to lowercase so `:UserId` and `:userid` are treated as the same
 * route (they match the same URLs). The *registered* pattern keeps its
 * original casing; this is only used to build a comparison key.
 * 将路由 pattern 归一化用于去重——参数名折叠为小写，使 `:UserId` 与 `:userid`
 * 视为同一条路由（二者匹配相同的 URL）。*注册的* pattern 保留原始大小写，
 * 此函数仅用于构造比较键。
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