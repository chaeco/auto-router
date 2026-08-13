#!/usr/bin/env node
import { type IgnorePattern } from './ignore.js';
interface GenerateManifestOptions {
    controllersDir: string;
    outputFile: string;
    prefix: string;
    ext: string;
    /** Regex patterns (string source or RegExp) matched against entry basenames to skip. */
    ignore?: IgnorePattern[];
}
export declare function generateManifest(options: GenerateManifestOptions): string;
export {};
//# sourceMappingURL=build-worker-manifest.d.ts.map