import { type AppLike } from './handler.js';
import { type CompiledIgnorePattern } from './ignore.js';
/** Internal options passed from autoRouter() after normalization. */
export interface LoadRoutesOptions {
    dir: string;
    prefix: string;
    defaultRequiresAuth: boolean;
    strict: boolean;
    logging: boolean;
    forcePublic?: string[];
    forceProtected?: string[];
    ignore: CompiledIgnorePattern[];
    onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
}
export declare function loadRoutes(app: AppLike, options: LoadRoutesOptions): Promise<void>;
//# sourceMappingURL=load-routes.d.ts.map