/** Internal options passed from autoRouter() after normalization. */
export interface LoadRoutesOptions {
    dir: string;
    prefix: string;
    defaultRequiresAuth: boolean;
    strict: boolean;
    logging: boolean;
    forcePublic?: string[];
    forceProtected?: string[];
    onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
}
export declare function loadRoutes(app: any, options: LoadRoutesOptions): Promise<void>;
//# sourceMappingURL=load-routes.d.ts.map