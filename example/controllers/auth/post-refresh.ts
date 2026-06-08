// POST /api/auth/refresh — public auth endpoint (forcePublic overrides defaultRequiresAuth)
export default async (ctx: any) => {
  ctx.res.body = { success: true, token: 'refreshed-jwt-token' }
}
