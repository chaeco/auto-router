#!/usr/bin/env node
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';

/** Shared HTTP method constants. */
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

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
function normalizeParamNames(pattern) {
    return pattern
        .replace(/\[([^\]]+)\]/g, (_, name) => `[${name.toLowerCase()}]`)
        .replace(/:([^/]+)/g, (_, name) => `:${name.toLowerCase()}`);
}
/**
 * Validate a route-name fragment (everything after `method-` in a file name).
 * Throws on malformed `[param]` syntax.
 */
function validateRouteName(rawName) {
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
function validateDirectorySegment(segment) {
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
function parseRouteName(rawName) {
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
function parseDirectorySegment(segment) {
    validateDirectorySegment(segment);
    return segment.replace(/\[([A-Za-z0-9_]+)\]/g, ':$1');
}

/**
 * Shared file-name and directory-name validation for auto-router.
 */
/**
 * Validate a route file name.
 *
 * Accepts:
 * - Exact HTTP method (e.g. `get.ts`, `post.ts`)
 * - Method-prefixed with dash (e.g. `get-users.ts`, `post-[id].ts`)
 * Rejects:
 * - Wrong-cased method prefix (e.g. `GET-users.ts`, `Post-users.ts`)
 * - Malformed [param] syntax (e.g. `get-[].ts`, `get-[a][b].ts`)
 * - Unknown file names
 */
function validateFileName(fileName) {
    const nameWithoutExt = fileName.replace(/\.(ts|js)$/, '');
    if (HTTP_METHODS.includes(nameWithoutExt)) {
        return { valid: true, method: nameWithoutExt };
    }
    let matchedMethod;
    for (const method of HTTP_METHODS) {
        if (nameWithoutExt.startsWith(method + '-')) {
            matchedMethod = method;
            break;
        }
    }
    if (!matchedMethod) {
        const wrongCasedMethod = HTTP_METHODS.find(method => nameWithoutExt.toLowerCase().startsWith(method + '-'));
        if (wrongCasedMethod) {
            return {
                valid: false,
                error: `File name uses "${nameWithoutExt.slice(0, wrongCasedMethod.length)}" — HTTP method prefix must be lowercase, e.g. "${wrongCasedMethod}-..."`,
            };
        }
        return {
            valid: false,
            error: `File name must be a valid HTTP method or start with method- (${HTTP_METHODS.join('|')})`,
        };
    }
    const routeName = nameWithoutExt === matchedMethod ? '' : nameWithoutExt.substring(matchedMethod.length + 1);
    if (routeName) {
        try {
            validateRouteName(routeName);
        }
        catch (err) {
            return {
                valid: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    return { valid: true, method: matchedMethod };
}

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
function describe(entry) {
    if (typeof entry === 'string')
        return entry;
    if (entry instanceof RegExp)
        return entry.toString();
    return typeof entry.pattern === 'string' ? entry.pattern : String(entry.pattern);
}
/**
 * Compile user-provided ignore patterns into `CompiledIgnorePattern` instances.
 * Throws with a clear message (index + source) when a pattern is not a string /
 * RegExp, its `type` is invalid, or a string is not valid regex.
 */
function compileIgnorePatterns(patterns) {
    if (!patterns || patterns.length === 0)
        return [];
    return patterns.map((raw, index) => {
        let pattern;
        let target;
        if (typeof raw === 'string' || raw instanceof RegExp) {
            pattern = raw;
            target = 'both';
        }
        else {
            // Runtime JS can pass anything; give a clear error instead of a confusing
            // TypeError (e.g. `null`) or a silent no-op before the pattern check.
            if (!raw || typeof raw !== 'object') {
                throw new Error(`Invalid ignore entry at index ${index}: expected a string, RegExp, or { pattern, type } object`);
            }
            pattern = raw.pattern;
            target = raw.type ?? 'both';
        }
        if (typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
            throw new Error(`Invalid ignore entry at index ${index}: "pattern" must be a string or RegExp`);
        }
        if (target !== 'file' && target !== 'dir' && target !== 'both') {
            throw new Error(`Invalid ignore type at index ${index}: "${String(target)}" — expected "file", "dir" or "both"`);
        }
        if (typeof pattern === 'string') {
            try {
                pattern = new RegExp(pattern);
            }
            catch (err) {
                throw new Error(`Invalid ignore pattern at index ${index} ("${describe(raw)}"): ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        return { regex: pattern, target };
    });
}
/**
 * Returns true when `entryName` matches any ignore pattern that applies to the
 * entry kind (`isDirectory`). `lastIndex` is reset first so a `/g`- or
 * `/y`-flagged pattern supplied by the caller cannot carry state between calls
 * and produce alternating results.
 */
function isIgnored(entryName, isDirectory, patterns) {
    for (const { regex, target } of patterns) {
        const applies = target === 'both' || (target === 'file' && !isDirectory) || (target === 'dir' && isDirectory);
        if (!applies)
            continue;
        regex.lastIndex = 0;
        if (regex.test(entryName))
            return true;
    }
    return false;
}

function sanitizeIdentifier(path) {
    return ('handler_' +
        path
            .replace(/\.(ts|js)$/, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_|_$/g, ''));
}
function scanDirectory(dirPath, basePath, controllersRoot, ext, ignore, routes) {
    const files = readdirSync(dirPath);
    for (const file of files) {
        const filePath = join(dirPath, file);
        let fileStat;
        try {
            fileStat = statSync(filePath);
        }
        catch {
            continue;
        }
        // Skip ignored entries before validation — a matched folder is skipped
        // whole (no recursion), a matched file silently. The entry's kind decides
        // which patterns apply (file / dir / both).
        if (isIgnored(file, fileStat.isDirectory(), ignore))
            continue;
        if (fileStat.isDirectory()) {
            let dirSegment;
            try {
                dirSegment = parseDirectorySegment(file);
            }
            catch {
                continue;
            }
            try {
                scanDirectory(filePath, basePath ? `${basePath}/${dirSegment}` : `/${dirSegment}`, controllersRoot, ext, ignore, routes);
            }
            catch {
                // Skip unreadable subdirectories
            }
        }
        else if ((file.endsWith(`.${ext}`) && !file.endsWith('.d.ts')) || (ext === 'js' && file.endsWith('.js'))) {
            const validation = validateFileName(file);
            if (!validation.valid)
                continue;
            const method = validation.method;
            const nameWithoutExt = file.replace(/\.(ts|js)$/, '');
            let routeName = '';
            if (nameWithoutExt !== method) {
                routeName = nameWithoutExt.substring(method.length + 1);
            }
            routeName = parseRouteName(routeName);
            let fullPath;
            if (routeName) {
                fullPath = basePath ? `${basePath}/${routeName}` : `/${routeName}`;
            }
            else {
                fullPath = basePath;
            }
            fullPath = fullPath.replace(/\/+/g, '/');
            const relativeFromRoot = relative(controllersRoot, filePath);
            const importId = sanitizeIdentifier(relativeFromRoot);
            routes.push({
                method: method.toUpperCase(),
                pattern: fullPath,
                filePath,
                importPath: relativeFromRoot.replace(/\.(ts|js)$/, ''),
                importId,
            });
        }
    }
}
function generateManifest(options) {
    const { controllersDir, outputFile, prefix, ext } = options;
    const ignore = compileIgnorePatterns(options.ignore);
    const routes = [];
    const fullDir = resolve(controllersDir);
    try {
        scanDirectory(fullDir, '', fullDir, ext, ignore, routes);
    }
    catch (err) {
        throw new Error(`Failed to scan directory: ${err instanceof Error ? err.message : String(err)}`);
    }
    const normalizedPrefix = prefix.length > 1 && prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    for (const route of routes) {
        route.pattern = normalizedPrefix ? `${normalizedPrefix}${route.pattern}`.replace(/\/+/g, '/') : route.pattern;
    }
    // Sort routes: specific paths before wildcards, then alphabetically
    // This prevents '/api/:id' from hijacking '/api/users'
    routes.sort((a, b) => {
        const aHasParam = a.pattern.includes(':');
        const bHasParam = b.pattern.includes(':');
        if (aHasParam && !bHasParam)
            return 1;
        if (!aHasParam && bHasParam)
            return -1;
        return a.pattern.localeCompare(b.pattern) || a.method.localeCompare(b.method);
    });
    // Detect duplicates — param-name casing is folded for the key
    const seen = new Set();
    const uniqueRoutes = [];
    for (const route of routes) {
        const key = `${route.method} ${normalizeParamNames(route.pattern)}`;
        if (seen.has(key)) {
            console.warn(`⚠️  Duplicate route skipped: ${key}`);
            continue;
        }
        seen.add(key);
        uniqueRoutes.push(route);
    }
    const outputDir = dirname(resolve(outputFile));
    const imports = [];
    for (const route of uniqueRoutes) {
        const absoluteController = resolve(controllersDir, route.importPath);
        const relativeImport = relative(outputDir, absoluteController).replace(/\\/g, '/');
        // Prefix with './' only when the path is not already relative (../…). This
        // keeps imports valid when the manifest lives in a sibling/parent directory.
        const importTarget = relativeImport.startsWith('.') ? relativeImport : `./${relativeImport}`;
        const importLine = `import ${route.importId} from '${importTarget}'`;
        imports.push(importLine);
    }
    const routeEntries = uniqueRoutes
        .map(r => `  { pattern: '${r.pattern}', method: '${r.method}', handler: ${r.importId} },`)
        .join('\n');
    const extFlag = ext !== 'ts' ? ` --ext ${ext}` : '';
    // Only "both"-targeted string patterns round-trip through `--ignore` — a bare
    // string is shorthand for both, while RegExp or file/dir-scoped entries carry
    // info the flag cannot express, so they are omitted from the regenerate hint.
    const ignoreFlags = (options.ignore ?? [])
        .map(entry => {
        if (typeof entry === 'string')
            return ` --ignore '${entry}'`;
        if (entry instanceof RegExp)
            return '';
        if (typeof entry.pattern !== 'string' || (entry.type ?? 'both') !== 'both')
            return '';
        return ` --ignore '${entry.pattern}'`;
    })
        .join('');
    const regenerateCmd = `npx auto-router-build-manifest ${controllersDir} ${outputFile} --prefix ${prefix}${extFlag}${ignoreFlags}`;
    return `// AUTO-GENERATED by @chaeco/auto-router build-worker-manifest
// Do not edit manually.
// Regenerate: ${regenerateCmd}

import type { WorkerManifestRoute } from '@chaeco/auto-router/worker-manifest'
${imports.join('\n')}

export const routes: WorkerManifestRoute[] = [
${routeEntries}
]
`;
}
function parseArgs(argv) {
    const positional = [];
    let prefix = '/api';
    let ext = 'ts';
    const ignore = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--prefix') {
            prefix = argv[++i] || '/api';
        }
        else if (arg === '--ext') {
            ext = argv[++i] || 'ts';
        }
        else if (arg === '--ignore') {
            const pattern = argv[++i];
            if (pattern === undefined) {
                console.error('Error: --ignore requires a regex pattern');
                return null;
            }
            ignore.push(pattern);
        }
        else if (!arg.startsWith('--')) {
            positional.push(arg);
        }
    }
    if (positional.length < 2) {
        console.error('Usage: auto-router-build-manifest <controllersDir> <outputFile> [--prefix /api] [--ext ts] [--ignore <regex>]...');
        return null;
    }
    return {
        controllersDir: positional[0],
        outputFile: positional[1],
        prefix,
        ext,
        ignore,
    };
}
// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = parseArgs(process.argv.slice(2));
    if (!args)
        process.exit(1);
    try {
        const manifest = generateManifest(args);
        const outputPath = resolve(args.outputFile);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, manifest, 'utf-8');
        console.log(`✅ Generated: ${outputPath}`);
    }
    catch (err) {
        console.error(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}

export { generateManifest };
//# sourceMappingURL=build-worker-manifest.js.map
