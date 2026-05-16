// 在 Node 构建阶段扫描路由文件，生成 Worker 可用清单
// 用法：npx tsx src/build-worker-manifest.ts ./controllers ./dist/worker-routes.ts
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
function extractMethodAndPattern(file) {
    const base = file.replace(/\.(ts|js)$/, '');
    for (const m of METHODS) {
        if (base === m) {
            return { method: m, rest: '' };
        }
        if (base.startsWith(m + '-')) {
            return { method: m, rest: base.slice(m.length + 1) };
        }
    }
    return null;
}
function toPattern(prefix, rest) {
    const p = '/' + rest
        .replace(/\[(\w+)\]/g, ':$1')
        .replace(/-:/g, '/:')
        .replace(/:(\w+)-/g, ':$1/')
        .replace(/\/+/g, '/');
    return (prefix + (p === '/' ? '' : p)).replace(/\/+/g, '/');
}
function scan(dir, prefix) {
    const entries = [];
    for (const file of readdirSync(dir)) {
        const full = join(dir, file);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            entries.push(...scan(full, prefix + '/' + file));
            continue;
        }
        if (!file.endsWith('.ts') && !file.endsWith('.js'))
            continue;
        if (file.endsWith('.d.ts'))
            continue;
        const meta = extractMethodAndPattern(file);
        if (!meta)
            continue;
        entries.push({
            method: meta.method.toUpperCase(),
            pattern: toPattern(prefix, meta.rest),
            fileUrl: pathToFileURL(full).href,
        });
    }
    return entries;
}
function build(outFile, entries) {
    const imports = entries.map((e, i) => `import handler${i} from '${e.fileUrl}'`).join('\n');
    const list = entries.map((e, i) => `  { method: '${e.method}', pattern: '${e.pattern}', handler: handler${i} }`).join(',\n');
    const code = `// Auto-generated worker route manifest\n${imports}\n\nexport const routes = [\n${list}\n]\n`;
    writeFileSync(outFile, code);
    console.log(`Generated ${entries.length} worker routes -> ${outFile}`);
}
const inputDir = resolve(process.argv[2] || './controllers');
const outFile = resolve(process.argv[3] || './dist/worker-routes.ts');
build(outFile, scan(inputDir, ''));
//# sourceMappingURL=build-worker-manifest.js.map