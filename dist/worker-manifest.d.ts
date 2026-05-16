export type WorkerRouteHandler<TEnv = unknown, TCtx = unknown> = (ctx: WorkerRouteContext<TEnv, TCtx>) => unknown | Promise<unknown>;
export interface WorkerManifestRoute<TEnv = unknown, TCtx = unknown> {
    pattern: string;
    method: string;
    requiresAuth?: boolean;
    handler: WorkerRouteHandler<TEnv, TCtx>;
}
export interface WorkerRouteContext<TEnv = unknown, TCtx = unknown> {
    req: Request;
    env: TEnv;
    ctx: TCtx;
    params: Record<string, string>;
    res: {
        status: number;
        headers: Headers;
        body: unknown;
    };
}
export interface WorkerRouterOptions<TEnv = unknown, TCtx = unknown> {
    routes: WorkerManifestRoute<TEnv, TCtx>[];
    notFound?: WorkerRouteHandler<TEnv, TCtx>;
    onError?: (err: unknown, req: Request) => Response | Promise<Response>;
}
export declare function createWorkerRouter<TEnv = unknown, TCtx = unknown>(options: WorkerRouterOptions<TEnv, TCtx>): {
    fetch: (req: Request, env: TEnv, ctx: TCtx) => Promise<unknown>;
};
//# sourceMappingURL=worker-manifest.d.ts.map