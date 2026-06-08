// POST /api/login
export default async (ctx: any) => {
  const { username, password } = ctx.req?.body ?? {}

  if (username === 'admin' && password === '123456') {
    ctx.res.body = { success: true, token: 'mock-jwt-token' }
    return
  }

  ctx.res.status = 401
  ctx.res.body = { error: 'Invalid credentials' }
}
