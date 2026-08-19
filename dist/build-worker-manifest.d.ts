#!/usr/bin/env node
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
type IgnoreTarget = 'file' | 'dir' | 'both';
interface IgnorePatternEntry {
    /** Regex source string or RegExp instance, matched against the entry name. */
    pattern: string | RegExp;
    /** Which entry kinds this pattern applies to. Defaults to 'both'. */
    type?: IgnoreTarget;
}
type IgnorePattern = string | RegExp | IgnorePatternEntry;

interface GenerateManifestOptions {
    controllersDir: string;
    outputFile: string;
    prefix: string;
    ext: string;
    /** Regex patterns (string source or RegExp) matched against entry basenames to skip. */
    ignore?: IgnorePattern[];
}
declare function generateManifest(options: GenerateManifestOptions): string;

export { generateManifest };
