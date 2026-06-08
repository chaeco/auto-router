/**
 * @chaeco/auto-router — Full-featured example
 *
 * Demonstrates:
 *  - Single params:         get-[id].ts
 *  - Multi params:          get-[userId]-posts.ts, get-[userId]-[postId].ts
 *  - Dynamic directories:   users/[userId]/posts/get.ts
 *  - Nested dirs + params:  users/[userId]/posts/get-[id].ts
 *  - Method-only files:     users/[userId]/posts/get.ts, users/[userId]/posts/post.ts
 *  - createHandler export:  admin/get-dashboard.ts
 *  - forcePublic override:  auth/post-refresh.ts (whiteList mode)
 *  - Multiple HTTP methods: get, post, put, delete
 */

import { autoRouter } from '../src'

/** Mock framework — replace with Hoa / Koa / Express / Fastify in real usage. */
function createMockApp() {
  const routes: Record<string, Record<string, (...args: any[]) => void>> = {}

  const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']

  const app: any = {
    $routes: undefined,
    $registeredRoutes: undefined,
  }

  for (const m of methods) {
    app[m] = (path: string, handler: (...args: any[]) => void) => {
      ;(routes[m] ??= {})[path] = handler
    }
  }

  return { app, routes }
}

async function main() {
  const { app, routes } = createMockApp()

  // -----------------------------------------------------------------------
  // WhiteList mode: everything protected by default.
  // forcePublic marks auth/login routes as exceptions.
  // forceProtected marks admin routes (redundant here but explicit).
  // -----------------------------------------------------------------------
  const router = autoRouter({
    dir: './example/controllers',
    prefix: '/api',
    defaultRequiresAuth: true,          // whiteList mode
    forcePublic: [
      '/api/auth/*',                    // all auth routes are public
    ],
    forceProtected: [
      '/api/admin/*',                   // all admin routes are protected
      'POST /api/users',                // only POST is protected
    ],
  })
  await router(app)

  // -----------------------------------------------------------------------
  // Print registered routes grouped by method
  // -----------------------------------------------------------------------
  console.log('\n📋 Registered Routes:\n')
  const methodOrder = ['GET', 'POST', 'PUT', 'DELETE']
  for (const method of methodOrder) {
    const entries = Object.keys(routes[method.toLowerCase()] ?? {}).sort()
    if (!entries.length) continue
    console.log(`  ${method}`)
    for (const path of entries) {
      const isProtected = app.$routes.protectedRoutes.some(
        (r: any) => r.method === method && r.path === path
      )
      console.log(`    ${path}${isProtected ? ' 🔒' : ''}`)
    }
  }

  console.log(`\n  Total:   ${app.$routes.all.length} routes`)
  console.log(`  Public:   ${app.$routes.publicRoutes.length}`)
  console.log(`  Protected: ${app.$routes.protectedRoutes.length}`)
  console.log()
}

main().catch(console.error)
