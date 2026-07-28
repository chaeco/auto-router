import { isRouteConfig } from './handler.js'

// ExecutionContext type for Cloudflare Workers — users should install @cloudflare/workers-types
// If not available, falls back to unknown
type ExecutionContext = unknown

export interface WorkerRouteContext<TEnv = unknown, TCtx = ExecutionContext> {
  req: Request
  env: TEnv
  ctx: TCtx
  params: Record<string, string>
  res: {
    status: number
    headers: Record<string, string>
    body: string | ArrayBuffer | ReadableStream | null
  }
}

export interface WorkerManifestRoute<TEnv = unknown, TCtx = ExecutionContext> {
  /** Express-style path pattern, e.g. '/api/users/:id' */
  pattern: string
  /** HTTP method, e.g. 'GET', 'POST' */
  method: string
  /** Route handler function or createHandler result */
  handler: unknown
}

export interface WorkerRouterOptions<TEnv = unknown, TCtx = ExecutionContext> {
  routes: WorkerManifestRoute<TEnv, TCtx>[]
  notFound?: (req: Request, env: TEnv, ctx: TCtx) => Response | Promise<Response>
  onError?: (err: unknown, req: Request, env: TEnv, ctx: TCtx) => Response | Promise<Response>
}

type MatchResult = { params: Record<string, string> } | null

function matchRoute(pattern: string, pathname: string): MatchResult {
  const patternSegs = pattern.split('/').filter(Boolean)
  const pathSegs = pathname.split('/').filter(Boolean)

  if (patternSegs.length !== pathSegs.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternSegs.length; i++) {
    const ps = patternSegs[i]
    const vs = pathSegs[i]
    if (ps.startsWith(':')) {
      // decodeURIComponent can throw URIError on malformed sequences
      // Return null (no match) instead of crashing the entire request
      try {
        params[ps.slice(1)] = decodeURIComponent(vs)
      } catch {
        return null
      }
    } else if (ps !== vs) {
      return null
    }
  }
  return { params }
}

export function createWorkerRouter<TEnv = unknown, TCtx = ExecutionContext>(
  options: WorkerRouterOptions<TEnv, TCtx>
): { fetch: (req: Request, env: TEnv, ctx: TCtx) => Promise<Response> } {
  const { routes, notFound, onError } = options

  // Unwrap createHandler results once at construction time
  const resolved = routes.map(route => {
    let handler = route.handler
    if (isRouteConfig(handler)) {
      handler = handler.handler
    }
    return { pattern: route.pattern, method: route.method.toUpperCase(), handler }
  })

  return {
    async fetch(req: Request, env: TEnv, ctx: TCtx): Promise<Response> {
      const url = new URL(req.url)
      const pathname = url.pathname

      let matched: { handler: unknown; params: Record<string, string> } | null = null
      for (const route of resolved) {
        if (route.method !== req.method.toUpperCase()) continue
        const result = matchRoute(route.pattern, pathname)
        if (result) {
          matched = { handler: route.handler, params: result.params }
          break
        }
      }

      if (!matched) {
        if (notFound) return notFound(req, env, ctx)
        return new Response('Not Found', { status: 404 })
      }

      const routeCtx: WorkerRouteContext<TEnv, TCtx> = {
        req,
        env,
        ctx,
        params: matched.params,
        res: { status: 200, headers: {}, body: null },
      }

      let result: unknown
      try {
        // Runtime validation: handler must be a function
        // (generateManifest guarantees this for CLI-generated manifests,
        // but hand-written manifests or dynamic routes may violate this)
        if (typeof matched.handler !== 'function') {
          throw new TypeError(`Handler for ${req.method} ${pathname} is not a function (got ${typeof matched.handler})`)
        }
        result = await (matched.handler as (ctx: WorkerRouteContext<TEnv, TCtx>) => unknown)(routeCtx)

        // Response serialization precedence
        if (result instanceof Response) return result

        if (result !== undefined && result !== null) {
          // JSON.stringify can throw on circular references, BigInt, etc.
          // We catch it here to route through onError
          let jsonString: string
          try {
            jsonString = JSON.stringify(result)
          } catch (stringifyErr) {
            throw new TypeError(`Failed to serialize response as JSON: ${stringifyErr instanceof Error ? stringifyErr.message : String(stringifyErr)}`)
          }
          return new Response(jsonString, {
            status: routeCtx.res.status,
            headers: { 'Content-Type': 'application/json', ...routeCtx.res.headers },
          })
        }

        return new Response(routeCtx.res.body, {
          status: routeCtx.res.status,
          headers: routeCtx.res.headers,
        })
      } catch (err) {
        if (onError) return onError(err, req, env, ctx)
        return new Response('Internal Server Error', { status: 500 })
      }
    },
  }
}
