// GET /api/users/:userId/posts — multi-param: param + static
export default async (ctx: any) => {
  const { userId } = ctx.params
  ctx.res.body = {
    userId,
    posts: [
      { id: 1, title: 'Getting Started' },
      { id: 2, title: 'Advanced Topics' },
    ],
  }
}
