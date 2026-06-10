import { createHandler } from '../../../src'

/**
 * POST /api/users/:userId/posts — create a post under a user
 *
 * Validates request body before processing.
 * auto-router does not provide body parsing — use your framework's middleware.
 */
export default createHandler(
  async (ctx: any) => {
    const { userId } = ctx.params
    const body = ctx.req?.body ?? {}

    // 1. Validate userId param
    if (!userId) {
      ctx.res.status = 400
      ctx.res.body = { error: 'Missing userId parameter' }
      return
    }

    // 2. Validate required body fields
    const errors: string[] = []
    if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
      errors.push('title is required and must be a non-empty string')
    }
    if (body.content !== undefined && typeof body.content !== 'string') {
      errors.push('content must be a string if provided')
    }

    if (errors.length > 0) {
      ctx.res.status = 400
      ctx.res.body = { error: 'Validation failed', details: errors }
      return
    }

    // 3. Additional validation: title length
    if (body.title.length > 200) {
      ctx.res.status = 400
      ctx.res.body = {
        error: 'Validation failed',
        details: ['title must be 200 characters or less'],
      }
      return
    }

    ctx.res.status = 201
    ctx.res.body = {
      userId,
      post: {
        id: Date.now(),
        title: body.title.trim(),
        content: body.content ?? '',
      },
    }
  },
  {
    description: 'Create a post under a user (with body validation)',
    tags: ['Posts', 'CRUD'],
  }
)