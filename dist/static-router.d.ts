/** Static route entry — callers statically import handlers and declare method/path. */
export interface StaticRoute {
    /** HTTP method, e.g. 'get', 'post', 'put', 'delete', 'patch'. */
    method: string;
    /** Full route path, e.g. '/api/v1/auth/login'. */
    path: string;
    /** Route handler function or createHandler return value. */
    handler: any;
}
/** staticAutoRouter configuration. */
export interface StaticAutoRouterOptions {
    /** Static route list. */
    routes: StaticRoute[];
    /** Global default auth requirement. */
    defaultRequiresAuth?: boolean;
    /** Routes forced public. */
    forcePublic?: string[];
    /** Routes forced protected. */
    forceProtected?: string[];
    /** Whether to print registration logs. */
    logging?: boolean;
    /** Custom log sink. */
    onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
}
/** Static router plugin for runtimes without filesystem access. */
export declare function staticAutoRouter(options: StaticAutoRouterOptions): (app: any) => Promise<void>;
//# sourceMappingURL=static-router.d.ts.map