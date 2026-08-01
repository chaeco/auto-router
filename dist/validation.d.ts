export interface FileNameValidation {
    valid: boolean;
    method?: string;
    error?: string;
}
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
export declare function validateFileName(fileName: string): FileNameValidation;
/** Check whether a directory name is an HTTP method keyword (case-insensitive). */
export declare function isHttpMethodKeyword(name: string): boolean;
//# sourceMappingURL=validation.d.ts.map