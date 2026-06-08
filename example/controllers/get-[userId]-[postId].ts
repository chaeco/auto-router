// GET /api/:userId/:postId — multi-param: two consecutive params
export default async (ctx: any) => {
  const { userId, postId } = ctx.params
  ctx.res.body = {
    userId,
    postId,
    title: `Post ${postId} by User ${userId}`,
  }
}
