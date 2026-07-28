#!/usr/bin/env node
import { readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve, relative, dirname } from 'path';
import { parseRouteName, parseDirSegment } from './parse-route.js';
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
function validateFileName(fileName) {
    const nameWithoutExt = fileName.replace(/\.(ts|js)$/, '');
    if (HTTP_METHODS.includes(nameWithoutExt)) {
        return { valid: true, method: nameWithoutExt };
    }
    for (const m of HTTP_METHODS) {
        if (nameWithoutExt.startsWith(m + '-')) {
            return { valid: true, method: m };
        }
    }
    return { valid: false };
}
function sanitizeIdentifier(path) {
    return ('handler_' +
        path
            .replace(/\.(ts|js)$/, '')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/_$/, ''));
}
function scanDir(dirPath, basePath, controllersRoot, ext, routes) {
    const files = readdirSync(dirPath);
    for (const file of files) {
        const filePath = join(dirPath, file);
        let stat;
        try {
            stat = statSync(filePath);
        }
        catch {
            continue;
        }
        if (stat.isDirectory()) {
            const dirSegment = parseDirSegment(file);
            try {
                scanDir(filePath, basePath ? `${basePath}/${dirSegment}` : `/${dirSegment}`, controllersRoot, ext, routes);
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
export function generateManifest(options) {
    const { controllersDir, outputFile, prefix, ext } = options;
    const routes = [];
    const fullDir = resolve(controllersDir);
    try {
        scanDir(fullDir, '', fullDir, ext, routes);
    }
    catch (err) {
        throw new Error(`Failed to scan directory: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Apply prefix and normalize
    const normalizedPrefix = prefix.length > 1 && prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    for (const route of routes) {
        route.pattern = normalizedPrefix ? `${normalizedPrefix}${route.pattern}`.replace(/\/+/g, '/') : route.pattern;
    }
    // Sort routes: specific paths before wildcards, then alphabetically
    // This prevents '/api/:id' from hijacking '/api/users'
    routes.sort((a, b) => {
        const aHasParam = a.pattern.includes(':');
        const bHasParam = b.pattern.includes(':');
        // If one has params and the other doesn't, non-param comes first
        if (aHasParam && !bHasParam)
            return 1;
        if (!aHasParam && bHasParam)
            return -1;
        // Otherwise sort alphabetically by pattern, then method
        return a.pattern.localeCompare(b.pattern) || a.method.localeCompare(b.method);
    });
    // Detect duplicates
    const seen = new Set();
    const uniqueRoutes = [];
    for (const route of routes) {
        const key = `${route.method} ${route.pattern}`;
        if (seen.has(key)) {
            console.warn(`⚠️  Duplicate route skipped: ${key}`);
            continue;
        }
        seen.add(key);
        uniqueRoutes.push(route);
    }
    // Calculate relative imports from outputFile directory
    const outputDir = dirname(resolve(outputFile));
    const imports = [];
    for (const route of uniqueRoutes) {
        const absoluteController = resolve(controllersDir, route.importPath);
        const relativeImport = relative(outputDir, absoluteController).replace(/\\/g, '/');
        const importLine = `import ${route.importId} from './${relativeImport}'`;
        imports.push(importLine);
    }
    const routeEntries = uniqueRoutes
        .map(r => `  { pattern: '${r.pattern}', method: '${r.method}', handler: ${r.importId} },`)
        .join('\n');
    const regenerateCmd = `npx auto-router-build-manifest ${controllersDir} ${outputFile} --prefix ${prefix}${ext !== 'ts' ? ` --ext ${ext}` : ''}`;
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
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--prefix') {
            prefix = argv[++i] || '/api';
        }
        else if (arg === '--ext') {
            ext = argv[++i] || 'ts';
        }
        else if (!arg.startsWith('--')) {
            positional.push(arg);
        }
    }
    if (positional.length < 2) {
        console.error('Usage: auto-router-build-manifest <controllersDir> <outputFile> [--prefix /api] [--ext ts]');
        return null;
    }
    return {
        controllersDir: positional[0],
        outputFile: positional[1],
        prefix,
        ext,
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
//# sourceMappingURL=build-worker-manifest.js.map