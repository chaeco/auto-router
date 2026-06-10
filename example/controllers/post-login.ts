import { z } from 'zod'
import { createHandler } from '../src'

/**
 * POST /api/login
 *
 * 使用 zod 校验请求体
 */

const LoginSchema = z.object({
  username: z.string().min(1, 'username is required'),
  password: z.string().min(1, 'password is required'),
})

export default createHandler(
  async (ctx: any) => {
    const bodyResult = LoginSchema.safeParse(ctx.req?.body ?? {})
    if (!bodyResult.success) {
      ctx.res.status = 400
      ctx.res.body = {
        error: 'Validation failed',
        details: bodyResult.error.flatten().fieldErrors,
      }
      return
    }

    const { username, password } = bodyResult.data

    if (username === 'admin' && password === '123456') {
      ctx.res.body = { success: true, token: 'mock-jwt-token' }
      return
    }

    ctx.res.status = 401
    ctx.res.body = { error: 'Invalid credentials' }
  },
  {
    description: 'User login with zod body validation',
    tags: ['Auth'],
  }
)