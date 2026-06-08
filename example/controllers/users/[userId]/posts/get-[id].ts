// GET /api/users/:userId/posts/:id — nested dirs + file param
export default async (ctx: any) => {
  const { userId, id } = ctx.params
  ctx.res.body = {
    userId,
    postId: id,
    title: `Post ${id} by User ${userId}`,
  }
}
