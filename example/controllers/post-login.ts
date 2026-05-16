export default async function (ctx) {
  const body = ctx.req?.body ?? {}
  const { username, password } = body

  if (!username || !password) {
    ctx.res.status = 400
    ctx.res.body = { error: 'Username and password required' }
    return
  }

  if (username === 'admin' && password === '123456') {
    ctx.res.body = { success: true, token: 'mock-jwt-token' }
    return
  }

  ctx.res.status = 401
  ctx.res.body = { error: 'Invalid credentials' }
}
