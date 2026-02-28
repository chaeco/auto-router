import { createHandler } from 'auto-router'
import { HoaContext } from 'hoa'

export default createHandler(
  async (ctx: HoaContext) => {
    const { username, password } = (ctx.req as any).body || {}

    if (!username || !password) {
      ctx.res.status = 400
      ctx.res.body = { error: 'Username and password required' }
      return
    }

    // Mock authentication
    if (username === 'admin' && password === 'password') {
      ctx.res.body = {
        token: 'mock-jwt-token',
        user: { id: 1, username: 'admin' },
      }
    } else {
      ctx.res.status = 401
      ctx.res.body = { error: 'Invalid credentials' }
    }
  },
  { requiresAuth: false }
)
