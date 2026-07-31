/**
 * Route-name validation and conversion.
 *
 * `validateRouteName` / `validateDirSegment` reject malformed `[param]`
 * syntax (empty brackets, unpaired brackets, params glued to static text
 * without a `-` separator, non-ASCII or hyphenated parameter names) so
 * callers can skip the offending file instead of silently registering a
 * broken route. `parseRouteName` / `parseDirSegment` run the conversion and
 * throw on invalid input.
 */

// Route-name grammar: static segments and [param] segments alternate, joined
// by `-`. Static text may contain hyphens but never brackets. Params must be
// a single non-empty `[param]` token.
// 路由名文法：静态段与 [param] 段用 `-` 交替连接。静态段可含连字符但不可含方括号；
// 参数必须是非空的单个 `[param]` 记号。
const ROUTE_NAME_PATTERN = /^([^\[\]]+|\[[^\[\]]+\])(-([^\[\]]+|\[[^\[\]]+\]))*$/

// A directory segment is either pure static text or a single whole-segment
// `[param]` — a param must span the entire segment, never glue to static text.
// 目录段要么是纯静态文本，要么是独占整个段的单个 `[param]`，不允许与静态文本粘连。
const DIR_PARAM_PATTERN = /^\[[^\[\]]+\]$/

// ASCII-only content for parameter names — `\w` in JS would otherwise let
// `[用户名]` slip through, so params must stay ASCII-safe in file names.
// 参数名仅允许 ASCII：JS 的 `\w` 会匹配非 ASCII 字母，若不加限制 `[用户名]` 会漏网。
const ASCII_PARAM = /^[A-Za-z0-9_]+$/

/** Extract every `[param]` token's content, or empty if the name has none. */
function paramTokens(name: string): string[] {
  return (name.match(/\[([^\[\]]+)\]/g) ?? []).map((token) => token.slice(1, -1))
}

/**
 * Validate a route-name fragment (everything after `method-` in a file name).
 * Throws on malformed `[param]` syntax.
 * 校验路由名片段（文件名中 `method-` 之后的部分），遇到非法 `[param]` 语法时抛错。
 */
export function validateRouteName(rawName: string): void {
  if (rawName.includes('[]')) {
    throw new Error('Empty parameters not allowed [], use [id] instead of []')
  }

  if (!rawName.includes('[') && !rawName.includes(']')) {
    return // Pure static name — nothing to validate
  }

  if (!ROUTE_NAME_PATTERN.test(rawName)) {
    throw new Error(
      `Invalid parameter syntax in "${rawName}": params ([id]) and static text must alternate, joined by "-"`
    )
  }

  for (const name of paramTokens(rawName)) {
    if (!ASCII_PARAM.test(name)) {
      throw new Error(
        `Invalid parameter name "${name}" in "${rawName}": only ASCII letters, digits and underscore allowed`
      )
    }
  }
}

/**
 * Validate a directory segment (single path segment, at most one `[param]`).
 * Throws on malformed bracket syntax or empty brackets.
 * 校验目录段（单个路径段，至多一个 `[param]`），非法括号语法或空括号时抛错。
 */
export function validateDirSegment(segment: string): void {
  if (segment.includes('[]')) {
    throw new Error('Empty parameters not allowed [], use [id] instead of []')
  }

  if (!segment.includes('[') && !segment.includes(']')) {
    return // Pure static name — nothing to validate
  }

  if (!DIR_PARAM_PATTERN.test(segment)) {
    throw new Error(
      `Invalid parameter syntax in directory "${segment}": a parameter must be a single [id] segment`
    )
  }

  const name = segment.slice(1, -1)
  if (!ASCII_PARAM.test(name)) {
    throw new Error(
      `Invalid parameter name "${name}" in directory "${segment}": only ASCII letters, digits and underscore allowed`
    )
  }
}

/**
 * Convert a route name fragment (everything after `method-` in a file name)
 * to an Express-style path segment using three ordered regex passes.
 *
 * Pass order matters: step 2 must precede step 3 to avoid mis-converting
 * adjacent params like `[a]-[b]`.
 */
export function parseRouteName(rawName: string): string {
  validateRouteName(rawName)
  return rawName
    .replace(/\[([A-Za-z0-9_]+)\]/g, ':$1')  // [param] → :param
    .replace(/-:/g, '/:')                     // -: → /: (dash before colon → slash)
    .replace(/:([A-Za-z0-9_]+)-/g, ':$1/')    // :param- → :param/ (colon segment before dash → slash after)
}

/**
 * Convert a directory segment that may contain `[param]` brackets to
 * an Express-style `:param` segment. Only the bracket substitution applies —
 * no hyphen-to-slash logic since directory names are single segments.
 */
export function parseDirSegment(segment: string): string {
  validateDirSegment(segment)
  return segment.replace(/\[([A-Za-z0-9_]+)\]/g, ':$1')
}
