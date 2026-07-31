import { type RouteMiddleware } from './handler.js';
type ExecutionContext = unknown;
export interface WorkerRouteContext<TEnv = unknown, TCtx = ExecutionContext> {
    req: Request;
    env: TEnv;
    ctx: TCtx;
    params: Record<string, string>;
    res: {
        status: number;
        headers: Record<string, string>;
        body: string | ArrayBuffer | ReadableStream | null;
    };
}
export interface WorkerManifestRoute<TEnv = unknown, TCtx = ExecutionContext> {
    /** Express-style path pattern, e.g. '/api/users/:id' */
    pattern: string;
    /** HTTP method, e.g. 'GET', 'POST' */
    method: string;
    /** Route handler function or createHandler result */
    handler: unknown;
    /** Route-level middleware chain, run before the handler */
    middlewares?: RouteMiddleware<WorkerRouteContext<TEnv, TCtx>>[];
}
export interface WorkerRouterOptions<TEnv = unknown, TCtx = ExecutionContext> {
    routes: WorkerManifestRoute<TEnv, TCtx>[];
    notFound?: (req: Request, env: TEnv, ctx: TCtx) => Response | Promise<Response>;
    onError?: (err: unknown, req: Request, env: TEnv, ctx: TCtx) => Response | Promise<Response>;
}
export declare function createWorkerRouter<TEnv = unknown, TCtx = ExecutionContext>(options: WorkerRouterOptions<TEnv, TCtx>): {
    fetch: (req: Request, env: TEnv, ctx: TCtx) => Promise<Response>;
};
export {};
//# sourceMappingURL=worker-manifest.d.ts.map