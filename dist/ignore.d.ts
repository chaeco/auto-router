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
export type IgnoreTarget = 'file' | 'dir' | 'both';
export interface IgnorePatternEntry {
    /** Regex source string or RegExp instance, matched against the entry name. */
    pattern: string | RegExp;
    /** Which entry kinds this pattern applies to. Defaults to 'both'. */
    type?: IgnoreTarget;
}
export type IgnorePattern = string | RegExp | IgnorePatternEntry;
/** A compiled ignore pattern — internal, produced by `compileIgnorePatterns`. */
export interface CompiledIgnorePattern {
    regex: RegExp;
    target: IgnoreTarget;
}
/**
 * Compile user-provided ignore patterns into `CompiledIgnorePattern` instances.
 * Throws with a clear message (index + source) when a pattern is not a string /
 * RegExp, its `type` is invalid, or a string is not valid regex.
 */
export declare function compileIgnorePatterns(patterns: IgnorePattern[] | undefined): CompiledIgnorePattern[];
/**
 * Returns true when `entryName` matches any ignore pattern that applies to the
 * entry kind (`isDirectory`). `lastIndex` is reset first so a `/g`- or
 * `/y`-flagged pattern supplied by the caller cannot carry state between calls
 * and produce alternating results.
 */
export declare function isIgnored(entryName: string, isDirectory: boolean, patterns: CompiledIgnorePattern[]): boolean;
//# sourceMappingURL=ignore.d.ts.map