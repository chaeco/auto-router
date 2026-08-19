/**
 * Route-level middleware type
 *
 * Follows the Koa-style `(ctx, next)` signature that Hoa uses for middleware,
 * so framework middleware like `@hoajs/zod`'s `zodValidator()` can be attached
 * to a single route via `createHandler`'s third argument.
 */
type RouteMiddleware<TCtx = any> = (ctx: TCtx, next: () => Promise<any> | any) => Promise<any> | any;

type ExecutionContext = unknown;
interface WorkerRouteContext<TEnv = unknown, TCtx = ExecutionContext> {
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
interface WorkerManifestRoute<TEnv = unknown, TCtx = ExecutionContext> {
    /** Express-style path pattern, e.g. '/api/users/:id' */
    pattern: string;
    /** HTTP method, e.g. 'GET', 'POST' */
    method: string;
    /** Route handler function or createHandler result */
    handler: unknown;
    /** Route-level middleware chain, run before the handler */
    middlewares?: RouteMiddleware<WorkerRouteContext<TEnv, TCtx>>[];
}
interface WorkerRouterOptions<TEnv = unknown, TCtx = ExecutionContext> {
    routes: WorkerManifestRoute<TEnv, TCtx>[];
    notFound?: (req: Request, env: TEnv, ctx: TCtx) => Response | Promise<Response>;
    onError?: (err: unknown, req: Request, env: TEnv, ctx: TCtx) => Response | Promise<Response>;
}
declare function createWorkerRouter<TEnv = unknown, TCtx = ExecutionContext>(options: WorkerRouterOptions<TEnv, TCtx>): {
    fetch: (req: Request, env: TEnv, ctx: TCtx) => Promise<Response>;
};

export { createWorkerRouter };
export type { WorkerManifestRoute, WorkerRouteContext, WorkerRouterOptions };
