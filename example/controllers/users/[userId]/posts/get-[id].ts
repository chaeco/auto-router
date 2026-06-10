import { createHandler } from '../../../src'

/**
 * GET /api/users/:userId/posts/:id
 *
 * Route params are always strings — validate and coerce before use.
 * This is the recommended pattern; auto-router does not enforce param types.
 */
export default createHandler(
  async (ctx: any) => {
    const { userId, id } = ctx.params

    // 1. Check params exist
    if (!userId || !id) {
      ctx.res.status = 400
      ctx.res.body = { error: 'Missing required parameters' }
      return
    }

    // 2. Coerce and validate type
    const userIdNum = Number(userId)
    const postIdNum = Number(id)

    if (isNaN(userIdNum) || isNaN(postIdNum) || userIdNum <= 0 || postIdNum <= 0) {
      ctx.res.status = 400
      ctx.res.body = {
        error: 'Invalid parameter format',
        details: 'userId and id must be positive integers',
      }
      return
    }

    ctx.res.body = {
      userId: userIdNum,
      postId: postIdNum,
      title: `Post ${id} by User ${userId}`,
    }
  },
  {
    description: 'Get post by user and post ID (with param validation)',
    tags: ['Posts', 'CRUD'],
  }
)