/**
 * Ignore-pattern helpers shared by the auto-router scanner and the
 * worker-manifest builder.
 *
 * Patterns are matched against each directory entry's basename — a file or
 * folder name. Each pattern can target files, folders, or both (`type`), so
 * `{ pattern: '^__', type: 'dir' }` skips `__`-prefixed folders at any depth
 * without touching `__`-prefixed files. A bare string / RegExp is shorthand
 * for `type: 'both'`.
 */

export type IgnoreTarget = 'file' | 'dir' | 'both'

export interface IgnorePatternEntry {
  /** Regex source string or RegExp instance, matched against the entry name. */
  pattern: string | RegExp
  /** Which entry kinds this pattern applies to. Defaults to 'both'. */
  type?: IgnoreTarget
}

export type IgnorePattern = string | RegExp | IgnorePatternEntry

/** A compiled ignore pattern — internal, produced by `compileIgnorePatterns`. */
export interface CompiledIgnorePattern {
  regex: RegExp
  target: IgnoreTarget
}

function describe(entry: IgnorePattern): string {
  if (typeof entry === 'string') return entry
  if (entry instanceof RegExp) return entry.toString()
  return typeof entry.pattern === 'string' ? entry.pattern : String(entry.pattern)
}

/**
 * Compile user-provided ignore patterns into `CompiledIgnorePattern` instances.
 * Throws with a clear message (index + source) when a pattern is not a string /
 * RegExp, its `type` is invalid, or a string is not valid regex.
 */
export function compileIgnorePatterns(patterns: IgnorePattern[] | undefined): CompiledIgnorePattern[] {
  if (!patterns || patterns.length === 0) return []
  return patterns.map((raw, index) => {
    let pattern: string | RegExp
    let target: IgnoreTarget
    if (typeof raw === 'string' || raw instanceof RegExp) {
      pattern = raw
      target = 'both'
    } else {
      // Runtime JS can pass anything; give a clear error instead of a confusing
      // TypeError (e.g. `null`) or a silent no-op before the pattern check.
      if (!raw || typeof raw !== 'object') {
        throw new Error(
          `Invalid ignore entry at index ${index}: expected a string, RegExp, or { pattern, type } object`
        )
      }
      pattern = raw.pattern
      target = raw.type ?? 'both'
    }

    if (typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
      throw new Error(`Invalid ignore entry at index ${index}: "pattern" must be a string or RegExp`)
    }
    if (target !== 'file' && target !== 'dir' && target !== 'both') {
      throw new Error(`Invalid ignore type at index ${index}: "${String(target)}" — expected "file", "dir" or "both"`)
    }
    if (typeof pattern === 'string') {
      try {
        pattern = new RegExp(pattern)
      } catch (err) {
        throw new Error(
          `Invalid ignore pattern at index ${index} ("${describe(raw)}"): ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return { regex: pattern, target }
  })
}

/**
 * Returns true when `entryName` matches any ignore pattern that applies to the
 * entry kind (`isDirectory`). `lastIndex` is reset first so a `/g`- or
 * `/y`-flagged pattern supplied by the caller cannot carry state between calls
 * and produce alternating results.
 */
export function isIgnored(entryName: string, isDirectory: boolean, patterns: CompiledIgnorePattern[]): boolean {
  for (const { regex, target } of patterns) {
    const applies =
      target === 'both' || (target === 'file' && !isDirectory) || (target === 'dir' && isDirectory)
    if (!applies) continue
    regex.lastIndex = 0
    if (regex.test(entryName)) return true
  }
  return false
}
