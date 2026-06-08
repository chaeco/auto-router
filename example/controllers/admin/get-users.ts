// GET /api/admin/users — admin: list all users
import { createHandler } from '../../../src'

export default createHandler(
  async (ctx: any) => {
    ctx.res.body = {
      users: [
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob', role: 'user' },
      ],
    }
  },
  { requiresAuth: true, roles: ['admin'] }
)
