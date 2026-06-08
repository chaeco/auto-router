// GET /api/admin/dashboard — admin route
import { createHandler } from '../../../src'

export default createHandler(
  async (ctx: any) => {
    ctx.res.body = {
      stats: { totalUsers: 1024, activeUsers: 567 },
      system: { status: 'healthy', uptime: '7d 12h' },
    }
  },
  { requiresAuth: true, description: 'Admin dashboard' }
)
